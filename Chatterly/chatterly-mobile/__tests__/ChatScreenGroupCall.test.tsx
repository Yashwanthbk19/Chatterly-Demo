import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ChatScreen} from '../src/screens/ChatScreen';
import {initiateCallOverSocket} from '../src/services/chatRealtime';
import {startCall} from '../src/services/chatApi';

// Sprint 9 Story 2 entry point: the call buttons in a group thread's header
// start a conference rather than a one-to-one call. The conference itself is
// owned by App, so all this screen does is hand the request up.

jest.setTimeout(15000);

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(listener => {
      listener({isConnected: true, isInternetReachable: true});
      return jest.fn();
    }),
  },
}));

jest.mock('../src/services/chatApi', () => ({
  getChatMessages: jest.fn().mockResolvedValue([]),
  getGroupMessages: jest.fn().mockResolvedValue([]),
  getCallStatus: jest.fn().mockResolvedValue('connected'),
  getChatProfile: jest.fn().mockResolvedValue({userId: 'u1', name: 'Member', profilePic: null, online: false}),
  getSharedMedia: jest.fn().mockResolvedValue([]),
  getPinnedMessages: jest.fn().mockResolvedValue([]),
  getChatFiles: jest.fn().mockResolvedValue([]),
  sendChatMessage: jest.fn(),
  markChatRead: jest.fn().mockResolvedValue(undefined),
  markChatUnread: jest.fn(),
  pinMessage: jest.fn(),
  unpinMessage: jest.fn(),
  sendChatMedia: jest.fn(),
  sendChatFile: jest.fn(),
  getMediaDownloadUrl: jest.fn(),
  deleteMessage: jest.fn(),
  deleteChat: jest.fn(),
  forwardMessages: jest.fn(),
  locationMessage: jest.fn(),
  startCall: jest.fn(),
}));

jest.mock('../src/services/chatRealtime', () => ({
  addCallParticipantOverSocket: jest.fn(),
  cancelCallOverSocket: jest.fn(),
  endCallOverSocket: jest.fn(),
  forwardGroupMessageOverSocket: jest.fn(),
  initiateCallOverSocket: jest.fn(),
  joinCallRoom: jest.fn(),
  sendMessageOverSocket: jest.fn(),
  setCallMutedOverSocket: jest.fn(),
  setCallSpeakerOverSocket: jest.fn(),
  subscribeToCall: jest.fn(() => () => undefined),
  subscribeToChat: jest.fn(() => () => undefined),
  subscribeToGroup: jest.fn(() => () => undefined),
  subscribeToGroupChanges: jest.fn(() => () => undefined),
  subscribeToConnection: jest.fn((listener: (state: string) => void) => { listener('connected'); return () => undefined; }),
  emitChatRead: jest.fn(),
  emitMessageDeletedForEveryone: jest.fn(),
  emitMessagePinned: jest.fn(),
  emitMessageUnpinned: jest.fn(),
  emitTyping: jest.fn(),
}));

jest.mock('../src/services/groupApi', () => ({
  getGroupDetails: jest.fn().mockResolvedValue({
    id: 'group-1',
    name: 'Project Team Alpha',
    photo: null,
    rules: [],
    description: '',
    settings: {onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: false},
    participants: [
      {userId: 'me', name: 'Me', role: 'admin', profilePic: null},
      {userId: 'u2', name: 'Bishod Thomas', role: 'member', profilePic: null},
    ],
  }),
  getGroupPinnedMessages: jest.fn().mockResolvedValue([]),
  sendGroupMessage: jest.fn(),
  sendGroupMedia: jest.fn(),
  sendGroupFile: jest.fn(),
  pinGroupMessage: jest.fn(),
  unpinGroupMessage: jest.fn(),
  clearGroupChat: jest.fn(),
  deleteGroup: jest.fn(),
  leaveGroup: jest.fn(),
  reportGroup: jest.fn(),
}));

jest.mock('../src/services/contactsApi', () => ({getRegisteredUser: jest.fn().mockResolvedValue(null), syncContacts: jest.fn().mockResolvedValue({registered: [], unRegistered: []})}));
jest.mock('../src/services/notificationApi', () => ({
  notifyGroupMessageOnce: jest.fn().mockResolvedValue(undefined),
  notifyMessageOnce: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/messageStore', () => ({
  loadStoredMessages: jest.fn().mockResolvedValue([]),
  storeMessages: jest.fn().mockResolvedValue(undefined),
  removeStoredThread: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/notificationService', () => ({
  clearNotificationsForChat: jest.fn().mockResolvedValue(undefined),
  setActiveNotificationChat: jest.fn(),
}));
jest.mock('../src/services/callAudio', () => ({
  handleCallAudioSignal: jest.fn(),
  setCallAudioMuted: jest.fn(),
  setCallAudioSpeaker: jest.fn(),
  startCallAudio: jest.fn().mockResolvedValue(undefined),
  startCallAudioOffer: jest.fn().mockResolvedValue(undefined),
  stopCallAudio: jest.fn().mockResolvedValue(undefined),
  subscribeToCallMedia: jest.fn(() => () => undefined),
  subscribeToCallHold: jest.fn(() => () => undefined),
}));
jest.mock('../src/services/sessionStore', () => ({getSession: () => ({token: 'jwt', user: {id: 'me', name: 'Me'}}), getToken: () => 'jwt'}));
jest.mock('../src/services/conversationPreferences', () => ({
  getConversationMuted: jest.fn().mockResolvedValue(false),
  setConversationMuted: jest.fn().mockResolvedValue(undefined),
}));

const groupContact = {userId: 'group-1', name: 'Project Team Alpha', thumbnail: null, kind: 'group' as const};
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function renderGroupThread(onStartGroupCall?: (type: 'audio' | 'video') => void) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 20, left: 0}}}>
        <ChatScreen chatId="group-1" contact={groupContact} onBack={jest.fn()} onStartGroupCall={onStartGroupCall} />
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => { await Promise.resolve(); });
  mounted.push(renderer);
  return renderer;
}

afterEach(() => {
  ReactTestRenderer.act(() => { mounted.splice(0).forEach(renderer => renderer.unmount()); });
  jest.clearAllMocks();
});

test('the group header starts a conference instead of a one-to-one call', async () => {
  const onStartGroupCall = jest.fn();
  const renderer = await renderGroupThread(onStartGroupCall);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Start a group video call in Project Team Alpha'}).props.onPress();
  });
  expect(onStartGroupCall).toHaveBeenCalledWith('video');

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Start a group voice call in Project Team Alpha'}).props.onPress();
  });
  expect(onStartGroupCall).toHaveBeenLastCalledWith('audio');

  // A conference must never fall through to the one-to-one call routes.
  expect(initiateCallOverSocket).not.toHaveBeenCalled();
  expect(startCall).not.toHaveBeenCalled();
});

test('without a conference handler the group thread says so rather than failing silently', async () => {
  const renderer = await renderGroupThread(undefined);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Start a group voice call in Project Team Alpha'}).props.onPress();
  });

  expect(initiateCallOverSocket).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({children: 'One-to-one calls are available from direct chats.'}).length).toBeGreaterThan(0);
});
