import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  PartyPopper,
  PiggyBank,
  Wallet,
  X,
} from 'lucide-react';
import type { AccountType, MemberRole, TransactionType } from '../api';
import { formatMonth } from '../lib/dates';
import { formatMoney, type Tiyn } from '../lib/money';

export function Money({ value, sign, className = '' }: { value: Tiyn; sign?: boolean; className?: string }) {
  return <span className={`num ${className}`}>{formatMoney(value, { sign })}</span>;
}

export const TYPE_LABEL: Record<TransactionType, string> = { INCOME: 'Income', EXPENSE: 'Expense', TRANSFER: 'Transfer' };
export const ROLE_LABEL: Record<MemberRole, string> = { OWNER: 'Owner', ADULT: 'Adult', CHILD: 'Child' };
export const ACCOUNT_LABEL: Record<AccountType, string> = { CASH: 'Cash', BANK_CARD: 'Bank card', SAVINGS: 'Savings', CREDIT_CARD: 'Credit card' };

export function TypeIcon({ type, size = 18 }: { type: TransactionType; size?: number }) {
  const Icon = type === 'INCOME' ? ArrowDownLeft : type === 'EXPENSE' ? ArrowUpRight : ArrowLeftRight;
  return (
    <span className={`tx-icon t-${type}`} aria-hidden>
      <Icon size={size} />
    </span>
  );
}

export function AccountIcon({ type, size = 18 }: { type: AccountType; size?: number }) {
  const Icon = type === 'CASH' ? Banknote : type === 'SAVINGS' ? PiggyBank : type === 'CREDIT_CARD' ? CreditCard : Wallet;
  return (
    <span className={`acc-icon ${type}`} aria-hidden>
      <Icon size={size} />
    </span>
  );
}

export function Avatar({ name, size = '' }: { name: string; size?: '' | 'sm' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return <span className={`avatar ${size}`}>{initials}</span>;
}

export function RoleBadge({ role }: { role: MemberRole }) {
  return <span className={`badge role-${role}`}>{ROLE_LABEL[role]}</span>;
}

/** UC-07 step 5: green < 80 %, yellow 80–99 %, red ≥ 100 %. */
export function budgetTone(percent: number): '' | 'warn' | 'bad' {
  return percent >= 100 ? 'bad' : percent >= 80 ? 'warn' : '';
}

export function Progress({ percent, tone = '', large }: { percent: number; tone?: string; large?: boolean }) {
  return (
    <div className={`progress ${tone} ${large ? 'lg' : ''}`} role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p className="muted small" style={{ maxWidth: 340 }}>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorAlert({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      <AlertCircle size={16} />
      <span>{message}</span>
    </div>
  );
}

export function Skeleton({ height = 18, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>
        {label} {hint && <em className="hint">· {hint}</em>}
      </span>
      {children}
    </label>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" style={{ border: 0 }} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, text, confirmLabel, danger, onConfirm, onClose }: { title: string; text: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{text}</p>
      <ErrorAlert message={error} />
    </Modal>
  );
}

export function MonthSwitch({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  const [y, m] = month.split('-').map(Number);
  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const next = shift(1);
  return (
    <div className="month-switch">
      <button onClick={() => onChange(shift(-1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
      <span>{formatMonth(month)}</span>
      <button onClick={() => onChange(next)} disabled={!!max && next > max} aria-label="Next month" style={max && next > max ? { opacity: 0.3 } : undefined}>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

// ---- toasts

/** `true` or 'error' shows an error; 'celebrate' a new badge or goal milestone (FR-43, FR-44). */
type ToastKind = boolean | 'error' | 'celebrate';
type Toast = { id: number; text: string; kind: 'info' | 'error' | 'celebrate' };
const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind?: ToastKind) => {
    const id = Date.now() + Math.random();
    const k = kind === true || kind === 'error' ? 'error' : kind === 'celebrate' ? 'celebrate' : 'info';
    setToasts((t) => [...t, { id, text, kind: k }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), k === 'celebrate' ? 5000 : 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'info' ? '' : t.kind}`}>
            {t.kind === 'error' ? <AlertCircle size={16} /> : t.kind === 'celebrate' ? <PartyPopper size={16} /> : <CheckCircle2 size={16} />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
