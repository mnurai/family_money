// UC-01 steps 1–3 (register), FR-02 (login), NFR-06 (lock-out), NFR-07 (privacy notice).

import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Gauge, Lock, Mail, ShieldCheck, User, Wallet } from 'lucide-react';
import { api } from '../api';
import { DEMO_PASSWORD } from '../api/demoStore';
import { ErrorAlert, Field } from '../components/ui';
import { useSession } from '../state/session';

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-art">
        <div className="ring" style={{ width: 380, height: 380, right: -120, top: -120 }} />
        <div className="ring" style={{ width: 260, height: 260, left: -90, bottom: -60 }} />
        <div className="brand" style={{ padding: 0, position: 'relative', zIndex: 1 }}>
          <span className="brand-mark"><Wallet size={18} /></span>
          Family Budget Tracker
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2>Your family’s money, in one calm place.</h2>
          <p>Record every movement, see where the money is, and keep to the plan together.</p>
        </div>
        <div className="auth-points">
          <div className="auth-point"><span><ArrowLeftRight size={16} /></span>Transfers between your accounts are never counted as spending</div>
          <div className="auth-point"><span><Gauge size={16} /></span>Monthly budgets warn the parents at 80 % and 100 %</div>
          <div className="auth-point"><span><ShieldCheck size={16} /></span>Children see only the accounts shared with them</div>
        </div>
      </div>
      <div className="auth-form">
        <div className="auth-box">{children}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function login(e: string, p: string) {
    setBusy(true);
    setError(null);
    try {
      await api.login(e, p);
      await refresh();
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <div>
        <h1>Welcome back</h1>
        <p className="muted" style={{ marginTop: 4 }}>Log in to see your family’s money.</p>
      </div>
      <form
        className="stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void login(email, password);
        }}
      >
        <Field label="Email">
          <div className="input-wrap">
            <Mail size={16} className="prefix" />
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mail.kz" />
          </div>
        </Field>
        <Field label="Password">
          <div className="input-wrap">
            <Lock size={16} className="prefix" />
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </Field>
        <ErrorAlert message={error} />
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="muted small">Forgot your password? Ask the system administrator for a one-time reset link.</p>
      <p className="small">
        New here? <Link to="/register" style={{ fontWeight: 600 }}>Create an account</Link>
      </p>

      {api.isDemo && (
        <div className="demo-box stack" style={{ gap: 10 }}>
          <div>
            <h3>Try the demo</h3>
            <p className="muted small">One family, three roles. Password for all: <code>{DEMO_PASSWORD}</code></p>
          </div>
          <div className="chips">
            {api.demoAccounts().map((a) => (
              <button key={a.email} className="chip" disabled={busy} onClick={() => login(a.email, DEMO_PASSWORD)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strong = password.length >= 8 && /[A-Za-zА-Яа-яЁё]/.test(password) && /\d/.test(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.register(fullName, email, password, privacy);
      await refresh();
      navigate('/welcome');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <div>
        <h1>Create your account</h1>
        <p className="muted" style={{ marginTop: 4 }}>Then start a family or accept an invitation.</p>
      </div>
      <form className="stack" onSubmit={submit}>
        <Field label="Full name">
          <div className="input-wrap">
            <User size={16} className="prefix" />
            <input className="input" required maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Aigerim Seitkali" />
          </div>
        </Field>
        <Field label="Email">
          <div className="input-wrap">
            <Mail size={16} className="prefix" />
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mail.kz" />
          </div>
        </Field>
        <Field label="Password">
          <div className="input-wrap">
            <Lock size={16} className="prefix" />
            <input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <span className={`small ${password && !strong ? 'error-text' : 'muted'}`}>At least 8 characters, with a letter and a digit.</span>
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
          <span>
            I agree that my personal data is processed under the Law of the RK “On Personal Data and Their Protection”, as described in the privacy notice.
          </span>
        </label>
        <ErrorAlert message={error} />
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="small">
        Already have an account? <Link to="/login" style={{ fontWeight: 600 }}>Log in</Link>
      </p>
    </AuthLayout>
  );
}
