"""Tests for the private menu (TRANSFER, CHECK BALANCE, AUTHORIZE, INFO), the activity log and the web bridge."""
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models import Account, Base, FamilyMember, Transaction
from app.services.transactions import record_transaction
from bot import config
from bot.activity import list_activity
from bot.alerts import check_big_transactions
from bot.demo import ADULT, CHILD, FAMILY, KASPI, CASH, OWNER, POCKET, SAVINGS, seed
from bot.main import handle_callback, handle_message
from bot.models import MemberLinkCode, TelegramLink
from bot.people import authorize, create_member_code, get_identity
from bot import web


class FakeAPI:
    def __init__(self):
        self.sent, self.edits = [], []

    def send_message(self, chat_id, text, reply_markup=None):
        self.sent.append((chat_id, text, reply_markup))

    def edit_message_text(self, chat_id, message_id, text, reply_markup=None):
        self.edits.append((chat_id, message_id, text, reply_markup))

    def answer_callback_query(self, callback_id):
        pass


# Telegram user ids used in the tests
AIGERIM, DAULET, AIDAR = 1001, 1002, 1003


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with sessionmaker(engine, expire_on_commit=False)() as session:
        assert seed(session)
        yield session


def sign_in(db, member_id, tg_id):
    who, _ = authorize(db, tg_id, create_member_code(db, member_id))
    assert who is not None
    return who


def press(db, api, data, tg_id, chat_type="private", message_id=7):
    handle_callback(db, api, {"id": "c", "data": data, "from": {"id": tg_id},
                              "message": {"chat": {"id": tg_id, "type": chat_type}, "message_id": message_id}})


def say(db, api, text, tg_id, chat_type="private"):
    handle_message(db, api, {"chat": {"id": tg_id, "type": chat_type}, "from": {"id": tg_id}, "text": text})


def codes(markup):
    return [b["callback_data"] for row in json.loads(markup)["inline_keyboard"] for b in row]


def kinds(db):
    return [a.kind for a in reversed(list_activity(db, FAMILY))]


# ---- the menu ---------------------------------------------------------------------------------

def test_menu_has_the_four_buttons(db):
    api = FakeAPI()
    say(db, api, "/panel", AIGERIM)
    text, markup = api.sent[-1][1], api.sent[-1][2]
    assert "Not signed in" in text
    assert codes(markup) == ["m:tf", "m:bal", "m:auth", "m:info"]


def test_start_in_a_private_chat_opens_the_menu(db):
    api = FakeAPI()
    say(db, api, "/start", AIGERIM)
    assert "m:bal" in codes(api.sent[-1][2])


def test_money_screens_are_refused_in_a_group(db):
    api = FakeAPI()
    say(db, api, "/panel", AIGERIM, chat_type="group")
    assert "private chat" in api.sent[-1][1] and api.sent[-1][2] is None
    press(db, api, "m:bal", AIGERIM, chat_type="group")
    assert "private chat" in api.edits[-1][2]


# ---- AUTHORIZE --------------------------------------------------------------------------------

def test_authorize_signs_in_and_shows_the_menu(db):
    api = FakeAPI()
    say(db, api, f"/authorize {create_member_code(db, OWNER)}", AIGERIM)
    assert "Signed in as Aigerim Seitkali (Owner)" in api.sent[0][1]
    assert "Signed in as Aigerim Seitkali" in api.sent[1][1]  # menu shows who you are
    assert get_identity(db, AIGERIM).member_id == OWNER
    assert "AUTHORIZE" in kinds(db)


def test_authorize_code_works_once(db):
    code = create_member_code(db, OWNER)
    assert authorize(db, AIGERIM, code)[0] is not None
    who, message = authorize(db, DAULET, code)
    assert who is None and "not valid" in message


def test_authorize_code_expires(db):
    code = create_member_code(db, OWNER)
    row = db.scalars(select(MemberLinkCode)).one()
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    assert "not valid" in authorize(db, AIGERIM, code)[1]


def test_authorize_code_is_stored_hashed(db):
    code = create_member_code(db, OWNER)
    assert db.scalars(select(MemberLinkCode)).one().code_hash != code


def test_authorize_only_in_a_private_chat(db):
    api = FakeAPI()
    say(db, api, f"/authorize {create_member_code(db, OWNER)}", AIGERIM, chat_type="group")
    assert get_identity(db, AIGERIM) is None


