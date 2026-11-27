"""Tests for registration, login, lock-out and sessions (US-01, US-02, FR-39, NFR-01, NFR-02, NFR-05, NFR-06).

The whole chain is real here: cookie -> user -> family member -> permission matrix.
"""
from datetime import timedelta

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Account, Base, FamilyMember, utcnow
from app.models_auth import User
from app.routes_auth import COOKIE_NAME, install_auth
from app.routes_children import router as children_router
from app.security import get_db
from app.services import auth

PASSWORD = "Good1password"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "x" * 40)
    monkeypatch.setenv("COOKIE_SECURE", "0")  # the test client uses plain http


@pytest.fixture
def make_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(engine)


@pytest.fixture
def db(make_session):
    with make_session() as session:
        yield session


@pytest.fixture
def client(make_session):
    app = FastAPI()
    app.include_router(children_router)

    def _get_db():
        with make_session() as session:
            yield session

    app.dependency_overrides[get_db] = _get_db
    install_auth(app)
    return TestClient(app)


def register(client, email="nuradin@example.com", password=PASSWORD, **extra):
    body = {"full_name": "Nuradin", "email": email, "password": password, "accept_privacy": True, **extra}
    return client.post("/auth/register", json=body)


def login(client, email="nuradin@example.com", password=PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


# ---------------------------------------------------------------- US-01 registration

def test_us01_register_creates_the_user_and_logs_in(client):
    r = register(client)
    assert r.status_code == 201
    assert client.cookies.get(COOKIE_NAME)
    assert client.get("/auth/me").json()["email"] == "nuradin@example.com"


def test_nfr01_password_is_stored_only_as_an_argon2_hash(client, db):
    register(client)
    stored = db.scalar(select(User)).password_hash
    assert PASSWORD not in stored
    assert stored.startswith("$argon2id$")


def test_nfr01_responses_never_contain_the_password_or_its_hash(client):
    body = register(client).text + login(client).text + client.get("/auth/me").text
    assert PASSWORD not in body and "argon2" not in body and "password_hash" not in body


def test_us01_the_same_password_gets_a_different_hash_for_each_user(client, db):
    register(client, "a@example.com")
    register(client, "b@example.com")
    hashes = db.scalars(select(User.password_hash)).all()
    assert hashes[0] != hashes[1]  # random salt


def test_us01_email_that_already_exists_is_refused(client):
    register(client)
    r = register(client, "NURADIN@example.com ")  # same email in other letters, with a space
    assert r.status_code == 409
    assert r.json()["detail"] == "An account with this email already exists"


@pytest.mark.parametrize("weak", ["short1", "onlyletters", "12345678", "", "a1" * 70])
def test_us01_weak_password_is_refused_and_no_account_is_created(client, db, weak):
    r = register(client, password=weak)
    assert r.status_code == 400
    assert "at least 8 characters" in r.json()["detail"]
    assert db.scalar(select(User)) is None


@pytest.mark.parametrize("bad", ["nobody", "a@b", "@example.com", ""])
def test_us01_invalid_email_is_refused(client, bad):
    assert register(client, email=bad).status_code == 400


def test_nfr07_privacy_notice_must_be_accepted(client, db):
    r = register(client, accept_privacy=False)
    assert r.status_code == 400
    assert db.scalar(select(User)) is None


# ---------------------------------------------------------------- US-02 login

def test_us02_login_with_the_right_password_works(client):
    register(client)
    client.cookies.clear()
    r = login(client)
    assert r.status_code == 200
    assert client.get("/auth/me").status_code == 200


def test_us02_wrong_password_and_unknown_email_give_the_same_message(client):
    register(client)
    wrong_password = login(client, password="Wrong1password")
    unknown_email = login(client, email="nobody@example.com")
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json() == {"detail": "Email or password is incorrect"}


def test_us02_email_is_case_insensitive_at_login(client):
    register(client)
    assert login(client, email="NURADIN@Example.com").status_code == 200


def test_us02_logout_ends_the_session(client):
    register(client)
    r = client.post("/auth/logout")
    assert r.status_code == 204
    assert "HttpOnly" in r.headers["set-cookie"] and "SameSite=lax" in r.headers["set-cookie"]
    assert client.get("/auth/me").status_code == 401


# ---------------------------------------------------------------- NFR-06 lock-out

def test_nfr06_account_locked_after_5_failed_logins_even_for_the_right_password(client):
    register(client)
    client.cookies.clear()
    for _ in range(4):
        assert login(client, password="Wrong1password").status_code == 401
    assert login(client, password="Wrong1password").status_code == 401  # the 5th failure sets the lock
    locked = login(client)  # now the RIGHT password
    assert locked.status_code == 423
    assert "locked for 15 minutes" in locked.json()["detail"]


def test_nfr06_locked_account_with_a_wrong_password_looks_like_an_unknown_email(client):
    """A stranger must not learn that the email is registered (review of PR #16)."""
    register(client)
    client.cookies.clear()
    for _ in range(5):
        login(client, password="Wrong1password")
    locked_wrong = login(client, password="Wrong1password")
    unknown = login(client, email="nobody@example.com")
    assert locked_wrong.status_code == unknown.status_code == 401
    assert locked_wrong.json() == unknown.json()


def test_nfr06_wrong_passwords_during_the_lock_do_not_extend_it(db):
    t0 = utcnow()
    auth.register(db, full_name="N", email="n@example.com", password=PASSWORD, accept_privacy=True, now=t0)
    for _ in range(5):
        with pytest.raises(HTTPException):
            auth.login(db, email="n@example.com", password="Wrong1password", now=t0)
    for _ in range(3):  # an attacker keeps trying during the lock
        with pytest.raises(HTTPException):
            auth.login(db, email="n@example.com", password="Wrong1password", now=t0 + timedelta(minutes=10))
    assert auth.login(db, email="n@example.com", password=PASSWORD, now=t0 + timedelta(minutes=15, seconds=1))


def test_nfr06_four_failures_do_not_lock(client):
    register(client)
    client.cookies.clear()
    for _ in range(4):
        login(client, password="Wrong1password")
    assert login(client).status_code == 200


def test_nfr06_lock_lasts_15_minutes_then_the_user_can_log_in(db):
    t0 = utcnow()
    auth.register(db, full_name="N", email="n@example.com", password=PASSWORD, accept_privacy=True, now=t0)
    for _ in range(5):
        with pytest.raises(HTTPException):
            auth.login(db, email="n@example.com", password="Wrong1password", now=t0)
    with pytest.raises(HTTPException) as e:
        auth.login(db, email="n@example.com", password=PASSWORD, now=t0 + timedelta(minutes=14, seconds=59))
    assert e.value.status_code == 423
    user = auth.login(db, email="n@example.com", password=PASSWORD, now=t0 + timedelta(minutes=15, seconds=1))
    assert user.locked_until is None


def test_nfr06_a_successful_login_resets_the_failure_counter(client, db):
    register(client)
    client.cookies.clear()
    for _ in range(3):
        login(client, password="Wrong1password")
    assert db.scalar(select(User.failed_login_count)) == 3
    login(client)
    db.expire_all()
    assert db.scalar(select(User.failed_login_count)) == 0
    for _ in range(4):  # 4 more failures are still below the limit
        login(client, password="Wrong1password")
    assert login(client).status_code == 200


# ---------------------------------------------------------------- NFR-05 session

def test_nfr05_token_is_valid_for_29_minutes_and_not_for_31(db):
    user = auth.register(db, full_name="N", email="n@example.com", password=PASSWORD, accept_privacy=True)
    fresh = auth.issue_token(user.user_id, now=utcnow() - timedelta(minutes=29))
    assert auth.read_token(fresh) == user.user_id
    old = auth.issue_token(user.user_id, now=utcnow() - timedelta(minutes=31))
    with pytest.raises(HTTPException) as e:
        auth.read_token(old)
    assert e.value.status_code == 401


def test_nfr05_expired_cookie_is_refused(client):
    register(client)
    client.cookies.set(COOKIE_NAME, auth.issue_token(1, now=utcnow() - timedelta(minutes=31)))
    assert client.get("/auth/me").status_code == 401


def test_nfr05_every_request_sends_a_fresh_cookie_so_inactivity_is_measured(client):
    register(client)
    r = client.get("/auth/me")
    cookie = r.headers["set-cookie"]
    assert COOKIE_NAME in cookie and "Max-Age=1800" in cookie
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie


def test_nfr02_request_without_a_cookie_is_refused(client):
    assert client.get("/auth/me").status_code == 401


def test_nfr02_forged_or_tampered_cookie_is_refused(client):
    register(client)
    good = client.cookies.get(COOKIE_NAME)
    client.cookies.set(COOKIE_NAME, good[:-3] + "abc")
    assert client.get("/auth/me").status_code == 401
    client.cookies.set(COOKIE_NAME, "not-a-token")
    assert client.get("/auth/me").status_code == 401


def test_nfr05_a_token_signed_with_another_key_is_refused(client, monkeypatch):
    register(client)
    monkeypatch.setenv("SESSION_SECRET", "y" * 40)
    assert client.get("/auth/me").status_code == 401


def test_nfr05_missing_signing_key_fails_loudly_not_silently(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "short")
    with pytest.raises(RuntimeError):
        auth.issue_token(1)


# ---------------------------------------------------------------- FR-39 blocked user

def test_fr39_blocked_user_cannot_log_in(client, make_session):
    register(client)
    client.cookies.clear()
    with make_session() as s:
        s.scalar(select(User)).is_active = False
        s.commit()
    r = login(client)
    assert r.status_code == 403 and r.json()["detail"] == "Your account has been blocked"


def test_fr39_blocking_works_at_the_next_request_not_after_the_session(client, make_session):
    register(client)
    assert client.get("/auth/me").status_code == 200
    with make_session() as s:
        s.scalar(select(User)).is_active = False
        s.commit()
    r = client.get("/auth/me")
    assert r.status_code == 403 and r.json()["detail"] == "Your account has been blocked"


def test_fr39_wrong_password_for_a_blocked_user_does_not_reveal_the_block(client, make_session):
    register(client)
    client.cookies.clear()
    with make_session() as s:
        s.scalar(select(User)).is_active = False
        s.commit()
    assert login(client, password="Wrong1password").json()["detail"] == "Email or password is incorrect"


# ---------------------------------------------------------------- NFR-02 / NFR-03 roles from the database

def _add_member(make_session, user_id, role, family_id=1, removed=False):
    with make_session() as s:
        s.add(FamilyMember(member_id=user_id, family_id=family_id, user_id=user_id, role=role,
                           removed_at=utcnow() if removed else None))
        s.commit()


def test_nfr03_role_and_family_come_from_the_database_not_from_the_request(client, make_session):
    register(client)  # user_id 1
    assert client.get("/auth/me").json()["role"] is None  # no family yet
    _add_member(make_session, 1, "OWNER", family_id=7)
    me = client.get("/auth/me").json()
    assert (me["role"], me["family_id"]) == ("OWNER", 7)


def test_us04_a_role_change_works_at_the_next_request(client, make_session):
    register(client)
    _add_member(make_session, 1, "OWNER")
    assert client.get("/auth/me").json()["role"] == "OWNER"
    with make_session() as s:
        s.scalar(select(FamilyMember)).role = "CHILD"
        s.commit()
    assert client.get("/auth/me").json()["role"] == "CHILD"


def test_nfr02_a_removed_member_has_no_family(client, make_session):
    register(client)
    _add_member(make_session, 1, "OWNER", removed=True)
    me = client.get("/auth/me").json()
    assert me["family_id"] is None and me["role"] is None


def test_nfr02_system_admin_has_role_admin_and_no_family(client, make_session):
    register(client)
    with make_session() as s:
        s.scalar(select(User)).is_system_admin = True
        s.commit()
    me = client.get("/auth/me").json()
    assert (me["role"], me["family_id"]) == ("ADMIN", None)


def test_nfr02_login_plus_permission_matrix_child_cannot_share_an_account_but_owner_can(client, make_session):
    """The whole chain: cookie -> user -> member -> permission matrix -> 403."""
    register(client, "owner@example.com")   # user 1
    _add_member(make_session, 1, "OWNER")
    client.cookies.clear()
    register(client, "kid@example.com")     # user 2
    _add_member(make_session, 2, "CHILD")
    with make_session() as s:
        s.add(Account(account_id=1, family_id=1, name="Cash", type="CASH"))
        s.commit()

    kid = client.put("/children/2/accounts/1")
    assert kid.status_code == 403

    client.cookies.clear()
    login(client, "owner@example.com")
    owner = client.put("/children/2/accounts/1")
    assert owner.status_code == 204


def test_nfr02_protected_route_without_login_is_401_not_403(client):
    assert client.put("/children/2/accounts/1").status_code == 401
