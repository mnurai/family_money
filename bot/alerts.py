"""Alert rules: big transactions and low balances.

Pure service code: the message is sent through a `send(chat_id, text)` function, so the
logic is testable without Telegram.
"""
import logging
from decimal import Decimal
from typing import Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Account, Category, Transaction
from app.services.transactions import format_money
from bot.config import BIG_TX_THRESHOLD, LOW_BALANCE_THRESHOLD
from bot.activity import log_activity
from bot.models import LowBalanceAlert, TelegramLink
from bot.settings import get_settings
from bot.telegram_api import TelegramError

log = logging.getLogger("fbt.bot")

# Credit cards are skipped: their balance is normally negative (BR-08).
# Savings are skipped: a small savings balance is not an emergency.
LOW_BALANCE_ACCOUNT_TYPES = ("CASH", "BANK_CARD")

TYPE_LABEL = {"INCOME": "Income", "EXPENSE": "Expense", "TRANSFER": "Transfer"}
TYPE_ICON = {"INCOME": "💰", "EXPENSE": "💸", "TRANSFER": "🔁"}

Send = Callable[[int, str], None]


def current_max_tx_id(db: Session, family_id: int) -> int:
    return db.scalar(select(func.max(Transaction.transaction_id)).where(Transaction.family_id == family_id)) or 0


def big_transaction_text(db: Session, tx: Transaction) -> str:
    def acc_name(account_id):
        return db.get(Account, account_id).name if account_id else None

    lines = [
        f"{TYPE_ICON[tx.type]} Big transaction: {format_money(tx.amount)}",
        f"Type: {TYPE_LABEL[tx.type]}",
    ]
    if tx.type == "TRANSFER":
        lines.append(f"From {acc_name(tx.source_account_id)} to {acc_name(tx.destination_account_id)}")
        lines.append("(a transfer between your own accounts, not spending)")
    elif tx.type == "EXPENSE":
        lines.append(f"Account: {acc_name(tx.source_account_id)}")
    else:
        lines.append(f"Account: {acc_name(tx.destination_account_id)}")
    if tx.category_id:
        category = db.get(Category, tx.category_id)
        lines.append(f"Category: {category.name if category else '—'}")
    if tx.description:
        lines.append(f"Note: {tx.description}")
    lines.append(f"Date: {tx.transaction_date.isoformat()}")
    return "\n".join(lines)


def low_balance_text(account: Account, threshold: Decimal) -> str:
    return (
        f"⚠️ Low balance on {account.name}: {format_money(account.current_balance)}\n"
        f"Alert level: {format_money(threshold)}"
    )


def check_big_transactions(db: Session, link: TelegramLink, send: Send, threshold: Decimal = BIG_TX_THRESHOLD) -> int:
    """Send an alert for each new transaction above the threshold. Returns how many were sent."""
    txs = db.scalars(
        select(Transaction)
        .where(
            Transaction.family_id == link.family_id,  # NFR-03
            Transaction.transaction_id > link.last_tx_id,
            Transaction.is_deleted.is_(False),
        )
        .order_by(Transaction.transaction_id)
    ).all()
    sent = 0
    for tx in txs:
        if tx.amount > threshold:
            try:
                send(link.chat_id, big_transaction_text(db, tx))
            except TelegramError as exc:
                log.warning("big-tx alert not sent, will retry: %s", exc)
                break  # keep the cursor here so it is retried next round
            sent += 1
            log_activity(db, link.family_id, "ALERT_BIG", f"Alert sent: {TYPE_LABEL[tx.type].lower()} of {format_money(tx.amount)}", transaction_id=tx.transaction_id)
        link.last_tx_id = tx.transaction_id
    db.commit()
    return sent


def check_low_balances(db: Session, link: TelegramLink, send: Send, threshold: Decimal = LOW_BALANCE_THRESHOLD) -> int:
    """Alert once when an account drops below the threshold; re-arm when it recovers."""
    accounts = db.scalars(
        select(Account).where(
            Account.family_id == link.family_id,  # NFR-03
            Account.is_archived.is_(False),
            Account.type.in_(LOW_BALANCE_ACCOUNT_TYPES),
        )
    ).all()
    sent = 0
    for account in accounts:
        alert = db.get(LowBalanceAlert, account.account_id)
        if account.current_balance < threshold:
            if alert is None:
                try:
                    send(link.chat_id, low_balance_text(account, threshold))
                except TelegramError as exc:
                    log.warning("low-balance alert not sent, will retry: %s", exc)
                    continue
                db.add(LowBalanceAlert(account_id=account.account_id))
                sent += 1
                log_activity(db, link.family_id, "ALERT_LOW", f"Alert sent: low balance on {account.name} ({format_money(account.current_balance)})")
        elif alert is not None:
            db.delete(alert)
    db.commit()
    return sent


def run_checks(db: Session, send: Send) -> None:
    for link in db.scalars(select(TelegramLink)).all():
        settings = get_settings(db, link.chat_id)
        if settings.paused:
            # Skip transactions made while paused, so resuming does not send a burst of old alerts.
            link.last_tx_id = current_max_tx_id(db, link.family_id)
            db.commit()
            continue
        check_big_transactions(db, link, send, settings.big)
        check_low_balances(db, link, send, settings.low)
