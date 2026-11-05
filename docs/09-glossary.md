# 09 — Glossary

| | |
|---|---|
| **Document owner** | Nuray Mukhambet — Systems Analysis & Requirements |
| **Version** | 1.1 |
| **Date** | 2026-11-05 |

| Term | Definition |
|---|---|
| **Account** | A place where the family keeps money: cash wallet, bank card, savings account or credit card. Has a balance. |
| **Account balance** | Amount of money currently on an account, calculated from the opening balance and all transactions (BR-07). |
| **Adult Member** | Family member with full view access who can record all transaction types and edit their own transactions. |
| **Archive** | Hide an account or category from forms without deleting its history. |
| **Audit log** | Append-only list of who changed what and when. |
| **Budget** | Monthly spending limit for one expense category. Only expenses count toward it. |
| **Category** | Label that classifies an income (e.g. Salary) or an expense (e.g. Food). Transfers have no category. |
| **Child Member** | Family member with restricted access: sees and uses only accounts shared with them. |
| **Expense** | Transaction type `EXPENSE`: money leaves the family to the outside world (shop, landlord, taxi). |
| **Family** | Group of users who share accounts, budgets and reports. |
| **Family Owner** | The member who created the family; has all permissions. Exactly one per family. |
| **Family total** | Sum of balances of all non-archived accounts. Not changed by transfers. |
| **Income** | Transaction type `INCOME`: money comes into the family from the outside (salary, scholarship, gift). |
| **MoSCoW** | Prioritisation method: Must, Should, Could, Won't. |
| **Net result** | Total income − total expenses for a period. Transfers are excluded. |
| **Invitation link** | One-time link generated when the Owner invites someone; the Owner copies it and shares it outside the system. |
| **Opening balance** | Balance of an account at the moment it is added to the system. |
| **Recurring rule** | Template that automatically creates a transaction every week, month or year. |
| **Refund** | Money returned for an earlier purchase. Recorded as INCOME in the "Refunds" category; it does not reduce the original budget (BR-28). |
| **Savings goal** | Target amount linked to a savings account; progress = account balance ÷ target. |
| **Soft delete** | Marking a record as deleted (`is_deleted = true`) instead of removing it physically. |
| **Subcategory** | Category inside another category of the same type, e.g. Food → Restaurants. |
| **Tenant isolation** | Guarantee that a family can never access another family's data. |
| **Transaction** | **Any recorded movement of money** that changes at least one account balance. Has one of three types: INCOME, EXPENSE or TRANSFER. *Not a synonym for expense.* |
| **Transfer** | Transaction type `TRANSFER`: money moves between two of the family's own accounts (e.g. ATM withdrawal from card to cash, card to savings). Changes balances of both accounts but not the family total, income, expenses or budgets. |
