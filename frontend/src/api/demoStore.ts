// In-browser demo backend.
//
// The FastAPI app has no HTTP endpoints yet, so the web app talks to this store through
// the same interface it will later use for the real API (see api/index.ts). It follows the
// business rules and the permission matrix so the screens behave like the real system,
// but it is NOT a security boundary: the server must enforce everything again (NFR-02).
// Data is kept in localStorage of this browser only.

import { currentMonth, dayOfMonth, dayOfThisMonth, shiftMonth } from '../lib/dates';
import { formatMoney, type Tiyn } from '../lib/money';
import type { AccountType, AuditAction, CategoryType, GoalStatus, InvitationStatus, MemberRole, NotificationType, TransactionType } from './types';

export interface DbUser {
  userId: number;
  email: string;
  fullName: string;
  passwordHash: string;
  isActive: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  privacyAcceptedAt: string;
}
export interface DbFamily { familyId: number; name: string; baseCurrency: 'KZT'; createdAt: string }
export interface DbMember { memberId: number; familyId: number; userId: number; role: MemberRole; joinedAt: string; removedAt: string | null }
export interface DbInvitation {
  invitationId: number;
  familyId: number;
  email: string;
  role: Exclude<MemberRole, 'OWNER'>;
  tokenHash: string;
  invitedBy: number;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}
export interface DbAccount {
  accountId: number;
  familyId: number;
  name: string;
  type: AccountType;
  openingBalance: Tiyn;
  creditLimit: Tiyn | null;
  isArchived: boolean;
  createdBy: number;
}
export interface DbAccountAccess { accountId: number; memberId: number }
export interface DbCategory { categoryId: number; familyId: number | null; parentId: number | null; name: string; type: CategoryType; isArchived: boolean }
export interface DbTransaction {
  transactionId: number;
  familyId: number;
  type: TransactionType;
  amount: Tiyn;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  transactionDate: string;
  description: string | null;
  createdBy: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface DbBudget {
  budgetId: number;
  familyId: number;
  categoryId: number;
  periodMonth: string;
  limitAmount: Tiyn;
  alert80Sent: boolean;
  alert100Sent: boolean;
  createdBy: number;
}
export interface DbGoal { goalId: number; familyId: number; accountId: number; name: string; targetAmount: Tiyn; targetDate: string | null; status: GoalStatus; createdBy: number }
export interface DbNotification { notificationId: number; memberId: number; type: NotificationType; message: string; isRead: boolean; createdAt: string }
export interface DbAudit {
  logId: number;
  familyId: number | null;
  actorUserId: number;
  entityType: 'TRANSACTION' | 'ACCOUNT' | 'BUDGET' | 'FAMILY_MEMBER' | 'USER';
  entityId: number;
  action: AuditAction;
  summary: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}

export interface Db {
  version: 1;
  nextId: number;
  sessionUserId: number | null;
  users: DbUser[];
  families: DbFamily[];
  members: DbMember[];
  invitations: DbInvitation[];
  accounts: DbAccount[];
  accountAccess: DbAccountAccess[];
  categories: DbCategory[];
  transactions: DbTransaction[];
  budgets: DbBudget[];
  goals: DbGoal[];
  notifications: DbNotification[];
  audit: DbAudit[];
}

const STORAGE_KEY = 'fbt-demo-v1';
export const DEMO_PASSWORD = 'demo1234';

export async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Demo only: the real backend uses Argon2id/bcrypt with a salt (NFR-01). */
export function hashPassword(email: string, password: string): Promise<string> {
  return sha256(`fbt-demo:${email}:${password}`);
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function loadDb(): Db | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const db = JSON.parse(raw) as Db;
    return db.version === 1 ? db : null;
  } catch {
    return null;
  }
}

export function saveDb(db: Db): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function clearDb(): void {
  localStorage.removeItem(STORAGE_KEY);
}

const kzt = (n: number): Tiyn => n * 100;

