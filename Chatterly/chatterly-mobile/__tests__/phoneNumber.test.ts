import {formatPhoneNumber, maskPhoneNumber, samePhoneNumber, splitPhoneNumber, toE164} from '../src/utils/phoneNumber';

test('splits a stored number into its country and national digits', () => {
  const india = splitPhoneNumber('+919876543210');
  expect(india?.country.code).toBe('IN');
  expect(india?.local).toBe('9876543210');

  // +1 is shared; the list order (United States before Canada) decides.
  expect(splitPhoneNumber('+12025550123')?.country.code).toBe('US');
  expect(splitPhoneNumber('+6591234567')?.country.code).toBe('SG');
  expect(splitPhoneNumber('+447911123456')?.country.code).toBe('GB');
});

test('a bare national number of the default length is read as the default country', () => {
  expect(splitPhoneNumber('9876543210')?.country.code).toBe('IN');
  expect(splitPhoneNumber('')).toBeNull();
  expect(splitPhoneNumber(undefined)).toBeNull();
});

test('formats numbers for display and builds E.164 again', () => {
  expect(formatPhoneNumber('+919876543210')).toBe('+91 98765 43210');
  expect(formatPhoneNumber('+12025550123')).toBe('+1 202 555 0123');
  expect(formatPhoneNumber('+6591234567')).toBe('+65 9123 4567');
  const india = splitPhoneNumber('+919876543210')!;
  expect(toE164(india.country, '98765 43210')).toBe('+919876543210');
});

test('compares numbers whatever their formatting, and masks for sign-in screens', () => {
  expect(samePhoneNumber('+91 98765 43210', '+919876543210')).toBe(true);
  expect(samePhoneNumber('+919876543210', '+919876543211')).toBe(false);
  expect(samePhoneNumber('', '')).toBe(false);
  expect(maskPhoneNumber('+919876543210')).toBe('+91 9876••••10');
});
