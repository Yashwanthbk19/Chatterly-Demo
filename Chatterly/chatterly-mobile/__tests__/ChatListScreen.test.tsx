import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Platform, StyleSheet} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ChatListScreen} from '../src/screens/ChatListScreen';
import {enrichChatList, getChatList, normalizeChatList, pinChatThread} from '../src/services/chatApi';
import {subscribeToInbox, subscribeToOnlineUsers} from '../src/services/chatRealtime';
import {searchGroups} from '../src/services/groupApi';
import {getBroadcastLists} from '../src/services/broadcastApi';
import {setConversationMuted} from '../src/services/conversationPreferences';
import {clearChatListActivities, recordChatListActivity} from '../src/services/chatListActivity';
import {getUnreadChatCount, publishUnreadChatCount, resetUnreadChatCount} from '../src/services/unreadBadge';

jest.mock('../src/services/chatApi', () => ({
  archiveChat: jest.fn(),
  deleteChat: jest.fn(),
  getChatList: jest.fn(),
  markChatUnread: jest.fn(),
  normalizeChatList: jest.fn(() => [{
    id: 'chat-1',
    contact: {userId: 'user-1', name: 'Chatterly user'},
    lastMessage: 'Start a conversation',
    lastMessageAt: '2026-08-21T13:04:00.000Z',
    unreadCount: 0,
    markedUnread: false,
    archived: false,
    lastMessageIsOwn: true,
    lastMessageStatus: 'sent',
    lastMessageId: 'message-1',
  }]),
  searchChatContacts: jest.fn().mockResolvedValue([]),
  pinChatThread: jest.fn().mockResolvedValue(undefined),
  unpinChatThread: jest.fn().mockResolvedValue(undefined),
  // The list endpoint leaves names and previews unpopulated; the screen fills
  // them in with a second pass, which these tests stub out as a no-op.
  enrichChatList: jest.fn(async (rows) => rows),
}));

jest.mock('../src/services/chatRealtime', () => ({
  subscribeToInbox: jest.fn(),
  subscribeToOnlineUsers: jest.fn(),
}));

jest.mock('../src/services/groupApi', () => ({
  pinGroupThread: jest.fn().mockResolvedValue(undefined),
  searchGroups: jest.fn().mockResolvedValue([]),
  unpinGroupThread: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/conversationPreferences', () => ({
  getConversationMuted: jest.fn().mockResolvedValue(false),
  setConversationMuted: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/broadcastApi', () => ({
  getBroadcastLists: jest.fn().mockResolvedValue([]),
}));
let mockProfilePic: string | null | undefined;
jest.mock('../src/services/sessionStore', () => ({
  getSession: () => ({user: {id: 'current-user', profilePic: mockProfilePic}}),
}));

// The handlers the list registers, so a test can play the part of the server.
type Handlers = Parameters<typeof subscribeToInbox>[0];
let handlers: Handlers;
let presenceListener: (ids: ReadonlySet<string>) => void;

async function renderScreen() {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{
        frame: {x: 0, y: 0, width: 393, height: 852},
        insets: {top: 24, right: 0, bottom: 24, left: 0},
      }}>
        <ChatListScreen onOpenContacts={jest.fn()} onOpenConversation={jest.fn()}/>
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });
  return renderer!;
}

/**
 * The row preview renders as several children (a mute prefix plus the message),
 * so an exact `children` match misses it. Searching the rendered tree keeps the
 * assertion about what the user reads rather than how it is spliced together.
 */
function renderedText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  // Only inspect rendered content; native/animated props can contain cycles.
  return JSON.stringify(renderer.toJSON(), (key, value) => key === 'props' ? undefined : value);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProfilePic = undefined;
  clearChatListActivities();
  resetUnreadChatCount();
  jest.mocked(subscribeToOnlineUsers).mockImplementation(listener => {
    presenceListener = listener;
    listener(new Set());
    return () => undefined;
  });
  jest.mocked(getChatList).mockResolvedValue([]);
  jest.mocked(searchGroups).mockResolvedValue([]);
  jest.mocked(getBroadcastLists).mockResolvedValue([]);
  jest.mocked(subscribeToInbox).mockImplementation(given => {
    handlers = given;
    return () => undefined;
  });
});

