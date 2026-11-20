"""Authentication & Authorization: US-01 (Register), US-02 (Login)."""
import base64
import hashlib
import hmac
import json
import os
import secrets
from fastapi import Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Family, FamilyMember, User

SECRET_KEY = os.getenv("SECRET_KEY", "family-budget-secret-key-2026")


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return f"{salt}:{pwd_hash}"


def verify_password(password: str, stored_hash: str) -> bool:
    salt, pwd_hash = stored_hash.split(":")
    check_hash = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return hmac.compare_digest(pwd_hash, check_hash)


def create_access_token(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode()
    b64_payload = base64.urlsafe_b64encode(raw).decode()
    sig = hmac.new(SECRET_KEY.encode(), b64_payload.encode(), hashlib.sha256).hexdigest()
    return f"{b64_payload}.{sig}"


def decode_access_token(token: str) -> dict:
    try:
        b64_payload, sig = token.split(".")
        expected_sig = hmac.new(SECRET_KEY.encode(), b64_payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            raise ValueError("Invalid signature")
        return json.loads(base64.urlsafe_b64decode(b64_payload).decode())
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def register_owner(db: Session, email: str, password: str, full_name: str, family_name: str) -> dict:
    """US-01: Register a new user and create their Family workspace."""
    existing = db.scalars(select(User).where(User.email == email)).one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(email=email, password_hash=hash_password(password), full_name=full_name)
    db.add(user)
    db.flush()

    family = Family(name=family_name, created_by=user.user_id)
    db.add(family)
    db.flush()

    member = FamilyMember(family_id=family.family_id, user_id=user.user_id, role="OWNER")
    db.add(member)
    db.commit()

    token_data = {
        "user_id": user.user_id,
        "family_id": family.family_id,
        "member_id": member.member_id,
        "user_role": member.role,
    }
    return {"access_token": create_access_token(token_data), "token_type": "bearer", "user": token_data}


def login_user(db: Session, email: str, password: str) -> dict:
    """US-02: Authenticate existing user and return token."""
    user = db.scalars(select(User).where(User.email == email)).one_or_none()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    member = db.scalars(select(FamilyMember).where(FamilyMember.user_id == user.user_id)).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User does not belong to any family")

    token_data = {
        "user_id": user.user_id,
        "family_id": member.family_id,
        "member_id": member.member_id,
        "user_role": member.role,
    }
    return {"access_token": create_access_token(token_data), "token_type": "bearer", "user": token_data}


def get_current_user(authorization: str = Header(...)) -> dict:
    """Extract user context from 'Bearer <token>' header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    return decode_access_token(token)