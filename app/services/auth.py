"""Registration, login, lock-out and session token (FR-01, FR-02, NFR-01, NFR-05, NFR-06, FR-39).

Rules come from docs/10-architecture-and-security.md section 4:
  - password: at least 8 characters, at least one letter and one digit; stored only as an Argon2id hash;
  - a wrong email and a wrong password give the SAME message;
  - 5 failed attempts lock the account for 15 minutes; while locked even the right password is refused;
  - a session is a signed token valid 30 minutes; the routes issue a fresh one on every request,
    so it ends after 30 minutes of inactivity;
  - a blocked user (is_active = false) is refused at login and on every later request.

The signing key comes from the environment variable SESSION_SECRET (never written in the code).
"""
import os
import re
from datetime import datetime, timedelta
from typing import Optional

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import utcnow
from app.models_auth import User

MSG_BAD_LOGIN = "Email or password is incorrect"
MSG_EMAIL_TAKEN = "An account with this email already exists"
MSG_PASSWORD_RULES = "Password must be at least 8 characters and contain at least one letter and one digit"
MSG_BAD_EMAIL = "Enter a valid email address"
MSG_PRIVACY = "You must accept the privacy notice"
MSG_LOCKED = "Too many failed attempts. The account is locked for 15 minutes"
MSG_BLOCKED = "Your account has been blocked"
MSG_NOT_LOGGED_IN = "You are not logged in"
MSG_SESSION_ENDED = "Your session has ended. Please log in again"

MAX_FAILED_LOGINS = 5            # NFR-06
LOCK_MINUTES = 15                # NFR-06
SESSION_MINUTES = 30             # NFR-05
MAX_PASSWORD_LENGTH = 128        # stops absurdly long input from being hashed
ALGORITHM = "HS256"

_hasher = PasswordHasher()  # Argon2id with the library's safe defaults
# Used when the email does not exist, so the answer takes about the same time as for a real user.
_DUMMY_HASH = _hasher.hash("not-a-real-password-1")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------- passwords

def validate_password(password: str) -> None:
    ok = (
        isinstance(password, str)
        and 8 <= len(password) <= MAX_PASSWORD_LENGTH
        and any(c.isalpha() for c in password)
        and any(c.isdigit() for c in password)
    )
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, MSG_PASSWORD_RULES)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def normalize_email(email: str) -> str:
    email = (email or "").strip().lower()
    if len(email) > 255 or not _EMAIL_RE.match(email):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, MSG_BAD_EMAIL)
    return email


def _aware(dt: datetime) -> datetime:
    # Only the SQLite test database returns naive datetimes (stored as UTC); PostgreSQL returns aware ones.
    return dt if dt.tzinfo else dt.replace(tzinfo=utcnow().tzinfo)


# ---------------------------------------------------------------- registration and login

def register(db: Session, *, full_name: str, email: str, password: str, accept_privacy: bool,
             now: Optional[datetime] = None) -> User:
    """US-01: create the account. The caller logs the new user in."""
    now = now or utcnow()
    full_name = (full_name or "").strip()
    if not full_name or len(full_name) > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter your full name (up to 100 characters)")
    email = normalize_email(email)
    validate_password(password)
    if accept_privacy is not True:  # NFR-07
        raise HTTPException(status.HTTP_400_BAD_REQUEST, MSG_PRIVACY)
    if db.scalar(select(User.user_id).where(User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, MSG_EMAIL_TAKEN)

    user = User(email=email, password_hash=hash_password(password), full_name=full_name,
                is_active=True, is_system_admin=False, failed_login_count=0, created_at=now,
                last_login_at=now)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two people registered the same email at the same moment
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, MSG_EMAIL_TAKEN)
    return user


def login(db: Session, *, email: str, password: str, now: Optional[datetime] = None) -> User:
    """US-02 / NFR-06: check the password, count failures, lock after 5."""
    now = now or utcnow()
    email = (email or "").strip().lower()
    user = db.scalar(select(User).where(User.email == email))

    if user is None:
        verify_password(password or "", _DUMMY_HASH)  # same work as for a real user
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, MSG_BAD_LOGIN)

    # The password is checked FIRST, so the lock message is shown only to someone who knows the
    # password. A stranger gets the same answer for a locked account and for an unknown email.
    password_ok = verify_password(password or "", user.password_hash)

    # While locked, even the correct password is refused (NFR-06).
    if user.locked_until is not None and _aware(user.locked_until) > now:
        if password_ok:
            raise HTTPException(status.HTTP_423_LOCKED, MSG_LOCKED)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, MSG_BAD_LOGIN)  # not counted: the lock is not extended

    if not password_ok:
        user.failed_login_count = (user.failed_login_count or 0) + 1
        if user.failed_login_count >= MAX_FAILED_LOGINS:
            user.locked_until = now + timedelta(minutes=LOCK_MINUTES)
            user.failed_login_count = 0  # after the lock ends the user gets 5 fresh attempts
        db.commit()  # the failure must be saved even though we now raise an error
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, MSG_BAD_LOGIN)

    # Checked only after the password is right, so a stranger cannot learn which emails are blocked.
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, MSG_BLOCKED)

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    db.commit()
    return user


# ---------------------------------------------------------------- session token (NFR-05)

def _secret() -> str:
    key = os.environ.get("SESSION_SECRET", "")
    if len(key) < 32:
        raise RuntimeError("Set the environment variable SESSION_SECRET to a random string of 32+ characters")
    return key


def issue_token(user_id: int, now: Optional[datetime] = None) -> str:
    now = now or utcnow()
    payload = {"sub": str(user_id), "iat": int(now.timestamp()),
               "exp": int((now + timedelta(minutes=SESSION_MINUTES)).timestamp())}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def read_token(token: str) -> int:
    """Return the user_id from a valid token, or raise 401."""
    try:
        data = jwt.decode(token, _secret(), algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
        return int(data["sub"])
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, MSG_SESSION_ENDED)