describe.each(['android', 'ios'] as const)('%s Chats header profile', platform => {
  beforeEach(() => { jest.replaceProperty(Platform, 'OS', platform); });
  afterEach(() => jest.restoreAllMocks());

  test.each([undefined, null, '', 'https://ui-avatars.com/api/?name=Chatterly', '/assets/image.png'])('uses the web default symbol for profile picture %s', async picture => {
    mockProfilePic = picture;
    const renderer = await renderScreen();
    const avatar = renderer.root.findByProps({accessibilityLabel: 'Your profile picture'});
    expect(avatar.props.source).toBe(require('../src/assets/default-profile.png'));
    expect(StyleSheet.flatten(avatar.props.style)).toEqual(expect.objectContaining({width: 24, height: 24, borderRadius: 12}));
    expect(renderer.root.findAllByProps({children: 'C'})).toHaveLength(0);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('preserves uploaded photos and falls back to the symbol on image failure', async () => {
    mockProfilePic = 'https://cdn.test/my-profile.jpg';
    const renderer = await renderScreen();
    const avatar = () => renderer.root.findByProps({accessibilityLabel: 'Your profile picture'});
    expect(avatar().props.source).toEqual({uri: mockProfilePic});
    await ReactTestRenderer.act(async () => avatar().props.onError());
    expect(avatar().props.source).toBe(require('../src/assets/default-profile.png'));
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});

test('shows typing on the matching row and restores its preview and ticks when typing stops', async () => {
  const renderer = await renderScreen();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Sent'}).length).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => handlers.onTyping?.('other-user', true));
  expect(renderedText(renderer)).not.toContain('Typing…');
  await ReactTestRenderer.act(async () => handlers.onTyping?.('user-1', true));
  expect(renderedText(renderer)).toContain('Typing…');
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Chatterly user is typing'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Sent'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => handlers.onTyping?.('user-1', false));
  expect(renderedText(renderer)).not.toContain('Typing…');
  expect(renderedText(renderer)).toContain('Start a conversation');
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Sent'}).length).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('does not show a Recent badge for the mirrored missed copy of an outgoing offline call', async () => {
  const rawRow = {
    id: 'chat-1',
    contact: {userId: 'user-1', name: 'Ananya'},
    lastMessage: 'Missed audio call',
    lastMessageAt: '2026-10-16T10:00:00.000Z',
    unreadCount: 1,
    markedUnread: false,
    archived: false,
    lastMessageIsOwn: true,
    lastMessageStatus: 'sent' as const,
    lastMessageId: 'offline-call-copy',
  };
  jest.mocked(normalizeChatList).mockReturnValueOnce([rawRow]);
  let finishEnrichment: ((rows: typeof rawRow[]) => void) | undefined;
  jest.mocked(enrichChatList).mockImplementationOnce(() => new Promise(resolve => {
    finishEnrichment = resolve;
  }));

  const renderer = await renderScreen();

  // This is the frame that used to flash the raw server count while message
  // details were still loading.
  const row = renderer.root.findByProps({accessibilityLabel: 'Open chat with Ananya'});
  expect(row.findAllByProps({children: 1})).toHaveLength(0);
  expect(getUnreadChatCount()).toBe(0);
  await ReactTestRenderer.act(async () => {
    finishEnrichment?.([{...rawRow, unreadCount: 0}]);
    await Promise.resolve();
  });
  expect(row.findAllByProps({children: 1})).toHaveLength(0);
  expect(getUnreadChatCount()).toBe(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('shows a just-messaged contact even while the backend chat list is catching up', async () => {
  jest.mocked(normalizeChatList).mockReturnValueOnce([{
    id: 'chat-anil',
    contact: {userId: 'user-anil', name: 'Anil - Anil', kind: 'contact'},
    lastMessage: '',
    lastMessageAt: '2026-10-13T12:00:00.000Z',
    unreadCount: 0,
    markedUnread: false,
    archived: false,
    pinned: false,
    lastMessageIsOwn: false,
    lastMessageStatus: '',
    lastMessageId: '',
  }]);
  recordChatListActivity({
    ownerId: 'current-user', chatId: 'chat-anil',
    contact: {userId: 'user-anil', name: 'Anil - Anil', kind: 'contact'},
    preview: 'Yes', createdAt: '2026-10-13T12:01:00.000Z',
    messageId: 'message-yes', status: 'sent',
  });

  const renderer = await renderScreen();
  const row = renderer.root.findByProps({accessibilityLabel: 'Open chat with Anil - Anil'});
  expect(row.findAll(node => node.props.children === 'Yes' ||
    (Array.isArray(node.props.children) && node.props.children.includes('Yes'))).length).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('orders recently messaged contacts newest first', async () => {
  jest.mocked(normalizeChatList).mockReturnValueOnce([
    {
      id: 'chat-older',
      contact: {userId: 'user-older', name: 'Older Contact', kind: 'contact'},
      lastMessage: 'Earlier message',
      lastMessageAt: '2026-10-13T11:00:00.000Z',
      unreadCount: 0,
      markedUnread: false,
      archived: false,
      pinned: false,
      lastMessageIsOwn: false,
      lastMessageStatus: 'delivered',
      lastMessageId: 'message-older',
    },
    {
      id: 'chat-newer',
      contact: {userId: 'user-newer', name: 'Newer Contact', kind: 'contact'},
      lastMessage: 'Latest message',
      lastMessageAt: '2026-10-13T12:00:00.000Z',
      unreadCount: 0,
      markedUnread: false,
      archived: false,
      pinned: false,
      lastMessageIsOwn: false,
      lastMessageStatus: 'delivered',
      lastMessageId: 'message-newer',
    },
  ]);

  const renderer = await renderScreen();
  const rows = renderer.root.findAll(
    node => typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Open chat with '),
  );
  const orderedLabels = rows
    .map(row => row.props.accessibilityLabel as string)
    .filter((label, index, labels) => label !== labels[index - 1]);
  expect(orderedLabels).toEqual([
    'Open chat with Newer Contact',
    'Open chat with Older Contact',
  ]);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('shows a cross until online is confirmed and clears it when presence changes', async () => {
  const renderer = await renderScreen();
  expect(renderer.root.findByProps({accessibilityLabel: 'Chatterly user: Offline'})).toBeDefined();
  await ReactTestRenderer.act(async () => presenceListener(new Set(['user-1'])));
  expect(renderer.root.findByProps({accessibilityLabel: 'Chatterly user: Online'})).toBeDefined();
  await ReactTestRenderer.act(async () => presenceListener(new Set()));
  expect(renderer.root.findByProps({accessibilityLabel: 'Chatterly user: Offline'})).toBeDefined();
});

test('opens the reference create sheet and routes its contact and group shortcuts', async () => {
  const onCreateContact = jest.fn();
  const onCreateGroup = jest.fn();
  const onCreateBroadcast = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}}}>
        <ChatListScreen onCreateBroadcast={onCreateBroadcast} onCreateContact={onCreateContact} onCreateGroup={onCreateGroup} onOpenContacts={jest.fn()} onOpenConversation={jest.fn()}/>
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Create new'}).props.onPress());
  expect(renderer!.root.findByProps({accessibilityLabel: 'Create menu'})).toBeDefined();
  expect(renderer!.root.findByProps({accessibilityLabel: 'New Broadcast'})).toBeDefined();
  expect(renderer!.root.findByProps({viewBox: '0 0 48 48'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'New Group'}).props.onPress());
  expect(onCreateGroup).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Create new'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'New Contact'}).props.onPress());
  expect(onCreateContact).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Create new'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'New Broadcast'}).props.onPress());
  expect(onCreateBroadcast).toHaveBeenCalledTimes(1);
});

test('enables the three-dot menu for profile editing and latest-data refresh', async () => {
  const onOpenSettings = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}}}>
        <ChatListScreen onOpenContacts={jest.fn()} onOpenConversation={jest.fn()} onOpenSettings={onOpenSettings}/>
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Chat options'}).props.onPress());
  expect(renderer!.root.findByProps({accessibilityLabel: 'Chat options menu'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Edit profile'}).props.onPress());
  expect(onOpenSettings).toHaveBeenCalledWith('edit');

  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Chat options'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Refresh latest chats'}).props.onPress());
  expect(getChatList).toHaveBeenCalledTimes(2);
});

test('lists existing broadcasts and opens one-way messaging', async () => {
  jest.mocked(getBroadcastLists).mockResolvedValueOnce([{
    _id: 'broadcast-1', name: 'Team Updates', imageUri: 'file:///broadcast.png', participants: [{_id: 'user-1', name: 'Rahul'}],
  }]);
  const onOpenBroadcast = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}}}>
        <ChatListScreen onOpenBroadcast={onOpenBroadcast} onOpenContacts={jest.fn()} onOpenConversation={jest.fn()}/>
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Open broadcast Team Updates'}).props.onPress());
  expect(renderedText(renderer!)).toContain('One-way messaging');
  expect(renderer!.root.findByProps({accessibilityLabel: 'Team Updates broadcast picture'}).props.source).toEqual({uri: 'file:///broadcast.png'});
  expect(onOpenBroadcast).toHaveBeenCalledWith(expect.objectContaining({_id: 'broadcast-1'}));
});

test('shows only groups with member count, preview, timestamp and unread badge', async () => {
  jest.mocked(normalizeChatList).mockReturnValueOnce([{
    id: 'group-1',
    contact: {userId: 'group-1', name: 'Project Team Alpha', status: '12 Members', kind: 'group'},
    lastMessage: 'Meeting at 5 PM',
    lastMessageAt: new Date().toISOString(),
    unreadCount: 2,
    markedUnread: false,
    archived: false,
    lastMessageIsOwn: false,
    lastMessageStatus: 'delivered',
    lastMessageId: 'group-message-1',
  }]);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Groups chats'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Search groups'})).toBeDefined();
  expect(renderedText(renderer)).toContain('Project Team Alpha');
  expect(renderedText(renderer)).toContain('12 Members · ');
  expect(renderedText(renderer)).toContain('Meeting at 5 PM');
  expect(renderer.root.findAllByProps({children: 2}).length).toBeGreaterThan(0);
});

