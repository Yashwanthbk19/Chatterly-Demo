import * as SecureStore from 'expo-secure-store';

export function normalizeAccountPhone(value: string): string | null {
  const clean = value.trim().replace(/[\s().-]/g, '');
  if (/^\d{10}$/.test(clean)) { return `+91${clean}`; }
  if (/^0\d{10}$/.test(clean)) { return `+91${clean.slice(1)}`; }
  return /^\+91\d{10}$/.test(clean) ? clean : null;
}

export function normalizeAccountDate(value: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(value);
  if (iso) { return iso[0]; }
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return local ? `${local[3]}-${local[2]}-${local[1]}` : '';
}

export function formatAccountDateInput(value: string): string {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) { return normalizeAccountDate(value); }
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length <= 4 ? digits : digits.length <= 6
    ? `${digits.slice(0, 4)}-${digits.slice(4)}`
    : `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function isValidAccountDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) { return false; }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return year >= 1900 && date.getFullYear() === year && date.getMonth() === month - 1 &&
    date.getDate() === day && date.getTime() <= Date.now();
}

const dobKey = (userId: string) => `chatterly.account-dob.${userId}`;

// The current backend has no DOB field. Keep this explicitly device-local,
// encrypted, and separate per account until a server DOB API is available.
export async function loadAccountDateOfBirth(userId: string): Promise<string | null> {
  if (!userId) { return null; }
  const value = await SecureStore.getItemAsync(dobKey(userId));
  return value && isValidAccountDate(value) ? value : null;
}

export async function saveAccountDateOfBirth(userId: string, value: string): Promise<void> {
  if (!userId || !isValidAccountDate(value)) { throw new Error('Enter a valid date of birth.'); }
  await SecureStore.setItemAsync(dobKey(userId), value);
}
