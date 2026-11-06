# 10 — Architecture and Security

| | |
|---|---|
| **Document owner** | Nuradin Alinur — Architecture & Security |
| **Version** | 1.1 (draft for team review) |
| **Date** | 2026-11-05 |

This document details the system's technology stack, core architecture components, role-based access control (RBAC), and authentication/security protocols (NFR-01 – NFR-07, FR-03, FR-06). The architecture diagram is located in [diagrams/architecture.md](diagrams/architecture.md).

## 1. Technology stack

PostgreSQL is decided (D-4). The code in `app/` and `requirements.txt` already uses FastAPI, SQLAlchemy, psycopg and pytest, so the stack below matches what the team is building. Items marked *not yet in the project* are still to be added.

| Layer | Proposal | Why |
|---|---|---|
| Database | PostgreSQL | Decision D-4 |
| Backend API | Python + FastAPI | Short code, automatic API docs, easy to test |
| Database access | SQLAlchemy 2 + psycopg | Already in `requirements.txt` |
| Migrations | Alembic (not yet in the project) | Project guidelines mandate schema modifications via migrations only; owner: Gulnaz |
| Password hashing | Argon2id (`argon2-cffi`) or bcrypt (not yet in the project) | NFR-01 |
| Frontend | Responsive web app (React or plain HTML + JS) | NFR-14 (from 360 px wide) |
| Scheduler | A daily job (APScheduler or cron) that calls the service layer | FR-23, BR-26 |
| Tests | pytest, test names by rule ID (`test_br10_...`) | NFR-18, testing guidelines |
| Source control | GitHub, pull request + one review | NFR-19 |

## 2. Components

From the DFD level 1 the system has five parts: the web app, the backend API, PostgreSQL, the scheduler and (outside the system) the users.

- The backend has a **service / domain layer** with one module per DFD process (1.0 users and family, 2.0 accounts and categories, 3.0 transactions, 4.0 budgets and goals, 5.0 reports, 6.0 notifications). Business rules (BR-xx) live here, not in the screens.
- In front of the service layer sit two checks that every request passes: **authentication** (who is this?) and **access control** (may this person do this, in this family?).
- The scheduler runs once a day and calls the same service functions as the API.
- All outside traffic uses HTTPS (NFR-04). The system sends no email (D-3).

## 3. Access control (RBAC)

**Principle:** the server decides. Hiding a button in the UI is only convenience (NFR-02).

### 3.1 Three checks on every request

1. **Who:** the user comes from the session, never from data sent by the browser.
2. **Which family:** the `family_id` also comes from the session (through FAMILY_MEMBER). It is never taken from the URL or the request body. Every database query for family data includes `WHERE family_id = <session family>` (NFR-03). If an object belongs to another family, the API answers "not found", so nobody can learn that it exists.
3. **What:** the action is looked up in one permission table (3.2). A Child gets an extra account check (3.3).

### 3.2 Permission table (from doc 02 §3)

One table in code, one place to change. Conditions are checked after the role.

| Action | Owner | Adult | Child | Sys Admin | Extra condition |
|---|:-:|:-:|:-:|:-:|---|
| Create family | ✅ | — | — | ❌ | User has no family yet (BR-17) |
| Invite / remove member, change role, transfer ownership | ✅ | ❌ | ❌ | ❌ | One Owner only (BR-18) |
| Share account with a child | ✅ | ❌ | ❌ | ❌ | Target member is a Child |
| Create / edit account | ✅ | ✅ | ❌ | ❌ | |
| Archive account | ✅ | ❌ | ❌ | ❌ | |
| View accounts and balances | ✅ all | ✅ all | 🔸 | ❌ | Child: only rows in ACCOUNT_ACCESS |
| Record INCOME / EXPENSE | ✅ | ✅ | 🔸 | ❌ | Child: only on shared accounts (BR-10) |
| Record TRANSFER | ✅ | ✅ | ❌ | ❌ | |
| Edit / delete transaction | ✅ any | 🔸 | ❌ | ❌ | Adult: only if `created_by` is the user (BR-11) |
| Categories, recurring rules, budgets, goals | ✅ | ✅ | ❌ | ❌ | |
| Reports (own data) | ✅ | ✅ | 🔸 | ❌ | Child: all transactions on shared accounts (BR-10) |
| Family reports, family total balance | ✅ | ✅ | ❌ | ❌ | Never shown to a Child (D-2, BR-13) |
| Export CSV | ✅ | ✅ | ❌ | ❌ | |
| View audit log | ✅ own family | ❌ | ❌ | 🔸 | Admin: metadata only, no transaction content |
| Block / unblock user, create reset link | ❌ | ❌ | ❌ | ✅ | |

### 3.3 Rules that are easy to forget

