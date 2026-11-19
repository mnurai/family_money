"""Tables used only by the bot.

NOTE: CLAUDE.md says the schema changes only through migrations. These three small tables
must be added to the Alembic migrations by Data & Database. For local runs the bot creates
them itself with create_tables(). No foreign keys, so they never block the main schema.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, utcnow


class TelegramLink(Base):
    """A Telegram chat that receives alerts for one family."""

    __tablename__ = "telegram_links"

    chat_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    family_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # Alerts are sent only for transactions with an id above this cursor.
    last_tx_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class TelegramLinkCode(Base):
    """One-time code that links a chat to a family. Only the SHA-256 hash is stored."""

    __tablename__ = "telegram_link_codes"

    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    family_id: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class LowBalanceAlert(Base):
    """Exists while an account is below the threshold, so we alert once, not every minute."""

    __tablename__ = "telegram_low_balance_alerts"

    account_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alerted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


BOT_TABLES = [TelegramLink.__table__, TelegramLinkCode.__table__, LowBalanceAlert.__table__]


def create_tables(engine) -> None:
    Base.metadata.create_all(engine, tables=BOT_TABLES)
