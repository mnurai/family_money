// Saving together: each member's share of a goal (FR-47), the monthly family challenge (FR-49)
// and the family leaderboard (FR-48).

import { useState } from 'react';
import { Crown, HandCoins, Plus, Trophy, Users } from 'lucide-react';
import { api, type FamilyChallenge, type Goal } from '../api';
import { currentMonth, formatMonth } from '../lib/dates';
import { parseAmount, type Tiyn } from '../lib/money';
import { useLoad, useMember } from '../state/session';
import { MilestoneBar, NextMilestone } from './Achievements';
import { Avatar, Confirm, ErrorAlert, Field, Modal, Money, Progress, ROLE_LABEL, Skeleton, useToast } from './ui';

/** One colour per member, in the order they appear. */
const SHARE_TONES = ['share-1', 'share-2', 'share-3', 'share-4'];

/** A bar split by who saved how much, with names and amounts below. */
function ShareBar({ parts, total }: { parts: { key: string; label: string; amount: Tiyn; tone: string; top?: boolean }[]; total: Tiyn }) {
  const shown = parts.filter((p) => p.amount > 0);
  if (shown.length === 0 || total <= 0) return null;
  return (
    <div className="shares">
      <div className="share-bar" aria-hidden>
        {shown.map((p) => (
          <span key={p.key} className={p.tone} style={{ width: `${(p.amount * 100) / total}%` }} />
        ))}
      </div>
      <ul className="share-list">
        {shown.map((p) => (
          <li key={p.key}>
            <span className={`share-dot ${p.tone}`} />
            <span className="share-name">
              {p.label}
              {p.top && (
                <span className="top-saver" title="Top saver">
                  <Crown size={12} /> top saver
                </span>
              )}
            </span>
            <Money value={p.amount} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** FR-47, BR-33: who put how much into the goal's account. */
export function GoalShares({ goal }: { goal: Goal }) {
  const { starting, members, takenOut } = goal.contributions;
  if (members.length === 0 && starting === 0) return null;
  const parts = [
    ...members.map((m, i) => ({ key: `m${m.memberId}`, label: m.name, amount: m.amount, tone: SHARE_TONES[i % SHARE_TONES.length], top: members.length > 1 && i === 0 })),
    { key: 'start', label: 'Starting balance', amount: starting, tone: 'share-start' },
  ];
  const total = parts.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row small muted" style={{ gap: 6 }}>
        <Users size={14} /> {members.length > 1 ? `Saved together by ${members.length} members` : 'Who saved'}
      </div>
      <ShareBar parts={parts} total={total} />
      {takenOut > 0 && (
        <div className="small muted">
          Taken out: <Money value={takenOut} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- monthly family challenge (FR-49)

function FamilyChallengeCard({ challenge: ch, onCancel }: { challenge: FamilyChallenge; onCancel?: () => void }) {
  const isCurrent = ch.month === currentMonth();
  const done = ch.result === 'ACHIEVED';
  const status = done ? 'Complete' : ch.result === 'MISSED' ? 'Not reached' : `${ch.percent} %`;
  return (
    <div className={`card challenge-card family ${done ? 'done' : ''}`}>
      <div className="challenge-top">
        <span className="challenge-mark">{done ? <Trophy size={22} /> : <HandCoins size={22} />}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="challenge-kicker">Family challenge · {formatMonth(ch.month)}</div>
          <h2>{ch.name}</h2>
        </div>
        <span className="family-status">{status}</span>
      </div>
      <div className="card-body stack">
        {ch.targetAmount !== null && ch.saved !== null ? (
          <>
            <div>
              <span className="stat-value num">
                <Money value={Math.min(ch.saved, ch.targetAmount)} />
              </span>
              <span className="muted">
                {' '}
                of <Money value={ch.targetAmount} /> saved together
              </span>
            </div>
            <MilestoneBar saved={done ? Math.max(ch.saved, ch.targetAmount) : ch.saved} target={ch.targetAmount} />
            {!done && isCurrent && <NextMilestone saved={ch.saved} target={ch.targetAmount} />}
            {ch.members && ch.members.length > 0 && (
              <ShareBar
                parts={ch.members.map((m, i) => ({ key: `m${m.memberId}`, label: m.name, amount: m.amount, tone: SHARE_TONES[i % SHARE_TONES.length], top: ch.members!.length > 1 && i === 0 }))}
                total={ch.members.reduce((s, m) => s + m.amount, 0)}
              />
            )}
            <p className="small muted">Counts money moved into savings accounts this month. Money taken back out of savings is subtracted.</p>
          </>
        ) : (
          // A Child sees the name and the percentage only (BR-13).
          <>
            <Progress percent={ch.percent} tone="goal" large />
            <p className="small muted">{done ? 'Your family reached the goal. Great teamwork!' : 'Your family is saving together this month.'}</p>
          </>
        )}
        {onCancel && ch.result === 'ACTIVE' && (
          <div className="row">
            <button className="btn btn-ghost" onClick={onCancel}>
              Cancel challenge
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function FamilyChallengeSection() {
  const { isGrownUp, changed } = useMember();
  const { data, error } = useLoad(() => api.familyChallenges());
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const current = data?.find((c) => c.month === currentMonth());
  const past = data?.filter((c) => c.month !== currentMonth()).slice(0, 4) ?? [];

  return (
    <section className="stack">
      <div className="section-head">
        <div>
          <h2>Family challenge</h2>
          <p className="muted small">One savings target for the whole family this month.</p>
        </div>
        {isGrownUp && data && !current && (
          <button className="btn" onClick={() => setAdding(true)}>
            <Plus size={16} /> Set this month’s challenge
          </button>
        )}
      </div>
      <ErrorAlert message={error} />
      {!data ? (
        <Skeleton height={180} />
      ) : current ? (
        <FamilyChallengeCard challenge={current} onCancel={isGrownUp ? () => setCancelling(current.familyChallengeId) : undefined} />
      ) : (
        <div className="card card-pad muted small">{isGrownUp ? 'No challenge for this month yet. For example: save 100 000 ₸ together.' : 'No family challenge this month.'}</div>
      )}
      {past.length > 0 && (
        <div className="past-challenges">
          {past.map((c) => (
            <span key={c.familyChallengeId} className={c.result === 'ACHIEVED' ? 'won' : ''}>
              {formatMonth(c.month)}: {c.name} · {c.result === 'ACHIEVED' ? 'complete' : 'not reached'}
            </span>
          ))}
        </div>
      )}
      {adding && <FamilyChallengeForm onClose={() => setAdding(false)} />}
      {cancelling !== null && (
        <Confirm
          title="Cancel family challenge?"
          text="No money moves. You can set a new challenge for this month afterwards."
          confirmLabel="Cancel challenge"
          danger
          onClose={() => setCancelling(null)}
          onConfirm={async () => {
            await api.cancelFamilyChallenge(cancelling);
            changed();
          }}
        />
      )}
    </section>
  );
}

function FamilyChallengeForm({ onClose }: { onClose: () => void }) {
  const { changed } = useMember();
  const toast = useToast();
  const [name, setName] = useState('Save together');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const t = parseAmount(target);
    if (!t.ok) return setError(t.error === 'Amount must be greater than 0' ? 'Target amount must be greater than 0' : t.error);
    try {
      await api.createFamilyChallenge({ name, targetAmount: t.value });
      toast('Family challenge set');
      changed();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal
      title={`Family challenge for ${formatMonth(currentMonth())}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Set challenge
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Save together this month">
        <div className="input-wrap">
          <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="100000" />
          <span className="suffix">₸</span>
        </div>
      </Field>
      <p className="muted small">Every transfer into a savings account this month counts, whoever makes it. Income and expenses don’t count.</p>
      <ErrorAlert message={error} />
    </Modal>
  );
}

// ---------------------------------------------------------------- family leaderboard (FR-48)

export function Leaderboard() {
  const { data, error } = useLoad(() => api.leaderboard());
  return (
    <section className="stack">
      <div className="section-head">
        <div>
          <h2>Family leaderboard</h2>
          <p className="muted small">Points from badges. No money amounts are shown here.</p>
        </div>
      </div>
      <ErrorAlert message={error} />
      {!data ? (
        <Skeleton height={160} />
      ) : (
        <div className="card leaderboard">
          {data.map((r) => (
            <div key={r.memberId} className={`leader-row ${r.isMe ? 'me' : ''}`}>
              <span className={`leader-rank rank-${r.rank}`}>{r.rank === 1 ? <Crown size={16} /> : r.rank}</span>
              <Avatar name={r.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="leader-name">
                  {r.name}
                  {r.isMe && <span className="muted"> (you)</span>}
                </div>
                <div className="small muted">
                  {ROLE_LABEL[r.role]} · Lv {r.level} {r.levelName} · {r.badgesEarned} {r.badgesEarned === 1 ? 'badge' : 'badges'}
                </div>
              </div>
              <span className="leader-points num">{r.points} pts</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
