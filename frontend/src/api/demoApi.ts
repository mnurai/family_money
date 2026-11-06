// Demo implementation of the API used by the screens. See demoStore.ts for why it exists.
// Each method names the requirement or rule it follows; messages match the use cases (NFR-15).

import { monthKey, monthRange, shiftMonth, today } from '../lib/dates';
import { formatMoney, type Tiyn } from '../lib/money';
import {
  clearDb,
  hashPassword,
  loadDb,
  randomToken,
  saveDb,
  seedDb,
  sha256,
  type Db,
  type DbAccount,
  type DbAudit,
  type DbBudget,
  type DbMember,
  type DbTransaction,
  type DbUser,
} from './demoStore';
import {
  ApiError,
  type Account,
  type AccountType,
  type AuditEntry,
  type Budget,
  type Category,
  type Goal,
  type Invitation,
  type Me,
  type Member,
  type MemberRole,
  type MonthlySummary,
  type Notification,
  type NotificationType,
  type Transaction,
  type TransactionFilter,
  type TransactionInput,
} from './types';

const NON_NEGATIVE: AccountType[] = ['CASH', 'BANK_CARD', 'SAVINGS']; // BR-08
const INVITE_DAYS = 7; // BR-19
const LOCK_AFTER = 5; // NFR-06
const LOCK_MINUTES = 15;

let dbPromise: Promise<Db> | null = null;

async function db(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const existing = loadDb();
      if (existing) return existing;
      const fresh = await seedDb();
      saveDb(fresh);
      return fresh;
    })();
  }
  return dbPromise;
}

const wait = () => new Promise((r) => setTimeout(r, 120));

/** Run a read or a change; a change is saved only if it finishes without an error (all-or-nothing, NFR-09). */
async function read<T>(fn: (d: Db) => T | Promise<T>): Promise<T> {
  await wait();
  return fn(await db());
}

async function write<T>(fn: (d: Db) => T | Promise<T>): Promise<T> {
  await wait();
  const d = await db();
  const snapshot = structuredClone(d);
  try {
    const result = await fn(d);
    saveDb(d);
    return result;
  } catch (e) {
    Object.assign(d, snapshot);
    throw e;
  }
}

const nextId = (d: Db) => d.nextId++;
const nowIso = () => new Date().toISOString();
const bad = (msg: string) => new ApiError(400, msg);
const forbidden = (msg = 'You do not have permission to do this') => new ApiError(403, msg);
const notFound = (what: string) => new ApiError(404, `${what} not found`);

// ---------------------------------------------------------------- session

interface Ctx {
  user: DbUser;
  member: DbMember;
  familyId: number;
  role: MemberRole;
}

function sessionUser(d: Db): DbUser {
  const user = d.users.find((u) => u.userId === d.sessionUserId);
  if (!user) throw new ApiError(401, 'Please log in');
  if (!user.isActive) throw new ApiError(403, 'Your account has been blocked');
  return user;
}

function activeMemberOf(d: Db, userId: number): DbMember | undefined {
  return d.members.find((m) => m.userId === userId && m.removedAt === null);
}

/** Who and which family always come from the session, never from the request (doc 10 §3.1). */
function ctx(d: Db): Ctx {
  const user = sessionUser(d);
  const member = activeMemberOf(d, user.userId);
  if (!member) throw new ApiError(403, 'Create a family or accept an invitation first');
  return { user, member, familyId: member.familyId, role: member.role };
}

function requireRole(c: Ctx, roles: MemberRole[], msg?: string) {
  if (!roles.includes(c.role)) throw forbidden(msg);
}

function audit(d: Db, c: { user: DbUser; familyId: number | null }, e: Omit<DbAudit, 'logId' | 'familyId' | 'actorUserId' | 'createdAt'>) {
  d.audit.push({ ...e, logId: nextId(d), familyId: c.familyId, actorUserId: c.user.userId, createdAt: nowIso() }); // BR-27: append only
}

function notify(d: Db, memberIds: number[], type: NotificationType, message: string) {
  for (const memberId of memberIds) {
    d.notifications.push({ notificationId: nextId(d), memberId, type, message, isRead: false, createdAt: nowIso() });
  }
}

/** Owner and Adults: they get budget and goal alerts, children do not (FR-26). */
function grownUps(d: Db, familyId: number): number[] {
  return d.members.filter((m) => m.familyId === familyId && m.removedAt === null && m.role !== 'CHILD').map((m) => m.memberId);
}

// ---------------------------------------------------------------- balances (BR-07, BR-08)

function liveTx(d: Db, familyId: number, exceptId?: number): DbTransaction[] {
  return d.transactions.filter((t) => t.familyId === familyId && !t.isDeleted && t.transactionId !== exceptId);
}

function balanceOf(account: DbAccount, txs: DbTransaction[], upTo?: string): Tiyn {
  let b = account.openingBalance;
  for (const t of txs) {
    if (upTo && t.transactionDate > upTo) continue;
    if (t.destinationAccountId === account.accountId) b += t.amount;
    if (t.sourceAccountId === account.accountId) b -= t.amount;
  }
  return b;
}

function floorOf(account: DbAccount): Tiyn {
  return NON_NEGATIVE.includes(account.type) ? 0 : -(account.creditLimit ?? 0);
}

function sharedAccountIds(d: Db, memberId: number): Set<number> {
  return new Set(d.accountAccess.filter((a) => a.memberId === memberId).map((a) => a.accountId));
}

