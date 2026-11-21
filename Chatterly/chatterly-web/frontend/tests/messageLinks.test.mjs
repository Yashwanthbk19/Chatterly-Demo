import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractLinksFromMessage,
  findLinksInText,
  normalizeMessageData,
  splitMessageTextWithLinks,
} from '../src/utils/message.js';

const linksIn = (text) => findLinksInText(text).map((link) => [link.value, link.href]);

test('web addresses with a scheme stay links, with or without a path, query or fragment', () => {
  assert.deepEqual(linksIn('https://www.example.com/page?x=1&y=2#top'), [
    ['https://www.example.com/page?x=1&y=2#top', 'https://www.example.com/page?x=1&y=2#top'],
  ]);
  assert.deepEqual(linksIn('http://localhost:3000/dashboard'), [
    ['http://localhost:3000/dashboard', 'http://localhost:3000/dashboard'],
  ]);
  assert.deepEqual(linksIn('HTTPS://EXAMPLE.NET/UPPER'), [
    ['HTTPS://EXAMPLE.NET/UPPER', 'HTTPS://EXAMPLE.NET/UPPER'],
  ]);
});

test('addresses typed without a scheme become links that open over https', () => {
  assert.deepEqual(linksIn('www.google.com'), [['www.google.com', 'https://www.google.com']]);
  assert.deepEqual(linksIn('google.com/search?q=chatterly'), [
    ['google.com/search?q=chatterly', 'https://google.com/search?q=chatterly'],
  ]);
  assert.deepEqual(linksIn('chatterly.stacklycloud.com'), [
    ['chatterly.stacklycloud.com', 'https://chatterly.stacklycloud.com'],
  ]);
  assert.deepEqual(linksIn('a.b.co.in/x'), [['a.b.co.in/x', 'https://a.b.co.in/x']]);
});

test('sentence punctuation and unmatched brackets are not part of the link', () => {
  assert.deepEqual(linksIn('Visit https://stackly.com/about. Thanks'), [
    ['https://stackly.com/about', 'https://stackly.com/about'],
  ]);
  assert.deepEqual(linksIn('See (https://example.org/docs) for details'), [
    ['https://example.org/docs', 'https://example.org/docs'],
  ]);
  assert.deepEqual(linksIn('go to google.com.'), [['google.com', 'https://google.com']]);
  assert.deepEqual(linksIn('"https://x.com" quoted'), [['https://x.com', 'https://x.com']]);
});

test('a bracket the address itself opened stays in the link', () => {
  assert.deepEqual(linksIn('https://en.wikipedia.org/wiki/Chat_(disambiguation)'), [
    [
      'https://en.wikipedia.org/wiki/Chat_(disambiguation)',
      'https://en.wikipedia.org/wiki/Chat_(disambiguation)',
    ],
  ]);
  assert.deepEqual(linksIn('https://example.com/a_(b)_c, then more'), [
    ['https://example.com/a_(b)_c', 'https://example.com/a_(b)_c'],
  ]);
});

test('a bare address wrapped in brackets or quotes is still a link', () => {
  assert.deepEqual(linksIn('(www.google.com) and (google.com)'), [
    ['www.google.com', 'https://www.google.com'],
    ['google.com', 'https://google.com'],
  ]);
  assert.deepEqual(linksIn('"stackly.in" or link:https://x.com/a b.'), [
    ['stackly.in', 'https://stackly.in'],
    ['https://x.com/a', 'https://x.com/a'],
  ]);
});

test('a long unbroken or heavily dotted string is scanned in linear time', () => {
  const startedAt = performance.now();
  assert.deepEqual(findLinksInText('x'.repeat(50000)), []);
  assert.deepEqual(findLinksInText('a.'.repeat(20000)), []);
  assert.deepEqual(findLinksInText(`${'x'.repeat(50)}.`.repeat(1000)), []);
  assert.equal(findLinksInText('see https://a.com/x and www.b.org and c.io '.repeat(2000)).length, 6000);
  assert.ok(performance.now() - startedAt < 500, `took ${Math.round(performance.now() - startedAt)} ms`);
});

test('file names, versions, dates, abbreviations and e-mail addresses are not links', () => {
  assert.deepEqual(linksIn('report.pdf'), []);
  assert.deepEqual(linksIn('mail me at someone@example.com or v1.2.3 and file.txt'), []);
  assert.deepEqual(linksIn('Version 3.5 released on 12.10.2026 at 10.30 pm'), []);
  assert.deepEqual(linksIn('e.g. this, i.e. that'), []);
});

test('text around the links is kept in order', () => {
  assert.deepEqual(splitMessageTextWithLinks('Open www.site.com now, then https://b.org/x.'), [
    { type: 'text', value: 'Open ' },
    { type: 'link', value: 'www.site.com', href: 'https://www.site.com' },
    { type: 'text', value: ' now, then ' },
    { type: 'link', value: 'https://b.org/x', href: 'https://b.org/x' },
    { type: 'text', value: '.' },
  ]);
  assert.deepEqual(splitMessageTextWithLinks('no links here'), [{ type: 'text', value: 'no links here' }]);
  assert.deepEqual(splitMessageTextWithLinks(''), []);
});

test('the shared-links list uses the same detection and skips the message\'s own attachment', () => {
  assert.deepEqual(
    extractLinksFromMessage({
      content: 'docs at www.site.com/guide and https://b.org/x.',
      caption: 'again www.site.com/guide',
      mediaUrl: 'https://b.org/x',
    }),
    ['https://www.site.com/guide']
  );
});

const buildMessage = (extra) =>
  normalizeMessageData(
    { id: 'm1', chatId: 'c1', senderId: 'u1', createdAt: '2026-10-26T10:00:00.000Z', ...extra },
    { currentUserId: 'u2' }
  );

test('typed text that looks like a file or a link to a file stays a text message', () => {
  [
    'https://example.com/files/report.pdf',
    'https://example.com/img/photo.jpg',
    'https://example.com/clip.mp4',
    'https://example.com/archive.zip',
    'see the budget.xlsx',
    'file.txt',
  ].forEach((content) => {
    const message = buildMessage({ type: 'text', messageType: 'text', content });
    assert.equal(message.type, 'text', content);
    assert.equal(message.fileName || '', '', content);
    assert.equal(message.mimeType || '', '', content);
  });
});

test('a message that carries a real attachment is still a document, photo or voice note', () => {
  const file = buildMessage({
    type: 'file',
    messageType: 'file',
    mediaUrl: 'https://bucket.s3.amazonaws.com/x/report.pdf',
    fileName: 'report.pdf',
    content: '',
  });
  assert.equal(file.type, 'file');
  assert.equal(file.mimeType, 'application/pdf');
  assert.equal(file.fileName, 'report.pdf');

  const image = buildMessage({
    type: 'image',
    messageType: 'image',
    mediaUrl: 'https://bucket.s3.amazonaws.com/x/p.jpg',
    content: '',
  });
  assert.equal(image.type, 'image');

  const voiceNote = buildMessage({
    type: 'text',
    messageType: 'text',
    content: 'data:audio/webm;base64,AAAA',
  });
  assert.equal(voiceNote.type, 'audio');
});

test('a record with no stated type keeps inferring media from a bare media address', () => {
  assert.equal(buildMessage({ content: 'https://bucket.s3.amazonaws.com/x/old.png' }).type, 'image');
});
