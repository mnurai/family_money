# Family Budget Tracker

A web information system that helps a family manage household money together: record every money movement, see where the money is, keep to monthly budgets, save toward goals and understand spending through reports.

Team project for the course **Basics of Information Systems**.

## Key features

- **Family accounts with roles**: Owner, Adult and Child members, each with their own permissions
- **Accounts**: cash, bank cards, savings and credit cards, each with a live balance
- **Transactions of three types**:
  - **Income**: money comes into the family (salary, scholarship, gift, refund)
  - **Expense**: money leaves the family (food, rent, transport)
  - **Transfer**: money moves between the family's own accounts (e.g. card → cash, card → savings). Transfers change balances but are **never counted as spending**.
- **Monthly budgets** per expense category, with alerts at 80 % and 100 %
- **Savings goals** linked to savings accounts, with progress tracking
- **Reports**: monthly summary, spending by category and by member, CSV export
- **Recurring transactions**: salary, rent and regular savings recorded automatically
- **In-app notifications** and an **audit log** of all changes

## Team

| Member | Role | Main responsibilities |
|---|---|---|
| Nuray Mukhambet | Systems Analysis & Requirements | Vision and scope, requirements, use cases, user stories, business rules, data dictionary, diagrams, traceability |
| Nuradin Alinur | Architecture & Security | System architecture, technology stack, authentication, role-based access control |
| Gulnaz Bekturgan | Data & Database | Database design and implementation (PostgreSQL), migrations, seed data |
| Daniyarbekov Kairat | Testing, Analytics & Integration | Test cases, automated tests, reports and analytics, integration |
| Myrzakhanova Aziza | Application & Development | Backend and frontend implementation of the features |

## Documentation

All analysis and requirements documents are in [`docs/`](docs/README.md):

| Document | Description |
|---|---|
| [Vision and Scope](docs/01-vision-and-scope.md) | Problem, goals, scope, key decisions |
| [Stakeholders and Users](docs/02-stakeholders-and-users.md) | User roles and permission matrix |
| [Requirements](docs/03-requirements.md) | Functional and non-functional requirements (MoSCoW) |
| [Use Cases](docs/04-use-cases.md) | Main and alternative flows |
| [User Stories](docs/05-user-stories.md) | Stories with acceptance criteria |
| [Business Rules](docs/06-business-rules.md) | Validation and calculation rules, worked example |
| [Data Dictionary](docs/07-data-dictionary.md) | Entities, attributes, constraints |
| [Traceability Matrix](docs/08-traceability-matrix.md) | Requirements → use cases → owners → tests |
| [Glossary](docs/09-glossary.md) | Domain terms |
| [Diagrams](docs/diagrams/) | Use case, context, DFD, activity, state and ER diagrams |

## Technology stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL |
| Backend | Python, FastAPI |
| Database access | SQLAlchemy 2, psycopg |
| Frontend | React, TypeScript, Vite (`frontend/`) |
| Testing | pytest |

## Getting started

> The stack is chosen. Database setup and starting the application will be added when they exist.

```bash
# clone the repository
git clone <repository-url>
cd <repository-folder>

pip install -r requirements.txt   # install dependencies
# configure database:    TODO
# run the application:   TODO
python -m pytest                  # run tests (from the repository root)

cd frontend && npm install && npm run dev   # web app on http://localhost:5173 (demo data, see frontend/README.md)
```

## Contributing

1. Create a branch from `main`: `feature/US-08-record-expense`, `fix/...` or `docs/...`
2. Commit with a clear message that references requirement IDs, e.g. `feat: record transfers between accounts (FR-18, US-10)`
3. Open a pull request, link the related issue and ask a teammate for review
4. Merge after approval

Guidance for AI coding assistants is in [`CLAUDE.md`](CLAUDE.md).
