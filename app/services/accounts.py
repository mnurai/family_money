"""Accounts & Balance Counters: US-06 (Account Setup) + Dashboard Counters."""
from decimal import Decimal
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Account, AuditLog, Transaction

ACCOUNT_TYPES = ("CASH", "BANK_CARD", "SAVINGS", "CREDIT_CARD")


def create_account(
    db: Session,
    family_id: int,
    user_id: int,
    user_role: str,
    name: str,
    acc_type: str,
    initial_balance: Decimal = Decimal("0.00"),
    credit_limit: Optional[Decimal] = None,
) -> Account:
    """US-06: Create a new financial account inside the family."""
    if user_role == "CHILD":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Children cannot create accounts")
    if acc_type not in ACCOUNT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid account type")
    if acc_type != "CREDIT_CARD" and initial_balance < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Initial balance cannot be negative")

    duplicate = db.scalars(
        select(Account).where(Account.family_id == family_id, Account.name == name, Account.is_archived.is_(False))
    ).one_or_none()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account with this name already exists")

    account = Account(
        family_id=family_id,
        name=name,
        type=acc_type,
        opening_balance=initial_balance,
        current_balance=initial_balance,
        credit_limit=credit_limit if acc_type == "CREDIT_CARD" else None,
        is_archived=False,
    )
    db.add(account)
    db.flush()

    db.add(
        AuditLog(
            family_id=family_id,
            actor_user_id=user_id,
            entity_type="ACCOUNT",
            entity_id=account.account_id,
            action="CREATE",
            new_value={
                "name": account.name,
                "type": account.type,
                "opening_balance": str(account.opening_balance),
                "current_balance": str(account.current_balance),
            },
        )
    )
    db.commit()
    db.refresh(account)
    return account


def get_accounts_and_counters(db: Session, family_id: int) -> dict:
    """Return all active family accounts and summary balance/transaction counters."""
    accounts = list(
        db.scalars(
            select(Account).where(Account.family_id == family_id, Account.is_archived.is_(False))
        ).all()
    )

    total_balance = sum((acc.current_balance for acc in accounts), Decimal("0.00"))

    total_income = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.family_id == family_id,
            Transaction.type == "INCOME",
            Transaction.is_deleted.is_(False),
        )
    )
    total_expense = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.family_id == family_id,
            Transaction.type == "EXPENSE",
            Transaction.is_deleted.is_(False),
        )
    )
    tx_count = db.scalar(
        select(func.count(Transaction.transaction_id)).where(
            Transaction.family_id == family_id,
            Transaction.is_deleted.is_(False),
        )
    )

    return {
        "accounts": [
            {
                "account_id": acc.account_id,
                "name": acc.name,
                "type": acc.type,
                "opening_balance": str(acc.opening_balance),
                "current_balance": str(acc.current_balance),
                "credit_limit": str(acc.credit_limit) if acc.credit_limit is not None else None,
            }
            for acc in accounts
        ],
        "counters": {
            "accounts_count": len(accounts),
            "transactions_count": int(tx_count or 0),
            "total_balance": str(total_balance),
            "total_income": str(total_income),
            "total_expense": str(total_expense),
            "net_cashflow": str(Decimal(str(total_income)) - Decimal(str(total_expense))),
        },
    }