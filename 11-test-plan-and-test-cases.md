# 11 — Test Plan, Test Cases and Analytics Verification

| | |
|---|---|
| **Document owner** | Daniyarbekov Kairat — Testing, Analytics & Integration |
| **Version** | 1.0 (draft for team review) |
| **Date** | 2026-11-06 |
| **Based on** | Docs 01–10 (requirements v1.1, business rules v1.1, data dictionary v1.2, architecture v1.1) |

This document fills in the test case IDs that doc 08 reserved (TC-01 … TC-39, TC-N01 … TC-N20). It also contains the test data, the report/analytics checks (BR-12, BR-13), SQL queries that independently recompute balances and report numbers, the integration tests, and a list of questions found in the specification while writing the tests (§10).

> **Status:** nothing has been executed yet. Every test below starts as ⬜ *not run*. Statuses are updated in doc 08 after each test run.

---

## 1. Scope

**In scope:** all functional requirements FR-01 – FR-39 (except FR-36, Won't), all non-functional requirements NFR-01 – NFR-20, all business rules BR-01 – BR-28, and the integration between web app, API, PostgreSQL and the scheduler.

**Out of scope (v1):** bank import, multi-currency, receipts, e-mail sending (FR-36, FR-40 – FR-42). One negative test checks that the system really sends no e-mail (TC-06.7).

## 2. Test strategy

| Level | What is tested | Tool | Who writes | Target |
|---|---|---|---|---|
| Unit | Business-rule functions: balance (BR-07), validation (BR-01 – BR-11), budget % (BR-15, BR-16), report totals (BR-12, BR-13) | `pytest` | TI + AD | ≥ 70 % coverage of the service layer (NFR-18) |
| Database | CHECK / UNIQUE / ENUM constraints, append-only audit log, numeric type | `pytest` + test PostgreSQL, SQL scripts | TI + DB | Every rule marked `DB` in doc 06 |
| API / integration | Endpoints, RBAC per role, tenant isolation, transactions end to end, scheduler job | `pytest` + FastAPI `TestClient` (or `httpx`) | TI | Every FR and every permission-matrix row |
| UI / system | The screens and complete user flows | Manual scripts (this document) + optional Playwright | TI | Every Must requirement |
| Non-functional | Load, concurrency, browsers, responsive, usability | Locust (or k6), manual | TI | NFR-11, 12, 13, 14, 17 |

**Naming:** automated tests are named by rule or requirement ID, e.g. `test_br08_cash_cannot_go_negative`, `test_fr30_monthly_summary_worked_example` (as agreed in doc 10 §7).

**Defect severity**

| Severity | Meaning | Example |
|---|---|---|
| S1 Blocker | Wrong money, data leak, or no login | Transfer counted as expense; user A reads family B |
| S2 Major | A Must/Should requirement fails, workaround exists | Alert sent twice |
| S3 Minor | Wrong text, layout, Could requirement | Error message wording |

**Entry criteria:** feature merged to `main` through a reviewed PR (NFR-19), migrations applied, seed data loaded.
**Exit criteria for the demo:** all Must test cases ✅; no open S1/S2; ≥ 70 % coverage; worked example (§9) passes end to end.

## 3. Test environment and test data

### 3.1 Test users

| Handle | Role | Notes |
|---|---|---|
| `aigerim@test.kz` | Owner of family "Mukhambet" | persona from doc 02 |
| `daulet@test.kz` | Adult | |
| `aidar@test.kz` | Child | only account "Aidar — pocket money" shared |
| `admin@test.kz` | System Administrator | `is_system_admin = true`, in no family |
| `bolat@test.kz` | Owner of a **second** family "Other" | used for tenant isolation (NFR-03) |
| `newbie@test.kz` | Visitor / registered user without family | invitations, registration |

Password for all test users: `Test1234` (meets the rule: ≥ 8 characters, letter + digit).

### 3.2 Seed data (from the worked example, doc 06)

Family "Mukhambet", currency KZT, month **2026-11**. Opening balances: *Kaspi card* (BANK_CARD) 200 000, *Cash* (CASH) 10 000, *Savings* (SAVINGS) 0, *Aidar — pocket money* (CASH) 0 (shared with Aidar). Food budget for 2026-11: 60 000.

The six transactions of the worked example are loaded one by one by test **TC-E2E-01** (§9); a pre-loaded copy ("state after step 5") is used by report tests.

**Expected state after step 5:** Kaspi 385 000 · Cash 25 000 · Savings 100 000 · family total 510 000 · income 350 000 · expenses 50 000 · net +300 000 · Food budget 83 % (alert 80 % sent once).

### 3.3 Extra data set "REP-2" (for report tests)

Added on top of the state after step 5 (all dated 2026-11, same month):

| # | Transaction | Purpose |
|---|---|---|
| R1 | EXPENSE 12 000 Kaspi card, category *Food → Restaurants* (subcategory) | subcategory rolled into Food budget |
| R2 | EXPENSE 8 000 Kaspi card, *Transport*, created by Daulet | by-member report |
| R3 | INCOME 7 000 Kaspi card, *Refunds* (refund of a purchase) | BR-28 |
| R4 | EXPENSE 3 000 Cash, *Entertainment*, then **soft-deleted** | deleted rows excluded |
| R5 | INCOME 5 000 *Gift*, then EXPENSE 1 000 *Entertainment*, both on *Aidar — pocket money* by Aidar | child data |
| R6 | EXPENSE 20 000 Kaspi card, *Health*, dated **2026-10-31** | previous month, must not appear in November |

**Expected after REP-2 (November, non-deleted):** income = 350 000 + 7 000 + 5 000 = **362 000**; expenses = 50 000 + 12 000 + 8 000 + 1 000 = **71 000**; net = **+291 000**. Food budget spent = 45 000 + 5 000 + 12 000 = **62 000 → 103 %** → "exceeded" alert fires once. Expenses by category (percent of 71 000): Food 62 000 (87.3 %), Transport 8 000 (11.3 %), Entertainment 1 000 (1.4 %). Unless noted, R3 is recorded by Aigerim.

---

## 4. Functional test cases

Legend: **A** = automated (pytest/API), **M** = manual UI, **A+M** = both. Priority is taken from doc 03. "403/404" means the API must refuse; per doc 10 §3.1 a foreign object answers "not found".

### 4.1 Users and authentication

| ID | Req · Pri | Scenario | Expected result | Type |
|---|---|---|---|:-:|
| TC-01.1 | FR-01 · M | Register with name, new e-mail, password `Test1234`, privacy notice accepted | Account created, user logged in, asked to create a family (UC-01) | A+M |
| TC-01.2 | FR-01 | Register again with the same e-mail, then with `AIGERIM@TEST.KZ` (other case) | "An account with this email already exists" both times; no second row | A |
| TC-01.3 | FR-01 | Password `abc12` (5 chars), `abcdefgh` (no digit), `12345678` (no letter) | Password rules shown, no account created (see issue I-1 for exact rule) | A |
| TC-01.4 | FR-01 / NFR-01 | After TC-01.1 read `USER.password_hash` | Value is a bcrypt/Argon2 hash, ≠ plain text; same password for two users gives two different hashes (salt) | A |
| TC-01.5 | FR-01 / NFR-07 | Submit the form without accepting the privacy notice; invalid e-mail format `abc@` | Registration refused with clear message | A+M |
| TC-02.1 | FR-02 · M | Log in with correct credentials, then log out | Dashboard shown; after logout a protected API call returns 401 | A+M |
| TC-02.2 | FR-02 | Wrong password for existing user; unknown e-mail | Identical message, no hint which part is wrong (US-02.2) | A |
| TC-02.3 | FR-02 | "Forgot password?" link | Explains that the administrator can issue a reset link (US-02.4) | M |
| TC-02.4 | FR-02 | Log in with `Daulet@Test.kz` | Works (e-mail stored lower-case, doc 10 §4) | A |
| TC-03.1 | FR-03 · S | Admin generates reset link for Daulet | Link `/reset/<token>` shown once; DB holds only the SHA-256 hash and `reset_token_expires_at = now + 24 h` | A |
| TC-03.2 | FR-03 | Daulet opens link and sets new password `NewPass99` | Login works with new password, old one fails; `reset_token_hash` and expiry cleared; `failed_login_count` and `locked_until` reset | A |
| TC-03.3 | FR-03 | Use the same link a second time | "This link is not valid or has expired" | A |
| TC-03.4 | FR-03 | Set expiry to now − 1 s (or freeze time +24 h 1 min), open link | Same message; password unchanged | A |
| TC-03.5 | FR-03 | Generate a second link before using the first | Old link stops working, new one works | A |
| TC-03.6 | FR-03 / NFR-02 | Owner, Adult, Child try the admin endpoint | 403 | A |
| TC-03.7 | FR-03 | Check application log after TC-03.1 – .3 | Token string never appears in logs (doc 10 §5) | M |
| TC-03.8 | FR-03 | Audit log | Entry written for link creation and for use | A |
| TC-04.1 | FR-04 · S | Change profile name | New name shown to family; audit not required | A+M |
| TC-04.2 | FR-04 | Change password: new password breaks rules / valid | Rejected with rules / saved; old password then fails | A |
| TC-04.3 | FR-04 | Old token after password change | Still valid ≤ 30 min — **documented known limit** (doc 10 §4); test records actual behaviour, not a failure | A |

### 4.2 Family and members

| ID | Req · Pri | Scenario | Expected result | Type |
|---|---|---|---|:-:|
| TC-05.1 | FR-05 · M | `newbie` creates family "Test family" | Family exists with currency `KZT`; newbie is its only OWNER (BR-18) | A+M |
| TC-05.2 | FR-05 / BR-17 | Aigerim (already in a family) calls create-family | No "Create family" option in UI; API refuses; no second FAMILY_MEMBER row | A |
| TC-05.3 | FR-05 / FR-14 | Immediately after creation open categories | All default categories are available (see TC-14.1) | A |
| TC-06.1 | FR-06 · M | Owner invites `newbie@test.kz` as Adult | Link with "Copy link" shown; invitation listed "Pending"; `expires_at = created + 7 days` | A+M |
| TC-06.2 | FR-06 | DB check of `INVITATION.token` | 64-hex SHA-256 value, not the URL secret | A |
| TC-06.3 | FR-06 / BR-19 | Invite same e-mail again (also with different case) | No duplicate row; behaviour per issue I-3 | A |
| TC-06.4 | FR-06 / NFR-02 | Adult and Child call the invite endpoint | 403 | A |
| TC-06.5 | FR-06 | Try role `OWNER` in the request body | Rejected (CHECK role ≠ OWNER) | A |
| TC-06.6 | FR-06 | Invalid e-mail format | Clear validation message | A |
| TC-06.7 | D-3 | After TC-06.1 inspect outgoing mail (SMTP sink / code search for mail libraries) | No e-mail sent | M |
| TC-07.1 | FR-07 · M | `newbie` logs in with the invited e-mail (no link) | Pending invitation shown; Accept → member with the invited role; Owner gets `INVITE_ACCEPTED` notification | A+M |
| TC-07.2 | FR-07 | Open the link while logged in as the invited user | Same invitation shown and acceptable | A |
| TC-07.3 | FR-07 | Open the link as another logged-in user | "This invitation was sent to another email address" | A |
| TC-07.4 | FR-07 / BR-19 | Invitation older than 7 days (set `expires_at` in the past), click Accept | "This invitation has expired, ask the family owner for a new one"; status becomes EXPIRED | A |
| TC-07.5 | FR-07 | Decline | Status DECLINED; Owner gets `INVITE_DECLINED`; user stays without family | A |
| TC-07.6 | FR-07 / BR-17 | Accept while the user already belongs to a family | Refused with explanation; no second membership | A |
| TC-07.7 | FR-07 | Open an accepted/declined invitation link again, and a random token | "This link is not valid or has expired" | A |
| TC-07.8 | FR-07 | 11 attempts per minute on `/invite/<random>` from one IP | Rate limit answers after 10 (doc 10 §5) | A |
| TC-08.1 | FR-08 · S | Owner changes Aidar Child → Adult | At Aidar's next request he has Adult permissions (e.g. sees all accounts) | A |
| TC-08.2 | FR-08 / BR-20 | Owner removes Daulet | Daulet gets no family data (403/404); his past transactions stay with his name | A |
| TC-08.3 | FR-08 / BR-18 | Owner removes self / leaves | Refused: transfer ownership first | A |
| TC-08.4 | FR-08 / NFR-02 | Adult and Child try to change a role or remove a member | 403 | A |
| TC-09.1 | FR-09 · C | Owner transfers ownership to Daulet (Adult) | Daulet is OWNER, Aigerim becomes Adult; exactly one OWNER (BR-18) | A |
| TC-09.2 | FR-09 | Transfer to a Child; transfer by non-owner | Rejected | A |

### 4.3 Accounts and categories

| ID | Req · Pri | Scenario | Expected result | Type |
|---|---|---|---|:-:|
| TC-10.1 | FR-10 · M | Owner creates "Kaspi card", BANK_CARD, 200 000 | Appears with balance 200 000 ₸ (US-06.1) | A+M |
| TC-10.2 | FR-10 | Create a second account named "Kaspi card" | Error (UQ family + name) | A |
| TC-10.3 | FR-10 / BR-24 | Negative opening balance on CASH; negative on CREDIT_CARD | CASH rejected; CREDIT_CARD allowed within limit rules | A |
| TC-10.4 | FR-10 | Create CREDIT_CARD with limit 100 000 and opening 0 | Saved; limit shown | A |
| TC-10.5 | FR-10 / NFR-02 | Adult creates account; Child creates account | Adult ✅ (create & edit); Child 403 | A |
| TC-11.1 | FR-11 · M | Balance of each account after the worked example steps 1 – 5 | Equals the table in doc 06 after every step (see §9) | A |
| TC-11.2 | FR-11 / BR-13 | Family total with one archived account | Sum of non-archived accounts only | A |
| TC-11.3 | FR-11 / BR-07 | Soft-delete a transaction | Balance recalculated without it | A |
| TC-11.4 | FR-11 / BR-13 | Child opens dashboard | No family total, only own shared accounts | A+M |
| TC-11.5 | FR-11 / NFR-09 | Cached balance (if Gulnaz stores `current_balance`) vs SQL query in §6.3 for all accounts after 200 random transactions | Always equal | A |
| TC-12.1 | FR-12 · S | Owner renames an account / changes credit limit | Saved, audit entry written | A |
| TC-12.2 | FR-12 / BR-21 | Archive account with balance ≠ 0 | "Move the remaining money to another account first" | A |
| TC-12.3 | FR-12 | Archive account with balance 0 | Hidden from forms; history still visible; total unchanged | A |
| TC-12.4 | FR-12 / BR-06 | Record a transaction on an archived account | Rejected | A |
| TC-12.5 | FR-12 | Adult tries to archive | 403 (Adult: create & edit, no archive) | A |
| TC-13.1 | FR-13 · S | Owner shares "Aidar — pocket money" with Aidar | Aidar sees only that account (US-07.1) | A+M |
| TC-13.2 | FR-13 / BR-10 | Aidar opens the transaction form | Only Income and Expense; no Transfer | M |
| TC-13.3 | FR-13 / BR-10 | Aidar calls API for "Kaspi card" (read balance, record expense) | 403/404 | A |
| TC-13.4 | FR-13 | Adult tries to share an account; share with an Adult member | 403 / rejected (target must be Child) | A |
| TC-14.1 | FR-14 · M | List default categories | Income: Salary, Scholarship, Gift, Refunds, Other income. Expense: Food, Transport, Housing & utilities, Health, Education, Entertainment, Clothing, Other expense | A |
| TC-14.2 | FR-14 / BR-22 | Rename / delete a default category | Rejected | A |
| TC-15.1 | FR-15 · S | Owner and Adult create custom category "Pets" (EXPENSE) and subcategory "Vet" | Saved; "Vet" is EXPENSE like its parent (BR-23) | A |
| TC-15.2 | FR-15 / BR-23 | Create a sub-subcategory; create subcategory with different type than parent | Rejected | A |
| TC-15.3 | FR-15 / BR-22 | Delete a category used by a transaction or a budget | Rejected; archive allowed | A |
| TC-15.4 | FR-15 / NFR-02 | Child creates a category | 403 | A |

### 4.4 Transactions

| ID | Req · Pri | Scenario | Expected result | Type |
|---|---|---|---|:-:|
| TC-16.1 | FR-16 · M | Aigerim records INCOME 350 000, *Salary*, to Kaspi card | Kaspi balance +350 000; monthly income +350 000; audit entry written (US-09.1) | A+M |
| TC-16.2 | FR-16 / BR-03 | INCOME with a source account; INCOME without category; INCOME with an EXPENSE category | Each rejected (API and DB CHECK) | A |
| TC-16.3 | FR-16 / BR-10 | Aidar records INCOME on his shared account; on Kaspi card | Allowed; refused (403/404) | A |
| TC-16.4 | FR-16 / US-09.3 | Income in a month with a budget | No budget changes | A |
| TC-16.5 | FR-16 / BR-28 | Refund 7 000 as INCOME, category *Refunds* | Original expense unchanged; Food (or original) budget **not** reduced; income +7 000 | A |
| TC-17.1 | FR-17 · M | Record EXPENSE 5 000, *Food*, from Cash (worked-example step 4: Cash 30 000 → 25 000) | Cash decreases by 5 000; Food budget spent +5 000 (US-08.1) | A+M |
| TC-17.2 | FR-17 / BR-04 | EXPENSE with a destination account; without category; with INCOME category | Each rejected | A |
| TC-17.3 | FR-17 / BR-08 | Cash balance 3 000, expense 5 000 | "Not enough money on Cash (balance 3 000 ₸)"; nothing saved | A+M |
| TC-17.4 | FR-17 / BR-08 | Expense exactly equal to balance | Accepted; balance 0 | A |
| TC-17.5 | FR-17 / BR-08 | Credit card limit 100 000, balance 0: expense 100 000, then 0.01 | First accepted (balance −100 000), second rejected | A |
| TC-17.6 | FR-17 | Only expense categories are offered in the form | Verified in UI; API rejects wrong type | A+M |
| TC-18.1 | FR-18 · M | Transfer 20 000 Kaspi → Cash (step 2) | Kaspi −20 000, Cash +20 000; family total unchanged; income, expense, category reports and budgets unchanged (US-10.1, .2) | A+M |
| TC-18.2 | FR-18 / BR-05 | Same account in From and To; transfer with a category | "Choose two different accounts"; category rejected | A |
| TC-18.3 | FR-18 / BR-08 | Transfer larger than source balance | Rejected, both balances unchanged | A |
| TC-18.4 | FR-18 / BR-10 | Child tries a transfer (UI and API) | No option in UI; API 403 | A+M |
| TC-18.5 | FR-18 / FR-29 | Transfer 100 000 into Savings with a goal of 500 000 | Goal progress 20 %; not an expense (step 5) | A |
| TC-19.1 | FR-19 · M | Amount boundaries: 0, −5, `abc`, 0.001, 0.01, 999 999 999 999.99, 1 000 000 000 000.00 | Rejected: 0, −5, `abc`, 0.001, 1 000 000 000 000.00. Accepted: 0.01, 999 999 999 999.99 (BR-02) | A |
| TC-19.2 | FR-19 / BR-09 | Date today; date yesterday; date tomorrow | OK; OK; "Date cannot be later than today…" | A |
| TC-19.3 | FR-19 / BR-06 | Account or category of **another family** (use ids of `bolat`'s family) | Rejected / not found | A |
| TC-19.4 | FR-19 / BR-01 | Type value `REFUND` or empty | Rejected (ENUM) | A |
| TC-19.5 | FR-19 / NFR-15 | Read every validation message | Each says what is wrong and how to fix it | M |
| TC-19.6 | FR-19 | Same checks directly in SQL (INSERT bypassing the API) | CHECK constraints reject BR-02, BR-03, BR-04, BR-05 violations | A |
| TC-20.1 | FR-20 · M | Edit expense 5 000 → 4 000 | Balance and budget recalculated; audit has old and new value (US-11.1, .4) | A+M |
| TC-20.2 | FR-20 / BR-11 | Delete a transaction | Gone from lists and reports; row remains with `is_deleted = true`; audit entry | A |
| TC-20.3 | FR-20 / BR-11 | Daulet (Adult) edits/deletes Aigerim's transaction; his own | 403; allowed | A |
| TC-20.4 | FR-20 / BR-11 | Aigerim (Owner) edits Daulet's transaction | Allowed | A |
| TC-20.5 | FR-20 | Aidar (Child) edits or deletes his own transaction | 403 | A |
| TC-20.6 | FR-20 / BR-08 | Edit changes type or account so a balance would go negative; delete an INCOME that funded later spending | Rejected / warned (UC-06 4a); edit validated "without the old version" | A |
| TC-20.7 | FR-20 / UC-06 | Change type EXPENSE → TRANSFER | Category must be cleared, destination required; all rules re-checked | A |
| TC-21.1 | FR-21 · M | Filter by period, type, account, category, member — each alone and combined | Only matching rows; combined filter = intersection | A |
| TC-21.2 | FR-21 | Search `pizza` / `PIZZA` / `izz` | Case-insensitive match on description | A |
| TC-21.3 | FR-21 | 120 transactions | Sorted newest first, 50 per page, 3 pages | A |
| TC-21.4 | FR-21 / NFR-03 | Filter by an account or member id of another family | Empty / not found, never foreign data | A |

### 4.5 Recurring transactions

| ID | Req · Pri | Scenario | Expected result | Type |
|---|---|---|---|:-:|
| TC-22.1 | FR-22 · S | Create monthly rule "Rent 150 000 from Kaspi card on the 1st" | Rule saved, `next_run_date` set | A |
| TC-22.2 | FR-22 | Create rules of each type incl. TRANSFER 50 000 Kaspi → Savings; weekly; yearly; end date before start | Valid ones saved; invalid end date rejected (CHECK) | A |
| TC-22.3 | FR-22 / NFR-02 | Child creates a rule | 403 | A |
| TC-23.1 | FR-23 · S | Set `next_run_date = today`, run the scheduler function | One normal EXPENSE exists with `recurring_rule_id`; balance changed; `next_run_date` +1 month; creator gets `RECURRING_CREATED` | A |
| TC-23.2 | FR-23 / BR-26 | Balance too small (BR-08) | No transaction; creator gets `RECURRING_SKIPPED`; `next_run_date` still moves forward | A |
| TC-23.3 | FR-23 | Run the job twice on the same day | No duplicate transaction (idempotent) — see issue I-6 | A |
| TC-23.4 | FR-23 | Job not run for 3 days, rule due 3 days ago | Behaviour defined and documented (catch-up or one run); see issue I-6 | A |
| TC-23.5 | FR-23 | `end_date` passed | Rule becomes inactive; no more transactions (US-13.4) | A |
| TC-23.6 | FR-23 | Monthly rule on the 31st, run in a 30-day month and in February | Next date is last day of the month, not skipped | A |

### 4.6 Budgets, alerts, goals

| ID | Req · Pri | Scenario | Expected result | Type |
|---|---|---|---|:-:|
| TC-24.1 | FR-24 · M | Owner/Adult set Food = 60 000 for 2026-11 | Saved | A+M |
| TC-24.2 | FR-24 / BR-14 | Budget on an INCOME category; limit 0 or −1; second budget for same category and month | Rejected; rejected; opens existing for editing (no duplicate; DB UNIQUE) | A |
| TC-24.3 | FR-24 | Child sets a budget | 403 | A |
| TC-25.1 | FR-25 · M | After worked example step 4 | Limit 60 000, spent 50 000, remaining 10 000, used 83 % | A |
| TC-25.2 | FR-25 / BR-15 | Add R1 (*Food → Restaurants*) | Spent includes the subcategory (62 000) | A |
| TC-25.3 | FR-25 / BR-15 | INCOME and TRANSFER in category/date range; EXPENSE dated in October; soft-deleted expense | None of them affect the budget | A |
| TC-25.4 | FR-25 | Colour/bar: 79 %, 80 %, 99 %, 100 % | green, yellow, yellow, red (UC-07) | M |
| TC-26.1 | FR-26 · S | Spent 45 000 → add 5 000 (83 %) | Exactly one `BUDGET_80` for Owner and each Adult; none for Child (US-15.1) | A |
| TC-26.2 | FR-26 / BR-16 | Add another small expense (still < 100 %) | No second 80 % alert (US-15.2) | A |
| TC-26.3 | FR-26 | Cross 100 % | One `BUDGET_100` | A |
| TC-26.4 | FR-26 / BR-16 | Jump from 70 % straight to 105 % in one expense | Both thresholds handled; defined behaviour (80 % and 100 %, or 100 % only) documented — issue I-7 | A |
| TC-26.5 | FR-26 / BR-16 | Edit/delete expense so spending falls below 80 %, then raise again | Alert can fire again (BR-16) | A |
| TC-27.1 | FR-27 · C | Copy budgets to next month | Copies for categories without a budget; existing ones untouched; alert flags reset | A |
| TC-28.1 | FR-28 · S | Create goal "Summer trip" 500 000 linked to Savings | Saved (US-16.1) | A |
| TC-28.2 | FR-28 / BR-25 | Link to a CASH account; link a second goal to same account; target 0 | Rejected | A |
| TC-29.1 | FR-29 · S | Savings = 100 000 | Progress 20 % | A |
| TC-29.2 | FR-29 | Balance reaches or exceeds 500 000 | Status ACHIEVED; `GOAL_ACHIEVED` sent once | A |
| TC-29.3 | FR-29 / BR-25 | Transfer into Savings | Not counted in expense report or budgets | A |

### 4.7 Reports and CSV (analytics) — detailed checks in §6

| ID | Req · Pri | Scenario (short) | Type |
|---|---|---|:-:|
| TC-30 | FR-30 · M | Monthly summary = worked example: income 350 000, expenses 50 000, net +300 000, balances at month end; REP-2 variant | A+M |
| TC-31 | FR-31 · M | Expenses by category: table + chart, percentages | A+M |
| TC-32 | FR-32 · S | By member: income and expense per member | A |
| TC-33 | FR-33 · C | Balance history of one account | A |
| TC-34 | FR-34 · C | CSV export of filtered list | A+M |

### 4.8 Notifications, audit, administration

| ID | Req · Pri | Scenario | Expected result | Type |
|---|---|---|---|:-:|
| TC-35.1 | FR-35 · S | Trigger each type: `BUDGET_80/100`, `INVITE_ACCEPTED/DECLINED`, `RECURRING_CREATED/SKIPPED`, `GOAL_ACHIEVED` | Notification appears for the right recipients with readable text | A |
| TC-35.2 | FR-35 | Open one notification | Unread → read; unread counter decreases | A+M |
| TC-35.3 | FR-35 / NFR-03 | User A lists notifications | Only own notifications | A |
| TC-37.1 | FR-37 · S | Create, update, delete: account, transaction, budget; change member role | One audit entry each with actor, time, entity, action, old/new values (`jsonb`) | A |
| TC-37.2 | FR-37 / BR-27 | Application DB user runs `UPDATE` and `DELETE` on `audit_log` | Permission denied (INSERT and SELECT only) | A |
| TC-37.3 | FR-37 | Transaction edit where the transaction fails validation | No audit entry for a change that was not saved | A |
| TC-38.1 | FR-38 · C | Owner opens audit log | Sees own family's entries only | A |
| TC-38.2 | FR-38 / NFR-02 | Adult and Child request it | 403 | A |
| TC-38.3 | FR-38 | Admin requests the audit log | Metadata only, no transaction content (doc 02 §3) | A |
| TC-39.1 | FR-39 · S | Admin blocks Daulet with a reason | `is_active = false`; audit entry; login shows "Your account has been blocked" (US-20.1) | A+M |
| TC-39.2 | FR-39 | Daulet already logged in; admin blocks him; Daulet clicks | Next request refused immediately (`is_active` read on every request) | A |
| TC-39.3 | FR-39 | Unblock | Daulet can log in again; audit entry | A |
| TC-39.4 | FR-39 | Admin tries to read a family's transactions/accounts | 403 (privacy, US-20.3) | A |
| TC-39.5 | FR-39 | Non-admin calls block endpoint | 403 | A |

---

## 5. Business-rule coverage

Every rule must be covered by at least one test (doc 06 requirement). `DB` rules have an additional SQL-level test.

| Rule | Covered by | DB test | Rule | Covered by | DB test |
|---|---|:-:|---|---|:-:|
| BR-01 | TC-19.4 | ✅ | BR-15 | TC-25.2, 25.3 | — |
| BR-02 | TC-19.1, TC-19.6 | ✅ | BR-16 | TC-26.1 – 26.5 | — |
| BR-03 | TC-16.2, TC-19.6 | ✅ | BR-17 | TC-05.2, TC-07.6 | ✅ |
| BR-04 | TC-17.2, TC-19.6 | ✅ | BR-18 | TC-08.3, TC-09.1 | — |
| BR-05 | TC-18.2, TC-19.6 | ✅ | BR-19 | TC-06.3, TC-07.4 | — |
| BR-06 | TC-12.4, TC-19.3 | — | BR-20 | TC-08.2 | — |
| BR-07 | TC-11.1, 11.3, 11.5, TC-E2E-01 | — | BR-21 | TC-12.2, 12.3 | — |
| BR-08 | TC-17.3 – 17.5, TC-18.3, TC-20.6, TC-23.2 | — | BR-22 | TC-14.2, TC-15.3 | — |
| BR-09 | TC-19.2 | — | BR-23 | TC-15.1, 15.2 | — |
| BR-10 | TC-13.2, 13.3, TC-16.3, TC-18.4 | — | BR-24 | TC-10.3 | — |
| BR-11 | TC-20.2 – 20.5 | — | BR-25 | TC-28.2, TC-29.3 | ✅ |
| BR-12 | TC-30, TC-31, TC-18.1 | — | BR-26 | TC-23.1 – 23.6 | — |
| BR-13 | TC-11.2, TC-11.4, TC-30 | — | BR-27 | TC-37.2 | ✅ |
| BR-14 | TC-24.2 | ✅ | BR-28 | TC-16.5, TC-25.3 | — |

---

## 6. Analytics: report tests and independent verification

Reports are only trustworthy if the numbers can be recomputed by a different method. For every report test the expected value is computed **in SQL directly from the tables** (not from the application code) and compared with what the API and UI return.

> Table and column names follow doc 07; adjust to the final schema from Data & Database (e.g. `transactions`).

### 6.1 Report test cases

| ID | Req | Data | Check | Expected |
|---|---|---|---|---|
| TC-30.1 | FR-30 / BR-12 | Worked example after step 6 attempt | Income / expenses / net | 350 000 / 50 000 / **+300 000** (US-17.3) |
| TC-30.2 | FR-30 / BR-12 | Same | Transfers #2 and #5 excluded | Totals identical with and without them |
| TC-30.3 | FR-30 | Same | Balances at month end | Kaspi 385 000 · Cash 25 000 · Savings 100 000 |
| TC-30.4 | FR-30 / BR-13 | Same | Family total | **510 000** = 210 000 + 350 000 − 50 000 |
| TC-30.5 | FR-30 | REP-2 | Totals | 362 000 / 71 000 / +291 000; October's 20 000 (R6) and deleted R4 not included |
| TC-30.6 | FR-30 | Month with no transactions | Page content | "No transactions in this period" + add button (UC-09 2a) |
| TC-30.7 | FR-30 | Transaction on 2026-11-30 and 2026-12-01 | Month boundaries | 30 Nov counted in November, 1 Dec not |
| TC-30.8 | FR-30 / BR-28 | R3 refund | Appears as income, expenses unchanged | Income +7 000, expenses +0 |
| TC-31.1 | FR-31 | REP-2 | Category table | Food 62 000 incl. *Restaurants*; amounts sum to total expenses 71 000; % column sums to 100 % ± rounding |
| TC-31.2 | FR-31 | Any | Transfers, income, deleted rows | Never appear as a category slice |
| TC-31.3 | FR-31 | Any | Chart and table agree | Same numbers; chart legend = table rows |
| TC-31.4 | FR-31 | Custom period 2026-10-01 – 2026-11-30 | Period selector | Includes R6 (Health 20 000) |
| TC-32.1 | FR-32 | REP-2 | By member | Aigerim income 357 000 (350 000 + 7 000), expenses 62 000; Daulet expenses 8 000 (R2); Aidar income 5 000, expenses 1 000 — each member's rows sum to the family totals except where a member was removed (name kept, BR-20) |
| TC-32.2 | FR-32 / BR-13 | Login as Aidar | Child report | Only own data (5 000 / 1 000), no family total, no other members |
| TC-32.3 | FR-32 / BR-20 | Remove Daulet | His transactions still listed under his name | |
| TC-33.1 | FR-33 / BR-07 | Kaspi card, steps 0 – 5 | Balance history points | 200 000 → 550 000 → 530 000 → 485 000 → 485 000 → 385 000; last point equals current balance |
| TC-33.2 | FR-33 | Soft-delete a transaction | History recalculated without it | |
| TC-34.1 | FR-34 / US-19 | Filter: type = EXPENSE, month = 2026-11 | CSV columns | date, type, amount, source account, destination account, category, member, description — in this order |
| TC-34.2 | FR-34 | Description `Кофе, "латте"` (Cyrillic, comma, quotes) | Opens correctly in Excel | UTF-8 **with BOM**; comma/quotes escaped; Cyrillic readable |
| TC-34.3 | FR-34 | Row count and amount sum | CSV vs screen vs SQL | Equal; amounts use `.` decimal point and no thousands separator (or documented otherwise) |
| TC-34.4 | FR-34 / NFR-02 | Child calls export | 403 | |
| TC-34.5 | FR-34 | Cells starting with `=`, `+`, `-`, `@` in description | Escaped against spreadsheet formula injection | |

### 6.2 Report numbers must not change when only transfers are added (property test)

`test_br12_transfers_never_change_report_totals`: generate random TRANSFERs between valid accounts, record before/after income, expenses, net, per-category totals, budget % and family total. **All must be identical.** The same test with random EXPENSEs must change expenses and the budget by exactly the amount.

### 6.3 Reconciliation SQL

Run after every test run (and as a CI check on the seed database). Any non-empty result = defect.

```sql
-- 6.3.1 Account balance (BR-07). Compare with API / UI / cached current_balance.
SELECT a.account_id, a.name,
       a.opening_balance
       + COALESCE(SUM(t.amount) FILTER (WHERE t.destination_account_id = a.account_id), 0)
       - COALESCE(SUM(t.amount) FILTER (WHERE t.source_account_id      = a.account_id), 0) AS balance
FROM   account a
LEFT   JOIN transactions t
       ON  NOT t.is_deleted
       AND (t.source_account_id = a.account_id OR t.destination_account_id = a.account_id)
WHERE  a.family_id = :family_id
GROUP  BY a.account_id, a.name;

-- 6.3.2 Family total (BR-13): non-archived accounts only.
--   = SUM(balance) from 6.3.1 WHERE NOT a.is_archived

-- 6.3.3 Monthly summary (BR-12). :month = first day of month, e.g. '2026-11-01'.
SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'),  0) AS total_income,
       COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0) AS total_expenses,
       COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'),  0)
     - COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0) AS net_result
FROM   transactions
WHERE  family_id = :family_id AND NOT is_deleted
  AND  transaction_date >= :month
  AND  transaction_date <  :month + INTERVAL '1 month';

-- 6.3.4 Budget spent incl. subcategories (BR-15).
SELECT COALESCE(SUM(t.amount), 0) AS spent
FROM   transactions t
JOIN   category c ON c.category_id = t.category_id
WHERE  t.family_id = :family_id AND t.type = 'EXPENSE' AND NOT t.is_deleted
  AND  (c.category_id = :category_id OR c.parent_id = :category_id)
  AND  t.transaction_date >= :month
  AND  t.transaction_date <  :month + INTERVAL '1 month';

-- 6.3.5 Integrity checks that must return ZERO rows.
-- (a) wrong field combination for the type (BR-03..BR-05)
SELECT transaction_id FROM transactions
WHERE NOT (
  (type='INCOME'   AND source_account_id IS NULL     AND destination_account_id IS NOT NULL AND category_id IS NOT NULL) OR
  (type='EXPENSE'  AND source_account_id IS NOT NULL AND destination_account_id IS NULL     AND category_id IS NOT NULL) OR
  (type='TRANSFER' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL
                   AND source_account_id <> destination_account_id AND category_id IS NULL));
-- (b) non-positive amount or future date (BR-02, BR-09)
SELECT transaction_id FROM transactions WHERE amount <= 0 OR transaction_date > CURRENT_DATE;
-- (c) transaction touching an account of another family (BR-06)
SELECT t.transaction_id FROM transactions t
JOIN account a ON a.account_id IN (t.source_account_id, t.destination_account_id)
WHERE a.family_id <> t.family_id;
-- (d) family without exactly one owner (BR-18)
SELECT f.family_id FROM family f
LEFT JOIN family_member m ON m.family_id = f.family_id AND m.role = 'OWNER' AND m.removed_at IS NULL
GROUP BY f.family_id HAVING COUNT(m.member_id) <> 1;
```

---

## 7. Integration tests

| ID | Components | Scenario | Expected |
|---|---|---|---|
| TC-I01 | UI ↔ API ↔ DB | Record an expense in the UI, then read the balance through the API and via SQL 6.3.1 | Three values equal |
| TC-I02 | API ↔ DB (NFR-09) | Make the balance update fail (fault injection / constraint violation) after inserting the transaction | Whole operation rolled back: no transaction row, no balance change, no audit row, no notification |
| TC-I03 | API ↔ service layer | Same request via API and via scheduler (recurring) | Same validation result for the same data (one service function, doc 10 §2) |
| TC-I04 | Scheduler ↔ DB ↔ Notifications | UC-11 end to end for one OK rule and one skipped rule | Transaction + `RECURRING_CREATED`; no transaction + `RECURRING_SKIPPED`; both rules advanced |
| TC-I05 | Expense ↔ Budget ↔ Notification | Worked example step 4 | Budget 83 %, `alert_80_sent = true`, one notification per Owner/Adult, none for Child |
| TC-I06 | Transfer ↔ Goal ↔ Notification | Transfer that reaches the goal target | Goal ACHIEVED, one `GOAL_ACHIEVED` per member (UC-05 4c) |
| TC-I07 | Auth ↔ every endpoint | Request without cookie, expired cookie, tampered cookie | 401 everywhere (endpoint list generated from the router) |
| TC-I08 | Auth ↔ family data | `family_id` placed in URL/body that differs from the session | Ignored or refused; never used (doc 10 §3.1) |
| TC-I09 | Admin ↔ family endpoints | Admin token on every family endpoint | 403 |
| TC-I10 | Migrations | Empty DB → `alembic upgrade head` → seed → run all DB tests; then `downgrade` / `upgrade` | Clean; no manual SQL needed |
| TC-I11 | Time zone | Run with server in UTC and a user in Almaty, test at 23:30 local on the last day of month | "Today" (BR-09), month boundaries and the 00:05 job use one defined time zone — see issue I-8 |

---

## 8. Non-functional test cases

| ID | Req · Pri | Method | Procedure | Pass criterion |
|---|---|---|---|---|
| TC-N01 | NFR-01 · M | Code review + DB | Inspect `password_hash` (TC-01.4); search code and logs for plain-text passwords | Only salted hash; nothing in logs |
| TC-N02 | NFR-02 · M | API tests | For **every row of the permission matrix (doc 02 §3)** call the endpoint as Owner, Adult, Child, Admin and as anonymous. Generate the table-driven test from the permission table in code | Result equals ✅/❌/🔸 in the matrix for all 4 roles × all actions; UI hiding is irrelevant |
| TC-N03 | NFR-03 · M | API tests | User of family A requests accounts, transactions, budgets, goals, categories, notifications, audit entries, reports and CSV of family B by id (GET, PUT, DELETE) | Always 403/404; the same response for "exists" and "does not exist" |
| TC-N04 | NFR-04 · S | Deployment check | Open `http://` URL; inspect cookie flags | Redirect to HTTPS; cookie `Secure`, `HttpOnly`, `SameSite=Lax` |
| TC-N05 | NFR-05 · S | Manual + automated with frozen time | Idle 29 min → request; idle 31 min → request | 29 min: ok (and cookie renewed); 31 min: 401 and login page |
| TC-N06 | NFR-06 · S | Automated | 5 wrong passwords, then the correct one; then wait 15 min (frozen time); 4 wrong + 1 correct resets counter | 6th attempt refused even with correct password; after 15 min login works; counter reset on success |
| TC-N07 | NFR-07 · S | Review | Privacy notice shown at registration, acceptance recorded (issue I-9) | Notice text exists; acceptance stored |
| TC-N08 | NFR-08 · M | Schema review + test | All money columns are `numeric(14,2)`; add 0.10 + 0.20 ten thousand times | Sum is exactly 3 000.00, no float artefacts |
| TC-N09 | NFR-09 · M | Fault injection | See TC-I02, plus 2 parallel requests spending the last 1 000 ₸ from the same account | Never both succeed; balance never < 0 (row lock / serialisable) |
| TC-N10 | NFR-10 · C | Restore test | Backup, drop DB, restore | Row counts and §6.3.5 checks identical; backups kept 14 days |
| TC-N11 | NFR-11 · S | Load test, 10 000 transactions in one family | Measure: transaction list, monthly summary, category report, budgets, dashboard | p95 < 2 s each |
| TC-N12 | NFR-12 · C | Load test | 50 virtual users: login, list, add transaction, report for 5 min | No errors > 1 %; p95 < 2 s |
| TC-N13 | NFR-13 · M | Usability test with 3 people, stopwatch | Record one expense from the dashboard | ≤ 3 screens and ≤ 30 s for all three |
| TC-N14 | NFR-14 · S | Manual | Widths 360, 768, 1440 px: login, dashboard, add transaction, reports table | No horizontal scrolling, buttons reachable, tables readable |
| TC-N15 | NFR-15 · M | Review | Collect all validation messages (use list in this document and from AD) | Each states problem + how to fix |
| TC-N16 | NFR-16 · S | Manual | Whole UI in English; no hard-coded texts in code | English complete (RU/KZ are Could) |
| TC-N17 | NFR-17 · S | Cross-browser | Latest two versions of Chrome, Firefox, Edge, Safari: smoke test (login, add transaction, report, CSV) | Identical results |
| TC-N18 | NFR-18 · S | CI | `pytest --cov` on service layer | ≥ 70 %; build fails below |
| TC-N19 | NFR-19 · M | GitHub settings | Try to push directly to `main`; open a PR without review | Push blocked; merge blocked until 1 review |
| TC-N20 | NFR-20 · S | UI check | Amount 125000 shown; 0; negative balance on credit card; 1 234 567.5 | `125 000,00 ₸`; `0,00 ₸`; `−50 000,00 ₸`; `1 234 567,50 ₸` |

---

## 9. End-to-end script: worked example (TC-E2E-01)

Start from a family with the opening balances in §3.2 and a Food budget of 60 000 for November 2026. Perform the steps as Aigerim. After **every** step compare the UI, the API and SQL 6.3.1 – 6.3.4.

| # | Action | Kaspi | Cash | Savings | Family total | Income | Expenses | Food % | Notification |
|---|---|--:|--:|--:|--:|--:|--:|--:|---|
| 0 | start | 200 000 | 10 000 | 0 | 210 000 | 0 | 0 | 0 | — |
| 1 | INCOME 350 000 Salary → Kaspi | 550 000 | 10 000 | 0 | 560 000 | 350 000 | 0 | 0 | — |
| 2 | TRANSFER 20 000 Kaspi → Cash | 530 000 | 30 000 | 0 | 560 000 | 350 000 | 0 | 0 | — |
| 3 | EXPENSE 45 000 Food from Kaspi | 485 000 | 30 000 | 0 | 515 000 | 350 000 | 45 000 | 75 | none |
| 4 | EXPENSE 5 000 Food from Cash | 485 000 | 25 000 | 0 | 510 000 | 350 000 | 50 000 | 83 | **`BUDGET_80` once** |
| 5 | TRANSFER 100 000 Kaspi → Savings | 385 000 | 25 000 | 100 000 | 510 000 | 350 000 | 50 000 | 83 | none |
| 6 | EXPENSE 30 000 Cash (Food) | rejected, nothing changes | | | 510 000 | 350 000 | 50 000 | 83 | none |

**Step 6 expected message:** "Not enough money on Cash (balance 25 000 ₸)". After step 6 nothing may have changed: no transaction row, no audit entry, no notification.
**End of month:** family total 510 000 ₸, net result +300 000 ₸; transfers #2 and #5 influenced neither reports nor budget. Run the three roles' views of this month once: Owner, Adult and Child (Child sees none of these numbers).

---

## 10. Questions and inconsistencies found while writing the tests

These need a decision before the tests can have one unambiguous expected result. Suggested owner in brackets.

| # | Finding | Where | Test affected | Owner |
|---|---|---|---|---|
| I-1 | **Password rule differs:** UC-01 says ≥ 8 characters with a letter **and** a digit; US-01.3 says shorter than 8 or without a digit; doc 10 says only "at least 8 (proposal)". | 04, 05, 10 | TC-01.3, TC-04.2 | Nuray, Nuradin |
| I-2 | **Login error text differs:** US-02.2 "Incorrect email or password" vs doc 10 "Email or password is incorrect". Tests need the final string. | 05, 10 | TC-02.2, TC-N15 | Nuray, Aziza |
| I-3 | **"Show the same link again" is impossible if only the hash is stored.** US-04.5 / UC-02 3a say an existing pending invitation shows the same link again; doc 10 §5 says the secret is shown once and a new link *replaces* the old one. Decide: show a new link (old one dies) — then US-04.5 / UC-02 3a must be reworded. | 04, 05, 10 | TC-06.3 | Nuray, Nuradin |
| I-4 | **What does a Child see on a shared account?** BR-10 says "their own transactions"; doc 10 says "own transactions on shared accounts". If Daulet records an expense on Aidar's shared account, does Aidar see it, and is it in his report and balance? Balance (BR-07) includes it, report (own data) may not — numbers would not match. | 02, 06, 10 | TC-13.x, TC-32.2 | Nuray |
| I-5 | **Budget alert recipients:** FR-26 says "family members", UC-08 and US-15 say Owner and Adults. Tests assume Child receives nothing. | 03, 04, 05 | TC-26.1 | Nuray |
| I-6 | **Scheduler behaviour is not specified** for running twice in a day or after downtime (catch-up of missed dates). Proposal: idempotent per rule and date; run all missed dates in order. | 04, 06 | TC-23.3, TC-23.4 | Nuray, Aziza |
| I-7 | **Jumping over both thresholds** (70 % → 105 %): one alert or two? Proposal: both `BUDGET_80` and `BUDGET_100` flags set, one notification of the highest level. | 06 | TC-26.4 | Nuray |
| I-8 | **Time zone not defined** (KZT family; the server probably runs in UTC). Affects "today" (BR-09), month boundaries and the 00:05 job. Proposal: Asia/Almaty for all business dates. | 04, 06 | TC-I11, TC-19.2, TC-30.7 | Nuradin, Gulnaz |
| I-9 | **Privacy acceptance not stored** (doc 10 open point 3): NFR-07 cannot be verified without a column such as `privacy_accepted_at`. | 03, 07, 10 | TC-N07 | Gulnaz |
| I-10 | **Edit of own profile (FR-04)** has no use case or user story, but has TC-04. Acceptance criteria are assumed in TC-04.x. | 03, 08 | TC-04 | Nuray |
| I-11 | **Trace gaps:** FR-09, FR-15, FR-27, FR-33, FR-38 have no user story (all S/C). Tests are written from the requirement text only. | 08 | TC-09, 15, 27, 33, 38 | Nuray |
| I-12 | **Soft-deleted account/category rows and BR-21:** balance 0 is required to archive, but what if the account has only soft-deleted transactions? Assumed: those are ignored. | 06 | TC-12.3 | Gulnaz |
| I-13 | **CSV decimal format** is not specified (`.` vs `,`) and NFR-20 formatting is for display only. Proposal: `.` and no thousands separator in CSV. | 03, 05 | TC-34.3 | Nuray, Aziza |

## 11. Plan and tracking

| Phase | Content | When |
|---|---|---|
| 1 | Unit and DB tests for rules BR-01 – BR-13, seed data, CI with coverage | as soon as the schema (Gulnaz) is merged |
| 2 | API tests for all Must requirements + permission table test (TC-N02, N03) + E2E script §9 | with each feature PR |
| 3 | Should/Could functional tests, scheduler, notifications, reports reconciliation | after all Musts work |
| 4 | Non-functional: load, browsers, responsive, usability | before the demo |
| 5 | Regression run of everything; update statuses in doc 08; report | one week before the demo |

**Tracking:** after each run, set Status in doc 08 (⬜ → 🟨 / ✅ / ❌). Failed tests become GitHub Issues labelled `bug` with: test ID, steps, expected, actual, severity, and the requirement/rule ID in the title.

**Coverage:** every functional requirement in doc 08 (38 rows) has a test group, all 28 business rules are mapped in §5, plus 11 integration tests, 20 non-functional tests and 1 end-to-end script.
