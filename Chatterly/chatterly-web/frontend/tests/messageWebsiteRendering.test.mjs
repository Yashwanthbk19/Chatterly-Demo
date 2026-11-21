import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import * as messageUtils from '../src/utils/message.js';

// Compile the real, small components with the project's existing JSX compiler.
// React SSR then verifies actual anchors and text, without Firebase or a browser.
const loadComponent = async (file, name, dependencies = {}) => {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?$/gm, '')
    .replace('export default function', 'function');
  const { code } = await transformWithOxc(source, name + '.jsx', { jsx: { runtime: 'classic' } });
  return runInNewContext(`${code}\n${name}`, { React, ...messageUtils, ...dependencies });
};
const MessageText = await loadComponent('../src/components/MessageText.jsx', 'MessageText');
const MessageBubble = await loadComponent('../src/components/MessageBubble.jsx', 'MessageBubble', { MessageText });
const renderBubble = (message) => renderToStaticMarkup(React.createElement(MessageBubble, {
  message: { type: 'text', status: 'sent', time: '3:59 PM', ...message },
}));

for (const direction of ['sent', 'received']) {
  test(`${direction} website messages render both screenshot URLs as clickable links`, () => {
    const html = renderBubble({ direction, text: 'https://chatterly.stacklycloud.com/ and www.google.com' });
    assert.match(html, /href="https:\/\/chatterly\.stacklycloud\.com\/"/);
    assert.match(html, /href="https:\/\/www\.google\.com"/);
    assert.match(html, />www\.google\.com<\/a>/);
    assert.equal((html.match(/target="_blank"/g) || []).length, 2);
    assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, 2);
  });
}

test('message text and information around multiple website links are preserved', () => {
  const html = renderBubble({ text: 'Chatterly: https://chatterly.stacklycloud.com/\nSearch at www.google.com for more information.' });
  assert.match(html, /Chatterly: /);
  assert.match(html, /\nSearch at /);
  assert.match(html, / for more information\./);
  assert.match(html, />https:\/\/chatterly\.stacklycloud\.com\/<\/a>/);
});

for (const type of ['image', 'video', 'audio', 'file']) {
  test(`${type} captions use clickable website links without losing the attachment`, () => {
    const html = renderBubble({
      type, direction: 'received', caption: 'Details at www.google.com',
      mediaUrl: `https://example.com/attachment.${type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'pdf'}`,
      fileName: 'Document.pdf', fileUrl: type === 'file' ? 'https://example.com/attachment.pdf' : undefined,
    });
    assert.match(html, /Details at /);
    assert.match(html, /href="https:\/\/www\.google\.com"/);
    assert.match(html, /https:\/\/example\.com\/attachment/);
  });
}

test('the message field alias remains visible and clickable in a message bubble', () => {
  const html = renderBubble({ text: '', message: 'Website information: www.google.com' });
  assert.match(html, /Website information: /);
  assert.match(html, /href="https:\/\/www\.google\.com"/);
});

test('shared link information includes messages stored using the message field alias', () => {
  const message = {
    id: 'website', chatId: 'chat-1', senderId: 'sender-1', type: 'text',
    message: 'Website information: www.google.com', createdAt: '2026-11-13T10:00:00Z',
  };
  assert.deepEqual(messageUtils.extractLinksFromMessage(message), ['https://www.google.com']);
  const [link] = messageUtils.buildProfileTabContent([message]).links;
  assert.ok(link);
  assert.equal(link.url, 'https://www.google.com');
  assert.equal(link.text, 'Website information: www.google.com');
});

const pageSource = readFileSync(new URL('../src/pages/ChatListPage.jsx', import.meta.url), 'utf8');
const textStart = pageSource.indexOf('const GENERIC_MEDIA_BODY_LABELS =');
const textEnd = pageSource.indexOf('const getDisplayMediaCaption =', textStart);
assert.ok(textStart >= 0 && textEnd > textStart);
const getBodyText = runInNewContext(`${pageSource.slice(textStart, textEnd)}\ngetRenderableMessageBodyText`);

test('the main conversation uses the shared hyperlink renderer and keeps emoji text rendering', async () => {
  const start = pageSource.indexOf('const renderLinkifiedMessageSegments =');
  const end = pageSource.indexOf('const normalizeMessageSearchValue =', start);
  assert.ok(start >= 0 && end > start);
  const { code } = await transformWithOxc(pageSource.slice(start, end), 'message-renderer.jsx', { jsx: { runtime: 'classic' } });
  const renderSegments = runInNewContext(`${code}\nrenderLinkifiedMessageSegments`, {
    React, MessageText, renderFlagAwareText: (value) => value,
  });
  const html = renderToStaticMarkup(renderSegments('Website information: www.google.com', 'text-white underline'));
  assert.match(html, /Website information: /);
  assert.match(html, /href="https:\/\/www\.google\.com"/);
  assert.match(html, /class="text-white underline /);
});

test('empty cached text does not hide a website and its information from the conversation', () => {
  for (const field of ['content', 'message']) {
    assert.equal(getBodyText({ type: 'text', text: '', [field]: 'Details: www.google.com' }), 'Details: www.google.com');
  }
  assert.equal(getBodyText({ type: 'video', text: 'Video', mediaUrl: 'https://example.com/clip.mp4' }), '');
});

test('link clicks stop bubble actions without preventing normal browser navigation', () => {
  const nodes = MessageText({ text: 'Open www.google.com' });
  const link = nodes.find((node) => node.type === 'a');
  let stopped = false;
  let prevented = false;
  link.props.onClick({ stopPropagation: () => { stopped = true; }, preventDefault: () => { prevented = true; } });
  assert.equal(stopped, true);
  assert.equal(prevented, false);
});

test('non-link text keeps custom emoji rendering and unsafe HTML stays text', () => {
  const html = renderToStaticMarkup(React.createElement(MessageText, {
    text: '<script>alert(1)</script> see www.google.com',
    renderText: (value) => React.createElement('span', { 'data-emoji-text': true }, value),
  }));
  assert.match(html, /data-emoji-text="true"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /href="https:\/\/www\.google\.com"/);
});
