"""ORM model for the `child_spending_limits` table: the monthly spending limit a parent sets for a child.

One row per child. No row means no limit. The table is created by
db/migrations/V2__child_spending_limit.sql.
"""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, Money, utcnow


class ChildSpendingLimit(Base):
    __tablename__ = "child_spending_limits"

    member_id: Mapped[int] = mapped_column(ForeignKey("family_members.member_id", ondelete="CASCADE"), primary_key=True)
    monthly_limit: Mapped[Decimal] = mapped_column(Money, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    __table_args__ = (CheckConstraint("monthly_limit > 0", name="chk_child_limit_positive"),)
