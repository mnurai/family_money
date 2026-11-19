"""Local demo data so you can see the alerts without the rest of the app.

  python -m bot.demo        create family 1 with a card (300 000 ₸) and cash (20 000 ₸)
  python -m bot.demo big    record a 60 000 ₸ expense   -> big-transaction alert
  python -m bot.demo low    spend 15 000 ₸ of the cash  -> low-balance alert

Works with the default SQLite database (DATABASE_URL=sqlite:///fbt_bot.db).
"""
import sys
from datetime import date
from decimal import Decimal

from app.models import Account, Category, FamilyMember
from app.services.transactions import record_transaction
from bot import config
from bot.db import make_session_factory


def seed(db) -> None:
    if db.get(Account, 1):
        print("Demo data already exists.")
        return
    db.add_all([
        FamilyMember(member_id=1, family_id=1, user_id=1, role="OWNER"),
        Account(account_id=1, family_id=1, name="Kaspi card", type="BANK_CARD",
                opening_balance=Decimal("300000"), current_balance=Decimal("300000")),
        Account(account_id=2, family_id=1, name="Cash", type="CASH",
                opening_balance=Decimal("20000"), current_balance=Decimal("20000")),
        Category(category_id=1, family_id=None, name="Housing & utilities", type="EXPENSE"),
    ])
    db.commit()
    print("Created family 1: Kaspi card 300 000 ₸, Cash 20 000 ₸.")


def spend(db, amount: str, account_id: int) -> None:
    record_transaction(db, 1, 1, 1, "OWNER", "EXPENSE", Decimal(amount), account_id, None, 1, date.today(), "demo")
    print(f"Recorded expense {amount} ₸. The bot alerts within {config.CHECK_INTERVAL_SECONDS} s.")


def main() -> None:
    Session = make_session_factory(config.DATABASE_URL)
    with Session() as db:
        action = sys.argv[1] if len(sys.argv) > 1 else "seed"
        if action == "seed":
            seed(db)
        elif action == "big":
            spend(db, "60000", 1)
        elif action == "low":
            spend(db, "15000", 2)
        else:
            raise SystemExit("usage: python -m bot.demo [seed|big|low]")


if __name__ == "__main__":
    main()
