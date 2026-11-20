"""API Router: Connects frontend HTTP requests to Auth, Accounts/Counters, and Transactions."""
from datetime import date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Transaction
from app.services.accounts import create_account, get_accounts_and_counters
from app.services.auth import get_current_user, login_user, register_owner
from app.services.transactions import record_transaction

router = APIRouter(prefix="/api/v1")


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    family_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AccountCreateRequest(BaseModel):
    name: str
    type: str
    initial_balance: Decimal = Decimal("0.00")
    credit_limit: Optional[Decimal] = None


class TransactionCreateRequest(BaseModel):
    type: str
    amount: Decimal
    source_account_id: Optional[int] = None
    destination_account_id: Optional[int] = None
    category_id: Optional[int] = None
    transaction_date: date
    description: Optional[str] = None


@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
def api_register(data: RegisterRequest, db: Session = Depends(get_db)):
    return register_owner(db, data.email, data.password, data.full_name, data.family_name)


@router.post("/auth/login")
def api_login(data: LoginRequest, db: Session = Depends(get_db)):
    return login_user(db, data.email, data.password)


@router.post("/accounts", status_code=status.HTTP_201_CREATED)
def api_create_account(
    data: AccountCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return create_account(
        db=db,
        family_id=current_user["family_id"],
        user_id=current_user["user_id"],
        user_role=current_user["user_role"],
        name=data.name,
        acc_type=data.type,
        initial_balance=data.initial_balance,
        credit_limit=data.credit_limit,
    )


@router.get("/accounts")
def api_list_accounts_and_counters(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return get_accounts_and_counters(db=db, family_id=current_user["family_id"])


@router.post("/transactions", status_code=status.HTTP_201_CREATED)
def api_create_transaction(
    data: TransactionCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return record_transaction(
        db=db,
        family_id=current_user["family_id"],
        user_id=current_user["user_id"],
        member_id=current_user["member_id"],
        user_role=current_user["user_role"],
        tx_type=data.type,
        amount=data.amount,
        source_account_id=data.source_account_id,
        destination_account_id=data.destination_account_id,
        category_id=data.category_id,
        tx_date=data.transaction_date,
        description=data.description,
    )


@router.get("/transactions")
def api_list_transactions(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return list(
        db.scalars(
            select(Transaction)
            .where(
                Transaction.family_id == current_user["family_id"],
                Transaction.is_deleted.is_(False),
            )
            .order_by(Transaction.transaction_date.desc())
        ).all()
    )