import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {CallsScreen} from '../src/screens/CallsScreen';
import {getCallDetails, getCallHistory, type CallHistoryItem} from '../src/services/callHistoryApi';
import {hideCallIds, loadHiddenCallIds} from '../src/services/callHistoryStore';
import {blockChatUser, getChatProfile, startChat} from '../src/services/chatApi';
import {reportUser} from '../src/services/privacyApi';

jest.mock('../src/services/callHistoryApi', () => ({getCallDetails: jest.fn(), getCallHistory: jest.fn()}));
jest.mock('../src/services/callHistoryStore', () => ({hideCallIds: jest.fn(), loadHiddenCallIds: jest.fn()}));
jest.mock('../src/services/chatApi', () => ({blockChatUser: jest.fn(), getChatProfile: jest.fn(), reportChatUser: jest.fn(), startChat: jest.fn()}));
jest.mock('../src/services/privacyApi', () => ({reportUser: jest.fn()}));
jest.setTimeout(15000);

const suppliedDeletePath = 'M12 15H28M18 19V25M22 19V25M13 15L14 27C14 27.5304 14.2107 28.0391 14.5858 28.4142C14.9609 28.7893 15.4696 29 16 29H24C24.5304 29 25.0391 28.7893 25.4142 28.4142C25.7893 28.0391 26 27.5304 26 27L27 15M17 15V12C17 11.7348 17.1054 11.4804 17.2929 11.2929C17.4804 11.1054 17.7348 11 18 11H22C22.2652 11 22.5196 11.1054 22.7071 11.2929C22.8946 11.4804 23 11.7348 23 12V15';
const confirmationDeletePath = 'M17.3333 19.9987V11.9987C17.3333 11.6451 17.4738 11.3059 17.7239 11.0559C17.9739 10.8058 18.313 10.6654 18.6667 10.6654H26.6667C27.0203 10.6654 27.3594 10.8058 27.6095 11.0559C27.8595 11.3059 28 11.6451 28 11.9987V17.332M24 10.6654V6.66536C24 6.31174 23.8595 5.9726 23.6095 5.72256C23.3594 5.47251 23.0203 5.33203 22.6667 5.33203H5.33333C4.97971 5.33203 4.64057 5.47251 4.39052 5.72256C4.14048 5.9726 4 6.31174 4 6.66536V22.6654C4 23.019 4.14048 23.3581 4.39052 23.6082C4.64057 23.8582 4.97971 23.9987 5.33333 23.9987H17.3333M21.3333 29.332L28 22.6654M22 22.6654H28V28.6654M21.3333 11.9987H24';

const calls: CallHistoryItem[] = [
  {id: 'call-1', chatId: 'chat-aarav', contactId: 'aarav', contactName: 'Aarav Sharma', avatar: null, type: 'audio', direction: 'outgoing', status: 'completed', duration: 720, occurredAt: '2026-09-21T14:20:00.000Z', isGroup: false},
  {id: 'call-2', contactId: 'bishod', contactName: 'Bishod Thomas', avatar: null, type: 'video', direction: 'incoming', status: 'completed', duration: 720, occurredAt: '2026-09-21T13:20:00.000Z', isGroup: false},
  {id: 'call-3', contactId: 'saranya', contactName: 'Saranya', avatar: null, type: 'audio', direction: 'incoming', status: 'missed', duration: 0, occurredAt: '2026-09-21T12:20:00.000Z', isGroup: false},
];
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function renderScreen(onOpenConversation = jest.fn(), bottom = 24, onBack = jest.fn()) {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom, left: 0}}}>
      <CallsScreen onBack={onBack} onOpenChats={jest.fn()} onOpenContacts={jest.fn()} onOpenConversation={onOpenConversation} onOpenSettings={jest.fn()}/>
    </SafeAreaProvider>);
    await Promise.resolve();
    await Promise.resolve();
  });
  mounted.push(tree!);
  return tree!;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getCallHistory).mockResolvedValue(calls);
  jest.mocked(getCallDetails).mockImplementation(async callId => calls.find(call => call.id === callId) || calls[0]);
  jest.mocked(loadHiddenCallIds).mockResolvedValue(new Set());
  jest.mocked(hideCallIds).mockResolvedValue(new Set());
  jest.mocked(getChatProfile).mockResolvedValue({userId: 'aarav', name: 'Aarav Sharma', profilePic: null, status: 'We simply exist to eat healthy!', phone: '+91 987 654 3210', online: false});
  jest.mocked(startChat).mockResolvedValue({chatId: 'new-chat', chat: {_id: 'new-chat'} as never});
  jest.mocked(blockChatUser).mockResolvedValue('User blocked successfully.');
  jest.mocked(reportUser).mockResolvedValue('Report submitted successfully.');
});

