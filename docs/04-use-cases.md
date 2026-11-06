# 04 — Use Cases

| | |
|---|---|
| **Document owner** | Nuray Mukhambet — Systems Analysis & Requirements |
| **Version** | 1.3 |
| **Date** | 2026-11-06 |

The use case diagram is in [diagrams/use-case-diagram.md](diagrams/use-case-diagram.md).

## Use case list

| ID | Use case | Primary actor | Requirements | Priority |
|---|---|---|---|:-:|
| UC-01 | Register and create a family | Visitor → Family Owner | FR-01, FR-02, FR-05 | M |
| UC-02 | Invite a family member | Family Owner | FR-06, FR-07 | M |
| UC-03 | Manage accounts | Family Owner, Adult | FR-10 – FR-13 | M |
| UC-04 | Record income or expense | Any member | FR-16, FR-17, FR-19 | M |
| UC-05 | Transfer money between accounts | Family Owner, Adult | FR-18, FR-19 | M |
| UC-06 | Edit or delete a transaction | Owner, Adult (own) | FR-20, FR-37 | M |
| UC-07 | Set a monthly budget | Family Owner, Adult | FR-24, FR-25, FR-27 | M |
| UC-08 | Check budget and send alert | System (included) | FR-26, FR-35 | S |
| UC-09 | View reports | Any member | FR-21, FR-30 – FR-34 | M |
| UC-10 | Manage a savings goal | Family Owner, Adult | FR-28, FR-29 | S |
| UC-11 | Generate recurring transactions | Scheduler | FR-22, FR-23 | S |
| UC-12 | Block a user | System Administrator | FR-39 | S |

---

## UC-01 — Register and create a family

| | |
|---|---|
| **Primary actor** | Visitor (becomes Family Owner) |
| **Goal** | Get an account and a family space to manage money |
| **Preconditions** | The visitor has no account with this email. |
| **Postconditions** | A user, a family and a FAMILY_MEMBER record with role Owner exist; default categories are available. |
| **Trigger** | Visitor clicks "Sign up". |

**Main flow**
1. Visitor enters full name, email and password and accepts the privacy notice.
2. System validates the data (email format, password ≥ 8 characters with a letter and a digit, email not used).
3. System creates the user with a hashed password and logs them in.
4. System asks the user to create a family or wait for an invitation.
5. User chooses "Create family" and enters a family name.
6. System creates the family with base currency KZT and makes the user its Owner.
7. System shows the dashboard with a prompt to add the first account.

**Alternative flows**
- 2a. Email already registered → system shows "An account with this email already exists" and offers login, or tells the user to contact the administrator for a password reset.
- 2b. Password too weak → system shows the password rules; flow returns to step 1.
- 4a. User has a pending invitation → system offers to accept it instead (continues in UC-02, step 6).

---

## UC-02 — Invite a family member

| | |
|---|---|
| **Primary actor** | Family Owner |
| **Secondary actor** | Invited person |
| **Preconditions** | Owner is logged in. |
| **Postconditions** | Invited person is a member of the family with the chosen role. |

**Main flow**
1. Owner opens "Members" and clicks "Invite".
2. Owner enters an email address and chooses role Adult or Child.
3. System checks BR-19 (no pending invitation for this email) and creates an invitation valid for 7 days.
4. System shows the invitation link with a "Copy link" button and lists the invitation as "Pending". Owner sends the link to the person outside the system (messenger, in person).
5. Invited person opens the link — or simply logs in with the invited email — and the system shows the pending invitation (registering first via UC-01 steps 1–3 if needed).
6. System checks the invitation is still valid and that the person has no family (BR-17).
7. Person clicks "Accept"; system creates the FAMILY_MEMBER record with the chosen role.
8. System notifies the Owner that the invitation was accepted.

**Alternative flows**
- 3a. Pending invitation already exists → system shows the pending invitation and offers "Create new link". A new link replaces the old one: the old link stops working and the invitation is valid for 7 days from now (BR-19). The old link cannot be shown again because only its hash is stored (doc 10 §5).
- 6a. Invitation expired → system shows "This invitation has expired, ask the family owner for a new one".
- 6b. Person already belongs to another family → system explains they must leave it first.
- 7a. Person clicks "Decline" → invitation status becomes Declined; Owner is notified.

---

## UC-03 — Manage accounts

