"""Recording transactions: US-08 (expense), US-09 (income), US-10 (transfer).

Implements UC-04 and UC-05. Business rules: BR-01 - BR-10, NFR-03, NFR-09.
"""
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, AccountAccess, AuditLog, Category, Transaction

TRANSACTION_TYPES = ("INCOME", "EXPENSE", "TRANSFER")  # BR-01
ROLES = ("OWNER", "ADULT", "CHILD")
NON_NEGATIVE_ACCOUNT_TYPES = ("CASH", "BANK_CARD", "SAVINGS")  # BR-08
MAX_AMOUNT = Decimal("999999999999.99")  # BR-02


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def format_money(value: Decimal) -> str:
    """Format as in the use cases: '25 000 ₸', or '25 000,50 ₸' with kopecks (NFR-20)."""
    value = value.quantize(Decimal("0.01"))
    sign = "−" if value < 0 else ""
    whole, cents = f"{abs(value):.2f}".split(".")
    whole = f"{int(whole):,}".replace(",", " ")
    return f"{sign}{whole} ₸" if cents == "00" else f"{sign}{whole},{cents} ₸"


def _validate_amount(amount) -> Decimal:
    """BR-02: positive, at most 2 decimals, not above the maximum."""
    try:
        amount = Decimal(str(amount))
    except (InvalidOperation, ValueError, TypeError):
        raise _bad_request("Amount must be greater than 0")
    if not amount.is_finite() or amount <= 0:
        raise _bad_request("Amount must be greater than 0")
    if amount.as_tuple().exponent < -2:
        raise _bad_request("Amount can have at most 2 decimal places")
    if amount > MAX_AMOUNT:
        raise _bad_request("Amount is too large")
    return amount


def get_account(db: Session, account_id: int, family_id: int) -> Account:
    """Load an account of this family, locked for update (BR-06, NFR-03, NFR-09).

    An account of another family is reported as not found, so its existence is not leaked.
    """
    account = db.scalars(
        select(Account)
        .where(Account.account_id == account_id, Account.family_id == family_id)
        .with_for_update()
    ).one_or_none()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if account.is_archived:
        raise _bad_request(f"Account {account.name} is archived")
    return account


def _get_category(db: Session, category_id: int, family_id: int, expected_type: str) -> Category:
    """BR-03, BR-04, BR-06: category of this family (or a system default), active, matching type."""
    category = db.scalars(
        select(Category).where(
            Category.category_id == category_id,
            (Category.family_id == family_id) | (Category.family_id.is_(None)),
        )
    ).one_or_none()
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    if category.is_archived:
        raise _bad_request(f"Category {category.name} is archived")
    if category.type != expected_type:
        raise _bad_request(f"Category must be of type {expected_type}")
    return category


def _check_child_access(db: Session, member_id: int, account: Account) -> None:
    """BR-10: a Child may use only accounts shared with them."""
    shared = db.get(AccountAccess, (account.account_id, member_id))
    if shared is None:
        raise _forbidden("You do not have access to this account")


def _check_can_withdraw(account: Account, amount: Decimal) -> None:
    """BR-08: Cash/Bank card/Savings not below 0, Credit card not below −credit limit."""
    if account.type in NON_NEGATIVE_ACCOUNT_TYPES:
        floor = Decimal("0")
    else:  # CREDIT_CARD
        floor = -(account.credit_limit or Decimal("0"))
    if account.current_balance - amount < floor:
        raise _bad_request(
            f"Not enough money on {account.name} (balance {format_money(account.current_balance)})"
        )


