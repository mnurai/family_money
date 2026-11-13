# 05 — User Stories

| | |
|---|---|
| **Document owner** | Nuray Mukhambet — Systems Analysis & Requirements |
| **Version** | 1.4 |
| **Date** | 2026-11-13 |

Format: *As a ⟨role⟩, I want ⟨goal⟩, so that ⟨benefit⟩.* Acceptance criteria use **Given / When / Then** so that the Testing role can turn them directly into test cases. Each story is also created as a GitHub Issue (see `scripts/create_issues.sh`).

Story points: 1 = a few hours, 2 = about a day, 3 = 2–3 days, 5 = a week.

## Epic E1 — Accounts and family

### US-01 — Register
*As a visitor, I want to register with my email and password, so that I have my own secure login.*
- **Links:** FR-01, NFR-01 · UC-01 · **Priority:** M · **Points:** 2
- **Acceptance criteria**
  1. Given a new email and a valid password, when I submit the form, then my account is created and I am logged in.
  2. Given an email that already exists, when I submit, then I see "An account with this email already exists".
  3. Given a password shorter than 8 characters, or without at least one letter and one digit, when I submit, then I see the password rules and no account is created.
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

### US-21 — Edit my profile
*As a user, I want to change my name and password, so that my account stays correct and secure.*
- **Links:** FR-04, NFR-01 · **Priority:** S · **Points:** 1
- **Acceptance criteria**
  1. When I change my full name, then the new name is shown everywhere in the family, also on my past transactions.
  2. Given I enter my current password and a new password that follows the rules of US-01.3, then the password is changed; with a wrong current password, then I see "Current password is incorrect".
  3. The email cannot be changed in v1.

### US-22 — Transfer ownership
*As a family owner, I want to hand over ownership to another adult, so that the family can continue if I stop managing it.*
- **Links:** FR-09, BR-18 · **Priority:** C · **Points:** 2
- **Acceptance criteria**
  1. When I choose an Adult Member and confirm, then that member becomes the Owner and I become an Adult Member.
  2. A Child Member cannot be chosen as the new Owner.
  3. The family has exactly one Owner before and after the change, and the change is written to the audit log.

### US-23 — Custom categories
*As a family owner or adult member, I want to add my own categories and subcategories, so that reports match how our family spends.*
- **Links:** FR-15, BR-22, BR-23 · **Priority:** S · **Points:** 2
- **Acceptance criteria**
  1. When I create "Restaurants" under "Food", then it is an expense category and its expenses count in the Food budget (BR-15).
  2. A subcategory always has the type of its parent, and a subcategory cannot have its own subcategories (BR-23).
  3. Given a category used by a transaction or budget, then it can only be archived, not deleted; default categories cannot be renamed or deleted (BR-22).

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
  4. Given 70 % used, when one expense brings it to 105 %, then only one "Budget exceeded" notification is sent (BR-16).

### US-16 — Savings goal
*As a family owner, I want to create a savings goal linked to a savings account, so that the family can see progress towards it.*
- **Links:** FR-28, FR-29, BR-25 · UC-10 · **Priority:** S · **Points:** 3
- **Acceptance criteria**
  1. Given a goal "Summer trip, 500 000 ₸" linked to "Savings", when Savings has 100 000 ₸, then progress shows 20 %.
  2. Money is added by a transfer into the savings account and is not counted as an expense.
  3. When the balance reaches the target, the goal is marked Achieved and the family is notified.

### US-24 — Copy budgets to next month
*As a family owner or adult member, I want to copy this month's budgets to the next month, so that I don't enter the same limits again.*
- **Links:** FR-27, BR-14 · UC-07 · **Priority:** C · **Points:** 1
- **Acceptance criteria**
  1. When I click "Copy to next month", then every budget of this month is created for the next month with the same limit.
  2. Given a category already has a budget next month, then it is not changed and I see which ones were skipped (BR-14: one budget per category per month).
  3. Spent amounts and alert state are not copied: the new budgets start at 0 %.

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
  3. A Child sees only the transactions on accounts shared with them (from any member) and never the family total (BR-10, BR-13).

### US-19 — Export to CSV
*As a family owner, I want to export transactions to CSV, so that I can analyse them in Excel.*
- **Links:** FR-34 · UC-09 · **Priority:** C · **Points:** 1
- **Acceptance criteria**
  1. The export contains the currently filtered transactions with columns: date, type, amount, source account, destination account, category, member, description.
  2. The file opens correctly in Excel (UTF-8 with BOM, Cyrillic text readable).
  3. Amounts use a dot as the decimal separator and no thousands separator (e.g. `125000.00`); dates are `YYYY-MM-DD`. The display format of NFR-20 is not used in CSV.

