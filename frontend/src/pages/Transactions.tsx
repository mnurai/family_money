// FR-21 list with filters, UC-06 edit / delete (BR-11), FR-34 CSV export.

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, ListOrdered, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, type Transaction, type TransactionType } from '../api';
import { useAddTransaction } from '../components/Layout';
import { TxRow } from '../components/TxRow';
import { Confirm, Empty, Modal, MonthSwitch, Skeleton, TYPE_LABEL, useToast } from '../components/ui';
import { currentMonth, formatDate, monthRange } from '../lib/dates';
import { formatMoney, toDecimalString } from '../lib/money';
import { useLoad, useMember } from '../state/session';
import { useRefData } from '../state/refdata';

export function TransactionsPage() {
  const { isGrownUp } = useMember();
  const addTx = useAddTransaction();
  const refData = useRefData();
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState(params.get('month') ?? currentMonth());
  const [allTime, setAllTime] = useState(false);
  const [type, setType] = useState<TransactionType | ''>('');
  const accountId = Number(params.get('account')) || undefined;
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [memberId, setMemberId] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Transaction | null>(null);

  const range = allTime ? {} : monthRange(month);
  const filter = { ...range, type: type || undefined, accountId, categoryId: categoryId || undefined, memberId: memberId || undefined, search: search || undefined };
  const { data, loading } = useLoad(() => api.transactions(filter), [JSON.stringify(filter)]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of data ?? []) map.set(t.transactionDate, [...(map.get(t.transactionDate) ?? []), t]);
    return [...map.entries()];
  }, [data]);

  const totals = useMemo(() => {
    const txs = data ?? [];
    return {
      income: txs.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0),
      expenses: txs.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0),
      transfers: txs.filter((t) => t.type === 'TRANSFER').length,
    };
  }, [data]);

  function setAccount(id: number | '') {
    const p = new URLSearchParams(params);
    if (id) p.set('account', String(id));
    else p.delete('account');
    setParams(p, { replace: true });
  }

  function exportCsv() {
    const rows = [['Date', 'Type', 'Amount', 'From account', 'To account', 'Category', 'Description', 'Recorded by']];
    for (const t of data ?? []) {
      rows.push([
        t.transactionDate,
        t.type,
        toDecimalString(t.amount),
        t.sourceAccountId ? refData.accountName(t.sourceAccountId) : '',
        t.destinationAccountId ? refData.accountName(t.destinationAccountId) : '',
        refData.categoryName(t.categoryId),
        t.description ?? '',
        refData.memberName(t.createdBy),
      ]);
    }
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${allTime ? 'all' : month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const visibleCategories = refData.categories.filter((c) => !type || type === 'TRANSFER' || c.type === type);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p>Every money movement: income, expenses and transfers.</p>
        </div>
        <div className="row wrap">
          {!allTime && <MonthSwitch month={month} onChange={setMonth} max={currentMonth()} />}
          <button className={`chip ${allTime ? 'on' : ''}`} onClick={() => setAllTime((v) => !v)}>All time</button>
          {isGrownUp && (
            <button className="btn hide-mobile" onClick={exportCsv} disabled={!data?.length}>
              <Download size={16} /> CSV
            </button>
          )}
          <button className="btn btn-primary hide-mobile" onClick={() => addTx({ accountId })}>
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="filters">
          <div className="input-wrap">
            <Search size={16} className="prefix" />
            <input className="input" placeholder="Search description" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select" value={type} onChange={(e) => { setType(e.target.value as TransactionType | ''); setCategoryId(''); }} aria-label="Type">
            <option value="">All types</option>
            {(['INCOME', 'EXPENSE', 'TRANSFER'] as const).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <select className="select" value={accountId ?? ''} onChange={(e) => setAccount(e.target.value ? Number(e.target.value) : '')} aria-label="Account">
            <option value="">All accounts</option>
            {refData.accounts.map((a) => <option key={a.accountId} value={a.accountId}>{a.name}</option>)}
          </select>
          <select className="select" value={categoryId} disabled={type === 'TRANSFER'} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')} aria-label="Category">
            <option value="">All categories</option>
            {visibleCategories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
          </select>
          <select className="select" value={memberId} onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : '')} aria-label="Member">
            <option value="">Everyone</option>
            {refData.members.map((m) => <option key={m.memberId} value={m.memberId}>{m.fullName}{m.removedAt ? ' (left)' : ''}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card stat"><div className="stat-label">Income</div><div className="stat-value num" style={{ color: 'var(--income)' }}>{formatMoney(totals.income, { sign: true })}</div></div>
        <div className="card stat"><div className="stat-label">Expenses</div><div className="stat-value num">{formatMoney(-totals.expenses)}</div></div>
        <div className="card stat"><div className="stat-label">Transfers</div><div className="stat-value num" style={{ color: 'var(--transfer)' }}>{totals.transfers}</div><div className="muted small">not counted in totals</div></div>
      </div>

      <div className="card">
        {loading && !data ? (
          <div className="card-body stack"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
        ) : groups.length === 0 ? (
          <Empty icon={<ListOrdered size={22} />} title="No transactions in this period" text="Try another month or clear the filters." action={<button className="btn btn-primary" onClick={() => addTx({ accountId })}>Add transaction</button>} />
        ) : (
          <div className="list">
            {groups.map(([date, txs]) => (
              <div key={date}>
                <div className="list-group">{formatDate(date)}</div>
                {txs.map((t) => <TxRow key={t.transactionId} tx={t} refData={refData} onClick={() => setOpen(t)} />)}
              </div>
            ))}
          </div>
        )}
      </div>

      {open && <TxDetails tx={open} onClose={() => setOpen(null)} refData={refData} />}
    </>
  );
}

function TxDetails({ tx, onClose, refData }: { tx: Transaction; onClose: () => void; refData: ReturnType<typeof useRefData> }) {
  const { member, changed } = useMember();
  const addTx = useAddTransaction();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const canModify = api.canModify(tx, member); // BR-11: hidden here, refused by the API too

  const rows: [string, string][] = [
    ['Type', TYPE_LABEL[tx.type]],
    ['Amount', formatMoney(tx.amount)],
    ...(tx.sourceAccountId ? [['From', refData.accountName(tx.sourceAccountId)] as [string, string]] : []),
    ...(tx.destinationAccountId ? [['To', refData.accountName(tx.destinationAccountId)] as [string, string]] : []),
    ...(tx.categoryId ? [['Category', refData.categoryName(tx.categoryId)] as [string, string]] : []),
    ['Date', formatDate(tx.transactionDate)],
    ['Description', tx.description || '—'],
    ['Recorded by', refData.memberName(tx.createdBy)],
  ];

  if (confirm) {
    return (
      <Confirm
        title="Delete transaction?"
        text={`${TYPE_LABEL[tx.type]} of ${formatMoney(tx.amount)} will be removed from balances and reports. The change is kept in the audit log.`}
        confirmLabel="Delete"
        danger
        onClose={onClose}
        onConfirm={async () => {
          await api.deleteTransaction(tx.transactionId);
          toast('Transaction deleted');
          changed();
        }}
      />
    );
  }

  return (
    <Modal
      title="Transaction"
      onClose={onClose}
      footer={
        canModify ? (
          <>
            <button className="btn btn-danger" onClick={() => setConfirm(true)}><Trash2 size={16} /> Delete</button>
            <button className="btn btn-primary" onClick={() => { onClose(); addTx({ tx }); }}><Pencil size={16} /> Edit</button>
          </>
        ) : undefined
      }
    >
      <div className="stack" style={{ gap: 0 }}>
        {rows.map(([k, v]) => (
          <div key={k} className="row-between" style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <span className="muted">{k}</span>
            <strong className="num" style={{ textAlign: 'right' }}>{v}</strong>
          </div>
        ))}
      </div>
      {!canModify && <p className="muted small">{member.role === 'CHILD' ? 'Children cannot edit or delete transactions.' : 'Only the person who recorded it or the family owner can change it.'}</p>}
    </Modal>
  );
}
