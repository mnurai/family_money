# 08 — Requirements Traceability Matrix

| | |
|---|---|
| **Document owner** | Nuray Mukhambet — Systems Analysis & Requirements |
| **Version** | 1.2 |
| **Date** | 2026-11-06 |

The matrix links every requirement to the use case and user story it comes from, the business rules and data it depends on, the team member who implements it and the test that verifies it. **Test case IDs are reserved here; the Testing role fills in the test details and the Status column.**

## Team roles

| Member | Role | Abbreviation in matrix |
|---|---|---|
| Nuray Mukhambet | Systems Analysis & Requirements | **SA** |
| Nuradin Alinur | Architecture & Security | **AS** |
| Gulnaz Bekturgan | Data & Database | **DB** |
| Daniyarbekov Kairat | Testing, Analytics & Integration | **TI** |
| Myrzakhanova Aziza | Application & Development | **AD** |

## Functional requirements

| Req | Short name | Pri | Use case | User story | Business rules | Entities | Implemented by | Test case | Status |
|---|---|:-:|---|---|---|---|---|---|---|
| FR-01 | Register | M | UC-01 | US-01 | — | USER | AD, AS | TC-01 | ⬜ |
| FR-02 | Log in / out | M | UC-01 | US-02 | — | USER | AD, AS | TC-02 | ⬜ |
| FR-03 | Admin-generated password-reset link | S | UC-12 | US-20 | — | USER, AUDIT_LOG | AD, AS | TC-03 | ⬜ |
| FR-04 | Edit profile | S | — | US-21 | — | USER | AD | TC-04 | ⬜ |
| FR-05 | Create family | M | UC-01 | US-03 | BR-17, BR-18 | FAMILY, FAMILY_MEMBER | AD, DB | TC-05 | ⬜ |
| FR-06 | Invite member (copyable link) | M | UC-02 | US-04 | BR-19 | INVITATION | AD | TC-06 | ⬜ |
| FR-07 | Accept / decline invitation | M | UC-02 | US-04 | BR-17, BR-19 | INVITATION, FAMILY_MEMBER | AD | TC-07 | ⬜ |
| FR-08 | Change role / remove member | S | — | US-05 | BR-18, BR-20 | FAMILY_MEMBER | AD, AS | TC-08 | ⬜ |
| FR-09 | Transfer ownership | C | — | US-22 | BR-18 | FAMILY_MEMBER | AD | TC-09 | ⬜ |
| FR-10 | Create account | M | UC-03 | US-06 | BR-24 | ACCOUNT | AD, DB | TC-10 | ⬜ |
| FR-11 | Calculate balances | M | UC-03 | US-06, US-07 | BR-07, BR-13 | ACCOUNT, TRANSACTION | DB, AD | TC-11 | ⬜ |
| FR-12 | Edit / archive account | S | UC-03 | — | BR-21 | ACCOUNT | AD | TC-12 | ⬜ |
| FR-13 | Share account with child | S | UC-03 | US-07 | BR-10 | ACCOUNT_ACCESS | AD, AS | TC-13 | ⬜ |
| FR-14 | Default categories | M | UC-01 | US-03 | BR-22 | CATEGORY | DB | TC-14 | ⬜ |
| FR-15 | Custom categories | S | — | US-23 | BR-22, BR-23 | CATEGORY | AD | TC-15 | ⬜ |
| FR-16 | Record INCOME | M | UC-04 | US-09 | BR-01 – BR-03, BR-06, BR-09, BR-10, BR-28 | TRANSACTION | AD, DB | TC-16 | ⬜ |
| FR-17 | Record EXPENSE | M | UC-04 | US-08 | BR-01, BR-02, BR-04, BR-06, BR-08 – BR-10 | TRANSACTION | AD, DB | TC-17 | ⬜ |
| FR-18 | Record TRANSFER | M | UC-05 | US-10 | BR-01, BR-02, BR-05, BR-06, BR-08, BR-09 | TRANSACTION | AD, DB | TC-18 | ⬜ |
| FR-19 | Validate transactions | M | UC-04, UC-05 | US-08 – US-10 | BR-01 – BR-10 | TRANSACTION | AD, DB | TC-19 | ⬜ |
| FR-20 | Edit / delete transaction | M | UC-06 | US-11 | BR-11 | TRANSACTION, AUDIT_LOG | AD, AS | TC-20 | ⬜ |
| FR-21 | Filter / search transactions | M | UC-09 | US-12 | — | TRANSACTION | AD, DB | TC-21 | ⬜ |
| FR-22 | Define recurring rule | S | UC-11 | US-13 | BR-26 | RECURRING_RULE | AD | TC-22 | ⬜ |
| FR-23 | Run recurring rules | S | UC-11 | US-13 | BR-26 | RECURRING_RULE, TRANSACTION | AD, TI | TC-23 | ⬜ |
| FR-24 | Set budget | M | UC-07 | US-14 | BR-14 | BUDGET | AD, DB | TC-24 | ⬜ |
| FR-25 | Budget progress | M | UC-07 | US-14 | BR-15 | BUDGET, TRANSACTION | AD, DB | TC-25 | ⬜ |
| FR-26 | Budget alerts | S | UC-08 | US-15 | BR-16 | BUDGET, NOTIFICATION | AD | TC-26 | ⬜ |
| FR-27 | Copy budget to next month | C | UC-07 | US-24 | BR-14 | BUDGET | AD | TC-27 | ⬜ |
| FR-28 | Create savings goal | S | UC-10 | US-16 | BR-25 | SAVINGS_GOAL | AD | TC-28 | ⬜ |
| FR-29 | Goal progress | S | UC-10 | US-16 | BR-25 | SAVINGS_GOAL, ACCOUNT | AD | TC-29 | ⬜ |
| FR-30 | Monthly summary | M | UC-09 | US-17 | BR-12, BR-13 | TRANSACTION, ACCOUNT | AD, TI | TC-30 | ⬜ |
| FR-31 | Expenses by category | M | UC-09 | US-18 | BR-12 | TRANSACTION, CATEGORY | AD, TI | TC-31 | ⬜ |
| FR-32 | By member report | S | UC-09 | US-18 | BR-12 | TRANSACTION, FAMILY_MEMBER | AD, TI | TC-32 | ⬜ |
| FR-33 | Balance history | C | UC-09 | US-25 | BR-07 | TRANSACTION, ACCOUNT | AD, TI | TC-33 | ⬜ |
| FR-34 | CSV export | C | UC-09 | US-19 | — | TRANSACTION | AD, TI | TC-34 | ⬜ |
| FR-35 | In-app notifications | S | UC-08 | US-15 | — | NOTIFICATION | AD | TC-35 | ⬜ |
| FR-37 | Audit log | S | UC-06 | US-11 | BR-27 | AUDIT_LOG | AS, DB | TC-37 | ⬜ |
| FR-38 | View audit log | C | — | US-26 | BR-27 | AUDIT_LOG | AD | TC-38 | ⬜ |
| FR-39 | Block / unblock user | S | UC-12 | US-20 | — | USER, AUDIT_LOG | AD, AS | TC-39 | ⬜ |

