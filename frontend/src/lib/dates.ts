// Dates are plain "YYYY-MM-DD" strings (transaction_date is a SQL `date`).

const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toIsoDate(new Date());
}

/** "2026-11" for a date string or Date. */
export function monthKey(date: string | Date): string {
  const iso = typeof date === 'string' ? date : toIsoDate(date);
  return iso.slice(0, 7);
}

export function currentMonth(): string {
  return monthKey(new Date());
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = today();
  if (iso === t) return 'Today';
  const yesterday = toIsoDate(new Date(Date.now() - 86_400_000));
  if (iso === yesterday) return 'Yesterday';
  const sameYear = y === new Date().getFullYear();
  return sameYear ? `${d} ${SHORT[m - 1]}` : `${d} ${SHORT[m - 1]} ${y}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toIsoDate(new Date(y, m - 1, d + days));
}

/** Day `day` of the current month, but never later than today (seed data must obey BR-09). */
export function dayOfThisMonth(day: number): string {
  const now = new Date();
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), Math.min(day, now.getDate())));
}

export function dayOfMonth(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${pad(Math.min(day, last))}`;
}