def test_removed_member_loses_access(db):
    sign_in(db, ADULT, DAULET)
    db.get(FamilyMember, ADULT).removed_at = datetime.now(timezone.utc)
    db.commit()
    assert get_identity(db, DAULET) is None


def test_sign_out(db):
    sign_in(db, OWNER, AIGERIM)
    api = FakeAPI()
    press(db, api, "m:out", AIGERIM)
    assert get_identity(db, AIGERIM) is None
    press(db, api, "m:bal", AIGERIM)
    assert "authorize" in api.edits[-1][2].lower()
    assert "SIGN_OUT" in kinds(db)


# ---- CHECK BALANCE ----------------------------------------------------------------------------

def test_balance_needs_sign_in(db):
    api = FakeAPI()
    press(db, api, "m:bal", AIGERIM)
    assert "authorize" in api.edits[-1][2].lower() and "Kaspi" not in api.edits[-1][2]


def test_owner_sees_every_account(db):
    sign_in(db, OWNER, AIGERIM)
    api = FakeAPI()
    press(db, api, "m:bal", AIGERIM)
    text = api.edits[-1][2]
    assert "Kaspi card: 241 000 ₸" in text and "Savings: 200 000 ₸" in text and "Halyk credit card: −32 000 ₸" in text
    assert "BALANCE" in kinds(db)


def test_child_sees_only_the_shared_account_and_no_total(db):
    sign_in(db, CHILD, AIDAR)
    api = FakeAPI()
    press(db, api, "m:bal", AIDAR)
    text = api.edits[-1][2]
    assert "pocket money: 12 500 ₸" in text
    assert "Kaspi" not in text and "Savings" not in text and "otal" not in text  # BR-10, BR-13


# ---- INFO -------------------------------------------------------------------------------------

def test_info_lists_the_members(db):
    sign_in(db, OWNER, AIGERIM)
    sign_in(db, ADULT, DAULET)
    api = FakeAPI()
    press(db, api, "m:info", AIGERIM)
    text = api.edits[-1][2]
    assert "Aigerim Seitkali — Owner (you)" in text and "Daulet Seitkali — Adult" in text and "Aidar Seitkali — Child" in text
    assert "📱" in text  # the Owner sees who is connected


def test_child_sees_members_but_not_who_uses_telegram(db):
    sign_in(db, OWNER, AIGERIM)
    sign_in(db, CHILD, AIDAR)
    api = FakeAPI()
    press(db, api, "m:info", AIDAR)
    assert "Aigerim Seitkali — Owner" in api.edits[-1][2] and "📱" not in api.edits[-1][2]


# ---- TRANSFER ---------------------------------------------------------------------------------

def test_transfer_by_buttons_moves_money_and_is_logged(db):
    sign_in(db, OWNER, AIGERIM)
    api = FakeAPI()
    press(db, api, "m:tf", AIGERIM)
    assert f"m:tf_from:{KASPI}" in codes(api.edits[-1][3])
    press(db, api, f"m:tf_from:{KASPI}", AIGERIM)
    assert f"m:tf_to:{KASPI}:{CASH}" in codes(api.edits[-1][3])
    press(db, api, f"m:tf_to:{KASPI}:{CASH}", AIGERIM)
    assert f"m:tf_amt:{KASPI}:{CASH}:5000" in codes(api.edits[-1][3])
    press(db, api, f"m:tf_amt:{KASPI}:{CASH}:5000", AIGERIM)
    assert "Confirm" in api.edits[-1][2] and f"m:tf_go:{KASPI}:{CASH}:5000" in codes(api.edits[-1][3])
    assert db.scalars(select(Transaction)).first() is None  # nothing moved before the confirmation

    press(db, api, f"m:tf_go:{KASPI}:{CASH}:5000", AIGERIM)
    assert "Transferred 5 000 ₸" in api.edits[-1][2]
    assert db.get(Account, KASPI).current_balance == Decimal("236000")
    assert db.get(Account, CASH).current_balance == Decimal("20500")
    tx = db.scalars(select(Transaction)).one()
    assert tx.type == "TRANSFER" and tx.created_by == OWNER and tx.family_id == FAMILY
    latest = list_activity(db, FAMILY)[0]
    assert latest.kind == "TRANSFER" and latest.transaction_id == tx.transaction_id and latest.actor_name == "Aigerim Seitkali"


