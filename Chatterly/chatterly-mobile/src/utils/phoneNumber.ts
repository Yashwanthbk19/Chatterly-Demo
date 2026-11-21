import {COUNTRIES, DEFAULT_COUNTRY} from '../constants/countries';
import type {Country} from '../types/registration';

export type SplitPhoneNumber = {country: Country; local: string};

export function isValidPhoneLength(country: Country, length: number): boolean {
  return country.phoneLengths ? country.phoneLengths.includes(length) : length === country.phoneLength;
}

export function phoneDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Splits a stored number such as "+919876543210" into its country and national
 * digits. The backend stores E.164; a bare national number of the default
 * country's length is accepted as well. Several countries share a dial code
 * ("+1"), so the first country in the list whose length fits wins, which keeps
 * the picker's own default order (India, then the United States).
 */
export function splitPhoneNumber(value: unknown): SplitPhoneNumber | null {
  const raw = String(value ?? '').trim();
  const digits = phoneDigits(raw);
  if (!digits) { return null; }
  if (!raw.startsWith('+') && digits.length === DEFAULT_COUNTRY.phoneLength) {
    return {country: DEFAULT_COUNTRY, local: digits};
  }

  let best: SplitPhoneNumber | null = null;
  let bestFits = false;
  let bestDialLength = 0;
  for (const country of COUNTRIES) {
    const dial = phoneDigits(country.dialCode);
    if (!dial || !digits.startsWith(dial)) { continue; }
    const local = digits.slice(dial.length);
    if (!local) { continue; }
    const fits = isValidPhoneLength(country, local.length);
    const better = !best
      || (fits && !bestFits)
      || (fits === bestFits && dial.length > bestDialLength);
    if (better) {
      best = {country, local};
      bestFits = fits;
      bestDialLength = dial.length;
    }
  }
  return best;
}

export function toE164(country: Country, local: string): string {
  return `${country.dialCode}${phoneDigits(local)}`;
}

/** Whether two numbers are the same line, whatever spacing or "+" they carry. */
export function samePhoneNumber(first: unknown, second: unknown): boolean {
  const a = phoneDigits(first);
  const b = phoneDigits(second);
  return Boolean(a && b && a === b);
}

function groupNational(local: string, dialCode: string): string {
  if (local.length === 10 && dialCode === '+91') { return `${local.slice(0, 5)} ${local.slice(5)}`; }
  if (local.length === 10) { return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`; }
  if (local.length === 9) { return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`; }
  if (local.length === 8) { return `${local.slice(0, 4)} ${local.slice(4)}`; }
  return local.replace(/(\d{3})(?=\d{3,})/g, '$1 ');
}

/** "+91 98765 43210": the dial code apart and the national number grouped. */
export function formatPhoneNumber(value: unknown): string {
  const split = splitPhoneNumber(value);
  if (!split) { return String(value ?? '').trim(); }
  return `${split.country.dialCode} ${groupNational(split.local, split.country.dialCode)}`;
}

/**
 * "+91 98765 •••10" - enough for the owner to recognise their number on a
 * sign-in screen without printing it in full.
 */
export function maskPhoneNumber(value: unknown): string {
  const split = splitPhoneNumber(value);
  if (!split) { return ''; }
  const {country, local} = split;
  if (local.length <= 4) { return `${country.dialCode} ${local}`; }
  const visibleHead = Math.min(5, Math.max(0, local.length - 6));
  return `${country.dialCode} ${local.slice(0, visibleHead)}${'•'.repeat(local.length - visibleHead - 2)}${local.slice(-2)}`;
}
