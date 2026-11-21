import * as SecureStore from 'expo-secure-store';
import {formatAccountDateInput, isValidAccountDate, loadAccountDateOfBirth, normalizeAccountDate, normalizeAccountPhone, saveAccountDateOfBirth} from '../src/services/accountProfile';

test('normalizes phone input according to the existing backend contract', () => {
  expect(normalizeAccountPhone('98765 43210')).toBe('+919876543210');
  expect(normalizeAccountPhone('+91 (98765) 43210')).toBe('+919876543210');
  expect(normalizeAccountPhone('09876543210')).toBe('+919876543210');
  expect(normalizeAccountPhone('123')).toBeNull();
  expect(normalizeAccountPhone('+449876543210')).toBeNull();
});

test('normalizes legacy and ISO dates and allows numeric keyboard entry', () => {
  expect(normalizeAccountDate('1996-06-15T00:00:00.000Z')).toBe('1996-06-15');
  expect(normalizeAccountDate('15/06/1996')).toBe('1996-06-15');
  expect(formatAccountDateInput('19960615')).toBe('1996-06-15');
  expect(formatAccountDateInput('199606')).toBe('1996-06');
  expect(isValidAccountDate('2024-02-29')).toBe(true);
  expect(isValidAccountDate('2023-02-29')).toBe(false);
  expect(isValidAccountDate('2024-04-31')).toBe(false);
  expect(isValidAccountDate('2999-01-01')).toBe(false);
});

test('persists DOB separately per account without relying on an unsupported server field', async () => {
  await SecureStore.deleteItemAsync('chatterly.account-dob.account-2');
  await saveAccountDateOfBirth('account-1', '1996-06-15');
  expect(await loadAccountDateOfBirth('account-1')).toBe('1996-06-15');
  expect(await loadAccountDateOfBirth('account-2')).toBeNull();
});

test('rejects invalid dates and failed storage writes', async () => {
  await expect(saveAccountDateOfBirth('account-1', '2023-02-29')).rejects.toThrow('valid date');
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(saveAccountDateOfBirth('account-1', '1996-06-15')).rejects.toThrow('Storage unavailable');
});