| | |
|---|---|
| **Primary actor** | Family Owner, Adult Member |
| **Preconditions** | Actor is logged in and belongs to a family. |
| **Postconditions** | Account is created / updated / archived; balances are recalculated. |

**Main flow (create)**
1. Actor opens "Accounts" and clicks "Add account".
2. Actor enters name, type (Cash, Bank card, Savings, Credit card), opening balance and — for credit cards — credit limit.
3. System validates (name unique in family, opening balance ≥ 0 except credit card).
4. System saves the account and shows it with its current balance.

**Alternative flows**
- A1 Edit: actor changes name or credit limit → system saves and writes an audit entry.
- A2 Archive (Owner only): system checks BR-21 (balance = 0). If balance ≠ 0, system shows "Move the remaining money to another account first" and offers a transfer (UC-05).
- A3 Share with child (Owner only): Owner selects a Child Member → system creates ACCOUNT_ACCESS.

---

## UC-04 — Record income or expense

| | |
|---|---|
| **Primary actor** | Any family member (Child: shared accounts only) |
| **Preconditions** | Actor is logged in; the family has at least one account. |
| **Postconditions** | A transaction of type INCOME or EXPENSE is saved; the account balance, reports and (for expenses) the budget are updated; an audit entry is written. |
| **Includes** | UC-08 Check budget and send alert (for EXPENSE) |

**Main flow**
1. Actor clicks "Add transaction".
2. System shows the form with type selector (Income / Expense / Transfer); Expense is pre-selected. Children see only Income and Expense.
3. Actor chooses the type, enters the amount, selects the account (destination for income, source for expense), selects a category of the matching type, sets the date (default: today) and an optional description.
4. Actor clicks "Save".
5. System validates BR-01 – BR-10.
6. System saves the transaction and recalculates the account balance in one database transaction (NFR-09).
7. If the type is EXPENSE, system runs UC-08.
8. System shows the updated transaction list and balance with the message "Transaction saved".

**Alternative flows**
- 5a. Amount ≤ 0 or not a number → "Amount must be greater than 0" (BR-02).
- 5b. Expense would make a Cash/Bank card/Savings account negative → "Not enough money on *Cash* (balance 25 000 ₸)" (BR-08). Actor changes amount or account.
- 5c. Date in the future → "Date cannot be later than today. Use a recurring transaction to plan future payments." (BR-09)
- 5d. Category type does not match transaction type → form only offers matching categories; the API rejects mismatches (BR-03, BR-04).
- 5e. Child selects an account not shared with them → API returns 403 (BR-10).

---

## UC-05 — Transfer money between accounts

| | |
|---|---|
| **Primary actor** | Family Owner, Adult Member |
| **Preconditions** | The family has at least two non-archived accounts. |
| **Postconditions** | A TRANSFER transaction is saved; the source balance decreases and the destination balance increases by the same amount; the family total, income/expense reports and budgets are **unchanged**. |

**Main flow**
1. Actor clicks "Add transaction" and selects type "Transfer" (or clicks "Transfer" on an account card).
2. System hides the category field and shows "From account" and "To account".
3. Actor enters the amount, both accounts, date and optional description (e.g. "ATM withdrawal").
4. System validates BR-02, BR-05, BR-06, BR-08, BR-09.
5. System saves one TRANSFER transaction and updates both balances in one database transaction.
6. System shows both new balances.

**Alternative flows**
- 4a. Same account selected twice → "Choose two different accounts" (BR-05).
- 4b. Source would go negative → as UC-04, 5b.
- 4c. Destination is a Savings account with a goal → after saving, system updates the goal progress (UC-10) and notifies if the goal is achieved.

---

## UC-06 — Edit or delete a transaction

| | |
|---|---|
| **Primary actor** | Owner (any transaction), Adult (own transactions) |
| **Preconditions** | The transaction exists and is not deleted. |
| **Postconditions** | Transaction is updated or soft-deleted; balances, reports and budgets are recalculated; audit entry with old and new values is written. |

**Main flow**
1. Actor opens a transaction from the list and clicks "Edit".
2. System checks BR-11 (permission).
3. Actor changes fields (type can also be changed) and clicks "Save".
4. System validates the new values against BR-01 – BR-10 **using balances without the old version of this transaction**.
5. System saves the change, recalculates affected balances and budgets, writes an audit entry.

**Alternative flows**
- 1a. Delete: actor clicks "Delete" → system asks for confirmation → system sets `is_deleted = true`, recalculates, writes audit entry.
- 2a. Actor not allowed → buttons are hidden; API returns 403.
- 4a. Deleting an INCOME or incoming TRANSFER would make an account negative → system warns and asks the actor to fix the later transactions first (BR-08).

