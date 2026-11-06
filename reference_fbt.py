"""In-memory reference model of the business rules (doc 06).

Interface used by the tests (all amounts are strings/Decimal, month = 'YYYY-MM'):
  create_account(name, type, opening, credit_limit=None)
  set_budget(category, month, limit)
  add_income(amount, to, category, date, member='Aigerim')
  add_expense(amount, frm, category, date, member='Aigerim')
  add_transfer(amount, frm, to, date, member='Aigerim')
  balance(account) -> Decimal      family_total() -> Decimal
  summary(month) -> dict(income, expenses, net)
  budget(category, month) -> dict(limit, spent, remaining, percent)
  expenses_by_category(month) -> {category: Decimal}
  notifications() -> [type, ...]   transaction_count() -> int
add_* raise ValidationError(message) when a rule is broken.
"""
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from datetime import date as _date

TODAY = _date(2026, 11, 5)
PARENT = {"Restaurants": "Food"}  # subcategory -> parent (BR-15)
EXPENSE_CATS = {"Food", "Transport", "Housing & utilities", "Health", "Education",
                "Entertainment", "Clothing", "Other expense", "Restaurants"}
INCOME_CATS = {"Salary", "Scholarship", "Gift", "Refunds", "Other income"}


class ValidationError(Exception):
    pass


@dataclass
class Account:
    name: str
    type: str
    opening: Decimal
    credit_limit: Decimal = Decimal(0)
    archived: bool = False


@dataclass
class Tx:
    type: str
    amount: Decimal
    src: str | None
    dst: str | None
    category: str | None
    date: _date
    member: str
    deleted: bool = False


@dataclass
class ReferenceFBT:
    accounts: dict = field(default_factory=dict)
    txs: list = field(default_factory=list)
    budgets: dict = field(default_factory=dict)       # (cat, month) -> dict
    notes: list = field(default_factory=list)

    # ---- setup
    def create_account(self, name, type, opening, credit_limit=None):
        if name in self.accounts:
            raise ValidationError("An account with this name already exists")
        self.accounts[name] = Account(name, type, Decimal(opening),
                                      Decimal(credit_limit or 0))

    def set_budget(self, category, month, limit):
        if category not in EXPENSE_CATS or Decimal(limit) <= 0:
            raise ValidationError("Budgets are only possible for expense categories, limit > 0")
        if (category, month) in self.budgets:
            raise ValidationError("A budget for this category and month already exists")
        self.budgets[(category, month)] = {"limit": Decimal(limit), "a80": False, "a100": False}

    # ---- balances (BR-07, BR-13)
    def balance(self, account):
        a = self.accounts[account]
        b = a.opening
        for t in self.txs:
            if t.deleted:
                continue
            if t.dst == account:
                b += t.amount
            if t.src == account:
                b -= t.amount
        return b

    def family_total(self):
        return sum((self.balance(n) for n, a in self.accounts.items() if not a.archived),
                   Decimal(0))

    # ---- validation (BR-01..BR-09)
    def _validate(self, type, amount, src, dst, category, date):
        amount = Decimal(amount)
        if amount <= 0 or amount != amount.quantize(Decimal("0.01"), ROUND_HALF_UP) \
                or amount > Decimal("999999999999.99"):
            raise ValidationError("Amount must be greater than 0")
        if date > TODAY:
            raise ValidationError("Date cannot be later than today")
        if type == "INCOME" and (src or not dst or category not in INCOME_CATS):
            raise ValidationError("Income needs a destination account and an income category")
        if type == "EXPENSE" and (dst or not src or category not in EXPENSE_CATS):
            raise ValidationError("Expense needs a source account and an expense category")
        if type == "TRANSFER":
            if category or not src or not dst:
                raise ValidationError("A transfer needs two accounts and no category")
            if src == dst:
                raise ValidationError("Choose two different accounts")
        for n in (src, dst):
            if n and (n not in self.accounts or self.accounts[n].archived):
                raise ValidationError("Unknown or archived account")
        if src:                                           # BR-08
            floor = -self.accounts[src].credit_limit if self.accounts[src].type == "CREDIT_CARD" else 0
            if self.balance(src) - amount < floor:
                raise ValidationError(f"Not enough money on {src} (balance {self.balance(src):,.0f} ₸)".replace(",", " "))
        return amount

    def _save(self, type, amount, src, dst, category, date, member):
        amount = self._validate(type, amount, src, dst, category, date)
        self.txs.append(Tx(type, amount, src, dst, category, date, member))
        if type == "EXPENSE":
            self._check_budget(category, date)

    def add_income(self, amount, to, category, date, member="Aigerim"):
        self._save("INCOME", amount, None, to, category, _date.fromisoformat(date), member)

    def add_expense(self, amount, frm, category, date, member="Aigerim"):
        self._save("EXPENSE", amount, frm, None, category, _date.fromisoformat(date), member)

    def add_transfer(self, amount, frm, to, date, member="Aigerim"):
        self._save("TRANSFER", amount, frm, to, None, _date.fromisoformat(date), member)

    # ---- budgets (BR-14..BR-16)
    def _spent(self, category, month):
        total = Decimal(0)
        for t in self.txs:
            if t.deleted or t.type != "EXPENSE" or t.date.strftime("%Y-%m") != month:
                continue
            if t.category == category or PARENT.get(t.category) == category:
                total += t.amount
        return total

    def budget(self, category, month):
        b = self.budgets[(category, month)]
        spent = self._spent(category, month)
        return {"limit": b["limit"], "spent": spent, "remaining": b["limit"] - spent,
                "percent": (spent / b["limit"] * 100)}

    def _check_budget(self, category, date):
        month = date.strftime("%Y-%m")
        cat = PARENT.get(category, category)
        if (cat, month) not in self.budgets:
            return
        b, pct = self.budgets[(cat, month)], self.budget(cat, month)["percent"]
        if pct >= 80 and not b["a80"]:
            b["a80"] = True
            self.notes.append("BUDGET_80")
        if pct >= 100 and not b["a100"]:
            b["a100"] = True
            self.notes.append("BUDGET_100")

    # ---- reports (BR-12)
    def _month_txs(self, month):
        return [t for t in self.txs if not t.deleted and t.date.strftime("%Y-%m") == month]

    def summary(self, month):
        inc = sum((t.amount for t in self._month_txs(month) if t.type == "INCOME"), Decimal(0))
        exp = sum((t.amount for t in self._month_txs(month) if t.type == "EXPENSE"), Decimal(0))
        return {"income": inc, "expenses": exp, "net": inc - exp}

    def expenses_by_category(self, month):
        out = {}
        for t in self._month_txs(month):
            if t.type == "EXPENSE":
                out[t.category] = out.get(t.category, Decimal(0)) + t.amount
        return out

    def notifications(self):
        return list(self.notes)

    def transaction_count(self):
        return len(self.txs)
