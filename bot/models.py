"""Tables used only by the bot.

NOTE: CLAUDE.md says the schema changes only through migrations. These eight small tables
must be added to the Alembic migrations by Data & Database. For local runs the bot creates
them itself with create_tables(). No foreign keys, so they never block the main schema.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String
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


class TelegramSettings(Base):
    """Per-chat settings changed from the control panel. No row = defaults from .env."""

    __tablename__ = "telegram_settings"

    chat_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    big_threshold: Mapped[Optional[int]] = mapped_column(BigInteger)  # whole tenge
    low_threshold: Mapped[Optional[int]] = mapped_column(BigInteger)
    paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class TelegramUser(Base):
    """A Telegram person who signed in (AUTHORIZE) as one family member."""

    __tablename__ = "telegram_users"

    telegram_user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    member_id: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class MemberLinkCode(Base):
    """One-time code that lets a Telegram person sign in as one member. Only the hash is stored."""

    __tablename__ = "telegram_member_codes"

    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    member_id: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class TelegramActivity(Base):
    """What the bot did (transfers, sign-ins, balance checks, alerts). The website shows this feed."""

    __tablename__ = "telegram_activity"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    family_id: Mapped[int] = mapped_column(Integer, nullable=False)
    member_id: Mapped[Optional[int]] = mapped_column(Integer)
    actor_name: Mapped[str] = mapped_column(String(80), nullable=False, default="Bot")
    role: Mapped[Optional[str]] = mapped_column(String(10))
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    summary: Mapped[str] = mapped_column(String(255), nullable=False)
    transaction_id: Mapped[Optional[int]] = mapped_column(Integer)
    # Stops one confirm button from being applied twice (double tap).
    dedupe_key: Mapped[Optional[str]] = mapped_column(String(80), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class BotUserProfile(Base):
    """Stand-in for the users table, which does not exist in the backend yet: user_id -> display name."""

    __tablename__ = "bot_user_profiles"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)


BOT_TABLES = [
    TelegramLink.__table__,
    TelegramLinkCode.__table__,
    LowBalanceAlert.__table__,
    TelegramSettings.__table__,
    TelegramUser.__table__,
    MemberLinkCode.__table__,
    TelegramActivity.__table__,
    BotUserProfile.__table__,
]


def create_tables(engine) -> None:
    Base.metadata.create_all(engine, tables=BOT_TABLES)
