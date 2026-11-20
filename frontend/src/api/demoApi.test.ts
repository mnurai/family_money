// The demo API must behave like the business rules, so the screens show the right numbers.
// The worked example from docs/06-business-rules.md is replayed step by step.

import { beforeEach, describe, expect, it } from 'vitest';
import { today } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { demoApi as api } from './demoApi';
import { DEMO_PASSWORD } from './demoStore';

const kzt = (n: number) => n * 100;
const d = today();

async function freshFamily() {
  await api.resetDemo();
  await api.register('Test Owner', `owner${Math.random()}@mail.kz`, 'secret123', true);
  await api.createFamily('Test family');
  const make = (name: string, type: 'BANK_CARD' | 'CASH' | 'SAVINGS', opening: number) => api.createAccount({ name, type, openingBalance: kzt(opening), creditLimit: null });
  const kaspi = await make('Kaspi card', 'BANK_CARD', 200_000);
  const cash = await make('Cash', 'CASH', 10_000);
  const savings = await make('Savings', 'SAVINGS', 0);
  const cats = await api.categories();
  const id = (name: string) => cats.find((c) => c.name === name)!.categoryId;
  return { kaspi: kaspi.accountId, cash: cash.accountId, savings: savings.accountId, salary: id('Salary'), food: id('Food') };
}

const balances = async () => Object.fromEntries((await api.accounts()).map((a) => [a.name, a.balance / 100]));

describe('worked example (docs/06)', () => {
  it('replays the month and rejects step 6 (BR-07, BR-08, BR-12, BR-15, BR-16)', async () => {
    const f = await freshFamily();
    const month = d.slice(0, 7);
    await api.saveBudget(f.food, month, kzt(60_000));
    const tx = (type: 'INCOME' | 'EXPENSE' | 'TRANSFER', amount: number, src: number | null, dst: number | null, cat: number | null) =>
      api.createTransaction({ type, amount: kzt(amount), sourceAccountId: src, destinationAccountId: dst, categoryId: cat, transactionDate: d, description: null });

    await tx('INCOME', 350_000, null, f.kaspi, f.salary);
    expect(await balances()).toMatchObject({ 'Kaspi card': 550_000, Cash: 10_000, Savings: 0 });
    await tx('TRANSFER', 20_000, f.kaspi, f.cash, null);
    expect(await balances()).toMatchObject({ 'Kaspi card': 530_000, Cash: 30_000 });
    await tx('EXPENSE', 45_000, f.kaspi, null, f.food);
    expect((await api.budgets(month))[0].percentUsed).toBe(75);
    expect(await api.notifications()).toHaveLength(0);
    await tx('EXPENSE', 5_000, f.cash, null, f.food);
    expect((await api.budgets(month))[0].percentUsed).toBe(83);
    const alerts = await api.notifications();
    expect(alerts.map((n) => n.type)).toEqual(['BUDGET_80']);
    await tx('TRANSFER', 100_000, f.kaspi, f.savings, null);
    expect(await balances()).toMatchObject({ 'Kaspi card': 385_000, Cash: 25_000, Savings: 100_000 });

    await expect(tx('EXPENSE', 30_000, f.cash, null, f.food)).rejects.toThrow(`Not enough money on Cash (balance ${formatMoney(kzt(25_000))})`);

    expect(await api.familyTotal()).toBe(kzt(510_000));
    const s = await api.summary(`${month}-01`, `${month}-31`);
    expect(s.income).toBe(kzt(350_000));
    expect(s.expenses).toBe(kzt(50_000)); // transfers #2 and #5 not counted
    expect(s.net).toBe(kzt(300_000));
    expect((await api.budgets(month))[0].spent).toBe(kzt(50_000));
  });
});

