# Activity Diagram — Record a Transaction (UC-04 / UC-05)

Author: Nuray Mukhambet — Systems Analysis & Requirements

Shows how one form handles all three transaction types and where each business rule is checked.

```mermaid
flowchart TD
    start([Start]) --> open["Member clicks Add transaction"]
    open --> role{"Member role?"}
    role -- "Child" --> childForm["Show Income / Expense only, shared accounts only"]
    role -- "Owner or Adult" --> fullForm["Show Income / Expense / Transfer, all accounts"]
    childForm --> type
    fullForm --> type

    type{"Transaction type?"}
    type -- "INCOME" --> inc["Enter amount, destination account, income category, date"]
    type -- "EXPENSE" --> exp["Enter amount, source account, expense category, date"]
    type -- "TRANSFER" --> trf["Enter amount, from account, to account, date (no category)"]

    inc --> save["Click Save"]
    exp --> save
    trf --> save

    save --> v1{"Amount > 0 and date not in future? (BR-02, BR-09)"}
    v1 -- "No" --> err["Show error message"] --> type
    v1 -- "Yes" --> v2{"Accounts and category valid for this type? (BR-03 to BR-06, BR-10)"}
    v2 -- "No" --> err
    v2 -- "Yes" --> v3{"Money leaves an account? (EXPENSE or TRANSFER)"}
    v3 -- "Yes" --> v4{"Enough balance or credit? (BR-08)"}
    v4 -- "No" --> err
    v4 -- "Yes" --> db
    v3 -- "No (INCOME)" --> db

    db["Save transaction, update balances, write audit entry (one DB transaction)"]
    db --> isExp{"Type is EXPENSE?"}
    isExp -- "Yes" --> bud["UC-08: recalculate budget, send 80 / 100 percent alert if needed"]
    isExp -- "No" --> isSav{"Destination is a savings account with a goal?"}
    isSav -- "Yes" --> goal["Update goal progress, notify if achieved"]
    isSav -- "No" --> done
    bud --> done
    goal --> done
    done["Show updated balances and list"] --> finish([End])
```
