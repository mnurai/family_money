// What the Telegram bot did, read from the bot's bridge (bot/web.py).
// This is separate from demoApi.ts: the website's own data still lives in the browser until the
// real backend exists, and the bot works on the database. The bridge is the link between them.

export interface TelegramEvent {
  id: number;
  createdAt: string;
  actorName: string;
  role: 'OWNER' | 'ADULT' | 'CHILD' | null;
  kind: string;
  summary: string;
  transactionId: number | null;
}

const BASE = (import.meta.env.VITE_BOT_API_URL as string | undefined) ?? 'http://127.0.0.1:8001';
// Demo-grade: a key in browser code is visible to anyone who opens the site (see bot/web.py).
const KEY = (import.meta.env.VITE_BOT_API_KEY as string | undefined) ?? '';

export async function fetchTelegramActivity(familyId: number): Promise<TelegramEvent[]> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/telegram/activity?family_id=${familyId}&limit=100`, { headers: { 'X-API-Key': KEY } });
  } catch {
    throw new Error(`Cannot reach the bot service at ${BASE}. Start it: uvicorn bot.web:app --port 8001`);
  }
  if (res.status === 401) throw new Error('The bot service refused the key. Check VITE_BOT_API_KEY and BOT_API_KEY match.');
  if (res.status === 503) throw new Error('BOT_API_KEY is not set for the bot service (.env).');
  if (!res.ok) throw new Error(`The bot service answered ${res.status}.`);
  return (await res.json()) as TelegramEvent[];
}
