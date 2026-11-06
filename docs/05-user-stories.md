# 05 — User Stories

| | |
|---|---|
| **Document owner** | Nuray Mukhambet — Systems Analysis & Requirements |
| **Version** | 1.2 |
| **Date** | 2026-11-06 |

Format: *As a ⟨role⟩, I want ⟨goal⟩, so that ⟨benefit⟩.* Acceptance criteria use **Given / When / Then** so that the Testing role can turn them directly into test cases. Each story is also created as a GitHub Issue (see `scripts/create_issues.sh`).

Story points: 1 = a few hours, 2 = about a day, 3 = 2–3 days, 5 = a week.

## Epic E1 — Accounts and family

### US-01 — Register
*As a visitor, I want to register with my email and password, so that I have my own secure login.*
- **Links:** FR-01, NFR-01 · UC-01 · **Priority:** M · **Points:** 2
- **Acceptance criteria**
  1. Given a new email and a valid password, when I submit the form, then my account is created and I am logged in.
  2. Given an email that already exists, when I submit, then I see "An account with this email already exists".
  3. Given a password shorter than 8 characters or without a digit, when I submit, then I see the password rules and no account is created.
  4. The password is stored only as a hash.

### US-02 — Log in and out
*As a user, I want to log in and log out, so that only I can access my family's data.*
- **Links:** FR-02, NFR-05, NFR-06 · UC-01 · **Priority:** M · **Points:** 2
- **Acceptance criteria**
  1. Given correct credentials, when I log in, then I see my dashboard.
  2. Given a wrong password, then I see "Email or password is incorrect" (the same message for a wrong email, so no hint which one is wrong).
  3. Given 5 failed attempts, then the account is locked for 15 minutes.
  4. A "Forgot password?" link explains that the administrator can issue a reset link.
  5. Given 30 minutes of inactivity, then I am logged out.

### US-03 — Create a family
*As a new user, I want to create a family, so that I can start tracking our money together.*
- **Links:** FR-05, FR-14 · UC-01 · **Priority:** M · **Points:** 1
- **Acceptance criteria**
  1. Given I have no family, when I enter a family name, then the family is created and I am its Owner.
  2. The default income and expense categories are available immediately.
  3. Given I already belong to a family, then the "Create family" option is not shown.

### US-04 — Invite members
*As a family owner, I want to invite my spouse and children with a role, using a link I can share, so that each person has the right level of access.*
- **Links:** FR-06, FR-07 · UC-02 · **Priority:** M · **Points:** 3
- **Acceptance criteria**
  1. When I enter an email and choose Adult or Child, then an invitation link is generated with a "Copy link" button and a pending invitation appears in the member list.
  2. When the invited person logs in with that email, they see the pending invitation without needing the link.
  3. When the invited person accepts within 7 days, then they become a member with that role and I get a notification.
  4. Given the invitation is older than 7 days, then accepting it shows "This invitation has expired".
  5. Given a pending invitation for this email already exists, then I can create a new link that replaces the old one (the old link stops working, valid for 7 days from now), but I cannot create a second pending invitation.
  6. The system sends no email.

### US-05 — Manage member roles
*As a family owner, I want to change roles and remove members, so that access stays correct when the family situation changes.*
- **Links:** FR-08, BR-18, BR-20 · **Priority:** S · **Points:** 2
- **Acceptance criteria**
  1. When I change a member from Child to Adult, then their permissions change at their next request.
  2. When I remove a member, then they can no longer see family data, but their past transactions stay with their name.
  3. I cannot remove myself while I am the Owner.

### US-06 — Create accounts
*As a family owner, I want to add our cash, cards and savings as accounts with their current balances, so that the system shows where our money is.*
- **Links:** FR-10, FR-11 · UC-03 · **Priority:** M · **Points:** 2
- **Acceptance criteria**
  1. When I create "Kaspi card" (Bank card, 200 000 ₸), then it appears with balance 200 000 ₸.
  2. The dashboard shows the family total = sum of all non-archived accounts.
  3. Given an account name already used in the family, then I see an error.

