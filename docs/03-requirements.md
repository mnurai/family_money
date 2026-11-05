# 03 — Software Requirements Specification

| | |
|---|---|
| **Document owner** | Nuray Mukhambet — Systems Analysis & Requirements |
| **Version** | 1.1 |
| **Date** | 2026-11-05 |

## 1. Introduction

This document lists the functional and non-functional requirements of the Family Budget Tracker (FBT). Each requirement has a unique ID that is used in the use cases, user stories, data dictionary, traceability matrix and test cases.

**Priority (MoSCoW)**
- **M — Must**: required for the course demo; the system is not acceptable without it
- **S — Should**: important, implemented if time allows after all Musts
- **C — Could**: nice to have
- **W — Won't (this version)**: explicitly excluded from v1

**Important terminology:** *transaction* means any money movement — `INCOME`, `EXPENSE` or `TRANSFER` (see [01 — Vision, §3](01-vision-and-scope.md#3-key-concept-a-transaction-is-not-the-same-as-an-expense)). An *expense* is only one type of transaction.

## 2. Functional requirements

### 2.1 User accounts and authentication (AUTH)

| ID | Requirement | Priority |
|---|---|:-:|
| FR-01 | The system shall allow a visitor to register with full name, email and password. | M |
| FR-02 | The system shall allow a registered user to log in with email and password and to log out. | M |
| FR-03 | The system shall allow the System Administrator to generate a one-time password-reset link (valid 24 hours) for a user who forgot their password; the admin passes it to the user outside the system. | S |
| FR-04 | The system shall allow a user to edit their profile (name, password). | S |

### 2.2 Family and members (FAM)

| ID | Requirement | Priority |
|---|---|:-:|
| FR-05 | The system shall allow a logged-in user without a family to create a family with a name; the creator becomes the Family Owner. | M |
| FR-06 | The system shall allow the Owner to invite a person by entering their email address and choosing the role Adult or Child; the system generates an invitation link that the Owner copies and shares (e.g. via a messenger). | M |
| FR-07 | The system shall show a pending invitation to the invited person after they log in with the invited email (or open the link), and allow them to accept or decline it; an invitation expires after 7 days. | M |
| FR-08 | The system shall allow the Owner to change a member's role and to remove a member. | S |
| FR-09 | The system shall allow the Owner to transfer ownership to an Adult Member. | C |

### 2.3 Accounts (ACC)

| ID | Requirement | Priority |
|---|---|:-:|
| FR-10 | The system shall allow the Owner and Adults to create an account with name, type (Cash, Bank card, Savings, Credit card) and opening balance. | M |
| FR-11 | The system shall calculate and display the current balance of every account and the family total, using the formula in BR-07. | M |
| FR-12 | The system shall allow the Owner to edit or archive an account; archived accounts are hidden from forms but kept in history. | S |
| FR-13 | The system shall allow the Owner to share selected accounts with a Child Member. | S |

### 2.4 Categories (CAT)

| ID | Requirement | Priority |
|---|---|:-:|
| FR-14 | The system shall provide default income categories (Salary, Scholarship, Gift, Refunds, Other income) and expense categories (Food, Transport, Housing & utilities, Health, Education, Entertainment, Clothing, Other expense). | M |
| FR-15 | The system shall allow the Owner and Adults to create, rename and archive custom categories of type Income or Expense, with one level of subcategories. | S |

### 2.5 Transactions (TRX)

| ID | Requirement | Priority |
|---|---|:-:|
| FR-16 | The system shall allow a member to record an **INCOME** transaction: amount, destination account, income category, date, optional description. | M |
| FR-17 | The system shall allow a member to record an **EXPENSE** transaction: amount, source account, expense category, date, optional description. | M |
| FR-18 | The system shall allow the Owner and Adults to record a **TRANSFER** between two different family accounts: amount, source account, destination account, date, optional description. A transfer has no category. | M |
| FR-19 | The system shall validate every transaction against the business rules BR-01 … BR-10 and show a clear error message if a rule is broken. | M |
| FR-20 | The system shall allow a member to edit or delete a transaction according to the permission matrix; deletion is a soft delete. | M |
| FR-21 | The system shall display a transaction list that can be filtered by period, type, account, category and member, and searched by description. | M |
| FR-22 | The system shall allow the Owner and Adults to define a recurring transaction (any of the three types) with frequency Weekly, Monthly or Yearly and an optional end date. | S |
| FR-23 | The system shall automatically create the transactions of active recurring rules on their due date. | S |

### 2.6 Budgets (BUD)

| ID | Requirement | Priority |
|---|---|:-:|
| FR-24 | The system shall allow the Owner and Adults to set a monthly spending limit for an **expense** category. | M |
| FR-25 | The system shall show, for each budget, the limit, the amount spent (sum of EXPENSE transactions only), the remaining amount and the percentage used. | M |
| FR-26 | The system shall notify family members when a budget reaches 80 % and when it reaches or exceeds 100 %. | S |
| FR-27 | The system shall allow a budget to be copied to the next month. | C |

### 2.7 Savings goals (GOAL)

| ID | Requirement | Priority |
|---|---|:-:|
| FR-28 | The system shall allow the Owner and Adults to create a savings goal with name, target amount, optional target date and a linked Savings account. | S |
| FR-29 | The system shall show goal progress as the linked account's balance divided by the target amount, and mark the goal Achieved when the balance reaches the target. | S |

### 2.8 Reports (REP)

| ID | Requirement | Priority |
|---|---|:-:|
| FR-30 | The system shall show a monthly summary: total income, total expenses, net result (income − expenses) and account balances at month end. Transfers are excluded from income and expense totals. | M |
| FR-31 | The system shall show expenses by category for a selected period as a chart and a table. | M |
| FR-32 | The system shall show income and expenses by family member for a selected period. | S |
| FR-33 | The system shall show the balance history of an account over time. | C |
| FR-34 | The system shall export the filtered transaction list to CSV. | C |

### 2.9 Notifications (NOT)

| ID | Requirement | Priority |
|---|---|:-:|
| FR-35 | The system shall show in-app notifications (budget alerts, invitation accepted, recurring transaction created or skipped, goal achieved) with read/unread status. | S |

### 2.10 Administration and audit (ADM)

| ID | Requirement | Priority |
|---|---|:-:|
| FR-37 | The system shall record an audit entry for every create, update and delete of accounts, transactions, budgets and member roles: who, when, what, old value, new value. | S |
| FR-38 | The system shall allow the Owner to view the audit log of their family. | C |
| FR-39 | The system shall allow the System Administrator to block and unblock user accounts. | S |

### 2.11 Won't have in v1

| ID | Requirement | Priority |
|---|---|:-:|
| FR-40 | Import of bank statements / automatic sync with banks | W |
| FR-41 | Multiple currencies with exchange rates in one family | W |
| FR-42 | Receipt photo upload and recognition | W |
| FR-36 | Sending email (notifications, invitations, password reset) — decision D-3 | W |

## 3. Non-functional requirements

### 3.1 Security and privacy
| ID | Requirement | Priority |
|---|---|:-:|
| NFR-01 | Passwords shall be stored only as salted hashes (bcrypt or Argon2); plain-text passwords are never stored or logged. | M |
| NFR-02 | Role-based access control (permission matrix, doc 02 §3) shall be enforced on the server for every request. | M |
| NFR-03 | A user shall never be able to read or change data of a family they do not belong to (tenant isolation). | M |
| NFR-04 | All traffic shall use HTTPS in deployment. | S |
| NFR-05 | Sessions/tokens shall expire after 30 minutes of inactivity. | S |
| NFR-06 | After 5 failed login attempts the account shall be locked for 15 minutes. | S |
| NFR-07 | Personal data shall be processed in line with the Law of the RK "On Personal Data and Their Protection"; users must accept a privacy notice at registration. | S |

### 3.2 Data integrity
| ID | Requirement | Priority |
|---|---|:-:|
| NFR-08 | Money amounts shall be stored as fixed-point decimals (PostgreSQL `numeric(14,2)`), never as floating-point numbers. | M |
| NFR-09 | Saving a transaction and updating any cached balance shall happen in one database transaction (all-or-nothing). | M |
| NFR-10 | Database backups shall be made daily and kept for 14 days. | C |

### 3.3 Performance
| ID | Requirement | Priority |
|---|---|:-:|
| NFR-11 | Pages and API responses shall load in under 2 seconds for a family with up to 10 000 transactions. | S |
| NFR-12 | The system shall support at least 50 concurrent users in the demo environment. | C |

### 3.4 Usability and accessibility
| ID | Requirement | Priority |
|---|---|:-:|
| NFR-13 | A user shall be able to record a transaction in no more than 3 screens and 30 seconds. | M |
| NFR-14 | The interface shall be responsive and usable on screens from 360 px wide (phones) to desktop. | S |
| NFR-15 | Error messages shall explain what is wrong and how to fix it (e.g. "Amount must be greater than 0"). | M |
| NFR-16 | The interface shall be available in English; Russian and Kazakh are Could. | S |

### 3.5 Reliability, maintainability, compatibility
| ID | Requirement | Priority |
|---|---|:-:|
| NFR-17 | The system shall work in the latest two versions of Chrome, Firefox, Edge and Safari. | S |
| NFR-18 | Business logic (balance, budget, validation) shall have automated tests with ≥ 70 % coverage. | S |
| NFR-19 | The source code shall be kept in GitHub with pull-request review before merging to `main`. | M |
| NFR-20 | Monetary values shall be displayed in the family currency with thousands separators (e.g. `125 000,00 ₸`). | S |

## 4. Summary

| Priority | Functional | Non-functional |
|---|:-:|:-:|
| Must | 18 | 8 |
| Should | 15 | 10 |
| Could | 5 | 2 |
| Won't | 4 | 0 |
