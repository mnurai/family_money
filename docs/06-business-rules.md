# 06 — Business Rules

| | |
|---|---|
| **Document owner** | Nuray Mukhambet — Systems Analysis & Requirements |
| **Version** | 1.2 |
| **Date** | 2026-11-06 |

Business rules are constraints that the system must always respect, no matter which screen or API is used. Each rule should be enforced in the backend (Application & Development), where possible also as a database constraint (Data & Database), and verified by at least one test case (Testing).

**Enforcement column:** `DB` = database constraint, `APP` = application/service logic, `UI` = also checked in the form for better usability.

## 1. Transactions

| ID | Rule | Enforcement |
|---|---|---|
| BR-01 | Every transaction has exactly one type: `INCOME`, `EXPENSE` or `TRANSFER`. | DB (CHECK/ENUM) |
| BR-02 | The amount is always **positive** (> 0), has at most 2 decimal places and is not greater than 999 999 999 999.99. The direction of money is defined by the type and the accounts, never by a minus sign. | DB + UI |
| BR-03 | **INCOME**: destination account is required, source account must be empty, category is required and must be of type `INCOME`. | DB (CHECK) + APP |
| BR-04 | **EXPENSE**: source account is required, destination account must be empty, category is required and must be of type `EXPENSE`. | DB (CHECK) + APP |
| BR-05 | **TRANSFER**: source and destination accounts are both required and must be different; the category must be empty. | DB (CHECK) + APP |
| BR-06 | All accounts and the category used in a transaction must belong to the same family as the transaction and must not be archived. | APP |
| BR-07 | **Account balance** = opening balance + Σ INCOME to the account + Σ TRANSFER into the account − Σ EXPENSE from the account − Σ TRANSFER out of the account. Deleted transactions are not counted. | APP (or DB view) |
| BR-08 | A Cash, Bank card or Savings account may not go below 0 as a result of an expense or transfer. A Credit card account may not go below −(credit limit). | APP |
| BR-09 | The transaction date cannot be later than today. (Future movements are planned with recurring rules instead.) | APP + UI |
| BR-10 | A Child Member can record only `INCOME` and `EXPENSE`, and only on accounts shared with them. A child sees only those accounts and **all** transactions on them, including ones recorded by other members, so that the list adds up to the balance (BR-07). | APP |
| BR-11 | Only the creator of a transaction or the Owner may edit or delete it; Children cannot edit or delete. Every edit is validated again against BR-01 … BR-10. Deletion is soft (`is_deleted = true`). | APP |

## 2. Reports

| ID | Rule | Enforcement |
|---|---|---|
| BR-12 | Report totals: *Total income* = Σ INCOME, *Total expenses* = Σ EXPENSE, *Net result* = income − expenses. **Transfers are never counted** as income or expense. | APP |
| BR-13 | The family total balance is the sum of the balances of all non-archived accounts. Transfers between family accounts do not change it. The family total is shown only to the Owner and Adult Members, never to Child Members (D-2). | APP |

## 3. Budgets

| ID | Rule | Enforcement |
|---|---|---|
| BR-14 | A budget can be set only for an **expense** category, for one calendar month, with a limit > 0. There is at most one budget per category per month per family. | DB (UNIQUE) + APP |
| BR-15 | Amount spent for a budget = Σ of non-deleted `EXPENSE` transactions in that category **and its subcategories** with a date inside that month. INCOME and TRANSFER never affect budgets. | APP |
| BR-16 | An alert is generated once when spent ≥ 80 % of the limit and once when spent ≥ 100 %. Budget status is recalculated whenever an expense is created, edited or deleted. If editing brings spending below a threshold, the alert can fire again later. If one expense crosses **both** thresholds at once (e.g. 70 % → 105 %), both are marked as sent but only **one** notification is created: "Budget exceeded" (`BUDGET_100`). | APP |

## 4. Families, members, invitations