test('searches groups through the documented backend search', async () => {
  jest.useFakeTimers();
  try {
    const renderer = await renderScreen();
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Groups chats'}).props.onPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Search groups'}).props.onChangeText('Project'));
    await ReactTestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(251);
    });

    expect(searchGroups).toHaveBeenCalledWith('Project');
  } finally {
    jest.useRealTimers();
  }
});

test('long-press selection hides the swipe action rail completely', async () => {
  const renderer = await renderScreen();

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Delete Chatterly user'}).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Open chat with Chatterly user'})[0].props.onLongPress();
  });

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Delete Chatterly user'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Delete selected chat'})).toBeDefined();
});

test('persists chat pin and mute actions', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Pin Chatterly user'}).props.onPress());
  expect(pinChatThread).toHaveBeenCalledWith('chat-1');

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Mute Chatterly user'}).props.onPress());
  expect(setConversationMuted).toHaveBeenCalledWith('chat-1', true);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('shows the ticks for our own last message on the row', async () => {
  const renderer = await renderScreen();

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Sent'}).length).toBeGreaterThan(0);
});

test('moves a row to Delivered and then Read as the receipts come in', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    handlers.onDelivered?.('message-1');
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Delivered'}).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    handlers.onRead?.('chat-1', ['message-1']);
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Read'}).length).toBeGreaterThan(0);
});

