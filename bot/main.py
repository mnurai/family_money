"""Run the bot:  python -m bot.main

One loop: read Telegram commands (long polling) and, every CHECK_INTERVAL_SECONDS,
run the alert checks. No webhook and no public server needed.
"""
import logging
import time

from sqlalchemy.orm import Session

from bot import config
from bot.alerts import run_checks
from bot.db import make_session_factory
from bot.linking import link_chat, unlink_chat
from bot.telegram_api import TelegramAPI, TelegramError

log = logging.getLogger("fbt.bot")

HELP = (
    "Family Budget Tracker alerts\n\n"
    "/link CODE - link this chat to your family (get the code from the family Owner)\n"
    "/stop - unlink this chat\n"
    "/help - this message\n\n"
    "I tell you when a transaction is larger than {big} ₸ and when an account is running low "
    "(below {low} ₸)."
)


def handle_message(db: Session, api: TelegramAPI, message: dict) -> None:
    chat_id = message["chat"]["id"]
    text = (message.get("text") or "").strip()
    if not text.startswith("/"):
        return
    command, _, arg = text.partition(" ")
    command = command.split("@")[0].lower()  # "/link@MyBot" in group chats
    if command in ("/start", "/help"):
        reply = HELP.format(big=f"{config.BIG_TX_THRESHOLD:,.0f}".replace(",", " "),
                            low=f"{config.LOW_BALANCE_THRESHOLD:,.0f}".replace(",", " "))
    elif command == "/link":
        reply = link_chat(db, chat_id, arg) if arg.strip() else "Usage: /link CODE"
    elif command == "/stop":
        reply = unlink_chat(db, chat_id)
    else:
        return
    api.send_message(chat_id, reply)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    api = TelegramAPI(config.bot_token())
    Session = make_session_factory(config.DATABASE_URL)
    offset, next_check = 0, 0.0
    log.info("Bot started. Big transaction > %s, low balance < %s", config.BIG_TX_THRESHOLD, config.LOW_BALANCE_THRESHOLD)
    while True:
        try:
            for update in api.get_updates(offset):
                offset = update["update_id"] + 1
                if "message" in update:
                    with Session() as db:
                        handle_message(db, api, update["message"])
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
