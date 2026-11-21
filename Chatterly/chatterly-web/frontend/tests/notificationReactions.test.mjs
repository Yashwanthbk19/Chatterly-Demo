import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MESSAGE_REACTION_CONTROL_PREFIX,
  buildMessageReactionNotificationText,
  buildRealtimeReactionNotification,
  getMessageReactionNotificationEmoji,
  isMessageReactionControlMessage,
  isMessageReactionNotification,
  parseMessageReactionControlText,
} from '../src/utils/notification.js';

const ME = '6a0000000000000000000001';
const BOB = '6a0000000000000000000002';
const CAROL = '6a0000000000000000000003';
const CHAT = '6a0000000000000000002001';

const control = (overrides = {}) =>
  MESSAGE_REACTION_CONTROL_PREFIX +
  JSON.stringify({
    messageId: 'm-mine',
    clientMessageId: '',
    targetMessageIds: ['m-mine'],
    chatId: CHAT,
    senderId: BOB,
    receiverId: ME,
    userId: BOB,
    emoji: '😀',
    remove: false,
    reactedAt: '2026-10-27T10:00:00.000Z',
    ...overrides,
  });

const storeMessages = (messagesByChat) => {
  const storage = new Map([['chatterly_chat_messages', JSON.stringify(messagesByChat)]]);
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  };
};

test.afterEach(() => {
  delete globalThis.localStorage;
});

test('the notification text reads: Reacted to your message "emoji" (the reactor is the title)', () => {
  assert.equal(buildMessageReactionNotificationText('😀'), 'Reacted to your message "😀"');
  assert.equal(buildMessageReactionNotificationText(' 👍🏽 '), 'Reacted to your message "👍🏽"');
});

test('control messages are recognised and parsed, anything else is left alone', () => {
  assert.equal(isMessageReactionControlMessage({ content: control() }), true);
  assert.equal(isMessageReactionControlMessage({ text: control() }), true);
  assert.equal(isMessageReactionControlMessage({ content: 'hello' }), false);
  assert.equal(parseMessageReactionControlText('hello'), null);
  assert.equal(parseMessageReactionControlText(`${MESSAGE_REACTION_CONTROL_PREFIX}{not json`), null);
  assert.equal(parseMessageReactionControlText(`${MESSAGE_REACTION_CONTROL_PREFIX}[1]`), null);
  assert.equal(parseMessageReactionControlText(control()).emoji, '😀');
});

test('a push body is recognised as a reaction in the current and the earlier wording', () => {
  assert.equal(getMessageReactionNotificationEmoji({ text: 'Reacted to your message "😀"' }), '😀');
  assert.equal(getMessageReactionNotificationEmoji({ message: 'Reacted to your message “👍”.' }), '👍');
  assert.equal(getMessageReactionNotificationEmoji({ text: 'Bob Brown reacted 😀 to your message.' }), '😀');
  assert.equal(getMessageReactionNotificationEmoji({ emoji: '❤️', text: 'whatever' }), '❤️');
  assert.equal(getMessageReactionNotificationEmoji({ text: 'I reacted to your message yesterday' }), '');
  assert.equal(isMessageReactionNotification({ text: 'Reacted to your message "😀"' }), true);
  assert.equal(isMessageReactionNotification({ kind: 'message-reaction', text: 'x' }), true);
  assert.equal(isMessageReactionNotification({ action: 'message_reaction' }), true);
  assert.equal(isMessageReactionNotification({ text: control() }), true);
  assert.equal(isMessageReactionNotification({ text: 'see you at 5' }), false);
  assert.equal(isMessageReactionNotification({}), false);
});

test('a reaction on a message the user wrote becomes one clean notification', () => {
  storeMessages({ [CHAT]: [{ id: 'm-mine', senderId: ME, direction: 'sent' }] });
  const notification = buildRealtimeReactionNotification({ content: control() }, { userId: ME });

  assert.ok(notification);
  assert.equal(notification.kind, 'message-reaction');
  assert.equal(notification.text, 'Reacted to your message "😀"');
  assert.equal(notification.message, notification.text);
  assert.equal(notification.senderId, BOB);
  assert.equal(notification.chatId, CHAT);
  assert.equal(notification.isGroup, false);
  assert.ok(!notification.text.includes(MESSAGE_REACTION_CONTROL_PREFIX));
  assert.match(notification.id, /message-reaction/);
});

test('removing a reaction, reacting yourself or reacting without an emoji says nothing', () => {
  storeMessages({ [CHAT]: [{ id: 'm-mine', senderId: ME }] });
  assert.equal(buildRealtimeReactionNotification({ content: control({ remove: true, emoji: '' }) }, { userId: ME }), null);
  assert.equal(buildRealtimeReactionNotification({ content: control({ removed: true }) }, { userId: ME }), null);
  assert.equal(buildRealtimeReactionNotification({ content: control({ emoji: '' }) }, { userId: ME }), null);
  assert.equal(buildRealtimeReactionNotification({ content: control({ senderId: ME, userId: ME }) }, { userId: ME }), null);
  assert.equal(buildRealtimeReactionNotification({ content: 'hello' }, { userId: ME }), null);
});

test('a reaction on someone else\'s message (including the reactor\'s own) says nothing', () => {
  storeMessages({
    [CHAT]: [
      { id: 'm-mine', senderId: ME },
      { id: 'm-bobs', senderId: BOB },
      { id: 'm-carols', senderId: CAROL },
    ],
  });
  assert.equal(
    buildRealtimeReactionNotification(
      { content: control({ messageId: 'm-bobs', targetMessageIds: ['m-bobs'] }) },
      { userId: ME }
    ),
    null
  );
  assert.equal(
    buildRealtimeReactionNotification(
      { content: control({ messageId: 'm-carols', targetMessageIds: ['m-carols'], groupId: CHAT }) },
      { userId: ME }
    ),
    null
  );
});

test('the target is matched by any of its ids, and by direction when the sender id is missing', () => {
  storeMessages({ [CHAT]: [{ id: 'server-1', clientMessageId: 'temp-1', direction: 'sent' }] });
  const byClientId = buildRealtimeReactionNotification(
    { content: control({ messageId: 'other', clientMessageId: 'temp-1', targetMessageIds: ['other', 'temp-1'] }) },
    { userId: ME }
  );
  assert.ok(byClientId);
});

test('a target that is not stored: notified in a one-to-one chat, silent in a group', () => {
  storeMessages({});
  assert.ok(buildRealtimeReactionNotification({ content: control() }, { userId: ME }));

  const groupNotification = buildRealtimeReactionNotification(
    { content: control({ groupId: CHAT }) },
    { userId: ME }
  );
  assert.equal(groupNotification, null);

  // a group reaction on a stored message of the user is delivered, flagged as a group
  storeMessages({ [CHAT]: [{ id: 'm-mine', senderId: ME }] });
  const known = buildRealtimeReactionNotification({ content: control({ groupId: CHAT }) }, { userId: ME });
  assert.equal(known.isGroup, true);
  assert.equal(known.chatType, 'group');
  assert.equal(known.groupId, CHAT);
});

test('without browser storage the one-to-one notice still works', () => {
  assert.ok(buildRealtimeReactionNotification({ content: control() }, { userId: ME }));
});
