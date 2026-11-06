// UC-10: savings goals linked to one savings account (BR-25). Money is added by a transfer.

import { useState } from 'react';
import { ArrowLeftRight, CheckCircle2, Plus, Target } from 'lucide-react';
import { api } from '../api';
import { useAddTransaction } from '../components/Layout';
import { Confirm, Empty, ErrorAlert, Field, Modal, Money, Progress, Skeleton, useToast } from '../components/ui';
import { today } from '../lib/dates';
import { formatMoney, parseAmount } from '../lib/money';
import { useLoad, useMember } from '../state/session';
import { useRefData } from '../state/refdata';

export function GoalsPage() {
  const { changed } = useMember();
  const addTx = useAddTransaction();
  const refData = useRefData();
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const { data, loading } = useLoad(() => api.goals());

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Savings goals</h1>
          <p>Progress is the balance of the linked savings account. Saving is a transfer, not an expense.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> New goal</button>
      </div>

      {loading && !data ? (
        <Skeleton height={160} />
      ) : data!.length === 0 ? (
        <div className="card"><Empty icon={<Target size={22} />} title="No goals yet" text="Save towards a trip, a laptop or a rainy-day fund." action={<button className="btn btn-primary" onClick={() => setAdding(true)}>New goal</button>} /></div>
      ) : (
        <div className="grid grid-2">
          {data!.map((g) => {
            const pct = Math.floor((g.saved * 100) / g.targetAmount);
            const left = g.targetAmount - g.saved;
            const achieved = g.status === 'ACHIEVED';
            const monthsLeft = g.targetDate ? monthsBetween(today(), g.targetDate) : null;
            return (
              <div key={g.goalId} className="card card-pad stack">
                <div className="row-between">
                  <div className="row">
                    <span className="acc-icon SAVINGS"><Target size={18} /></span>
                    <div>
                      <h2>{g.name}</h2>
                      <span className="muted small">{refData.accountName(g.accountId)}{g.targetDate ? ` · by ${new Date(g.targetDate).toLocaleDateString([], { month: 'long', year: 'numeric' })}` : ''}</span>
                    </div>
                  </div>
                  {achieved && <span className="badge ok"><CheckCircle2 size={13} /> Achieved</span>}
                </div>
                <div>
                  <span className="stat-value num"><Money value={g.saved} /></span>
                  <span className="muted"> of <Money value={g.targetAmount} /></span>
                </div>
                <Progress percent={pct} tone="goal" large />
                <div className="row-between small muted">
                  <span className="num">{Math.min(pct, 100)} %</span>
                  {!achieved && left > 0 && (
                    <span className="num">
                      {formatMoney(left)} to go{monthsLeft && monthsLeft > 0 ? ` · about ${formatMoney(Math.ceil(left / monthsLeft / 100) * 100)} a month` : ''}
                    </span>
                  )}
                </div>
                <div className="row">
                  {!achieved && (
                    <button className="btn" onClick={() => addTx({ type: 'TRANSFER', toAccountId: g.accountId })}>
                      <ArrowLeftRight size={16} /> Add money
                    </button>
                  )}
                  <button className="btn btn-ghost" onClick={() => setCancelling(g.goalId)}>Cancel goal</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && <GoalForm onClose={() => setAdding(false)} />}
      {cancelling !== null && (
        <Confirm title="Cancel goal?" text="The savings account and its money stay as they are." confirmLabel="Cancel goal" danger onClose={() => setCancelling(null)} onConfirm={async () => { await api.cancelGoal(cancelling); changed(); }} />
      )}
    </>
  );
}

function monthsBetween(from: string, to: string): number {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

function GoalForm({ onClose }: { onClose: () => void }) {
  const { changed } = useMember();
  const refData = useRefData();
  const toast = useToast();
  const { data: goals } = useLoad(() => api.goals());
  const taken = new Set((goals ?? []).map((g) => g.accountId));
  const savings = refData.accounts.filter((a) => a.type === 'SAVINGS' && !a.isArchived && !taken.has(a.accountId));
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [accountId, setAccountId] = useState<number | ''>(savings[0]?.accountId ?? '');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const t = parseAmount(target);
    if (!t.ok) return setError(t.error === 'Amount must be greater than 0' ? 'Target amount must be greater than 0' : t.error);
    try {
      let account = accountId;
      if (account === '') {
        // UC-10 step 2: "selects (or creates) a Savings account"
        const created = await api.createAccount({ name: `${name.trim() || 'Goal'} savings`, type: 'SAVINGS', openingBalance: 0, creditLimit: null });
        account = created.accountId;
      }
      await api.createGoal({ name, targetAmount: t.value, targetDate: date || null, accountId: account });
      toast('Goal created');
      changed();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal title="New savings goal" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Create goal</button></>}>
      <Field label="Name"><input className="input" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer trip" /></Field>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <Field label="Target amount">
          <div className="input-wrap"><input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="600000" /><span className="suffix">₸</span></div>
        </Field>
        <Field label="Target date" hint="optional"><input className="input" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Savings account">
        <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}>
          {savings.map((a) => <option key={a.accountId} value={a.accountId}>{a.name} · {formatMoney(a.balance)}</option>)}
          <option value="">+ Create a new savings account</option>
        </select>
      </Field>
      <p className="muted small">Each savings account can have one goal.</p>
      <ErrorAlert message={error} />
    </Modal>
  );
}
