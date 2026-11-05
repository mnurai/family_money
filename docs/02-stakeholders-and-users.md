# 02 — Stakeholders and Users

| | |
|---|---|
| **Document owner** | Nuray Mukhambet — Systems Analysis & Requirements |
| **Version** | 1.1 |
| **Date** | 2026-11-05 |

## 1. Stakeholders

| Stakeholder | Type | Interest in the system | Influence |
|---|---|---|---|
| Family Owner | Primary user | Full control over family finances, members and settings | High |
| Adult Member | Primary user | Record own and shared transactions, see family picture, plan budgets | High |
| Child Member | Secondary user | Track own pocket money, learn budgeting, limited access | Medium |
| System Administrator | Operator | Keep the system running, handle blocked/abusive accounts | Medium |
| Course instructor | Customer / evaluator | Correct IS analysis, design and working prototype | High |
| Project team | Developers | Clear, testable requirements | High |

## 2. User roles (actors)

### 2.1 Family Owner
The person who created the family. Exactly one per family.
- Manages members (invite, change role, remove) and family settings
- Creates and archives accounts and categories
- Sets budgets and savings goals
- Can edit or delete any transaction in the family
- Can transfer ownership to another Adult Member

### 2.2 Adult Member
A grown-up family member invited by the Owner.
- Sees all family accounts, transactions and reports
- Records income, expenses and transfers on any family account
- Edits/deletes only transactions they created
- Can create budgets and savings goals (if the Owner allows — v1: yes)

### 2.3 Child Member
A child or teenager invited by the Owner.
- Sees **only** the accounts the Owner has shared with them (e.g. "Aidar's pocket money")
- Records income and expenses on those accounts only
- Cannot record transfers, cannot delete transactions, cannot manage budgets, members or accounts
- Sees their own spending report

### 2.4 System Administrator
Platform-level role, not part of any family.
- Blocks/unblocks user accounts
- Generates one-time password-reset links for users who forgot their password (no email in v1)
- Views system health and the audit log
- **Cannot** view the content of a family's transactions (privacy)

### 2.5 Non-human actors
| Actor | Role in the system |
|---|---|
| Scheduler (system clock) | Triggers creation of recurring transactions and monthly budget resets |

## 3. Permission matrix

✅ = allowed, ❌ = not allowed, 🔸 = allowed with restriction

| Action | Owner | Adult | Child | Sys Admin |
|---|:-:|:-:|:-:|:-:|
| Register / log in / reset password | ✅ | ✅ | ✅ | ✅ |
| Create family | ✅ | — | — | ❌ |
| Invite / remove member, change roles | ✅ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ |
| Create / edit / archive account | ✅ | 🔸 create & edit, no archive | ❌ | ❌ |
| Share an account with a child | ✅ | ❌ | ❌ | ❌ |
| View accounts and balances | ✅ all | ✅ all | 🔸 shared accounts only | ❌ |
| Create custom category | ✅ | ✅ | ❌ | ❌ |
| Record INCOME | ✅ | ✅ | 🔸 shared accounts only | ❌ |
| Record EXPENSE | ✅ | ✅ | 🔸 shared accounts only | ❌ |
| Record TRANSFER | ✅ | ✅ | ❌ | ❌ |
| Edit / delete transaction | ✅ any | 🔸 own only | ❌ | ❌ |
| Create recurring transaction | ✅ | ✅ | ❌ | ❌ |
| Set budgets | ✅ | ✅ | ❌ | ❌ |
| Create savings goal | ✅ | ✅ | ❌ | ❌ |
| View family reports | ✅ | ✅ | 🔸 own data only | ❌ |
| Export CSV | ✅ | ✅ | ❌ | ❌ |
| View audit log | ✅ (own family) | ❌ | ❌ | ✅ (metadata only) |
| Block / unblock users | ❌ | ❌ | ❌ | ✅ |
| Generate password-reset link | ❌ | ❌ | ❌ | ✅ |
| See family total balance | ✅ | ✅ | ❌ | ❌ |

> **For Architecture & Security (Nuradin):** this matrix is the source for role-based access control. Every rule here must be enforced on the server, not only hidden in the UI (see NFR-02).

## 4. Personas (for design and testing)

**Aigerim, 38 — Family Owner.** Works as an accountant, manages the household money. Wants to see at the end of each month where the money went and to stop overspending on food delivery. Uses a laptop in the evening and her phone during the day.

**Daulet, 40 — Adult Member.** Earns most of the income, pays with his card. Moves money from card to cash often. Gets annoyed when tools count those transfers as "spending".

**Aidar, 14 — Child Member.** Gets 10 000 ₸ pocket money per week into a shared "Aidar — pocket money" cash account. Wants to save up for headphones (savings goal).
