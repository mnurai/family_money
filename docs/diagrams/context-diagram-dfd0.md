# Context Diagram (DFD Level 0)

Author: Nuray Mukhambet — Systems Analysis & Requirements

The whole system is one process. There is no email service: all notifications are in-app (decision D-3). The diagram shows the external entities and the data that flows between them and the system.

```mermaid
flowchart LR
    OWN["Family Owner"]
    MEM["Adult / Child Member"]
    ADM["System Administrator"]
    SCH["Scheduler (system clock)"]

    SYS(("0. Family Budget Tracker"))

    OWN -- "registration data, family settings, invitations, roles" --> SYS
    OWN -- "accounts, budgets, goals, recurring rules" --> SYS
    MEM -- "login data, income, expense and transfer transactions" --> SYS
    SYS -- "balances, reports, in-app notifications, invitation links" --> OWN
    SYS -- "balances, reports, budget alerts" --> MEM

    ADM -- "block / unblock, reset-link requests" --> SYS
    SYS -- "user status, one-time reset links, audit metadata" --> ADM

    SCH -- "daily time trigger" --> SYS
```
