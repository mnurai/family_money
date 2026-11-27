// Owner-only, read-only: what the Telegram bot did for the family (transfers, sign-ins, balance
// checks, alerts). Data comes from the bot's bridge, see src/api/telegramFeed.ts.

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { fetchTelegramActivity, type TelegramEvent } from '../api/telegramFeed';
import { Empty, ErrorAlert, Skeleton } from '../components/ui';
import { useMember } from '../state/session';

const KIND: Record<string, { label: string; tone: string }> = {
  TRANSFER: { label: 'transfer', tone: 'ok' },
  TRANSFER_FAILED: { label: 'transfer refused', tone: 'bad' },
  AUTHORIZE: { label: 'signed in', tone: 'ok' },
  SIGN_OUT: { label: 'signed out', tone: 'warn' },
  BALANCE: { label: 'balance check', tone: '' },
  INFO: { label: 'members', tone: '' },
  ALERT_BIG: { label: 'big transaction alert', tone: 'warn' },
  ALERT_LOW: { label: 'low balance alert', tone: 'warn' },
};

export function TelegramPage() {
  const { family } = useMember();
  const [events, setEvents] = useState<TelegramEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchTelegramActivity(family.familyId)
        .then((rows) => {
          if (!alive) return;
          setEvents(rows);
          setError(null);
        })
        .catch((e: Error) => {
          if (alive) setError(e.message);
        });
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [family.familyId]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Telegram bot</h1>
          <p>What the bot did for your family: transfers, sign-ins, balance checks and alerts. Updates every 5 seconds.</p>
        </div>
      </div>
      <ErrorAlert message={error} />
      <div className="card" style={{ overflowX: 'auto' }}>
        {!events ? (
          <div className="card-body stack"><Skeleton /><Skeleton /><Skeleton /></div>
        ) : events.length === 0 ? (
          <Empty icon={<Send size={22} />} title="No bot activity yet" text="Open the bot in Telegram and press a button." />
        ) : (
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>What</th></tr></thead>
            <tbody>
              {events.map((e) => {
                const kind = KIND[e.kind] ?? { label: e.kind.toLowerCase(), tone: '' };
                return (
                  <tr key={e.id}>
                    <td className="num muted" style={{ whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{e.actorName}</td>
                    <td><span className={`badge ${kind.tone}`}>{kind.label}</span></td>
                    <td>{e.summary}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
