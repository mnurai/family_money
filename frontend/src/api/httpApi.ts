import { demoApi } from './demoApi';
import { ApiError, type Account, type AccountType, type Me, type Transaction, type TransactionFilter, type TransactionInput } from './types';

const BASE_URL = (import.meta.env.VITE_API_URL || 'https://family-money-lqfk.onrender.com').replace(/\/$/, '');
const TOKEN_KEY = 'fm_access_token';

const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = data?.detail
      ? typeof data.detail === 'string'
        ? data.detail
        : JSON.stringify(data.detail)
      : `Request failed (${res.status})`;
    const status = ([400, 401, 403, 404, 409, 423].includes(res.status) ? res.status : 400) as 400 | 401 | 403 | 404 | 409 | 423;
    throw new ApiError(status, msg);
  }
  return data as T;
}

export const httpApi = {
  ...demoApi,
  isDemo: false as const,

  async me(): Promise<Me | null> {
    if (!getToken()) return null;
    try {
      const data = await request<any>('/api/v1/auth/me');
      return {
        user: {
          userId: data.user_id ?? data.user?.userId ?? 1,
          email: data.email ?? data.user?.email ?? '',
          fullName: data.full_name ?? data.user?.fullName ?? 'User',
        },
        family: data.family_id
          ? { familyId: data.family_id, name: data.family_name ?? 'My Family', baseCurrency: 'KZT' }
          : data.family ?? null,
        member: data.member_id
          ? {
              memberId: data.member_id,
              userId: data.user_id ?? 1,
              fullName: data.full_name ?? 'User',
              email: data.email ?? '',
              role: data.role ?? 'OWNER',
              joinedAt: new Date().toISOString(),
              removedAt: null,
            }
          : data.member ?? null,
      };
    } catch {
      setToken(null);
      return null;
    }
  },

  async login(email: string, password: string): Promise<void> {
    const res = await request<{ access_token?: string; token?: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const token = res.access_token || res.token;
    if (!token) throw new ApiError(401, 'Token was not returned by server');
    setToken(token);
  },

  async register(fullName: string, email: string, password: string, privacyAccepted: boolean): Promise<void> {
    if (!privacyAccepted) throw new ApiError(400, 'Accept the privacy notice to continue');
    const res = await request<{ access_token?: string; token?: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        family_name: `${fullName.split(' ')[0]}'s Family`,
      }),
    });
    const token = res.access_token || res.token;
    if (token) setToken(token);
  },

  async logout(): Promise<void> {
    setToken(null);
  },

  async accounts(): Promise<Account[]> {
    const list = await request<any[]>('/api/v1/accounts');
    return list.map((a) => ({
      accountId: a.account_id ?? a.id,
      name: a.name,
      type: (a.type?.toUpperCase() || 'BANK_CARD') as AccountType,
      openingBalance: a.initial_balance ?? a.opening_balance ?? 0,
      creditLimit: a.credit_limit ?? null,
      isArchived: Boolean(a.is_archived),
      balance: a.balance ?? a.initial_balance ?? 0,
      sharedWith: a.shared_with ?? [],
    }));
  },

  async createAccount(p: { name: string; type: AccountType; openingBalance: number; creditLimit: number | null }): Promise<Account> {
    const a = await request<any>('/api/v1/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: p.name,
        type: p.type,
        initial_balance: p.openingBalance,
        credit_limit: p.creditLimit ?? 0,
      }),
    });
    return {
      accountId: a.account_id ?? a.id,
      name: a.name,
      type: (a.type?.toUpperCase() || p.type) as AccountType,
      openingBalance: a.initial_balance ?? p.openingBalance,
      creditLimit: a.credit_limit ?? p.creditLimit,
      isArchived: false,
      balance: a.balance ?? p.openingBalance,
      sharedWith: [],
    };
  },

  async transactions(_filter?: TransactionFilter): Promise<Transaction[]> {
    const list = await request<any[]>('/api/v1/transactions');
    return list.map((t) => ({
      transactionId: t.transaction_id ?? t.id,
      type: (t.type?.toUpperCase() || 'EXPENSE') as Transaction['type'],
      amount: t.amount,
      sourceAccountId: t.source_account_id ?? null,
      destinationAccountId: t.destination_account_id ?? null,
      categoryId: t.category_id ?? null,
      transactionDate: t.transaction_date ?? new Date().toISOString().slice(0, 10),
      description: t.description ?? null,
      createdBy: t.created_by ?? 1,
      createdAt: t.created_at ?? new Date().toISOString(),
    }));
  },

  async createTransaction(input: TransactionInput): Promise<Transaction> {
    const t = await request<any>('/api/v1/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: input.type,
        amount: input.amount,
        source_account_id: input.sourceAccountId,
        destination_account_id: input.destinationAccountId,
        category_id: input.categoryId,
        transaction_date: input.transactionDate,
        description: input.description,
      }),
    });
    return {
      transactionId: t.transaction_id ?? t.id,
      type: (t.type?.toUpperCase() || input.type) as Transaction['type'],
      amount: t.amount ?? input.amount,
      sourceAccountId: t.source_account_id ?? input.sourceAccountId,
      destinationAccountId: t.destination_account_id ?? input.destinationAccountId,
      categoryId: t.category_id ?? input.categoryId,
      transactionDate: t.transaction_date ?? input.transactionDate,
      description: t.description ?? input.description,
      createdBy: t.created_by ?? 1,
      createdAt: t.created_at ?? new Date().toISOString(),
    };
  },
};