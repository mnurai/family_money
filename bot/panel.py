"""Alert settings panel (/alerts): pause, big transaction limit, low balance limit, unlink.

Buttons send a short code ("al:set_big:100000"); handle_callback() changes the setting and
redraws the same message. Balances are NOT shown here: anyone in a linked group could read them.
The main menu (TRANSFER, CHECK BALANCE, AUTHORIZE, INFO) is in bot/menu.py.
"""
import json
import logging
from decimal import Decimal

from sqlalchemy.orm import Session

from app.services.transactions import format_money
from bot.models import TelegramLink
from bot.settings import ChatSettings, get_settings, parse_amount, set_big, set_low, set_paused
from bot.linking import unlink_chat
from bot.telegram_api import TelegramAPI, TelegramError

log = logging.getLogger("fbt.bot")

BIG_PRESETS = [20_000, 50_000, 100_000, 200_000]
LOW_PRESETS = [5_000, 10_000, 20_000, 50_000]
NOT_LINKED = "This chat is not linked to a family yet. Get a code from the family Owner and send /link CODE."


def _button(text: str, data: str) -> dict:
    return {"text": text, "callback_data": data}


def _markup(rows: list) -> str:
    return json.dumps({"inline_keyboard": rows})


def _fmt(amount) -> str:
    return format_money(Decimal(amount))


# ---- screens: each returns (text, reply_markup) ---------------------------------------------

def home_screen(s: ChatSettings) -> tuple[str, str]:
    status = "⏸ PAUSED" if s.paused else "✅ ON"
    text = (
        "⚙️ Alert settings\n\n"
        f"Alerts: {status}\n"
        f"💸 Big transaction: over {_fmt(s.big)}\n"
        f"⚠️ Low balance: below {_fmt(s.low)}\n\n"
        "Any amount: /big 75000 or /low 15000"
    )
    toggle = _button("▶️ Resume alerts", "al:resume") if s.paused else _button("⏸ Pause alerts", "al:pause")
    rows = [
        [toggle],
        [_button("💸 Big limit", "al:menu_big"), _button("⚠️ Low limit", "al:menu_low")],
        [_button("🔌 Unlink", "al:unlink")],
    ]
    return text, _markup(rows)


def limit_screen(kind: str, s: ChatSettings) -> tuple[str, str]:
    if kind == "big":
        title, current, presets = "💸 Alert on transactions over:", s.big, BIG_PRESETS
    else:
        title, current, presets = "⚠️ Alert when an account is below:", s.low, LOW_PRESETS
    buttons = [
        _button(("✅ " if Decimal(v) == current else "") + _fmt(v), f"al:set_{kind}:{v}") for v in presets
    ]
    rows = [buttons[:2], buttons[2:], [_button("⬅️ Back", "al:home")]]
    text = f"{title}\n\nNow: {_fmt(current)}\nChoose a value, or type /{kind} AMOUNT for your own."
    return text, _markup(rows)


def unlink_screen() -> tuple[str, str]:
    text = "🔌 Unlink this chat?\n\nYou will stop getting alerts. You can link again with a new code."
    return text, _markup([[_button("Yes, unlink", "al:unlink_yes"), _button("Cancel", "al:home")]])


# ---- entry points ---------------------------------------------------------------------------

def send_panel(db: Session, api: TelegramAPI, chat_id: int) -> None:
    if db.get(TelegramLink, chat_id) is None:
        api.send_message(chat_id, NOT_LINKED)
        return
    text, markup = home_screen(get_settings(db, chat_id))
    api.send_message(chat_id, text, markup)


def set_limit_from_command(db: Session, chat_id: int, kind: str, arg: str) -> str:
    """Handle "/big 75000" and "/low 15000". Returns the reply text."""
    if db.get(TelegramLink, chat_id) is None:
        return NOT_LINKED
    s = get_settings(db, chat_id)
    if not arg.strip():
        current = s.big if kind == "big" else s.low
        return f"Now: {_fmt(current)}. To change it: /{kind} 75000"
    amount = parse_amount(arg)
    if amount is None:
        return f"Please send a whole number in tenge, for example: /{kind} 75000"
    (set_big if kind == "big" else set_low)(db, chat_id, amount)
    label = "Big transaction alert" if kind == "big" else "Low balance alert"
    return f"✅ {label} level: {_fmt(amount)}. Open /alerts to see all settings."


def handle_callback(db: Session, api: TelegramAPI, callback: dict) -> None:
    try:
        api.answer_callback_query(callback["id"])  # stops the button's loading spinner
    except TelegramError as exc:
        log.debug("%s", exc)
    message = callback.get("message")
    if not message:
        return
    chat_id, message_id = message["chat"]["id"], message["message_id"]
    data = callback.get("data", "").removeprefix("al:")

    link = db.get(TelegramLink, chat_id)
    if link is None:
        screen = (NOT_LINKED, None)
    else:
        if data == "pause":
            set_paused(db, chat_id, True)
        elif data == "resume":
            set_paused(db, chat_id, False)
        elif data.startswith("set_big:") or data.startswith("set_low:"):
            kind, _, raw = data.partition(":")
            amount = parse_amount(raw)
            if amount is not None:
                (set_big if kind == "set_big" else set_low)(db, chat_id, amount)

        s = get_settings(db, chat_id)
        if data == "menu_big" or data.startswith("set_big:"):
            screen = limit_screen("big", s)
        elif data == "menu_low" or data.startswith("set_low:"):
            screen = limit_screen("low", s)
        elif data == "unlink":
            screen = unlink_screen()
        elif data == "unlink_yes":
            screen = (unlink_chat(db, chat_id), None)
        else:  # "home", "pause", "resume" and anything unknown
            screen = home_screen(s)

    try:
        api.edit_message_text(chat_id, message_id, screen[0], screen[1])
    except TelegramError as exc:
        # "message is not modified" when the same button is pressed twice: harmless.
        log.debug("%s", exc)
