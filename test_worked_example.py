"""First automated test: the worked example of doc 06 (balances, budgets, reports).

Every step is checked against the table in doc 06 / doc 11 §9.
Markers `tc(...)` link tests to the traceability matrix (see scripts/update_traceability.py).
"""
import random
from decimal import Decimal as D

import pytest

from reference_fbt import ValidationError

M = "2026-11"

# (action, args, kaspi, cash, savings, total, income, expenses, food %, notifications)
STEPS = [
    ("income",   (350000, "Kaspi card", "Salary", "2026-11-01"),        550000, 10000,      0, 560000, 350000,     0,  0,  []),
    ("transfer", (20000, "Kaspi card", "Cash", "2026-11-02"),           530000, 30000,      0, 560000, 350000,     0,  0,  []),
    ("expense",  (45000, "Kaspi card", "Food", "2026-11-03"),           485000, 30000,      0, 515000, 350000, 45000, 75,  []),
    ("expense",  (5000, "Cash", "Food", "2026-11-04"),                  485000, 25000,      0, 510000, 350000, 50000, 83,  ["BUDGET_80"]),
    ("transfer", (100000, "Kaspi card", "Savings", "2026-11-05"),       385000, 25000, 100000, 510000, 350000, 50000, 83,  ["BUDGET_80"]),
]


def apply(f, action, args):
    getattr(f, "add_" + action)(*[str(a) if isinstance(a, int) else a for a in args])


def check_state(f, kaspi, cash, savings, total, income, expenses, pct, notes):
    assert f.balance("Kaspi card") == kaspi
    assert f.balance("Cash") == cash
    assert f.balance("Savings") == savings
    assert f.family_total() == total                       # BR-13
    s = f.summary(M)
    assert (s["income"], s["expenses"], s["net"]) == (income, expenses, income - expenses)  # BR-12
    assert round(f.budget("Food", M)["percent"]) == pct    # BR-15
    assert f.notifications() == notes                      # BR-16


@pytest.mark.tc("TC-11.1", "TC-16.1", "TC-17.1", "TC-18.1", "TC-25.1", "TC-26.1", "TC-26.2",
                "TC-30.1", "TC-30.2", "TC-30.3", "TC-30.4", "TC-I05")
def test_br07_worked_example_state_after_every_step(example):
    check_state(example, 200000, 10000, 0, 210000, 0, 0, 0, [])          # step 0
    for action, args, kaspi, cash, sav, total, inc, exp, pct, notes in STEPS:
        apply(example, action, args)
        check_state(example, kaspi, cash, sav, total, inc, exp, pct, notes)


@pytest.mark.tc("TC-25.1")
def test_fr25_budget_after_step_4(example):
    for step in STEPS[:4]:
        apply(example, step[0], step[1])
    b = example.budget("Food", M)
    assert (b["limit"], b["spent"], b["remaining"]) == (D(60000), D(50000), D(10000))


@pytest.mark.tc("TC-17.3")
def test_br08_step_6_is_rejected_and_changes_nothing(example):
    for step in STEPS:
        apply(example, step[0], step[1])
    before = (example.balance("Cash"), example.family_total(), example.summary(M),
              example.budget("Food", M)["spent"], example.notifications(),
              example.transaction_count())
    with pytest.raises(ValidationError, match=r"Not enough money on Cash \(balance 25 000 ₸\)"):
        example.add_expense("30000", "Cash", "Food", "2026-11-05")
    after = (example.balance("Cash"), example.family_total(), example.summary(M),
             example.budget("Food", M)["spent"], example.notifications(),
             example.transaction_count())
    assert before == after


@pytest.mark.tc("TC-18.1", "TC-30.2", "TC-31.2")
def test_br12_transfers_do_not_change_income_expenses_or_categories(example):
    for step in STEPS:
        apply(example, step[0], step[1])
    assert example.summary(M) == {"income": D(350000), "expenses": D(50000), "net": D(300000)}
    assert example.expenses_by_category(M) == {"Food": D(50000)}   # no transfer slices


@pytest.mark.tc("TC-30.4")
def test_br13_end_of_month_family_total(example):
    for step in STEPS:
        apply(example, step[0], step[1])
    assert example.family_total() == D(210000) + D(350000) - D(50000) == D(510000)
    assert example.summary(M)["net"] == D(300000)


@pytest.mark.tc("TC-26.2")
def test_br16_alert_sent_only_once(example):
    for step in STEPS[:4]:
        apply(example, step[0], step[1])
    example.add_expense("1000", "Cash", "Food", "2026-11-05")      # 85 %, still < 100 %
    assert example.notifications().count("BUDGET_80") == 1
    assert "BUDGET_100" not in example.notifications()


@pytest.mark.tc("TC-26.3")
def test_br16_exceeding_100_percent_sends_one_alert(example):
    for step in STEPS[:4]:
        apply(example, step[0], step[1])
    example.add_expense("10000", "Kaspi card", "Food", "2026-11-05")   # exactly 100 %
    example.add_expense("1000", "Kaspi card", "Food", "2026-11-05")
    assert example.notifications().count("BUDGET_100") == 1