### US-07 — Share an account with my child
*As a family owner, I want to share only the pocket-money account with my child, so that they learn budgeting without seeing all family finances.*
- **Links:** FR-13, BR-10 · UC-03 · **Priority:** S · **Points:** 2
- **Acceptance criteria**
  1. Given I share "Aidar — pocket money" with Aidar, when Aidar logs in, then he sees only that account.
  2. Aidar can record income and expenses on it but has no "Transfer" option.
  3. A direct API request by Aidar to another account returns 403.

## Epic E2 — Transactions

### US-08 — Record an expense
*As a family member, I want to record an expense quickly, so that our spending is always up to date.*
- **Links:** FR-17, FR-19, NFR-13 · UC-04 · **Priority:** M · **Points:** 3
- **Acceptance criteria**
  1. When I save an expense of 5 000 ₸ in "Food" from "Cash", then the cash balance decreases by 5 000 ₸ and the Food budget increases by 5 000 ₸.
  2. Only expense categories are offered.
  3. Given the cash balance is 3 000 ₸, when I try to spend 5 000 ₸, then I see "Not enough money on Cash".
  4. Given a future date, then I see "Date cannot be later than today".
  5. The whole action takes no more than 3 screens.

### US-09 — Record income
*As a family member, I want to record income such as salary or a scholarship, so that we know how much money came in.*
- **Links:** FR-16, FR-19 · UC-04 · **Priority:** M · **Points:** 2
- **Acceptance criteria**
  1. When I save income of 350 000 ₸ "Salary" to "Kaspi card", then that balance increases by 350 000 ₸ and monthly income increases by 350 000 ₸.
  2. Only income categories are offered.
  3. Income never changes any budget.
  4. A refund for an earlier purchase is recorded as income in "Refunds"; the original expense and its budget stay unchanged (BR-28).

### US-10 — Transfer between accounts
*As an adult member, I want to record moving money between our own accounts (e.g. ATM withdrawal, putting money into savings), so that balances are correct without it being counted as spending.*
- **Links:** FR-18, BR-05, BR-12, BR-15 · UC-05 · **Priority:** M · **Points:** 3
- **Acceptance criteria**
  1. When I transfer 20 000 ₸ from "Kaspi card" to "Cash", then Kaspi card −20 000 ₸, Cash +20 000 ₸, and the family total does not change.
  2. The transfer does **not** appear in total income, total expenses, category reports or budgets.
  3. There is no category field for a transfer.
  4. Given the same account in "From" and "To", then I see "Choose two different accounts".

### US-11 — Edit or delete a transaction
*As a family member, I want to fix or delete a transaction I entered by mistake, so that our numbers stay correct.*
- **Links:** FR-20, FR-37, BR-11 · UC-06 · **Priority:** M · **Points:** 3
- **Acceptance criteria**
  1. When I change an expense from 5 000 ₸ to 4 000 ₸, then the balance and the budget are recalculated.
  2. When I delete a transaction, then it disappears from lists and reports but is kept in the database and the audit log.
  3. As an Adult I cannot edit another member's transaction; as the Owner I can.
  4. Every change creates an audit entry with old and new values.

### US-12 — Find transactions
*As a family member, I want to filter and search transactions, so that I can quickly find a specific payment.*
- **Links:** FR-21 · UC-09 · **Priority:** M · **Points:** 2
- **Acceptance criteria**
  1. I can filter by period, type (Income/Expense/Transfer), account, category and member, and combine filters.
  2. Searching "pizza" shows transactions whose description contains "pizza" (case-insensitive).
  3. The list is sorted by date, newest first, and paginated (50 per page).

### US-13 — Recurring transactions
*As a family owner, I want to set up monthly salary, rent and savings transfers once, so that I don't have to enter them every month.*
- **Links:** FR-22, FR-23, BR-26 · UC-11 · **Priority:** S · **Points:** 5
- **Acceptance criteria**
  1. Given a monthly rule "Rent 150 000 ₸ from Kaspi card on the 1st", when the 1st comes, then an EXPENSE transaction is created automatically.
  2. A recurring rule can be of any type, including TRANSFER (e.g. monthly 50 000 ₸ to Savings).
  3. Given there is not enough money, then the transaction is skipped and I am notified.
  4. After the end date the rule stops.