afterEach(() => {
  ReactTestRenderer.act(() => mounted.splice(0).forEach(tree => tree.unmount()));
});

test('uses the navigation flow callback from the call-history Back button', async () => {
  const onBack = jest.fn();
  const tree = await renderScreen(jest.fn(), 24, onBack);

  ReactTestRenderer.act(() => {
    tree.root.findByProps({accessibilityLabel: 'Back from call history'}).props.onPress();
  });

  expect(onBack).toHaveBeenCalledTimes(1);
});

test('loads the backend history and enters multi-select from a long press', async () => {
  const tree = await renderScreen();

  expect(getCallHistory).toHaveBeenCalledTimes(1);
  expect(tree.root.findByProps({accessibilityLabel: 'Call with Aarav Sharma'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Call with Aarav Sharma'}).props.onLongPress();
  });
  expect(tree.root.findByProps({accessibilityLabel: '1 selected'})).toBeDefined();
  expect(tree.root.findByProps({accessibilityLabel: 'Call with Aarav Sharma'}).props.accessibilityState.selected).toBe(true);
  expect(tree.root.findByProps({d: suppliedDeletePath}).props.stroke).toBe('#0B1220');

  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Call with Bishod Thomas'}).props.onPress();
  });
  expect(tree.root.findByProps({accessibilityLabel: '2 selected'})).toBeDefined();
  expect(tree.root.findByProps({accessibilityLabel: 'Call with Bishod Thomas'}).props.accessibilityState.selected).toBe(true);
});

test('shows the count-aware confirmation and deletes every selected call from this user history', async () => {
  const tree = await renderScreen();
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Call with Aarav Sharma'}).props.onLongPress();
  });
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Call with Bishod Thomas'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Delete selected calls'}).props.onPress();
  });

  expect(tree.root.findByProps({accessibilityLabel: 'Delete 2 calls confirmation'})).toBeDefined();
  expect(tree.root.findByProps({accessibilityLabel: 'Confirm delete 2 calls'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Confirm delete 2 calls'}).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(hideCallIds).toHaveBeenCalledWith(expect.arrayContaining(['call-1', 'call-2']));
  expect(tree.root.findAllByProps({accessibilityLabel: 'Call with Aarav Sharma'})).toHaveLength(0);
  expect(tree.root.findAllByProps({accessibilityLabel: 'Call with Bishod Thomas'})).toHaveLength(0);
  expect(tree.root.findByProps({accessibilityLabel: 'Call with Saranya'})).toBeDefined();
});

test('filters missed calls without changing the selection behavior', async () => {
  const tree = await renderScreen();
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Missed calls'}).props.onPress();
  });

  expect(tree.root.findAllByProps({accessibilityLabel: 'Call with Aarav Sharma'})).toHaveLength(0);
  expect(tree.root.findByProps({accessibilityLabel: 'Call with Saranya'})).toBeDefined();
});