/** Accounts this member may see: all for Owner/Adult, shared only for a Child (BR-10). */
function visibleAccounts(d: Db, c: Ctx): DbAccount[] {
  const all = d.accounts.filter((a) => a.familyId === c.familyId);
  if (c.role !== 'CHILD') return all;
  const shared = sharedAccountIds(d, c.member.memberId);
  return all.filter((a) => shared.has(a.accountId));
}

function visibleTx(d: Db, c: Ctx): DbTransaction[] {
  const txs = liveTx(d, c.familyId);
  if (c.role !== 'CHILD') return txs;
  const shared = sharedAccountIds(d, c.member.memberId);
  return txs.filter((t) => shared.has(t.sourceAccountId ?? -1) || shared.has(t.destinationAccountId ?? -1));
}

function toAccount(d: Db, c: Ctx, a: DbAccount): Account {
  return {
    accountId: a.accountId,
    name: a.name,
    type: a.type,
    openingBalance: a.openingBalance,
    creditLimit: a.creditLimit,
    isArchived: a.isArchived,
    balance: balanceOf(a, liveTx(d, c.familyId)),
    sharedWith: c.role === 'OWNER' ? d.accountAccess.filter((x) => x.accountId === a.accountId).map((x) => x.memberId) : [],
  };
}

function toTx(t: DbTransaction): Transaction {
  return {
    transactionId: t.transactionId,
    type: t.type,
    amount: t.amount,
    sourceAccountId: t.sourceAccountId,
    destinationAccountId: t.destinationAccountId,
    categoryId: t.categoryId,
    transactionDate: t.transactionDate,
    description: t.description,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
  };
}

function toMember(d: Db, m: DbMember): Member {
  const u = d.users.find((x) => x.userId === m.userId)!;
  return { memberId: m.memberId, userId: u.userId, fullName: u.fullName, email: u.email, role: m.role, joinedAt: m.joinedAt, removedAt: m.removedAt };
}

// ---------------------------------------------------------------- budgets (BR-14 – BR-16)

function rootCategoryId(d: Db, categoryId: number): number {
  const c = d.categories.find((x) => x.categoryId === categoryId);
  return c?.parentId ?? categoryId;
}

function spentFor(d: Db, b: DbBudget): Tiyn {
  const { from, to } = monthRange(b.periodMonth);
  return liveTx(d, b.familyId)
    .filter((t) => t.type === 'EXPENSE' && t.categoryId !== null && rootCategoryId(d, t.categoryId) === b.categoryId)
    .filter((t) => t.transactionDate >= from && t.transactionDate <= to)
    .reduce((s, t) => s + t.amount, 0);
}

function toBudget(d: Db, b: DbBudget): Budget {
  const spent = spentFor(d, b);
  return {
    budgetId: b.budgetId,
    categoryId: b.categoryId,
    periodMonth: b.periodMonth,
    limitAmount: b.limitAmount,
    spent,
    remaining: b.limitAmount - spent,
    percentUsed: Math.floor((spent * 100) / b.limitAmount),
  };
}

/** UC-08: recheck the budget of the category and month an expense touched. */
function checkBudget(d: Db, familyId: number, categoryId: number | null, date: string) {
  if (categoryId === null) return;
  const root = rootCategoryId(d, categoryId);
  const b = d.budgets.find((x) => x.familyId === familyId && x.categoryId === root && x.periodMonth === monthKey(date));
  if (!b) return;
  const spent = spentFor(d, b);
  const pct = Math.floor((spent * 100) / b.limitAmount);
  const name = d.categories.find((c) => c.categoryId === b.categoryId)!.name;
  if (pct >= 100 && !b.alert100Sent) {
    b.alert100Sent = true;
    b.alert80Sent = true; // crossing both at once gives one notification (BR-16)
    notify(d, grownUps(d, familyId), 'BUDGET_100', `${name} budget exceeded: ${formatMoney(spent)} of ${formatMoney(b.limitAmount)}`);
  } else if (pct >= 80 && pct < 100 && !b.alert80Sent) {
    b.alert80Sent = true;
    notify(d, grownUps(d, familyId), 'BUDGET_80', `${name} budget is ${pct} % used (${formatMoney(spent)} of ${formatMoney(b.limitAmount)})`);
  }
  // Below a threshold again: that alert may fire again later (BR-16).
  if (pct < 100) b.alert100Sent = false;
  if (pct < 80) b.alert80Sent = false;
}

/** UC-05 4c / UC-10 step 6. */
function checkGoals(d: Db, familyId: number) {
  const txs = liveTx(d, familyId);
  for (const g of d.goals.filter((x) => x.familyId === familyId && x.status === 'ACTIVE')) {
    const account = d.accounts.find((a) => a.accountId === g.accountId)!;
    if (balanceOf(account, txs) >= g.targetAmount) {
      g.status = 'ACHIEVED';
      notify(d, grownUps(d, familyId), 'GOAL_ACHIEVED', `Goal “${g.name}” achieved: ${formatMoney(g.targetAmount)} saved`);
    }
  }
}

// ---------------------------------------------------------------- transaction validation (BR-01 – BR-10)