## Epic E3 — Budgets and goals

### US-14 — Set a category budget
*As a family owner, I want to set a monthly limit for "Food", so that we control our biggest spending.*
- **Links:** FR-24, FR-25, BR-14, BR-15 · UC-07 · **Priority:** M · **Points:** 3
- **Acceptance criteria**
  1. I can choose only expense categories.
  2. The budget shows limit, spent, remaining and % used; spent includes subcategories (e.g. "Food → Restaurants").
  3. Only EXPENSE transactions are counted — income and transfers never.
  4. Only one budget per category per month is possible.

### US-15 — Budget alerts
*As a family owner or adult member, I want to be warned when we have used 80 % and 100 % of a budget, so that we can react before the month ends.*
- **Links:** FR-26, FR-35, BR-16 · UC-08 · **Priority:** S · **Points:** 2
- **Acceptance criteria**
  1. Given Food budget 60 000 ₸ and spent 45 000 ₸, when an expense of 5 000 ₸ is added (83 %), then the Owner and Adults receive one "80 % used" notification.
  2. The same alert is not sent twice for the same budget and month.
  3. At ≥ 100 % a "Budget exceeded" notification is sent.

### US-16 — Savings goal
*As a family owner, I want to create a savings goal linked to a savings account, so that the family can see progress towards it.*
- **Links:** FR-28, FR-29, BR-25 · UC-10 · **Priority:** S · **Points:** 3
- **Acceptance criteria**
  1. Given a goal "Summer trip, 500 000 ₸" linked to "Savings", when Savings has 100 000 ₸, then progress shows 20 %.
  2. Money is added by a transfer into the savings account and is not counted as an expense.
  3. When the balance reaches the target, the goal is marked Achieved and the family is notified.

## Epic E4 — Reports

### US-17 — Monthly summary
*As a family owner, I want a monthly summary of income, expenses and net result, so that I know if we lived within our means.*
- **Links:** FR-30, BR-12 · UC-09 · **Priority:** M · **Points:** 3
- **Acceptance criteria**
  1. The summary shows total income, total expenses, net result and each account's balance at month end.
  2. Transfers are excluded from income and expense totals.
  3. Using the worked example in doc 06, the report shows income 350 000, expenses 50 000, net +300 000.

### US-18 — Spending by category and by member
*As a family member, I want to see expenses by category and by person, so that we understand where the money goes.*
- **Links:** FR-31, FR-32 · UC-09 · **Priority:** M / S · **Points:** 3
- **Acceptance criteria**
  1. A chart and table show expenses per category with amount and % of total.
  2. A "By member" view shows income and expenses per member.
  3. A Child sees only their own data and never the family total (BR-13).

### US-19 — Export to CSV
*As a family owner, I want to export transactions to CSV, so that I can analyse them in Excel.*
- **Links:** FR-34 · UC-09 · **Priority:** C · **Points:** 1
- **Acceptance criteria**
  1. The export contains the currently filtered transactions with columns: date, type, amount, source account, destination account, category, member, description.
  2. The file opens correctly in Excel (UTF-8 with BOM, Cyrillic text readable).

## Epic E5 — Administration

### US-20 — Block a user
*As a system administrator, I want to block an abusive or compromised account, so that the platform stays safe.*
- **Links:** FR-03, FR-39 · UC-12 · **Priority:** S · **Points:** 2
- **Acceptance criteria**
  1. A blocked user cannot log in and sees "Your account has been blocked".
  2. For a user who forgot their password, I can generate a one-time reset link valid for 24 hours.
  3. The admin cannot see the family's transactions.
  4. Every action is recorded in the audit log.

## Backlog summary

| Epic | Stories | Total points |
|---|---|--:|
| E1 Accounts and family | US-01 – US-07 | 14 |
| E2 Transactions | US-08 – US-13 | 18 |
| E3 Budgets and goals | US-14 – US-16 | 8 |
| E4 Reports | US-17 – US-19 | 7 |
| E5 Administration | US-20 | 2 |
| **Total** | **20** | **49** |
