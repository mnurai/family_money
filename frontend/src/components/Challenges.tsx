// FR-46, BR-32: kids' savings challenges. A parent sets a target on an account shared with a
// child; progress is that account's balance, with milestone stars at 25 / 50 / 75 / 100 %.

import { useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, Medal, Plus, Rocket, Star } from 'lucide-react';
import { api, type Challenge } from '../api';
import { goalMilestones } from '../lib/achievements';
import { today } from '../lib/dates';
import { formatMoney, parseAmount } from '../lib/money';
import { useLoad, useMember } from '../state/session';
import { useRefData } from '../state/refdata';
import { MilestoneBar, NextMilestone } from './Achievements';
import { useAddTransaction } from './Layout';
import { Confirm, Empty, ErrorAlert, Field, Modal, Money, Skeleton, useToast } from './ui';

function Stars({ saved, target }: { saved: number; target: number }) {
  return (
    <span className="stars" aria-label={`${goalMilestones(saved, target).filter((m) => m.reached).length} of 4 stars`}>
      {goalMilestones(saved, target).map((m) => (
        <Star key={m.percent} size={18} className={m.reached ? 'on' : ''} fill={m.reached ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}

export function ChallengeCard({ challenge: ch, forChild, onCancel }: { challenge: Challenge; forChild?: boolean; onCancel?: () => void }) {
  const addTx = useAddTransaction();
  const done = ch.status === 'ACHIEVED';
  const pct = Math.min(100, Math.floor((ch.saved * 100) / ch.targetAmount));
  return (
    <div className={`card challenge-card ${done ? 'done' : ''}`}>
      <div className="challenge-top">
        <span className="challenge-mark">{done ? <Medal size={22} /> : <Rocket size={22} />}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="challenge-kicker">{forChild ? 'My challenge' : `${ch.childName}’s challenge`}</div>
          <h2>{ch.name}</h2>
        </div>
        <Stars saved={ch.saved} target={ch.targetAmount} />
      </div>
      <div className="card-body stack">
        <div>
          <span className="stat-value num"><Money value={Math.min(ch.saved, ch.targetAmount)} /></span>
          <span className="muted"> of <Money value={ch.targetAmount} /> · {pct} %</span>
        </div>
        <MilestoneBar saved={ch.saved} target={ch.targetAmount} />
        {done ? (
          <div className="alert challenge-done small">
            <Medal size={16} />
            <span>{forChild ? 'Challenge complete! You did it.' : `${ch.childName} completed this challenge.`}</span>
          </div>
        ) : (
          <NextMilestone saved={ch.saved} target={ch.targetAmount} />
        )}
        <div className="row wrap muted small">
          <span>{ch.accountName}</span>
          {ch.targetDate && <span>· by {new Date(ch.targetDate).toLocaleDateString([], { day: 'numeric', month: 'long' })}</span>}
        </div>
        {!done && (
          <div className="row wrap">
            {forChild ? (
              <button className="btn" onClick={() => addTx({ type: 'INCOME', accountId: ch.accountId })}>
                <ArrowDownLeft size={16} /> Add money I got
              </button>
            ) : (
              <button className="btn" onClick={() => addTx({ type: 'TRANSFER', toAccountId: ch.accountId })}>
                <ArrowLeftRight size={16} /> Add money
              </button>
            )}
            {onCancel && <button className="btn btn-ghost" onClick={onCancel}>Cancel challenge</button>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Child's overview: their own active or latest challenge. */
export function MyChallenge() {
  const { data } = useLoad(() => api.challenges());
  if (!data) return <Skeleton height={200} />;
  const ch = data.find((c) => c.status === 'ACTIVE') ?? data[0];
  if (!ch) return null;
  return <ChallengeCard challenge={ch} forChild />;
}

/** Goals page section for the Owner and Adults. */
export function KidsChallenges() {
  const { changed } = useMember();
  const refData = useRefData();
  const { data } = useLoad(() => api.challenges());
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const children = refData.members.filter((m) => m.role === 'CHILD' && m.removedAt === null);
  if (!refData.loading && children.length === 0) return null; // no children, nothing to show

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>Kids’ savings challenges</h2>
          <p className="muted small">Set a target on an account shared with a child. Stars light up at 25, 50, 75 and 100 %.</p>
        </div>
        <button className="btn" onClick={() => setAdding(true)}><Plus size={16} /> New challenge</button>
      </div>
      {!data ? (
        <Skeleton height={160} />
      ) : data.length === 0 ? (
        <div className="card"><Empty icon={<Rocket size={22} />} title="No challenges yet" text="For example: save 25 000 ₸ for headphones." action={<button className="btn btn-primary" onClick={() => setAdding(true)}>New challenge</button>} /></div>
      ) : (
        <div className="grid grid-2">
          {data.map((ch) => <ChallengeCard key={ch.challengeId} challenge={ch} onCancel={() => setCancelling(ch.challengeId)} />)}
        </div>
      )}
      {adding && <ChallengeForm onClose={() => setAdding(false)} />}
      {cancelling !== null && (
        <Confirm title="Cancel challenge?" text="The account and its money stay as they are." confirmLabel="Cancel challenge" danger onClose={() => setCancelling(null)} onConfirm={async () => { await api.cancelChallenge(cancelling); changed(); }} />
      )}
    </section>
  );
}

function ChallengeForm({ onClose }: { onClose: () => void }) {
  const { changed } = useMember();
  const refData = useRefData();
  const toast = useToast();
  const children = refData.members.filter((m) => m.role === 'CHILD' && m.removedAt === null);
  const [childId, setChildId] = useState<number | ''>(children[0]?.memberId ?? '');
  const shared = refData.accounts.filter((a) => !a.isArchived && childId !== '' && a.sharedWith.includes(childId));
  const [accountId, setAccountId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const account: number | '' = accountId === '' ? (shared.length > 0 ? shared[0].accountId : '') : accountId;

  async function save() {
    setError(null);
    if (childId === '') return setError('Challenges can be set only for child members');
    if (account === '') return setError('Choose an account shared with this child');
    const t = parseAmount(target);
    if (!t.ok) return setError(t.error === 'Amount must be greater than 0' ? 'Target amount must be greater than 0' : t.error);
    try {
      await api.createChallenge({ childMemberId: childId, accountId: account, name, targetAmount: t.value, targetDate: date || null });
      toast('Challenge created');
      changed();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal title="New savings challenge" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Create challenge</button></>}>
      <Field label="Child">
        <select className="select" value={childId} onChange={(e) => { setChildId(e.target.value ? Number(e.target.value) : ''); setAccountId(''); }}>
          {children.map((m) => <option key={m.memberId} value={m.memberId}>{m.fullName}</option>)}
        </select>
      </Field>
      <Field label="Name"><input className="input" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Headphones" /></Field>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <Field label="Target amount">
          <div className="input-wrap"><input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="25000" /><span className="suffix">₸</span></div>
        </Field>
        <Field label="Target date" hint="optional"><input className="input" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Account shared with the child">
        <select className="select" value={account} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}>
          {shared.length === 0 && <option value="">No shared account. Share one on the Accounts page.</option>}
          {shared.map((a) => <option key={a.accountId} value={a.accountId}>{a.name} · {formatMoney(a.balance)}</option>)}
        </select>
      </Field>
      <p className="muted small">Progress is the balance of this account. A child can have one active challenge.</p>
      <ErrorAlert message={error} />
    </Modal>
  );
}
