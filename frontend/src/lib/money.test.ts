import { describe, expect, it } from 'vitest';
import { formatMoney, parseAmount, parseSignedAmount, toDecimalString } from './money';

const nb = (s: string) => s.replace(/ /g, ' ');

describe('parseAmount (BR-02)', () => {
  it('accepts spaces, comma or dot and keeps whole tiyn', () => {
    expect(parseAmount('12 500,50')).toEqual({ ok: true, value: 1_250_050 });
    expect(parseAmount('0.1')).toEqual({ ok: true, value: 10 });
    expect(parseAmount('350000')).toEqual({ ok: true, value: 35_000_000 });
  });
  it('rejects zero, negative and text with the use case message', () => {
    for (const v of ['0', '-5', 'abc', '', '0,00']) expect(parseAmount(v)).toEqual({ ok: false, error: 'Amount must be greater than 0' });
  });
  it('rejects more than 2 decimals and too large amounts', () => {
    expect(parseAmount('1.005')).toEqual({ ok: false, error: 'Amount can have at most 2 decimal places' });
    expect(parseAmount('1000000000000')).toEqual({ ok: false, error: 'Amount is too large' });
    expect(parseAmount('999999999999.99')).toEqual({ ok: true, value: 99_999_999_999_999 });
  });
  it('opening balance may be 0 or negative', () => {
    expect(parseSignedAmount('0')).toEqual({ ok: true, value: 0 });
    expect(parseSignedAmount('-1500')).toEqual({ ok: true, value: -150_000 });
  });
});

describe('formatMoney (NFR-20)', () => {
  it('groups thousands and adds ₸ like the backend', () => {
    expect(formatMoney(12_500_000)).toBe(nb('125 000 ₸'));
    expect(formatMoney(12_500_050)).toBe(nb('125 000,50 ₸'));
    expect(formatMoney(-500_000)).toBe(nb('−5 000 ₸'));
    expect(formatMoney(100, { sign: true })).toBe(nb('+1 ₸'));
  });
  it('writes plain decimals for CSV', () => {
    expect(toDecimalString(1_250_050)).toBe('12500.50');
    expect(toDecimalString(-5)).toBe('-0.05');
  });
});