test.each(['android', 'ios'] as const)('%s: every row in Missed offers Callback and Message, including declined calls', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
    const statuses = ['missed', 'no_answer', 'unanswered', 'timed-out', 'missed_call', 'not_answered', 'rejected', 'reject', 'declined', 'decline'];
    const history = statuses.map((status, index): CallHistoryItem => ({
      ...calls[2], id: `missed-${index}`, contactId: `contact-${index}`, contactName: `Contact ${index}`,
      status, type: index % 2 ? 'video' : 'audio', chatId: `chat-${index}`,
    }));
    jest.mocked(getCallHistory).mockResolvedValue([calls[0], ...history]);
    const onOpenConversation = jest.fn();
    const tree = await renderScreen(onOpenConversation);
    await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'Missed calls'}).props.onPress(); });
    expect(tree.root.findAllByProps({accessibilityLabel: 'Call with Aarav Sharma'})).toHaveLength(0);
    for (const call of history) {
      const row = tree.root.findByProps({accessibilityLabel: `Call with ${call.contactName}`});
      expect(row.findAllByType(Text).map(node => node.props.children)).toEqual(expect.arrayContaining(['Callback', 'Message']));
      for (const action of ['Callback', 'Message'] as const) {
        await ReactTestRenderer.act(async () => {
          row.findByProps({accessibilityLabel: `${action} ${call.contactName}`}).props.onPress({stopPropagation: jest.fn()});
        });
        expect(onOpenConversation).toHaveBeenLastCalledWith(expect.objectContaining({userId: call.contactId}), call.chatId, action === 'Callback' ? call.type : undefined);
      }
      await ReactTestRenderer.act(async () => { row.props.onPress(); });
      expect(onOpenConversation).toHaveBeenLastCalledWith(expect.objectContaining({userId: call.contactId}), call.chatId, undefined);
    }
    expect(startChat).not.toHaveBeenCalled();
    expect(getCallDetails).not.toHaveBeenCalled();
  } finally { os.restore(); }
});

test('new rejected calls loaded by refresh get both actions and open the correct chat', async () => {
  const onOpenConversation = jest.fn();
  const tree = await renderScreen(onOpenConversation);
  await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'Missed calls'}).props.onPress(); });
  jest.mocked(getCallHistory).mockResolvedValue([{...calls[2], id: 'new-missed-call', status: 'rejected', contactId: 'new-caller', contactName: 'New caller', type: 'video'}, ...calls]);
  await ReactTestRenderer.act(async () => { await tree.root.findByType(ScrollView).props.refreshControl.props.onRefresh(); });
  const row = tree.root.findByProps({accessibilityLabel: 'Call with New caller'});
  for (const action of ['Callback', 'Message'] as const) {
    await ReactTestRenderer.act(async () => { row.findByProps({accessibilityLabel: `${action} New caller`}).props.onPress(); });
    expect(startChat).toHaveBeenLastCalledWith('new-caller');
    expect(onOpenConversation).toHaveBeenLastCalledWith(expect.objectContaining({userId: 'new-caller'}), 'new-chat', action === 'Callback' ? 'video' : undefined);
  }
});

test.each(['no_answer', 'unanswered', 'timed-out', 'missed_call'])(
  'keeps %s records in Missed and opens the respective chat', async status => {
    const missed = {...calls[2], status};
    jest.mocked(getCallHistory).mockResolvedValue([calls[1], missed]);
    jest.mocked(getCallDetails).mockResolvedValue(missed);
    const onOpenConversation = jest.fn();
    const tree = await renderScreen(onOpenConversation);
    await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'Missed calls'}).props.onPress(); });
    expect(tree.root.findAllByProps({accessibilityLabel: 'Call with Bishod Thomas'})).toHaveLength(0);
    await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'Call with Saranya'}).props.onPress(); });
    expect(onOpenConversation).toHaveBeenCalledWith(expect.objectContaining({userId: 'saranya'}), 'new-chat', undefined);
    expect(getCallDetails).not.toHaveBeenCalled();
  },
);

