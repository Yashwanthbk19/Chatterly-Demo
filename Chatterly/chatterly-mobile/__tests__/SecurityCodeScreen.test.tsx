import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {PrivacySecurityScreen, verifiableContacts} from '../src/screens/PrivacySecurityScreen';
import {getEncryptionDetails, getEncryptionInfo, getPrivacySettings, getSecurityCode} from '../src/services/privacyApi';
import {getChatList, normalizeChatList} from '../src/services/chatApi';
import type {ChatListItem} from '../src/types/chat';

// Sprint 10 Story 2: Privacy -> End to End Encryption -> View Security Code.

jest.mock('../src/services/privacyApi', () => ({
  getPrivacySettings: jest.fn(),
  getEncryptionInfo: jest.fn(),
  getEncryptionDetails: jest.fn(),
  getSecurityCode: jest.fn(),
  getBlockedUsers: jest.fn(),
  unblockUser: jest.fn(),
  reportUser: jest.fn(),
  setTwoFactorEnabled: jest.fn(),
  updateDisappearingMessages: jest.fn(),
}));

jest.mock('../src/services/chatApi', () => ({
  getChatList: jest.fn(),
  normalizeChatList: jest.fn(),
}));

const metrics = {frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}};

const chatRow = (overrides: Partial<ChatListItem> & {contact: ChatListItem['contact']}): ChatListItem => ({
  id: `chat-${overrides.contact.userId}`,
  lastMessage: 'Hey',
  lastMessageAt: '2026-09-22T10:00:00.000Z',
  unreadCount: 0,
  markedUnread: false,
  archived: false,
  lastMessageIsOwn: false,
  lastMessageStatus: 'read',
  lastMessageId: 'm1',
  ...overrides,
});

const aarav = {userId: '65a1b2c3d4e5f60718293a4b', name: 'Aarav Sharma', thumbnail: null, kind: 'contact' as const};
const bishod = {userId: '65a1b2c3d4e5f60718293a4c', name: 'Bishod Thomas', thumbnail: null, kind: 'contact' as const};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getPrivacySettings).mockResolvedValue({encryptionEnabled: true, twoFactorEnabled: false, blockedUsersCount: 0, disappearingMessages: 'off'});
  jest.mocked(getEncryptionInfo).mockResolvedValue({enabled: true, title: 'End-to-End Encryption', description: 'Protected'});
  jest.mocked(getEncryptionDetails).mockResolvedValue({messagesEncrypted: true, callsEncrypted: true, mediaEncrypted: true, filesEncrypted: true, serverCanReadMessages: false, keyExchange: 'ECDH', encryptionAlgorithm: 'AES-256'});
  jest.mocked(getChatList).mockResolvedValue([]);
  jest.mocked(normalizeChatList).mockReturnValue([
    chatRow({contact: bishod, lastMessageAt: '2026-09-20T10:00:00.000Z'}),
    chatRow({contact: aarav, lastMessageAt: '2026-09-22T10:00:00.000Z'}),
  ]);
  jest.mocked(getSecurityCode).mockResolvedValue('A1B2-C3D4-E5F6-0718-2939-4A5B');
});

async function openEncryptionScreen() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}><PrivacySecurityScreen onBack={jest.fn()}/></SafeAreaProvider>,
    );
  });
  // Story 1 owns this hub row and spells the title with hyphens.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'End-to-End Encryption'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => { await Promise.resolve(); });
  return renderer;
}

/** `findByProps` compares values, so matching a pattern needs a predicate. */
const labelled = (renderer: ReactTestRenderer.ReactTestRenderer, pattern: RegExp) =>
  renderer.root.findAll(node => pattern.test(String(node.props?.accessibilityLabel ?? '')));

const texts = (renderer: ReactTestRenderer.ReactTestRenderer, pattern: RegExp) =>
  renderer.root.findAll(node => typeof node.props?.children === 'string' && pattern.test(node.props.children));

const press = async (renderer: ReactTestRenderer.ReactTestRenderer, label: string) => {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: label}).props.onPress();
  });
};