- **Child and accounts:** besides the role, the server checks ACCOUNT_ACCESS for the account used in the request. This applies to listing accounts, recording a transaction, and reading reports (a child's report contains all transactions on their shared accounts, BR-10).
- **System Administrator** is a flag on the user (`is_system_admin`), not a family role. Admin endpoints are separate from family endpoints, and the admin has no access to transaction content (privacy).
- **Blocked users:** `is_active` is read from the database on every request, so a block works immediately, not after the session ends.
- **Audit log** is append-only (BR-27): the application account in PostgreSQL gets INSERT and SELECT on it, but not UPDATE or DELETE.

## 4. Login, sessions and lock-out

| Topic | Design | Requirement |
|---|---|---|
| Password storage | Argon2id or bcrypt hash with salt. Plain passwords are never stored or written to logs. | NFR-01 |
| Password rule | At least 8 characters with at least one letter and one digit (UC-01 step 2, US-01.3). | FR-01 |
| Login | Email (stored lower-case) + password. A wrong email and a wrong password give the same message: "Email or password is incorrect". | FR-02 |
| Lock-out | After 5 failed attempts `locked_until = now + 15 minutes`. A successful login resets `failed_login_count`. While locked, even the correct password is refused. Both columns already exist in USER. | NFR-06 |
| Session | A signed token (JWT) in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, valid 30 minutes. On every request the server issues a fresh one, so it expires after 30 minutes of **inactivity**. | NFR-05 |
| Blocked user | Login and every later request are refused with "Your account has been blocked". | FR-39 |
| Transport | HTTPS only in deployment. | NFR-04 |
| Secrets | Signing key and database password come from environment variables. `.env` is never committed. | Security policy |
| Personal data | A privacy notice must be accepted at registration. | NFR-07 |

**Known limit of v1:** a signed token cannot be cancelled before it expires. After a password change (FR-04), an old token can still work for up to 30 minutes. For a student project this is acceptable. A server-side sessions table would fix it, but needs a new table.

## 5. Tokens: invitation links and password-reset links

Both tokens are random secrets. They are shown **once** and only a **hash** is kept in the database, so a database leak does not give anyone a working link.

| | Invitation link (FR-06, FR-07, BR-19) | Admin reset link (FR-03) |
|---|---|---|
| Created by | Owner | System Administrator |
| Token | 32 random bytes, URL-safe (`secrets.token_urlsafe(32)`) | same |
| Stored as | SHA-256 hex (64 chars) in `INVITATION.token` (varchar(64), UQ) | SHA-256 hex in `USER.reset_token_hash` |
| Valid for | 7 days (`expires_at`) | 24 hours (`reset_token_expires_at`) |
| Use | Single use: status `PENDING` → `ACCEPTED`, `DECLINED` or `EXPIRED` (after 7 days) | Single use: hash and expiry are cleared after the password is changed |
| Who may use it | Only a logged-in user whose email equals the invited email (case-insensitive). Anyone else sees "This invitation was sent to another email address". Accepting also checks BR-17 (one family per user). | Anyone with the link, because the user cannot log in. That is why it is shown only to the admin and passed on outside the system. |
| New link | One pending invitation per email and family; a new one replaces the old one (BR-19) | A new link replaces the old one |
| Effects | Audit entry; notification to the Owner (INVITE_ACCEPTED / INVITE_DECLINED) | Audit entry; `failed_login_count` and `locked_until` are reset |
| Errors | Expired invitation: "This invitation has expired, ask the family owner for a new one" (UC-02, 6a). Used or unknown token: "This link is not valid or has expired". | Expired, used or unknown token: "This link is not valid or has expired" |

The link has the form `https://<site>/invite/<token>` and `https://<site>/reset/<token>`. Tokens must never be written to logs. Attempts on the token pages are rate-limited, for example 10 per minute per IP address.

## 6. Open points for the team

| # | Question | Who decides |
|---|---|---|
| 1 | ~~Confirm the stack in section 1~~ Done: the project code already uses it. Still open: frontend choice and migration tool | Aziza, Gulnaz |
| 2 | Doc 07 says `INVITATION.token` is "random secret in the link". Section 5 stores its SHA-256 hash instead. It fits varchar(64), so no schema change, but doc 07 should say so. **Resolved in doc 07 v1.2.** | Gulnaz, Nuray |
| 3 | NFR-07 needs proof that the user accepted the privacy notice. A column such as `privacy_accepted_at` in USER may be needed. | Gulnaz, Nuray |
| 4 | Password minimum length (section 4) | Team |

## 7. How this will be tested (for Kairat)

Examples of tests that follow from this document (names by rule ID):

- `test_nfr03_user_cannot_read_other_family_account`
- `test_br10_child_cannot_record_transfer`
- `test_br10_child_cannot_use_unshared_account`
- `test_br11_adult_cannot_edit_foreign_transaction`
- `test_nfr06_account_locked_after_5_failed_logins`
- `test_nfr05_session_expires_after_30_min_inactivity`
- `test_fr03_reset_link_works_once_and_expires_after_24h`
- `test_br19_invitation_expires_after_7_days`
- `test_fr39_blocked_user_refused_immediately`