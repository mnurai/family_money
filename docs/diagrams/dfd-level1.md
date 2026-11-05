# Data Flow Diagram — Level 1

Author: Nuray Mukhambet — Systems Analysis & Requirements

Process 0 from the context diagram is split into six main processes. Cylinders are data stores.

```mermaid
flowchart LR
    U["Family members"]
    ADM["System Administrator"]
    SCH["Scheduler"]

    P1(("1.0 Manage users and family"))
    P2(("2.0 Manage accounts and categories"))
    P3(("3.0 Record transactions"))
    P4(("4.0 Manage budgets and goals"))
    P5(("5.0 Produce reports"))
    P6(("6.0 Notify members"))

    D1[("D1 Users and members")]
    D2[("D2 Accounts")]
    D3[("D3 Categories")]
    D4[("D4 Transactions")]
    D5[("D5 Budgets and goals")]
    D6[("D6 Notifications")]
    D7[("D7 Audit log")]
    D8[("D8 Recurring rules")]

    U -- "registration, invitations, roles" --> P1
    ADM -- "block / unblock, reset request" --> P1
    P1 <--> D1
    P1 -- "invitation link, reset link" --> U

    U -- "account and category data" --> P2
    P2 <--> D2
    P2 <--> D3

    U -- "income, expense, transfer" --> P3
    SCH -- "daily trigger" --> P3
    D8 -- "due rules" --> P3
    P3 -- "new rules, next run date" --> D8
    D1 -- "role and permissions" --> P3
    D2 -- "account balance" --> P3
    D3 -- "category type" --> P3
    P3 -- "validated transaction" --> D4
    P3 -- "change record" --> D7
    P3 -- "expense recorded" --> P4

    U -- "budget limits, goals" --> P4
    P4 <--> D5
    D4 -- "expenses per category" --> P4
    D2 -- "savings balance" --> P4
    P4 -- "threshold reached, goal achieved" --> P6

    U -- "report request" --> P5
    D4 -- "transactions" --> P5
    D2 -- "accounts" --> P5
    D5 -- "budgets" --> P5
    P5 -- "reports, CSV" --> U

    P6 --> D6
    D6 -- "notifications" --> U
```

| Process | Description | Main requirements |
|---|---|---|
| 1.0 | Registration, login, family creation, invitation links, roles, blocking, admin password reset | FR-01 – FR-09, FR-39 |
| 2.0 | Accounts (create, archive, share) and categories | FR-10 – FR-15 |
| 3.0 | Validate and save INCOME / EXPENSE / TRANSFER, run recurring rules, write audit | FR-16 – FR-23, FR-37 |
| 4.0 | Budgets, spent calculation, alerts, savings goals | FR-24 – FR-29 |
| 5.0 | Summary, category, member and balance reports, CSV export | FR-30 – FR-34 |
| 6.0 | Create and show in-app notifications | FR-35 |