### US-25 — Balance history
*As a family member, I want to see how an account's balance changed over time, so that I notice trends.*
- **Links:** FR-33, BR-07 · UC-09 · **Priority:** C · **Points:** 2
- **Acceptance criteria**
  1. For a chosen account and period, a chart shows the balance at the end of each day.
  2. The last point equals the current balance; deleted transactions are not counted (BR-07).
  3. A Child can see the history only of accounts shared with them (BR-10).

## Epic E5 — Administration

### US-20 — Block a user
*As a system administrator, I want to block an abusive or compromised account, so that the platform stays safe.*
- **Links:** FR-03, FR-39 · UC-12 · **Priority:** S · **Points:** 2
- **Acceptance criteria**
  1. A blocked user cannot log in and sees "Your account has been blocked".
  2. For a user who forgot their password, I can generate a one-time reset link valid for 24 hours.
  3. The admin cannot see the family's transactions.
  4. Every action is recorded in the audit log.

### US-26 — View the audit log
*As a family owner, I want to see who changed what in our family, so that mistakes and misuse can be traced.*
- **Links:** FR-38, BR-27 · **Priority:** C · **Points:** 1
- **Acceptance criteria**
  1. The audit log lists the family's entries with date, member, entity, action and old/new values, newest first, and can be filtered by date and entity.
  2. Nobody can edit or delete an entry, including the Owner (BR-27).
  3. Adult and Child Members cannot open the audit log (403).

## Epic E6 — Gamification

### US-27 — Earn badges and goal milestones
*As a family member, I want to earn badges and see milestones on our savings goals, so that keeping a budget feels rewarding and I keep the habit.*
- **Links:** FR-43, FR-44, BR-29, BR-30 · **Priority:** S · **Points:** 3
- **Acceptance criteria**
  1. **Given** I have recorded no transactions, **when** I open Achievements, **then** no personal badge is earned and each shows what to do to earn it.
  2. **Given** I record my first transaction, **when** the save succeeds, **then** I get the message "New badge: First step" and the badge shows the date it was earned.
  3. A badge with a count (e.g. 25 transactions, 7 days in a row) shows progress such as "10 of 25".
  4. Month badges (In the green, Budget keeper, Positive month) are earned only for a month that has ended, and transfers never count as income or spending (BR-12).
  5. **Given** a goal of 600 000 ₸ with 200 000 ₸ saved, **then** the 25 % milestone is marked as reached and the goal says "Next milestone: 50 %, 100 000 ₸ to go". After a transfer of 100 000 ₸ I get the message that the goal reached 50 %.
  6. A Child Member sees only personal badges, never family badges or goal milestones (BR-30, BR-13).

### US-28 — Points and levels
*As a family member, I want my badges to give points and a level, so that I can see my progress grow over time.*
- **Links:** FR-45, BR-31 · **Priority:** S · **Points:** 2
- **Acceptance criteria**
  1. Every badge shows its points (e.g. "+25 pts"); only earned badges count towards my total.
  2. My level and its name are shown next to my name on every screen, e.g. "Lv 3 · Saver".
  3. Levels start at 0, 20, 50, 100 and 160 points; the Achievements page shows how many points are left to the next level.
  4. **Given** I have 45 points, **when** I earn a 10-point badge, **then** I see "Level up! You are now level 3, Saver".

### US-29 — Kids' savings challenge
*As a parent, I want to set a savings challenge for my child, so that they learn to save towards something they want.*
- **Links:** FR-46, BR-32, BR-10 · **Priority:** S · **Points:** 3
- **Acceptance criteria**
  1. **Given** the account "Aidar — pocket money" is shared with Aidar, **when** I create the challenge "Headphones" with a target of 25 000 ₸, **then** Aidar sees it on his overview with 4 stars for 25 / 50 / 75 / 100 %.
  2. I can only choose a Child Member and an account shared with that child; otherwise I see "Choose an account shared with this child".
  3. A child can have one active challenge; a second one is refused with "This child already has an active challenge".
  4. When the account balance reaches the target, the challenge is complete; Aidar and the Owner and Adults get a notification, and Aidar earns the "Challenge champion" badge.
  5. A Child Member cannot create or cancel challenges (403). If the account stops being shared with the child, the challenge is cancelled.

## Backlog summary

| Epic | Stories | Total points |
|---|---|--:|
| E1 Accounts and family | US-01 – US-07, US-21 – US-23 | 19 |
| E2 Transactions | US-08 – US-13 | 18 |
| E3 Budgets and goals | US-14 – US-16, US-24 | 9 |
| E4 Reports | US-17 – US-19, US-25 | 9 |
| E5 Administration | US-20, US-26 | 3 |
| E6 Gamification | US-27 – US-29 | 8 |
| **Total** | **29** | **66** |
