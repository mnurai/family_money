"""Tests for the monthly spending limit of a child (FR-13 extension, BR-10, FR-37, NFR-03).

A parent (the Owner) sets a monthly limit; the child's expenses of one calendar month may not
add up to more. The authentication is replaced by a fake `get_current_principal`.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Account, AccountAccess, AuditLog, Base, Category, FamilyMember, Transaction
from app.models_limits import ChildSpendingLimit
from app.routes_children import router
from app.security import Principal, get_current_principal, get_db
from app.services.transactions import record_transaction

FAMILY, OTHER_FAMILY = 1, 2
OWNER, ADULT, CHILD, OTHER_CHILD = 1, 2, 3, 10
CASH = 2
FOOD, SALARY = 1, 2

PEOPLE = {
    "OWNER": Principal(OWNER, OWNER, FAMILY, "OWNER"),
    "ADULT": Principal(ADULT, ADULT, FAMILY, "ADULT"),
    "CHILD": Principal(CHILD, CHILD, FAMILY, "CHILD"),
    "ADMIN": Principal(20, None, None, "ADMIN"),
}

TODAY = date.today()
LAST_MONTH = TODAY.replace(day=1) - timedelta(days=1)


@pytest.fixture
def factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    make_session = sessionmaker(engine)
    with make_session() as db:
        db.add_all([
            FamilyMember(member_id=OWNER, family_id=FAMILY, user_id=OWNER, role="OWNER"),
            FamilyMember(member_id=ADULT, family_id=FAMILY, user_id=ADULT, role="ADULT"),
            FamilyMember(member_id=CHILD, family_id=FAMILY, user_id=CHILD, role="CHILD"),
            FamilyMember(member_id=OTHER_CHILD, family_id=OTHER_FAMILY, user_id=OTHER_CHILD, role="CHILD"),
            Account(account_id=CASH, family_id=FAMILY, name="Cash", type="CASH",
                    current_balance=Decimal("100000")),
            Category(category_id=FOOD, family_id=None, name="Food", type="EXPENSE"),
            Category(category_id=SALARY, family_id=None, name="Pocket money", type="INCOME"),
            AccountAccess(account_id=CASH, member_id=CHILD),  # the child may use Cash
        ])
        db.commit()
    return make_session


@pytest.fixture
def db(factory):
    with factory() as session:
        yield session


@pytest.fixture
def login_as(factory):
    who = {}
    app = FastAPI()
    app.include_router(router)

    def override_get_db():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_principal] = lambda: who["principal"]
    client = TestClient(app)

    def switch(name):
        who["principal"] = PEOPLE[name]
        return client

    return switch


def put_limit(client, amount, member=CHILD):
    return client.put(f"/children/{member}/limit", json={"monthly_limit": amount})


def spend(db, amount, day=TODAY, member=CHILD, role="CHILD"):
    return record_transaction(
        db, family_id=FAMILY, user_id=member, member_id=member, user_role=role, tx_type="EXPENSE",
        amount=Decimal(str(amount)), source_account_id=CASH, destination_account_id=None,
        category_id=FOOD, tx_date=day,
    )


def set_limit(db, amount, member=CHILD):
    db.add(ChildSpendingLimit(member_id=member, monthly_limit=Decimal(str(amount))))
    db.commit()


# ---- the parent sets, reads and removes the limit ----

def test_owner_sets_a_limit_and_sees_what_is_left(login_as):
    client = login_as("OWNER")
    response = put_limit(client, "50000")
    assert response.status_code == 200
    assert response.json() == {"monthly_limit": "50000.00", "spent_this_month": "0.00", "remaining": "50000.00"}


def test_owner_changes_the_limit(login_as):
    client = login_as("OWNER")
    put_limit(client, "50000")
    assert put_limit(client, "30000").json()["monthly_limit"] == "30000.00"


def test_child_without_a_limit_shows_no_limit(login_as):
    data = login_as("OWNER").get(f"/children/{CHILD}/limit").json()
    assert data["monthly_limit"] is None and data["remaining"] is None


def test_owner_removes_the_limit(login_as):
    client = login_as("OWNER")
    put_limit(client, "50000")
    assert client.delete(f"/children/{CHILD}/limit").status_code == 204
    assert client.get(f"/children/{CHILD}/limit").json()["monthly_limit"] is None


def test_removing_a_limit_that_does_not_exist_is_404(login_as):
    assert login_as("OWNER").delete(f"/children/{CHILD}/limit").status_code == 404


@pytest.mark.parametrize("who", ["ADULT", "CHILD", "ADMIN"])
def test_only_the_owner_may_manage_the_limit(login_as, who):
    client = login_as(who)
    assert client.get(f"/children/{CHILD}/limit").status_code == 403
    assert put_limit(client, "50000").status_code == 403
    assert client.delete(f"/children/{CHILD}/limit").status_code == 403


@pytest.mark.parametrize("bad", ["0", "-5", "10.555", "1000000000000"])
def test_limit_must_be_positive_with_2_decimals_and_not_too_large(login_as, bad):
    assert put_limit(login_as("OWNER"), bad).status_code == 400


def test_limit_can_only_be_set_for_a_child(login_as):
    response = put_limit(login_as("OWNER"), "50000", member=ADULT)
    assert response.status_code == 400
    assert response.json()["detail"] == "Accounts can only be shared with a Child Member"


def test_nfr03_other_familys_child_looks_like_not_found(login_as):
    assert put_limit(login_as("OWNER"), "50000", member=OTHER_CHILD).status_code == 404


def test_fr37_limit_changes_are_written_to_the_audit_log(login_as, db):
    client = login_as("OWNER")
    put_limit(client, "50000")
    put_limit(client, "30000")
    client.delete(f"/children/{CHILD}/limit")
    actions = db.scalars(select(AuditLog.action).where(AuditLog.entity_type == "CHILD_LIMIT")
                         .order_by(AuditLog.log_id)).all()
    assert actions == ["CREATE", "UPDATE", "DELETE"]


# ---- the limit really stops the child ----

def test_child_can_spend_up_to_the_limit_but_not_more(db):
    set_limit(db, 1000)
    spend(db, 600)
    spend(db, 400)  # exactly the limit is allowed
    with pytest.raises(HTTPException) as error:
        spend(db, "0.01")
    assert error.value.status_code == 403
    assert error.value.detail == "Monthly spending limit exceeded: limit 1 000 ₸, already spent 1 000 ₸"


def test_an_expense_over_the_limit_saves_nothing(db):
    set_limit(db, 1000)
    spend(db, 600)
    with pytest.raises(HTTPException):
        spend(db, 500)
    assert db.scalar(select(func.count()).select_from(Transaction)) == 1
    assert db.get(Account, CASH).current_balance == Decimal("99400")


def test_child_without_a_limit_is_not_restricted(db):
    assert spend(db, 50000) is not None


def test_the_limit_is_per_calendar_month(db):
    set_limit(db, 1000)
    spend(db, 900, day=LAST_MONTH)
    assert spend(db, 900) is not None  # this month is still empty


def test_deleted_transactions_do_not_count(db):
    set_limit(db, 1000)
    tx = spend(db, 900)
    tx.is_deleted = True
    db.commit()
    assert spend(db, 900) is not None


def test_only_the_childs_own_expenses_count(db):
    set_limit(db, 1000)
    spend(db, 5000, member=ADULT, role="ADULT")  # an adult spends from the same account
    assert spend(db, 900) is not None


def test_income_does_not_count_and_is_not_blocked(db):
    set_limit(db, 1000)
    record_transaction(
        db, family_id=FAMILY, user_id=CHILD, member_id=CHILD, user_role="CHILD", tx_type="INCOME",
        amount=Decimal("5000"), source_account_id=None, destination_account_id=CASH,
        category_id=SALARY, tx_date=TODAY,
    )
    assert spend(db, 900) is not None


def test_the_limit_does_not_apply_to_the_owner_or_an_adult(db):
    set_limit(db, 1000)  # a limit exists for the child only
    assert spend(db, 5000, member=OWNER, role="OWNER") is not None
    assert spend(db, 5000, member=ADULT, role="ADULT") is not None


def test_status_shows_spent_and_remaining(login_as, db):
    client = login_as("OWNER")
    put_limit(client, "1000")
    spend(db, 350)
    data = client.get(f"/children/{CHILD}/limit").json()
    assert (data["spent_this_month"], data["remaining"]) == ("350.00", "650.00")


def test_removing_the_limit_lets_the_child_spend_again(login_as, db):
    client = login_as("OWNER")
    put_limit(client, "1000")
    spend(db, 1000)
    with pytest.raises(HTTPException):
        spend(db, 100)
    client.delete(f"/children/{CHILD}/limit")
    assert spend(db, 100) is not None
