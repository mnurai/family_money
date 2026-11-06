#!/usr/bin/env bash
# Creates GitHub labels and one issue per user story (docs/05-user-stories.md).
# Author: Nuray Mukhambet — Systems Analysis & Requirements
#
# Requirements: GitHub CLI installed and logged in (`gh auth login`).
# Usage (from the repository root):   bash scripts/create_issues.sh
set -euo pipefail

# ---- labels --------------------------------------------------------------
gh label create "user-story"   --color 1D76DB --description "User story from docs/05-user-stories.md" --force
gh label create "must-have"    --color B60205 --description "MoSCoW: Must"   --force
gh label create "should-have"  --color FBCA04 --description "MoSCoW: Should" --force
gh label create "could-have"   --color 0E8A16 --description "MoSCoW: Could"  --force
for epic in "E1 accounts-family" "E2 transactions" "E3 budgets-goals" "E4 reports" "E5 admin"; do
  gh label create "epic:${epic// /-}" --color C5DEF5 --force
done

# ---- issues --------------------------------------------------------------
# id | title | priority label | epic label | requirements | use case
stories=(
"US-01|Register with email and password|must-have|epic:E1-accounts-family|FR-01, NFR-01|UC-01"
"US-02|Log in and log out|must-have|epic:E1-accounts-family|FR-02, NFR-05, NFR-06|UC-01"
"US-03|Create a family|must-have|epic:E1-accounts-family|FR-05, FR-14|UC-01"
"US-04|Invite members with a shareable link and a role|must-have|epic:E1-accounts-family|FR-06, FR-07|UC-02"
"US-05|Change member roles and remove members|should-have|epic:E1-accounts-family|FR-08|—"
"US-06|Create accounts with opening balances|must-have|epic:E1-accounts-family|FR-10, FR-11|UC-03"
"US-07|Share an account with a child|should-have|epic:E1-accounts-family|FR-13|UC-03"
"US-08|Record an expense|must-have|epic:E2-transactions|FR-17, FR-19, NFR-13|UC-04"
"US-09|Record income|must-have|epic:E2-transactions|FR-16, FR-19|UC-04"
"US-10|Transfer money between own accounts|must-have|epic:E2-transactions|FR-18, FR-19|UC-05"
"US-11|Edit or delete a transaction|must-have|epic:E2-transactions|FR-20, FR-37|UC-06"
"US-12|Filter and search transactions|must-have|epic:E2-transactions|FR-21|UC-09"
"US-13|Recurring transactions|should-have|epic:E2-transactions|FR-22, FR-23|UC-11"
"US-14|Set a monthly category budget|must-have|epic:E3-budgets-goals|FR-24, FR-25|UC-07"
"US-15|Budget alerts at 80% and 100%|should-have|epic:E3-budgets-goals|FR-26, FR-35|UC-08"
"US-16|Savings goal linked to a savings account|should-have|epic:E3-budgets-goals|FR-28, FR-29|UC-10"
"US-17|Monthly summary report|must-have|epic:E4-reports|FR-30|UC-09"
"US-18|Expenses by category and by member|must-have|epic:E4-reports|FR-31, FR-32|UC-09"
"US-19|Export transactions to CSV|could-have|epic:E4-reports|FR-34|UC-09"
"US-20|Block users and generate password-reset links (system admin)|should-have|epic:E5-admin|FR-03, FR-39|UC-12"
"US-21|Edit my profile (name, password)|should-have|epic:E1-accounts-family|FR-04, NFR-01|—"
"US-22|Transfer ownership to an adult|could-have|epic:E1-accounts-family|FR-09|—"
"US-23|Custom categories and subcategories|should-have|epic:E1-accounts-family|FR-15|—"
"US-24|Copy budgets to next month|could-have|epic:E3-budgets-goals|FR-27|UC-07"
"US-25|Balance history of an account|could-have|epic:E4-reports|FR-33|UC-09"
"US-26|View the family audit log|could-have|epic:E5-admin|FR-38|—"
)

for s in "${stories[@]}"; do
  IFS='|' read -r id title prio epic reqs uc <<< "$s"
  body="**User story:** see [\`docs/05-user-stories.md\`](../blob/main/docs/05-user-stories.md) → **${id}** (full story and acceptance criteria).

**Requirements:** ${reqs}
**Use case:** ${uc}
**Traceability:** [\`docs/08-traceability-matrix.md\`](../blob/main/docs/08-traceability-matrix.md)

**Definition of done**
- [ ] All acceptance criteria of ${id} pass
- [ ] Business rules listed in the story are enforced on the server
- [ ] Test cases added (Testing)
- [ ] PR reviewed and merged

_Requirement defined by: Systems Analysis & Requirements (Nuray Mukhambet)._"
  gh issue create --title "${id}: ${title}" --body "$body" --label "user-story,${prio},${epic}"
  echo "created ${id}"
done
