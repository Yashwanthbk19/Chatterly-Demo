export type VCardContact = {
  name: string;
  phoneNumbers: string[];
  emailAddresses: string[];
};

function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Creates an importable vCard 3.0 document for Android and iOS contacts apps. */
export function createVCard(contact: VCardContact): string {
  const name = escapeVCardValue(contact.name.trim() || 'Unnamed contact');
  const phones = [...new Set(contact.phoneNumbers.map(value => value.trim()).filter(Boolean))];
  const emails = [...new Set(contact.emailAddresses.map(value => value.trim()).filter(Boolean))];
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `N:;${name};;;`,
    ...phones.map(value => `TEL;TYPE=CELL:${escapeVCardValue(value)}`),
    ...emails.map(value => `EMAIL;TYPE=INTERNET:${escapeVCardValue(value)}`),
    'END:VCARD',
    '',
  ].join('\r\n');
}

export function vCardFileName(name: string): string {
  const safeName = name.trim().replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '');
  return `${safeName || 'contact'}.vcf`;
}
