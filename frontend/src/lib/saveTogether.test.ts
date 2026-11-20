// FR-47 – FR-49, BR-33 – BR-35: saving together.

import { describe, expect, it } from 'vitest';
import { familyChallengeProgress, goalContributions, rankLeaderboard } from './saveTogether';

const kzt = (n: number) => n * 100;
const KASPI = 1;
const SAVINGS = 2;
const DEPOSIT = 3;
const AIGERIM = 10;
const DAULET = 11;
const tx = (type: 'INCOME' | 'EXPENSE' | 'TRANSFER', amount: number, from: number | null, to: number | null, by: number, date = '2026-11-05') => ({
  type,
  amount: kzt(amount),
  sourceAccountId: from,
  destinationAccountId: to,
  transactionDate: date,
  createdBy: by,
});

describe('goal contributions (FR-47, BR-33)', () => {
  it('br33 shows what each member put in, largest first, and adds up to the balance', () => {
    const txs = [tx('TRANSFER', 100_000, KASPI, SAVINGS, AIGERIM), tx('TRANSFER', 50_000, KASPI, SAVINGS, DAULET), tx('TRANSFER', 100_000, KASPI, SAVINGS, AIGERIM), tx('TRANSFER', 20_000, SAVINGS, KASPI, DAULET), tx('EXPENSE', 999, KASPI, null, DAULET)];
    const c = goalContributions({ accountId: SAVINGS, openingBalance: kzt(5_000) }, txs);
    expect(c.members).toEqual([
      { memberId: AIGERIM, amount: kzt(200_000) },
      { memberId: DAULET, amount: kzt(50_000) },
    ]);
    expect(c.takenOut).toBe(kzt(20_000));
    expect(c.starting + c.members.reduce((s, m) => s + m.amount, 0) - c.takenOut).toBe(kzt(235_000));
  });

  it('br33 income straight into the account counts for whoever recorded it', () => {
    const c = goalContributions({ accountId: SAVINGS, openingBalance: 0 }, [tx('INCOME', 3_000, null, SAVINGS, DAULET)]);
    expect(c.members).toEqual([{ memberId: DAULET, amount: kzt(3_000) }]);
  });
});

describe('monthly family challenge progress (FR-49, BR-35)', () => {
  const savings = new Set([SAVINGS, DEPOSIT]);

  it('br35 counts transfers into savings in the month and subtracts money taken back out', () => {
    const txs = [
      tx('TRANSFER', 100_000, KASPI, SAVINGS, AIGERIM),
      tx('TRANSFER', 50_000, KASPI, DEPOSIT, DAULET),
      tx('TRANSFER', 30_000, SAVINGS, KASPI, AIGERIM),
      tx('TRANSFER', 40_000, SAVINGS, DEPOSIT, DAULET), // savings → savings: not new saving
      tx('INCOME', 500_000, null, SAVINGS, DAULET), // income never counts
      tx('TRANSFER', 70_000, KASPI, SAVINGS, AIGERIM, '2026-10-31'), // other month
    ];
    const p = familyChallengeProgress(txs, savings, '2026-11');
    expect(p.saved).toBe(kzt(120_000));
    expect(p.members).toEqual([
      { memberId: AIGERIM, amount: kzt(70_000) },
      { memberId: DAULET, amount: kzt(50_000) },
    ]);
  });

  it('br35 progress never goes below 0', () => {
    const p = familyChallengeProgress([tx('TRANSFER', 10_000, SAVINGS, KASPI, AIGERIM)], savings, '2026-11');
    expect(p).toEqual({ saved: 0, members: [] });
  });
});

describe('family leaderboard (FR-48, BR-34)', () => {
  it('br34 ranks by points, equal points share a rank and are ordered by name', () => {
    const ranked = rankLeaderboard([
      { memberId: 1, name: 'Daulet', points: 60 },
      { memberId: 2, name: 'Aidar', points: 35 },
      { memberId: 3, name: 'Aigerim', points: 60 },
    ]);
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([
      ['Aigerim', 1],
      ['Daulet', 1],
      ['Aidar', 3],
    ]);
  });
});
