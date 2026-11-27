"""The main menu in a private chat: TRANSFER, CHECK BALANCE, AUTHORIZE, INFO.

Every screen is produced by render(db, telegram_user_id, "m:...") and returns (text, buttons).
Buttons carry a short code ("m:tf_to:22:23"), so no conversation state is stored.
Money screens work only in a private chat: in a group everybody would read the message.
"""
import json
import logging
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.services.transactions import format_money
from bot.actions import balances_text, can_transfer, do_transfer, members_text, visible_accounts
from bot.activity import log_activity
from bot.people import ROLE_LABEL, Identity, authorize, get_identity, sign_out
from bot.settings import MAX_THRESHOLD, parse_amount
from bot.telegram_api import TelegramAPI, TelegramError

log = logging.getLogger("fbt.bot")

PRIVATE_ONLY = "🔒 For privacy, balances and transfers work only in a private chat with me. Open the bot and send /panel."
NEED_AUTH = "🔐 Please authorize first: press AUTHORIZE and send the code from your family Owner."
AMOUNT_PRESETS = [5_000, 10_000, 20_000, 50_000, 100_000]

# command -> the screen it opens
COMMAND_VIEWS = {"/panel": "m:home", "/menu": "m:home", "/balance": "m:bal", "/info": "m:info", "/logout": "m:out"}
MENU_COMMANDS = set(COMMAND_VIEWS) | {"/authorize", "/transfer"}


def _b(text: str, data: str) -> dict:
    return {"text": text, "callback_data": data}


def _markup(rows: list) -> str:
    return json.dumps({"inline_keyboard": rows})


def _back(data: str = "m:home") -> list:
    return [_b("⬅️ Menu" if data == "m:home" else "⬅️ Back", data)]


def _money(amount) -> str:
    return format_money(Decimal(amount))


# ---- screens ---------------------------------------------------------------------------------

def home_screen(who: Optional[Identity]) -> tuple[str, str]:
    if who:
        status = f"Signed in as {who.name} ({ROLE_LABEL[who.role]})"
    else:
        status = "Not signed in. Press AUTHORIZE to connect your account."
    rows = [
        [_b("💸 TRANSFER", "m:tf"), _b("💰 CHECK BALANCE", "m:bal")],
        [_b("🔐 AUTHORIZE", "m:auth"), _b("ℹ️ INFO", "m:info")],
    ]
    return f"🏠 Family Budget Tracker\n\n{status}", _markup(rows)


def auth_screen(who: Optional[Identity]) -> tuple[str, str]:
    if who:
        text = f"🔐 You are signed in as {who.name} ({ROLE_LABEL[who.role]})."
        rows = [[_b("🔓 Sign out", "m:out")], _back()]
    else:
        text = (
            "🔐 Authorize\n\n"
            "1. Ask the family Owner for a one-time code (valid 15 minutes).\n"
            "2. Send it here:  /authorize CODE"
        )
        rows = [_back()]
    return text, _markup(rows)


def _need_auth() -> tuple[str, str]:
    return NEED_AUTH, _markup([[_b("🔐 AUTHORIZE", "m:auth")], _back()])


def _transfer_screen(db: Session, who: Identity, action: str, args: list[str], ref: Optional[str]) -> tuple[str, str]:
    if not can_transfer(who):
        if action == "tf_go":  # a forged button: refuse it and write it to the log (BR-10)
            try:
                src_id, dst_id, amount = (int(x) for x in args[:3])
                do_transfer(db, who, src_id, dst_id, amount, None)
            except ValueError:
                pass
        return "💸 Transfer\n\nChildren cannot make transfers (BR-10). Ask an adult.", _markup([_back()])
    accounts = {a.account_id: a for a in visible_accounts(db, who)}
    try:
        nums = [int(x) for x in args]
    except ValueError:
        return home_screen(who)
    if any(n not in accounts for n in nums[:2]):
        return "Account not found.", _markup([_back("m:tf")])

    if action == "tf" or not nums:
        rows = [[_b(f"{a.name} · {format_money(a.current_balance)}", f"m:tf_from:{a.account_id}")] for a in accounts.values()]
        return "💸 Transfer\n\nFrom which account?", _markup(rows + [_back()])

    src = accounts[nums[0]]
    if action == "tf_from":
        rows = [[_b(f"{a.name} · {format_money(a.current_balance)}", f"m:tf_to:{src.account_id}:{a.account_id}")]
                for a in accounts.values() if a.account_id != src.account_id]
        return f"💸 From: {src.name}\n\nTo which account?", _markup(rows + [_back("m:tf")])

    if len(nums) < 2 or nums[0] == nums[1]:
        return "Choose two different accounts.", _markup([_back("m:tf")])
    dst = accounts[nums[1]]
    if action == "tf_to":
        buttons = [_b(_money(v), f"m:tf_amt:{src.account_id}:{dst.account_id}:{v}") for v in AMOUNT_PRESETS]
        rows = [buttons[:2], buttons[2:4], buttons[4:], _back(f"m:tf_from:{src.account_id}")]
        text = (f"💸 {src.name} → {dst.name}\n\nHow much?\n"
                f"Other amount: /transfer {src.account_id} {dst.account_id} 75000")
        return text, _markup(rows)

    if len(nums) < 3 or not 1 <= nums[2] <= MAX_THRESHOLD:
        return "Please send a whole amount in tenge.", _markup([_back("m:tf")])
    amount = nums[2]
    if action == "tf_amt":
        text = f"💸 Confirm transfer\n\n{_money(amount)}\nfrom {src.name}\nto {dst.name}"
        rows = [[_b("✅ Confirm", f"m:tf_go:{src.account_id}:{dst.account_id}:{amount}"), _b("❌ Cancel", "m:home")]]
        return text, _markup(rows)

    # tf_go: do it
    done, message = do_transfer(db, who, src.account_id, dst.account_id, amount, f"tf:{ref}" if ref else None)
    return message, _markup([_back()])


