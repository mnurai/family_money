import { Link } from 'react-router-dom';
import { ArrowLeftRight, ChevronRight, Plus, Target, Wallet } from 'lucide-react';
import { api } from '../api';
import { useAddTransaction } from '../components/Layout';
import { TxRow } from '../components/TxRow';
import { AccountIcon, ACCOUNT_LABEL, budgetTone, Empty, Money, Progress, Skeleton } from '../components/ui';
import { currentMonth, formatMonth, monthRange } from '../lib/dates';
import { useLoad, useMember } from '../state/session';
import { useRefData } from '../state/refdata';

export function DashboardPage() {
  const { member, isGrownUp } = useMember();
  const addTx = useAddTransaction();
  const refData = useRefData();
  const month = currentMonth();
  const { from, to } = monthRange(month);

  const { data } = useLoad(async () => {
    const [summary, recent, budgets, goals, total] = await Promise.all([
      api.summary(from, to),
      api.transactions({}),
      isGrownUp ? api.budgets(month) : Promise.resolve([]),
      isGrownUp ? api.goals() : Promise.resolve([]),
      isGrownUp ? api.familyTotal() : Promise.resolve(null), // BR-13: never for a child
    ]);
    return { summary, recent: recent.slice(0, 6), budgets, goals, total };
  }, [month, isGrownUp]);

  const accounts = refData.accounts.filter((a) => !a.isArchived);
  const firstName = member.fullName.split(' ')[0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hi, {firstName}</h1>
          <p>{formatMonth(month)} at a glance</p>
        </div>
        <div className="row hide-mobile">
          {isGrownUp && (
            <button className="btn" onClick={() => addTx({ type: 'TRANSFER' })}>
              <ArrowLeftRight size={16} /> Transfer
            </button>
          )}
          <button className="btn btn-primary" onClick={() => addTx()}>
            <Plus size={16} /> Add transaction
          </button>
        </div>
      </div>

      <div className="grid grid-main">
        <div className="stack" style={{ gap: 16 }}>
          <div className="hero">
            <div className="hero-label">{isGrownUp ? `Family total · ${accounts.length} accounts` : 'My accounts'}</div>
            <div className="hero-amount num">
              {data ? <Money value={isGrownUp ? data.total ?? 0 : accounts.reduce((s, a) => s + a.balance, 0)} /> : '…'}
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <span>Income · {formatMonth(month).split(' ')[0]}</span>
                <strong>{data ? <Money value={data.summary.income} sign /> : '…'}</strong>
              </div>
              <div className="hero-stat">
                <span>Expenses</span>
                <strong>{data ? <Money value={-data.summary.expenses} /> : '…'}</strong>
              </div>
              <div className="hero-stat">
                <span>Net result</span>
                <strong>{data ? <Money value={data.summary.net} sign /> : '…'}</strong>
              </div>
            </div>
          </div>

          <div>
            <div className="section-head">
              <h2>Accounts</h2>
              <Link to="/accounts" className="btn btn-ghost btn-sm">All <ChevronRight size={14} /></Link>
            </div>
            {refData.loading ? (
              <Skeleton height={132} />
            ) : accounts.length === 0 ? (
              <div className="card">
                <Empty icon={<Wallet size={22} />} title="No accounts yet" text={isGrownUp ? 'Add your first account: a card, cash or savings.' : 'Ask a parent to share an account with you.'} action={isGrownUp && <Link to="/accounts" className="btn btn-primary">Add account</Link>} />
              </div>
            ) : (
              <div className="grid grid-3">
                {accounts.slice(0, 6).map((a) => (
                  <Link key={a.accountId} to={`/transactions?account=${a.accountId}`} className="card acc-card" style={{ textDecoration: 'none' }}>
                    <AccountIcon type={a.type} />
                    <div>
                      <div className="muted small">{a.name}</div>
                      <div className="acc-balance num"><Money value={a.balance} /></div>
                    </div>
                    <span className="muted small" style={{ marginTop: 'auto' }}>{ACCOUNT_LABEL[a.type]}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Recent</h2>
              <Link to="/transactions" className="btn btn-ghost btn-sm">All transactions <ChevronRight size={14} /></Link>
            </div>
            <div className="list" style={{ marginTop: 8 }}>
              {!data ? (
                <div className="card-body stack"><Skeleton /><Skeleton /><Skeleton /></div>
              ) : data.recent.length === 0 ? (
                <Empty icon={<Plus size={22} />} title="No transactions yet" text="Record the first income or expense." action={<button className="btn btn-primary" onClick={() => addTx()}>Add transaction</button>} />
              ) : (
                data.recent.map((t) => <TxRow key={t.transactionId} tx={t} refData={refData} />)
              )}
            </div>
          </div>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          {isGrownUp && (
            <div className="card">
              <div className="card-head">
                <h2>Budgets · {formatMonth(month).split(' ')[0]}</h2>
                <Link to="/budgets" className="btn btn-ghost btn-sm">Manage</Link>
              </div>
              <div className="card-body stack" style={{ gap: 16 }}>
                {!data ? (
                  <Skeleton height={60} />
                ) : data.budgets.length === 0 ? (
                  <p className="muted small">No budgets this month. <Link to="/budgets">Set one</Link> to get alerts at 80 % and 100 %.</p>
                ) : (
                  [...data.budgets]
                    .sort((a, b) => b.percentUsed - a.percentUsed)
                    .map((b) => (
                      <div key={b.budgetId} className="stack" style={{ gap: 6 }}>
                        <div className="row-between">
                          <strong>{refData.categoryName(b.categoryId)}</strong>
                          <span className={`small num ${b.percentUsed >= 100 ? 'error-text' : 'muted'}`}>{b.percentUsed} %</span>
                        </div>
                        <Progress percent={b.percentUsed} tone={budgetTone(b.percentUsed)} />
                        <span className="muted small num">
                          <Money value={b.spent} /> of <Money value={b.limitAmount} />
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {isGrownUp && data && data.goals.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h2>Goals</h2>
                <Link to="/goals" className="btn btn-ghost btn-sm">All</Link>
              </div>
              <div className="card-body stack">
                {data.goals.map((g) => {
                  const pct = Math.floor((g.saved * 100) / g.targetAmount);
                  return (
                    <div key={g.goalId} className="stack" style={{ gap: 6 }}>
                      <div className="row-between">
                        <span className="row" style={{ gap: 8 }}><Target size={16} className="muted" /> <strong>{g.name}</strong></span>
                        <span className="small muted num">{Math.min(pct, 100)} %</span>
                      </div>
                      <Progress percent={pct} tone="goal" />
                      <span className="muted small num"><Money value={g.saved} /> of <Money value={g.targetAmount} /></span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data && data.summary.byCategory.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h2>Top spending</h2>
                <Link to="/reports" className="btn btn-ghost btn-sm">Reports</Link>
              </div>
              <div className="card-body">
                {data.summary.byCategory.slice(0, 5).map((c) => (
                  <div key={c.categoryId} className="row-between" style={{ padding: '6px 0' }}>
                    <span>{c.name}</span>
                    <strong className="num"><Money value={c.amount} /></strong>
                  </div>
                ))}
                <p className="muted small" style={{ marginTop: 8 }}>Transfers between your accounts are not included.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
