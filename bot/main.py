"""Run the bot:  python -m bot.main

One loop: read Telegram messages and button presses (long polling) and, every
CHECK_INTERVAL_SECONDS, run the alert checks. No webhook and no public server needed.
"""
import logging
import time

from sqlalchemy.orm import Session

from bot import config, menu
from bot.alerts import run_checks
from bot.db import make_session_factory
from bot.linking import link_chat, unlink_chat
from bot.panel import handle_callback as handle_alert_callback
from bot.panel import send_panel, set_limit_from_command
from bot.telegram_api import TelegramAPI, TelegramError

log = logging.getLogger("fbt.bot")

HELP = (
    "Family Budget Tracker\n\n"
    "In a private chat with me:\n"
    "/panel - menu: TRANSFER, CHECK BALANCE, AUTHORIZE, INFO\n"
    "/authorize CODE - sign in as a family member\n"
    "/balance, /info, /logout\n"
    "/transfer FROM TO AMOUNT - e.g. /transfer 22 23 75000\n\n"
    "Alerts (a linked family chat gets them):\n"
    "/link CODE - link a chat to your family (code from the Owner)\n"
    "/alerts - pause, set limits (now: big over {big} ₸, low under {low} ₸)\n"
    "/big AMOUNT, /low AMOUNT, /stop"
)

COMMANDS = [
    ("panel", "Menu: transfer, balance, authorize, info"),
    ("authorize", "Sign in: /authorize CODE"),
    ("balance", "Check balance"),
    ("transfer", "Transfer between accounts"),
    ("info", "Family members"),
    ("logout", "Sign out"),
    ("alerts", "Alert settings"),
    ("link", "Link this chat for alerts: /link CODE"),
    ("help", "Help"),
]


def _help_text() -> str:
    spaced = lambda v: f"{v:,.0f}".replace(",", " ")
    return HELP.format(big=spaced(config.BIG_TX_THRESHOLD), low=spaced(config.LOW_BALANCE_THRESHOLD))


def handle_message(db: Session, api: TelegramAPI, message: dict) -> None:
    chat_id = message["chat"]["id"]
    text = (message.get("text") or "").strip()
    if not text.startswith("/"):
        return
    command, _, arg = text.partition(" ")
    command = command.split("@")[0].lower()  # "/link@MyBot" in group chats

    if command == "/start":
        if message["chat"].get("type") == "private":
            command = "/panel"
        else:
            api.send_message(chat_id, _help_text())
            return
    if menu.handle_command(db, api, message, command, arg):
        return

    if command == "/help":
        reply = _help_text()
    elif command in ("/alerts", "/settings"):
        send_panel(db, api, chat_id)
        return
    elif command in ("/big", "/low"):
        reply = set_limit_from_command(db, chat_id, command[1:], arg)
    elif command == "/link":
        if not arg.strip():
            reply = "Usage: /link CODE"
        else:
            reply = link_chat(db, chat_id, arg)
            if reply.startswith("Linked"):
                api.send_message(chat_id, reply)
                send_panel(db, api, chat_id)
                return
    elif command == "/stop":
        reply = unlink_chat(db, chat_id)
    else:
        return
    api.send_message(chat_id, reply)


def handle_callback(db: Session, api: TelegramAPI, callback: dict) -> None:
    if callback.get("data", "").startswith("m:"):
        menu.handle_callback(db, api, callback)
    else:
        handle_alert_callback(db, api, callback)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    api = TelegramAPI(config.bot_token())
    Session = make_session_factory(config.DATABASE_URL)
    try:
        api.set_my_commands(COMMANDS)  # the "Menu" button in the chat
    except TelegramError as exc:
        log.warning("could not set the command menu: %s", exc)
    offset, next_check = 0, 0.0
    log.info("Bot started. Big transaction > %s, low balance < %s", config.BIG_TX_THRESHOLD, config.LOW_BALANCE_THRESHOLD)
    while True:
        try:
            for update in api.get_updates(offset):
                offset = update["update_id"] + 1
                try:
                    with Session() as db:
                        if "message" in update:
                            handle_message(db, api, update["message"])
                        elif "callback_query" in update:
                            handle_callback(db, api, update["callback_query"])
                except TelegramError as exc:
                    log.warning("%s", exc)
                except Exception:
                    log.exception("could not handle an update")
            if time.monotonic() >= next_check:
                with Session() as db:
                    run_checks(db, api.send_message)
                next_check = time.monotonic() + config.CHECK_INTERVAL_SECONDS
        except TelegramError as exc:
            log.warning("%s", exc)
            time.sleep(5)
        except Exception:  # keep the bot alive; the traceback has no token
            log.exception("unexpected error")
            time.sleep(5)


if __name__ == "__main__":
    main()
