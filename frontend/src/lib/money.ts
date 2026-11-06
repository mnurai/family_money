// Money is kept as an integer number of tiyn (1 ₸ = 100 tiyn), never as a float (NFR-08).
// The backend uses Decimal / numeric(14,2); the UI only parses, sums and formats.

export type Tiyn = number;

export const MAX_AMOUNT: Tiyn = 99_999_999_999_999; // 999 999 999 999.99 ₸ (BR-02)

export type ParseResult = { ok: true; value: Tiyn } | { ok: false; error: string };

/**
 * Parse what the user typed into an amount (BR-02).
 * Accepts "12500", "12 500", "12500.5", "12 500,50". Error texts follow NFR-15
 * and match app/services/transactions.py.
 */
export function parseAmount(input: string): ParseResult {
  const cleaned = input.replace(/[\s  ]/g, '').replace(',', '.');
  if (cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, error: 'Amount must be greater than 0' };
  }
  const [whole, frac = ''] = cleaned.split('.');
  if (frac.length > 2) return { ok: false, error: 'Amount can have at most 2 decimal places' };
  const wholeTrimmed = whole.replace(/^0+(?=\d)/, '');
  if (wholeTrimmed.length > 12) return { ok: false, error: 'Amount is too large' };
  const value = Number(wholeTrimmed) * 100 + Number(frac.padEnd(2, '0'));
  if (value <= 0) return { ok: false, error: 'Amount must be greater than 0' };
  if (value > MAX_AMOUNT) return { ok: false, error: 'Amount is too large' };
  return { ok: true, value };
}

/** Same rule as parseAmount, but for amounts that may be 0 or negative (opening balance of a credit card). */
export function parseSignedAmount(input: string): ParseResult {
  const trimmed = input.trim();
  const negative = trimmed.startsWith('-') || trimmed.startsWith('−');
  const body = negative ? trimmed.slice(1) : trimmed;
  if (/^0+([.,]0{0,2})?$/.test(body.replace(/[\s ]/g, ''))) return { ok: true, value: 0 };
  const parsed = parseAmount(body);
  if (!parsed.ok) return parsed;
  return { ok: true, value: negative ? -parsed.value : parsed.value };
}

const NBSP = ' ';

/**
 * Format as "125 000 ₸", or "125 000,50 ₸" when there are tiyn (NFR-20).
 * Same format as format_money() in the backend, so messages match.
 */
export function formatMoney(value: Tiyn, opts: { sign?: boolean } = {}): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const body = cents === 0 ? grouped : `${grouped},${String(cents).padStart(2, '0')}`;
  const prefix = negative ? '−' : opts.sign && value > 0 ? '+' : '';
  return `${prefix}${body}${NBSP}₸`;
}

/** Value to prefill an amount input when editing. */
export function toInputAmount(value: Tiyn): string {
  const whole = Math.floor(Math.abs(value) / 100);
  const cents = Math.abs(value) % 100;
  const sign = value < 0 ? '-' : '';
  return cents === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(cents).padStart(2, '0')}`;
}

/** Plain decimal string for CSV export ("125000.50"). */
export function toDecimalString(value: Tiyn): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
