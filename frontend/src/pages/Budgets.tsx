// UC-07: monthly budgets for expense categories (BR-14, BR-15), copy from last month (FR-27).

import { useState } from 'react';
import { Copy, Gauge, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type Budget } from '../api';
import { budgetTone, Confirm, Empty, ErrorAlert, Field, Modal, Money, MonthSwitch, Progress, Skeleton, useToast } from '../components/ui';
import { currentMonth, formatMonth } from '../lib/dates';
import { parseAmount, toInputAmount } from '../lib/money';
import { useLoad, useMember } from '../state/session';
import { useRefData } from '../state/refdata';

export function BudgetsPage() {
  const { changed } = useMember();
  const refData = useRefData();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const [removing, setRemoving] = useState<Budget | null>(null);
  const { data, loading } = useLoad(() => api.budgets(month), [month]);

  const budgets = [...(data ?? [])].sort((a, b) => b.percentUsed - a.percentUsed);
  const totalLimit = budgets.reduce((s, b) => s + b.limitAmount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const totalPct = totalLimit ? Math.floor((totalSpent * 100) / totalLimit) : 0;

  async function copy() {
    const n = await api.copyBudgets(month);
    toast(n ? `Copied ${n} budget${n > 1 ? 's' : ''} from last month` : 'Nothing to copy: every budget from last month is already here');
    changed();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Budgets</h1>
          <p>Monthly limits for expense categories. Only expenses count; transfers and refunds do not.</p>
        </div>
        <div className="row wrap">
          <MonthSwitch month={month} onChange={setMonth} />
          <button className="btn" onClick={copy}><Copy size={16} /> Copy last month</button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> Add budget</button>
        </div>
      </div>

      {loading && !data ? (
        <div className="stack"><Skeleton height={90} /><Skeleton height={90} /></div>
      ) : budgets.length === 0 ? (
        <div className="card">
          <Empty icon={<Gauge size={22} />} title={`No budgets for ${formatMonth(month)}`} text="Set a limit for a category. Parents get an alert when spending reaches 80 % and 100 %." action={<div className="row"><button className="btn" onClick={copy}>Copy last month</button><button className="btn btn-primary" onClick={() => setEditing('new')}>Add budget</button></div>} />
        </div>
      ) : (
        <>
          <div className="card card-pad stack" style={{ marginBottom: 16 }}>
            <div className="row-between wrap">
              <div>
                <div className="muted small">Spent of all budgets</div>
                <div className="stat-value num"><Money value={totalSpent} /> <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>of <Money value={totalLimit} /></span></div>
              </div>
              <span className={`badge ${totalPct >= 100 ? 'bad' : totalPct >= 80 ? 'warn' : 'ok'}`}>{totalPct} % used</span>
            </div>
            <Progress percent={totalPct} tone={budgetTone(totalPct)} large />
          </div>

          <div className="grid grid-2">
            {budgets.map((b) => {
              const tone = budgetTone(b.percentUsed);
              return (
                <div key={b.budgetId} className="card card-pad stack" style={{ gap: 10 }}>
                  <div className="row-between">
                    <h3>{refData.categoryName(b.categoryId)}</h3>
                    <div className="row" style={{ gap: 2 }}>
                      <button className="icon-btn" style={{ width: 32, height: 32, border: 0 }} onClick={() => setEditing(b)} aria-label="Edit budget"><Pencil size={15} /></button>
                      <button className="icon-btn" style={{ width: 32, height: 32, border: 0 }} onClick={() => setRemoving(b)} aria-label="Remove budget"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <Progress percent={b.percentUsed} tone={tone} large />
                  <div className="row-between small">
                    <span className="num"><strong><Money value={b.spent} /></strong> <span className="muted">of <Money value={b.limitAmount} /></span></span>
                    <span className={`num ${tone === 'bad' ? 'error-text' : 'muted'}`}>
                      {b.remaining >= 0 ? <>Left <Money value={b.remaining} /></> : <>Over by <Money value={-b.remaining} /></>}
                    </span>
                  </div>
                  <span className={`badge ${tone || 'ok'}`} style={{ alignSelf: 'flex-start' }}>
                    {b.percentUsed >= 100 ? 'Budget exceeded' : b.percentUsed >= 80 ? `${b.percentUsed} % · close to the limit` : `${b.percentUsed} % used`}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {editing && <BudgetForm month={month} budget={editing === 'new' ? undefined : editing} existing={budgets} onClose={() => setEditing(null)} />}
      {removing && (
        <Confirm
          title="Remove budget?"
          text={`The ${refData.categoryName(removing.categoryId)} limit for ${formatMonth(month)} is removed. Transactions are not changed.`}
          confirmLabel="Remove"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await api.deleteBudget(removing.budgetId);
            changed();
          }}
        />
      )}
    </>
  );
}

function BudgetForm({ month, budget, existing, onClose }: { month: string; budget?: Budget; existing: Budget[]; onClose: () => void }) {
  const { changed } = useMember();
  const refData = useRefData();
  const toast = useToast();
  const expenseCats = refData.categories.filter((c) => c.type === 'EXPENSE' && !c.parentId && !c.isArchived); // BR-14
  const [categoryId, setCategoryId] = useState<number | ''>(budget?.categoryId ?? '');
  const [limit, setLimit] = useState(budget ? toInputAmount(budget.limitAmount) : '');
  const [error, setError] = useState<string | null>(null);
  const already = existing.find((b) => b.categoryId === categoryId && b.budgetId !== budget?.budgetId);

  async function save() {
    setError(null);
    if (categoryId === '') return setError('Choose an expense category');
    const l = parseAmount(limit);
    if (!l.ok) return setError(l.error === 'Amount must be greater than 0' ? 'Limit must be greater than 0' : l.error);
    try {
      await api.saveBudget(categoryId, month, l.value);
      toast('Budget saved');
      changed();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal title={budget ? 'Edit budget' : `Budget for ${formatMonth(month)}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <Field label="Expense category">
        <select className="select" value={categoryId} disabled={!!budget} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Choose a category</option>
          {expenseCats.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
        </select>
      </Field>
      {already && !budget && <div className="alert alert-info">This category already has a budget this month. Saving changes its limit.</div>}
      <Field label="Monthly limit">
        <div className="input-wrap">
          <input className="input" inputMode="decimal" autoFocus value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="60000" onKeyDown={(e) => e.key === 'Enter' && save()} />
          <span className="suffix">₸</span>
        </div>
      </Field>
      <ErrorAlert message={error} />
    </Modal>
  );
}
