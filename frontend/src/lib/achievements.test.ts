// FR-43, FR-44, BR-29, BR-30: achievement badges and goal milestones.

import { describe, expect, it } from 'vitest';
import { BADGE_POINTS, computeAchievements, goalMilestones, levelOf, longestStreak, nextMilestone, type AchievementInput } from './achievements';

const TODAY = '2026-11-13';
const kzt = (n: number) => n * 100;
const tx = (type: 'INCOME' | 'EXPENSE' | 'TRANSFER', amount: number, transactionDate: string, createdBy = 1) => ({ type, amount: kzt(amount), transactionDate, createdBy });
const get = (input: AchievementInput, id: string) => computeAchievements(input).find((b) => b.id === id)!;
const family = (over: Partial<NonNullable<AchievementInput['family']>> = {}) => ({ tx: [], budgets: [], goals: [], ...over });

describe('personal badges (FR-43)', () => {
  it('fr43 first step is earned on the day of the first transaction', () => {
    const b = get({ today: TODAY, myTx: [tx('EXPENSE', 500, '2026-11-05'), tx('INCOME', 900, '2026-11-02')] }, 'FIRST_STEP');
    expect(b).toMatchObject({ earned: true, earnedOn: '2026-11-02' });
  });

  it('fr43 nothing recorded means nothing earned', () => {
    const list = computeAchievements({ today: TODAY, myTx: [] });
    expect(list.every((b) => !b.earned)).toBe(true);
  });

  it('fr43 regular shows progress towards 25 transactions', () => {
    const myTx = Array.from({ length: 10 }, (_, i) => tx('EXPENSE', 100, `2026-10-${String(i + 1).padStart(2, '0')}`));
    expect(get({ today: TODAY, myTx }, 'REGULAR')).toMatchObject({ earned: false, progress: { current: 10, target: 25 } });
  });

  it('fr43 streak counts consecutive days, also across a month end', () => {
    expect(longestStreak(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-03'], 3)).toEqual({ best: 4, reachedOn: '2026-10-31' });
    expect(longestStreak(['2026-11-01', '2026-11-01', '2026-11-02'])).toEqual({ best: 2, reachedOn: null });
  });

  it('br12 transfers do not make a month green', () => {
    const myTx = [tx('INCOME', 1_000, '2026-10-01'), tx('EXPENSE', 800, '2026-10-02'), tx('TRANSFER', 5_000, '2026-10-03')];
    expect(get({ today: TODAY, myTx }, 'IN_THE_GREEN')).toMatchObject({ earned: true, earnedOn: '2026-10-31' });
    const onlyTransfer = [tx('TRANSFER', 5_000, '2026-10-03')];
    expect(get({ today: TODAY, myTx: onlyTransfer }, 'IN_THE_GREEN').earned).toBe(false);
  });

  it('br29 the current month cannot earn a month badge before it ends', () => {
    const myTx = [tx('INCOME', 1_000, '2026-11-01')];
    expect(get({ today: TODAY, myTx }, 'IN_THE_GREEN').earned).toBe(false);
  });
});

describe('family badges (FR-43, BR-30)', () => {
  it('br30 a child gets only personal badges', () => {
    const list = computeAchievements({ today: TODAY, myTx: [tx('EXPENSE', 100, '2026-11-01')] });
    expect(list.every((b) => b.scope === 'PERSONAL')).toBe(true);
  });

  it('fr43 budget keeper needs a finished month with every budget at or under 100 %', () => {
    const budgets = [
      { periodMonth: '2026-09', percentUsed: 120 },
      { periodMonth: '2026-09', percentUsed: 50 },
      { periodMonth: '2026-10', percentUsed: 100 },
      { periodMonth: '2026-10', percentUsed: 70 },
    ];
    expect(get({ today: TODAY, myTx: [], family: family({ budgets }) }, 'BUDGET_KEEPER')).toMatchObject({ earned: true, earnedOn: '2026-10-31' });
    const onlyThisMonth = [{ periodMonth: '2026-11', percentUsed: 10 }];
    expect(get({ today: TODAY, myTx: [], family: family({ budgets: onlyThisMonth }) }, 'BUDGET_KEEPER').earned).toBe(false);
  });

  it('fr43 team effort counts different members in one month', () => {
    const t = [tx('EXPENSE', 1, '2026-10-01', 1), tx('EXPENSE', 1, '2026-11-01', 2)];
    expect(get({ today: TODAY, myTx: [], family: family({ tx: t }) }, 'TEAM_EFFORT').earned).toBe(false);
    t.push(tx('INCOME', 1, '2026-11-02', 1));
    expect(get({ today: TODAY, myTx: [], family: family({ tx: t }) }, 'TEAM_EFFORT').earned).toBe(true);
  });

  it('fr43 goal badges follow the best goal; cancelled goals count only for dreamer', () => {
    const goals = [
      { saved: kzt(400), targetAmount: kzt(600), status: 'CANCELLED' as const },
      { saved: kzt(200), targetAmount: kzt(600), status: 'ACTIVE' as const },
    ];
    const f = { today: TODAY, myTx: [], family: family({ goals }) };
    expect(get(f, 'DREAMER').earned).toBe(true);
    expect(get(f, 'HALFWAY')).toMatchObject({ earned: false, progress: { current: 33, target: 50 } });
    goals[1].saved = kzt(300);
    expect(get(f, 'HALFWAY').earned).toBe(true);
    expect(get(f, 'GOAL_REACHED').earned).toBe(false);
    goals[1].status = 'ACHIEVED' as never;
    expect(get(f, 'GOAL_REACHED').earned).toBe(true);
  });
});

describe('goal milestones (FR-44)', () => {
  it('fr44 marks 25, 50, 75 and 100 % of the target', () => {
    expect(goalMilestones(kzt(200_000), kzt(600_000)).map((m) => [m.percent, m.amount / 100, m.reached])).toEqual([
      [25, 150_000, true],
      [50, 300_000, false],
      [75, 450_000, false],
      [100, 600_000, false],
    ]);
  });

  it('fr44 next milestone says how much is left; none once the goal is reached', () => {
    expect(nextMilestone(kzt(200_000), kzt(600_000))).toEqual({ percent: 50, left: kzt(100_000) });
    expect(nextMilestone(kzt(600_000), kzt(600_000))).toBeNull();
  });
});

describe('points and levels (FR-45, BR-31)', () => {
  const earned = (...points: number[]) => points.map((p) => ({ earned: true, points: p }));

  it('fr45 points are the sum of earned badges only', () => {
    expect(levelOf([...earned(10, 25), { earned: false, points: 50 }]).points).toBe(35);
  });

  it('fr45 levels start at 0, 20, 50, 100 and 160 points', () => {
    expect(levelOf([]).level).toBe(1);
    expect(levelOf(earned(19)).level).toBe(1);
    expect(levelOf(earned(20))).toMatchObject({ level: 2, name: 'Learner', nextAt: 50, percent: 0 });
    expect(levelOf(earned(35))).toMatchObject({ level: 2, percent: 50 });
    expect(levelOf(earned(100)).name).toBe('Budget pro');
    expect(levelOf(earned(500))).toMatchObject({ level: 5, name: 'Money master', nextAt: null, percent: 100 });
  });

  it('fr45 every badge gives points, harder ones more', () => {
    const list = computeAchievements({ today: TODAY, myTx: [], family: family(), myChallenges: [] });
    expect(list.every((b) => b.points === BADGE_POINTS[b.id] && b.points > 0)).toBe(true);
    expect(BADGE_POINTS.GOAL_REACHED).toBeGreaterThan(BADGE_POINTS.FIRST_STEP);
  });
});

describe('challenge badge (FR-46)', () => {
  it('fr46 challenge champion appears only for a child and needs a completed challenge', () => {
    expect(computeAchievements({ today: TODAY, myTx: [] }).some((b) => b.id === 'CHALLENGE_CHAMPION')).toBe(false);
    expect(get({ today: TODAY, myTx: [], myChallenges: [{ status: 'ACTIVE' }] }, 'CHALLENGE_CHAMPION').earned).toBe(false);
    expect(get({ today: TODAY, myTx: [], myChallenges: [{ status: 'ACHIEVED' }] }, 'CHALLENGE_CHAMPION').earned).toBe(true);
  });
});