function validateTx(d: Db, c: Ctx, input: TransactionInput, exceptId?: number): DbTransaction['type'] {
  const { type, amount } = input;
  if (!['INCOME', 'EXPENSE', 'TRANSFER'].includes(type)) throw bad('Type must be INCOME, EXPENSE or TRANSFER'); // BR-01
  if (!Number.isInteger(amount) || amount <= 0) throw bad('Amount must be greater than 0'); // BR-02
  if (input.transactionDate > today()) throw bad('Date cannot be later than today. Use a recurring transaction to plan future payments.'); // BR-09
  if (input.description && input.description.length > 255) throw bad('Description can be at most 255 characters');

  const isChild = c.role === 'CHILD';
  const shared = sharedAccountIds(d, c.member.memberId);
  const account = (id: number | null) => {
    const a = d.accounts.find((x) => x.accountId === id && x.familyId === c.familyId); // BR-06, NFR-03
    if (!a) throw notFound('Account');
    if (a.isArchived) throw bad(`Account ${a.name} is archived`);
    if (isChild && !shared.has(a.accountId)) throw forbidden('You do not have access to this account'); // BR-10
    return a;
  };
  const category = (id: number | null, expected: 'INCOME' | 'EXPENSE') => {
    const cat = d.categories.find((x) => x.categoryId === id && (x.familyId === null || x.familyId === c.familyId));
    if (!cat) throw bad(`Choose a${expected === 'INCOME' ? 'n income' : 'n expense'} category`);
    if (cat.isArchived) throw bad(`Category ${cat.name} is archived`);
    if (cat.type !== expected) throw bad(`Category must be of type ${expected}`);
  };
  const others = liveTx(d, c.familyId, exceptId); // UC-06 step 4: balances without the old version
  const canWithdraw = (a: DbAccount) => {
    const balance = balanceOf(a, others);
    if (balance - amount < floorOf(a)) throw bad(`Not enough money on ${a.name} (balance ${formatMoney(balance)})`);
  };

  if (type === 'EXPENSE') {
    // BR-04
    if (!input.sourceAccountId) throw bad('Choose the account the money is paid from');
    category(input.categoryId, 'EXPENSE');
    canWithdraw(account(input.sourceAccountId));
  } else if (type === 'INCOME') {
    // BR-03
    if (!input.destinationAccountId) throw bad('Choose the account the money goes to');
    category(input.categoryId, 'INCOME');
    account(input.destinationAccountId);
  } else {
    // BR-05
    if (isChild) throw forbidden('Children can record only income and expenses');
    if (!input.sourceAccountId || !input.destinationAccountId) throw bad('Choose both accounts for the transfer');
    if (input.sourceAccountId === input.destinationAccountId) throw bad('Choose two different accounts');
    const from = account(input.sourceAccountId);
    account(input.destinationAccountId);
    canWithdraw(from);
  }
  return type;
}

function normalise(input: TransactionInput): TransactionInput {
  // Fields that do not belong to the type are dropped, so the stored row always matches BR-03 – BR-05.
  const description = input.description?.trim() || null;
  if (input.type === 'INCOME') return { ...input, sourceAccountId: null, description };
  if (input.type === 'EXPENSE') return { ...input, destinationAccountId: null, description };
  return { ...input, categoryId: null, description };
}

function describeTx(t: Pick<DbTransaction, 'type' | 'amount' | 'description'>) {
  return `${t.type.toLowerCase()} ${formatMoney(t.amount)}${t.description ? ` · ${t.description}` : ''}`;
}

/** UC-06 4a: removing money that already came in must not leave an account below its floor. */
function checkStillCovered(d: Db, c: Ctx, exceptId: number, replacement?: TransactionInput) {
  const txs = liveTx(d, c.familyId, exceptId);
  if (replacement) txs.push({ ...(replacement as DbTransaction), transactionId: -1, familyId: c.familyId, isDeleted: false });
  for (const a of d.accounts.filter((x) => x.familyId === c.familyId)) {
    const after = balanceOf(a, txs);
    if (after < floorOf(a) && after < balanceOf(a, liveTx(d, c.familyId))) {
      throw bad(`${a.name} would go below ${formatMoney(floorOf(a))} (balance after the change ${formatMoney(after)}). Fix the later transactions first.`);
    }
  }
}

function canModify(c: Ctx, t: DbTransaction) {
  // BR-11
  if (c.role === 'OWNER') return true;
  if (c.role === 'ADULT') return t.createdBy === c.member.memberId;
  return false;
}

// ---------------------------------------------------------------- the API

