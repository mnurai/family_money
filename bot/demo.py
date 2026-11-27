"""Local demo data that matches the website's demo (Seitkali family), so bot and website agree.

  python -m bot.demo          create the family, members, accounts (SQLite)
  python -m bot.demo codes    print one-time sign-in codes for Aigerim (Owner), Daulet (Adult), Aidar (Child)
  python -m bot.demo big      record a 60 000 ₸ expense from Kaspi card -> big-transaction alert
  python -m bot.demo low      spend 7 000 ₸ of Cash                      -> low-balance alert

The ids are the ones the website's "Reset demo" produces (family 5, members 6-8, accounts 22-26).
They matter because the website's Telegram page asks the bridge for the logged-in family's id.
Balances are the website's balances after its example transactions.
"""
import sys
from datetime import date
from decimal import Decimal

from app.models import Account, AccountAccess, Category, FamilyMember
from app.services.transactions import record_transaction
from bot import config
from bot.db import make_session_factory
from bot.models import BotUserProfile
from bot.people import create_member_code

FAMILY = 5
OWNER, ADULT, CHILD = 6, 7, 8  # member ids
KASPI, CASH, SAVINGS, POCKET, CREDIT = 22, 23, 24, 25, 26
TRANSPORT, HOUSING = 15, 16  # category ids


def seed(db) -> bool:
    if db.get(FamilyMember, 1) is not None:
        print("An older demo database was found. Delete fbt_bot.db and run again (it holds demo data only).")
        return False
    if db.get(Account, KASPI) is not None:
        print("Demo data already exists.")
        return True
    D = Decimal
    db.add_all([
        BotUserProfile(user_id=1, name="Aigerim Seitkali"),
        BotUserProfile(user_id=2, name="Daulet Seitkali"),
        BotUserProfile(user_id=3, name="Aidar Seitkali"),
        FamilyMember(member_id=OWNER, family_id=FAMILY, user_id=1, role="OWNER"),
        FamilyMember(member_id=ADULT, family_id=FAMILY, user_id=2, role="ADULT"),
        FamilyMember(member_id=CHILD, family_id=FAMILY, user_id=3, role="CHILD"),
    ])
    categories = [
        (9, "Salary", "INCOME"), (10, "Scholarship", "INCOME"), (11, "Gift", "INCOME"), (12, "Refunds", "INCOME"),
        (13, "Other income", "INCOME"), (14, "Food", "EXPENSE"), (15, "Transport", "EXPENSE"),
        (16, "Housing & utilities", "EXPENSE"), (17, "Health", "EXPENSE"), (18, "Education", "EXPENSE"),
        (19, "Entertainment", "EXPENSE"), (20, "Clothing", "EXPENSE"), (21, "Other expense", "EXPENSE"),
    ]
    db.add_all([Category(category_id=i, family_id=None, name=n, type=t) for i, n, t in categories])
    db.flush()
    # (id, name, type, opening, balance now, credit limit)
    accounts = [
        (KASPI, "Kaspi card", "BANK_CARD", D(150000), D(241000), None),
        (CASH, "Cash", "CASH", D(10000), D(15500), None),
        (SAVINGS, "Savings", "SAVINGS", D(0), D(200000), None),
        (POCKET, "Aidar — pocket money", "CASH", D(0), D(12500), None),
        (CREDIT, "Halyk credit card", "CREDIT_CARD", D(0), D(-32000), D(300000)),
    ]
    db.add_all([
        Account(account_id=i, family_id=FAMILY, name=n, type=t, opening_balance=o, current_balance=c, credit_limit=limit)
        for i, n, t, o, c, limit in accounts
    ])
    db.flush()
    db.add(AccountAccess(account_id=POCKET, member_id=CHILD))  # shared with Aidar (BR-10)
    db.commit()
    print("Created the Seitkali family (id 5): Kaspi card, Cash, Savings, Aidar's pocket money, credit card.")
    return True


def spend(db, amount: str, account_id: int, category_id: int, member_id: int, user_id: int, role: str) -> None:
    record_transaction(db, FAMILY, user_id, member_id, role, "EXPENSE", Decimal(amount), account_id, None,
                       category_id, date.today(), "demo")
    print(f"Recorded expense {amount} ₸. The bot alerts within {config.CHECK_INTERVAL_SECONDS} s.")


def main() -> None:
    Session = make_session_factory(config.DATABASE_URL)
    action = sys.argv[1] if len(sys.argv) > 1 else "seed"
    with Session() as db:
        if not seed(db):
            return
        if action == "seed":
            pass
        elif action == "codes":
            for label, member_id in (("Aigerim (Owner)", OWNER), ("Daulet (Adult)", ADULT), ("Aidar (Child)", CHILD)):
                print(f"{label}: /authorize {create_member_code(db, member_id)}")
        elif action == "big":
            spend(db, "60000", KASPI, HOUSING, OWNER, 1, "OWNER")
        elif action == "low":
            spend(db, "7000", CASH, TRANSPORT, ADULT, 2, "ADULT")
        else:
            raise SystemExit("usage: python -m bot.demo [seed|codes|big|low]")


if __name__ == "__main__":
    main()
