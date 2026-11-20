// Saving together: who put how much into a shared goal (FR-47, BR-33), the family leaderboard
// (FR-48, BR-34) and the progress of the monthly family challenge (FR-49, BR-35).
// Pure functions, so the rules can be unit-tested and moved to the server unchanged.

import { monthKey } from './dates';
import type { Tiyn } from './money';

interface TxLike {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: Tiyn;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  transactionDate: string;
  createdBy: number;
}

export interface Contribution {
  memberId: number;
  amount: Tiyn;
}

export interface GoalContributions {
  /** The linked account's opening balance. */
  starting: Tiyn;
  /** Live INCOME and incoming TRANSFERs into the account, per member who recorded them, largest first. */
  members: Contribution[];
  /** Live outgoing TRANSFERs from the account. */
  takenOut: Tiyn;
}

/** BR-33: starting + sum(members) − takenOut equals the account balance (BR-07, BR-25). Pass live transactions only. */
export function goalContributions(account: { accountId: number; openingBalance: Tiyn }, liveTx: TxLike[]): GoalContributions {
  const byMember = new Map<number, Tiyn>();
  let takenOut = 0;
  for (const t of liveTx) {
    if (t.type === 'EXPENSE' && t.sourceAccountId === account.accountId) takenOut += t.amount; // cannot happen for savings in the UI, but keeps the sum exact
    if (t.type === 'TRANSFER' && t.sourceAccountId === account.accountId) takenOut += t.amount;
    if ((t.type === 'INCOME' || t.type === 'TRANSFER') && t.destinationAccountId === account.accountId) {
      byMember.set(t.createdBy, (byMember.get(t.createdBy) ?? 0) + t.amount);
    }
  }
  const members = [...byMember.entries()].map(([memberId, amount]) => ({ memberId, amount })).sort((a, b) => b.amount - a.amount || a.memberId - b.memberId);
  return { starting: account.openingBalance, members, takenOut };
}

export interface ChallengeProgress {
  /** Net money moved into savings in the month, never below 0. */
  saved: Tiyn;
  /** Net per member who recorded the transfers; only members with a positive amount, largest first. */
  members: Contribution[];
}

/**
 * BR-35: TRANSFERs dated in `month` from a non-savings account into a Savings account count,
 * transfers back out of savings are subtracted. Savings → savings, INCOME and EXPENSE never count.
 */
export function familyChallengeProgress(liveTx: TxLike[], savingsAccountIds: Set<number>, month: string): ChallengeProgress {
  const net = new Map<number, Tiyn>();
  let total = 0;
  for (const t of liveTx) {
    if (t.type !== 'TRANSFER' || monthKey(t.transactionDate) !== month) continue;
    const fromSavings = savingsAccountIds.has(t.sourceAccountId ?? -1);
    const toSavings = savingsAccountIds.has(t.destinationAccountId ?? -1);
    if (fromSavings === toSavings) continue;
    const delta = toSavings ? t.amount : -t.amount;
    total += delta;
    net.set(t.createdBy, (net.get(t.createdBy) ?? 0) + delta);
  }
  const members = [...net.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([memberId, amount]) => ({ memberId, amount }))
    .sort((a, b) => b.amount - a.amount || a.memberId - b.memberId);
  return { saved: Math.max(0, total), members };
}

export interface LeaderboardEntry {
  memberId: number;
  name: string;
  points: number;
}

/** BR-34: highest points first, equal points by name. */
export function rankLeaderboard<T extends LeaderboardEntry>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  let rank = 0;
  return sorted.map((r, i) => {
    if (i === 0 || r.points !== sorted[i - 1].points) rank = i + 1;
    return { ...r, rank };
  });
}