test('the encryption screen matches the design and reaches the security code', async () => {
  const renderer = await openEncryptionScreen();

  expect(renderer.root.findAllByProps({children: 'Enabled by default'}).length).toBeGreaterThan(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'View Security Code'})).toBeTruthy();
  expect(renderer.root.findAllByProps({
    children: 'Verify that your conversation is secure by comparing security codes with your contact.',
  }).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('the code is fetched for the most recent one-to-one conversation and shown as 36 digits', async () => {
  const renderer = await openEncryptionScreen();
  await press(renderer, 'View Security Code');

  // Aarav is the most recent conversation, so that is the pair being verified.
  expect(getSecurityCode).toHaveBeenCalledWith(aarav.userId);
  expect(renderer.root.findAllByProps({accessibilityLabel: `Verifying with ${aarav.name}. Change conversation`}).length).toBeGreaterThan(0);

  const [block] = labelled(renderer, /^Security code \d/);
  expect(block).toBeTruthy();
  expect(String(block.props.accessibilityLabel).replace(/\D/g, '')).toHaveLength(36);
  expect(texts(renderer, /^Last updated: /).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('Copy puts the grouped code on the clipboard', async () => {
  const renderer = await openEncryptionScreen();
  await press(renderer, 'View Security Code');
  await press(renderer, 'Copy security code');

  const copied = jest.mocked(Clipboard.setStringAsync).mock.calls[0][0];
  expect(copied).toMatch(/^(\d{4} ){8}\d{4}$/);
  expect(copied.replace(/\s/g, '')).toHaveLength(36);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test("a backend refusal is shown verbatim with a way to retry", async () => {
  jest.mocked(getSecurityCode).mockRejectedValue(new Error('Both users must exchange encryption keys first'));
  const renderer = await openEncryptionScreen();
  await press(renderer, 'View Security Code');

  expect(renderer.root.findAllByProps({children: 'Both users must exchange encryption keys first'}).length).toBeGreaterThan(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Copy security code'}).props.accessibilityState.disabled).toBe(true);

  jest.mocked(getSecurityCode).mockResolvedValue('A1B2-C3D4-E5F6-0718-2939-4A5B');
  await press(renderer, 'Try loading the security code again');
  expect(getSecurityCode).toHaveBeenCalledTimes(2);
  expect(labelled(renderer, /^Security code \d/).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('with no verifiable conversation the sheet explains why, instead of showing zeros', async () => {
  jest.mocked(normalizeChatList).mockReturnValue([]);
  const renderer = await openEncryptionScreen();
  await press(renderer, 'View Security Code');

  expect(getSecurityCode).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({
    children: 'Open a one-to-one conversation before viewing its security code.',
  }).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('switching conversation recomputes the code for that pair', async () => {
  const renderer = await openEncryptionScreen();
  await press(renderer, 'View Security Code');
  await press(renderer, `Verifying with ${aarav.name}. Change conversation`);
  await press(renderer, `Verify with ${bishod.name}`);

  expect(getSecurityCode).toHaveBeenLastCalledWith(bishod.userId);
  expect(renderer.root.findAllByProps({accessibilityLabel: `Verifying with ${bishod.name}. Change conversation`}).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('only conversations the backend can hash are offered', () => {
  const contacts = verifiableContacts([
    chatRow({contact: {userId: 'group-1', name: 'Project Team', thumbnail: null, kind: 'group'}}),
    chatRow({contact: {userId: 'broadcast-1', name: 'Team Updates', thumbnail: null, kind: 'broadcast'}}),
    // A placeholder row with no real user id behind it.
    chatRow({contact: {userId: 'pending', name: 'Unknown', thumbnail: null, kind: 'contact'}}),
    chatRow({contact: bishod, lastMessageAt: '2026-09-20T10:00:00.000Z'}),
    chatRow({contact: aarav, lastMessageAt: '2026-09-22T10:00:00.000Z'}),
    // The same person reached from two rows must appear once.
    chatRow({contact: aarav, lastMessageAt: '2026-09-21T10:00:00.000Z'}),
  ]);

  expect(contacts.map(contact => contact.name)).toEqual(['Aarav Sharma', 'Bishod Thomas']);
});

test('a row with no timestamp still sorts without throwing the order away', () => {
  const contacts = verifiableContacts([
    chatRow({contact: aarav, lastMessageAt: ''}),
    chatRow({contact: bishod, lastMessageAt: '2026-09-20T10:00:00.000Z'}),
  ]);
  expect(contacts.map(contact => contact.name)).toEqual(['Bishod Thomas', 'Aarav Sharma']);
});