def test_double_tap_on_confirm_transfers_only_once(db):
    sign_in(db, OWNER, AIGERIM)
    api = FakeAPI()
    press(db, api, f"m:tf_go:{KASPI}:{CASH}:5000", AIGERIM, message_id=9)
    press(db, api, f"m:tf_go:{KASPI}:{CASH}:5000", AIGERIM, message_id=9)
    assert len(db.scalars(select(Transaction)).all()) == 1
    assert "already" in api.edits[-1][2]
    assert db.get(Account, KASPI).current_balance == Decimal("236000")


def test_transfer_by_command_asks_for_confirmation(db):
    sign_in(db, OWNER, AIGERIM)
    api = FakeAPI()
    say(db, api, f"/transfer {KASPI} {CASH} 75000", AIGERIM)
    assert "75 000 ₸" in api.sent[-1][1] and "m:tf_go" in " ".join(codes(api.sent[-1][2]))
    assert db.scalars(select(Transaction)).first() is None


def test_adult_can_transfer(db):
    sign_in(db, ADULT, DAULET)
    api = FakeAPI()
    press(db, api, f"m:tf_go:{KASPI}:{SAVINGS}:10000", DAULET)
    assert "Transferred" in api.edits[-1][2]



def test_child_cannot_transfer(db):
    sign_in(db, CHILD, AIDAR)
    api = FakeAPI()
    press(db, api, "m:tf", AIDAR)
    assert "cannot" in api.edits[-1][2].lower()
    press(db, api, f"m:tf_go:{POCKET}:{CASH}:1000", AIDAR)
    assert "cannot" in api.edits[-1][2].lower()  # BR-10 even if the button code is forged
    assert db.scalars(select(Transaction)).first() is None
    assert "TRANSFER_FAILED" in kinds(db)


def test_not_enough_money_is_refused_and_logged(db):
    sign_in(db, OWNER, AIGERIM)
    api = FakeAPI()
    press(db, api, f"m:tf_go:{CASH}:{KASPI}:100000", AIGERIM)  # Cash has 15 500
    assert "Not enough money" in api.edits[-1][2]
    assert db.get(Account, CASH).current_balance == Decimal("15500")
    assert "TRANSFER_FAILED" in kinds(db)


def test_account_of_another_family_is_not_found(db):
    db.add(Account(account_id=90, family_id=99, name="Other family", type="CASH",
                   opening_balance=Decimal("1000000"), current_balance=Decimal("1000000")))
    db.commit()
    sign_in(db, OWNER, AIGERIM)
    api = FakeAPI()
    press(db, api, f"m:tf_to:{KASPI}:90", AIGERIM)  # NFR-03
    assert "not found" in api.edits[-1][2].lower()
    assert db.get(Account, 90).current_balance == Decimal("1000000")


def test_transfer_to_the_same_account_is_refused(db):
    sign_in(db, OWNER, AIGERIM)
    api = FakeAPI()
    press(db, api, f"m:tf_to:{KASPI}:{KASPI}", AIGERIM)
    assert "different" in api.edits[-1][2].lower()


# ---- alerts in the feed, and the web bridge --------------------------------------------------

def test_alerts_appear_in_the_feed(db):
    link = TelegramLink(chat_id=500, family_id=FAMILY, last_tx_id=0)
    db.add(link)
    db.commit()
    record_transaction(db, FAMILY, 1, OWNER, "OWNER", "EXPENSE", Decimal("60000"), KASPI, None, 16, date.today(), "t")
    check_big_transactions(db, link, lambda chat, text: None)
    assert "ALERT_BIG" in kinds(db)


def test_bridge_returns_the_feed_of_one_family_only(db):
    sign_in(db, OWNER, AIGERIM)
    press(db, FakeAPI(), "m:bal", AIGERIM)
    from bot.activity import log_activity
    log_activity(db, 77, "BALANCE", "Other family secret", actor_name="Someone")
    rows = web.activity(family_id=FAMILY, limit=50, db=db)
    assert rows and all("secret" not in r["summary"] for r in rows)
    assert {"id", "createdAt", "actorName", "role", "kind", "summary", "transactionId"} <= set(rows[0])
    assert rows[0]["createdAt"].endswith("+00:00")


def test_bridge_needs_the_key(db, monkeypatch):
    from fastapi import HTTPException
    monkeypatch.setattr(config, "BOT_API_KEY", "")
    with pytest.raises(HTTPException) as e:
        web.require_key("anything")
    assert e.value.status_code == 503
    monkeypatch.setattr(config, "BOT_API_KEY", "secret")
    with pytest.raises(HTTPException) as e:
        web.require_key("wrong")
    assert e.value.status_code == 401
    web.require_key("secret")  # no error