test('opens backend-backed call details and starts chat or calls from the profile actions', async () => {
  const onOpenConversation = jest.fn();
  const tree = await renderScreen(onOpenConversation);

  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Call with Aarav Sharma'}).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getCallDetails).toHaveBeenCalledWith('call-1', false);
  expect(getChatProfile).toHaveBeenCalledWith('aarav');
  expect(tree.root.findByProps({accessibilityLabel: 'Call details for Aarav Sharma'})).toBeDefined();
  expect(tree.root.findByProps({children: 'We simply exist to eat healthy!'})).toBeDefined();
  expect(tree.root.findByProps({children: '+91 987 654 3210'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Audio call Aarav Sharma'}).props.onPress();
    await Promise.resolve();
  });
  expect(onOpenConversation).toHaveBeenCalledWith(expect.objectContaining({userId: 'aarav'}), 'chat-aarav', 'audio');
  expect(startChat).not.toHaveBeenCalled();
});

test.each(['android', 'ios'] as const)('%s: missed-call actions open the correct chat and only Callback redials', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
    for (const type of ['audio', 'video'] as const) {
      jest.mocked(getCallHistory).mockResolvedValue([{...calls[2], type, chatId: 'chat-saranya'}, calls[0]]);
      const onOpenConversation = jest.fn();
      const tree = await renderScreen(onOpenConversation);
      const row = tree.root.findByProps({accessibilityLabel: 'Call with Saranya'});
      expect(row.findAllByType(Text).filter(node => ['Callback', 'Message'].includes(node.props.children)).every(node => StyleSheet.flatten(node.props.style).fontSize === 9)).toBe(true);
      expect(tree.root.findAllByProps({accessibilityLabel: 'Callback Aarav Sharma'})).toHaveLength(0);
      for (const action of ['Callback', 'Message'] as const) {
        const event = {stopPropagation: jest.fn()};
        await ReactTestRenderer.act(async () => { row.findByProps({accessibilityLabel: `${action} Saranya`}).props.onPress(event); });
        expect(event.stopPropagation).toHaveBeenCalledTimes(1);
        expect(onOpenConversation).toHaveBeenLastCalledWith(expect.objectContaining({userId: 'saranya'}), 'chat-saranya', action === 'Callback' ? type : undefined);
      }
      await ReactTestRenderer.act(async () => { row.props.onPress(); });
      expect(onOpenConversation).toHaveBeenLastCalledWith(expect.objectContaining({userId: 'saranya'}), 'chat-saranya', undefined);
      expect(onOpenConversation).toHaveBeenCalledTimes(3);
      expect(startChat).not.toHaveBeenCalled();
      expect(getCallDetails).not.toHaveBeenCalled();

      await ReactTestRenderer.act(async () => { row.props.onLongPress(); });
      expect(row.findByProps({accessibilityLabel: 'Callback Saranya'}).props.disabled).toBe(true);
      expect(row.findByProps({accessibilityLabel: 'Message Saranya'}).props.disabled).toBe(true);
      await ReactTestRenderer.act(async () => { row.props.onPress(); });
      expect(onOpenConversation).toHaveBeenCalledTimes(3);
      await ReactTestRenderer.act(async () => { tree.unmount(); });
      mounted.splice(mounted.indexOf(tree), 1);
    }
  } finally { os.restore(); }
});

test('missed-call Message retries a failed start-chat lookup without redialing', async () => {
  jest.mocked(startChat).mockRejectedValueOnce(new Error('Unable to connect.'));
  const onOpenConversation = jest.fn();
  const tree = await renderScreen(onOpenConversation);
  const message = tree.root.findByProps({accessibilityLabel: 'Message Saranya'});
  await ReactTestRenderer.act(async () => { message.props.onPress({stopPropagation: jest.fn()}); });
  expect(onOpenConversation).not.toHaveBeenCalled();
  expect(tree.root.findByProps({children: 'Unable to connect.'})).toBeDefined();
  await ReactTestRenderer.act(async () => { message.props.onPress({stopPropagation: jest.fn()}); });
  expect(startChat).toHaveBeenLastCalledWith('saranya');
  expect(onOpenConversation).toHaveBeenCalledWith(expect.objectContaining({userId: 'saranya'}), 'new-chat', undefined);
});

test('a missed group call opens its group conversation without starting a direct chat', async () => {
  jest.mocked(getCallHistory).mockResolvedValue([{...calls[2], isGroup: true, contactId: 'group-1', contactName: 'Team'}]);
  const onOpenConversation = jest.fn();
  const tree = await renderScreen(onOpenConversation);
  await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'Message Team'}).props.onPress(); });
  expect(onOpenConversation).toHaveBeenCalledWith(expect.objectContaining({userId: 'group-1', kind: 'group'}), 'group-1', undefined);
  expect(startChat).not.toHaveBeenCalled();
});

test.each(['android', 'ios'] as const)('shows the correct Recent names on the first history render on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  let resolveHistory!: (history: CallHistoryItem[]) => void;
  jest.mocked(getCallHistory).mockImplementationOnce(() => new Promise(resolve => { resolveHistory = resolve; }));
  try {
    const tree = await renderScreen();
    expect(tree.root.findByProps({accessibilityLabel: 'Loading call history'})).toBeDefined();
    expect(tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Call with '))).toHaveLength(0);
    await ReactTestRenderer.act(async () => { resolveHistory(calls); });
    for (const call of calls) {
      expect(tree.root.findByProps({accessibilityLabel: `Call with ${call.contactName}`})).toBeDefined();
    }
    expect(getChatProfile).not.toHaveBeenCalled();
  } finally {
    os.restore();
  }
});