---

## UC-07 — Set a monthly budget

| | |
|---|---|
| **Primary actor** | Family Owner, Adult Member |
| **Postconditions** | A budget exists for the category and month; its progress is shown. |

**Main flow**
1. Actor opens "Budgets" and selects a month (default: current).
2. Actor clicks "Add budget", chooses an **expense** category and enters a limit.
3. System validates BR-14.
4. System saves the budget and immediately calculates spent amount (BR-15), remaining amount and percentage.
5. System shows the budget as a progress bar (green < 80 %, yellow 80–99 %, red ≥ 100 %).

**Alternative flows**
- 3a. Budget for this category and month already exists → system opens it for editing instead.
- 2a. "Copy last month's budgets" → system creates copies for all categories that do not yet have a budget this month (FR-27).

---

## UC-08 — Check budget and send alert *(included use case)*

| | |
|---|---|
| **Actor** | System (called from UC-04 and UC-06) |
| **Preconditions** | An EXPENSE transaction was created, edited or deleted. |

**Main flow**
1. System finds the budget for the transaction's category (or its parent) and month.
2. System calculates the percentage used (BR-15).
3. If the percentage crossed 80 % or 100 % and that alert has not yet been sent (BR-16), the system creates a notification for the Owner and all Adults. If both thresholds were crossed at once, only the 100 % notification is created and both are marked as sent.
4. System updates the stored alert state of the budget.

**Alternative flow**
- 1a. No budget exists for this category/month → use case ends.

---

## UC-09 — View reports

| | |
|---|---|
| **Primary actor** | Any member (Child: shared accounts only, BR-10) |

**Main flow**
1. Actor opens "Reports" and selects a period (default: current month).
2. System shows the monthly summary: total income, total expenses, net result, balances (FR-30, BR-12).
3. Actor switches to "By category" → system shows a chart and table of expenses by category (FR-31).
4. Actor switches to "By member" → system shows income and expenses per member (FR-32).
5. Actor clicks "Export CSV" → system downloads the filtered transactions (FR-34).

**Alternative flow**
- 2a. No transactions in the period → "No transactions in this period" with a button to add one.

---

## UC-10 — Manage a savings goal

| | |
|---|---|
| **Primary actor** | Family Owner, Adult Member |

**Main flow**
1. Actor opens "Goals" and clicks "New goal".
2. Actor enters a name (e.g. "Summer trip"), target amount, optional target date and selects (or creates) a Savings account.
3. System validates BR-25 and saves the goal.
4. System shows progress = account balance ÷ target.
5. To add money, actor makes a TRANSFER into the savings account (UC-05).
6. When the balance reaches the target, system marks the goal Achieved and notifies the family.

---

## UC-11 — Generate recurring transactions

| | |
|---|---|
| **Primary actor** | Scheduler (runs daily at 00:05) |

**Main flow**
1. Scheduler starts the job.
2. System selects all active recurring rules with `next_run_date ≤ today`.
3. For each rule, system creates a normal transaction (UC-04 / UC-05 validation).
4. System moves `next_run_date` forward by one period; if past `end_date`, the rule becomes inactive.
5. System notifies the rule creator ("Rent 150 000 ₸ recorded").

**Alternative flow**
- 2a. Job did not run for several days (downtime) → steps 3–4 repeat for a rule until its `next_run_date` is after today, oldest date first (BR-26).
- 3a. Validation fails (BR-08) → transaction is skipped, creator is notified ("Rent could not be recorded: not enough money on Kaspi card"), step 4 still runs (BR-26).
- 3b. Job runs a second time on the same day → no rule has `next_run_date ≤ today` any more, so nothing is created twice (BR-26).

---

## UC-12 — Block a user

| | |
|---|---|
| **Primary actor** | System Administrator |

**Main flow**
1. Admin searches a user by email.
2. Admin clicks "Block" and enters a reason.
3. System sets `is_active = false`, ends the user's sessions and writes an audit entry.
4. The blocked user sees "Your account has been blocked" at login.

**Alternative flow**
- 2a. "Unblock" → `is_active = true`, audit entry written.
- 2b. "Generate reset link" (user forgot password, FR-03) → system creates a one-time link valid for 24 hours and shows it to the admin, who passes it to the user; audit entry written.
