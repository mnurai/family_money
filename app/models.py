"""ORM models used by the transaction service.

Names, types and constraints follow docs/07-data-dictionary.md.
Only the entities needed for recording transactions are defined here;
the full schema is owned by Data & Database and changes only through migrations.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Money is always numeric(14,2), never float (NFR-08).
Money = Numeric(14, 2, asdecimal=True)
# jsonb on PostgreSQL (D-4), plain JSON elsewhere (e.g. SQLite in tests).
JsonValue = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class FamilyMember(Base):
    __tablename__ = "family_members"

    member_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    family_id: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)  # BR-17
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    removed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    __table_args__ = (CheckConstraint("role IN ('OWNER', 'ADULT', 'CHILD')", name="chk_member_role"),)


class Account(Base):
    __tablename__ = "accounts"

    account_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    family_id: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    opening_balance: Mapped[Decimal] = mapped_column(Money, nullable=False, default=Decimal("0"))
    # Cached balance (BR-07); updated in the same DB transaction as the movement (NFR-09).
    current_balance: Mapped[Decimal] = mapped_column(Money, nullable=False, default=Decimal("0"))
    credit_limit: Mapped[Optional[Decimal]] = mapped_column(Money)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("family_id", "name", name="uq_family_account_name"),
        CheckConstraint(
            "type IN ('CASH', 'BANK_CARD', 'SAVINGS', 'CREDIT_CARD')", name="chk_account_type"
        ),
        CheckConstraint("credit_limit IS NULL OR credit_limit >= 0", name="chk_credit_limit"),
    )


class AccountAccess(Base):
    """Accounts shared with a Child Member (FR-13, BR-10)."""

    __tablename__ = "account_access"

    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.account_id"), primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("family_members.member_id"), primary_key=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class Category(Base):
    __tablename__ = "categories"

    category_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    family_id: Mapped[Optional[int]] = mapped_column(Integer)  # NULL = system default (FR-14)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("categories.category_id"))
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (CheckConstraint("type IN ('INCOME', 'EXPENSE')", name="chk_category_type"),)


class Transaction(Base):
    # Plural: `transaction` is a reserved word.
    __tablename__ = "transactions"

    transaction_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    family_id: Mapped[int] = mapped_column(Integer, nullable=False)  # NFR-03
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    source_account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("accounts.account_id"))
    destination_account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("accounts.account_id"))
    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("categories.category_id"))
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))
    created_by: Mapped[int] = mapped_column(ForeignKey("family_members.member_id"), nullable=False)
    recurring_rule_id: Mapped[Optional[int]] = mapped_column(Integer)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    __table_args__ = (
        CheckConstraint("type IN ('INCOME', 'EXPENSE', 'TRANSFER')", name="chk_transaction_type"),  # BR-01
        CheckConstraint("amount > 0", name="chk_amount_positive"),  # BR-02
        CheckConstraint(  # BR-03 - BR-05
            "(type = 'INCOME' AND source_account_id IS NULL AND destination_account_id IS NOT NULL"
            " AND category_id IS NOT NULL) OR "
            "(type = 'EXPENSE' AND source_account_id IS NOT NULL AND destination_account_id IS NULL"
            " AND category_id IS NOT NULL) OR "
            "(type = 'TRANSFER' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL"
            " AND source_account_id <> destination_account_id AND category_id IS NULL)",
            name="chk_transaction_accounts",
        ),
    )


class AuditLog(Base):
    """Append-only change log (FR-37, BR-27)."""

    __tablename__ = "audit_log"

    # Integer variant so SQLite autoincrements in tests; bigint on PostgreSQL.
    log_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True
    )
    family_id: Mapped[Optional[int]] = mapped_column(Integer)
    actor_user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(10), nullable=False)
    old_value: Mapped[Optional[dict]] = mapped_column(JsonValue)
    new_value: Mapped[Optional[dict]] = mapped_column(JsonValue)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class Family(Base):
    __tablename__ = "families"

    family_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_by: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)