import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const chatPageSource = readSource('../src/pages/ChatListPage.jsx');
const profilePageSource = readSource('../src/pages/ProfilePage.jsx');

const sourceSection = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
};

test('the Document attachment option accepts and validates only document extensions', () => {
  const documentAccept = sourceSection(
    chatPageSource,
    'const DOCUMENT_ATTACHMENT_ACCEPT = [',
    'const DOCUMENT_PICKER_ATTACHMENT_EXTENSIONS ='
  );
  const documentPickerExtensions = sourceSection(
    chatPageSource,
    'const DOCUMENT_PICKER_ATTACHMENT_EXTENSIONS = new Set([',
    'const DOCUMENT_ATTACHMENT_EXTENSIONS ='
  );
  const attachmentValidation = sourceSection(
    chatPageSource,
    "      if (effectiveType === 'file') {",
    '      const uploadFile ='
  );

  assert.match(documentAccept, /'\.pdf'/);
  assert.match(documentAccept, /'\.docx'/);
  assert.doesNotMatch(documentAccept, /image\/|video\/|'\.png'|'\.jpg'|'\.mp4'/);
  assert.doesNotMatch(documentPickerExtensions, /'png'|'jpg'|'gif'|'mp4'|'webm'/);
  assert.match(attachmentValidation, /DOCUMENT_PICKER_ATTACHMENT_EXTENSIONS\.has\(fileExtension\)/);
});

test('the profile country menu shows each flag together with its country name and code', () => {
  const phoneCountryControl = sourceSection(
    profilePageSource,
    '<div ref={countryMenuRef}',
    '<input\n                        type="tel"'
  );

  assert.match(phoneCountryControl, /role="listbox"/);
  assert.match(phoneCountryControl, /role="option"/);
  assert.match(phoneCountryControl, /src=\{item\.flagSrc\}/);
  assert.match(phoneCountryControl, /\{item\.name\}/);
  assert.match(phoneCountryControl, /\{item\.code\}/);
  assert.doesNotMatch(phoneCountryControl, /<select/);
});

test('date-of-birth day and month placeholders have enough fixed width to remain visible', () => {
  const dateSegments = sourceSection(
    profilePageSource,
    'const DATE_OF_BIRTH_SEGMENTS = [',
    'const EMPTY_DATE_OF_BIRTH_PARTS ='
  );

  assert.match(dateSegments, /placeholder: 'DD'.*widthClassName: 'w-\[24px\]'/);
  assert.match(dateSegments, /placeholder: 'MM'.*widthClassName: 'w-\[28px\]'/);
  assert.doesNotMatch(dateSegments, /w-\[2ch\]/);
});
