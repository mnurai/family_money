# 01 — Vision and Scope

| | |
|---|---|
| **Project** | Family Budget Tracker (FBT) |
| **Course** | Basics of Information Systems |
| **Document owner** | Nuray Mukhambet — Systems Analysis & Requirements |
| **Version** | 1.1 (open questions resolved) |
| **Date** | 2026-11-05 |

## 1. Problem statement

Families usually keep money in several places at once: cash, one or more bank cards, a savings account. Income comes in from several members, and spending decisions are spread across the household. Without a shared tool, nobody has a reliable answer to three basic questions:

1. **How much money do we have right now, and where is it?**
2. **Where did our money come from and where did it go this month?**
3. **Are we staying within the limits we agreed on?**

Spreadsheets and notebooks fail because they are not shared in real time, they mix up "moving money between our own accounts" with "spending money", and they do not warn anyone before a limit is exceeded.

## 2. Product vision

> For families who want to manage household money together, **Family Budget Tracker** is a web-based information system that records every movement of money — income, expenses and transfers between the family's own accounts — and turns it into balances, budgets and reports that every family member can see according to their role. Unlike a personal expense app, FBT is built around a *family* with shared accounts, roles and permissions.

## 3. Key concept: a transaction is not the same as an expense

The central entity of the system is the **transaction** — *any recorded movement of money that changes the balance of at least one family account*. There are three transaction types:

| Type | Meaning | Source account | Destination account | Category | Counts in income/expense reports? | Counts toward budgets? |
|---|---|---|---|---|---|---|
| `INCOME` | Money enters the family from outside (salary, scholarship, gift, refund) | — | required | income category, required | yes, as income | no |
| `EXPENSE` | Money leaves the family to outside (groceries, rent, transport) | required | — | expense category, required | yes, as expense | **yes** |
| `TRANSFER` | Money moves between two of the family's own accounts (card → cash, card → savings) | required | required | none | **no** | **no** |

A transfer changes *where* the money is, but not *how much* the family has. Treating a transfer as an expense would make reports show false spending and break budgets. This distinction runs through all requirements, business rules and the data model.

## 4. Business goals and success criteria

| ID | Goal | Success criterion (how we will know) |
|---|---|---|
| G-1 | Give the family one up-to-date picture of its money | Total and per-account balances are always equal to opening balance + recorded transactions (verified by test cases) |
| G-2 | Make recording money movements fast | A user can record a transaction in ≤ 3 screens / ≤ 30 seconds |
| G-3 | Help the family keep to agreed limits | Members are notified when a category budget reaches 80 % and 100 % |
| G-4 | Support shared but controlled access | Each role can do exactly what the permission matrix allows (doc 02) — no more |
| G-5 | Make savings visible | Progress toward each savings goal is shown as a percentage |
| G-6 | Explain spending | Monthly report shows income vs expenses and spending by category and by member |

## 5. Scope

### 5.1 In scope (version 1)

- User registration, login, logout, password reset
- Creating a family, inviting members with a shareable invitation link, assigning roles (Owner, Adult, Child)
- Family accounts: cash, bank card, savings, credit card — with opening balances
- Default and custom categories for income and expenses, with one level of subcategories
- Recording, editing, deleting (soft), searching and filtering **income, expense and transfer** transactions
- Recurring transactions (e.g. monthly salary, monthly rent)
- Monthly budgets per expense category with 80 % / 100 % alerts
- Savings goals linked to savings accounts
- Reports: monthly summary, spending by category, spending by member, balance history; CSV export
- In-app notifications (the only notification channel in v1)
- Audit log of changes to financial data
- System administrator functions (block/unblock user accounts)

### 5.2 Out of scope (version 1)

- Automatic import from banks (Kaspi, Halyk, etc.) or open-banking APIs
- Multiple currencies and exchange rates within one family (v1 uses one family currency, default KZT)
- Investments, loans and debt schedules
- Receipt scanning / OCR
- Native mobile apps (the web app is responsive instead)
- Tax calculations
- Sending email of any kind (notifications, invitations, password-reset links)

## 6. Assumptions and constraints

**Assumptions**
- A-1: Every member has their own email address and logs in separately.
- A-2: In v1 a user belongs to exactly one family.
- A-3: Users enter transactions manually (no bank import).
- A-4: Members have a modern browser and internet access.

**Constraints**
- C-1: The project must be completed within the semester by a team of five.
- C-2: Personal data must be handled in line with the Law of the Republic of Kazakhstan "On Personal Data and Their Protection".
- C-3: Money must be stored as exact decimal values, never as floating-point numbers.
- C-4: The application stack is chosen by the Architecture role (see Architecture documents).
- C-5: The database engine is **PostgreSQL** (decision D-4).

## 7. Resolved decisions

All open questions from version 1.0 were resolved on 2026-11-05.

| ID | Question | Decision | Consequences in the documents | Affects |
|---|---|---|---|---|
| D-1 | How do we record a refund for an earlier purchase? | Record it as an `INCOME` transaction in the default category **"Refunds"**. The original expense and the budget are **not** changed. | BR-28; glossary entry "Refund". The budget shows what was spent; the refund shows up as income. | Nuray, Aziza, Kairat |
| D-2 | Should a child see the family total balance? | **No.** A Child Member sees only the accounts shared with them and their own transactions — no family total, no other accounts. | BR-10, BR-13; permission matrix (doc 02 §3). | Nuradin, Aziza |
| D-3 | Do we need email, or are in-app notifications enough? | **In-app only.** The system sends no email in v1. | FR-36 → Won't. Invitations work through a **copyable invitation link** plus an in-app pending invitation (FR-06, FR-07). Forgotten passwords are reset by the **System Administrator**, who generates a one-time reset link (FR-03). The Email Service actor is removed from all diagrams. | Nuradin, Aziza |
| D-4 | Which database engine? | **PostgreSQL.** | C-5; data dictionary uses PostgreSQL types (`numeric`, `timestamptz`, `jsonb`, native `ENUM`/`CHECK`). | Gulnaz |

## 8. Related documents

- [02 — Stakeholders and Users](02-stakeholders-and-users.md)
- [03 — Requirements Specification](03-requirements.md)
- [04 — Use Cases](04-use-cases.md)
- [05 — User Stories](05-user-stories.md)
- [06 — Business Rules](06-business-rules.md)
- [07 — Data Dictionary](07-data-dictionary.md)
- [08 — Traceability Matrix](08-traceability-matrix.md)
- [09 — Glossary](09-glossary.md)
- [Diagrams](diagrams/)
