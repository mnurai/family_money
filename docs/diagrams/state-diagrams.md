# State Diagrams

Author: Nuray Mukhambet — Systems Analysis & Requirements

## Invitation (FR-06, FR-07, BR-19)

```mermaid
stateDiagram-v2
    [*] --> Pending : Owner sends invitation
    Pending --> Accepted : Invitee accepts within 7 days
    Pending --> Declined : Invitee declines
    Pending --> Expired : 7 days pass
    Pending --> Pending : Owner resends (new expiry date)
    Accepted --> [*]
    Declined --> [*]
    Expired --> [*]
```

## Budget for one month (FR-25, FR-26, BR-16)

```mermaid
stateDiagram-v2
    [*] --> OnTrack : Budget created
    OnTrack --> Warning : spent reaches 80 percent / send BUDGET_80
    Warning --> Exceeded : spent reaches 100 percent / send BUDGET_100
    OnTrack --> Exceeded : one large expense / send BUDGET_100
    Warning --> OnTrack : expense edited or deleted
    Exceeded --> Warning : expense edited or deleted
    OnTrack --> Closed : month ends
    Warning --> Closed : month ends
    Exceeded --> Closed : month ends
    Closed --> [*]
```

## Savings goal (FR-28, FR-29, BR-25)

```mermaid
stateDiagram-v2
    [*] --> Active : Goal created
    Active --> Achieved : savings balance reaches target
    Achieved --> Active : money transferred out, balance below target
    Active --> Cancelled : Owner cancels
    Achieved --> [*]
    Cancelled --> [*]
```