@pytest.mark.tc("TC-25.3", "TC-16.4")
def test_br15_income_and_transfers_never_touch_budgets(example):
    before = example.budget("Food", M)["spent"]
    example.add_income("1000", "Cash", "Gift", "2026-11-01")
    example.add_transfer("500", "Cash", "Kaspi card", "2026-11-01")
    assert example.budget("Food", M)["spent"] == before


@pytest.mark.tc("TC-25.2")
def test_br15_subcategory_counts_towards_parent_budget(example):
    example.add_expense("12000", "Kaspi card", "Restaurants", "2026-11-03")
    assert example.budget("Food", M)["spent"] == D(12000)


@pytest.mark.tc("TC-16.5")
def test_br28_refund_is_income_and_does_not_reduce_budget(example):
    example.add_expense("45000", "Kaspi card", "Food", "2026-11-03")
    example.add_income("7000", "Kaspi card", "Refunds", "2026-11-04")
    assert example.budget("Food", M)["spent"] == D(45000)
    assert example.summary(M)["income"] == D(7000)


@pytest.mark.tc("TC-19.1", "TC-19.2", "TC-18.2", "TC-17.2")
@pytest.mark.parametrize("call", [
    lambda f: f.add_expense("0", "Cash", "Food", "2026-11-01"),                    # BR-02
    lambda f: f.add_expense("-5", "Cash", "Food", "2026-11-01"),                   # BR-02
    lambda f: f.add_expense("0.001", "Cash", "Food", "2026-11-01"),                # BR-02
    lambda f: f.add_expense("1000000000000.00", "Cash", "Food", "2026-11-01"),     # BR-02
    lambda f: f.add_expense("100", "Cash", "Salary", "2026-11-01"),                # BR-04
    lambda f: f.add_income("100", "Cash", "Food", "2026-11-01"),                   # BR-03
    lambda f: f.add_transfer("100", "Cash", "Cash", "2026-11-01"),                 # BR-05
    lambda f: f.add_expense("100", "Cash", "Food", "2026-12-01"),                  # BR-09
])
def test_validation_rules_reject_invalid_transactions(example, call):
    with pytest.raises(ValidationError):
        call(example)
    assert example.transaction_count() == 0


@pytest.mark.tc("TC-19.1")
def test_br02_amount_limits_accepted(example):
    example.add_income("0.01", "Cash", "Gift", "2026-11-01")
    example.add_income("999999999999.99", "Cash", "Gift", "2026-11-01")


@pytest.mark.tc("TC-17.4", "TC-17.5")
def test_br08_exact_balance_and_credit_limit(fbt):
    fbt.create_account("Cash", "CASH", "3000")
    fbt.add_expense("3000", "Cash", "Food", "2026-11-01")                 # exactly the balance
    assert fbt.balance("Cash") == 0
    fbt.create_account("Credit", "CREDIT_CARD", "0", credit_limit="100000")
    fbt.add_expense("100000", "Credit", "Food", "2026-11-01")
    assert fbt.balance("Credit") == -100000
    with pytest.raises(ValidationError):
        fbt.add_expense("0.01", "Credit", "Food", "2026-11-01")


@pytest.mark.tc("TC-N08")
def test_nfr08_no_floating_point_errors(fbt):
    fbt.create_account("Cash", "CASH", "0")
    for _ in range(1000):
        fbt.add_income("0.10", "Cash", "Gift", "2026-11-01")
        fbt.add_income("0.20", "Cash", "Gift", "2026-11-01")
    assert fbt.balance("Cash") == D("300.00")


@pytest.mark.tc("TC-30.2")
def test_br12_property_random_transfers_never_change_reports(example):
    """doc 11 §6.2: random transfers leave every report number unchanged."""
    for step in STEPS[:4]:
        apply(example, step[0], step[1])
    names = ["Kaspi card", "Cash", "Savings"]
    snap = lambda: (example.summary(M), example.expenses_by_category(M),
                    example.budget("Food", M), example.family_total(), example.notifications())
    before = snap()
    rnd = random.Random(42)
    for _ in range(200):
        a, b = rnd.sample(names, 2)
        try:
            example.add_transfer(str(rnd.randint(1, 20000)), a, b, "2026-11-05")
        except ValidationError:
            pass                                              # BR-08 may reject; that is fine
    assert snap() == before


@pytest.mark.tc("TC-11.5")
def test_balances_equal_independent_recomputation(example):
    """Oracle: recompute every balance from raw transactions (BR-07) and compare."""
    rnd = random.Random(7)
    example.add_income("500000", "Kaspi card", "Salary", "2026-11-01")
    names = ["Kaspi card", "Cash", "Savings"]
    for _ in range(300):
        kind = rnd.choice(["income", "expense", "transfer"])
        amt = str(rnd.randint(1, 30000))
        try:
            if kind == "income":
                example.add_income(amt, rnd.choice(names), "Gift", "2026-11-02")
            elif kind == "expense":
                example.add_expense(amt, rnd.choice(names), "Transport", "2026-11-02")
            else:
                a, b = rnd.sample(names, 2)
                example.add_transfer(amt, a, b, "2026-11-02")
        except ValidationError:
            pass
    for n in names:
        a = example.accounts[n]
        expect = a.opening
        for t in example.txs:
            expect += (t.amount if t.dst == n else 0) - (t.amount if t.src == n else 0)
        assert example.balance(n) == expect
        assert example.balance(n) >= 0
