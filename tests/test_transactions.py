"""Tests for recording transactions (US-08, US-09, US-10; BR-01 - BR-10, NFR-09)."""
from contextlib import contextmanager
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.models import Account, AccountAccess, AuditLog, Base, Category, FamilyMember, Transaction
from app.services.transactions import record_transaction

FAMILY = 1
OTHER_FAMILY = 2
TODAY = date.today()

# ids
OWNER, CHILD = 1, 3  # member_id == user_id in these fixtures
KASPI, CASH, SAVINGS, CREDIT, ARCHIVED, OTHER_FAMILY_ACC = 1, 2, 3, 4, 5, 6
SALARY, FOOD, OTHER_FAMILY_CAT = 1, 2, 3


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add_all([
            FamilyMember(member_id=OWNER, family_id=FAMILY, user_id=OWNER, role="OWNER"),
            FamilyMember(member_id=CHILD, family_id=FAMILY, user_id=CHILD, role="CHILD"),
            FamilyMember(member_id=9, family_id=OTHER_FAMILY, user_id=9, role="OWNER"),
            # Worked example in docs/06-business-rules.md
            Account(account_id=KASPI, family_id=FAMILY, name="Kaspi card", type="BANK_CARD",
                    opening_balance=Decimal("200000"), current_balance=Decimal("200000")),
            Account(account_id=CASH, family_id=FAMILY, name="Cash", type="CASH",
                    opening_balance=Decimal("10000"), current_balance=Decimal("10000")),
            Account(account_id=SAVINGS, family_id=FAMILY, name="Savings", type="SAVINGS"),
            Account(account_id=CREDIT, family_id=FAMILY, name="Credit card", type="CREDIT_CARD",
                    credit_limit=Decimal("50000")),
            Account(account_id=ARCHIVED, family_id=FAMILY, name="Old card", type="BANK_CARD",
                    is_archived=True),
            Account(account_id=OTHER_FAMILY_ACC, family_id=OTHER_FAMILY, name="Cash", type="CASH",
                    current_balance=Decimal("1000")),
            Category(category_id=SALARY, family_id=None, name="Salary", type="INCOME"),
            Category(category_id=FOOD, family_id=None, name="Food", type="EXPENSE"),
            Category(category_id=OTHER_FAMILY_CAT, family_id=OTHER_FAMILY, name="Hobby", type="EXPENSE"),
            AccountAccess(account_id=CASH, member_id=CHILD),
        ])
        session.commit()
        yield session


def record(db, tx_type, amount, src=None, dst=None, cat=None, tx_date=TODAY, role="OWNER", member=OWNER):
    return record_transaction(
        db, family_id=FAMILY, user_id=member, member_id=member, user_role=role, tx_type=tx_type,
        amount=Decimal(str(amount)), source_account_id=src, destination_account_id=dst,
        category_id=cat, tx_date=tx_date,
    )


def balance(db, account_id):
    return db.get(Account, account_id).current_balance


@contextmanager
def expect_error(code, detail=None):
    with pytest.raises(HTTPException) as info:
        yield info
    assert info.value.status_code == code
    if detail is not None:
        assert info.value.detail == detail


def tx_count(db):
    return db.scalar(select(func.count()).select_from(Transaction))


# --- worked example -------------------------------------------------------

def test_worked_example_balances(db):
    record(db, "INCOME", 350000, dst=KASPI, cat=SALARY)
    record(db, "TRANSFER", 20000, src=KASPI, dst=CASH)
    record(db, "EXPENSE", 45000, src=KASPI, cat=FOOD)
    record(db, "EXPENSE", 5000, src=CASH, cat=FOOD)
    record(db, "TRANSFER", 100000, src=KASPI, dst=SAVINGS)
    assert (balance(db, KASPI), balance(db, CASH), balance(db, SAVINGS)) == (385000, 25000, 100000)

    with expect_error(400, "Not enough money on Cash (balance 25 000 ₸)"):
        record(db, "EXPENSE", 30000, src=CASH, cat=FOOD)
    assert balance(db, CASH) == 25000
    assert balance(db, KASPI) + balance(db, CASH) + balance(db, SAVINGS) == 510000


# --- type, amount, date ---------------------------------------------------

def test_br01_unknown_type_rejected(db):
    with expect_error(400):
        record(db, "REFUND", 100, dst=KASPI, cat=SALARY)


