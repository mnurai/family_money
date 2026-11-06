// UC-03: create, edit, archive (BR-21), share with a child (FR-13).

import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Archive, ArrowLeftRight, MoreHorizontal, Pencil, Plus, Share2, Wallet } from 'lucide-react';
import { api, type Account, type AccountType } from '../api';
import { useAddTransaction } from '../components/Layout';
import { AccountIcon, ACCOUNT_LABEL, Avatar, Empty, ErrorAlert, Field, Modal, Money, Progress, Skeleton, useToast } from '../components/ui';
import { formatMoney, parseAmount, parseSignedAmount, toInputAmount } from '../lib/money';
import { useMember } from '../state/session';
import { useRefData } from '../state/refdata';

export function AccountsPage() {
  const { isGrownUp, isOwner, isChild } = useMember();
  const refData = useRefData();
  const addTx = useAddTransaction();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(params.get('first') === '1');
  const [editing, setEditing] = useState<Account | null>(null);
  const [sharing, setSharing] = useState<Account | null>(null);
  const [archiving, setArchiving] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = refData.accounts.filter((a) => !a.isArchived);
  const archived = refData.accounts.filter((a) => a.isArchived);
  const list = showArchived ? archived : active;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p>{isChild ? 'Accounts your parents shared with you.' : 'Where the family’s money is kept.'}</p>
        </div>
        <div className="row">
          {archived.length > 0 && (
            <button className={`chip ${showArchived ? 'on' : ''}`} onClick={() => setShowArchived((v) => !v)}>
              Archived ({archived.length})
            </button>
          )}
          {isGrownUp && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add account
            </button>
          )}
        </div>
      </div>

      {refData.loading ? (
        <div className="grid grid-3"><Skeleton height={180} /><Skeleton height={180} /><Skeleton height={180} /></div>
      ) : list.length === 0 ? (
        <div className="card">
          <Empty icon={<Wallet size={22} />} title={showArchived ? 'No archived accounts' : 'No accounts yet'} text={isChild ? 'Ask a parent to share an account with you.' : 'Add a bank card, cash, savings or a credit card. Balances are calculated from the transactions.'} action={isGrownUp && !showArchived && <button className="btn btn-primary" onClick={() => setAdding(true)}>Add account</button>} />
        </div>
      ) : (
        <div className="grid grid-3">
          {list.map((a) => (
            <AccountCard
              key={a.accountId}
              account={a}
              childNames={a.sharedWith.map((id) => refData.memberName(id))}
              actions={{
                transfer: isGrownUp && !a.isArchived && active.length > 1 ? () => addTx({ type: 'TRANSFER', accountId: a.accountId }) : undefined,
                edit: isGrownUp && !a.isArchived ? () => setEditing(a) : undefined,
                share: isOwner && !a.isArchived ? () => setSharing(a) : undefined,
                archive: isOwner && !a.isArchived ? () => setArchiving(a) : undefined,
              }}
            />
          ))}
        </div>
      )}

      {isGrownUp && active.length > 0 && (
        <p className="muted small" style={{ marginTop: 16 }}>
          Balance = opening balance + money in − money out. Cash, card and savings accounts cannot go below 0; a credit card can go down to its limit.
        </p>
      )}

      {adding && <AccountForm onClose={() => { setAdding(false); if (params.has('first')) setParams({}, { replace: true }); }} />}
      {editing && <AccountForm account={editing} onClose={() => setEditing(null)} />}
      {sharing && <ShareDialog account={sharing} onClose={() => setSharing(null)} />}
      {archiving && <ArchiveDialog account={archiving} onClose={() => setArchiving(null)} />}
    </>
  );
}