test.each(['android', 'ios'] as const)('ignores a previous contact profile while recent-call details load on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  let resolvePrevious!: (profile: Awaited<ReturnType<typeof getChatProfile>>) => void;
  let resolveCurrent!: (profile: Awaited<ReturnType<typeof getChatProfile>>) => void;
  jest.mocked(getChatProfile)
    .mockImplementationOnce(() => new Promise(resolve => { resolvePrevious = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveCurrent = resolve; }));
  const onOpenConversation = jest.fn();
  try {
    const tree = await renderScreen(onOpenConversation);
    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({accessibilityLabel: 'Call with Aarav Sharma'}).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({accessibilityLabel: 'Back to call history'}).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({accessibilityLabel: 'Call with Bishod Thomas'}).props.onPress();
    });
    expect(tree.root.findByProps({accessibilityLabel: 'Call details for Bishod Thomas'})).toBeDefined();

    await ReactTestRenderer.act(async () => {
      resolvePrevious({userId: 'aarav', name: 'Aarav Sharma', profilePic: null, status: '', online: false});
    });
    expect(tree.root.findByProps({accessibilityLabel: 'Call details for Bishod Thomas'})).toBeDefined();
    expect(tree.root.findAllByProps({accessibilityLabel: 'Call details for Aarav Sharma'})).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      resolveCurrent({userId: 'bishod', name: 'Bishod Thomas', profilePic: null, status: '', online: false});
    });
    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({accessibilityLabel: 'Audio call Bishod Thomas'}).props.onPress();
    });
    expect(onOpenConversation).toHaveBeenCalledWith(expect.objectContaining({userId: 'bishod', name: 'Bishod Thomas'}), 'new-chat', 'audio');
  } finally {
    os.restore();
  }
});

test('keeps the call-history duration when details return a different value', async () => {
  jest.mocked(getCallDetails).mockResolvedValue({...calls[0], duration: 125});
  const tree = await renderScreen();

  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Call with Aarav Sharma'}).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(tree.root.findByProps({children: '12m 00s'})).toBeDefined();
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Back to call history'}).props.onPress();
  });
  expect(tree.root.findByProps({accessibilityLabel: 'Call with Aarav Sharma'})).toBeDefined();
  expect(tree.root.findAllByProps({children: '2m 05s'})).toHaveLength(0);
});

test('opens More Options and confirms deletion of one call with the supplied icon', async () => {
  const tree = await renderScreen();
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Call with Aarav Sharma'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'More call options'}).props.onPress();
  });

  expect(tree.root.findByProps({accessibilityLabel: 'More Options'})).toBeDefined();
  expect(tree.root.findByProps({d: suppliedDeletePath}).props.stroke).toBe('#0B1220');
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Delete Call'}).props.onPress();
  });
  expect(tree.root.findByProps({accessibilityLabel: 'Delete this call confirmation'})).toBeDefined();
  expect(tree.root.findByProps({d: confirmationDeletePath}).props.stroke).toBe('#DC2626');

  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Confirm delete call'}).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(hideCallIds).toHaveBeenCalledWith(['call-1']);
  expect(tree.root.findAllByProps({accessibilityLabel: 'Call with Aarav Sharma'})).toHaveLength(0);
});

test('wires Block and Report options to the documented backend actions', async () => {
  const tree = await renderScreen();
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Call with Aarav Sharma'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'More call options'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Block contact'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'Block'}).props.onPress(); await Promise.resolve(); });
  expect(blockChatUser).toHaveBeenCalledWith('aarav');

  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'More call options'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Report contact'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'Submit Report'}).props.onPress(); await Promise.resolve(); });
  expect(reportUser).toHaveBeenCalledWith('aarav', 'Spam', '');
});

