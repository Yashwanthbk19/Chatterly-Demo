import {createVCard, vCardFileName} from '../src/utils/vcard';

test('creates an importable vCard containing every phone number and email', () => {
  const card = createVCard({
    name: 'Ada, Lovelace',
    phoneNumbers: ['+44 20 1234', '+44 20 5678'],
    emailAddresses: ['ada@example.com', 'work@example.com'],
  });

  expect(card).toContain('BEGIN:VCARD\r\nVERSION:3.0\r\n');
  expect(card).toContain('FN:Ada\\, Lovelace');
  expect(card.match(/TEL;TYPE=CELL:/g)).toHaveLength(2);
  expect(card.match(/EMAIL;TYPE=INTERNET:/g)).toHaveLength(2);
  expect(card.endsWith('END:VCARD\r\n')).toBe(true);
  expect(vCardFileName('Ada Lovelace')).toBe('Ada_Lovelace.vcf');
});
