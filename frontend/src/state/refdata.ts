import { useMemo } from 'react';
import { api, type Account, type Category, type Member } from '../api';
import { useLoad } from './session';

/** Accounts, categories and members that most screens need for names and pickers. */
export function useRefData() {
  const { data, loading } = useLoad(async () => {
    const [accounts, categories, members] = await Promise.all([api.accounts(), api.categories(), api.allMembers()]);
    return { accounts, categories, members };
  });
  return useMemo(() => {
    const accounts: Account[] = data?.accounts ?? [];
    const categories: Category[] = data?.categories ?? [];
    const members: Member[] = data?.members ?? [];
    const accountName = (id: number | null) => accounts.find((a) => a.accountId === id)?.name ?? 'Account';
    const categoryName = (id: number | null) => categories.find((c) => c.categoryId === id)?.name ?? '';
    const memberName = (id: number) => members.find((m) => m.memberId === id)?.fullName ?? 'Former member';
    return { loading: loading && !data, accounts, categories, members, accountName, categoryName, memberName };
  }, [data, loading]);
}
