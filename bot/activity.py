"""The bot's activity log. The website reads it through bot/web.py."""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from bot.models import TelegramActivity

# kind values: AUTHORIZE, SIGN_OUT, BALANCE, INFO, TRANSFER, TRANSFER_FAILED, ALERT_BIG, ALERT_LOW


def log_activity(
    db: Session,
    family_id: int,
    kind: str,
    summary: str,
    *,
    identity=None,
    actor_name: str = "Bot",
    role: Optional[str] = None,
    member_id: Optional[int] = None,
    transaction_id: Optional[int] = None,
    dedupe_key: Optional[str] = None,
) -> None:
    if identity is not None:
        member_id, actor_name, role = identity.member_id, identity.name, identity.role
    db.add(
        TelegramActivity(
            family_id=family_id,  # NFR-03: the feed is always read per family
            member_id=member_id,
            actor_name=actor_name[:80],
            role=role,
            kind=kind,
            summary=summary[:255],
            transaction_id=transaction_id,
            dedupe_key=dedupe_key,
        )
    )
    db.commit()


def already_done(db: Session, dedupe_key: str) -> bool:
    return db.scalar(select(TelegramActivity.id).where(TelegramActivity.dedupe_key == dedupe_key)) is not None


def list_activity(db: Session, family_id: int, limit: int = 50) -> list[TelegramActivity]:
    return list(
        db.scalars(
            select(TelegramActivity)
            .where(TelegramActivity.family_id == family_id)
            .order_by(TelegramActivity.id.desc())
            .limit(limit)
        )
    )
