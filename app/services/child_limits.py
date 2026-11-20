"""Monthly spending limit for a child, set by a parent.

Rule (new, to be added to docs/06-business-rules.md): the expenses a child records in one
calendar month may not add up to more than the limit the Owner set for that child. Only the
child's own EXPENSE transactions count (not deleted ones, not income). A child with no limit
is not restricted. The Owner sets, changes and removes the limit; every change is written to
the audit log (FR-37).

check_child_spending_limit() is called by record_transaction() before an expense is saved.
"""
import calendar
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AuditLog, Transaction
from app.models_limits import ChildSpendingLimit
from app.services.child_access import _get_child
from app.services.permissions import can

MAX_LIMIT = Decimal("999999999999.99")


def _check_permission(actor_role: str) -> None:
    if not can(actor_role, "manage_child_limit"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to do this")


def _validate_limit(value) -> Decimal:
    """Positive, at most 2 decimals, not above the maximum (same rules as an amount, BR-02)."""
    try:
        limit = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Limit must be greater than 0")
    if not limit.is_finite() or limit <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Limit must be greater than 0")
    if limit.as_tuple().exponent < -2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Limit can have at most 2 decimal places")
    if limit > MAX_LIMIT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Limit is too large")
    return limit


def spent_in_month(db: Session, member_id: int, day: date) -> Decimal:
    """What this member has spent (EXPENSE, not deleted) in the calendar month of `day`."""
    first = day.replace(day=1)
    last = day.replace(day=calendar.monthrange(day.year, day.month)[1])
    total = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.created_by == member_id,
            Transaction.type == "EXPENSE",
            Transaction.is_deleted.is_(False),
            Transaction.transaction_date >= first,
            Transaction.transaction_date <= last,
        )
    )
    return Decimal(total).quantize(Decimal("0.01"))  # always 2 decimals, e.g. 0.00


def set_limit(db: Session, *, family_id: int, actor_user_id: int, actor_role: str,
              child_member_id: int, monthly_limit) -> dict:
    """Set or change the monthly limit of a child."""
    _check_permission(actor_role)
    _get_child(db, family_id, child_member_id)
    limit = _validate_limit(monthly_limit)

    row = db.get(ChildSpendingLimit, child_member_id)
    if row is None:
        db.add(ChildSpendingLimit(member_id=child_member_id, monthly_limit=limit))
        action, old_value = "CREATE", None
    else:
        action, old_value = "UPDATE", {"monthly_limit": str(row.monthly_limit)}
        row.monthly_limit = limit
    db.add(AuditLog(
        family_id=family_id, actor_user_id=actor_user_id, entity_type="CHILD_LIMIT",
        entity_id=child_member_id, action=action, old_value=old_value,
        new_value={"monthly_limit": str(limit)},
    ))
    db.commit()
    return get_limit_status(db, family_id=family_id, actor_role=actor_role, child_member_id=child_member_id)


def remove_limit(db: Session, *, family_id: int, actor_user_id: int, actor_role: str,
                 child_member_id: int) -> None:
    """Remove the limit: the child can spend without a monthly limit again."""
    _check_permission(actor_role)
    _get_child(db, family_id, child_member_id)
    row = db.get(ChildSpendingLimit, child_member_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No limit is set for this child")
    db.add(AuditLog(
        family_id=family_id, actor_user_id=actor_user_id, entity_type="CHILD_LIMIT",
        entity_id=child_member_id, action="DELETE", old_value={"monthly_limit": str(row.monthly_limit)},
    ))
    db.delete(row)
    db.commit()


def get_limit_status(db: Session, *, family_id: int, actor_role: str, child_member_id: int,
                     today: Optional[date] = None) -> dict:
    """The limit, what the child has spent this month and what is left. Money is returned as text."""
    _check_permission(actor_role)
    _get_child(db, family_id, child_member_id)
    today = today or date.today()
    spent = spent_in_month(db, child_member_id, today)
    row = db.get(ChildSpendingLimit, child_member_id)
    if row is None:
        return {"monthly_limit": None, "spent_this_month": str(spent), "remaining": None}
    return {
        "monthly_limit": str(row.monthly_limit),
        "spent_this_month": str(spent),
        "remaining": str(max(row.monthly_limit - spent, Decimal("0"))),
    }


def check_child_spending_limit(db: Session, member_id: int, amount: Decimal, tx_date: date) -> None:
    """Refuse an expense that would take the child over the monthly limit. No limit: nothing to check.

    The month is the month of the transaction date. Spending exactly up to the limit is allowed.
    """
    row = db.get(ChildSpendingLimit, member_id)
    if row is None:
        return
    spent = spent_in_month(db, member_id, tx_date)
    if spent + amount > row.monthly_limit:
        # imported here because transactions.py imports this module
        from app.services.transactions import format_money
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Monthly spending limit exceeded: limit {format_money(row.monthly_limit)}, "
            f"already spent {format_money(spent)}",
        )