| ID | Rule | Enforcement |
|---|---|---|
| BR-17 | In v1 a user can be a member of at most one family. | DB (UNIQUE user_id in FAMILY_MEMBER) |
| BR-18 | A family always has exactly one Owner. The Owner cannot leave or be removed without first transferring ownership. | APP |
| BR-19 | An invitation is valid for 7 days. Only one pending invitation per email address per family can exist. Invitations are delivered by a copyable link and shown in-app; the system sends no email (D-3). | APP |
| BR-20 | A removed member's past transactions stay in the family history and still show the member's name. | APP |

## 5. Accounts and categories

| ID | Rule | Enforcement |
|---|---|---|
| BR-21 | An account can be archived only when its balance is 0. Archived accounts keep their history. | APP |
| BR-22 | A category that is used by any transaction or budget cannot be deleted, only archived. Default (system) categories cannot be renamed or deleted. | APP |
| BR-23 | A subcategory has the same type (INCOME/EXPENSE) as its parent. Only one level of nesting is allowed. | APP |
| BR-24 | In v1 every account uses the family currency (default `KZT`). | APP |

## 6. Savings goals and recurring transactions

| ID | Rule | Enforcement |
|---|---|---|
| BR-25 | A savings goal is linked to exactly one account of type Savings, and an account can have at most one goal. Progress = account balance ÷ target amount. Money is added to a goal by a TRANSFER (or INCOME) into the linked account — it is **not** an expense. | DB (UNIQUE) + APP |
| BR-26 | On its due date, a recurring rule creates a normal transaction. If the transaction would break BR-08, it is skipped and the creator is notified. In both cases the next due date moves forward by one period. The job is **idempotent**: a rule never creates two transactions for the same due date, even if the job runs twice. After downtime the job catches up: it processes every missed due date of a rule in date order, each with that date as the transaction date. | APP |

## 7. Audit

| ID | Rule | Enforcement |
|---|---|---|
| BR-27 | Audit entries are append-only: nobody, including the Owner and System Administrator, can edit or delete them. | DB (permissions) + APP |

## 8. Refunds

| ID | Rule | Enforcement |
|---|---|---|
| BR-28 | A refund for an earlier purchase is recorded as an `INCOME` transaction in the default category **"Refunds"** (D-1). The original expense is not edited, and the budget of the original category is **not** reduced. If the purchase itself was a mistake, the user edits or deletes the original expense instead (BR-11). | APP |

## Worked example (for testing)

Accounts at start of month: *Kaspi card* = 200 000 ₸, *Cash* = 10 000 ₸, *Savings* = 0 ₸.

| # | Transaction | Kaspi card | Cash | Savings | Income total | Expense total | Food budget (60 000) |
|---|---|--:|--:|--:|--:|--:|--:|
| 1 | INCOME 350 000 Salary → Kaspi card | 550 000 | 10 000 | 0 | 350 000 | 0 | 0 % |
| 2 | TRANSFER 20 000 Kaspi card → Cash | 530 000 | 30 000 | 0 | 350 000 | 0 | 0 % |
| 3 | EXPENSE 45 000 Food from Kaspi card | 485 000 | 30 000 | 0 | 350 000 | 45 000 | 75 % |
| 4 | EXPENSE 5 000 Food from Cash | 485 000 | 25 000 | 0 | 350 000 | 50 000 | 83 % → **80 % alert** |
| 5 | TRANSFER 100 000 Kaspi card → Savings | 385 000 | 25 000 | 100 000 | 350 000 | 50 000 | 83 % |
| 6 | EXPENSE 30 000 Cash (Food) | ❌ rejected by BR-08 (cash would be −5 000) | | | | | |

End of month: family total = 510 000 ₸ (= 210 000 + 350 000 − 50 000). Net result = +300 000 ₸. Transfers #2 and #5 changed where the money is but not the total, the reports, or the budget.