export const demoApi = {
  isDemo: true as const,

  async resetDemo(): Promise<void> {
    clearDb();
    dbPromise = null;
    await db();
  },

  demoAccounts(): { email: string; label: string }[] {
    return [
      { email: 'aigerim@mail.kz', label: 'Aigerim · Owner' },
      { email: 'daulet@mail.kz', label: 'Daulet · Adult' },
      { email: 'aidar@mail.kz', label: 'Aidar · Child' },
      { email: 'saule@mail.kz', label: 'Saule · invited' },
    ];
  },

  // ---- auth (FR-01, FR-02, NFR-06)

  me: () =>
    read((d): Me | null => {
      const user = d.users.find((u) => u.userId === d.sessionUserId);
      if (!user || !user.isActive) return null;
      const m = activeMemberOf(d, user.userId);
      const family = m ? d.families.find((f) => f.familyId === m.familyId)! : null;
      return {
        user: { userId: user.userId, email: user.email, fullName: user.fullName },
        family: family ? { familyId: family.familyId, name: family.name, baseCurrency: family.baseCurrency } : null,
        member: m ? toMember(d, m) : null,
      };
    }),

  login: async (email: string, password: string) => {
    // A wrong password must still be counted, so the error is thrown after the change is saved.
    const failure = await write(async (d): Promise<ApiError | null> => {
      const e = email.trim().toLowerCase();
      const user = d.users.find((u) => u.email === e);
      const wrong = new ApiError(401, 'Email or password is incorrect');
      if (!user) throw wrong;
      if (!user.isActive) throw new ApiError(403, 'Your account has been blocked');
      if (user.lockedUntil && user.lockedUntil > nowIso()) {
        throw new ApiError(423, `Too many failed attempts. Try again after ${new Date(user.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
      }
      if ((await hashPassword(e, password)) !== user.passwordHash) {
        user.failedLoginCount += 1;
        if (user.failedLoginCount >= LOCK_AFTER) {
          user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
          user.failedLoginCount = 0;
        }
        return wrong;
      }
      user.failedLoginCount = 0;
      user.lockedUntil = null;
      d.sessionUserId = user.userId;
      return null;
    });
    if (failure) throw failure;
  },

  register: (fullName: string, email: string, password: string, privacyAccepted: boolean) =>
    write(async (d) => {
      const e = email.trim().toLowerCase();
      if (!fullName.trim()) throw bad('Enter your full name');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad('Enter a valid email address');
      if (password.length < 8 || !/[A-Za-zА-Яа-яЁё]/.test(password) || !/\d/.test(password)) {
        throw bad('Password must be at least 8 characters and contain a letter and a digit');
      }
      if (!privacyAccepted) throw bad('Accept the privacy notice to continue'); // NFR-07
      if (d.users.some((u) => u.email === e)) throw new ApiError(409, 'An account with this email already exists');
      const user: DbUser = {
        userId: nextId(d),
        email: e,
        fullName: fullName.trim(),
        passwordHash: await hashPassword(e, password),
        isActive: true,
        failedLoginCount: 0,
        lockedUntil: null,
        privacyAcceptedAt: nowIso(),
      };
      d.users.push(user);
      d.sessionUserId = user.userId;
    }),

  logout: () =>
    write((d) => {
      d.sessionUserId = null;
    }),

  // ---- family and invitations (FR-05 – FR-08)

  createFamily: (name: string) =>
    write((d) => {
      const user = sessionUser(d);
      if (activeMemberOf(d, user.userId)) throw new ApiError(409, 'You already belong to a family'); // BR-17
      if (!name.trim()) throw bad('Enter a family name');
      const familyId = nextId(d);
      d.families.push({ familyId, name: name.trim(), baseCurrency: 'KZT', createdAt: nowIso() });
      const member: DbMember = { memberId: nextId(d), familyId, userId: user.userId, role: 'OWNER', joinedAt: nowIso(), removedAt: null };
      d.members.push(member);
      audit(d, { user, familyId }, { entityType: 'FAMILY_MEMBER', entityId: member.memberId, action: 'CREATE', summary: `Family “${name.trim()}” created`, oldValue: null, newValue: member });
    }),

  myInvitations: () =>
    read((d): Invitation[] => {
      const user = sessionUser(d);
      return d.invitations
        .filter((i) => i.email === user.email && i.status === 'PENDING')
        .map((i) => toInvitation(d, i));
    }),

  invitationByToken: (token: string) =>
    read(async (d): Promise<Invitation> => {
      const user = sessionUser(d);
      const hash = await sha256(token);
      const found = d.invitations.find((i) => i.tokenHash === hash);
      if (!found) throw new ApiError(404, 'This link is not valid or has expired');
      if (found.email !== user.email) throw forbidden('This invitation was sent to another email address');
      return toInvitation(d, found);
    }),

  respondToInvitation: (invitationId: number, accept: boolean) =>
    write((d) => {
      const user = sessionUser(d);
      const inv = d.invitations.find((i) => i.invitationId === invitationId);
      if (!inv) throw new ApiError(404, 'This link is not valid or has expired');
      if (inv.email !== user.email) throw forbidden('This invitation was sent to another email address');
      if (inv.status !== 'PENDING') throw bad('This link is not valid or has expired');
      if (inv.expiresAt < nowIso()) {
        throw bad('This invitation has expired, ask the family owner for a new one'); // status turns EXPIRED in familyInvitations()
      }
      const owner = d.members.find((m) => m.familyId === inv.familyId && m.role === 'OWNER' && m.removedAt === null);
      if (!accept) {
        inv.status = 'DECLINED';
        if (owner) notify(d, [owner.memberId], 'INVITE_DECLINED', `${user.fullName} declined your invitation`);
        return;
      }
      if (activeMemberOf(d, user.userId)) throw bad('You already belong to a family. Leave it first to join another one.'); // BR-17
      inv.status = 'ACCEPTED';
      const member: DbMember = { memberId: nextId(d), familyId: inv.familyId, userId: user.userId, role: inv.role, joinedAt: nowIso(), removedAt: null };
      d.members.push(member);
      audit(d, { user, familyId: inv.familyId }, { entityType: 'FAMILY_MEMBER', entityId: member.memberId, action: 'CREATE', summary: `${user.fullName} joined as ${inv.role.toLowerCase()}`, oldValue: null, newValue: member });
      if (owner) notify(d, [owner.memberId], 'INVITE_ACCEPTED', `${user.fullName} accepted your invitation`);
    }),

  members: () =>
    read((d): Member[] => {
      const c = ctx(d);
      return d.members.filter((m) => m.familyId === c.familyId && m.removedAt === null).map((m) => toMember(d, m));
    }),

  /** Everyone who ever recorded something, removed members included (BR-20). */
  allMembers: () =>
    read((d): Member[] => {
      const c = ctx(d);
      return d.members.filter((m) => m.familyId === c.familyId).map((m) => toMember(d, m));
    }),

  familyInvitations: () =>
    read((d): Invitation[] => {
      const c = ctx(d);
      requireRole(c, ['OWNER']);
      for (const i of d.invitations) if (i.status === 'PENDING' && i.expiresAt < nowIso()) i.status = 'EXPIRED';
      return d.invitations.filter((i) => i.familyId === c.familyId && i.status === 'PENDING').map((i) => toInvitation(d, i));
    }),

  /** FR-06, BR-19. Returns the link once; only its hash is kept. */
  invite: (email: string, role: 'ADULT' | 'CHILD', replaceExisting = false) =>
    write(async (d): Promise<{ link: string; invitation: Invitation }> => {
      const c = ctx(d);
      requireRole(c, ['OWNER'], 'Only the family owner can invite members');
      const e = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad('Enter a valid email address');
      const existingUser = d.users.find((u) => u.email === e);
      if (existingUser && d.members.some((m) => m.userId === existingUser.userId && m.familyId === c.familyId && m.removedAt === null)) {
        throw bad('This person is already a member of your family');
      }
      const pending = d.invitations.find((i) => i.familyId === c.familyId && i.email === e && i.status === 'PENDING' && i.expiresAt >= nowIso());
      if (pending && !replaceExisting) throw new ApiError(409, 'A pending invitation for this email already exists');
      const token = randomToken();
      const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
      let inv = pending;
      if (inv) {
        inv.tokenHash = await sha256(token); // the old link stops working (UC-02 3a)
        inv.expiresAt = expiresAt;
        inv.role = role;
      } else {
        inv = { invitationId: nextId(d), familyId: c.familyId, email: e, role, tokenHash: await sha256(token), invitedBy: c.member.memberId, status: 'PENDING', expiresAt, createdAt: nowIso() };
        d.invitations.push(inv);
      }
      return { link: `${location.origin}/invite/${token}`, invitation: toInvitation(d, inv) };
    }),

  changeRole: (memberId: number, role: 'ADULT' | 'CHILD') =>
    write((d) => {
      const c = ctx(d);
      requireRole(c, ['OWNER']);
      const m = d.members.find((x) => x.memberId === memberId && x.familyId === c.familyId && x.removedAt === null);
      if (!m) throw notFound('Member');
      if (m.role === 'OWNER') throw bad('The family always has one owner. Transfer ownership first.'); // BR-18
      const old = m.role;
      m.role = role;
      if (role !== 'CHILD') d.accountAccess = d.accountAccess.filter((a) => a.memberId !== memberId);
      audit(d, c, { entityType: 'FAMILY_MEMBER', entityId: memberId, action: 'UPDATE', summary: `${toMember(d, m).fullName}: role ${old.toLowerCase()} → ${role.toLowerCase()}`, oldValue: { role: old }, newValue: { role } });
    }),

  removeMember: (memberId: number) =>
    write((d) => {
      const c = ctx(d);
      requireRole(c, ['OWNER']);
      const m = d.members.find((x) => x.memberId === memberId && x.familyId === c.familyId && x.removedAt === null);
      if (!m) throw notFound('Member');
      if (m.role === 'OWNER') throw bad('The owner cannot be removed. Transfer ownership first.'); // BR-18
      m.removedAt = nowIso(); // history stays (BR-20)
      d.accountAccess = d.accountAccess.filter((a) => a.memberId !== memberId);
      audit(d, c, { entityType: 'FAMILY_MEMBER', entityId: memberId, action: 'DELETE', summary: `${toMember(d, m).fullName} removed from the family`, oldValue: { ...m, removedAt: null }, newValue: m });
    }),

  // ---- accounts (FR-10 – FR-13)

  accounts: () =>
    read((d): Account[] => {
      const c = ctx(d);
      return visibleAccounts(d, c).map((a) => toAccount(d, c, a));
    }),

  /** BR-13: never for a child. */
  familyTotal: () =>
    read((d): Tiyn => {
      const c = ctx(d);
      requireRole(c, ['OWNER', 'ADULT']);
      const txs = liveTx(d, c.familyId);
      return d.accounts.filter((a) => a.familyId === c.familyId && !a.isArchived).reduce((s, a) => s + balanceOf(a, txs), 0);
    }),

  createAccount: (p: { name: string; type: AccountType; openingBalance: Tiyn; creditLimit: Tiyn | null }) =>
    write((d): Account => {
      const c = ctx(d);
      requireRole(c, ['OWNER', 'ADULT'], 'Only the owner and adults can add accounts');
      const name = p.name.trim();
      if (!name) throw bad('Enter an account name');
      if (name.length > 60) throw bad('Account name can be at most 60 characters');
      if (d.accounts.some((a) => a.familyId === c.familyId && a.name.toLowerCase() === name.toLowerCase())) throw bad('An account with this name already exists');
      const isCredit = p.type === 'CREDIT_CARD';
      if (isCredit && (p.creditLimit === null || p.creditLimit < 0)) throw bad('Enter the credit limit');
      if (!isCredit && p.openingBalance < 0) throw bad('Opening balance cannot be negative');
      if (isCredit && p.openingBalance < -(p.creditLimit ?? 0)) throw bad('Opening balance cannot be below the credit limit');
      const a: DbAccount = { accountId: nextId(d), familyId: c.familyId, name, type: p.type, openingBalance: p.openingBalance, creditLimit: isCredit ? p.creditLimit : null, isArchived: false, createdBy: c.member.memberId };
      d.accounts.push(a);
      audit(d, c, { entityType: 'ACCOUNT', entityId: a.accountId, action: 'CREATE', summary: `Account “${name}” created, opening ${formatMoney(a.openingBalance)}`, oldValue: null, newValue: a });
      return toAccount(d, c, a);
    }),

  updateAccount: (accountId: number, p: { name: string; creditLimit: Tiyn | null }) =>
    write((d) => {
      const c = ctx(d);
      requireRole(c, ['OWNER', 'ADULT']);
      const a = d.accounts.find((x) => x.accountId === accountId && x.familyId === c.familyId);
      if (!a) throw notFound('Account');
      const name = p.name.trim();
      if (!name) throw bad('Enter an account name');
      if (d.accounts.some((x) => x.familyId === c.familyId && x.accountId !== accountId && x.name.toLowerCase() === name.toLowerCase())) throw bad('An account with this name already exists');
      const old = { ...a };
      a.name = name;
      if (a.type === 'CREDIT_CARD') {
        if (p.creditLimit === null || p.creditLimit < 0) throw bad('Enter the credit limit');
        if (balanceOf(a, liveTx(d, c.familyId)) < -p.creditLimit) throw bad('The current debt is larger than this credit limit');
        a.creditLimit = p.creditLimit;
      }
      audit(d, c, { entityType: 'ACCOUNT', entityId: accountId, action: 'UPDATE', summary: `Account “${old.name}” updated`, oldValue: old, newValue: { ...a } });
    }),

  /** BR-21: only with balance 0, owner only. */
  archiveAccount: (accountId: number) =>
    write((d) => {
      const c = ctx(d);
      requireRole(c, ['OWNER'], 'Only the family owner can archive accounts');
      const a = d.accounts.find((x) => x.accountId === accountId && x.familyId === c.familyId);
      if (!a) throw notFound('Account');
      if (balanceOf(a, liveTx(d, c.familyId)) !== 0) throw bad('Move the remaining money to another account first');
      a.isArchived = true;
      audit(d, c, { entityType: 'ACCOUNT', entityId: accountId, action: 'UPDATE', summary: `Account “${a.name}” archived`, oldValue: { isArchived: false }, newValue: { isArchived: true } });
    }),

  /** FR-13: which children see this account. */
  setSharing: (accountId: number, childMemberIds: number[]) =>
    write((d) => {
      const c = ctx(d);
      requireRole(c, ['OWNER'], 'Only the family owner can share accounts');
      const a = d.accounts.find((x) => x.accountId === accountId && x.familyId === c.familyId);
      if (!a) throw notFound('Account');
      for (const id of childMemberIds) {
        const m = d.members.find((x) => x.memberId === id && x.familyId === c.familyId && x.removedAt === null);
        if (!m || m.role !== 'CHILD') throw bad('Accounts can be shared only with child members');
      }
      d.accountAccess = d.accountAccess.filter((x) => x.accountId !== accountId).concat(childMemberIds.map((memberId) => ({ accountId, memberId })));
    }),

  // ---- categories (FR-14)

  categories: () =>
    read((d): Category[] => {
      const c = ctx(d);
      return d.categories
        .filter((x) => x.familyId === null || x.familyId === c.familyId)
        .map((x) => ({ categoryId: x.categoryId, name: x.name, type: x.type, parentId: x.parentId, isSystem: x.familyId === null, isArchived: x.isArchived }));
    }),

  // ---- transactions (FR-16 – FR-21)

  transactions: (f: TransactionFilter = {}) =>
    read((d): Transaction[] => {
      const c = ctx(d);
      const q = f.search?.trim().toLowerCase();
      return visibleTx(d, c)
        .filter((t) => (!f.from || t.transactionDate >= f.from) && (!f.to || t.transactionDate <= f.to))
        .filter((t) => !f.type || t.type === f.type)
        .filter((t) => !f.accountId || t.sourceAccountId === f.accountId || t.destinationAccountId === f.accountId)
        .filter((t) => !f.categoryId || t.categoryId === f.categoryId || (t.categoryId !== null && rootCategoryId(d, t.categoryId) === f.categoryId))
        .filter((t) => !f.memberId || t.createdBy === f.memberId)
        .filter((t) => !q || (t.description ?? '').toLowerCase().includes(q))
        .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.transactionId - a.transactionId)
        .map(toTx);
    }),

  canModify: (t: Transaction, me: Member) => (me.role === 'OWNER' ? true : me.role === 'ADULT' ? t.createdBy === me.memberId : false),

  createTransaction: (input: TransactionInput) =>
    write((d): Transaction => {
      const c = ctx(d);
      const clean = normalise(input);
      validateTx(d, c, clean);
      const t: DbTransaction = { ...clean, transactionId: nextId(d), familyId: c.familyId, createdBy: c.member.memberId, isDeleted: false, createdAt: nowIso(), updatedAt: nowIso() };
      d.transactions.push(t);
      audit(d, c, { entityType: 'TRANSACTION', entityId: t.transactionId, action: 'CREATE', summary: describeTx(t), oldValue: null, newValue: { ...t } });
      if (t.type === 'EXPENSE') checkBudget(d, c.familyId, t.categoryId, t.transactionDate);
      checkGoals(d, c.familyId);
      return toTx(t);
    }),

  updateTransaction: (transactionId: number, input: TransactionInput) =>
    write((d) => {
      const c = ctx(d);
      const t = d.transactions.find((x) => x.transactionId === transactionId && x.familyId === c.familyId && !x.isDeleted);
      if (!t) throw notFound('Transaction');
      if (!canModify(c, t)) throw forbidden('You can edit only transactions you recorded'); // BR-11
      const clean = normalise(input);
      validateTx(d, c, clean, transactionId);
      checkStillCovered(d, c, transactionId, clean);
      const old = { ...t };
      Object.assign(t, clean, { updatedAt: nowIso() });
      audit(d, c, { entityType: 'TRANSACTION', entityId: transactionId, action: 'UPDATE', summary: `${describeTx(old)} → ${describeTx(t)}`, oldValue: old, newValue: { ...t } });
      if (old.type === 'EXPENSE') checkBudget(d, c.familyId, old.categoryId, old.transactionDate);
      if (t.type === 'EXPENSE') checkBudget(d, c.familyId, t.categoryId, t.transactionDate);
      checkGoals(d, c.familyId);
    }),

  /** Soft delete (BR-11), with an audit entry. */
  deleteTransaction: (transactionId: number) =>
    write((d) => {
      const c = ctx(d);
      const t = d.transactions.find((x) => x.transactionId === transactionId && x.familyId === c.familyId && !x.isDeleted);
      if (!t) throw notFound('Transaction');
      if (!canModify(c, t)) throw forbidden('You can delete only transactions you recorded');
      checkStillCovered(d, c, transactionId);
      t.isDeleted = true;
      t.updatedAt = nowIso();
      audit(d, c, { entityType: 'TRANSACTION', entityId: transactionId, action: 'DELETE', summary: describeTx(t), oldValue: { ...t, isDeleted: false }, newValue: { isDeleted: true } });
      if (t.type === 'EXPENSE') checkBudget(d, c.familyId, t.categoryId, t.transactionDate);
    }),

  // ---- budgets (FR-24 – FR-27)

  budgets: (month: string) =>
    read((d): Budget[] => {
      const c = ctx(d);
      requireRole(c, ['OWNER', 'ADULT']);
      return d.budgets.filter((b) => b.familyId === c.familyId && b.periodMonth === month).map((b) => toBudget(d, b));
    }),

  /** BR-14: one per expense category per month. Saving an existing one updates its limit (UC-07 3a). */
  saveBudget: (categoryId: number, month: string, limit: Tiyn) =>
    write((d) => {
      const c = ctx(d);
      requireRole(c, ['OWNER', 'ADULT'], 'Only the owner and adults can set budgets');
      const cat = d.categories.find((x) => x.categoryId === categoryId && (x.familyId === null || x.familyId === c.familyId));
      if (!cat || cat.type !== 'EXPENSE') throw bad('Budgets can be set only for expense categories');
      if (!Number.isInteger(limit) || limit <= 0) throw bad('Limit must be greater than 0');
      let b = d.budgets.find((x) => x.familyId === c.familyId && x.categoryId === categoryId && x.periodMonth === month);
      const old = b ? { ...b } : null;
      if (b) {
        b.limitAmount = limit;
        b.alert80Sent = false;
        b.alert100Sent = false;
      } else {
        b = { budgetId: nextId(d), familyId: c.familyId, categoryId, periodMonth: month, limitAmount: limit, alert80Sent: false, alert100Sent: false, createdBy: c.member.memberId };
        d.budgets.push(b);
      }
      // Remember thresholds already passed, so a new limit does not re-send old news.
      const pct = Math.floor((spentFor(d, b) * 100) / b.limitAmount);
      if (pct >= 80) b.alert80Sent = true;
      if (pct >= 100) b.alert100Sent = true;
      audit(d, c, { entityType: 'BUDGET', entityId: b.budgetId, action: old ? 'UPDATE' : 'CREATE', summary: `${cat.name} budget for ${month}: ${formatMoney(limit)}`, oldValue: old, newValue: { ...b } });
    }),

  deleteBudget: (budgetId: number) =>
    write((d) => {
      const c = ctx(d);
      requireRole(c, ['OWNER', 'ADULT']);
      const b = d.budgets.find((x) => x.budgetId === budgetId && x.familyId === c.familyId);
      if (!b) throw notFound('Budget');
      d.budgets = d.budgets.filter((x) => x !== b);
      const name = d.categories.find((x) => x.categoryId === b.categoryId)?.name ?? '';
      audit(d, c, { entityType: 'BUDGET', entityId: budgetId, action: 'DELETE', summary: `${name} budget for ${b.periodMonth} removed`, oldValue: b, newValue: null });
    }),

  /** FR-27: copy for categories that have no budget this month yet. */
  copyBudgets: (month: string) =>
    write((d): number => {
      const c = ctx(d);
      requireRole(c, ['OWNER', 'ADULT']);
      const prev = shiftMonth(month, -1);
      const have = new Set(d.budgets.filter((b) => b.familyId === c.familyId && b.periodMonth === month).map((b) => b.categoryId));
      const toCopy = d.budgets.filter((b) => b.familyId === c.familyId && b.periodMonth === prev && !have.has(b.categoryId));
      for (const src of toCopy) {
        const b: DbBudget = { ...src, budgetId: nextId(d), periodMonth: month, alert80Sent: false, alert100Sent: false, createdBy: c.member.memberId };
        const pct = Math.floor((spentFor(d, b) * 100) / b.limitAmount);
        b.alert80Sent = pct >= 80;
        b.alert100Sent = pct >= 100;
        d.budgets.push(b);
        audit(d, c, { entityType: 'BUDGET', entityId: b.budgetId, action: 'CREATE', summary: `Budget copied to ${month}: ${formatMoney(b.limitAmount)}`, oldValue: null, newValue: { ...b } });
      }
      return toCopy.length;
    }),

  // ---- savings goals (FR-28, FR-29, BR-25)

  goals: () =>
    read((d): Goal[] => {
      const c = ctx(d);
      requireRole(c, ['OWNER', 'ADULT']);
      const txs = liveTx(d, c.familyId);
      return d.goals
        .filter((g) => g.familyId === c.familyId && g.status !== 'CANCELLED')
        .map((g) => ({ goalId: g.goalId, accountId: g.accountId, name: g.name, targetAmount: g.targetAmount, targetDate: g.targetDate, status: g.status, saved: balanceOf(d.accounts.find((a) => a.accountId === g.accountId)!, txs) }));
    }),

  createGoal: (p: { name: string; targetAmount: Tiyn; targetDate: string | null; accountId: number }) =>
    write((d) => {
      const c = ctx(d);
      requireRole(c, ['OWNER', 'ADULT'], 'Only the owner and adults can create goals');
      if (!p.name.trim()) throw bad('Enter a goal name');
      if (!Number.isInteger(p.targetAmount) || p.targetAmount <= 0) throw bad('Target amount must be greater than 0');
      if (p.targetDate && p.targetDate < today()) throw bad('Target date cannot be in the past');
      const a = d.accounts.find((x) => x.accountId === p.accountId && x.familyId === c.familyId && !x.isArchived);
      if (!a || a.type !== 'SAVINGS') throw bad('Link the goal to a savings account');
      if (d.goals.some((g) => g.accountId === a.accountId && g.status !== 'CANCELLED')) throw bad('This savings account already has a goal'); // BR-25
      d.goals.push({ goalId: nextId(d), familyId: c.familyId, accountId: a.accountId, name: p.name.trim(), targetAmount: p.targetAmount, targetDate: p.targetDate, status: 'ACTIVE', createdBy: c.member.memberId });
      checkGoals(d, c.familyId);
    }),

  cancelGoal: (goalId: number) =>
    write((d) => {
      const c = ctx(d);
      requireRole(c, ['OWNER', 'ADULT']);
      const g = d.goals.find((x) => x.goalId === goalId && x.familyId === c.familyId);
      if (!g) throw notFound('Goal');
      g.status = 'CANCELLED';
    }),

  // ---- reports (FR-30 – FR-32, BR-12)

  summary: (from: string, to: string) =>
    read((d): MonthlySummary => {
      const c = ctx(d);
      const txs = visibleTx(d, c).filter((t) => t.transactionDate >= from && t.transactionDate <= to);
      const income = txs.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
      const expenses = txs.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0); // transfers never count (BR-12)
      const all = liveTx(d, c.familyId);
      const balances = visibleAccounts(d, c)
        .filter((a) => !a.isArchived)
        .map((a) => ({ accountId: a.accountId, name: a.name, balance: balanceOf(a, all, to) }));

      const byCat = new Map<number, Tiyn>();
      for (const t of txs) if (t.type === 'EXPENSE' && t.categoryId) byCat.set(rootCategoryId(d, t.categoryId), (byCat.get(rootCategoryId(d, t.categoryId)) ?? 0) + t.amount);
      const byCategory = [...byCat.entries()]
        .map(([categoryId, amount]) => ({ categoryId, name: d.categories.find((x) => x.categoryId === categoryId)!.name, amount }))
        .sort((a, b) => b.amount - a.amount);

      const byMem = new Map<number, { income: Tiyn; expenses: Tiyn }>();
      for (const t of txs) {
        if (t.type === 'TRANSFER') continue;
        const row = byMem.get(t.createdBy) ?? { income: 0, expenses: 0 };
        if (t.type === 'INCOME') row.income += t.amount;
        else row.expenses += t.amount;
        byMem.set(t.createdBy, row);
      }
      const byMember = [...byMem.entries()].map(([memberId, v]) => ({ memberId, name: toMember(d, d.members.find((m) => m.memberId === memberId)!).fullName, ...v }));

      const days = new Map<string, { income: Tiyn; expenses: Tiyn }>();
      for (const t of txs) {
        if (t.type === 'TRANSFER') continue;
        const row = days.get(t.transactionDate) ?? { income: 0, expenses: 0 };
        if (t.type === 'INCOME') row.income += t.amount;
        else row.expenses += t.amount;
        days.set(t.transactionDate, row);
      }
      const daily = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));

      return { income, expenses, net: income - expenses, balances, byCategory, byMember, daily };
    }),

  // ---- notifications (FR-35)

  notifications: () =>
    read((d): Notification[] => {
      const c = ctx(d);
      return d.notifications
        .filter((n) => n.memberId === c.member.memberId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((n) => ({ notificationId: n.notificationId, type: n.type, message: n.message, isRead: n.isRead, createdAt: n.createdAt }));
    }),

  markAllRead: () =>
    write((d) => {
      const c = ctx(d);
      for (const n of d.notifications) if (n.memberId === c.member.memberId) n.isRead = true;
    }),

  // ---- audit log (FR-38)

  auditLog: () =>
    read((d): AuditEntry[] => {
      const c = ctx(d);
      requireRole(c, ['OWNER'], 'Only the family owner can view the audit log');
      return d.audit
        .filter((a) => a.familyId === c.familyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.logId - a.logId)
        .map((a) => ({ logId: a.logId, actorName: d.users.find((u) => u.userId === a.actorUserId)?.fullName ?? '—', entityType: a.entityType, entityId: a.entityId, action: a.action, summary: a.summary, createdAt: a.createdAt }));
    }),
};

function toInvitation(d: Db, i: Db['invitations'][number]): Invitation {
  const family = d.families.find((f) => f.familyId === i.familyId)!;
  const by = d.members.find((m) => m.memberId === i.invitedBy);
  return {
    invitationId: i.invitationId,
    familyId: i.familyId,
    familyName: family.name,
    email: i.email,
    role: i.role,
    status: i.status,
    expiresAt: i.expiresAt,
    invitedByName: by ? toMember(d, by).fullName : '',
  };
}

export type Api = typeof demoApi;