function AccountCard({ account: a, childNames, actions }: { account: Account; childNames: string[]; actions: Record<'transfer' | 'edit' | 'share' | 'archive', (() => void) | undefined> }) {
  const [menu, setMenu] = useState(false);
  const isCredit = a.type === 'CREDIT_CARD';
  const used = isCredit && a.creditLimit ? Math.max(0, -a.balance) : 0;
  const hasMenu = actions.edit || actions.share || actions.archive;

  return (
    <div className={`card acc-card ${a.isArchived ? 'archived' : ''}`}>
      <div className="row-between">
        <AccountIcon type={a.type} />
        <div className="row" style={{ gap: 4, position: 'relative' }}>
          {actions.transfer && (
            <button className="btn btn-ghost btn-sm" onClick={actions.transfer} title="Transfer from this account">
              <ArrowLeftRight size={14} /> Transfer
            </button>
          )}
          {hasMenu && (
            <>
              <button className="icon-btn" style={{ width: 32, height: 32, border: 0 }} onClick={() => setMenu((m) => !m)} aria-label={`${a.name} actions`}>
                <MoreHorizontal size={16} />
              </button>
              {menu && (
                <div className="menu" style={{ top: 36, bottom: 'auto', left: 'auto', right: 0, width: 200 }} onMouseLeave={() => setMenu(false)}>
                  {actions.edit && <button onClick={() => { setMenu(false); actions.edit!(); }}><Pencil size={15} /> Edit</button>}
                  {actions.share && <button onClick={() => { setMenu(false); actions.share!(); }}><Share2 size={15} /> Share with a child</button>}
                  {actions.archive && <button onClick={() => { setMenu(false); actions.archive!(); }} style={{ color: 'var(--danger)' }}><Archive size={15} /> Archive</button>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div>
        <div className="muted small">{a.name}</div>
        <div className="acc-balance num"><Money value={a.balance} /></div>
      </div>
      {isCredit && a.creditLimit !== null && (
        <div className="stack" style={{ gap: 6 }}>
          <Progress percent={a.creditLimit ? (used * 100) / a.creditLimit : 0} tone={used > a.creditLimit * 0.8 ? 'warn' : ''} />
          <span className="muted small num">Available {formatMoney(a.creditLimit + a.balance)} of {formatMoney(a.creditLimit)}</span>
        </div>
      )}
      <div className="row-between" style={{ marginTop: 'auto' }}>
        <span className="badge">{a.isArchived ? 'Archived' : ACCOUNT_LABEL[a.type]}</span>
        <div className="row" style={{ gap: 6 }}>
          {childNames.map((n) => <span key={n} title={`Shared with ${n}`}><Avatar name={n} size="sm" /></span>)}
          <Link to={`/transactions?account=${a.accountId}`} className="small" style={{ fontWeight: 600 }}>History</Link>
        </div>
      </div>
    </div>
  );
}

const TYPES: AccountType[] = ['BANK_CARD', 'CASH', 'SAVINGS', 'CREDIT_CARD'];

function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { changed } = useMember();
  const toast = useToast();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'BANK_CARD');
  const [opening, setOpening] = useState(account ? toInputAmount(account.openingBalance) : '0');
  const [limit, setLimit] = useState(account?.creditLimit != null ? toInputAmount(account.creditLimit) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    let creditLimit: number | null = null;
    if (type === 'CREDIT_CARD') {
      const l = limit.trim() === '0' ? { ok: true as const, value: 0 } : parseAmount(limit);
      if (!l.ok) return setError(`Credit limit: ${l.error.toLowerCase()}`);
      creditLimit = l.value;
    }
    setBusy(true);
    try {
      if (account) {
        await api.updateAccount(account.accountId, { name, creditLimit });
        toast('Account updated');
      } else {
        const o = parseSignedAmount(opening || '0');
        if (!o.ok) throw new Error(`Opening balance: ${o.error.toLowerCase()}`);
        await api.createAccount({ name, type, openingBalance: o.value, creditLimit });
        toast('Account added');
      }
      changed();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={account ? 'Edit account' : 'Add account'}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>Save</button></>}
    >
      <Field label="Name">
        <input className="input" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Kaspi card" />
      </Field>
      {!account && (
        <Field label="Type">
          <div className="chips">
            {TYPES.map((t) => (
              <button key={t} className={`chip ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>{ACCOUNT_LABEL[t]}</button>
            ))}
          </div>
        </Field>
      )}
      {!account && (
        <Field label="Opening balance" hint={type === 'CREDIT_CARD' ? 'negative if you already owe' : 'money on it today'}>
          <div className="input-wrap">
            <input className="input" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
            <span className="suffix">₸</span>
          </div>
        </Field>
      )}
      {type === 'CREDIT_CARD' && (
        <Field label="Credit limit">
          <div className="input-wrap">
            <input className="input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="300000" />
            <span className="suffix">₸</span>
          </div>
        </Field>
      )}
      {account && <p className="muted small">The opening balance and type cannot be changed. Record a transaction to correct the balance.</p>}
      <ErrorAlert message={error} />
    </Modal>
  );
}

function ShareDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const { changed } = useMember();
  const refData = useRefData();
  const toast = useToast();
  const children = refData.members.filter((m) => m.role === 'CHILD' && !m.removedAt);
  const [selected, setSelected] = useState<number[]>(account.sharedWith);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={`Share “${account.name}”`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={children.length === 0}
            onClick={async () => {
              try {
                await api.setSharing(account.accountId, selected);
                toast('Sharing updated');
                changed();
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Save
          </button>
        </>
      }
    >
      <p className="muted small">A child sees only shared accounts and all transactions on them. They can record income and expenses there, but no transfers, and they never see the family total.</p>
      {children.length === 0 ? (
        <p className="muted">There are no child members yet. Invite one on the Family page.</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {children.map((c) => (
            <label key={c.memberId} className="checkbox" style={{ alignItems: 'center' }}>
              <input type="checkbox" checked={selected.includes(c.memberId)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.memberId] : s.filter((x) => x !== c.memberId)))} />
              <Avatar name={c.fullName} size="sm" /> {c.fullName}
            </label>
          ))}
        </div>
      )}
      <ErrorAlert message={error} />
    </Modal>
  );
}

function ArchiveDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const { changed } = useMember();
  const addTx = useAddTransaction();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const hasMoney = account.balance !== 0;

  return (
    <Modal
      title={`Archive “${account.name}”?`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          {hasMoney && account.balance > 0 ? (
            <button className="btn btn-primary" onClick={() => { onClose(); addTx({ type: 'TRANSFER', accountId: account.accountId }); }}>
              <ArrowLeftRight size={16} /> Transfer the money
            </button>
          ) : (
            <button
              className="btn btn-danger-solid"
              onClick={async () => {
                try {
                  await api.archiveAccount(account.accountId);
                  toast('Account archived');
                  changed();
                  onClose();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Archive
            </button>
          )}
        </>
      }
    >
      {hasMoney ? (
        <div className="alert alert-warn">
          <span>Move the remaining money to another account first. Balance now: {formatMoney(account.balance)}.</span>
        </div>
      ) : (
        <p className="muted">The account disappears from forms. Its transactions stay in history and reports.</p>
      )}
      <ErrorAlert message={error} />
    </Modal>
  );
}