## Non-functional requirements

| Req | Short name | Pri | Responsible | Verification method | Test case | Status |
|---|---|:-:|---|---|---|---|
| NFR-01 | Password hashing | M | AS | Code review + DB inspection | TC-N01 | ⬜ |
| NFR-02 | Server-side RBAC | M | AS, AD | API tests for every role in the permission matrix | TC-N02 | ⬜ |
| NFR-03 | Tenant isolation | M | AS, DB | API test: user A requests family B data → 403/404 | TC-N03 | ⬜ |
| NFR-04 | HTTPS | S | AS | Deployment check | TC-N04 | ⬜ |
| NFR-05 | Session timeout | S | AS | Manual test | TC-N05 | ⬜ |
| NFR-06 | Login lock-out | S | AS | Automated test | TC-N06 | ⬜ |
| NFR-07 | Personal data compliance | S | AS, SA | Review of privacy notice | TC-N07 | ⬜ |
| NFR-08 | Decimal money type | M | DB | Schema review | TC-N08 | ⬜ |
| NFR-09 | Atomic saves | M | DB, AD | Fault-injection test | TC-N09 | ⬜ |
| NFR-10 | Daily backups | C | DB | Restore test | TC-N10 | ⬜ |
| NFR-11 | < 2 s response | S | TI, DB | Load test with 10 000 transactions | TC-N11 | ⬜ |
| NFR-12 | 50 concurrent users | C | TI | Load test | TC-N12 | ⬜ |
| NFR-13 | ≤ 3 screens / 30 s | M | AD, SA | Usability test with 3 users | TC-N13 | ⬜ |
| NFR-14 | Responsive UI | S | AD | Test at 360 px, 768 px, 1440 px | TC-N14 | ⬜ |
| NFR-15 | Clear error messages | M | AD, SA | Review of all validation messages | TC-N15 | ⬜ |
| NFR-16 | Languages | S | AD | Manual check | TC-N16 | ⬜ |
| NFR-17 | Browser support | S | TI | Cross-browser test | TC-N17 | ⬜ |
| NFR-18 | ≥ 70 % test coverage | S | TI | Coverage report in CI | TC-N18 | ⬜ |
| NFR-19 | PR review | M | All | GitHub branch protection | TC-N19 | ⬜ |
| NFR-20 | Money formatting | S | AD | UI check | TC-N20 | ⬜ |

**Status legend:** ⬜ not started · 🟨 in progress · ✅ passed · ❌ failed

## Coverage check

- Every Must requirement has at least one use case or user story ✅
- Every use case is linked to at least one requirement ✅
- FR-36 (email) is Won't in v1 (D-3) and is not traced
- Every business rule BR-01 – BR-28 is referenced by at least one requirement ✅
- Every entity in the data dictionary is used by at least one requirement ✅