test('filters by the design types - Video, Audio and Missed', async () => {
  const tree = await renderScreen();
  const shown = () => ['Aarav Sharma', 'Bishod Thomas', 'Saranya'].filter(name => tree.root.findAllByProps({accessibilityLabel: `Call with ${name}`}).length > 0);

  expect(tree.root.findAllByProps({accessibilityLabel: 'Incoming calls'})).toHaveLength(0);
  expect(tree.root.findAllByProps({accessibilityLabel: 'Outgoing calls'})).toHaveLength(0);

  await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'Video calls'}).props.onPress(); });
  expect(shown()).toEqual(['Bishod Thomas']);
  await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'Audio calls'}).props.onPress(); });
  expect(shown()).toEqual(['Aarav Sharma', 'Saranya']);
  await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'All calls'}).props.onPress(); });
  expect(shown()).toEqual(['Aarav Sharma', 'Bishod Thomas', 'Saranya']);
});

test('durations are shown as they were, not rounded up to minutes', () => {
  const {durationLabel} = require('../src/screens/CallsScreen');
  expect(durationLabel(45)).toBe('45s');
  expect(durationLabel(720)).toBe('12m 00s');
  expect(durationLabel(332)).toBe('5m 32s');
  expect(durationLabel(3900)).toBe('1h 05m');
  expect(durationLabel(0)).toBe('');
});

test('the call icon on a row calls back with the same call type', async () => {
  const onOpenConversation = jest.fn();
  const stopPropagation = jest.fn();
  const tree = await renderScreen(onOpenConversation);
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Video call Bishod Thomas'}).props.onPress({stopPropagation});
    await Promise.resolve();
  });
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  // No chat id on this record, so one is started first.
  expect(startChat).toHaveBeenCalledWith('bishod');
  expect(onOpenConversation).toHaveBeenCalledWith(expect.objectContaining({userId: 'bishod'}), 'new-chat', 'video');
});

test('repeated Call List icon taps initiate only one callback while resolving the conversation', async () => {
  let resolveChat!: (value: Awaited<ReturnType<typeof startChat>>) => void;
  jest.mocked(startChat).mockImplementationOnce(() => new Promise(resolve => { resolveChat = resolve; }));
  const open = jest.fn();
  const tree = await renderScreen(open);
  await ReactTestRenderer.act(async () => {
    const icon = tree.root.findByProps({accessibilityLabel: 'Video call Bishod Thomas'});
    icon.props.onPress();
    icon.props.onPress();
  });
  expect(startChat).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => { resolveChat({chatId: 'selected-chat', chat: {} as never}); });
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(expect.objectContaining({userId: 'bishod'}), 'selected-chat', 'video');
});

test('a failed callback can be retried from the same Call List icon', async () => {
  jest.mocked(startChat).mockRejectedValueOnce(new Error('Temporary network error'));
  const open = jest.fn();
  const tree = await renderScreen(open);
  await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'Video call Bishod Thomas'}).props.onPress(); });
  expect(open).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { tree.root.findByProps({accessibilityLabel: 'Video call Bishod Thomas'}).props.onPress(); });
  expect(open).toHaveBeenCalledTimes(1);
});

test('opening the Calls tab clears the missed-call badge', async () => {
  const badge = require('../src/services/missedCallBadge');
  const seen = jest.spyOn(badge, 'markCallsSeen');
  await renderScreen();
  expect(seen).toHaveBeenCalled();
  seen.mockRestore();
});

test.each([0, 24, 48, 96])('keeps Calls tabs and populated or empty history above a %s-point system navigation area', async bottom => {
  const tree = await renderScreen(jest.fn(), bottom);
  const viewStyles = tree.root.findAllByType(View).map(node => StyleSheet.flatten(node.props.style));
  const nav = viewStyles.find(style => style?.position === 'absolute' && style?.minHeight === 69 + bottom);
  expect(nav).toMatchObject({bottom: 0, paddingBottom: 7 + bottom, paddingTop: 6});
  expect(nav!.minHeight - nav!.paddingBottom).toBe(62);
  expect(StyleSheet.flatten(tree.root.findByType(ScrollView).props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(nav!.minHeight);
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({accessibilityLabel: 'Search calls'}).props.onChangeText('Unknown contact');
  });
  expect(StyleSheet.flatten(tree.root.findByType(ScrollView).props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(nav!.minHeight);
});
