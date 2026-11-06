// Shapes the web app works with. Names and enums follow docs/07-data-dictionary.md.
// Money fields are integer tiyn (see lib/money.ts); the API layer converts from numeric(14,2).

import type { Tiyn } from '../lib/money';

export type MemberRole = 'OWNER' | 'ADULT' | 'CHILD';
export type AccountType = 'CASH' | 'BANK_CARD' | 'SAVINGS' | 'CREDIT_CARD';
export type CategoryType = 'INCOME' | 'EXPENSE';
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
export type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'CANCELLED';
export type NotificationType =
  | 'BUDGET_80'
  | 'BUDGET_100'
  | 'INVITE_ACCEPTED'
  | 'INVITE_DECLINED'
  | 'RECURRING_CREATED'
  | 'RECURRING_SKIPPED'
  | 'GOAL_ACHIEVED';
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'BLOCK' | 'UNBLOCK';

export interface User {
  userId: number;
  email: string;
  fullName: string;
}

export interface Family {
  familyId: number;
  name: string;
  baseCurrency: 'KZT';
}

export interface Member {
  memberId: number;
  userId: number;
  fullName: string;
  email: string;
  role: MemberRole;
  joinedAt: string;
  removedAt: string | null;
}

/** What the session knows about the logged-in user. */
export interface Me {
  user: User;
  family: Family | null;
  member: Member | null;
}

export interface Account {
  accountId: number;
  name: string;
  type: AccountType;
  openingBalance: Tiyn;
  creditLimit: Tiyn | null;
  isArchived: boolean;
  /** Derived (BR-07). */
  balance: Tiyn;
  /** Child members this account is shared with (FR-13). Only filled for the Owner. */
  sharedWith: number[];
}

export interface Category {
  categoryId: number;
  name: string;
  type: CategoryType;
  parentId: number | null;
  isSystem: boolean;
  isArchived: boolean;
}

export interface Transaction {
  transactionId: number;
  type: TransactionType;
  amount: Tiyn;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  transactionDate: string;
  description: string | null;
  createdBy: number;
  createdAt: string;
}

export interface TransactionInput {
  type: TransactionType;
  amount: Tiyn;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  transactionDate: string;
  description: string | null;
}

export interface TransactionFilter {
  from?: string;
  to?: string;
  type?: TransactionType;
  accountId?: number;
  categoryId?: number;
  memberId?: number;
  search?: string;
}

export interface Budget {
  budgetId: number;
  categoryId: number;
  periodMonth: string; // "2026-11"
  limitAmount: Tiyn;
  /** Derived (BR-15). */
  spent: Tiyn;
  remaining: Tiyn;
  percentUsed: number;
}

export interface Goal {
  goalId: number;
  accountId: number;
  name: string;
  targetAmount: Tiyn;
  targetDate: string | null;
  status: GoalStatus;
  /** Linked savings account balance (BR-25). */
  saved: Tiyn;
}

export interface Invitation {
  invitationId: number;
  familyId: number;
  familyName: string;
  email: string;
  role: Exclude<MemberRole, 'OWNER'>;
  status: InvitationStatus;
  expiresAt: string;
  invitedByName: string;
}

export interface Notification {
  notificationId: number;
  type: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditEntry {
  logId: number;
  actorName: string;
  entityType: 'TRANSACTION' | 'ACCOUNT' | 'BUDGET' | 'FAMILY_MEMBER' | 'USER';
  entityId: number;
  action: AuditAction;
  summary: string;
  createdAt: string;
}

export interface MonthlySummary {
  income: Tiyn;
  expenses: Tiyn;
  net: Tiyn;
  balances: { accountId: number; name: string; balance: Tiyn }[];
  byCategory: { categoryId: number; name: string; amount: Tiyn }[];
  byMember: { memberId: number; name: string; income: Tiyn; expenses: Tiyn }[];
  daily: { date: string; income: Tiyn; expenses: Tiyn }[];
}

export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 423,
    message: string,
  ) {
    super(message);
  }
}
