"""Tests for the Telegram alert bot (big transactions and low balances). Uses SQLite, no Telegram."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Account, Base, Category, FamilyMember, Transaction
from app.services.transactions import record_transaction
from bot.alerts import check_big_transactions, check_low_balances
from bot.linking import create_link_code, link_chat, unlink_chat
from bot.models import TelegramLink, TelegramLinkCode


class Sent(list):
    def __call__(self, chat_id, text):
        self.append((chat_id, text))


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)  # includes the bot tables (they use the same Base)
    with sessionmaker(engine, expire_on_commit=False)() as session:
        session.add_all([
            FamilyMember(member_id=1, family_id=1, user_id=1, role="OWNER"),
            Account(account_id=1, family_id=1, name="Kaspi card", type="BANK_CARD",
                    opening_balance=Decimal("300000"), current_balance=Decimal("300000")),
            Account(account_id=2, family_id=1, name="Cash", type="CASH",
                    opening_balance=Decimal("20000"), current_balance=Decimal("20000")),
            Account(account_id=3, family_id=2, name="Other family", type="CASH",
                    opening_balance=Decimal("1"), current_balance=Decimal("1")),
            Category(category_id=1, family_id=None, name="Housing & utilities", type="EXPENSE"),
            Category(category_id=2, family_id=None, name="Salary", type="INCOME"),
        ])
        session.commit()
        yield session


def spend(db, amount, account_id=1, category_id=1):
    return record_transaction(db, 1, 1, 1, "OWNER", "EXPENSE", Decimal(amount),
                              account_id, None, category_id, date.today(), "test")


def make_link(db, family_id=1, chat_id=100):
    link = TelegramLink(chat_id=chat_id, family_id=family_id, last_tx_id=0)
    db.add(link)
    db.commit()
    return link


def test_big_transaction_over_50000_is_reported(db):
    link, sent = make_link(db), Sent()
    spend(db, "50001")
    assert check_big_transactions(db, link, sent) == 1
    assert "50 001 ₸" in sent[0][1]


def test_transaction_of_exactly_50000_is_not_reported(db):
    link, sent = make_link(db), Sent()
    spend(db, "50000")
    assert check_big_transactions(db, link, sent) == 0 and not sent


def test_same_transaction_is_reported_only_once(db):
    link, sent = make_link(db), Sent()
    spend(db, "60000")
    check_big_transactions(db, link, sent)
    check_big_transactions(db, link, sent)
    assert len(sent) == 1


def test_old_transactions_before_linking_do_not_alert(db):
    spend(db, "60000")
    sent = Sent()
    code = create_link_code(db, 1)
    link_chat(db, 100, code)
    link = db.get(TelegramLink, 100)
    assert check_big_transactions(db, link, sent) == 0


def test_deleted_transaction_is_not_reported(db):
    link, sent = make_link(db), Sent()
    tx = spend(db, "60000")
    tx.is_deleted = True
    db.commit()
    assert check_big_transactions(db, link, sent) == 0


def test_transfer_is_labelled_as_not_spending(db):
    link, sent = make_link(db), Sent()
    record_transaction(db, 1, 1, 1, "OWNER", "TRANSFER", Decimal("70000"), 1, 2, None, date.today())
    check_big_transactions(db, link, sent)
    assert "not spending" in sent[0][1]


def test_nfr03_other_family_transactions_never_reported(db):
    link, sent = make_link(db, family_id=2), Sent()
    spend(db, "60000")  # family 1
    assert check_big_transactions(db, link, sent) == 0


def test_failed_send_is_retried_next_round(db):
    from bot.telegram_api import TelegramError
    link = make_link(db)
    spend(db, "60000")

    def broken(chat_id, text):
        raise TelegramError("down")

    assert check_big_transactions(db, link, broken) == 0
    sent = Sent()
    assert check_big_transactions(db, link, sent) == 1


def test_low_balance_alert_once_then_rearms_after_recovery(db):
    link, sent = make_link(db), Sent()
    spend(db, "15000", account_id=2)  # Cash 20 000 -> 5 000, below 10 000
    assert check_low_balances(db, link, sent) == 1
    assert "Cash" in sent[0][1] and "5 000 ₸" in sent[0][1]
    assert check_low_balances(db, link, sent) == 0  # no spam

    record_transaction(db, 1, 1, 1, "OWNER", "INCOME", Decimal("50000"), None, 2, 2, date.today())
    assert check_low_balances(db, link, sent) == 0  # recovered, alert re-armed
    spend(db, "50000", account_id=2)
    assert check_low_balances(db, link, sent) == 1  # low again -> new alert


def test_low_balance_ignores_other_families(db):
    link, sent = make_link(db), Sent()
    check_low_balances(db, link, sent)
    assert all("Other family" not in text for _, text in sent)


def test_link_code_works_once(db):
    code = create_link_code(db, 1)
    assert link_chat(db, 100, code).startswith("Linked")
    assert "not valid" in link_chat(db, 200, code)


def test_link_code_expires(db):
    code = create_link_code(db, 1)
    row = db.query(TelegramLinkCode).one()
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    assert "not valid" in link_chat(db, 100, code)


def test_link_code_is_stored_hashed(db):
    code = create_link_code(db, 1)
    assert db.query(TelegramLinkCode).one().code_hash != code


def test_unlink(db):
    link_chat(db, 100, create_link_code(db, 1))
    assert unlink_chat(db, 100).startswith("Unlinked")
    assert db.get(TelegramLink, 100) is None
