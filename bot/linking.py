"""Linking a Telegram chat to a family with a one-time code (same pattern as doc 10 section 5)."""
import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import utcnow
from bot.alerts import current_max_tx_id
from bot.config import LINK_CODE_MINUTES
from bot.models import TelegramLink, TelegramLinkCode
from bot.settings import delete_settings


def _hash(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode()).hexdigest()


def create_link_code(db: Session, family_id: int) -> str:
    """Return a new code, shown once. Only its hash is stored."""
    code = secrets.token_hex(5).upper()
    db.add(
        TelegramLinkCode(
            code_hash=_hash(code),
            family_id=family_id,
            expires_at=utcnow() + timedelta(minutes=LINK_CODE_MINUTES),
        )
    )
    db.commit()
    return code


def _aware(dt: datetime) -> datetime:
    # SQLite returns naive datetimes; they are stored as UTC.
    return dt if dt.tzinfo else dt.replace(tzinfo=utcnow().tzinfo)


def link_chat(db: Session, chat_id: int, code: str) -> str:
    """Link the chat. Returns a message for the user."""
    if db.get(TelegramLink, chat_id) is not None:
        return "This chat is already linked. Send /stop first to unlink it."
    row = db.get(TelegramLinkCode, _hash(code))
    if row is None or row.used_at is not None or _aware(row.expires_at) < utcnow():
        return "This code is not valid or has expired."
    row.used_at = utcnow()
    # Start from "now": old transactions must not trigger alerts.
    db.add(TelegramLink(chat_id=chat_id, family_id=row.family_id, last_tx_id=current_max_tx_id(db, row.family_id)))
    db.commit()
    return "Linked ✅ You will get alerts about big transactions and low balances."


def unlink_chat(db: Session, chat_id: int) -> str:
    link = db.get(TelegramLink, chat_id)
    if link is None:
        return "This chat is not linked."
    db.delete(link)
    db.commit()
    delete_settings(db, chat_id)
    return "Unlinked. You will not get alerts any more."