test('updates the preview and unread badge when a message arrives with no chat open', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    handlers.onMessage?.({
      id: 'message-2',
      text: 'Are you free?',
      createdAt: '2026-08-24T00:56:00.000Z',
      isOwn: false,
      status: 'delivered',
      messageType: 'text',
      chatId: 'chat-1',
      contactId: 'user-1',
    });
  });

  expect(renderedText(renderer)).toContain('Are you free?');
  expect(renderer.root.findAllByProps({children: 1}).length).toBeGreaterThan(0);
  // The preview is now the other person's message, so our ticks come off it.
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Delivered'})).toHaveLength(0);
});

test('shows the unread total on the Chats tab once the list has loaded, and keeps it current', async () => {
  const unreadRow = (id: string, userId: string, unreadCount: number, markedUnread = false) => ({
    id, contact: {userId, name: `User ${userId}`, kind: 'contact' as const},
    lastMessage: 'Hi', lastMessageAt: '2026-08-24T00:55:00.000Z', unreadCount, markedUnread,
    archived: false, pinned: false, lastMessageIsOwn: false, lastMessageStatus: 'delivered', lastMessageId: `m-${id}`,
  });
  jest.mocked(normalizeChatList).mockReturnValueOnce([
    unreadRow('chat-a', 'user-a', 2), unreadRow('chat-b', 'user-b', 1), unreadRow('chat-c', 'user-c', 0, true),
  ]);

  const renderer = await renderScreen();
  // Three unread messages; the chat marked unread by hand has none, only a dot.
  expect(getUnreadChatCount()).toBe(3);
  expect(renderer.root.findAllByProps({accessibilityLabel: '3 unread messages'}).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    handlers.onMessage?.({
      id: 'message-9', text: 'New one', createdAt: '2026-08-24T00:56:00.000Z', isOwn: false,
      status: 'delivered', messageType: 'text', chatId: 'chat-a', contactId: 'user-a',
    });
  });
  expect(getUnreadChatCount()).toBe(4);
  expect(renderer.root.findAllByProps({accessibilityLabel: '4 unread messages'}).length).toBeGreaterThan(0);

  // Reading chat A elsewhere clears its three.
  await ReactTestRenderer.act(async () => handlers.onRead?.('chat-a', []));
  expect(getUnreadChatCount()).toBe(1);
  expect(renderer.root.findAllByProps({accessibilityLabel: '1 unread message'}).length).toBeGreaterThan(0);

  // Reading the rest leaves no badge at all.
  await ReactTestRenderer.act(async () => handlers.onRead?.('chat-b', []));
  expect(getUnreadChatCount()).toBe(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: '1 unread message'})).toHaveLength(0);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('does not flash the Chats tab badge off while the list is still loading', async () => {
  publishUnreadChatCount(5);
  jest.mocked(getChatList).mockImplementation(() => new Promise(() => undefined));

  const renderer = await renderScreen();

  expect(getUnreadChatCount()).toBe(5);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('keeps the last known Chats tab count when the list cannot be loaded', async () => {
  publishUnreadChatCount(5);
  jest.mocked(getChatList).mockRejectedValue(new Error('Network request failed'));

  const renderer = await renderScreen();

  // The load failed, so the screen knows nothing new; zero would be a guess.
  expect(getUnreadChatCount()).toBe(5);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('renders the supplied unread dot instead of a fake counter for a manually unread chat', async () => {
  jest.mocked(normalizeChatList).mockReturnValueOnce([{
    id: 'chat-1',
    contact: {userId: 'user-1', name: 'Ananya'},
    lastMessage: 'Yes, At 5 PM',
    lastMessageAt: '2026-08-24T00:55:00.000Z',
    unreadCount: 0,
    markedUnread: true,
    archived: false,
    lastMessageIsOwn: false,
    lastMessageStatus: 'delivered',
    lastMessageId: 'message-1',
  }]);
  const renderer = await renderScreen();

  expect(renderer.root.findByProps({accessibilityLabel: 'Marked unread'})).toBeDefined();
  expect(renderer.root.findAllByProps({children: 1})).toHaveLength(0);
});

test('refetches when a message arrives for a conversation the list has no row for', async () => {
  await renderScreen();
  expect(getChatList).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    handlers.onMessage?.({
      id: 'message-3',
      text: 'Hello',
      createdAt: '2026-08-24T00:57:00.000Z',
      isOwn: false,
      status: 'delivered',
      messageType: 'text',
      chatId: 'chat-unknown',
      contactId: 'user-unknown',
    });
  });

  expect(getChatList).toHaveBeenCalledTimes(2);
});

test('a late echo of the row message cannot pull its ticks back below a receipt', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    handlers.onDelivered?.('message-1');
    handlers.onRead?.('chat-1', ['message-1']);
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Read'}).length).toBeGreaterThan(0);

  // The room broadcast echoes the stored record, whose status can be older than
  // the receipts that have already landed on this row.
  await ReactTestRenderer.act(async () => {
    handlers.onMessage?.({
      id: 'message-1',
      text: 'Start a conversation',
      createdAt: '2026-08-21T13:04:00.000Z',
      isOwn: true,
      status: 'sent',
      messageType: 'text',
      chatId: 'chat-1',
      contactId: 'user-1',
    });
  });

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Read'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Sent'})).toHaveLength(0);
});
