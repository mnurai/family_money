import type { Transaction } from '../api';
import { formatMoney } from '../lib/money';
import type { useRefData } from '../state/refdata';
import { TypeIcon } from './ui';

type Ref = ReturnType<typeof useRefData>;

/** Line shown for one transaction. A transfer shows its direction, never a minus (BR-02, BR-12). */
export function TxRow({ tx, refData, onClick, showMember = true }: { tx: Transaction; refData: Ref; onClick?: () => void; showMember?: boolean }) {
  const { accountName, categoryName, memberName } = refData;
  const title =
    tx.type === 'TRANSFER'
      ? `${accountName(tx.sourceAccountId)} → ${accountName(tx.destinationAccountId)}`
      : tx.description || categoryName(tx.categoryId);
  const parts =
    tx.type === 'TRANSFER'
      ? ['Transfer', tx.description]
      : [categoryName(tx.categoryId), tx.type === 'INCOME' ? accountName(tx.destinationAccountId) : accountName(tx.sourceAccountId)];
  if (showMember) parts.push(memberName(tx.createdBy).split(' ')[0]);
  const sign = tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '−' : '';

  return (
    <div className={`list-item ${onClick ? 'clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={(e) => onClick && e.key === 'Enter' && onClick()}>
      <TypeIcon type={tx.type} />
      <div className="grow">
        <div className="title">{title}</div>
        <div className="sub">{parts.filter(Boolean).join(' · ')}</div>
      </div>
      <span className={`amt num t-${tx.type}`}>
        {sign}
        {formatMoney(tx.amount)}
      </span>
    </div>
  );
}
