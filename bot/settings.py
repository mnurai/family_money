"""Per-chat settings (thresholds, pause). Falls back to the values from .env."""
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session

from bot import config
from bot.models import TelegramSettings

MAX_THRESHOLD = 1_000_000_000


@dataclass
class ChatSettings:
    big: Decimal
    low: Decimal
    paused: bool


def get_settings(db: Session, chat_id: int) -> ChatSettings:
    row = db.get(TelegramSettings, chat_id)
    big = Decimal(row.big_threshold) if row and row.big_threshold is not None else config.BIG_TX_THRESHOLD
    low = Decimal(row.low_threshold) if row and row.low_threshold is not None else config.LOW_BALANCE_THRESHOLD
    return ChatSettings(big=big, low=low, paused=bool(row and row.paused))


def _row(db: Session, chat_id: int) -> TelegramSettings:
    row = db.get(TelegramSettings, chat_id)
    if row is None:
        row = TelegramSettings(chat_id=chat_id, paused=False)
        db.add(row)
    return row


def set_big(db: Session, chat_id: int, amount: int) -> None:
    _row(db, chat_id).big_threshold = amount
    db.commit()


def set_low(db: Session, chat_id: int, amount: int) -> None:
    _row(db, chat_id).low_threshold = amount
    db.commit()


def set_paused(db: Session, chat_id: int, paused: bool) -> None:
    _row(db, chat_id).paused = paused
    db.commit()


def delete_settings(db: Session, chat_id: int) -> None:
    row = db.get(TelegramSettings, chat_id)
    if row is not None:
        db.delete(row)
        db.commit()


def parse_amount(text: str) -> int | None:
    """"75000", "75 000", "75,000" -> 75000. None if not a positive whole number in range."""
    cleaned = text.replace(" ", "").replace(",", "").replace("\u00a0", "")
    if not cleaned.isdigit():
        return None
    value = int(cleaned)
    return value if 1 <= value <= MAX_THRESHOLD else None
