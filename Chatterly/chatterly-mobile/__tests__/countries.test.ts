import {COUNTRIES, DEFAULT_COUNTRY} from '../src/constants/countries';
import {isValidPhoneLength, splitPhoneNumber, toE164} from '../src/utils/phoneNumber';
import {validateRegistration} from '../src/utils/registrationValidation';

// Missing geographic regions from Google's libphonenumber metadata.
const ADDED_REGIONS = [
  ['AC', '+247'], ['BL', '+590'], ['BQ', '+599'], ['EH', '+212'],
  ['FK', '+500'], ['GF', '+594'], ['GP', '+590'], ['MF', '+590'],
  ['MQ', '+596'], ['MS', '+1'], ['NF', '+672'], ['NU', '+683'],
  ['PM', '+508'], ['RE', '+262'], ['SH', '+290'], ['SJ', '+47'],
  ['SX', '+1'], ['TA', '+290'], ['TC', '+1'], ['TK', '+690'],
  ['VG', '+1'], ['VI', '+1'], ['WF', '+681'], ['XK', '+383'], ['YT', '+262'],
];

test('contains all 245 geographic calling regions plus the existing Antarctica entry', () => {
  expect(COUNTRIES).toHaveLength(246);
  expect(new Set(COUNTRIES.map(country => country.code)).size).toBe(246);
  for (const country of COUNTRIES) {
    expect(country.code).toMatch(/^[A-Z]{2}$/);
    expect(country.dialCode).toMatch(/^\+[1-9]\d{0,2}$/);
    expect(country.name).toBeTruthy();
    expect(Array.from(country.flag)).toHaveLength(2);
    expect(isValidPhoneLength(country, country.phoneLength)).toBe(true);
    expect(country.dialCode.length - 1 + country.phoneLength).toBeLessThanOrEqual(15);
  }
});

test.each(ADDED_REGIONS)('includes %s with calling code %s', (code, dialCode) => {
  expect(COUNTRIES.find(country => country.code === code)?.dialCode).toBe(dialCode);
});

test('preserves the default country and the existing shared-code preference', () => {
  expect(DEFAULT_COUNTRY.code).toBe('IN');
  expect(COUNTRIES.slice(0, 6).map(country => country.code)).toEqual(['IN', 'US', 'GB', 'AU', 'SG', 'CA']);
  expect(splitPhoneNumber('+12025550123')?.country.code).toBe('US');
  expect(splitPhoneNumber('+447911123456')?.country.code).toBe('GB');
});

test.each([
  ['XK', '43201234', '+38343201234'],
  ['NU', '8884012', '+6838884012'],
  ['NU', '4012', '+6834012'],
  ['PM', '551234', '+508551234'],
  ['PM', '709551234', '+508709551234'],
  ['TK', '7290', '+6907290'],
  ['TK', '72901', '+69072901'],
  ['TK', '729012', '+690729012'],
  ['TK', '7290123', '+6907290123'],
  ['TA', '8123', '+2908123'],
])('accepts a national number for %s and preserves it through E.164 conversion', (code, local, full) => {
  const country = COUNTRIES.find(option => option.code === code)!;
  expect(validateRegistration('phone', local, country)).toEqual({});
  expect(local.length).toBeLessThanOrEqual(country.phoneLength);
  expect(toE164(country, local)).toBe(full);
  expect(splitPhoneNumber(full)?.country.code).toBe(code);
  expect(splitPhoneNumber(full)?.local).toBe(local);
});

test('rejects unsupported lengths in newly added variable-length regions', () => {
  const niue = COUNTRIES.find(country => country.code === 'NU')!;
  expect(validateRegistration('phone', '12345', niue).phone).toBeDefined();
  expect(validateRegistration('phone', '12345678', niue).phone).toBeDefined();
  expect(validateRegistration('phone', '1234567890', DEFAULT_COUNTRY)).toEqual({});
});
