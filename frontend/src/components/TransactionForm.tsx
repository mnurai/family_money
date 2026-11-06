// UC-04 / UC-05 / UC-06: one form for all three types (NFR-13: one screen, a few fields).
// The form only offers what the rules allow (matching categories, no transfer for a child,
// no category for a transfer); the API checks everything again.

import { useMemo, useState } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { api, type Account, type Category, type Transaction, type TransactionType } from '../api';
import { today } from '../lib/dates';
import { formatMoney, parseAmount, toInputAmount } from '../lib/money';
import { useMember } from '../state/session';
import { useRefData } from '../state/refdata';
import { ErrorAlert, Field, Modal, Skeleton, TYPE_LABEL, useToast } from './ui';

export interface TxDraft {
  type?: TransactionType;
  accountId?: number;
  /** Transfer into this account (adding money to a goal). */
  toAccountId?: number;
  /** Editing an existing transaction. */
  tx?: Transaction;
}

export function TransactionForm({ draft, onClose }: { draft: TxDraft; onClose: () => void }) {
  const ref = useRefData();
  if (ref.loading) {
    return (
      <Modal title={draft.tx ? 'Edit transaction' : 'Add transaction'} onClose={onClose}>
        <Skeleton height={44} />
        <Skeleton height={60} />
        <Skeleton height={44} />
      </Modal>
    );
  }
  return <TransactionFormInner draft={draft} onClose={onClose} accounts={ref.accounts} categories={ref.categories} />;
}

function TransactionFormInner({ draft, onClose, accounts, categories }: { draft: TxDraft; onClose: () => void; accounts: Account[]; categories: Category[] }) {
  const { isChild, changed } = useMember();
  const toast = useToast();
  const editing = draft.tx;

  const usable = accounts.filter((a) => !a.isArchived);
  const [type, setType] = useState<TransactionType>(editing?.type ?? draft.type ?? 'EXPENSE');
  const [amount, setAmount] = useState(editing ? toInputAmount(editing.amount) : '');
  const [source, setSource] = useState<number | ''>(
    editing?.sourceAccountId ??
      (draft.accountId && type !== 'INCOME' ? draft.accountId : usable.find((a) => a.accountId !== draft.toAccountId)?.accountId ?? ''),
  );
  const [dest, setDest] = useState<number | ''>(
    editing?.destinationAccountId ?? draft.toAccountId ?? (draft.accountId && type === 'INCOME' ? draft.accountId : (type === 'TRANSFER' ? usable[1] : usable[0])?.accountId ?? ''),
  );
  const [categoryId, setCategoryId] = useState<number | ''>(editing?.categoryId ?? '');
  const [date, setDate] = useState(editing?.transactionDate ?? today());
  const [description, setDescription] = useState(editing?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const types: TransactionType[] = isChild ? ['EXPENSE', 'INCOME'] : ['EXPENSE', 'INCOME', 'TRANSFER'];
  const matchingCategories = useMemo(
    () => categories.filter((c) => !c.isArchived && c.type === (type === 'INCOME' ? 'INCOME' : 'EXPENSE')),
    [categories, type],
  );
  const sourceAccount = usable.find((a) => a.accountId === source);

  function changeType(t: TransactionType) {
    setType(t);
    setCategoryId('');
    setError(null);
    if (t === 'TRANSFER' && dest === source) setDest(usable.find((a) => a.accountId !== source)?.accountId ?? '');
    if (t === 'INCOME' && dest === '') setDest(source);
    if (t === 'EXPENSE' && source === '') setSource(dest);
  }

  async function save() {
    setError(null);
    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      setFieldError(parsed.error);
      return;
    }
    setFieldError(null);
    if (date > today()) {
      setError('Date cannot be later than today. Use a recurring transaction to plan future payments.'); // BR-09
      return;
    }
    if (type === 'TRANSFER' && source === dest) {
      setError('Choose two different accounts'); // BR-05
      return;
    }
    if (type !== 'TRANSFER' && categoryId === '') {
      setError(`Choose a${type === 'INCOME' ? 'n income' : 'n expense'} category`);
      return;
    }
    const input = {
      type,
      amount: parsed.value,
      sourceAccountId: type === 'INCOME' ? null : (source as number) || null,
      destinationAccountId: type === 'EXPENSE' ? null : (dest as number) || null,
      categoryId: type === 'TRANSFER' ? null : (categoryId as number),
      transactionDate: date,
      description: description.trim() || null,
    };
    setBusy(true);
    try {
      if (editing) await api.updateTransaction(editing.transactionId, input);
      else await api.createTransaction(input);
      toast(editing ? 'Transaction updated' : 'Transaction saved');
      changed();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? 'Edit transaction' : 'Add transaction'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || usable.length === 0}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="segmented" role="tablist" aria-label="Transaction type">
        {types.map((t) => (
          <button key={t} role="tab" aria-selected={type === t} className={`${type === t ? 'on' : ''} t-${t}`} onClick={() => changeType(t)}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {type === 'TRANSFER' && (
        <div className="alert alert-info">
          <Info size={16} />
          <span>A transfer moves money between your own accounts. It is not counted as income or spending.</span>
        </div>
      )}

      <Field label="Amount">
        <div className="input-wrap">
          <input
            className={`input input-amount ${fieldError ? 'invalid' : ''}`}
            inputMode="decimal"
            placeholder="0"
            autoFocus
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setFieldError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            aria-invalid={!!fieldError}
          />
          <span className="suffix">₸</span>
        </div>
        {fieldError && <span className="error-text">{fieldError}</span>}
      </Field>

      {type === 'TRANSFER' ? (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <AccountSelect label="From account" value={source} onChange={setSource} accounts={usable} />
          </div>
          <ArrowRight size={18} className="muted" style={{ marginBottom: 13 }} />
          <div style={{ flex: 1 }}>
            <AccountSelect label="To account" value={dest} onChange={setDest} accounts={usable} />
          </div>
        </div>
      ) : type === 'EXPENSE' ? (
        <AccountSelect label="Paid from" value={source} onChange={setSource} accounts={usable} />
      ) : (
        <AccountSelect label="Received to" value={dest} onChange={setDest} accounts={usable} />
      )}
      {sourceAccount && type !== 'INCOME' && (
        <p className="muted small" style={{ marginTop: -8 }}>
          Balance on {sourceAccount.name}: {formatMoney(sourceAccount.balance)}
        </p>
      )}

      {type !== 'TRANSFER' && (
        <Field label="Category">
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Choose a category</option>
            {matchingCategories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.parentId ? '— ' : ''}
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-2" style={{ gap: 12 }}>
        <Field label="Date">
          <input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Description" hint="optional">
          <input className="input" value={description} maxLength={255} placeholder={type === 'TRANSFER' ? 'ATM withdrawal' : 'Magnum'} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>

      <ErrorAlert message={error} />
    </Modal>
  );
}

function AccountSelect({ label, value, onChange, accounts }: { label: string; value: number | ''; onChange: (v: number | '') => void; accounts: { accountId: number; name: string }[] }) {
  return (
    <Field label={label}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}>
        {accounts.length === 0 && <option value="">No accounts yet</option>}
        {accounts.map((a) => (
          <option key={a.accountId} value={a.accountId}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
