// Gamification: achievement badges (FR-43), savings-goal milestones (FR-44) and points with
// levels (FR-45). All derived from data the system already stores, nothing extra is saved (BR-29, BR-31).
// Pure functions, so the rules can be unit-tested and moved to the server unchanged.

import { monthKey, monthRange } from './dates';
import type { Tiyn } from './money';

export type AchievementId =
  | 'FIRST_STEP'
  | 'REGULAR'
  | 'ON_A_ROLL'
  | 'IN_THE_GREEN'
  | 'PLANNER'
  | 'BUDGET_KEEPER'
  | 'POSITIVE_MONTH'
  | 'TEAM_EFFORT'
  | 'DREAMER'
  | 'HALFWAY'
  | 'GOAL_REACHED'
  | 'CHALLENGE_CHAMPION';

export interface Achievement {
  id: AchievementId;
  title: string;
  description: string;
  /** PERSONAL: what this member recorded. FAMILY: the whole family; Owner and Adults only (BR-13, BR-30). */
  scope: 'PERSONAL' | 'FAMILY';
  earned: boolean;
  /** Day the badge was earned, when the data tells it. */
  earnedOn: string | null;
  progress: { current: number; target: number };
  /** Points the badge gives once earned (FR-45). */
  points: number;
}

interface TxLike {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: Tiyn;
  transactionDate: string;
}

export interface AchievementInput {
  today: string;
  /** Live (not deleted) transactions recorded by this member. */
  myTx: TxLike[];
  /** Family data; left out for a Child (BR-30). */
  family?: {
    tx: (TxLike & { createdBy: number })[];
    budgets: { periodMonth: string; percentUsed: number }[];
    /** Every goal ever created, cancelled ones included. */
    goals: { saved: Tiyn; targetAmount: Tiyn; status: 'ACTIVE' | 'ACHIEVED' | 'CANCELLED' }[];
  };
  /** Savings challenges set for this member; only for a Child (FR-46). */
  myChallenges?: { status: 'ACTIVE' | 'ACHIEVED' | 'CANCELLED' }[];
}

/** Points per badge (FR-45): harder habits give more. */
export const BADGE_POINTS: Record<AchievementId, number> = {
  FIRST_STEP: 10,
  REGULAR: 25,
  ON_A_ROLL: 25,
  IN_THE_GREEN: 20,
  PLANNER: 10,
  BUDGET_KEEPER: 30,
  POSITIVE_MONTH: 30,
  TEAM_EFFORT: 15,
  DREAMER: 10,
  HALFWAY: 25,
  GOAL_REACHED: 50,
  CHALLENGE_CHAMPION: 40,
};

export const REGULAR_TARGET = 25;
export const STREAK_TARGET = 7;
export const TEAM_TARGET = 2;

/** Longest run of consecutive days with at least one transaction, and the day the run reached `target`. */
export function longestStreak(dates: string[], target = STREAK_TARGET): { best: number; reachedOn: string | null } {
  const days = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  let reachedOn: string | null = null;
  for (const d of days) {
    const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
    run = prev !== null && t - prev === 1 ? run + 1 : 1;
    prev = t;
    best = Math.max(best, run);
    if (run >= target && !reachedOn) reachedOn = d;
  }
  return { best, reachedOn };
}

/** Months that have ended before `today`, oldest first. Only finished months can earn month badges. */
function finishedMonths(dates: string[], today: string): string[] {
  const now = monthKey(today);
  return [...new Set(dates.map(monthKey))].filter((m) => m < now).sort();
}

/** First finished month where income > expenses. Transfers never count (BR-12). */
function firstPositiveMonth(tx: TxLike[], today: string): string | null {
  for (const m of finishedMonths(tx.map((t) => t.transactionDate), today)) {
    let net = 0;
    for (const t of tx) {
      if (monthKey(t.transactionDate) !== m) continue;
      if (t.type === 'INCOME') net += t.amount;
      if (t.type === 'EXPENSE') net -= t.amount;
    }
    if (net > 0) return m;
  }
  return null;
}

const badge = (
  id: AchievementId,
  title: string,
  description: string,
  scope: Achievement['scope'],
  current: number,
  target: number,
  earnedOn: string | null = null,
): Achievement => {
  const earned = current >= target;
  return { id, title, description, scope, earned, earnedOn: earned ? earnedOn : null, progress: { current: Math.min(current, target), target }, points: BADGE_POINTS[id] };
};

