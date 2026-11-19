# Family Budget Tracker: web app

React 19 + TypeScript + Vite. Responsive from 360 px (NFR-14), English UI (NFR-16).

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest), including the worked example from docs/06
npm run build      # type check + production build into dist/
```

## Demo mode

The FastAPI backend has no HTTP endpoints yet, so the app runs on an in-browser demo API
(`src/api/demoApi.ts`). It keeps data in `localStorage` and follows the business rules and the
permission matrix, so every screen shows real numbers. It is **not** a security boundary: the
server must check everything again (NFR-02, NFR-03).

Demo users (password `demo1234`), one family, the personas from docs/02 §4:

| User | Role | Shows |
|---|---|---|
| aigerim@mail.kz | Owner | everything, audit log, inviting, sharing accounts |
| daulet@mail.kz | Adult | all accounts, edits only own transactions |
| aidar@mail.kz | Child | only the shared pocket-money account, no transfers, no family total |
| saule@mail.kz | no family | onboarding with a pending invitation |

Switch users from the user menu. "Reset demo" restores the starting data.

## Connecting the real API

All screens import `api` from `src/api/index.ts`. Add an HTTP client with the same methods and
export it there instead of `demoApi`. Money comes from the API as `numeric(14,2)` strings; convert
them to integer tiyn (`lib/money.ts`), never to floats (NFR-08).

## Structure

```
src/
  api/          types, demo API and its seed data
  lib/          money (parse / format, NFR-20) and date helpers
  state/        session, role helpers, shared lookups
  components/   layout, transaction form, UI kit
  pages/        one file per screen
  styles.css    design tokens and components
```

## Screens and requirements

| Screen | Requirements |
|---|---|
| Log in, Register | FR-01, FR-02, NFR-06, NFR-07 |
| Welcome (create family / accept invitation), invite link | FR-05, FR-07, UC-01, UC-02 |
| Overview | FR-11, FR-25, FR-29, FR-30, BR-13 |
| Add / edit transaction | FR-16 – FR-20, BR-01 – BR-11, NFR-13 |
| Transactions | FR-21, FR-34 |
| Accounts | FR-10 – FR-13, BR-21 |
| Budgets | FR-24 – FR-27, BR-14 – BR-16 |
| Goals | FR-28, FR-29, BR-25 |
| Reports | FR-30 – FR-32, BR-12 |
| Family | FR-06, FR-08, BR-18 – BR-20 |
| Notifications | FR-35 |
| Audit log | FR-38, BR-27 |
| Achievements, level chip; goal milestones and kids' challenges on Goals; child's challenge on Overview | FR-43 – FR-46, BR-29 – BR-32 |

Not built yet: custom categories (FR-15), recurring transactions (FR-22, FR-23), ownership
transfer (FR-09), profile editing (FR-04), the system administrator screens (FR-03, FR-39).