def record_transaction(
    db: Session,
    family_id: int,
    user_id: int,
    member_id: int,
    user_role: str,
    tx_type: str,
    amount: Decimal,
    source_account_id: Optional[int],
    destination_account_id: Optional[int],
    category_id: Optional[int],
    tx_date: date,
    description: Optional[str] = None,
) -> Transaction:
    """Validate and save one transaction, update the cached balances and write an audit entry.

    Everything is committed in one database transaction (NFR-09); on any error nothing is saved.
    `user_id` is the logged-in user (audit actor), `member_id` their FAMILY_MEMBER row (created_by).
    """
    try:
        if tx_type not in TRANSACTION_TYPES:  # BR-01
            raise _bad_request("Type must be INCOME, EXPENSE or TRANSFER")
        if user_role not in ROLES:
            raise _forbidden("Unknown role")
        is_child = user_role == "CHILD"

        amount = _validate_amount(amount)  # BR-02

        if tx_date > date.today():  # BR-09
            raise _bad_request(
                "Date cannot be later than today. Use a recurring transaction to plan future payments."
            )

        if description is not None and len(description) > 255:
            raise _bad_request("Description can be at most 255 characters")

        source_acc = dest_acc = None

        # --- US-08: EXPENSE (BR-04) ---
        if tx_type == "EXPENSE":
            if not source_account_id or destination_account_id:
                raise _bad_request("Expense requires source account only")
            if not category_id:
                raise _bad_request("Category is required for expense")
            _get_category(db, category_id, family_id, "EXPENSE")
            source_acc = get_account(db, source_account_id, family_id)
            if is_child:
                _check_child_access(db, member_id, source_acc)
            _check_can_withdraw(source_acc, amount)

        # --- US-09: INCOME (BR-03) ---
        elif tx_type == "INCOME":
            if not destination_account_id or source_account_id:
                raise _bad_request("Income requires destination account only")
            if not category_id:
                raise _bad_request("Category is required for income")
            _get_category(db, category_id, family_id, "INCOME")
            dest_acc = get_account(db, destination_account_id, family_id)
            if is_child:
                _check_child_access(db, member_id, dest_acc)

        # --- US-10: TRANSFER (BR-05) ---
        else:
            if is_child:  # BR-10
                raise _forbidden("Children can record only income and expenses")
            if not source_account_id or not destination_account_id:
                raise _bad_request("Transfer requires source and destination accounts")
            if source_account_id == destination_account_id:
                raise _bad_request("Choose two different accounts")
            if category_id is not None:
                raise _bad_request("Transfers cannot have a category")
            # Lock in a fixed order to avoid deadlocks between two opposite transfers.
            first, second = sorted((source_account_id, destination_account_id))
            locked = {first: get_account(db, first, family_id), second: get_account(db, second, family_id)}
            source_acc, dest_acc = locked[source_account_id], locked[destination_account_id]
            _check_can_withdraw(source_acc, amount)

        tx = Transaction(
            family_id=family_id,
            type=tx_type,
            amount=amount,
            source_account_id=source_acc.account_id if source_acc else None,
            destination_account_id=dest_acc.account_id if dest_acc else None,
            category_id=category_id if tx_type != "TRANSFER" else None,
            transaction_date=tx_date,
            description=description,
            created_by=member_id,
        )
        db.add(tx)

        # Cached balances (BR-07), same DB transaction (NFR-09).
        if source_acc is not None:
            source_acc.current_balance -= amount
        if dest_acc is not None:
            dest_acc.current_balance += amount

        db.flush()  # assigns transaction_id for the audit entry

        db.add(
            AuditLog(
                family_id=family_id,
                actor_user_id=user_id,
                entity_type="TRANSACTION",
                entity_id=tx.transaction_id,
                action="CREATE",
                new_value={
                    "type": tx.type,
                    "amount": str(tx.amount),
                    "source_account_id": tx.source_account_id,
                    "destination_account_id": tx.destination_account_id,
                    "category_id": tx.category_id,
                    "transaction_date": tx.transaction_date.isoformat(),
                    "description": tx.description,
                    "created_by": tx.created_by,
                },
            )
        )

        # TODO(UC-08): for EXPENSE, check the budget and create 80 % / 100 % alerts (BR-15, BR-16).

        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(tx)
    return tx