describe('rules', () => {
  beforeEach(async () => {
    await api.resetDemo();
  });

  it('br05 transfer needs two different accounts', async () => {
    const f = await freshFamily();
    await expect(
      api.createTransaction({ type: 'TRANSFER', amount: 100, sourceAccountId: f.kaspi, destinationAccountId: f.kaspi, categoryId: null, transactionDate: d, description: null }),
    ).rejects.toThrow('Choose two different accounts');
  });

  it('br09 date cannot be in the future', async () => {
    const f = await freshFamily();
    await expect(
      api.createTransaction({ type: 'INCOME', amount: 100, sourceAccountId: null, destinationAccountId: f.kaspi, categoryId: f.salary, transactionDate: '2999-01-01', description: null }),
    ).rejects.toThrow('Date cannot be later than today');
  });

  it('br03 income must use an income category', async () => {
    const f = await freshFamily();
    await expect(
      api.createTransaction({ type: 'INCOME', amount: 100, sourceAccountId: null, destinationAccountId: f.kaspi, categoryId: f.food, transactionDate: d, description: null }),
    ).rejects.toThrow('Category must be of type INCOME');
  });

  it('br16 crossing 80 % and 100 % at once gives one BUDGET_100 notification', async () => {
    const f = await freshFamily();
    await api.saveBudget(f.food, d.slice(0, 7), kzt(10_000));
    await api.createTransaction({ type: 'EXPENSE', amount: kzt(7_000), sourceAccountId: f.kaspi, destinationAccountId: null, categoryId: f.food, transactionDate: d, description: null });
    await api.createTransaction({ type: 'EXPENSE', amount: kzt(3_500), sourceAccountId: f.kaspi, destinationAccountId: null, categoryId: f.food, transactionDate: d, description: null });
    expect((await api.notifications()).map((n) => n.type)).toEqual(['BUDGET_100']);
  });

  it('br10 a child sees only shared accounts, cannot transfer and never gets the family total', async () => {
    await api.login('aidar@mail.kz', DEMO_PASSWORD);
    const accounts = await api.accounts();
    expect(accounts.map((a) => a.name)).toEqual(['Aidar — pocket money']);
    await expect(api.familyTotal()).rejects.toThrow();
    await expect(
      api.createTransaction({ type: 'TRANSFER', amount: 100, sourceAccountId: accounts[0].accountId, destinationAccountId: 1, categoryId: null, transactionDate: d, description: null }),
    ).rejects.toThrow('Children can record only income and expenses');
  });

  it('br30 a child gets only personal badges; the owner also gets family badges', async () => {
    await api.login('aidar@mail.kz', DEMO_PASSWORD);
    const child = await api.achievements();
    expect(child.every((b) => b.scope === 'PERSONAL')).toBe(true);
    expect(child.find((b) => b.id === 'FIRST_STEP')!.earned).toBe(true); // Aidar recorded pocket-money income
    await api.logout();
    await api.login('aigerim@mail.kz', DEMO_PASSWORD);
    const owner = await api.achievements();
    expect(owner.some((b) => b.scope === 'FAMILY')).toBe(true);
    expect(owner.find((b) => b.id === 'PLANNER')!.earned).toBe(true);
  });

  it('br32 only grown-ups set challenges, only for a child, on an account shared with that child', async () => {
    await api.login('aidar@mail.kz', DEMO_PASSWORD);
    const [mine] = await api.challenges();
    expect(mine).toMatchObject({ name: 'Headphones', status: 'ACTIVE' });
    await expect(api.createChallenge({ childMemberId: mine.childMemberId, accountId: mine.accountId, name: 'Ball', targetAmount: kzt(50_000), targetDate: null })).rejects.toThrow('Only the owner and adults can set challenges');
    await api.logout();
    await api.login('aigerim@mail.kz', DEMO_PASSWORD);
    const adult = (await api.members()).find((m) => m.role === 'ADULT')!;
    const kaspi = (await api.accounts()).find((a) => a.name === 'Kaspi card')!;
    await expect(api.createChallenge({ childMemberId: adult.memberId, accountId: mine.accountId, name: 'X', targetAmount: kzt(1_000), targetDate: null })).rejects.toThrow('Challenges can be set only for child members');
    await expect(api.createChallenge({ childMemberId: mine.childMemberId, accountId: kaspi.accountId, name: 'X', targetAmount: kzt(900_000), targetDate: null })).rejects.toThrow('Choose an account shared with this child');
    await expect(api.createChallenge({ childMemberId: mine.childMemberId, accountId: mine.accountId, name: 'X', targetAmount: kzt(90_000), targetDate: null })).rejects.toThrow('This child already has an active challenge');
  });

  it('fr46 reaching the target completes the challenge, tells the child and earns the badge', async () => {
    await api.login('aigerim@mail.kz', DEMO_PASSWORD);
    const [ch] = await api.challenges();
    const kaspi = (await api.accounts()).find((a) => a.name === 'Kaspi card')!;
    await api.createTransaction({ type: 'TRANSFER', amount: ch.targetAmount - ch.saved, sourceAccountId: kaspi.accountId, destinationAccountId: ch.accountId, categoryId: null, transactionDate: d, description: null });
    expect((await api.challenges())[0].status).toBe('ACHIEVED');
    await api.logout();
    await api.login('aidar@mail.kz', DEMO_PASSWORD);
    expect((await api.notifications())[0].message).toContain('Challenge “Headphones” complete');
    expect((await api.achievements()).find((b) => b.id === 'CHALLENGE_CHAMPION')!.earned).toBe(true);
  });

  it('br32 taking back the shared account cancels the child’s challenge', async () => {
    await api.login('aigerim@mail.kz', DEMO_PASSWORD);
    const [ch] = await api.challenges();
    await api.setSharing(ch.accountId, []);
    expect(await api.challenges()).toEqual([]);
  });

  it('br11 an adult cannot edit a transaction recorded by someone else', async () => {
    await api.login('daulet@mail.kz', DEMO_PASSWORD);
    const me = (await api.me())!.member!;
    const foreign = (await api.transactions()).find((t) => t.createdBy !== me.memberId)!;
    await expect(api.deleteTransaction(foreign.transactionId)).rejects.toThrow('You can delete only transactions you recorded');
  });

  it('nfr06 locks the account after 5 wrong passwords', async () => {
    for (let i = 0; i < 5; i++) await expect(api.login('aigerim@mail.kz', 'wrong')).rejects.toThrow('Email or password is incorrect');
    await expect(api.login('aigerim@mail.kz', DEMO_PASSWORD)).rejects.toThrow('Too many failed attempts');
  });

  it('br21 an account with money cannot be archived', async () => {
    const f = await freshFamily();
    await expect(api.archiveAccount(f.cash)).rejects.toThrow('Move the remaining money to another account first');
  });

  it('br19 only one pending invitation per email', async () => {
    await freshFamily();
    await api.invite('new@mail.kz', 'ADULT');
    await expect(api.invite('new@mail.kz', 'ADULT')).rejects.toThrow('A pending invitation for this email already exists');
    const renewed = await api.invite('new@mail.kz', 'CHILD', true);
    expect(renewed.link).toMatch(/^http:\/\/localhost:5173\/invite\//);
  });
});
