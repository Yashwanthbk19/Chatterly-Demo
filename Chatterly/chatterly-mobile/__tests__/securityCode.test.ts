import {
  SECURITY_CODE_LENGTH,
  formatSecurityCode,
  formatSecurityCodeUpdatedAt,
  securityCodeForClipboard,
  securityCodeRows,
} from '../src/utils/securityCode';

/**
 * The web client's formatter, copied verbatim from
 * chatterly-web/frontend/src/pages/ChatListPage.jsx. Two people comparing a
 * code across platforms have to read the same digits, so the mobile transform
 * is checked against the browser's rather than only against itself.
 */
const webFormatSecurityCode = (value: unknown): string => {
  const compactCode = String(value || '').replace(/[^a-fA-F0-9]/g, '');
  if (!compactCode) { return ''; }
  if (/^\d{36}$/.test(compactCode)) { return compactCode; }
  try {
    return BigInt(`0x${compactCode}`).toString(10).padStart(36, '0').slice(-36);
  } catch {
    return compactCode.padStart(36, '0').slice(-36);
  }
};

test('a server code becomes the 36 digits the design shows', () => {
  const code = formatSecurityCode('A1B2-C3D4-E5F6-0718-2939-4A5B');
  expect(code).toHaveLength(SECURITY_CODE_LENGTH);
  expect(/^\d+$/.test(code)).toBe(true);
});

test('the digits match the web client exactly, so a cross-platform compare works', () => {
  const samples = [
    'A1B2-C3D4-E5F6-0718-2939-4A5B',
    '000000000000000000000001',
    'FFFFFFFFFFFFFFFFFFFFFFFF',
    '8e3a91c7d0524fb6a1e9c30d',
    '0f',
    'DEADBEEF',
  ];
  for (const sample of samples) {
    expect(formatSecurityCode(sample)).toBe(webFormatSecurityCode(sample));
  }
});

test('separators and case in the server response do not change the digits', () => {
  const dashed = formatSecurityCode('A1B2-C3D4-E5F6-0718-2939-4A5B');
  expect(formatSecurityCode('a1b2c3d4e5f607182939 4a5b')).toBe(dashed);
  expect(formatSecurityCode('  A1B2C3D4E5F607182939.4A5B  ')).toBe(dashed);
});

test('a server that already answers in digits is passed straight through', () => {
  const digits = '915362544528543415782204284512340708';
  expect(digits).toHaveLength(SECURITY_CODE_LENGTH);
  expect(formatSecurityCode(digits)).toBe(digits);
});

test('nothing usable produces nothing, rather than a misleading block of zeros', () => {
  expect(formatSecurityCode('')).toBe('');
  expect(formatSecurityCode(null)).toBe('');
  expect(formatSecurityCode(undefined)).toBe('');
  expect(formatSecurityCode('----')).toBe('');
});

test('the code lays out as three rows of three four-digit groups', () => {
  const rows = securityCodeRows('915362544528543415782204284512340708');
  expect(rows).toHaveLength(3);
  expect(rows[0]).toEqual(['9153', '6254', '4528']);
  expect(rows[2]).toEqual(['2845', '1234', '0708']);
  // Every digit is rendered, nothing is dropped by the grouping.
  expect(rows.flat().join('')).toHaveLength(SECURITY_CODE_LENGTH);
});

test('an unexpected length still renders every digit', () => {
  const rows = securityCodeRows('12345');
  expect(rows.flat()).toEqual(['1234', '5']);
});

test('the copied code keeps the groups so it can be read aloud', () => {
  expect(securityCodeForClipboard('915362544528')).toBe('9153 6254 4528');
  expect(securityCodeForClipboard('')).toBe('');
});

test('the timestamp says Today for a code computed in this session', () => {
  const now = new Date();
  expect(formatSecurityCodeUpdatedAt(now)).toMatch(/^Today, /);

  const yesterday = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  expect(formatSecurityCodeUpdatedAt(yesterday)).not.toMatch(/^Today, /);

  expect(formatSecurityCodeUpdatedAt('not-a-date')).toBe('');
});