/** Demo family built around the personas in docs/02 §4 and the worked example in docs/06. */
export async function seedDb(): Promise<Db> {
  const now = new Date().toISOString();
  const thisMonth = currentMonth();
  const prevMonth = shiftMonth(thisMonth, -1);
  let id = 1;
  const next = () => id++;

  const people = [
    { name: 'Aigerim Seitkali', email: 'aigerim@mail.kz' },
    { name: 'Daulet Seitkali', email: 'daulet@mail.kz' },
    { name: 'Aidar Seitkali', email: 'aidar@mail.kz' },
    { name: 'Saule Nurlanova', email: 'saule@mail.kz' },
  ];
  const users: DbUser[] = [];
  for (const p of people) {
    users.push({
      userId: next(),
      email: p.email,
      fullName: p.name,
      passwordHash: await hashPassword(p.email, DEMO_PASSWORD),
      isActive: true,
      failedLoginCount: 0,
      lockedUntil: null,
      privacyAcceptedAt: now,
    });
  }
  const [aigerimU, dauletU, aidarU] = users;

  const family: DbFamily = { familyId: next(), name: 'Seitkali family', baseCurrency: 'KZT', createdAt: now };
  const fid = family.familyId;
  const joined = `${prevMonth}-01T09:00:00.000Z`;
  const aigerim: DbMember = { memberId: next(), familyId: fid, userId: aigerimU.userId, role: 'OWNER', joinedAt: joined, removedAt: null };
  const daulet: DbMember = { memberId: next(), familyId: fid, userId: dauletU.userId, role: 'ADULT', joinedAt: joined, removedAt: null };
  const aidar: DbMember = { memberId: next(), familyId: fid, userId: aidarU.userId, role: 'CHILD', joinedAt: joined, removedAt: null };

  // Default categories (FR-14): family_id NULL = system category.
  const categories: DbCategory[] = [];
  const cat = (name: string, type: CategoryType) => {
    const c: DbCategory = { categoryId: next(), familyId: null, parentId: null, name, type, isArchived: false };
    categories.push(c);
    return c.categoryId;
  };
  const salary = cat('Salary', 'INCOME');
  cat('Scholarship', 'INCOME');
  const gift = cat('Gift', 'INCOME');
  cat('Refunds', 'INCOME');
  cat('Other income', 'INCOME');
  const food = cat('Food', 'EXPENSE');
  const transport = cat('Transport', 'EXPENSE');
  const housing = cat('Housing & utilities', 'EXPENSE');
  const health = cat('Health', 'EXPENSE');
  cat('Education', 'EXPENSE');
  const fun = cat('Entertainment', 'EXPENSE');
  const clothing = cat('Clothing', 'EXPENSE');
  cat('Other expense', 'EXPENSE');

  const acc = (name: string, type: AccountType, opening: number, creditLimit: number | null = null): DbAccount => ({
    accountId: next(),
    familyId: fid,
    name,
    type,
    openingBalance: kzt(opening),
    creditLimit: creditLimit === null ? null : kzt(creditLimit),
    isArchived: false,
    createdBy: aigerim.memberId,
  });
  const kaspi = acc('Kaspi card', 'BANK_CARD', 150_000);
  const cash = acc('Cash', 'CASH', 10_000);
  const savings = acc('Savings', 'SAVINGS', 0);
  const pocket = acc('Aidar — pocket money', 'CASH', 0);
  const credit = acc('Halyk credit card', 'CREDIT_CARD', 0, 300_000);

  const transactions: DbTransaction[] = [];
  const tx = (
    type: TransactionType,
    amount: number,
    date: string,
    by: DbMember,
    p: { from?: DbAccount; to?: DbAccount; category?: number; description?: string },
  ) => {
    transactions.push({
      transactionId: next(),
      familyId: fid,
      type,
      amount: kzt(amount),
      sourceAccountId: p.from?.accountId ?? null,
      destinationAccountId: p.to?.accountId ?? null,
      categoryId: p.category ?? null,
      transactionDate: date,
      description: p.description ?? null,
      createdBy: by.memberId,
      isDeleted: false,
      createdAt: `${date}T12:00:00.000Z`,
      updatedAt: `${date}T12:00:00.000Z`,
    });
  };
  const pm = (day: number) => dayOfMonth(prevMonth, day);
  const tm = dayOfThisMonth;

  // Previous month
  tx('INCOME', 350_000, pm(1), daulet, { to: kaspi, category: salary, description: 'Salary' });
  tx('EXPENSE', 120_000, pm(2), aigerim, { from: kaspi, category: housing, description: 'Rent' });
  tx('TRANSFER', 15_000, pm(3), daulet, { from: kaspi, to: cash, description: 'ATM withdrawal' });
  tx('EXPENSE', 31_500, pm(6), aigerim, { from: kaspi, category: food, description: 'Magnum' });
  tx('EXPENSE', 9_800, pm(9), daulet, { from: cash, category: transport, description: 'Taxi' });
  tx('EXPENSE', 9_000, pm(12), aigerim, { from: kaspi, category: health, description: 'Pharmacy' });
  tx('EXPENSE', 26_500, pm(18), aigerim, { from: kaspi, category: food, description: 'Small groceries' });
  tx('EXPENSE', 12_000, pm(21), daulet, { from: kaspi, category: fun, description: 'Concert tickets' });
  tx('TRANSFER', 100_000, pm(25), aigerim, { from: kaspi, to: savings, description: 'Summer trip' });
  tx('EXPENSE', 8_200, pm(27), daulet, { from: cash, category: transport, description: 'Fuel' });

  // This month: the worked example from docs/06 plus a few everyday movements
  tx('INCOME', 350_000, tm(1), daulet, { to: kaspi, category: salary, description: 'Salary' });
  tx('TRANSFER', 10_000, tm(1), aigerim, { from: kaspi, to: pocket, description: 'Pocket money' });
  tx('TRANSFER', 20_000, tm(2), daulet, { from: kaspi, to: cash, description: 'ATM withdrawal' });
  tx('EXPENSE', 120_000, tm(2), aigerim, { from: kaspi, category: housing, description: 'Rent' });
  tx('EXPENSE', 45_000, tm(3), aigerim, { from: kaspi, category: food, description: 'Magnum' });
  tx('EXPENSE', 6_500, tm(3), daulet, { from: cash, category: transport, description: 'Taxi' });
  tx('INCOME', 5_000, tm(3), aidar, { to: pocket, category: gift, description: 'From grandma' });
  tx('EXPENSE', 5_000, tm(4), aigerim, { from: cash, category: food, description: 'Bazaar' });
  tx('EXPENSE', 2_500, tm(4), aidar, { from: pocket, category: fun, description: 'Cinema' });
  tx('TRANSFER', 100_000, tm(5), aigerim, { from: kaspi, to: savings, description: 'Summer trip' });
  tx('EXPENSE', 32_000, tm(5), daulet, { from: credit, category: clothing, description: 'Winter jacket' });

  const budget = (categoryId: number, month: string, limit: number, alert80 = false): DbBudget => ({
    budgetId: next(),
    familyId: fid,
    categoryId,
    periodMonth: month,
    limitAmount: kzt(limit),
    alert80Sent: alert80,
    alert100Sent: false,
    createdBy: aigerim.memberId,
  });
  const budgets = [
    budget(food, prevMonth, 60_000, true),
    budget(housing, prevMonth, 150_000),
    budget(transport, prevMonth, 20_000),
    budget(health, prevMonth, 10_000, true),
    budget(food, thisMonth, 60_000, true), // 50 000 of 60 000 = 83 % → 80 % alert (worked example, step 4)
    budget(housing, thisMonth, 150_000, true), // 120 000 of 150 000 = 80 %
    budget(transport, thisMonth, 20_000),
    budget(fun, thisMonth, 15_000),
  ];

  const tripDate = `${shiftMonth(thisMonth, 7)}-01`;
  const goals: DbGoal[] = [
    { goalId: next(), familyId: fid, accountId: savings.accountId, name: 'Summer trip', targetAmount: kzt(600_000), targetDate: tripDate, status: 'ACTIVE', createdBy: aigerim.memberId },
  ];

  const foodAlert = `Food budget is 83 % used (${formatMoney(kzt(50_000))} of ${formatMoney(kzt(60_000))})`;
  const alertTime = `${tm(4)}T12:01:00.000Z`;
  const housingAlert = `Housing & utilities budget is 80 % used (${formatMoney(kzt(120_000))} of ${formatMoney(kzt(150_000))})`;
  const housingTime = `${tm(2)}T12:01:00.000Z`;
  const notifications: DbNotification[] = [
    { notificationId: next(), memberId: aigerim.memberId, type: 'BUDGET_80', message: foodAlert, isRead: false, createdAt: alertTime },
    { notificationId: next(), memberId: daulet.memberId, type: 'BUDGET_80', message: foodAlert, isRead: false, createdAt: alertTime },
    { notificationId: next(), memberId: aigerim.memberId, type: 'BUDGET_80', message: housingAlert, isRead: true, createdAt: housingTime },
    { notificationId: next(), memberId: daulet.memberId, type: 'BUDGET_80', message: housingAlert, isRead: true, createdAt: housingTime },
    { notificationId: next(), memberId: aigerim.memberId, type: 'INVITE_ACCEPTED', message: 'Daulet Seitkali accepted your invitation', isRead: true, createdAt: joined },
  ];

  // Saule has a pending invitation, so logging in as her shows the onboarding screen (UC-02, step 5).
  const invitations: DbInvitation[] = [
    {
      invitationId: next(),
      familyId: fid,
      email: 'saule@mail.kz',
      role: 'ADULT',
      tokenHash: await sha256(randomToken()),
      invitedBy: aigerim.memberId,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    },
  ];

  const audit: DbAudit[] = transactions.map((t) => ({
    logId: next(),
    familyId: fid,
    actorUserId: [aigerim, daulet, aidar].find((m) => m.memberId === t.createdBy)!.userId,
    entityType: 'TRANSACTION' as const,
    entityId: t.transactionId,
    action: 'CREATE' as const,
    summary: `${t.type.toLowerCase()} ${formatMoney(t.amount)}${t.description ? ` · ${t.description}` : ''}`,
    oldValue: null,
    newValue: { ...t },
    createdAt: t.createdAt,
  }));

  return {
    version: 1,
    nextId: id,
    sessionUserId: null,
    users,
    families: [family],
    members: [aigerim, daulet, aidar],
    invitations,
    accounts: [kaspi, cash, savings, pocket, credit],
    accountAccess: [{ accountId: pocket.accountId, memberId: aidar.memberId }],
    categories,
    transactions,
    budgets,
    goals,
    notifications,
    audit,
  };
}
