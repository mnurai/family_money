// FR-38: the owner sees the family's audit log. It is append-only (BR-27): no edit or delete here.

import { History } from 'lucide-react';
import { api } from '../api';
import { Empty, Skeleton } from '../components/ui';
import { useLoad } from '../state/session';

const ACTION_CLASS = { CREATE: 'ok', UPDATE: 'warn', DELETE: 'bad', BLOCK: 'bad', UNBLOCK: 'ok' } as const;

export function AuditPage() {
  const { data } = useLoad(() => api.auditLog());
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Every change to accounts, transactions, budgets and members. Entries cannot be edited or deleted.</p>
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {!data ? (
          <div className="card-body stack"><Skeleton /><Skeleton /><Skeleton /></div>
        ) : data.length === 0 ? (
          <Empty icon={<History size={22} />} title="No entries yet" />
        ) : (
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>What</th></tr></thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.logId}>
                  <td className="num muted" style={{ whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.actorName}</td>
                  <td><span className={`badge ${ACTION_CLASS[e.action]}`}>{e.action.toLowerCase()}</span> <span className="muted small">{e.entityType.toLowerCase().replace('_', ' ')}</span></td>
                  <td>{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
