"""Tests for the permission check on requests and for parents controlling a child's accounts
(NFR-02, NFR-03, FR-13, FR-37, BR-10, US-04).

The authentication is not part of these tests: a fake `get_current_principal` says who is
logged in, exactly as the real authentication will do.
"""
from datetime import date
from decimal import Decimal

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Account, AccountAccess, AuditLog, Base, Category, FamilyMember
from app.routes_children import router
from app.security import Principal, get_current_principal, get_db
from app.services.transactions import record_transaction

FAMILY, OTHER_FAMILY = 1, 2
# user_id == member_id for the people below
OWNER, ADULT, CHILD, OTHER_OWNER, OTHER_CHILD = 1, 2, 3, 9, 10
KASPI, CASH, ARCHIVED, OTHER_ACCOUNT = 1, 2, 3, 4
FOOD = 1

PEOPLE = {
    "OWNER": Principal(OWNER, OWNER, FAMILY, "OWNER"),
    "ADULT": Principal(ADULT, ADULT, FAMILY, "ADULT"),
    "CHILD": Principal(CHILD, CHILD, FAMILY, "CHILD"),
    "ADMIN": Principal(20, None, None, "ADMIN"),
    "NO_FAMILY": Principal(30, None, None, None),
}


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
            FamilyMember(member_id=OTHER_OWNER, family_id=OTHER_FAMILY, user_id=OTHER_OWNER, role="OWNER"),
            FamilyMember(member_id=OTHER_CHILD, family_id=OTHER_FAMILY, user_id=OTHER_CHILD, role="CHILD"),
            Account(account_id=KASPI, family_id=FAMILY, name="Kaspi card", type="BANK_CARD",
                    current_balance=Decimal("200000")),
            Account(account_id=CASH, family_id=FAMILY, name="Cash", type="CASH",
                    current_balance=Decimal("10000")),
            Account(account_id=ARCHIVED, family_id=FAMILY, name="Old card", type="BANK_CARD", is_archived=True),
            Account(account_id=OTHER_ACCOUNT, family_id=OTHER_FAMILY, name="Cash", type="CASH"),
            Category(category_id=FOOD, family_id=None, name="Food", type="EXPENSE"),
        ])
        db.commit()
    return make_session


@pytest.fixture
def db(factory):
    with factory() as session:
        yield session


@pytest.fixture
def login_as(factory):
    """Returns a function: login_as("OWNER") gives a client whose requests come from that person."""
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


# ---- permission check on requests (NFR-02) ----

@pytest.mark.parametrize("who", ["ADULT", "CHILD", "ADMIN", "NO_FAMILY"])
def test_br10_only_the_owner_may_control_a_childs_accounts(login_as, who):
    client = login_as(who)
    assert client.get(f"/children/{CHILD}/accounts").status_code == 403
    assert client.put(f"/children/{CHILD}/accounts/{CASH}").status_code == 403
    assert client.delete(f"/children/{CHILD}/accounts/{CASH}").status_code == 403


def test_nfr02_refusal_has_the_standard_message(login_as):
    response = login_as("CHILD").put(f"/children/{CHILD}/accounts/{CASH}")
    assert response.json()["detail"] == "You do not have permission to do this"


def test_us04_the_role_given_by_the_authentication_decides_at_each_request(login_as):
    """A child becomes an Owner: the next request is judged by the new role (US-04)."""
    assert login_as("CHILD").get(f"/children/{CHILD}/accounts").status_code == 403
    assert login_as("OWNER").get(f"/children/{CHILD}/accounts").status_code == 200


def test_the_placeholders_refuse_to_work_without_the_authentication():
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app, raise_server_exceptions=False)
    assert client.get(f"/children/{CHILD}/accounts").status_code == 500  # not connected yet


# ---- parents control the child (FR-13, BR-10) ----

def test_fr13_owner_shares_an_account_with_a_child(login_as):
    client = login_as("OWNER")
    assert client.put(f"/children/{CHILD}/accounts/{CASH}").status_code == 204
    assert client.get(f"/children/{CHILD}/accounts").json() == [{"account_id": CASH, "name": "Cash"}]


def test_fr13_owner_takes_the_access_back(login_as):
    client = login_as("OWNER")
    client.put(f"/children/{CHILD}/accounts/{CASH}")
    assert client.delete(f"/children/{CHILD}/accounts/{CASH}").status_code == 204
    assert client.get(f"/children/{CHILD}/accounts").json() == []


def test_fr13_sharing_twice_changes_nothing(login_as, db):
    client = login_as("OWNER")
    client.put(f"/children/{CHILD}/accounts/{CASH}")
    assert client.put(f"/children/{CHILD}/accounts/{CASH}").status_code == 204
    assert db.scalar(select(func.count()).select_from(AccountAccess)) == 1


def test_fr13_accounts_can_only_be_shared_with_a_child(login_as):
    response = login_as("OWNER").put(f"/children/{ADULT}/accounts/{CASH}")
    assert response.status_code == 400
    assert response.json()["detail"] == "Accounts can only be shared with a Child Member"


def test_fr13_archived_account_cannot_be_shared(login_as):
    assert login_as("OWNER").put(f"/children/{CHILD}/accounts/{ARCHIVED}").status_code == 400


def test_nfr03_other_familys_account_and_child_look_like_not_found(login_as):
    client = login_as("OWNER")
    assert client.put(f"/children/{CHILD}/accounts/{OTHER_ACCOUNT}").status_code == 404
    assert client.put(f"/children/{OTHER_CHILD}/accounts/{CASH}").status_code == 404
    assert client.get(f"/children/{OTHER_CHILD}/accounts").status_code == 404


def test_fr13_taking_back_access_that_was_never_given_is_404(login_as):
    assert login_as("OWNER").delete(f"/children/{CHILD}/accounts/{CASH}").status_code == 404


def test_fr37_sharing_and_taking_back_are_written_to_the_audit_log(login_as, db):
    client = login_as("OWNER")
    client.put(f"/children/{CHILD}/accounts/{CASH}")
    client.delete(f"/children/{CHILD}/accounts/{CASH}")
    entries = db.execute(select(AuditLog.action, AuditLog.actor_user_id, AuditLog.family_id)
                         .where(AuditLog.entity_type == "ACCOUNT_ACCESS").order_by(AuditLog.log_id)).all()
    assert [tuple(e) for e in entries] == [("CREATE", OWNER, FAMILY), ("DELETE", OWNER, FAMILY)]


# ---- the whole chain: what the parent sets is what the child can do ----

def child_spends_from_cash(db):
    return record_transaction(
        db, family_id=FAMILY, user_id=CHILD, member_id=CHILD, user_role="CHILD", tx_type="EXPENSE",
        amount=Decimal("100"), source_account_id=CASH, destination_account_id=None, category_id=FOOD,
        tx_date=date.today(),
    )


def test_br10_child_can_spend_only_while_the_parent_shares_the_account(login_as, db):
    with pytest.raises(HTTPException) as before:
        child_spends_from_cash(db)
    assert before.value.status_code == 403

    client = login_as("OWNER")
    client.put(f"/children/{CHILD}/accounts/{CASH}")
    assert child_spends_from_cash(db) is not None

    client.delete(f"/children/{CHILD}/accounts/{CASH}")
    with pytest.raises(HTTPException) as after:
        child_spends_from_cash(db)
    assert after.value.status_code == 403
