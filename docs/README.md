# Family Budget Tracker — Analysis & Requirements

**Author:** Nuray Mukhambet — Systems Analysis & Requirements
**Course:** Basics of Information Systems · **Version:** 1.1 · **Date:** 2026-11-05

This folder contains the systems analysis of the Family Budget Tracker: what the system must do, for whom, under which rules, and with which data. All other parts of the project (architecture, database, application, tests) are built from these documents.

> **Key idea:** a *transaction* is any money movement — `INCOME`, `EXPENSE` or `TRANSFER`. Transfers between the family's own accounts change balances but are never counted as spending.

## Documents

| # | Document | Contents |
|---|---|---|
| 01 | [Vision and Scope](01-vision-and-scope.md) | Problem, goals, scope, transaction types, assumptions, resolved decisions D-1 – D-4 |
| 02 | [Stakeholders and Users](02-stakeholders-and-users.md) | Roles, permission matrix, personas |
| 03 | [Requirements Specification](03-requirements.md) | 38 functional (+ 4 Won't) and 20 non-functional requirements with MoSCoW priorities |
| 04 | [Use Cases](04-use-cases.md) | 12 use cases with main and alternative flows |
| 05 | [User Stories](05-user-stories.md) | 20 user stories with Given/When/Then acceptance criteria |
| 06 | [Business Rules](06-business-rules.md) | 28 rules + worked numeric example |
| 07 | [Data Dictionary](07-data-dictionary.md) | 13 entities, attributes, constraints, enums, sample data |
| 08 | [Traceability Matrix](08-traceability-matrix.md) | Requirement → use case → story → rule → entity → owner → test |
| 09 | [Glossary](09-glossary.md) | Definitions of all domain terms |

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
