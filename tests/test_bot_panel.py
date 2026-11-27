"""Tests for the in-chat control panel (buttons and /big, /low commands). No Telegram needed."""
import json
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Account, Base, Category, FamilyMember
from app.services.transactions import record_transaction
from bot.alerts import run_checks
from bot.linking import create_link_code, link_chat
from bot.main import handle_callback, handle_message
from bot.models import TelegramLink, TelegramSettings
from bot.settings import get_settings


class FakeAPI:
    def __init__(self):
        self.sent, self.edits, self.answered = [], [], []

    def send_message(self, chat_id, text, reply_markup=None):
        self.sent.append((chat_id, text, reply_markup))

    def edit_message_text(self, chat_id, message_id, text, reply_markup=None):
        self.edits.append((chat_id, message_id, text, reply_markup))

    def answer_callback_query(self, callback_id):
        self.answered.append(callback_id)


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with sessionmaker(engine, expire_on_commit=False)() as session:
        session.add_all([
            FamilyMember(member_id=1, family_id=1, user_id=1, role="OWNER"),
            Account(account_id=1, family_id=1, name="Kaspi card", type="BANK_CARD",
                    opening_balance=Decimal("300000"), current_balance=Decimal("300000")),
            Category(category_id=1, family_id=None, name="Housing & utilities", type="EXPENSE"),
        ])
        session.commit()
        yield session


@pytest.fixture
def linked(db):
    link_chat(db, 100, create_link_code(db, 1))
    return db


def press(db, api, data, chat_id=100):
    handle_callback(db, api, {"id": "cb1", "data": data, "message": {"chat": {"id": chat_id}, "message_id": 7}})


def say(db, api, text, chat_id=100):
    handle_message(db, api, {"chat": {"id": chat_id}, "text": text})


def spend(db, amount):
    record_transaction(db, 1, 1, 1, "OWNER", "EXPENSE", Decimal(amount), 1, None, 1, date.today(), "t")


def buttons(markup):
    return [b["callback_data"] for row in json.loads(markup)["inline_keyboard"] for b in row]


def test_alerts_command_shows_buttons(linked):
    api = FakeAPI()
    say(linked, api, "/alerts")
    text, markup = api.sent[-1][1], api.sent[-1][2]
    assert "Alert settings" in text and "50 000 ₸" in text
    assert {"al:pause", "al:menu_big", "al:menu_low", "al:unlink"} <= set(buttons(markup))


def test_alert_panel_never_shows_balances(linked):
    # Anyone in a linked group could read them; balances live in the private, authorized menu.
    api = FakeAPI()
    say(linked, api, "/alerts")
    assert not any("bal" in b for b in buttons(api.sent[-1][2]))
    press(linked, api, "balances")
    assert "Kaspi" not in api.edits[-1][2]


def test_linking_opens_the_panel(db):
    api = FakeAPI()
    say(db, api, f"/link {create_link_code(db, 1)}")
    assert api.sent[0][1].startswith("Linked") and "Alert settings" in api.sent[1][1]


def test_panel_in_unlinked_chat_asks_to_link(db):
    api = FakeAPI()
    say(db, api, "/alerts", chat_id=555)
    assert "not linked" in api.sent[-1][1]


def test_button_changes_big_limit_and_it_is_used(linked):
    api = FakeAPI()
    press(linked, api, "set_big:100000")
    assert get_settings(linked, 100).big == Decimal(100000)
    assert api.answered == ["cb1"]
    sent = []
    spend(linked, "60000")  # below the new 100 000 limit
    run_checks(linked, lambda chat, text: sent.append(text))
    assert not any("Big transaction" in t for t in sent)
    spend(linked, "120000")
    run_checks(linked, lambda chat, text: sent.append(text))
    assert any("Big transaction" in t for t in sent)


def test_commands_set_limits_with_spaces(linked):
    api = FakeAPI()
    say(linked, api, "/big 75 000")
    say(linked, api, "/low 15000")
    s = get_settings(linked, 100)
    assert s.big == Decimal(75000) and s.low == Decimal(15000)


@pytest.mark.parametrize("bad", ["abc", "-5", "0", "1.5", "99999999999"])
def test_invalid_amount_is_rejected(linked, bad):
    api = FakeAPI()
    say(linked, api, f"/big {bad}")
    assert "whole number" in api.sent[-1][1]
    assert get_settings(linked, 100).big == Decimal(50000)


def test_pause_stops_alerts_and_skips_missed_ones(linked):
    api, sent = FakeAPI(), []
    press(linked, api, "pause")
    assert get_settings(linked, 100).paused
    assert "PAUSED" in api.edits[-1][2] and "al:resume" in buttons(api.edits[-1][3])
    spend(linked, "60000")
    run_checks(linked, lambda chat, text: sent.append(text))
    assert sent == []
    press(linked, api, "resume")
    run_checks(linked, lambda chat, text: sent.append(text))
    assert sent == []  # the transaction made during the pause is not reported later
    spend(linked, "60000")
    run_checks(linked, lambda chat, text: sent.append(text))
    assert len(sent) == 1


def test_unlink_needs_confirmation_and_clears_settings(linked):
    api = FakeAPI()
    say(linked, api, "/big 75000")
    press(linked, api, "unlink")
    assert linked.get(TelegramLink, 100) is not None  # only asked so far
    press(linked, api, "unlink_yes")
    assert linked.get(TelegramLink, 100) is None
    assert linked.get(TelegramSettings, 100) is None


def test_button_in_unlinked_chat_does_nothing_harmful(db):
    api = FakeAPI()
    press(db, api, "set_big:20000", chat_id=555)
    assert "not linked" in api.edits[-1][2]
    assert db.get(TelegramSettings, 555) is None


def test_unknown_button_shows_home(linked):
    api = FakeAPI()
    press(linked, api, "something-old")
    assert "Alert settings" in api.edits[-1][2]


def test_buttons_work_with_the_al_prefix_too(linked):
    api = FakeAPI()
    press(linked, api, "al:set_low:20000")
    assert get_settings(linked, 100).low == Decimal(20000)
