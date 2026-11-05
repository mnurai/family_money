# System Architecture Diagram

Author: Nuradin Alinur — Architecture & Security · Details: [../10-architecture-and-security.md](../10-architecture-and-security.md)

The boundaries come from the DFD level 1: each process (1.0–6.0) becomes a module of the backend, and each data store (D1–D8) lives in PostgreSQL.

```mermaid
flowchart LR
    subgraph Users
        FM["Owner / Adult / Child (browser)"]
        ADM["System Administrator (browser)"]
    end

    subgraph Frontend
        WEB["Web app (responsive SPA)"]
    end

    subgraph Backend["Backend API (HTTPS only)"]
        AUTH["Auth and session layer<br/>login, lock-out, token check"]
        RBAC["Access control layer<br/>role + family + account checks"]
        subgraph Modules["Service / domain layer"]
            M1["1.0 Users and family<br/>invitations, reset links"]
            M2["2.0 Accounts and categories"]
            M3["3.0 Transactions<br/>validation, audit"]
            M4["4.0 Budgets and goals"]
            M5["5.0 Reports"]
            M6["6.0 Notifications"]
        end
    end

    SCH["Scheduler<br/>daily job: recurring rules, budget reset"]
    DB[("PostgreSQL<br/>D1-D8")]

    FM --> WEB
    ADM --> WEB
    WEB -- "JSON over HTTPS" --> AUTH
    AUTH --> RBAC
    RBAC --> Modules
    Modules --> DB
    SCH -- "calls the same service layer" --> M3
    SCH --> M6
```

| Boundary | Rule |
|---|---|
| Browser ↔ Backend | HTTPS only (NFR-04). The browser is never trusted: every rule is checked again on the server (NFR-02). |
| Backend ↔ Database | Only the service layer talks to PostgreSQL. Saving a transaction and its audit entry happen in one DB transaction (NFR-09). |
| Scheduler ↔ Backend | The scheduler does not write to tables on its own. It calls the same service functions as the API, so BR-08 and the audit log apply to recurring transactions too (BR-26). |
