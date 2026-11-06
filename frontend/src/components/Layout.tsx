import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChartPie,
  ChevronsUpDown,
  History,
  House,
  ListOrdered,
  LogOut,
  Plus,
  RotateCcw,
  Target,
  Users,
  Wallet,
  Gauge,
} from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../lib/dates';
import { useLoad, useMember, useSession } from '../state/session';
import { TransactionForm, type TxDraft } from './TransactionForm';
import { Avatar, ROLE_LABEL } from './ui';

const TxDialog = createContext<(draft?: TxDraft) => void>(() => {});
export const useAddTransaction = () => useContext(TxDialog);

export function Layout() {
  const { family, member, isGrownUp, isOwner } = useMember();
  const [draft, setDraft] = useState<TxDraft | null>(null);
  const location = useLocation();

  // Children see only what doc 02 §3 allows them.
  const nav = [
    { to: '/', label: 'Overview', icon: House, show: true },
    { to: '/transactions', label: 'Transactions', icon: ListOrdered, show: true },
    { to: '/accounts', label: 'Accounts', icon: Wallet, show: true },
    { to: '/budgets', label: 'Budgets', icon: Gauge, show: isGrownUp },
    { to: '/goals', label: 'Goals', icon: Target, show: isGrownUp },
    { to: '/reports', label: 'Reports', icon: ChartPie, show: true },
    { to: '/members', label: 'Family', icon: Users, show: true },
    { to: '/audit', label: 'Audit log', icon: History, show: isOwner },
  ].filter((n) => n.show);
  const mobileNav = nav.filter((n) => ['/', '/transactions', '/accounts', isGrownUp ? '/budgets' : '/members', '/reports'].includes(n.to));
  const current = nav.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)));

  return (
    <TxDialog.Provider value={(d) => setDraft(d ?? {})}>
      {api.isDemo && <DemoBanner />}
      <div className="shell">
        <aside className="sidebar">
          <NavLink to="/" className="brand">
            <span className="brand-mark">
              <Wallet size={18} />
            </span>
            <span>
              Family Budget
              <small>{family.name}</small>
            </span>
          </NavLink>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link">
              <n.icon size={18} />
              {n.label}
            </NavLink>
          ))}
          <div className="sidebar-foot">
            <button className="btn btn-primary" style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--brand)' }} onClick={() => setDraft({})}>
              <Plus size={18} /> Add transaction
            </button>
            <UserMenu />
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <span className="topbar-title">{current?.label ?? 'Family Budget'}</span>
            <div className="spacer" />
            <span className="muted small hide-mobile">
              {member.fullName} · {ROLE_LABEL[member.role]}
            </span>
            <Notifications />
            <MobileUser />
          </header>
          <main className="content">
            <Outlet />
          </main>
        </div>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {mobileNav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            <n.icon size={20} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <button className="fab" onClick={() => setDraft({})} aria-label="Add transaction">
        <Plus size={24} />
      </button>

      {draft && <TransactionForm draft={draft} onClose={() => setDraft(null)} />}
    </TxDialog.Provider>
  );
}

function DemoBanner() {
  const { refresh } = useSession();
  return (
    <div className="demo-banner">
      Demo data, stored only in this browser.
      <button
        onClick={async () => {
          await api.resetDemo();
          await refresh();
        }}
      >
        Reset demo
      </button>
    </div>
  );
}

function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside, active]);
}

function Notifications() {
  const { changed } = useMember();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false), open);
  const { data } = useLoad(() => api.notifications());
  const unread = data?.filter((n) => !n.isRead).length ?? 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Bell size={18} />
        {unread > 0 && <span className="dot" />}
      </button>
      {open && (
        <div className="popover">
          <div className="popover-head">
            <h3>Notifications</h3>
            {unread > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  await api.markAllRead();
                  changed();
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="popover-list">
            {data?.length === 0 && <p className="muted small" style={{ padding: 16 }}>Nothing new. Budget alerts and family news appear here.</p>}
            {data?.map((n) => (
              <div key={n.notificationId} className={`notif ${n.isRead ? '' : 'unread'}`}>
                <span className="notif-dot" />
                <div>
                  <div>{n.message}</div>
                  <div className="muted small">{formatDate(n.createdAt.slice(0, 10))}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenuItems({ onDone }: { onDone: () => void }) {
  const { refresh } = useSession();
  const { user } = useMember();
  const navigate = useNavigate();

  async function switchTo(email: string) {
    await api.logout();
    await api.login(email, 'demo1234');
    await refresh();
    onDone();
    navigate('/');
  }

  return (
    <>
      {api.isDemo && (
        <>
          <div className="menu-label">Switch demo user</div>
          {api
            .demoAccounts()
            .filter((a) => a.email !== user.email)
            .map((a) => (
              <button key={a.email} onClick={() => switchTo(a.email)}>
                <Avatar name={a.label} size="sm" /> {a.label}
              </button>
            ))}
          <button
            onClick={async () => {
              await api.resetDemo();
              await refresh();
              onDone();
            }}
          >
            <RotateCcw size={16} /> Reset demo data
          </button>
          <hr />
        </>
      )}
      <button
        onClick={async () => {
          await api.logout();
          await refresh();
          navigate('/login');
        }}
      >
        <LogOut size={16} /> Log out
      </button>
    </>
  );
}

function UserMenu() {
  const { member } = useMember();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="user-chip" onClick={() => setOpen((o) => !o)}>
        <Avatar name={member.fullName} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.fullName}</span>
          <span style={{ display: 'block', fontSize: 12, color: '#aab3c5' }}>{ROLE_LABEL[member.role]}</span>
        </span>
        <ChevronsUpDown size={16} />
      </button>
      {open && (
        <div className="menu">
          <UserMenuItems onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function MobileUser() {
  const { member } = useMember();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" style={{ padding: 0, border: 0, background: 'none' }} onClick={() => setOpen((o) => !o)} aria-label="Account menu">
        <Avatar name={member.fullName} />
      </button>
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 8px)', bottom: 'auto', left: 'auto', right: 0, width: 260 }}>
          <UserMenuItems onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
