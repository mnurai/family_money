# Use Case Diagram

Author: Nuray Mukhambet — Systems Analysis & Requirements · Details of each use case: [../04-use-cases.md](../04-use-cases.md)

```mermaid
flowchart LR
    visitor((Visitor))
    owner((Family Owner))
    adult((Adult Member))
    child((Child Member))
    admin((System Admin))
    scheduler((Scheduler))

    subgraph FBT["Family Budget Tracker"]
        direction TB
        UC01(["UC-01 Register and create family"])
        UC02(["UC-02 Invite family member"])
        UC03(["UC-03 Manage accounts"])
        UC04(["UC-04 Record income or expense"])
        UC05(["UC-05 Transfer between accounts"])
        UC06(["UC-06 Edit or delete transaction"])
        UC07(["UC-07 Set monthly budget"])
        UC08(["UC-08 Check budget and send alert"])
        UC09(["UC-09 View reports"])
        UC10(["UC-10 Manage savings goal"])
        UC11(["UC-11 Generate recurring transactions"])
        UC12(["UC-12 Block user"])
    end

    visitor --- UC01
    owner --- UC01
    owner --- UC02
    owner -. "inherits all Adult use cases" .-> adult

    adult --- UC03
    adult --- UC04
    adult --- UC05
    adult --- UC06
    adult --- UC07
    adult --- UC09
    adult --- UC10

    child --- UC04
    child --- UC09

    admin --- UC12
    scheduler --- UC11

    UC04 -. "include" .-> UC08
    UC06 -. "include" .-> UC08
    UC11 -. "include" .-> UC04
    UC11 -. "include" .-> UC05
    UC05 -. "extend: savings account" .-> UC10
```

**Reading the diagram**
- *Family Owner* is a specialisation of *Adult Member*: the Owner can do everything an Adult can, plus UC-01 and UC-02 (and owner-only steps inside UC-03).
- *Child Member* has only UC-04 (restricted to shared accounts, no transfers) and UC-09 (own data).
- UC-08 is never started by a person; it is **included** every time an expense is created, edited or deleted.
