"""What a signed-in member can do from the bot: check balances, list members, transfer money.

Every rule lives in the existing code: app/services/permissions.py (who may do what) and
app/services/transactions.py (record_transaction checks BR-02, BR-05, BR-08, BR-10, NFR-03).
The bot never changes a balance itself.
"""
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, AccountAccess, FamilyMember
from app.services.permissions import can
from app.services.transactions import format_money, record_transaction
from bot.activity import already_done, log_activity
from bot.models import TelegramUser
from bot.people import ROLE_LABEL, Identity, display_name


def visible_accounts(db: Session, who: Identity) -> list[Account]:
    """Owner and Adult: all accounts of the family. Child: only accounts shared with them (BR-10)."""
    query = select(Account).where(Account.family_id == who.family_id, Account.is_archived.is_(False))  # NFR-03
    if who.role == "CHILD":
        query = query.where(Account.account_id.in_(select(AccountAccess.account_id).where(AccountAccess.member_id == who.member_id)))
    return list(db.scalars(query.order_by(Account.account_id)))


def balances_text(db: Session, who: Identity) -> str:
    accounts = visible_accounts(db, who)
    if not accounts:
        return "💰 Balances\n\nNo accounts to show."
    # No family total here: it is never shown to a child (BR-13) and not needed for a quick check.
    return "💰 Balances\n\n" + "\n".join(f"• {a.name}: {format_money(a.current_balance)}" for a in accounts)


def members_text(db: Session, who: Identity) -> str:
    members = list(
        db.scalars(
            select(FamilyMember)
            .where(FamilyMember.family_id == who.family_id, FamilyMember.removed_at.is_(None))  # NFR-03
            .order_by(FamilyMember.member_id)
        )
    )
    connected = set()
    if who.role == "OWNER":  # only the Owner sees who uses Telegram
        connected = set(db.scalars(select(TelegramUser.member_id).where(TelegramUser.member_id.in_([m.member_id for m in members]))))
    lines = []
    for m in members:
        line = f"• {display_name(db, m)} — {ROLE_LABEL[m.role]}"
        if m.member_id == who.member_id:
            line += " (you)"
        if m.member_id in connected:
            line += " 📱"
        lines.append(line)
    footer = "\n\n📱 = connected to Telegram" if connected else ""
    return f"ℹ️ Family members ({len(members)})\n\n" + "\n".join(lines) + footer


def can_transfer(who: Identity) -> bool:
    return can(who.role, "record_transfer")  # BR-10: a child cannot record a transfer


def _account_name(db: Session, who: Identity, account_id: int) -> str:
    account = db.get(Account, account_id)
    return account.name if account and account.family_id == who.family_id else f"account {account_id}"


def do_transfer(db: Session, who: Identity, source_id: int, dest_id: int, amount: int, dedupe_key: str | None) -> tuple[bool, str]:
    """Move money between two accounts of the family. Returns (done, message for the user)."""
    src, dst = _account_name(db, who, source_id), _account_name(db, who, dest_id)
    label = f"{format_money(Decimal(amount))} from {src} to {dst}"
    if not can_transfer(who):
        log_activity(db, who.family_id, "TRANSFER_FAILED", f"Refused: children cannot transfer ({label})", identity=who)
        return False, "❌ Children cannot make transfers. Ask an adult."
    if dedupe_key and already_done(db, dedupe_key):
        return False, "This transfer was already made."
    try:
        tx = record_transaction(
            db, who.family_id, who.user_id, who.member_id, who.role,
            "TRANSFER", Decimal(amount), source_id, dest_id, None, date.today(), "Via Telegram",
        )
    except HTTPException as exc:  # the service's own rule messages (BR-02, BR-05, BR-08, NFR-03)
        log_activity(db, who.family_id, "TRANSFER_FAILED", f"Refused: {exc.detail} ({label})", identity=who)
        return False, f"❌ {exc.detail}"
    log_activity(db, who.family_id, "TRANSFER", f"Transferred {label}", identity=who, transaction_id=tx.transaction_id, dedupe_key=dedupe_key)
    s, d = db.get(Account, source_id), db.get(Account, dest_id)
    return True, (
        f"✅ Transferred {format_money(Decimal(amount))}\n"
        f"{s.name}: {format_money(s.current_balance)}\n"
        f"{d.name}: {format_money(d.current_balance)}"
    )
