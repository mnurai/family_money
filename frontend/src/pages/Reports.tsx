// UC-09: monthly summary (FR-30), by category (FR-31), by member (FR-32). Transfers never count (BR-12).

import { useState } from 'react';
import { ChartPie, Plus } from 'lucide-react';
import { api, type MonthlySummary } from '../api';
import { useAddTransaction } from '../components/Layout';
import { Empty, Money, MonthSwitch, Skeleton } from '../components/ui';
import { currentMonth, formatMonth, monthRange } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { useLoad, useMember } from '../state/session';

const PALETTE = ['#c4553b', '#27344d', '#d9a35f', '#4f6c9c', '#2e8b57', '#8a3d68', '#7a8c3c', '#9a8f80'];
type Tab = 'summary' | 'category' | 'member';

export function ReportsPage() {
  const { isChild } = useMember();
  const addTx = useAddTransaction();
  const [month, setMonth] = useState(currentMonth());
  const [tab, setTab] = useState<Tab>('summary');
  const { from, to } = monthRange(month);
  const { data, loading } = useLoad(() => api.summary(from, to), [from, to]);
  const empty = data && data.income === 0 && data.expenses === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>{isChild ? 'Your shared accounts.' : 'Where the money came from and where it went.'} Transfers between accounts are not counted.</p>
        </div>
        <MonthSwitch month={month} onChange={setMonth} max={currentMonth()} />
      </div>

      <div className="segmented" style={{ maxWidth: 420, marginBottom: 16 }}>
        <button className={tab === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>Summary</button>
        <button className={tab === 'category' ? 'on' : ''} onClick={() => setTab('category')}>By category</button>
        <button className={tab === 'member' ? 'on' : ''} onClick={() => setTab('member')}>By member</button>
      </div>

      {loading && !data ? (
        <Skeleton height={260} />
      ) : empty ? (
        <div className="card"><Empty icon={<ChartPie size={22} />} title="No transactions in this period" text={`Nothing was recorded in ${formatMonth(month)}.`} action={<button className="btn btn-primary" onClick={() => addTx()}><Plus size={16} /> Add transaction</button>} /></div>
      ) : data && tab === 'summary' ? (
        <Summary data={data} month={month} />
      ) : data && tab === 'category' ? (
        <ByCategory data={data} />
      ) : data ? (
        <ByMember data={data} />
      ) : null}
    </>
  );
}

function Summary({ data, month }: { data: MonthlySummary; month: string }) {
  const max = Math.max(1, ...data.daily.flatMap((d) => [d.income, d.expenses]));
  const savingsRate = data.income > 0 ? Math.round((data.net * 100) / data.income) : null;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid grid-4">
        <div className="card stat"><div className="stat-label">Total income</div><div className="stat-value num" style={{ color: 'var(--income)' }}><Money value={data.income} sign /></div></div>
        <div className="card stat"><div className="stat-label">Total expenses</div><div className="stat-value num"><Money value={-data.expenses} /></div></div>
        <div className="card stat"><div className="stat-label">Net result</div><div className="stat-value num" style={{ color: data.net >= 0 ? 'var(--income)' : 'var(--expense)' }}><Money value={data.net} sign /></div></div>
        <div className="card stat"><div className="stat-label">Kept from income</div><div className="stat-value num">{savingsRate === null ? '—' : `${savingsRate} %`}</div></div>
      </div>

      <div className="grid grid-main">
        <div className="card">
          <div className="card-head">
            <h2>Day by day</h2>
            <div className="legend"><span><i style={{ background: 'var(--income)' }} />Income</span><span><i style={{ background: 'var(--expense)' }} />Expenses</span></div>
          </div>
          <div className="card-body">
            <div className="bars">
              {data.daily.map((d) => (
                <div key={d.date} className="bar-col" title={`${d.date}: +${formatMoney(d.income)} / −${formatMoney(d.expenses)}`}>
                  <div className="bar-pair">
                    <div className="bar in" style={{ height: `${(d.income / max) * 100}%` }} />
                    <div className="bar out" style={{ height: `${(d.expenses / max) * 100}%` }} />
                  </div>
                  <span className="bar-label">{Number(d.date.slice(8))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Balances at month end</h2></div>
          <div className="card-body">
            {data.balances.map((b) => (
              <div key={b.accountId} className="row-between" style={{ padding: '7px 0', borderTop: '1px solid var(--line)' }}>
                <span>{b.name}</span>
                <strong className="num"><Money value={b.balance} /></strong>
              </div>
            ))}
            <p className="muted small" style={{ marginTop: 8 }}>On {monthRange(month).to}, or today for the current month.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Donut({ parts }: { parts: { amount: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.amount, 0) || 1;
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="Expenses by category">
      <circle cx="100" cy="100" r={r} fill="none" stroke="#eeebe5" strokeWidth="26" />
      {parts.map((p, i) => {
        const len = (p.amount / total) * c;
        const el = <circle key={i} cx="100" cy="100" r={r} fill="none" stroke={p.color} strokeWidth="26" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)" />;
        offset += len;
        return el;
      })}
    </svg>
  );
}

function ByCategory({ data }: { data: MonthlySummary }) {
  const rows = data.byCategory.map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length] }));
  return (
    <div className="card card-pad">
      {rows.length === 0 ? (
        <p className="muted">No expenses in this period.</p>
      ) : (
        <div className="donut-wrap">
          <div style={{ position: 'relative', width: 200, height: 200 }}>
            <Donut parts={rows} />
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              <div><div className="muted small">Expenses</div><strong className="num" style={{ fontSize: 17 }}><Money value={data.expenses} /></strong></div>
            </div>
          </div>
          <div>
            {rows.map((r) => (
              <div key={r.categoryId} className="cat-row">
                <span className="swatch" style={{ background: r.color }} />
                <span>{r.name}</span>
                <span className="muted num">{Math.round((r.amount * 100) / data.expenses)} %</span>
                <strong className="num" style={{ textAlign: 'right', minWidth: 110 }}><Money value={r.amount} /></strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ByMember({ data }: { data: MonthlySummary }) {
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead><tr><th>Member</th><th className="r">Income</th><th className="r">Expenses</th><th className="r">Net</th></tr></thead>
        <tbody>
          {data.byMember.map((m) => (
            <tr key={m.memberId}>
              <td>{m.name}</td>
              <td className="r num" style={{ color: 'var(--income)' }}><Money value={m.income} sign /></td>
              <td className="r num"><Money value={-m.expenses} /></td>
              <td className="r num"><strong><Money value={m.income - m.expenses} sign /></strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small" style={{ padding: '12px 20px' }}>Grouped by who recorded the transaction.</p>
    </div>
  );
}
