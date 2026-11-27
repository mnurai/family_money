"""AUTHORIZE: sign a Telegram person in as one family member with a one-time code.

There is no password in Telegram. The code is made for a member (by the Owner, or later by the
website for the logged-in user), works once and expires. Only its SHA-256 hash is stored.
"""
import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import FamilyMember, utcnow
from bot.config import LINK_CODE_MINUTES
from bot.linking import _aware, _hash
from bot.models import BotUserProfile, MemberLinkCode, TelegramUser

ROLE_LABEL = {"OWNER": "Owner", "ADULT": "Adult", "CHILD": "Child"}


@dataclass
class Identity:
    telegram_user_id: int
    member_id: int
    family_id: int
    user_id: int
    role: str
    name: str


def display_name(db: Session, member: FamilyMember) -> str:
    profile = db.get(BotUserProfile, member.user_id)
    return profile.name if profile else f"Member {member.member_id}"


def create_member_code(db: Session, member_id: int) -> str:
    member = db.get(FamilyMember, member_id)
    if member is None or member.removed_at is not None:
        raise ValueError("No active member with this id")
    code = secrets.token_hex(5).upper()
    db.add(MemberLinkCode(code_hash=_hash(code), member_id=member_id, expires_at=utcnow() + timedelta(minutes=LINK_CODE_MINUTES)))
    db.commit()
    return code


def _identity(db: Session, telegram_user_id: int, member: FamilyMember) -> Identity:
    return Identity(telegram_user_id, member.member_id, member.family_id, member.user_id, member.role, display_name(db, member))


def get_identity(db: Session, telegram_user_id: int) -> Optional[Identity]:
    """Who is this Telegram person? None if not signed in, or if the member was removed."""
    link = db.get(TelegramUser, telegram_user_id)
    if link is None:
        return None
    member = db.get(FamilyMember, link.member_id)
    if member is None or member.removed_at is not None:
        db.delete(link)
        db.commit()
        return None
    return _identity(db, telegram_user_id, member)


def authorize(db: Session, telegram_user_id: int, code: str) -> tuple[Optional[Identity], str]:
    existing = get_identity(db, telegram_user_id)
    if existing is not None:
        return None, f"You are already signed in as {existing.name}. Use /logout first."
    row = db.get(MemberLinkCode, _hash(code))
    if row is None or row.used_at is not None or _aware(row.expires_at) < utcnow():
        return None, "This code is not valid or has expired."
    member = db.get(FamilyMember, row.member_id)
    if member is None or member.removed_at is not None:
        return None, "This member is no longer in the family."
    row.used_at = utcnow()
    db.add(TelegramUser(telegram_user_id=telegram_user_id, member_id=member.member_id))
    db.commit()
    identity = _identity(db, telegram_user_id, member)
    return identity, f"✅ Signed in as {identity.name} ({ROLE_LABEL[identity.role]})."


def sign_out(db: Session, telegram_user_id: int) -> Optional[Identity]:
    identity = get_identity(db, telegram_user_id)
    if identity is not None:
        db.delete(db.get(TelegramUser, telegram_user_id))
        db.commit()
    return identity