def render(db: Session, telegram_user_id: int, data: str, ref: Optional[str] = None) -> tuple[str, str]:
    """Turn a button code into a screen. Also records what the person did for the website feed."""
    parts = data.split(":")
    action, args = (parts[1] if len(parts) > 1 else "home"), parts[2:]
    who = get_identity(db, telegram_user_id)

    if action == "home":
        return home_screen(who)
    if action == "auth":
        return auth_screen(who)
    if who is None:
        return _need_auth()
    if action == "out":
        sign_out(db, telegram_user_id)
        log_activity(db, who.family_id, "SIGN_OUT", "Signed out of Telegram", identity=who)
        return "Signed out. Press AUTHORIZE to sign in again.", _markup([[_b("🔐 AUTHORIZE", "m:auth")]])
    if action == "bal":
        log_activity(db, who.family_id, "BALANCE", "Checked balances", identity=who)
        return balances_text(db, who), _markup([_back()])
    if action == "info":
        log_activity(db, who.family_id, "INFO", "Viewed family members", identity=who)
        return members_text(db, who), _markup([_back()])
    if action.startswith("tf"):
        return _transfer_screen(db, who, action, args, ref)
    return home_screen(who)


# ---- entry points ----------------------------------------------------------------------------

def handle_callback(db: Session, api: TelegramAPI, callback: dict) -> None:
    try:
        api.answer_callback_query(callback["id"])
    except TelegramError as exc:
        log.debug("%s", exc)
    message = callback.get("message")
    if not message:
        return
    chat, message_id = message["chat"], message["message_id"]
    if chat.get("type") != "private":
        text, markup = PRIVATE_ONLY, None
    else:
        text, markup = render(db, callback["from"]["id"], callback.get("data", ""), ref=f"{chat['id']}:{message_id}")
    try:
        api.edit_message_text(chat["id"], message_id, text, markup)
    except TelegramError as exc:
        log.debug("%s", exc)  # "message is not modified" when the same button is pressed twice


def handle_command(db: Session, api: TelegramAPI, message: dict, command: str, arg: str) -> bool:
    """Run a menu command. Returns False if it is not one of ours."""
    if command not in MENU_COMMANDS:
        return False
    chat = message["chat"]
    if chat.get("type") != "private":
        api.send_message(chat["id"], PRIVATE_ONLY)
        return True
    user_id = (message.get("from") or {}).get("id", chat["id"])

    if command == "/authorize":
        if not arg.strip():
            api.send_message(chat["id"], "Usage: /authorize CODE")
            return True
        who, reply = authorize(db, user_id, arg.strip())
        api.send_message(chat["id"], reply)
        if who:
            log_activity(db, who.family_id, "AUTHORIZE", "Signed in with Telegram", identity=who)
            text, markup = home_screen(who)
            api.send_message(chat["id"], text, markup)
        return True

    if command == "/transfer":
        nums = arg.split()
        amount = parse_amount(nums[2]) if len(nums) == 3 else None
        if len(nums) == 3 and nums[0].isdigit() and nums[1].isdigit() and amount:
            view = f"m:tf_amt:{nums[0]}:{nums[1]}:{amount}"
        else:
            view = "m:tf"
            if arg.strip():
                api.send_message(chat["id"], "Usage: /transfer FROM_ID TO_ID AMOUNT, for example /transfer 22 23 75000")
                return True
    else:
        view = COMMAND_VIEWS[command]

    text, markup = render(db, user_id, view)
    api.send_message(chat["id"], text, markup)
    return True