export function computeAchievements({ today, myTx, family, myChallenges }: AchievementInput): Achievement[] {
  const byDate = [...myTx].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
  const streak = longestStreak(myTx.map((t) => t.transactionDate));
  const myGreen = firstPositiveMonth(myTx, today);

  const list: Achievement[] = [
    badge('FIRST_STEP', 'First step', 'Record your first transaction.', 'PERSONAL', myTx.length, 1, byDate[0]?.transactionDate),
    badge('REGULAR', 'Regular', `Record ${REGULAR_TARGET} transactions.`, 'PERSONAL', myTx.length, REGULAR_TARGET, byDate[REGULAR_TARGET - 1]?.transactionDate),
    badge('ON_A_ROLL', 'On a roll', `Record something ${STREAK_TARGET} days in a row.`, 'PERSONAL', streak.best, STREAK_TARGET, streak.reachedOn),
    badge('IN_THE_GREEN', 'In the green', 'Finish a month with more income than expenses on what you recorded.', 'PERSONAL', myGreen ? 1 : 0, 1, myGreen && monthRange(myGreen).to),
  ];
  if (myChallenges) {
    const done = myChallenges.filter((c) => c.status === 'ACHIEVED').length;
    list.push(badge('CHALLENGE_CHAMPION', 'Challenge champion', 'Complete a savings challenge set by your parents.', 'PERSONAL', done, 1));
  }
  if (!family) return list;

  const { tx, budgets, goals } = family;

  // A finished month where every budget stayed at or under its limit (BR-15 spending, 100 % allowed).
  const budgetMonths = [...new Set(budgets.map((b) => b.periodMonth))].filter((m) => m < monthKey(today)).sort();
  const keptMonth = budgetMonths.find((m) => budgets.filter((b) => b.periodMonth === m).every((b) => b.percentUsed <= 100)) ?? null;

  const familyGreen = firstPositiveMonth(tx, today);

  const membersByMonth = new Map<string, Set<number>>();
  for (const t of tx) {
    const m = monthKey(t.transactionDate);
    membersByMonth.set(m, (membersByMonth.get(m) ?? new Set()).add(t.createdBy));
  }
  const team = Math.max(0, ...[...membersByMonth.values()].map((s) => s.size));

  const bestGoalPct = Math.max(0, ...goals.filter((g) => g.status !== 'CANCELLED').map((g) => (g.status === 'ACHIEVED' ? 100 : Math.floor((g.saved * 100) / g.targetAmount))));

  list.push(
    badge('PLANNER', 'Planner', 'Set the first monthly budget.', 'FAMILY', budgets.length > 0 ? 1 : 0, 1),
    badge('BUDGET_KEEPER', 'Budget keeper', 'Finish a month with every budget at or under its limit.', 'FAMILY', keptMonth ? 1 : 0, 1, keptMonth && monthRange(keptMonth).to),
    badge('POSITIVE_MONTH', 'Positive month', 'Finish a month where the family earned more than it spent.', 'FAMILY', familyGreen ? 1 : 0, 1, familyGreen && monthRange(familyGreen).to),
    badge('TEAM_EFFORT', 'Team effort', `${TEAM_TARGET} or more family members record transactions in the same month.`, 'FAMILY', team, TEAM_TARGET),
    badge('DREAMER', 'Dreamer', 'Create a savings goal.', 'FAMILY', goals.length > 0 ? 1 : 0, 1),
    badge('HALFWAY', 'Halfway there', 'Save half of a goal’s target.', 'FAMILY', Math.min(bestGoalPct, 100), 50),
    badge('GOAL_REACHED', 'Goal reached', 'Reach the target of a savings goal.', 'FAMILY', bestGoalPct, 100),
  );
  return list;
}

// ---------------------------------------------------------------- goal milestones (FR-44)

export const MILESTONES = [25, 50, 75, 100] as const;

export interface Milestone {
  percent: (typeof MILESTONES)[number];
  /** Amount saved at which this milestone is reached. */
  amount: Tiyn;
  reached: boolean;
}

export function goalMilestones(saved: Tiyn, target: Tiyn): Milestone[] {
  return MILESTONES.map((percent) => {
    const amount = Math.ceil((target * percent) / 100);
    return { percent, amount, reached: saved >= amount };
  });
}

/** The next milestone and how much is left to reach it; null once the goal is reached. */
export function nextMilestone(saved: Tiyn, target: Tiyn): { percent: number; left: Tiyn } | null {
  const next = goalMilestones(saved, target).find((m) => !m.reached);
  return next ? { percent: next.percent, left: next.amount - saved } : null;
}

// ---------------------------------------------------------------- points and levels (FR-45, BR-31)

export const LEVELS = [
  { level: 1, name: 'Beginner', from: 0 },
  { level: 2, name: 'Learner', from: 20 },
  { level: 3, name: 'Saver', from: 50 },
  { level: 4, name: 'Budget pro', from: 100 },
  { level: 5, name: 'Money master', from: 160 },
] as const;

export interface LevelInfo {
  points: number;
  level: number;
  name: string;
  /** Points where the next level starts; null at the top level. */
  nextAt: number | null;
  nextName: string | null;
  /** Progress inside the current level, 0–100. */
  percent: number;
}

/** Points are the sum of earned badges' points; the level follows from the points. */
export function levelOf(badges: Pick<Achievement, 'earned' | 'points'>[]): LevelInfo {
  const points = badges.filter((b) => b.earned).reduce((s, b) => s + b.points, 0);
  let idx = 0;
  while (idx + 1 < LEVELS.length && points >= LEVELS[idx + 1].from) idx++;
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  const percent = next ? Math.floor(((points - cur.from) * 100) / (next.from - cur.from)) : 100;
  return { points, level: cur.level, name: cur.name, nextAt: next?.from ?? null, nextName: next?.name ?? null, percent };
}
