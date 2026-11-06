# Family Budget Tracker — Analysis & Requirements

**Author:** Nuray Mukhambet — Systems Analysis & Requirements
**Course:** Basics of Information Systems · **Version:** 1.4 · **Date:** 2026-11-06

This folder contains the systems analysis of the Family Budget Tracker: what the system must do, for whom, under which rules, and with which data. All other parts of the project (architecture, database, application, tests) are built from these documents.

> **Key idea:** a *transaction* is any money movement — `INCOME`, `EXPENSE` or `TRANSFER`. Transfers between the family's own accounts change balances but are never counted as spending.

## Documents

| # | Document | Contents |
|---|---|---|
| 01 | [Vision and Scope](01-vision-and-scope.md) | Problem, goals, scope, transaction types, assumptions, resolved decisions D-1 – D-4 |
| 02 | [Stakeholders and Users](02-stakeholders-and-users.md) | Roles, permission matrix, personas |
| 03 | [Requirements Specification](03-requirements.md) | 38 functional (+ 4 Won't) and 20 non-functional requirements with MoSCoW priorities |
| 04 | [Use Cases](04-use-cases.md) | 12 use cases with main and alternative flows |
| 05 | [User Stories](05-user-stories.md) | 26 user stories with Given/When/Then acceptance criteria |
| 06 | [Business Rules](06-business-rules.md) | 28 rules + worked numeric example |
| 07 | [Data Dictionary](07-data-dictionary.md) | 13 entities, attributes, constraints, enums, sample data |
| 08 | [Traceability Matrix](08-traceability-matrix.md) | Requirement → use case → story → rule → entity → owner → test |
| 09 | [Glossary](09-glossary.md) | Definitions of all domain terms |
| 10 | [Architecture and Security](10-architecture-and-security.md) | Stack, RBAC, sessions, invitation and reset tokens (owner: Nuradin Alinur) |

## Diagrams

GitHub renders these automatically (Mermaid).

| Diagram | File |
|---|---|
| Use case diagram | [diagrams/use-case-diagram.md](diagrams/use-case-diagram.md) |
| Context diagram (DFD level 0) | [diagrams/context-diagram-dfd0.md](diagrams/context-diagram-dfd0.md) |
| Data flow diagram level 1 | [diagrams/dfd-level1.md](diagrams/dfd-level1.md) |
| Activity diagram: record a transaction | [diagrams/activity-record-transaction.md](diagrams/activity-record-transaction.md) |
| State diagrams: invitation, budget, savings goal | [diagrams/state-diagrams.md](diagrams/state-diagrams.md) |
| Entity-relationship diagram | [diagrams/erd.md](diagrams/erd.md) |
| System architecture | [diagrams/architecture.md](diagrams/architecture.md) |

## How these documents feed the team

| Team member | Role | Uses from this folder |
|---|---|---|
| Nuradin Alinur | Architecture & Security | Permission matrix (02 §3), NFR-01 – NFR-07, DFD level 1 for component boundaries |
| Gulnaz Bekturgan | Data & Database | Data dictionary (07), ERD, business rules marked `DB` (06) |
| Daniyarbekov Kairat | Testing, Analytics & Integration | Acceptance criteria (05), worked example (06), test IDs in traceability matrix (08), report rules BR-12 – BR-13 |
| Myrzakhanova Aziza | Application & Development | Use cases (04), activity diagram, validation messages, user stories as GitHub Issues |

## Change log

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-05 | Nuray Mukhambet | First complete version for team review |
| 1.1 | 2026-11-05 | Nuray Mukhambet | Resolved open questions D-1 – D-4: refunds as INCOME (BR-28), no family total for children, in-app notifications only (FR-36 → Won't, invitation links, admin password reset), PostgreSQL |
| 1.2 | 2026-11-05 | Nuray Mukhambet | Added doc 10 v1.0 (Architecture & Security), aligned to v1.1: Child reports 🔸 own data, EXPIRED invitation status, UC-02 error message, FR-04 in known limit. Invitation token stored as SHA-256 hash (doc 07 v1.2); resend creates a new link (state diagram) |
| 1.3 | 2026-11-06 | Nuray Mukhambet | Resolved test-plan findings I-2, I-3, I-5 (doc 11 §10): login error text aligned with doc 10 (US-02.2); existing pending invitation gets a new link instead of the old one, which cannot be shown again (UC-02 3a, US-04.5); budget alerts go to Owner and Adults only (FR-26, US-15). Docs 03, 04, 05 → v1.2 |
| 1.4 | 2026-11-06 | Nuray Mukhambet | Resolved test-plan findings I-1, I-4, I-6, I-7, I-10, I-11, I-13 (doc 11 §10): password ≥ 8 with a letter and a digit (US-01.3, doc 10); a Child sees all transactions on shared accounts (BR-10, doc 02, UC-09, US-18, doc 10); scheduler idempotent with catch-up (BR-26, UC-11); one "exceeded" alert when both thresholds are crossed (BR-16, UC-08, US-15); CSV number format (US-19); new stories US-21 – US-26 for FR-04, FR-09, FR-15, FR-27, FR-33, FR-38 (doc 08, create_issues.sh). Docs 02, 06, 08 → v1.2; docs 04, 05 → v1.3 |
