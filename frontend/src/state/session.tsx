import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Me } from '../api';

interface SessionValue {
  me: Me | null;
  loading: boolean;
  /** Re-read the session (after login, logout, joining a family). */
  refresh: () => Promise<void>;
  /** Bumped after every change, so screens reload their data. */
  version: number;
  changed: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(async () => {
    setMe(await api.me());
    setVersion((v) => v + 1);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const changed = useCallback(() => setVersion((v) => v + 1), []);

  return <SessionContext.Provider value={{ me, loading, refresh, version, changed }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

/** Session of a user who belongs to a family; only used inside the app shell. */
export function useMember() {
  const { me, ...rest } = useSession();
  if (!me?.member || !me.family) throw new Error('useMember without a family');
  const role = me.member.role;
  return {
    ...rest,
    me,
    user: me.user,
    family: me.family,
    member: me.member,
    role,
    isOwner: role === 'OWNER',
    isChild: role === 'CHILD',
    /** Owner and Adult: planning, transfers, family totals (doc 02 §3). */
    isGrownUp: role !== 'CHILD',
  };
}

/** Load data and reload it whenever something changed. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): { data: T | undefined; error: string | null; loading: boolean } {
  const { version } = useSession();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  return { data, error, loading };
}