@pytest.mark.parametrize("amount", ["0", "-5", "10.123"])
def test_br02_amount_must_be_positive_with_two_decimals(db, amount):
    with expect_error(400):
        record(db, "INCOME", amount, dst=KASPI, cat=SALARY)
    assert tx_count(db) == 0


def test_br09_future_date_rejected(db):
    with expect_error(400, "Date cannot be later than today. "
                           "Use a recurring transaction to plan future payments."):
        record(db, "EXPENSE", 100, src=KASPI, cat=FOOD, tx_date=TODAY + timedelta(days=1))


# --- account fields per type ----------------------------------------------

def test_br03_income_needs_income_category(db):
    with expect_error(400):
        record(db, "INCOME", 100, dst=KASPI, cat=FOOD)


def test_br04_expense_needs_expense_category(db):
    with expect_error(400):
        record(db, "EXPENSE", 100, src=KASPI, cat=SALARY)


def test_br04_expense_cannot_have_destination(db):
    with expect_error(400):
        record(db, "EXPENSE", 100, src=KASPI, dst=CASH, cat=FOOD)


def test_br05_transfer_requires_two_different_accounts(db):
    with expect_error(400, "Choose two different accounts"):
        record(db, "TRANSFER", 100, src=KASPI, dst=KASPI)


def test_br05_transfer_cannot_have_category(db):
    with expect_error(400):
        record(db, "TRANSFER", 100, src=KASPI, dst=CASH, cat=FOOD)


def test_br05_transfer_not_counted_as_income_or_expense(db):
    tx = record(db, "TRANSFER", 1000, src=KASPI, dst=CASH)
    assert tx.category_id is None
    assert balance(db, KASPI) + balance(db, CASH) == 210000


# --- family and archive ---------------------------------------------------

def test_br06_account_of_other_family_not_found(db):
    with expect_error(404):
        record(db, "EXPENSE", 100, src=OTHER_FAMILY_ACC, cat=FOOD)
    assert balance(db, OTHER_FAMILY_ACC) == 1000


def test_br06_category_of_other_family_not_found(db):
    with expect_error(404):
        record(db, "EXPENSE", 100, src=KASPI, cat=OTHER_FAMILY_CAT)


def test_br06_archived_account_rejected(db):
    with expect_error(400):
        record(db, "INCOME", 100, dst=ARCHIVED, cat=SALARY)


# --- balance limits -------------------------------------------------------

def test_br08_cash_cannot_go_negative(db):
    with expect_error(400, "Not enough money on Cash (balance 10 000 ₸)"):
        record(db, "TRANSFER", 10000.01, src=CASH, dst=KASPI)


def test_br08_credit_card_down_to_minus_limit(db):
    record(db, "EXPENSE", 50000, src=CREDIT, cat=FOOD)
    assert balance(db, CREDIT) == -50000
    with expect_error(400):
        record(db, "EXPENSE", 1, src=CREDIT, cat=FOOD)


# --- child --------------------------------------------------------------

def test_br10_child_cannot_transfer(db):
    with expect_error(403):
        record(db, "TRANSFER", 100, src=CASH, dst=KASPI, role="CHILD", member=CHILD)


def test_br10_child_only_shared_accounts(db):
    with expect_error(403):
        record(db, "EXPENSE", 100, src=KASPI, cat=FOOD, role="CHILD", member=CHILD)
    tx = record(db, "EXPENSE", 100, src=CASH, cat=FOOD, role="CHILD", member=CHILD)
    assert tx.created_by == CHILD


# --- saving and audit -----------------------------------------------------

def test_nfr09_transaction_saved_with_audit_entry(db):
    tx = record(db, "INCOME", 350000, dst=KASPI, cat=SALARY)
    assert tx.transaction_id is not None and tx.amount == Decimal("350000.00")
    log = db.scalars(select(AuditLog)).one()
    assert (log.entity_type, log.entity_id, log.action) == ("TRANSACTION", tx.transaction_id, "CREATE")


def test_nfr09_nothing_saved_on_error(db):
    with expect_error(400):
        record(db, "TRANSFER", 999999, src=KASPI, dst=CASH)
    assert tx_count(db) == 0
    assert db.scalar(select(func.count()).select_from(AuditLog)) == 0
    assert (balance(db, KASPI), balance(db, CASH)) == (200000, 10000)
