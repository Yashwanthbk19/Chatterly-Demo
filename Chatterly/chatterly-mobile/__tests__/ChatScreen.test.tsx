import {BlockConfirmation} from '../src/components/BlockConfirmation';
import {EditContactSheet} from '../src/components/EditContactSheet';
import {MediaAttachmentFlow} from '../src/components/MediaAttachmentFlow';
import {formatPhoneNumber} from '../src/utils/phoneNumber';
import {DirectChatMenu} from '../src/components/DirectChatMenu';
import * as privacyApi from '../src/services/privacyApi';
import * as disappearingMessages from '../src/services/disappearingMessages';
import {blockChatUser} from '../src/services/chatApi';
import React from 'react';
import {DeviceEventEmitter, Image, Modal, Platform, StyleSheet} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Contacts from 'expo-contacts';
import * as Clipboard from 'expo-clipboard';
import {ChatScreen} from '../src/screens/ChatScreen';
import {publishCallActivity, subscribeToCallActivity} from '../src/services/callActivity';
import {createVoiceRecordingPreview} from '../src/services/voiceRecordingPreview';

jest.mock('../src/services/voiceRecordingPreview', () => ({
  createVoiceRecordingPreview: jest.fn(async () => 'file:///cache/voice-preview.aac'),
  deleteVoiceRecordingPreview: jest.fn(),
}));
import {deleteMessage, forwardMessages, getCallStatus, getChatFiles, getChatMessages, getChatProfile, getForwardDestinations, getGroupMessages, getMediaDownloadUrl, getPinnedMessages, getSharedLinks, getSharedMedia, markChatRead, markChatUnread, pinMessage, sendChatMedia, sendChatMessage, startCall, startChat, unpinMessage} from '../src/services/chatApi';
import {
  cancelCallOverSocket,
  addCallParticipantOverSocket,
  emitChatRead,
  emitMessageDeletedForEveryone,
  emitMessagePinned,
  emitMessageUnpinned,
  endCallOverSocket,
  initiateCallOverSocket,
  joinCallRoom,
  sendGroupMessageOverSocket,
  sendMessageOverSocket,
  setCallMutedOverSocket,
  setCallSpeakerOverSocket,
  sendCallOfferOverSocket,
  subscribeToCall,
  subscribeToChat,
  subscribeToGroup,
  subscribeToGroupChanges,
} from '../src/services/chatRealtime';
import {notifyMessageOnce} from '../src/services/notificationApi';
import {syncContacts} from '../src/services/contactsApi';
import {getGroupDetails, getGroupPinnedMessages, sendGroupMedia, sendGroupMessage} from '../src/services/groupApi';
import {clearSession, saveSession} from '../src/services/sessionStore';
import type {ChatMessage, ConversationContact} from '../src/types/chat';
import {recordChatListActivity} from '../src/services/chatListActivity';

// Native screen rendering can exceed Jest's 5s default when the complete
// React Native suite is running serially on Windows CI.
jest.setTimeout(15000);

let networkListener: (state: {isConnected: boolean | null; isInternetReachable: boolean | null}) => void;
const mockNetworkListeners = new Set<typeof networkListener>();
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((listener) => {
      mockNetworkListeners.add(listener);
      networkListener = state => mockNetworkListeners.forEach(subscriber => subscriber(state));
      listener({isConnected: true, isInternetReachable: true});
      return () => mockNetworkListeners.delete(listener);
    }),
  },
}));

jest.mock('../src/services/chatApi', () => ({
  blockChatUser: jest.fn(),
  getChatMessages: jest.fn(),
  getGroupMessages: jest.fn(),
  getCallStatus: jest.fn(),
  getChatProfile: jest.fn(),
  getSharedMedia: jest.fn(),
  getSharedLinks: jest.fn(),
  getPinnedMessages: jest.fn(),
  getChatFiles: jest.fn(),
  sendChatMessage: jest.fn(),
  markChatRead: jest.fn(),
  markChatUnread: jest.fn(),
  pinMessage: jest.fn(),
  unpinMessage: jest.fn(),
  sendChatMedia: jest.fn(),
  sendChatFile: jest.fn(),
  getMediaDownloadUrl: jest.fn(),
  getForwardDestinations: jest.fn().mockResolvedValue([]),
  searchChatContacts: jest.fn().mockResolvedValue([]),
  deleteMessage: jest.fn(),
  forwardMessage: jest.fn(),
  forwardMessages: jest.fn(),
  startChat: jest.fn(),
  startCall: jest.fn(),
  locationMessage: jest.requireActual('../src/services/chatApi').locationMessage,
}));

jest.mock('../src/services/chatRealtime', () => ({
  addCallParticipantOverSocket: jest.fn(),
  cancelCallOverSocket: jest.fn(),
  endCallOverSocket: jest.fn(),
  forwardGroupMessageOverSocket: jest.fn(),
  initiateCallOverSocket: jest.fn(),
  joinCallRoom: jest.fn(),
  sendCallAnswerOverSocket: jest.fn(),
  sendCallOfferOverSocket: jest.fn(),
  sendIceCandidateOverSocket: jest.fn(),
  sendGroupMessageOverSocket: jest.fn(),
  sendMessageOverSocket: jest.fn(),
  setCallMutedOverSocket: jest.fn(),
  setCallSpeakerOverSocket: jest.fn(),
  subscribeToCall: jest.fn(),
  subscribeToChat: jest.fn(),
  subscribeToGroup: jest.fn(),
  subscribeToGroupChanges: jest.fn(),
  subscribeToOnlineUsers: jest.fn(() => () => undefined),
  subscribeToConnection: jest.fn(),
  emitChatRead: jest.fn(),
  emitMessageDeletedForEveryone: jest.fn(),
  emitMessagePinned: jest.fn(),
  emitMessageUnpinned: jest.fn(),
  emitTyping: jest.fn(),
}));
jest.mock('../src/services/chatListActivity', () => ({
  recordChatListActivity: jest.fn(),
}));
jest.mock('../src/services/groupApi', () => ({
  clearGroupChat: jest.fn(),
  deleteGroup: jest.fn(),
  getGroupDetails: jest.fn(),
  getGroupPinnedMessages: jest.fn(),
  leaveGroup: jest.fn(),
  pinGroupMessage: jest.fn(),
  reportGroup: jest.fn(),
  sendGroupFile: jest.fn(),
  sendGroupMedia: jest.fn(),
  sendGroupMessage: jest.fn(),
  unpinGroupMessage: jest.fn(),
}));
jest.mock('../src/services/conversationPreferences', () => ({
  getConversationMuted: jest.fn().mockResolvedValue(false),
  setConversationMuted: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/contactsApi', () => ({getRegisteredUser: jest.fn().mockResolvedValue(null), syncContacts: jest.fn()}));
jest.mock('../src/services/notificationApi', () => ({
  notifyGroupMessageOnce: jest.fn().mockResolvedValue(undefined),
  notifyMessageOnce: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/messageStore', () => ({
  loadStoredMessages: jest.fn().mockResolvedValue([]),
  storeMessages: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/notificationService', () => ({
  clearNotificationsForChat: jest.fn().mockResolvedValue(undefined),
  setActiveNotificationChat: jest.fn(),
}));

const contact = {userId: 'user-ananya', name: 'Ananya', thumbnail: null};

// The handlers ChatScreen hands to subscribeToChat, captured so a test can play
// the part of the server and push delivery and read receipts into the screen.
type Handlers = Parameters<typeof subscribeToChat>[2];
let handlers: Handlers;
type CallHandlers = Parameters<typeof subscribeToCall>[1];
let callHandlers: CallHandlers;
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

async function renderScreen(
  screenContact: ConversationContact = contact,
  screenChatId = 'chat-1',
  props: Partial<React.ComponentProps<typeof ChatScreen>> = {},
) {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{
        frame: {x: 0, y: 0, width: 307, height: 641},
        insets: {top: 24, right: 0, bottom: 18, left: 0},
      }}>
        <ChatScreen chatId={screenChatId} contact={screenContact} onBack={jest.fn()} {...props} />
      </SafeAreaProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
  mountedRenderers.push(renderer!);
  return renderer!;
}

/** Lets the send pipeline's chained awaits settle without blocking on them. */
async function flush() {
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

test.each([
  ['android', 'direct'], ['ios', 'direct'], ['android', 'group'], ['ios', 'group'],
] as const)('opens the full DP from the header and info page on %s in a %s chat', async (platform, kind) => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  const uri = `https://cdn.example/${kind}-full.jpg`;
  const name = kind === 'group' ? 'Photo Group' : 'Ananya';
  jest.mocked(getChatProfile).mockResolvedValue({userId:'user-ananya',name,profilePic:uri,status:'Offline',online:false});
  jest.mocked(getGroupDetails).mockResolvedValue({
    id:'photo-group',name,photo:uri,rules:[],participants:[{userId:'me',name:'Me',role:'member'}],
    settings:{onlyAdminsCanMessage:false,onlyAdminsCanShareMedia:false},
  });
  try {
    const renderer = await renderScreen(kind === 'group'
      ? {userId:'photo-group',name,kind:'group',thumbnail:'https://cdn.example/old.jpg'}
      : {...contact,thumbnail:'https://cdn.example/old.jpg'});
    const fullImage = () => renderer.root.findByProps({accessibilityLabel:`${name} full profile picture`});
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel:`View ${name} profile picture`}).props.onPress());
    expect(fullImage().type).toBe(Image);
    expect(fullImage().props).toEqual(expect.objectContaining({source:{uri},resizeMode:'contain'}));
    const modal = renderer.root.findAllByType(Modal).find(node => node.props.presentationStyle === 'fullScreen')!;
    await ReactTestRenderer.act(async () => modal.props.onRequestClose());
    expect(renderer.root.findAllByProps({accessibilityLabel:`${name} full profile picture`})).toHaveLength(0);
    await ReactTestRenderer.act(async () => renderer.root.findAllByProps({accessibilityLabel:`Open ${name} contact`})[0].props.onPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel:kind === 'group' ? 'View group profile picture' : 'View contact profile picture'}).props.onPress());
    expect(fullImage().props.source).toEqual({uri});
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel:'Close profile picture'}).props.onPress());
    expect(renderer.root.findAllByProps({accessibilityLabel:`${name} full profile picture`})).toHaveLength(0);
  } finally {
    os.restore();
  }
});

/**
 * Types into the composer and taps Send, exactly as the wireframe describes.
 * The press is deliberately not awaited: several tests hold the ACK open to
 * inspect the "Sending" state, and awaiting would deadlock on that promise.
 */
async function sendMessage(renderer: ReactTestRenderer.ReactTestRenderer, text: string) {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Type a message'}).props.onChangeText(text);
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Send message'}).props.onPress();
  });
  await flush();
}

/** The status label rendered under our own bubble. */
function statusOf(renderer: ReactTestRenderer.ReactTestRenderer, ...labels: string[]) {
  return labels.filter(label => renderer.root.findAllByProps({accessibilityLabel: label}).length > 0);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNetworkListeners.clear();
  jest.mocked(Clipboard.hasImageAsync).mockResolvedValue(false);
  jest.mocked(Clipboard.getImageAsync).mockResolvedValue(null);
  const audio = require('expo-audio');
  audio.__recorder.uri = 'file:///voice.m4a';
  audio.__recorder.getStatus.mockImplementation(() => audio.__recorderState);
  audio.__recorder.prepareToRecordAsync.mockResolvedValue(undefined);
  audio.__recorder.record.mockImplementation(() => undefined);
  audio.__recorder.pause.mockImplementation(() => undefined);
  audio.__recorder.stop.mockResolvedValue(undefined);
  audio.__recorderState.canRecord = true;
  audio.__recorderState.isRecording = false;
  audio.__recorderState.durationMillis = 20000;
  audio.__recorderState.url = 'file:///voice.m4a';
  audio.__playerStatus.playing = false;
  audio.__playerStatus.currentTime = 0;
  audio.__playerStatus.duration = 0;
  audio.__playerStatus.didJustFinish = false;
  audio.__player.play.mockClear();
  audio.__player.pause.mockClear();
  audio.__player.release.mockClear();
  audio.__player.seekTo.mockClear();
  jest.mocked(createVoiceRecordingPreview).mockResolvedValue('file:///cache/voice-preview.aac');
  audio.getRecordingPermissionsAsync.mockResolvedValue({granted: true});
  audio.requestRecordingPermissionsAsync.mockResolvedValue({granted: true});
  audio.setAudioModeAsync.mockResolvedValue(undefined);
  jest.mocked(getChatMessages).mockResolvedValue([]);
  jest.mocked(getGroupMessages).mockResolvedValue([]);
  jest.mocked(getPinnedMessages).mockResolvedValue([]);
  jest.mocked(getChatFiles).mockResolvedValue([]);
  jest.mocked(markChatRead).mockResolvedValue(undefined);
  jest.mocked(markChatUnread).mockResolvedValue(undefined);
  jest.mocked(pinMessage).mockResolvedValue(undefined);
  jest.mocked(unpinMessage).mockResolvedValue(undefined);
  jest.mocked(deleteMessage).mockResolvedValue(undefined);
  jest.mocked(getForwardDestinations).mockResolvedValue([]);
  jest.mocked(startChat).mockResolvedValue({chatId:'chat-target',chat:{}});
  jest.mocked(sendMessageOverSocket).mockResolvedValue({
    success: true,
    tempId: 'temp',
    messageId: 'server-1',
    status: 'sent',
  });
  jest.mocked(sendGroupMessageOverSocket).mockImplementation(async payload => ({
    id: 'group-server-1',
    tempId: payload.tempId,
    text: payload.text || '',
    createdAt: '2026-09-18T10:00:00.000Z',
    isOwn: true,
    status: 'sent',
  }));
  jest.mocked(sendGroupMessage).mockResolvedValue({
    id: 'group-rest-1',
    text: 'Hello group',
    createdAt: '2026-09-18T10:00:00.000Z',
    isOwn: true,
    status: 'sent',
  });
  jest.mocked(getGroupPinnedMessages).mockResolvedValue([]);
  jest.mocked(getGroupDetails).mockResolvedValue({
    id: 'group-1',
    name: 'Bharath Don',
    description: '',
    rules: [],
    settings: {onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: false},
    participants: [{userId: 'me', name: 'Me', role: 'superadmin'}],
  });
  jest.mocked(sendChatMessage).mockResolvedValue({
    id: 'rest-1',
    text: 'Hello Ananya',
    createdAt: '2026-08-19T06:00:00.000Z',
    isOwn: true,
    status: 'sent',
  });
  jest.mocked(sendChatMedia).mockResolvedValue({
    id: 'voice-server-1',
    text: '',
    createdAt: '2026-08-19T06:00:00.000Z',
    isOwn: true,
    status: 'sent',
    messageType: 'audio',
    mediaUrl: 'https://cdn.example/voice.m4a',
    audioDuration: 20,
    waveform: [5, 8, 12, 7, 18, 10],
  });
  jest.mocked(startCall).mockResolvedValue({message: 'Call initiated successfully', callId: 'rest-call-1', status: 'ringing'});
  jest.mocked(getCallStatus).mockResolvedValue('ringing');
  jest.mocked(getChatProfile).mockResolvedValue({userId: 'user-aarav', name: 'Aarav Sharma', profilePic: null, phone: '+919999999999', status: 'We simply exist to eat healthy !', online: true});
  jest.mocked(getSharedMedia).mockResolvedValue([]);
  jest.mocked(getSharedLinks).mockResolvedValue([]);
  jest.mocked(syncContacts).mockResolvedValue({registered: [], unRegistered: []});
  jest.mocked(addCallParticipantOverSocket).mockResolvedValue({success: true, message: 'Conference invitation sent', callId: 'call-1', chatId: 'chat-1'});
  jest.mocked(initiateCallOverSocket).mockResolvedValue({success: true, message: 'Call initiated successfully', callId: 'call-1', chatId: 'chat-1', status: 'ringing'});
  jest.mocked(joinCallRoom).mockResolvedValue({success: true, message: 'Joined call room', callId: 'call-1', chatId: 'chat-1'});
  jest.mocked(endCallOverSocket).mockResolvedValue({success: true, message: 'Call ended', callId: 'call-1', chatId: 'chat-1'});
  jest.mocked(cancelCallOverSocket).mockResolvedValue({success: true, message: 'Call cancelled', callId: 'call-1', chatId: 'chat-1'});
  jest.mocked(setCallMutedOverSocket).mockResolvedValue({success: true, message: 'Call muted', callId: 'call-1', chatId: 'chat-1'});
  jest.mocked(setCallSpeakerOverSocket).mockResolvedValue({success: true, message: 'Speaker on', callId: 'call-1', chatId: 'chat-1'});
  jest.mocked(subscribeToChat).mockImplementation((_chatId, _contactId, given) => {
    handlers = given;
    return () => undefined;
  });
  jest.mocked(subscribeToGroup).mockReturnValue(() => undefined);
  jest.mocked(subscribeToGroupChanges).mockReturnValue(() => undefined);
  jest.mocked(subscribeToCall).mockImplementation((_callId, given) => {
    callHandlers = given;
    return () => undefined;
  });
  jest.mocked(require('../src/services/chatRealtime').subscribeToConnection)
    .mockImplementation((listener: (state: string) => void) => {
      listener('connected');
      return () => undefined;
    });
});

afterEach(() => {
  ReactTestRenderer.act(() => {
    mountedRenderers.splice(0).forEach(renderer => renderer.unmount());
  });
});

test('keeps the saved phone in chat details when the account lookup fails and the profile omits it', async () => {
  require('../src/services/contactsApi').getRegisteredUser.mockRejectedValueOnce(new Error('Offline'));
  const phone = '+919876543210';
  const renderer = await renderScreen({...contact, phone});
  expect(renderer.root.findAllByType(EditContactSheet).every(sheet => sheet.props.phone === phone)).toBe(true);
  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Open Ananya contact'})[0].props.onPress();
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: `Mobile number ${formatPhoneNumber(phone)}`}).length).toBeGreaterThan(0);
});

test('shows typing inside the conversation and restores presence when it stops', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => handlers.onTyping(true));
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Ananya is typing'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'typing… status'}).length).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => handlers.onTyping(false));
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Ananya is typing'})).toHaveLength(0);
});

test('loads an empty conversation with the connected state from the wireframe', async () => {
  const renderer = await renderScreen();

  expect(getChatMessages).toHaveBeenCalledWith('chat-1');
  expect(getPinnedMessages).toHaveBeenCalledWith('chat-1');
  expect(renderer.root.findByProps({accessibilityLabel: "You're connected with Ananya"})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Type a message'})).toBeDefined();
  const banner = renderer.root.findByProps({accessibilityLabel: 'Connected'});
  expect(StyleSheet.flatten(banner.props.style).backgroundColor).toBe('#DCFCE7');
});

const timerHistory: ChatMessage[] = [
  {id: 'timer-24h', text: 'Disappearing message timer updated.', createdAt: '2026-09-18T10:00:00.000Z', isOwn: true, systemEvent: true, systemEventType: 'disappearing_timer', disappearingTimer: '24h'},
  {id: 'keep-text', text: 'Keep this conversation message', createdAt: '2026-09-18T10:01:00.000Z', isOwn: false},
  {id: 'timer-7d', text: 'Disappearing message timer updated.', createdAt: '2026-09-18T10:02:00.000Z', isOwn: true, systemEvent: true, systemEventType: 'disappearing_timer', disappearingTimer: '7d'},
];

test('turning the chat timer off clears every timer card and stays cleared after reopening', async () => {
  const saveTimer = jest.spyOn(disappearingMessages, 'setChatDisappearingTimer').mockResolvedValue(undefined);
  try {
    await disappearingMessages.setStoredChatDisappearingTimer('timer-disable', '7d');
    jest.mocked(getChatMessages).mockResolvedValue(timerHistory);
    const renderer = await renderScreen(contact, 'timer-disable');
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Update Timer'}).length).toBeGreaterThan(0);

    await ReactTestRenderer.act(async () => {
      await renderer.root.findByType(DirectChatMenu).props.onDisappearingTimerChange('off');
    });

    expect(saveTimer).toHaveBeenCalledWith(contact.userId, 'off');
    expect(await disappearingMessages.getStoredChatDisappearingTimer('timer-disable')).toBe('off');
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Update Timer'})).toHaveLength(0);
    expect(renderer.root.findByType(DirectChatMenu).props.currentTimer).toBe('off');
    expect(renderer.root.findAllByProps({children: 'Keep this conversation message'}).length).toBeGreaterThan(0);
    const reopened = await renderScreen(contact, 'timer-disable');
    expect(reopened.root.findAllByProps({accessibilityLabel: 'Update Timer'})).toHaveLength(0);
    expect(reopened.root.findByType(DirectChatMenu).props.currentTimer).toBe('off');
  } finally {
    saveTimer.mockRestore();
  }
});

test('a received off event removes previous timer cards and selects Off in the chat menu', async () => {
  jest.mocked(getChatMessages).mockResolvedValue(timerHistory);
  const renderer = await renderScreen(contact, 'timer-remote-off');
  await ReactTestRenderer.act(async () => handlers.onMessage({
    id: 'timer-off', text: 'Disappearing messages were turned off.', createdAt: '2026-09-18T10:03:00.000Z',
    isOwn: false, systemEvent: true, systemEventType: 'disappearing_timer', disappearingTimer: 'off',
  }));
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Update Timer'})).toHaveLength(0);
  expect(renderer.root.findByType(DirectChatMenu).props.currentTimer).toBe('off');
  expect(renderer.root.findAllByProps({children: 'Keep this conversation message'}).length).toBeGreaterThan(0);
});

test('a failed timer disable leaves the existing timer and its cards intact', async () => {
  const saveTimer = jest.spyOn(disappearingMessages, 'setChatDisappearingTimer').mockRejectedValue(new Error('Offline'));
  try {
    await disappearingMessages.setStoredChatDisappearingTimer('timer-disable-failed', '7d');
    jest.mocked(getChatMessages).mockResolvedValue(timerHistory);
    const renderer = await renderScreen(contact, 'timer-disable-failed');
    await ReactTestRenderer.act(async () => {
      await expect(renderer.root.findByType(DirectChatMenu).props.onDisappearingTimerChange('off')).rejects.toThrow('Offline');
    });
    expect(await disappearingMessages.getStoredChatDisappearingTimer('timer-disable-failed')).toBe('7d');
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Update Timer'}).length).toBeGreaterThan(0);
    expect(renderer.root.findByType(DirectChatMenu).props.currentTimer).toBe('7d');
  } finally {
    saveTimer.mockRestore();
  }
});

test('shows API last seen in the one-to-one header and follows live presence updates', async () => {
  const initialLastSeen = '2026-08-19T10:00:00.000Z';
  jest.mocked(getChatProfile).mockResolvedValueOnce({
    userId: 'user-ananya',
    name: 'Ananya',
    profilePic: null,
    status: 'Offline',
    lastSeen: initialLastSeen,
    online: false,
  });
  const renderer = await renderScreen();
  const labelFor = (value: string) => {
    const date = new Date(value);
    return `Last seen ${date.toLocaleDateString([], {month: 'short', day: 'numeric'})} at ${date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}`;
  };

  expect(getChatProfile).toHaveBeenCalledWith('user-ananya');
  expect(renderer.root.findByProps({accessibilityLabel: `${labelFor(initialLastSeen)} status`})).toBeDefined();

  await ReactTestRenderer.act(async () => handlers.onPresence('online', null));
  expect(renderer.root.findByProps({accessibilityLabel: 'Online status'})).toBeDefined();

  const updatedLastSeen = '2026-08-19T11:30:00.000Z';
  await ReactTestRenderer.act(async () => handlers.onPresence('offline', updatedLastSeen));
  expect(renderer.root.findByProps({accessibilityLabel: `${labelFor(updatedLastSeen)} status`})).toBeDefined();
});

test('shows pinned messages newest first and expands the remaining pins', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([
    {id: 'old-pin', text: 'Bring documents', createdAt: '2026-08-19T06:00:00.000Z', isOwn: false, isPinned: true, pinnedAt: '2026-08-19T06:05:00.000Z'},
    {id: 'new-pin', text: 'Yes, At 5 PM', createdAt: '2026-08-19T06:01:00.000Z', isOwn: false, isPinned: true, pinnedAt: '2026-08-19T06:10:00.000Z'},
  ]);
  jest.mocked(getPinnedMessages).mockResolvedValue([
    {id: 'new-pin', text: 'Yes, At 5 PM', createdAt: '2026-08-19T06:01:00.000Z', isOwn: false, isPinned: true, pinnedAt: '2026-08-19T06:10:00.000Z'},
    {id: 'old-pin', text: 'Bring documents', createdAt: '2026-08-19T06:00:00.000Z', isOwn: false, isPinned: true, pinnedAt: '2026-08-19T06:05:00.000Z'},
  ]);

  const renderer = await renderScreen();

  expect(renderer.root.findByProps({accessibilityLabel: '2 pinned messages'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Pinned message: Yes, At 5 PM'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Pinned message: Bring documents'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({children: 'Pinned until unpinned'}).length).toBeGreaterThan(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Pinned message: Yes, At 5 PM'}).props.accessibilityHint).toContain('Pinned until unpinned');

  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Expand pinned messages'})[0].props.onPress();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Pinned message: Bring documents'})).toBeDefined();
  const olderPin = renderer.root.findByProps({accessibilityLabel: 'Pinned message: Bring documents'});
  expect(olderPin.findAllByProps({children: 'Pinned until unpinned'}).length).toBeGreaterThan(0);
});

test('long-pressing the pinned banner opens its compact action sheet', async () => {
  const pinned = {id:'banner-pin',text:'Yes, At 5 PM',createdAt:'2026-08-19T06:01:00.000Z',isOwn:false,isPinned:true,pinnedAt:'2026-08-19T06:10:00.000Z'};
  jest.mocked(getChatMessages).mockResolvedValue([pinned]);
  jest.mocked(getPinnedMessages).mockResolvedValue([pinned]);
  const renderer = await renderScreen();
  const banner = renderer.root.findByProps({accessibilityLabel:'Pinned message: Yes, At 5 PM'});

  await ReactTestRenderer.act(async () => banner.props.onLongPress());
  expect(renderer.root.findByProps({accessibilityLabel:'Pinned banner actions'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Open pinned banner message in chat'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Show all pinned messages'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Unpin banner message'})).toBeDefined();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel:'Open pinned banner message in chat'}).props.onPress());
  expect(renderer.root.findAllByProps({accessibilityLabel:'Pinned banner actions'})).toHaveLength(0);

  await ReactTestRenderer.act(async () => banner.props.onLongPress());
  await ReactTestRenderer.act(async () => {renderer.root.findByProps({accessibilityLabel:'Unpin banner message'}).props.onPress(); await Promise.resolve();});
  expect(unpinMessage).toHaveBeenCalledWith('banner-pin');
  expect(renderer.root.findAllByProps({accessibilityLabel:'Pinned message: Yes, At 5 PM'})).toHaveLength(0);
});

test('pins and unpins a message from the message action sheet', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([
    {id: 'pin-target', text: 'Important address', createdAt: '2026-08-19T06:00:00.000Z', isOwn: false},
  ]);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Important address'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Pin message'}).props.onPress();
    await Promise.resolve();
  });
  await flush();

  expect(pinMessage).toHaveBeenCalledWith('pin-target');
  expect(emitMessagePinned).toHaveBeenCalledWith('pin-target');
  expect(renderer.root.findByProps({accessibilityLabel: 'Pinned message: Important address'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Important address'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Unpin message'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Unpin message'}).props.onPress();
    await Promise.resolve();
  });
  await flush();

  expect(unpinMessage).toHaveBeenCalledWith('pin-target');
  expect(emitMessageUnpinned).toHaveBeenCalledWith('pin-target');
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Pinned message: Important address'})).toHaveLength(0);
});

test('hides the connection banner 2.5 seconds after the chat opens', async () => {
  jest.useFakeTimers();
  try {
    const renderer = await renderScreen();
    expect(renderer.root.findByProps({accessibilityLabel: 'Connected'})).toBeDefined();

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(2500);
    });

    expect(renderer.root.findAllByProps({accessibilityLabel: 'Connected'})).toHaveLength(0);
  } finally {
    jest.useRealTimers();
  }
});

test('shows the microphone on an empty composer and the send button once there is a draft', async () => {
  const renderer = await renderScreen();

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Record voice message'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Send message'})).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Type a message'}).props.onChangeText('Hi');
  });

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Send message'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Record voice message'})).toHaveLength(0);
});

test('a Call List callback waits for a pending message send before starting the selected call', async () => {
  let completeSend!: (value: any) => void;
  jest.mocked(sendMessageOverSocket).mockImplementationOnce(() => new Promise(resolve => { completeSend = resolve; }));
  const handled = jest.fn();
  const renderer = await renderScreen(contact, 'chat-1', {onCallRequestHandled: handled});
  await sendMessage(renderer, 'Sending before callback');
  const props = renderer.root.findByType(ChatScreen).props as React.ComponentProps<typeof ChatScreen>;
  await ReactTestRenderer.act(async () => {
    renderer.update(<SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 307, height: 641}, insets: {top: 24, right: 0, bottom: 18, left: 0}}}>
      <ChatScreen {...props} callRequest={{id: 'call-list-request', type: 'audio'}}/>
    </SafeAreaProvider>);
  });
  expect(handled).not.toHaveBeenCalled();
  expect(initiateCallOverSocket).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    completeSend({success: true, tempId: 'message-1', messageId: 'sent-message', status: 'sent'});
  });
  await flush();
  expect(handled).toHaveBeenCalledTimes(1);
  expect(initiateCallOverSocket).toHaveBeenCalledWith(contact.userId, 'audio');
});

test('asks for microphone access before starting a one-to-one voice call', async () => {
  const audio = require('expo-audio');
  audio.getRecordingPermissionsAsync.mockResolvedValueOnce({granted: false});
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Allow Microphone Access'})).toBeDefined();
  expect(initiateCallOverSocket).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Allow microphone access'}).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(audio.requestRecordingPermissionsAsync).toHaveBeenCalled();
  expect(initiateCallOverSocket).toHaveBeenCalledWith('user-ananya', 'audio');
  expect(renderer.root.findByProps({accessibilityLabel: 'One-to-One Voice Call ringing'})).toBeDefined();
});

test('shows calling silently, then changes to ringing and starts ringback', async () => {
  const audio = require('expo-audio');
  jest.mocked(initiateCallOverSocket).mockResolvedValueOnce({success: true, message: 'Call initiated successfully', callId: 'call-1', chatId: 'chat-1', status: 'calling'});
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Calling...'})).toBeDefined();
  expect(audio.__player.play).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Minimize call'})).toHaveLength(0);
  const videoControl = renderer.root.findAllByProps({accessibilityLabel: 'Video'}).find(node => node.props.accessibilityState);
  expect(videoControl?.props.accessibilityState.disabled).toBe(true);
  expect(renderer.root.findByProps({accessibilityLabel: 'More'}).props.accessibilityState.disabled).toBe(true);

  await ReactTestRenderer.act(async () => {
    callHandlers.onStatus?.({callId: 'call-1', status: 'ringing'});
    await Promise.resolve();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Ringing...'})).toBeDefined();
  expect(audio.__player.play).toHaveBeenCalledTimes(1);
});

test('shows Call Declined when the remote participant rejects the outgoing call', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    callHandlers.onRejected?.({callId: 'call-1', rejectedBy: 'user-ananya'});
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('Call Declined');
  expect(JSON.stringify(renderer.toJSON())).not.toContain('Call Ended');
});

test('minimizes an active call for mobile navigation without ending it', async () => {
  const renderer = await renderScreen(contact, 'chat-1', {minimizeCallRequest: 1});

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Active call controls'})).toBeDefined();
  expect(endCallOverSocket).not.toHaveBeenCalled();
  expect(cancelCallOverSocket).not.toHaveBeenCalled();
});

test('plays ringback audio while the one-to-one call is ringing', async () => {
  const audio = require('expo-audio');
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Ringing...'})).toBeDefined();
  expect(audio.__player.play).toHaveBeenCalled();
});

test('stops and releases ringback audio when a ringing call ends', async () => {
  const audio = require('expo-audio');
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });
  const pausesBeforeEnd = audio.__player.pause.mock.calls.length;
  const releasesBeforeEnd = audio.__player.release.mock.calls.length;

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'End'}).props.onPress();
    await Promise.resolve();
  });

  expect(cancelCallOverSocket).toHaveBeenCalledWith('call-1');
  expect(audio.__player.pause).toHaveBeenCalledTimes(pausesBeforeEnd + 1);
  expect(audio.__player.release).toHaveBeenCalledTimes(releasesBeforeEnd + 1);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'One-to-One Voice Call ringing'})).toHaveLength(0);
});

test.each(['android', 'ios'] as const)('shows Mute and switches the supplied mic icons on an outgoing call on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
    const renderer = await renderScreen();
    await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress(); });
    await ReactTestRenderer.act(async () => { callHandlers.onConnected?.({callId: 'call-1', status: 'connected', startedAt: new Date().toISOString()}); });
    expect(renderer.root.findByProps({testID: 'call-mic-on-icon'}).props).toEqual(expect.objectContaining({width: 32, height: 32}));
    expect(renderer.root.findByProps({children: 'Mute'})).toBeDefined();
    expect(renderer.root.findAllByProps({children: 'Mic On'})).toHaveLength(0);
    await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Mute'}).props.onPress(); });
    expect(renderer.root.findByProps({testID: 'call-mic-off-icon'}).props).toEqual(expect.objectContaining({width: 32, height: 32}));
    expect(setCallMutedOverSocket).toHaveBeenCalledWith('call-1', true);
    expect(renderer.root.findByProps({children: 'Mute'})).toBeDefined();
    await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Unmute'}).props.onPress(); });
    expect(renderer.root.findByProps({testID: 'call-mic-on-icon'})).toBeDefined();
    expect(setCallMutedOverSocket).toHaveBeenCalledWith('call-1', false);
  } finally { os.restore(); }
});

test('enables connected call controls and sends mute speaker and end events', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    callHandlers.onConnected?.({callId: 'call-1', status: 'connected', startedAt: new Date().toISOString()});
    await Promise.resolve();
  });

  expect(joinCallRoom).toHaveBeenCalledWith('call-1');
  expect(renderer.root.findByProps({accessibilityLabel: 'Minimize call'})).toBeDefined();
  const videoControl = () => renderer.root.findAllByProps({accessibilityLabel: 'Video'}).find(node => node.props.accessibilityState)!;
  expect(videoControl().props.accessibilityState.disabled).toBe(false);
  expect(renderer.root.findByProps({accessibilityLabel: 'More'}).props.accessibilityState.disabled).toBe(false);

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Speaker'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Mute'}).props.onPress());
  await ReactTestRenderer.act(async () => videoControl().props.onPress());

  expect(renderer.root.findByProps({accessibilityLabel: 'Speaker'}).props.accessibilityState.selected).toBe(true);
  const muteControl = renderer.root.findAllByProps({accessibilityLabel: 'Unmute'}).find(node => node.props.accessibilityState);
  expect(muteControl?.props.accessibilityState.selected).toBe(true);
  expect(videoControl().props.accessibilityState.selected).toBe(true);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'More'}).props.onPress());

  expect(setCallSpeakerOverSocket).toHaveBeenCalledWith('call-1', true);
  expect(setCallMutedOverSocket).toHaveBeenCalledWith('call-1', true);
  expect(renderer.root.findByProps({accessibilityLabel: 'More Options'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Add People to Call'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Share Screen'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Audio Output'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Microphone Settings'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Auto Reconnect'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'View Contact'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Call Status'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'End'}).props.onPress();
    await Promise.resolve();
  });

  expect(endCallOverSocket).toHaveBeenCalledWith('call-1');
  expect(renderer.root.findAllByProps({accessibilityLabel: 'One-to-One Voice Call connected'})).toHaveLength(0);
});

test('hangs up the caller from the ongoing call notification without changing call screens', async () => {
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    renderer = await renderScreen();
    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      callHandlers.onConnected?.({callId: 'call-1', status: 'connected', startedAt: new Date().toISOString()});
    });
    await ReactTestRenderer.act(async () => {
      DeviceEventEmitter.emit('chatterly.callBackgroundEnd', {callId: 'old-call'});
    });
    expect(endCallOverSocket).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      DeviceEventEmitter.emit('chatterly.callBackgroundEnd', {callId: 'call-1'});
    });
    expect(endCallOverSocket).toHaveBeenCalledTimes(1);
    expect(endCallOverSocket).toHaveBeenCalledWith('call-1');
    expect(renderer.root.findAllByProps({accessibilityLabel: 'One-to-One Voice Call connected'})).toHaveLength(0);
  } finally {
    if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
    os.restore();
  }
});

test('recovers a missed connected event from call details and sends the WebRTC offer', async () => {
  jest.mocked(getCallStatus).mockResolvedValue('connected');
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await flush();
  });
  await ReactTestRenderer.act(async () => { await flush(); });

  expect(getCallStatus).toHaveBeenCalledWith('call-1');
  expect(renderer.root.findByProps({accessibilityLabel: 'One-to-One Voice Call connected'})).toBeDefined();
  expect(sendCallOfferOverSocket).toHaveBeenCalledWith('call-1', expect.objectContaining({type: 'offer'}));
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'End'}).props.onPress();
    await flush();
  });
});

test('continues an answered call across a brief network handover without starting another call', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    callHandlers.onConnected?.({callId: 'call-1', status: 'connected', startedAt: new Date().toISOString()});
  });
  await ReactTestRenderer.act(async () => {
    networkListener({isConnected: false, isInternetReachable: false});
    callHandlers.onConnectionChange?.({callId: 'call-1', type: 'disconnected'});
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Call Failed'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => {
    networkListener({isConnected: true, isInternetReachable: true});
    const peer = require('react-native-webrtc').__peerConnections.at(-1);
    peer.connectionState = 'connected';
    peer.onconnectionstatechange();
  });
  expect(initiateCallOverSocket).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByProps({accessibilityLabel: 'One-to-One Voice Call connected'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Call Failed'})).toHaveLength(0);
});

test('shows call failed after a sustained network outage and lets the user call again', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    callHandlers.onConnected?.({callId: 'call-1', status: 'connected', startedAt: new Date().toISOString()});
  });
  jest.useFakeTimers();
  try {
  await ReactTestRenderer.act(async () => {
    networkListener({isConnected: false, isInternetReachable: false});
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Call Failed'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => { await jest.advanceTimersByTimeAsync(15000); });

  expect(renderer.root.findByProps({accessibilityLabel: 'Call Failed'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Call Again'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Cancel'})).toBeDefined();

  await ReactTestRenderer.act(async () => networkListener({isConnected: true, isInternetReachable: true}));
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Again'}).props.onPress();
    await Promise.resolve();
  });

  expect(initiateCallOverSocket).toHaveBeenCalledTimes(2);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Call Failed'})).toHaveLength(0);
  } finally { jest.useRealTimers(); }
});

test('shows Audio Call Again after a call ends and redials the same contact by audio', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await flush();
  });
  await ReactTestRenderer.act(async () => {
    callHandlers.onEnded?.({callId: 'call-1', duration: 30});
    await flush();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Audio Call Again'})).toBeDefined();
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Audio Call Again'}).props.onPress();
    await flush();
  });

  expect(initiateCallOverSocket).toHaveBeenLastCalledWith('user-ananya', 'audio');
});

test('retrieves the current call status from the documented call details endpoint', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });
  jest.mocked(getCallStatus).mockResolvedValue('connected');
  await ReactTestRenderer.act(async () => {
    callHandlers.onConnected?.({callId: 'call-1', status: 'connected', startedAt: new Date().toISOString()});
  });
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'More'}).props.onPress());
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Call Status'}).props.onPress();
    await Promise.resolve();
  });

  expect(getCallStatus).toHaveBeenCalledWith('call-1');
  expect(renderer.root.findByProps({accessibilityLabel: 'Call Status details'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Network Status: Stable'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Audio Quality: Excellent'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Auto Reconnect: Enabled'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Echo Cancellation: Active'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Noise Suppression: Active'})).toBeDefined();
});

test('opens the audio output and microphone settings sheets from more options', async () => {
  const audio = require('expo-audio');
  // Audio Output lists the devices expo-audio reports: two paired Bluetooth
  // devices that can carry a call, next to the built-in microphone.
  audio.__recorder.getAvailableInputs = jest.fn(() => [
    {name: 'Built-in microphone', type: 'MicrophoneBuiltIn', uid: '1'},
    {name: 'JBL Flip 5', type: 'BluetoothSCO', uid: '7'},
    {name: 'Bluetooth Headset', type: 'BluetoothHFP', uid: '8'},
  ]);
  audio.__recorder.setInput = jest.fn();
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => callHandlers.onConnected?.({callId: 'call-1', status: 'connected', startedAt: new Date().toISOString()}));

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'More'}).props.onPress());
  // A call starts on the earpiece, which the design calls "Headset".
  expect(renderer.root.findByProps({accessibilityLabel: 'Audio Output'}).findByProps({children: 'Headset'})).toBeDefined();
  expect(renderer.root.findAllByProps({children: 'Earpiece'})).toHaveLength(0);
  const speakerPath = 'M27.625 20.0002C28.2719 20.466 28.7969 21.0699 29.1585 21.7641C29.5201 22.4584 29.7083 23.224 29.7083 24.0002C29.7083 24.7764 29.5201 25.542 29.1585 26.2363C28.7969 26.9306 28.2719 27.5345 27.625 28.0002M30.4375 17.0002C31.525 17.8439 32.4021 18.9103 33.0047 20.1215C33.6072 21.3327 33.9199 22.658 33.9199 24.0002C33.9199 25.3425 33.6072 26.6677 33.0047 27.8789C32.4021 29.0901 31.525 30.1566 30.4375 31.0002M18.25 27.0002H16.1667C15.8904 27.0002 15.6254 26.8949 15.4301 26.7073C15.2347 26.5198 15.125 26.2654 15.125 26.0002V22.0002C15.125 21.735 15.2347 21.4806 15.4301 21.2931C15.6254 21.1056 15.8904 21.0002 16.1667 21.0002H18.25L21.8958 16.5002C21.9869 16.3304 22.1382 16.1975 22.3224 16.1255C22.5066 16.0535 22.7116 16.0471 22.9003 16.1075C23.089 16.1678 23.2489 16.291 23.3513 16.4548C23.4536 16.6185 23.4916 16.812 23.4583 17.0002V31.0002C23.4916 31.1885 23.4536 31.3819 23.3513 31.5457C23.2489 31.7094 23.089 31.8326 22.9003 31.893C22.7116 31.9534 22.5066 31.947 22.3224 31.8749C22.1382 31.8029 21.9869 31.67 21.8958 31.5002L18.25 27.0002Z';
  const microphonePath = 'M17.2084 22C17.2084 23.8565 17.9766 25.637 19.3441 26.9497C20.7115 28.2625 22.5662 29 24.5 29M24.5 29C26.4339 29 28.2886 28.2625 29.656 26.9497C31.0235 25.637 31.7917 23.8565 31.7917 22M24.5 29V33M20.3334 33H24.5M24.5 33H28.6667M21.375 17C21.375 16.2044 21.7043 15.4413 22.2903 14.8787C22.8764 14.3161 23.6712 14 24.5 14C25.3288 14 26.1237 14.3161 26.7097 14.8787C27.2958 15.4413 27.625 16.2044 27.625 17V22C27.625 22.7956 27.2958 23.5587 26.7097 24.1213C26.1237 24.6839 25.3288 25 24.5 25C23.6712 25 22.8764 24.6839 22.2903 24.1213C21.7043 23.5587 21.375 22.7956 21.375 22V17Z';
  const reconnectPath = 'M32.8333 23.0007C32.5785 21.2409 31.7282 19.6103 30.4131 18.3602C29.0981 17.11 27.3914 16.3096 25.5559 16.0822C23.7204 15.8549 21.8579 16.2132 20.2554 17.1019C18.6529 17.9907 17.3992 19.3606 16.6875 21.0007M16.1666 17.0007V21.0007H20.3333M16.1666 25.0007C16.4214 26.7605 17.2718 28.391 18.5868 29.6412C19.9018 30.8914 21.6085 31.6918 23.4441 31.9191C25.2796 32.1465 27.142 31.7882 28.7445 30.8994C30.3471 30.0107 31.6007 28.6407 32.3125 27.0007M32.8333 31.0007V27.0007H28.6666';
  expect(renderer.root.findByProps({accessibilityLabel: 'Audio Output'}).findByProps({d: speakerPath})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Microphone Settings'}).findByProps({d: microphonePath})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Auto Reconnect'}).findByProps({d: reconnectPath})).toBeDefined();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Audio Output'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Audio Output options'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Use Headset'}).props.accessibilityState.selected).toBe(true);
  expect(renderer.root.findByProps({accessibilityLabel: 'Use Speaker'}).props.accessibilityState.selected).toBe(false);
  expect(renderer.root.findByProps({accessibilityLabel: 'Use No Audio'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Use JBL Flip 5'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Use Headset'}).findByProps({d: 'M5.75 1.75H7.75M6.75 14.75V14.76M0.75 2.75C0.75 2.21957 0.960714 1.71086 1.33579 1.33579C1.71086 0.960714 2.21957 0.75 2.75 0.75H10.75C11.2804 0.75 11.7891 0.960714 12.1642 1.33579C12.5393 1.71086 12.75 2.21957 12.75 2.75V16.75C12.75 17.2804 12.5393 17.7891 12.1642 18.1642C11.7891 18.5393 11.2804 18.75 10.75 18.75H2.75C2.21957 18.75 1.71086 18.5393 1.33579 18.1642C0.960714 17.7891 0.75 17.2804 0.75 16.75V2.75Z'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Use JBL Flip 5'}).findByProps({d: 'M7 8L17 16L12 20V4L17 8L7 16'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Use Bluetooth Headset'}).findByProps({d: 'M7 8L17 16L12 20V4L17 8L7 16'})).toBeDefined();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Back from Audio Output'}).props.onPress());

  // Picking a Bluetooth device moves the call onto it and the row names it.
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Audio Output'}).props.onPress());
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Use JBL Flip 5'}).props.onPress(); });
  expect(audio.__recorder.setInput).toHaveBeenCalledWith('7');
  expect(renderer.root.findByProps({accessibilityLabel: 'Audio Output'}).findByProps({children: 'JBL Flip 5'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Microphone Settings'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Microphone Settings options'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Echo Cancellation'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Noise Suppression'})).toBeDefined();
  const audioProcessingPath = 'M15.7508 16.7508H5.25079L1.04079 12.4508C0.854542 12.2634 0.75 12.01 0.75 11.7458C0.75 11.4816 0.854542 11.2282 1.04079 11.0408L11.0408 1.04079C11.2282 0.854542 11.4816 0.75 11.7458 0.75C12.01 0.75 12.2634 0.854542 12.4508 1.04079L17.4508 6.04079C17.637 6.22815 17.7416 6.48161 17.7416 6.74579C17.7416 7.00998 17.637 7.26343 17.4508 7.45079L8.25079 16.7508M14.7508 10.0508L8.45079 3.75079';
  expect(renderer.root.findByProps({accessibilityLabel: 'Echo Cancellation'}).findByProps({d: audioProcessingPath})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Noise Suppression'}).findByProps({d: audioProcessingPath})).toBeDefined();
});

test('opens the add-people screen from more options and sends selected invitations', async () => {
  const grantedPermission = {status: Contacts.PermissionStatus.GRANTED, granted: true, canAskAgain: true, expires: 'never' as const};
  jest.mocked(Contacts.getPermissionsAsync).mockResolvedValue(grantedPermission);
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([{id: 'device-aarav', phones: [{number: '+919999999999'}]}] as never);
  jest.mocked(syncContacts).mockResolvedValue({registered: [{_id: 'user-aarav', name: 'Aarav Sharma', phone: '+919999999999'}], unRegistered: []});
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => callHandlers.onConnected?.({callId: 'call-1', status: 'connected', startedAt: new Date().toISOString()}));
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'More'}).props.onPress());
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add People to Call'}).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(syncContacts).toHaveBeenCalledWith(['+919999999999']);
  expect(renderer.root.findByProps({accessibilityLabel: 'Add People'})).toBeDefined();
  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Open Aarav Sharma profile'})[0].props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(getChatProfile).toHaveBeenCalledWith('user-aarav');
  expect(getSharedMedia).toHaveBeenCalledWith('user-aarav');
  expect(renderer.root.findByProps({accessibilityLabel: 'Aarav Sharma in-call profile'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Back to add people'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findAllByProps({accessibilityLabel: 'Select Aarav Sharma'})[0].props.onPress());
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add selected people to call'}).props.onPress();
    await Promise.resolve();
  });
  expect(addCallParticipantOverSocket).toHaveBeenCalledWith('call-1', 'user-aarav');
});

test('View Contact shows who the call is with, number included, over the call screen', async () => {
  jest.mocked(getChatProfile).mockResolvedValue({userId: 'user-ananya', name: 'Ananya', profilePic: null, phone: '+919876543210', status: 'Designing things', online: true});
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => callHandlers.onConnected?.({callId: 'call-1', status: 'connected', startedAt: new Date().toISOString()}));
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'More'}).props.onPress());
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'View Contact'}).props.onPress();
    await Promise.resolve();
  });

  expect(getChatProfile).toHaveBeenCalledWith('user-ananya');
  const sheet = renderer.root.findByProps({accessibilityLabel: 'View Contact details'});
  expect(sheet.findByProps({accessibilityLabel: 'Mobile number +91 98765 43210'})).toBeDefined();
  expect(sheet.findByProps({children: 'Designing things'})).toBeDefined();
  // The call is not left: Back returns to its More Options.
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Back from View Contact'}).props.onPress());
  expect(renderer.root.findAllByProps({accessibilityLabel: 'View Contact details'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'More Options'})).toBeDefined();
});

test('the call chat button minimizes the call and the banner restores it', async () => {
  const audio = require('expo-audio');
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    await Promise.resolve();
  });
  const pausesBeforeMinimize = audio.__player.pause.mock.calls.length;
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Chat'}).props.onPress();
  });

  expect(renderer.root.findAllByProps({accessibilityLabel: 'One-to-One Voice Call ringing'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Return to active call'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Turn speaker on'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Mute active call'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'End active call'})).toBeDefined();
  expect(audio.__player.pause).toHaveBeenCalledTimes(pausesBeforeMinimize);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Back to chats'}).props.onPress();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'One-to-One Voice Call ringing'})).toBeDefined();
});

test.each(['android', 'ios'] as const)('opens recording controls on a mic tap and sends saved audio despite a session reset error on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  const audio = require('expo-audio');
  const uri = platform === 'ios' ? 'file:///voice.wav' : 'file:///voice.aac';
  audio.__recorder.uri = uri;
  audio.__recorderState.url = uri;
  const renderer = await renderScreen();
  try {
    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({accessibilityLabel: 'Record voice message'}).props.onPressIn({
        nativeEvent: {identifier: 'tap', pageX: 320, pageY: 700, timestamp: 1000},
      });
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({testID: 'chat-composer-dock'}).props.onTouchEnd({
        nativeEvent: {touches: [], timestamp: 1100},
      });
    });
    expect(sendChatMedia).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({accessibilityLabel: 'Voice recording locked'})).toBeDefined();
    expect(renderer.root.findByProps({accessibilityLabel: 'Pause voice recording'})).toBeDefined();
    expect(renderer.root.findByProps({accessibilityLabel: 'Discard voice message'})).toBeDefined();

    audio.__recorder.stop.mockImplementationOnce(async () => {
      audio.__recorder.uri = null;
      audio.__recorderState.url = null;
    });
    audio.setAudioModeAsync.mockRejectedValueOnce(new Error('Audio session interrupted'));
    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({accessibilityLabel: 'Send voice message'}).props.onPress();
    });
    expect(sendChatMedia).toHaveBeenCalledTimes(1);
    expect(sendChatMedia).toHaveBeenCalledWith('user-ananya', expect.objectContaining({
      uri, type: platform === 'ios' ? 'audio/wav' : 'audio/mp4',
    }), expect.objectContaining({duration: 20, waveform: expect.any(Array)}));
    const bubble = renderer.root.findByProps({accessibilityLabel: 'Message: audio'});
    expect(StyleSheet.flatten(bubble.props.style)).toEqual(expect.objectContaining({
      paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, borderWidth: 0, borderRadius: 10,
    }));
    const player = renderer.root.findByProps({accessibilityLabel: 'Play voice message'}).parent!;
    expect(StyleSheet.flatten(player.props.style)).toEqual(expect.objectContaining({height: 68, width: 272}));
    expect(JSON.stringify(renderer.toJSON())).toContain('voiceBubbleGradient');
  } finally {
    ReactTestRenderer.act(() => renderer.unmount());
    os.restore();
  }
});

test('keeps a quick tap recording while native preparation is pending', async () => {
  const audio = require('expo-audio');
  audio.__recorderState.canRecord = false;
  let completePrepare!: () => void;
  audio.__recorder.prepareToRecordAsync.mockImplementationOnce(() => new Promise<void>(resolve => {completePrepare = resolve;}));
  const renderer = await renderScreen();
  let starting!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    starting = renderer.root.findByProps({accessibilityLabel: 'Record voice message'}).props.onPressIn({
      nativeEvent: {identifier: 'tap', pageX: 320, pageY: 700, timestamp: 1000},
    });
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({testID: 'chat-composer-dock'}).props.onTouchEnd({nativeEvent: {touches: [], timestamp: 1100}});
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Send voice message'}).props.disabled).toBe(true);
  await ReactTestRenderer.act(async () => {completePrepare(); await starting;});
  expect(audio.__recorder.record).toHaveBeenCalledTimes(1);
  expect(sendChatMedia).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Send voice message'}).props.disabled).toBe(false);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Discard voice message'}).props.onPress());
  expect(sendChatMedia).not.toHaveBeenCalled();
  ReactTestRenderer.act(() => renderer.unmount());
});

test.each(['android', 'ios'] as const)('retries a failed voice upload using the same recording on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  jest.mocked(sendChatMedia).mockRejectedValueOnce(new Error('Upload interrupted'));
  const renderer = await renderScreen();
  try {
    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({accessibilityLabel: 'Record voice message'}).props.onPressIn({
        nativeEvent: {identifier: 'hold', pageX: 320, pageY: 700, timestamp: 1000},
      });
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({testID: 'chat-composer-dock'}).props.onTouchEnd({nativeEvent: {touches: [], timestamp: 3000}});
    });
    const failed = renderer.root.findByProps({accessibilityLabel: 'Message: audio'});
    expect(failed.props.accessibilityHint).toBe('Tap to send this message again');
    await ReactTestRenderer.act(async () => {await failed.props.onPress();});
    expect(sendChatMedia).toHaveBeenCalledTimes(2);
    expect(jest.mocked(sendChatMedia).mock.calls[1][1].uri).toBe(jest.mocked(sendChatMedia).mock.calls[0][1].uri);
    expect(renderer.root.findByProps({accessibilityLabel: 'Message: audio'}).props.accessibilityHint).toBeUndefined();
  } finally {
    ReactTestRenderer.act(() => renderer.unmount());
    os.restore();
  }
});

test('records a voice message while held and sends automatically on release', async () => {
  const audio = require('expo-audio');
  audio.__recorder.uri = 'file:///voice.aac';
  audio.__recorderState.url = 'file:///voice.aac';
  const renderer = await renderScreen();

  const microphone = renderer.root.findByProps({accessibilityLabel: 'Record voice message'});
  expect(microphone.props.onLongPress).toBeUndefined();

  await ReactTestRenderer.act(async () => {
    await microphone.props.onPressIn();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(audio.useAudioRecorder).toHaveBeenCalledWith(
    expect.objectContaining({
      android: expect.objectContaining({extension: '.aac', outputFormat: 'aac_adts'}),
    }),
  );
  const holdButton = renderer.root.findByProps({accessibilityLabel: 'Lock or release voice recording'});
  expect(holdButton.props.onLongPress).toBeUndefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Voice recording hold controls'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({testID: 'chat-composer-dock'}).props.onTouchEnd({nativeEvent: {touches: []}});
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(sendChatMedia).toHaveBeenCalledWith(
    'user-ananya',
    expect.objectContaining({
      uri: 'file:///voice.aac',
      name: expect.stringMatching(/^voice-\d+\.aac$/),
      type: 'audio/mp4',
    }),
    expect.objectContaining({duration: 20, waveform: expect.any(Array)}),
  );
  expect(sendMessageOverSocket).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Play voice message'})).toBeDefined();
});

test('moves a completed voice message playback pointer to the end', async () => {
  const audio = require('expo-audio');
  audio.__playerStatus.currentTime = 0;
  audio.__playerStatus.duration = 10;
  audio.__playerStatus.didJustFinish = true;
  jest.mocked(getChatMessages).mockResolvedValueOnce([
    {
      id: 'voice-complete-1',
      text: '',
      createdAt: '2026-08-19T06:00:00.000Z',
      isOwn: true,
      status: 'read',
      messageType: 'audio',
      mediaUrl: 'https://cdn.example/complete.m4a',
      audioDuration: 10,
      waveform: [5, 8, 12, 7],
    },
  ]);

  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({
      accessibilityLabel: 'Voice message waveform',
    }).props.onLayout({nativeEvent: {layout: {width: 120}}});
  });
  const pointer = renderer.root.findByProps({
    accessibilityLabel: 'Voice message playback 100%',
  });

  expect(pointer.props.accessibilityValue).toEqual({
    min: 0,
    max: 100,
    now: 100,
  });
  expect(StyleSheet.flatten(pointer.props.style)).toEqual(
    expect.objectContaining({left: 108, top: '50%', marginTop: -6}),
  );
  expect(StyleSheet.flatten(renderer.root.findByProps({
    accessibilityLabel: 'Voice message played waveform',
  }).props.style)).toEqual(expect.objectContaining({width: 114}));
  expect(audio.useAudioPlayer).toHaveBeenCalledWith(
    'https://cdn.example/complete.m4a',
    {updateInterval: 100},
  );

  // Some native players clear didJustFinish after emitting it and leave their
  // last sampled time short of the duration. The completed UI must stay at the
  // final bar until the user explicitly replays the note.
  audio.__playerStatus.didJustFinish = false;
  audio.__playerStatus.currentTime = 8;
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({
      accessibilityLabel: 'Voice message waveform',
    }).props.onLayout({nativeEvent: {layout: {width: 121}}});
  });
  const persistedPointer = renderer.root.findByProps({
    accessibilityLabel: 'Voice message playback 100%',
  });
  expect(StyleSheet.flatten(persistedPointer.props.style)).toEqual(
    expect.objectContaining({left: 109}),
  );

  await ReactTestRenderer.act(async () => {
    renderer.root
      .findByProps({accessibilityLabel: 'Play voice message'})
      .props.onPress();
  });
  expect(audio.__player.seekTo).toHaveBeenCalledWith(0);
  expect(audio.__player.play).toHaveBeenCalled();
});

test('keeps the voice pointer aligned with the waveform while playing', async () => {
  const audio = require('expo-audio');
  audio.__playerStatus.playing = true;
  audio.__playerStatus.currentTime = 5;
  audio.__playerStatus.duration = 10;
  jest.mocked(getChatMessages).mockResolvedValueOnce([
    {
      id: 'voice-playing-1',
      text: '',
      createdAt: '2026-08-19T06:00:00.000Z',
      isOwn: false,
      status: 'delivered',
      messageType: 'audio',
      mediaUrl: 'https://cdn.example/playing.m4a',
      audioDuration: 10,
      waveform: [5, 8, 12, 7, 10, 6],
    },
  ]);

  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({
      accessibilityLabel: 'Voice message waveform',
    }).props.onLayout({nativeEvent: {layout: {width: 112}}});
  });
  const pointer = renderer.root.findByProps({
    accessibilityLabel: 'Voice message playback 50%',
  });

  expect(StyleSheet.flatten(pointer.props.style)).toEqual(
    expect.objectContaining({left: 50}),
  );
  expect(StyleSheet.flatten(renderer.root.findByProps({
    accessibilityLabel: 'Voice message played waveform',
  }).props.style)).toEqual(expect.objectContaining({width: 56}));

  // A deliberate pause must remain at the current position.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({
      accessibilityLabel: 'Pause voice message',
    }).props.onPress();
  });
  audio.__playerStatus.playing = false;
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({
      accessibilityLabel: 'Voice message waveform',
    }).props.onLayout({nativeEvent: {layout: {width: 114}}});
  });
  expect(renderer.root.findByProps({
    accessibilityLabel: 'Voice message playback 50%',
  })).toBeDefined();

  // A natural playing-to-stopped transition must reach and remain at 100%,
  // even if the native completion flag is absent.
  audio.__playerStatus.playing = true;
  audio.__playerStatus.currentTime = 8;
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({
      accessibilityLabel: 'Voice message waveform',
    }).props.onLayout({nativeEvent: {layout: {width: 115}}});
  });
  audio.__playerStatus.playing = false;
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({
      accessibilityLabel: 'Voice message waveform',
    }).props.onLayout({nativeEvent: {layout: {width: 116}}});
  });
  expect(renderer.root.findByProps({
    accessibilityLabel: 'Voice message playback 100%',
  })).toBeDefined();
});

test('opens reply, forward, delete, and more actions from a held location card', async () => {
  jest.useFakeTimers();
  try {
    jest.mocked(getChatMessages).mockResolvedValueOnce([
      {
        id: 'location-actions-1',
        text: '',
        createdAt: '2026-08-19T06:00:00.000Z',
        isOwn: true,
        status: 'read',
        messageType: 'location',
        latitude: 17.385,
        longitude: 78.4867,
        locationName: 'Hyderabad',
      },
    ]);
    const renderer = await renderScreen();
    const holdLocation = async () => {
      await ReactTestRenderer.act(async () => {
        renderer.root.findByProps({
          accessibilityLabel: 'Open Hyderabad in maps',
        }).props.onLongPress();
      });
    };

    await holdLocation();
    for (const action of [
      'Reply message',
      'Forward message',
      'Select message',
      'Copy message',
      'Pin message',
      'Mark as unread',
      'Delete message',
    ]) {
      expect(renderer.root.findByProps({accessibilityLabel: action})).toBeDefined();
    }

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: 'Reply message'}).props.onPress();
      jest.advanceTimersByTime(170);
    });
    expect(renderer.root.findByProps({accessibilityLabel: 'Replying to message'})).toBeDefined();
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: 'Cancel reply'}).props.onPress();
    });

    await holdLocation();
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: 'Delete message'}).props.onPress();
    });
    expect(renderer.root.findByProps({accessibilityLabel: 'Delete this Message?'})).toBeDefined();
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: 'Close delete confirmation'}).props.onPress();
    });

    await holdLocation();
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: 'Forward message'}).props.onPress();
    });
    expect(renderer.root.findByProps({accessibilityLabel: 'Close forward screen'})).toBeDefined();
  } finally {
    jest.useRealTimers();
  }
});

test('opens the selected destination with the forwarded message cached immediately', async () => {
  const source: ChatMessage = {
    id:'forward-source', text:'Forward me now', createdAt:'2026-08-19T06:00:00.000Z',
    isOwn:false, status:'read', messageType:'text',
  };
  jest.mocked(getChatMessages).mockResolvedValueOnce([source]);
  jest.mocked(getForwardDestinations).mockResolvedValueOnce([{
    id:'user-priya', chatId:'chat-priya', name:'Priya', kind:'contact', recent:true,
  }]);
  jest.mocked(forwardMessages).mockResolvedValueOnce([{
    id:'forwarded-server', text:'', createdAt:'2026-08-19T06:05:00.000Z',
    isOwn:true, status:'sent', messageType:'text', contactId:'user-priya', isForwarded:true,
  }]);
  const onOpenConversation = jest.fn();
  const renderer = await renderScreen(contact, 'chat-1', {onOpenConversation});

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel:'Message: Forward me now'}).props.onLongPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel:'Forward message'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel:'Select chat Priya'})[0].props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel:'Forward 1 messages to 1 chats'}).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(forwardMessages).toHaveBeenCalledWith(['forward-source'], ['user-priya']);
  expect(require('../src/services/messageStore').storeMessages).toHaveBeenCalledWith(
    'chat-priya',
    expect.arrayContaining([expect.objectContaining({
      id:'forwarded-server', text:'Forward me now', isForwarded:true, isOwn:true,
    })]),
  );
  expect(onOpenConversation).toHaveBeenCalledWith(
    expect.objectContaining({userId:'user-priya', name:'Priya', kind:'contact'}),
    'chat-priya',
  );
});

test.each(['android', 'ios'] as const)('recovers missed, dialed and answered chat entries after a call on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
    const renderer = await renderScreen();
    const callEntries = [
      {id: 'missed-log', text: 'Missed audio call', createdAt: '2026-10-15T10:00:00.000Z', isOwn: false, messageType: 'call' as const, callStatus: 'missed'},
      {id: 'dialed-log', text: 'Audio call completed', createdAt: '2026-10-15T10:01:00.000Z', isOwn: true, messageType: 'call' as const, callStatus: 'completed'},
      {id: 'answered-log', text: 'Audio call completed', createdAt: '2026-10-15T10:02:00.000Z', isOwn: false, messageType: 'call' as const, callStatus: 'completed'},
    ];
    jest.mocked(getChatMessages).mockResolvedValue(callEntries);
    const event = {callId: 'call-ended', chatId: 'chat-1', contactId: contact.userId, contactName: contact.name, type: 'audio' as const, direction: 'incoming' as const, status: 'ended' as const};
    await ReactTestRenderer.act(async () => { publishCallActivity({...event, chatId: 'another-chat', contactId: 'another-user'}); });
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Missed call icon'})).toHaveLength(0);
    await ReactTestRenderer.act(async () => { publishCallActivity(event); });
    expect(renderer.root.findByProps({accessibilityLabel: 'Missed call icon'})).toBeDefined();
    expect(renderer.root.findByProps({accessibilityLabel: 'Outgoing call icon'})).toBeDefined();
    expect(renderer.root.findByProps({accessibilityLabel: 'Incoming call icon'})).toBeDefined();
    const iconCount = renderer.root.findAllByProps({accessibilityLabel: 'Missed call icon'}).length;
    await ReactTestRenderer.act(async () => { publishCallActivity(event); });
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Missed call icon'})).toHaveLength(iconCount);
  } finally { os.restore(); }
});

test('publishes confirmed dialed and answered call activity once per transition', async () => {
  const onActivity = jest.fn();
  const unsubscribe = subscribeToCallActivity(onActivity);
  try {
    const renderer = await renderScreen();
    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({accessibilityLabel: 'Call Ananya'}).props.onPress();
    });
    expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({callId: 'call-1', contactId: contact.userId, status: 'dialed'}));
    await ReactTestRenderer.act(async () => {
      callHandlers.onConnected?.({callId: 'call-1', status: 'connected', startedAt: new Date().toISOString()});
    });
    expect(onActivity).toHaveBeenLastCalledWith(expect.objectContaining({callId: 'call-1', status: 'answered'}));
    await ReactTestRenderer.act(async () => {
      callHandlers.onConnected?.({callId: 'call-1', status: 'connected'});
    });
    expect(onActivity).toHaveBeenCalledTimes(2);
    await ReactTestRenderer.act(async () => { callHandlers.onEnded?.({callId: 'call-1', duration: 30}); });
    expect(onActivity).toHaveBeenLastCalledWith(expect.objectContaining({callId: 'call-1', status: 'ended'}));
  } finally { unsubscribe(); }
});

test('shows distinct call status icons for call events in the conversation', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([
    {id: 'call-missed', text: 'Missed audio call', createdAt: '2026-10-15T10:00:00.000Z', isOwn: false, messageType: 'call', callStatus: 'missed', systemEvent: true},
    {id: 'call-incoming', text: 'Audio call completed', createdAt: '2026-10-15T10:01:00.000Z', isOwn: false, messageType: 'call', callStatus: 'completed', systemEvent: true},
    {id: 'call-outgoing', text: 'Audio call completed', createdAt: '2026-10-15T10:02:00.000Z', isOwn: true, messageType: 'call', callStatus: 'completed', systemEvent: true},
    {id: 'call-declined', text: 'Audio call rejected', createdAt: '2026-10-15T10:03:00.000Z', isOwn: true, messageType: 'call', callStatus: 'rejected', systemEvent: true},
  ]);

  const renderer = await renderScreen();

  expect(renderer.root.findByProps({accessibilityLabel: 'Missed call icon'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Incoming call icon'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Outgoing call icon'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Declined call icon'})).toBeDefined();
});

test('does not send a voice message when the native recorder fails to start', async () => {
  const audio = require('expo-audio');
  audio.__recorder.record.mockImplementationOnce(() => {
    throw new Error("Call to function 'AudioRecorder.record' has been rejected");
  });
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Record voice message'}).props.onPressIn();
    await Promise.resolve();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({testID: 'chat-composer-dock'}).props.onTouchEnd({nativeEvent: {touches: []}});
  });

  expect(sendMessageOverSocket).not.toHaveBeenCalled();
  expect(sendChatMedia).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Send voice message'})).toHaveLength(0);
});

test('recovers voice recording when the native recorder prepare has stale audio session state', async () => {
  const audio = require('expo-audio');
  audio.__recorderState.canRecord = false;
  audio.__recorder.prepareToRecordAsync
    .mockRejectedValueOnce(new Error("FunctionCallException: Calling the 'prepareToRecordAsync' function has failed"))
    .mockResolvedValueOnce(undefined);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Record voice message'}).props.onPressIn();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(audio.__recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
  expect(audio.__recorder.stop).toHaveBeenCalled();
  expect(audio.__recorder.record).toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Voice recording hold controls'})).toBeDefined();
});

test('uploads a held voice note once on finger release without locking', async () => {
  const audio = require('expo-audio');
  const renderer = await renderScreen();
  const touch = {identifier: 'voice-touch', pageX: 320, pageY: 700};
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Record voice message'}).props.onPressIn({nativeEvent: touch});
  });
  const dock = renderer.root.findByProps({testID: 'chat-composer-dock'});
  await ReactTestRenderer.act(async () => {
    dock.props.onTouchMove({nativeEvent: {touches: [{...touch, pageY: 693}]}});
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Voice recording locked'})).toHaveLength(0);
  expect(sendChatMedia).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    dock.props.onTouchEnd({nativeEvent: {touches: []}});
    dock.props.onTouchEnd({nativeEvent: {touches: []}});
  });
  expect(audio.__recorder.stop).toHaveBeenCalledTimes(1);
  expect(sendChatMedia).toHaveBeenCalledTimes(1);
  expect(sendChatMedia).toHaveBeenCalledWith('user-ananya', expect.objectContaining({uri: 'file:///voice.m4a'}), expect.any(Object));
});

test.each(['cancel', 'lock', 'interrupt'] as const)('preserves the voice-note %s gesture without auto-uploading', async gesture => {
  const renderer = await renderScreen();
  const touch = {identifier: 'voice-touch', pageX: 320, pageY: 700};
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Record voice message'}).props.onPressIn({nativeEvent: touch});
  });
  const dock = renderer.root.findByProps({testID: 'chat-composer-dock'});
  await ReactTestRenderer.act(async () => {
    if (gesture === 'interrupt') {
      dock.props.onTouchCancel();
    } else {
      dock.props.onTouchMove({nativeEvent: {touches: [{...touch, pageX: gesture === 'cancel' ? 230 : 320, pageY: gesture === 'lock' ? 640 : 700}]}});
      dock.props.onTouchEnd({nativeEvent: {touches: []}});
    }
  });
  expect(sendChatMedia).not.toHaveBeenCalled();
  if (gesture === 'lock') {
    expect(renderer.root.findByProps({accessibilityLabel: 'Voice recording locked'})).toBeDefined();
  } else {
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Voice recording hold controls'})).toHaveLength(0);
  }
});

test('does not upload an old voice file when released while the recorder prepares', async () => {
  const audio = require('expo-audio');
  let completePrepare!: () => void;
  audio.__recorderState.canRecord = false;
  audio.__recorder.prepareToRecordAsync.mockImplementationOnce(() => new Promise<void>(resolve => {completePrepare = resolve;}));
  const renderer = await renderScreen();
  let starting!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    starting = renderer.root.findByProps({accessibilityLabel: 'Record voice message'}).props.onPressIn();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({testID: 'chat-composer-dock'}).props.onTouchEnd({nativeEvent: {touches: []}});
    completePrepare();
    await starting;
  });
  expect(audio.__recorder.record).not.toHaveBeenCalled();
  expect(sendChatMedia).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Voice recording hold controls'})).toHaveLength(0);
});

test('locks, pauses, previews, resumes, and sends a voice recording', async () => {
  const audio = require('expo-audio');
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Record voice message'}).props.onPressIn();
    await Promise.resolve();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Lock recording'}).props.onPress();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Voice recording locked'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Pause voice recording'}).props.onPress();
  });

  expect(audio.__recorder.pause).toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Voice recording paused'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Play recorded audio'})).toBeDefined();

  expect(createVoiceRecordingPreview).toHaveBeenCalledWith('file:///voice.m4a');
  expect(audio.useAudioPlayer).toHaveBeenCalledWith('file:///cache/voice-preview.aac', expect.objectContaining({keepAudioSessionActive: true}));
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Play recorded audio'}).props.onPress();
  });
  expect(audio.__player.play).toHaveBeenCalled();

  audio.__playerStatus.didJustFinish = true;
  audio.__playerStatus.currentTime = 0;
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Recording preview waveform'}).props.onLayout({nativeEvent: {layout: {width: 180}}});
  });
  audio.__player.play.mockClear();
  let finishSeek!: () => void;
  audio.__player.seekTo.mockImplementationOnce(() => new Promise<void>(resolve => {finishSeek = resolve;}));
  let replay!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    replay = renderer.root.findByProps({accessibilityLabel: 'Play recorded audio'}).props.onPress();
  });
  expect(audio.__player.seekTo).toHaveBeenCalledWith(0);
  expect(audio.__player.play).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {finishSeek(); await replay;});
  expect(audio.__player.play).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Resume voice recording'}).props.onPress();
  });

  expect(audio.__recorder.record).toHaveBeenCalledTimes(2);
  expect(renderer.root.findByProps({accessibilityLabel: 'Voice recording locked'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Send voice message'}).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(sendChatMedia).toHaveBeenCalledWith(
    'user-ananya',
    expect.objectContaining({uri: 'file:///voice.m4a', type: 'audio/mp4'}),
    expect.objectContaining({duration: 20, waveform: expect.any(Array)}),
  );
  expect(sendMessageOverSocket).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Play voice message'})).toBeDefined();
});

test.each([false, true])('sends the original paused WAV recording when preview fails: %s', async previewFails => {
  const audio = require('expo-audio');
  audio.__recorder.uri = 'file:///voice.wav';
  audio.__recorderState.url = 'file:///voice.wav';
  if (previewFails) jest.mocked(createVoiceRecordingPreview).mockRejectedValueOnce(new Error('Preview unavailable'));
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Record voice message'}).props.onPressIn();
  });
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Lock recording'}).props.onPress());
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Pause voice recording'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Send voice message'}).props.onPress();
  });
  expect(sendChatMedia).toHaveBeenCalledWith('user-ananya', expect.objectContaining({uri: 'file:///voice.wav', type: 'audio/wav'}), expect.any(Object));
  expect(sendChatMedia).toHaveBeenCalledTimes(1);
});

test('keeps the composer visible while the paperclip opens the attachment tray', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Attach a file'}).props.onPress();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Attachment options'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Type a message'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Add emoji'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Attach a file'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Record voice message'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Camera'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Gallery'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Location'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Contact'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Document'})).toBeDefined();
  expect(renderer.root.findByType(MediaAttachmentFlow).props.requestRecentsPermissionOnOpen).toBe(false);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Attach a file'}).props.onPress();
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Attachment options'})).toHaveLength(0);
});

test('opens the dedicated Files screen from the Document attachment action', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Attach a file'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Document'}).props.onPress();
    await Promise.resolve();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Files screen'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Browse Documents'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Choose from Gallery'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Scan Documents'})).toBeDefined();
  expect(getChatFiles).toHaveBeenCalledWith('chat-1');
});

test('downloads a shared document at its original size and opens it in a reader', async () => {
  const FileSystem = require('expo-file-system');
  const Sharing = require('expo-sharing');
  jest.mocked(getChatMessages).mockResolvedValueOnce([{
    id: 'document-message-1', text: '', createdAt: '2026-08-27T10:17:00.000Z',
    isOwn: true, status: 'sent', messageType: 'file', fileName: 'Project Plan.pdf',
    fileType: 'application/pdf', mediaSize: 4096,
  }]);
  jest.mocked(getMediaDownloadUrl).mockResolvedValueOnce('https://signed.example/project-plan.pdf');
  FileSystem.File.downloadFileAsync.mockImplementationOnce(async (_url: string, destination: {size?: number}) => {
    destination.size = 4096;
    return destination;
  });
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Download Project Plan.pdf'}).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getMediaDownloadUrl).toHaveBeenCalledWith('document-message-1');
  expect(FileSystem.File.downloadFileAsync).toHaveBeenCalledWith(
    'https://signed.example/project-plan.pdf', expect.anything(), expect.objectContaining({idempotent: true}),
  );
  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    expect.stringContaining('Project_Plan.pdf'),
    {mimeType: 'application/pdf', dialogTitle: 'Open Project Plan.pdf'},
  );
  expect(renderer.root.findByProps({accessibilityLabel: 'Open Project Plan.pdf'})).toBeDefined();
});

test.each([
  ['ios', 'contact'], ['android', 'contact'], ['ios', 'group'], ['android', 'group'],
] as const)('saves a received video to the device library instead of opening sharing options on %s in a %s chat', async (platform, kind) => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', {configurable: true, value: platform});
  const MediaLibrary = require('expo-media-library/legacy');
  const Sharing = require('expo-sharing');
  const FileSystem = require('expo-file-system');
  try {
    const getMessages = kind === 'group' ? getGroupMessages : getChatMessages;
    jest.mocked(getMessages).mockResolvedValueOnce([{
      id: `save-video-${platform}-${kind}`, text: '', createdAt: '2026-08-27T10:17:00.000Z', isOwn: false,
      messageType: 'video', mediaUrl: 'https://cdn.example/clip.mp4', fileName: 'clip.mp4', fileType: 'video/mp4',
    }]);
    const renderer = await renderScreen(kind === 'group' ? {userId: 'group-1', name: 'QA team', kind: 'group'} : contact);
    await ReactTestRenderer.act(async () => {
      await renderer.root.findAllByProps({accessibilityLabel: 'Download video'})[0].props.onPress();
    });
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith(expect.stringContaining(`save-video-${platform}-${kind}-clip.mp4`));
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({children: platform === 'ios' ? 'Video saved to Photos.' : 'Video saved to Gallery.'}).length).toBeGreaterThan(0);
    FileSystem.File.downloadFileAsync.mockClear();
    await ReactTestRenderer.act(async () => {
      await renderer.root.findAllByProps({accessibilityLabel: 'Download video'})[0].props.onPress();
    });
    expect(FileSystem.File.downloadFileAsync).not.toHaveBeenCalled();
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledTimes(2);
  } finally {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: original});
  }
});

test.each([false, true])('the video download placeholder saves to the library when auto-download is off (album: %s)', async album => {
  const autoDownload = require('../src/services/autoDownload');
  const gate = jest.spyOn(autoDownload, 'useMediaDownloadGate').mockReturnValue({
    allowed: false, downloaded: false, localUri: '', download: jest.fn(),
  });
  try {
    jest.mocked(getChatMessages).mockResolvedValueOnce([...(album ? [{
      id: 'album-photo', text: '', createdAt: '2026-08-27T10:17:00.000Z', isOwn: false,
      messageType: 'image' as const, mediaUrl: 'https://cdn.example/photo.jpg', mediaGroupId: 'manual-album',
    }] : []), {
      id: `save-video-manual-${album}`, text: '', createdAt: '2026-08-27T10:17:00.000Z', isOwn: false,
      messageType: 'video', mediaUrl: 'https://cdn.example/manual.mp4', fileName: 'manual.mp4', mediaGroupId: 'manual-album',
    }]);
    const renderer = await renderScreen();
    await ReactTestRenderer.act(async () => {
      await renderer.root.findAllByProps({accessibilityLabel: 'Download video'})[0].props.onPress();
    });
    expect(require('expo-media-library/legacy').saveToLibraryAsync).toHaveBeenCalledWith(expect.stringContaining('manual.mp4'));
    expect(require('expo-sharing').shareAsync).not.toHaveBeenCalled();
  } finally {
    gate.mockRestore();
  }
});

test('selects a downloaded audio file and sends it through the documented media endpoint', async () => {
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{name: 'downloaded-song.mp3', uri: 'content://audio/song-1', mimeType: 'audio/mpeg', size: 2048000}],
  } as never);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Attach a file'}).props.onPress());
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Document'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Browse Documents'}).props.onPress();
  });

  expect(sendChatMedia).toHaveBeenCalledWith('user-ananya', {
    uri: 'content://audio/song-1', name: 'downloaded-song.mp3', type: 'audio/mpeg', size: 2048000,
  }, expect.objectContaining({duration: 0, onUploadProgress: expect.any(Function)}));
  expect(require('../src/services/chatApi').sendChatFile).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'downloaded-song.mp3 sent'})).toBeDefined();
});

test.each(['android', 'ios'] as const)('sends a copied clipboard image with the typed text as its caption on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
  jest.mocked(Clipboard.hasImageAsync).mockResolvedValue(true);
  jest.mocked(Clipboard.getImageAsync).mockResolvedValue({
    data: 'data:image/png;base64,Y2hhdHRlcmx5',
    size: {width: 640, height: 480},
  });
  jest.mocked(sendChatMedia).mockResolvedValue({
    id: 'pasted-image-1', text: 'Diagram attached', createdAt: '2026-10-15T10:00:00.000Z',
    isOwn: true, messageType: 'image', mediaUrl: 'https://cdn.example/pasted.png', status: 'sent',
  });
  const renderer = await renderScreen();

  await sendMessage(renderer, 'Diagram attached');

  expect(sendChatMedia).toHaveBeenCalledWith('user-ananya', expect.objectContaining({
    name: 'pasted-image.png', type: 'image/png', uri: expect.stringContaining('chatterly-clipboard-'),
  }), expect.objectContaining({caption: 'Diagram attached'}));
  expect(renderer.root.findByProps({accessibilityLabel: 'Message: Diagram attached'})).toBeDefined();
  expect(renderer.root.findAllByProps({children: 'Diagram attached'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAll(node => node.props.source?.uri === 'https://cdn.example/pasted.png').length).toBeGreaterThan(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Type a message'}).props.value).toBe('');
  } finally { os.restore(); }
});

test.each([
  ['android', 'direct'], ['ios', 'direct'], ['android', 'group'], ['ios', 'group'],
] as const)('copies image data and sends it with a new caption on %s in a %s chat', async (platform, kind) => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
    const original = {
      id: 'original-image', text: 'Original caption', createdAt: '2026-10-15T10:00:00.000Z',
      isOwn: true, messageType: 'image' as const, mediaUrl: 'https://cdn.example/original.png',
    };
    jest.mocked(kind === 'group' ? getGroupMessages : getChatMessages).mockResolvedValue([original]);
    jest.mocked(getGroupDetails).mockResolvedValue(groupWithRoles({me: 'superadmin'}));
    const sent = {...original, id: 'copied-image', text: 'New caption', mediaUrl: 'https://cdn.example/copied.png'};
    jest.mocked(sendChatMedia).mockResolvedValue(sent);
    jest.mocked(sendGroupMedia).mockResolvedValue(sent);
    jest.mocked(Clipboard.setImageAsync).mockImplementationOnce(async data => {
      jest.mocked(Clipboard.hasImageAsync).mockResolvedValue(true);
      jest.mocked(Clipboard.getImageAsync).mockResolvedValue({data, size: {width: 640, height: 480}});
    });
    const renderer = await renderScreen(kind === 'group' ? groupContact : contact, kind === 'group' ? 'group-1' : 'chat-1');
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: 'Message: Original caption'}).props.onLongPress();
    });
    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({accessibilityLabel: 'Copy message'}).props.onPress();
    });
    expect(Clipboard.setImageAsync).toHaveBeenCalledWith('dm9pY2U=');
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    await sendMessage(renderer, 'New caption');
    if (kind === 'group') {
      expect(sendGroupMedia).toHaveBeenCalledWith('group-1', expect.objectContaining({type: 'image/png'}), 'New caption', expect.any(Function));
    } else {
      expect(sendChatMedia).toHaveBeenCalledWith('user-ananya', expect.objectContaining({type: 'image/png'}), expect.objectContaining({caption: 'New caption'}));
    }
    expect(renderer.root.findAll(node => node.props.source?.uri === sent.mediaUrl).length).toBeGreaterThan(0);
    expect(renderer.root.findByProps({accessibilityLabel: 'Message: New caption'})).toBeDefined();
  } finally { os.restore(); }
});

test('sends over the socket with a client id and renders the message in the thread', async () => {
  const renderer = await renderScreen();

  await sendMessage(renderer, 'Hello Ananya');

  expect(sendMessageOverSocket).toHaveBeenCalledWith(
    expect.objectContaining({receiverId: 'user-ananya', text: 'Hello Ananya', tempId: expect.any(String)}),
  );
  // The REST route is only a fallback, so a healthy socket send must not also
  // post the message and create a duplicate.
  expect(sendChatMessage).not.toHaveBeenCalled();
  expect(notifyMessageOnce).toHaveBeenCalledWith(
    'server-1', 'user-ananya', 'Hello Ananya', 'chat-1',
  );
  expect(renderer.root.findAllByProps({children: 'Hello Ananya'}).length).toBeGreaterThan(0);
  expect(recordChatListActivity).toHaveBeenCalledWith(expect.objectContaining({
    chatId: 'chat-1',
    contact: expect.objectContaining({userId: 'user-ananya'}),
    preview: 'Hello Ananya',
    messageId: 'server-1',
    status: 'sent',
  }));
});

test('sends a group message through the group socket and keeps it in the thread', async () => {
  const renderer = await renderScreen(
    {userId: 'group-1', name: 'Bharath Don', thumbnail: null, kind: 'group'},
    'group-1',
  );

  await sendMessage(renderer, 'Hello group');

  expect(sendGroupMessageOverSocket).toHaveBeenCalledWith(expect.objectContaining({
    groupId: 'group-1', text: 'Hello group', tempId: expect.any(String),
  }));
  expect(sendGroupMessage).not.toHaveBeenCalled();
  expect(sendChatMessage).not.toHaveBeenCalled();
  expect(statusOf(renderer, 'Sent')).toEqual(['Sent']);
  expect(renderer.root.findAllByProps({children: 'Hello group'}).length).toBeGreaterThan(0);
});

test('falls back only to the documented group route when the group socket is unavailable', async () => {
  jest.mocked(sendGroupMessageOverSocket).mockRejectedValue(new Error('No connection.'));
  const renderer = await renderScreen(
    {userId: 'group-1', name: 'Bharath Don', thumbnail: null, kind: 'group'},
    'group-1',
  );

  await sendMessage(renderer, 'Hello group');

  expect(sendGroupMessage).toHaveBeenCalledWith('group-1', 'Hello group', undefined);
  expect(sendChatMessage).not.toHaveBeenCalled();
  expect(statusOf(renderer, 'Sent')).toEqual(['Sent']);
});

test('never sends a failed group message to the one-to-one endpoint', async () => {
  jest.mocked(sendGroupMessageOverSocket).mockRejectedValue(new Error('No connection.'));
  jest.mocked(sendGroupMessage).mockRejectedValue(new Error('Unable to send group message.'));
  const renderer = await renderScreen(
    {userId: 'group-1', name: 'Bharath Don', thumbnail: null, kind: 'group'},
    'group-1',
  );

  await sendMessage(renderer, 'Hello group');

  expect(sendChatMessage).not.toHaveBeenCalled();
  expect(statusOf(renderer, 'Not sent, tap to retry')).toEqual(['Not sent, tap to retry']);
});

test('walks the bubble through Sending, Sent, Delivered and Read', async () => {
  // Hold the ACK open so the optimistic "Sending" state can be observed.
  let resolveAck: (ack: {success: boolean; tempId: string; messageId: string; status: string}) => void = () => undefined;
  jest.mocked(sendMessageOverSocket).mockReturnValue(
    new Promise(resolve => { resolveAck = resolve; }),
  );

  const renderer = await renderScreen();
  await sendMessage(renderer, 'Hello Ananya');

  expect(statusOf(renderer, 'Sending')).toEqual(['Sending']);

  const tempId = jest.mocked(sendMessageOverSocket).mock.calls[0][0].tempId;
  await ReactTestRenderer.act(async () => {
    resolveAck({success: true, tempId, messageId: 'server-1', status: 'sent'});
    await Promise.resolve();
  });
  expect(statusOf(renderer, 'Sent')).toEqual(['Sent']);

  await ReactTestRenderer.act(async () => {
    handlers.onDelivered('server-1');
  });
  expect(statusOf(renderer, 'Delivered')).toEqual(['Delivered']);

  await ReactTestRenderer.act(async () => {
    handlers.onRead(['server-1']);
  });
  expect(statusOf(renderer, 'Read')).toEqual(['Read']);
});

test('does not let a late ACK pull a delivered message back to Sent', async () => {
  let resolveAck: (ack: {success: boolean; tempId: string; messageId: string; status: string}) => void = () => undefined;
  jest.mocked(sendMessageOverSocket).mockReturnValue(
    new Promise(resolve => { resolveAck = resolve; }),
  );

  const renderer = await renderScreen();
  await sendMessage(renderer, 'Hello Ananya');

  const tempId = jest.mocked(sendMessageOverSocket).mock.calls[0][0].tempId;
  // The receiver's device reports delivery before our own ACK comes back.
  await ReactTestRenderer.act(async () => {
    handlers.onDelivered(tempId);
  });
  await ReactTestRenderer.act(async () => {
    resolveAck({success: true, tempId, messageId: 'server-1', status: 'sent'});
    await Promise.resolve();
  });

  expect(statusOf(renderer, 'Delivered', 'Sent')).toEqual(['Delivered']);
});

test('falls back to the REST route when the socket cannot carry the message', async () => {
  jest.mocked(sendMessageOverSocket).mockRejectedValue(new Error('No connection.'));

  const renderer = await renderScreen();
  await sendMessage(renderer, 'Hello Ananya');

  expect(sendChatMessage).toHaveBeenCalledWith('user-ananya', 'Hello Ananya');
  expect(statusOf(renderer, 'Sent')).toEqual(['Sent']);
  expect(renderer.root.findAllByProps({children: 'Hello Ananya'}).length).toBeGreaterThan(0);
});

test('marks a message that neither route could deliver as failed and offers a retry', async () => {
  jest.mocked(sendMessageOverSocket).mockRejectedValue(new Error('No connection.'));
  jest.mocked(sendChatMessage).mockRejectedValue(new Error('Server unreachable.'));

  const renderer = await renderScreen();
  await sendMessage(renderer, 'Hello Ananya');

  expect(statusOf(renderer, 'Not sent, tap to retry')).toEqual(['Not sent, tap to retry']);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Message not sent, tap the bubble to retry'}).length)
    .toBeGreaterThan(0);
});

test('retries a failed send with the original client id so the server can de-duplicate', async () => {
  jest.mocked(sendMessageOverSocket).mockRejectedValueOnce(new Error('No connection.'));
  jest.mocked(sendChatMessage).mockRejectedValueOnce(new Error('Server unreachable.'));

  const renderer = await renderScreen();
  await sendMessage(renderer, 'Hello Ananya');

  const firstTempId = jest.mocked(sendMessageOverSocket).mock.calls[0][0].tempId;
  // How many nodes one bubble renders, so the retry can be checked for having
  // folded onto it rather than added a second copy of the message.
  const nodesPerBubble = renderer.root.findAllByProps({children: 'Hello Ananya'}).length;

  jest.mocked(sendMessageOverSocket).mockResolvedValue({
    success: true,
    tempId: firstTempId,
    messageId: 'server-1',
    // A duplicate ACK means the first attempt did reach the server after all,
    // and its status is the truthful one.
    duplicate: true,
    status: 'delivered',
  });

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Message: Hello Ananya'}).props.onPress();
  });

  expect(jest.mocked(sendMessageOverSocket).mock.calls[1][0].tempId).toBe(firstTempId);
  expect(statusOf(renderer, 'Delivered')).toEqual(['Delivered']);
  expect(notifyMessageOnce).not.toHaveBeenCalled();
  // The retry must fold onto the same bubble rather than adding a second one.
  expect(renderer.root.findAllByProps({children: 'Hello Ananya'})).toHaveLength(nodesPerBubble);
});

test('marks the chat read when a message arrives while the thread is open', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    handlers.onMessage({
      id: 'inbound-1',
      text: 'Hey',
      createdAt: '2026-08-24T00:56:00.000Z',
      isOwn: false,
      status: 'delivered',
      messageType: 'text',
    });
  });

  expect(emitChatRead).toHaveBeenCalledWith('chat-1');
  expect(markChatRead).toHaveBeenCalledWith('chat-1');
  expect(renderer.root.findAllByProps({children: 'Hey'}).length).toBeGreaterThan(0);
});

test('opens Figma message actions on tap and lets a reaction be changed or removed', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([{
    id: 'inbound-reaction', text: 'Yes, At 5 PM', createdAt: '2026-08-24T00:55:00.000Z',
    isOwn: false, status: 'delivered', messageType: 'text',
  }]);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Yes, At 5 PM'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Message actions'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Highlighted selected message'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Select message'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Copy message'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'React 😟'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Remove 😟 reaction'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Message actions'})).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Yes, At 5 PM'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'React 😟'}).props.onPress();
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Remove 😟 reaction'})).toHaveLength(0);
});

test('opens in-chat search from the contact profile search action', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Open Ananya contact'})[0].props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Ananya profile'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Search'}).props.onPress();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Search messages'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Shared Files'})).toHaveLength(0);
});

test('toggles the supplied selected-message highlight and switches the toolbar for one or many messages', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([
    {id: 'message-1', text: 'Hello Rahul thanks', createdAt: '2026-08-24T00:55:00.000Z', isOwn: true, status: 'read', messageType: 'text'},
    {id: 'message-2', text: 'Yes, At 5 PM', createdAt: '2026-08-24T00:56:00.000Z', isOwn: false, status: 'delivered', messageType: 'text'},
  ]);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Hello Rahul thanks'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Select message'}).props.onPress();
  });

  expect(renderer.root.findByProps({accessibilityLabel: '1 messages selected'})).toBeDefined();
  const highlight = renderer.root.findByProps({accessibilityLabel: 'Selected message highlight'});
  expect(highlight.findByProps({fill: '#F1EBFE', fillOpacity: 0.5})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Single message selection actions'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Reply to selected message'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Pin selected message'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Delete selected messages'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Forward selected messages'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Deselect selected message: Hello Rahul thanks'}).props.onPress();
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Selected message highlight'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: '1 messages selected'})).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Hello Rahul thanks'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Select message'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Select message: Yes, At 5 PM'}).props.onPress();
  });

  expect(renderer.root.findByProps({accessibilityLabel: '2 messages selected'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Multiple message selection actions'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Reply to selected message'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Pin selected message'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Delete selected messages'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Forward selected messages'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Deselect selected message: Hello Rahul thanks'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel: '1 messages selected'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Deselect selected message: Hello Rahul thanks'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Deselect selected message: Yes, At 5 PM'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Deselect selected message: Yes, At 5 PM'}).props.onPress();
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Selected message highlight'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: '1 messages selected'})).toHaveLength(0);
});

test('shows message options for the selected sent or received message', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([
    {id: 'sent-options', text: 'Sent options', createdAt: '2026-08-24T00:55:00.000Z', isOwn: true, status: 'read', messageType: 'text'},
    {id: 'received-options', text: 'Received options', createdAt: '2026-08-24T00:56:00.000Z', isOwn: false, status: 'delivered', messageType: 'text'},
  ]);
  const renderer = await renderScreen();

  for (const message of ['Sent options', 'Received options']) {
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: `Message: ${message}`}).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: 'Select message'}).props.onPress();
    });
    expect(renderer.root.findByProps({accessibilityLabel: 'More options for selected message'})).toBeDefined();

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: 'More options for selected message'}).props.onPress();
    });
    expect(renderer.root.findByProps({accessibilityLabel: 'Message actions'})).toBeDefined();
    expect(renderer.root.findAllByProps({accessibilityLabel: 'More options for selected message'})).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: 'Copy message'}).props.onPress();
    });
  }
});

test('highlights Reply, previews the sender, cancels cleanly, and sends replyTo without changing the original', async () => {
  jest.useFakeTimers();
  try {
  jest.mocked(getChatMessages).mockResolvedValue([{
    id: 'original-1', text: 'Yes, At 5 PM', createdAt: '2026-08-24T00:55:00.000Z',
    isOwn: false, status: 'delivered', messageType: 'text',
  }]);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Yes, At 5 PM'}).props.onLongPress();
  });
  const replyAction = renderer.root.findByProps({accessibilityLabel: 'Reply message'});
  await ReactTestRenderer.act(async () => { replyAction.props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Reply message'}).props.accessibilityState).toEqual({selected: true});

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(170);
    await Promise.resolve();
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Replying to message'})).toBeDefined();
  expect(renderer.root.findAll(node => Array.isArray(node.props.children) && node.props.children.join('') === 'Replying to Ananya').length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({children: 'Yes, At 5 PM'}).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Cancel reply'}).props.onPress();
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Replying to message'})).toHaveLength(0);

  // Select the same unchanged original again, then send a real reply.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Yes, At 5 PM'}).props.onLongPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Reply message'}).props.onPress();
    jest.advanceTimersByTime(170);
    await Promise.resolve();
  });
  await sendMessage(renderer, 'See you then');

  expect(sendMessageOverSocket).toHaveBeenCalledWith(expect.objectContaining({
    text: 'See you then', replyTo: 'original-1', receiverId: 'user-ananya',
  }));
  const sentPayload = jest.mocked(sendMessageOverSocket).mock.calls.at(-1)![0];
  // The production socket can echo a partial record before the next history
  // fetch. It must not erase the selected-message card already on the bubble.
  await ReactTestRenderer.act(async () => {
    handlers.onMessage({
      id: 'server-1', tempId: sentPayload.tempId, text: 'See you then',
      createdAt: new Date().toISOString(), isOwn: true, status: 'sent',
      messageType: 'text', replyTo: null, replyPreview: null,
    });
  });
  expect(renderer.root.findAllByProps({children: 'Yes, At 5 PM'}).length).toBeGreaterThan(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Reply to Ananya: Yes, At 5 PM'})).toBeDefined();
  } finally {
    jest.useRealTimers();
  }
});

test('validates an empty reply without losing its original-message preview', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([{
    id: 'empty-reply-original', text: 'Can you confirm?', createdAt: '2026-08-24T00:55:00.000Z',
    isOwn: false, status: 'delivered', messageType: 'text',
  }]);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Can you confirm?'}).props.onLongPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Reply message'}).props.onPress();
    await new Promise<void>(resolve => setTimeout(resolve, 170));
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Send message'}).props.onPress();
  });

  expect(renderer.root.findByProps({children: 'Reply cannot be empty.'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Replying to message'})).toBeDefined();
  expect(sendMessageOverSocket).not.toHaveBeenCalled();
});

test('highlights Mark as Unread, persists it, and places the unread boundary at the selected message', async () => {
  jest.useFakeTimers();
  try {
  jest.mocked(getChatMessages).mockResolvedValue([{
    id: 'unread-target', text: 'Yes, At 5 PM', createdAt: '2026-08-24T00:55:00.000Z',
    isOwn: false, status: 'delivered', messageType: 'text',
  }]);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Yes, At 5 PM'}).props.onLongPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Mark as unread'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Mark as unread'}).props.accessibilityState).toEqual({selected: true});

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(170);
    await Promise.resolve();
  });

  expect(markChatUnread).toHaveBeenCalledWith('chat-1');
  expect(renderer.root.findByProps({accessibilityLabel: '1 unread message'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Message actions'})).toHaveLength(0);
  } finally {
    jest.useRealTimers();
  }
});

test('offers a functional Undo before deleting a received message for the current user', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([{
    id: 'received-delete-1', text: 'Yes, At 5 PM', createdAt: '2026-08-24T00:55:00.000Z',
    isOwn: false, status: 'delivered', messageType: 'text',
  }]);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Yes, At 5 PM'}).props.onLongPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Delete message'}).props.onPress();
  });

  expect(deleteMessage).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Delete this Message?'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Delete for everyone'})).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Delete for me'}).props.onPress();
  });

  expect(deleteMessage).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Message: Yes, At 5 PM'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'This message was deleted.'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'This message has been deleted. Undo'})).toBeDefined();
  expect(renderer.root.findByProps({d: 'M0 11.5227H34.6861V12.2227H0V11.5227Z'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Delete this Message?'})).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Undo delete message'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Message: Yes, At 5 PM'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'This message has been deleted. Undo'})).toHaveLength(0);
  expect(deleteMessage).not.toHaveBeenCalled();
});

test.each(['android', 'ios'] as const)('hides Delete for Everyone after 24 hours on %s while keeping Delete for Me', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
    jest.mocked(getChatMessages).mockResolvedValue([{
      id: 'expired-delete', text: 'Old message', createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      isOwn: true, messageType: 'text',
    }]);
    const renderer = await renderScreen();
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Message: Old message'}).props.onLongPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Delete message'}).props.onPress());
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Delete for everyone'})).toHaveLength(0);
    expect(renderer.root.findByProps({accessibilityLabel: 'Delete for me'})).toBeDefined();
    expect(deleteMessage).not.toHaveBeenCalled();
  } finally { os.restore(); }
});

test.each(['android', 'ios'] as const)('rechecks the 24-hour limit when confirming an open dialog on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    jest.mocked(getChatMessages).mockResolvedValue([{
      id: 'expiring-delete', text: 'Expiring message', createdAt: new Date(now - 24 * 60 * 60 * 1000 + 1000).toISOString(),
      isOwn: true, messageType: 'text',
    }]);
    const renderer = await renderScreen();
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Message: Expiring message'}).props.onLongPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Delete message'}).props.onPress());
    const confirm = renderer.root.findByProps({accessibilityLabel: 'Delete for everyone'}).props.onPress;
    clock.mockReturnValue(now + 2000);
    await ReactTestRenderer.act(async () => confirm());
    expect(deleteMessage).not.toHaveBeenCalled();
    expect(emitMessageDeletedForEveryone).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({accessibilityLabel: 'Message: Expiring message'})).toBeDefined();
  } finally { clock.mockRestore(); os.restore(); }
});

test('deletes a sent message for everyone and keeps its timestamped tombstone in both chats', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([{
    id: 'sent-delete-1', text: 'Sent original', createdAt: new Date(Date.now() - 60000).toISOString(),
    isOwn: true, status: 'read', messageType: 'text',
  }]);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Sent original'}).props.onLongPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Delete message'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Delete for everyone'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Delete for me'})).toBeDefined();

  jest.useFakeTimers();
  try {
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: 'Delete for everyone'}).props.onPress();
    });

    expect(deleteMessage).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({accessibilityLabel: 'This message has been deleted. Undo'})).toBeDefined();
    expect(renderer.root.findAllByProps({children: 'Sent original'})).toHaveLength(0);
    expect(renderer.root.findByProps({accessibilityLabel: 'This message was deleted.'})).toBeDefined();
    expect(renderer.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('Read')).length).toBeGreaterThan(0);

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(3500);
      await Promise.resolve();
    });
    expect(deleteMessage).toHaveBeenCalledWith('sent-delete-1', true);
    expect(emitMessageDeletedForEveryone).toHaveBeenCalledWith('sent-delete-1');
    expect(renderer.root.findAllByProps({accessibilityLabel: 'This message has been deleted. Undo'})).toHaveLength(0);

    // The receiver gets the same id and replaces it in place rather than
    // filtering it out of the conversation.
    await ReactTestRenderer.act(async () => {
      handlers.onDeleted?.('sent-delete-1', 'everyone');
    });
    expect(renderer.root.findByProps({accessibilityLabel: 'This message was deleted.'})).toBeDefined();
  } finally {
    jest.useRealTimers();
  }
});

test('replaces a received message with the same tombstone when the sender deletes for everyone', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([{
    id: 'receiver-global-1', text: 'Original from sender', createdAt: '2026-08-24T00:55:00.000Z',
    isOwn: false, status: 'read', messageType: 'text',
  }]);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    handlers.onDeleted?.('receiver-global-1', 'everyone');
  });

  expect(renderer.root.findAllByProps({children: 'Original from sender'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'This message was deleted.'})).toBeDefined();
});

test.each(['me', 'everyone'] as const)('keeps a deleted voice note removed for %s after a stale socket echo and reopening', async scope => {
  jest.useFakeTimers();
  const voice = {id:'voice-delete-1',text:'',createdAt:new Date(Date.now() - 60000).toISOString(),isOwn:true,status:'sent',messageType:'audio' as const,mediaUrl:'https://cdn.example/voice.m4a',audioDuration:12,waveform:[4,8,6]};
  jest.mocked(getChatMessages).mockResolvedValue([voice]);
  const thread = await renderScreen();
  try {
    await ReactTestRenderer.act(async () => thread.root.findByProps({accessibilityLabel:'Message: audio'}).props.onLongPress());
    await ReactTestRenderer.act(async () => thread.root.findByProps({accessibilityLabel:'Delete message'}).props.onPress());
    await ReactTestRenderer.act(async () => thread.root.findByProps({accessibilityLabel:scope === 'me' ? 'Delete for me' : 'Delete for everyone'}).props.onPress());
    await ReactTestRenderer.act(async () => {await jest.advanceTimersByTimeAsync(3500);});
    expect(deleteMessage).toHaveBeenCalledWith(voice.id, scope === 'everyone');
    await ReactTestRenderer.act(async () => handlers.onMessage({...voice,isDeleted:false,deletedForMe:false}));
    expect(thread.root.findAllByProps({accessibilityLabel:'Play voice message'})).toHaveLength(0);
    const store = require('../src/services/messageStore');
    const persisted = jest.mocked(store.storeMessages).mock.lastCall![1];
    expect(persisted[0].mediaUrl).toBeUndefined();
    expect(persisted[0][scope === 'me' ? 'deletedForMe' : 'isDeleted']).toBe(true);
    await ReactTestRenderer.act(async () => thread.unmount());
    jest.mocked(store.loadStoredMessages).mockResolvedValueOnce(persisted);
    const reopened = await renderScreen();
    expect(reopened.root.findAllByProps({accessibilityLabel:'Play voice message'})).toHaveLength(0);
    expect(reopened.root.findByProps({accessibilityLabel:'This message was deleted.'})).toBeDefined();
  } finally {
    jest.useRealTimers();
  }
});

test('deletes a failed local voice note without sending its temporary ID to the server', async () => {
  jest.useFakeTimers();
  const failed = {id:'temp-failed-voice',tempId:'temp-failed-voice',text:'',createdAt:'2026-10-23T00:55:00.000Z',isOwn:true,status:'failed',messageType:'audio' as const,mediaUrl:'file:///voice.m4a',audioDuration:12};
  const store = require('../src/services/messageStore');
  jest.mocked(store.loadStoredMessages).mockResolvedValueOnce([failed]);
  const thread = await renderScreen();
  try {
    await ReactTestRenderer.act(async () => thread.root.findByProps({accessibilityLabel:'Message: audio'}).props.onLongPress());
    await ReactTestRenderer.act(async () => thread.root.findByProps({accessibilityLabel:'Delete message'}).props.onPress());
    await ReactTestRenderer.act(async () => thread.root.findByProps({accessibilityLabel:'Delete for me'}).props.onPress());
    await ReactTestRenderer.act(async () => {await jest.advanceTimersByTimeAsync(3500);});
    expect(deleteMessage).not.toHaveBeenCalled();
    expect(thread.root.findAllByProps({accessibilityLabel:'Play voice message'})).toHaveLength(0);
    expect(jest.mocked(store.storeMessages).mock.lastCall![1]).toEqual([expect.objectContaining({deletedForMe:true,queued:false,mediaUrl:undefined})]);
  } finally {
    jest.useRealTimers();
  }
});

test('does not expose Send or call the API for a whitespace-only message', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Type a message'}).props.onChangeText('   ');
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Send message'})).toHaveLength(0);
  expect(sendMessageOverSocket).not.toHaveBeenCalled();
  expect(sendChatMessage).not.toHaveBeenCalled();
});

test('swiping a message right opens reply navigation and sends the reply in chat', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([{
    id: 'swipe-original', text: 'Swipe this message', createdAt: '2026-08-24T00:55:00.000Z',
    isOwn: false, status: 'delivered', messageType: 'text',
  }]);
  const renderer = await renderScreen();
  const swipeTarget = renderer.root.findByProps({accessibilityLabel: 'Swipe Swipe this message right to reply'});
  expect(swipeTarget.props.accessibilityHint).toBe('Swipe right to reply');
  expect(swipeTarget.props.onMoveShouldSetResponder).toEqual(expect.any(Function));
  expect(swipeTarget.props.onResponderRelease).toEqual(expect.any(Function));
  await ReactTestRenderer.act(async () => {
    swipeTarget.props.onAccessibilityAction({nativeEvent: {actionName: 'activate'}});
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Swipe to reply indicator'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Replying to message'})).toBeDefined();
  await sendMessage(renderer, 'Sent from swipe reply');

  expect(sendMessageOverSocket).toHaveBeenCalledWith(expect.objectContaining({
    text: 'Sent from swipe reply', replyTo: 'swipe-original', receiverId: 'user-ananya',
  }));
  expect(renderer.root.findByProps({accessibilityLabel: 'Reply to Ananya: Swipe this message'})).toBeDefined();
  expect(renderer.root.findAllByProps({children: 'Sent from swipe reply'}).length).toBeGreaterThan(0);
});

test('removes a reaction directly from the badge below the message', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([{
    id: 'reaction-badge', text: 'React to me', createdAt: '2026-08-24T00:55:00.000Z',
    isOwn: false, status: 'delivered', messageType: 'text', myReaction: '😍',
  }]);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Remove 😍 reaction'}).props.onPress();
  });

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Remove 😍 reaction'})).toHaveLength(0);
});

test('closes message actions from the backdrop and exposes the downward-swipe gesture', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([{
    id: 'dismiss-actions', text: 'Dismiss me', createdAt: '2026-08-24T00:55:00.000Z',
    isOwn: false, status: 'delivered', messageType: 'text',
  }]);
  const renderer = await renderScreen();
  const open = async () => ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: Dismiss me'}).props.onLongPress();
  });

  await open();
  const surface = renderer.root.findByProps({accessibilityLabel: 'Message actions'});
  const offset = StyleSheet.flatten(surface.props.style).transform[0].translateY;
  const resetPosition = jest.spyOn(offset, 'setValue');
  resetPosition.mockClear();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Close message actions'}).props.onPress();
    // A delayed event from the original press must not cancel dismissal.
    renderer.root.findByProps({accessibilityLabel: 'Message: Dismiss me'}).props.onLongPress();
    await new Promise<void>(resolve => setTimeout(resolve, 220));
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Message actions'})).toHaveLength(0);
  expect(resetPosition).not.toHaveBeenCalledWith(36);
  resetPosition.mockRestore();

  await open();
  const sheet = renderer.root.findByProps({accessibilityLabel: 'Message actions'});
  expect(sheet.props.accessibilityHint).toBe('Swipe down to close');
  expect(sheet.props.onMoveShouldSetResponder).toEqual(expect.any(Function));
  expect(sheet.props.onResponderRelease).toEqual(expect.any(Function));
});

test('shows a reconnecting banner while the network is up and socket is reconnecting', async () => {
  jest.mocked(require('../src/services/chatRealtime').subscribeToConnection)
    .mockImplementation((listener: (state: string) => void) => {
      listener('connecting');
      return () => undefined;
    });

  const renderer = await renderScreen();

  const banner = renderer.root.findByProps({accessibilityLabel: 'Reconnecting'});
  expect(StyleSheet.flatten(banner.props.style).backgroundColor).toBe('#FEF3C7');
});

test('shows no internet connection immediately when the device goes offline', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    networkListener({isConnected: false, isInternetReachable: false});
  });

  const banner = renderer.root.findByProps({accessibilityLabel: 'No internet connection'});
  expect(StyleSheet.flatten(banner.props.style).backgroundColor).toBe('#FEE2E2');
});

test('renders one sent image as a standalone media card with its caption', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([{
    id: 'photo-1', text: 'Holiday photo', createdAt: '2026-08-24T00:55:00.000Z',
    isOwn: true, status: 'read', messageType: 'image', mediaUrl: 'https://cdn/photo.jpg',
  }]);
  const renderer = await renderScreen();
  expect(renderer.root.findByProps({accessibilityLabel: 'Open photo preview'})).toBeDefined();
  expect(renderer.root.findAllByProps({children: 'Holiday photo'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Message album with 1 items'})).toHaveLength(0);
});

test('renders one multi-select batch as a numbered 2 by 2 album card', async () => {
  jest.mocked(getChatMessages).mockResolvedValue(Array.from({length: 4}, (_value, index) => ({
    id: `album-${index + 1}`, text: index === 0 ? 'Holiday photos' : '',
    createdAt: `2026-08-24T00:55:0${index}.000Z`, isOwn: true, status: 'read' as const,
    messageType: 'image' as const, mediaUrl: `https://cdn/photo-${index + 1}.jpg`, mediaGroupId: 'batch-1',
  })));
  const renderer = await renderScreen();
  expect(renderer.root.findByProps({accessibilityLabel: 'Message album with 4 items'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: '4 media items'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'View all 4 media items'})).toBeDefined();
  expect(renderer.root.findAllByProps({children: 'Holiday photos'}).length).toBeGreaterThan(0);
});

// Group chats: the role beside a sender, and the group routes for location and
// voice notes.
const groupContact = {userId: 'group-1', name: 'Bharath Don', thumbnail: null, kind: 'group' as const};
const groupWithRoles = (roles: Record<string, 'superadmin' | 'admin' | 'moderator' | 'member'>) => ({
  id: 'group-1', name: 'Bharath Don', description: '', rules: [],
  settings: {onlyAdminsCanMessage: false, onlyAdminsCanShareMedia: false},
  participants: Object.entries(roles).map(([userId, role]) => ({userId, name: userId, role})),
});

test('a group message shows its sender\'s real role, Super Admin included', async () => {
  jest.mocked(getGroupDetails).mockResolvedValue(groupWithRoles({'owner-1': 'superadmin', 'admin-1': 'admin', 'mod-1': 'moderator'}));
  jest.mocked(getGroupMessages).mockResolvedValue([
    {id: 'g1', text: 'Welcome all', createdAt: '2026-10-14T09:00:00.000Z', isOwn: false, senderId: 'owner-1', senderName: 'Owner'},
    {id: 'g2', text: 'Hello', createdAt: '2026-10-14T09:01:00.000Z', isOwn: false, senderId: 'admin-1', senderName: 'Asha', senderRole: 'member'},
    {id: 'g3', text: 'Hi', createdAt: '2026-10-14T09:02:00.000Z', isOwn: false, senderId: 'mod-1', senderName: 'Ravi'},
  ]);
  const renderer = await renderScreen(groupContact, 'group-1');
  await flush();

  const labels = renderer.root.findAllByProps({children: 'Super Admin'}).length;
  expect(labels).toBeGreaterThan(0);
  // A stale role copied onto the message loses to the roster.
  expect(renderer.root.findAllByProps({children: 'Admin'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({children: 'Moderator'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({children: 'Member'})).toHaveLength(0);
});

test('a message the Super Admin sends in a group shows Super Admin straight away', async () => {
  await saveSession({
    token: 'jwt', user: {id: 'me', name: 'Me'}, isProfileComplete: true, message: '',
    requires2FA: false, twoFactorUserId: '', twoFactorMethod: '',
  });
  try {
    jest.mocked(getGroupDetails).mockResolvedValue(groupWithRoles({me: 'superadmin', 'member-1': 'member'}));
    const renderer = await renderScreen(groupContact, 'group-1');
    await flush();

    await sendMessage(renderer, 'First message');

    // The sent bubble carries no role of its own; it is read from the roster.
    expect(renderer.root.findAllByProps({children: 'Super Admin'}).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({children: 'Member'})).toHaveLength(0);
  } finally {
    await clearSession();
  }
});

test('shares a location in a group through the group route, never the one-to-one endpoint', async () => {
  jest.mocked(getGroupDetails).mockResolvedValue(groupWithRoles({me: 'superadmin'}));
  const renderer = await renderScreen(groupContact, 'group-1');
  await flush();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Attach a file'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Location'})[0].props.onPress();
    for (let tick = 0; tick < 40; tick += 1) { await Promise.resolve(); }
  });

  expect(sendGroupMessageOverSocket).toHaveBeenCalledWith(expect.objectContaining({
    groupId: 'group-1', text: expect.stringContaining('https://www.google.com/maps?q=9.925200,78.119800'),
  }));
  expect(sendChatMessage).not.toHaveBeenCalled();
});

test('a voice note recorded in a group is uploaded to the group with a type the server accepts', async () => {
  jest.mocked(getGroupDetails).mockResolvedValue(groupWithRoles({me: 'superadmin'}));
  jest.mocked(sendGroupMedia).mockResolvedValue({
    id: 'group-voice-1', text: '', createdAt: '2026-10-14T09:00:00.000Z', isOwn: true, status: 'sent',
    messageType: 'audio', mediaUrl: 'https://cdn.example/voice.m4a',
  });
  const renderer = await renderScreen(groupContact, 'group-1');
  await flush();
  const touch = {identifier: 'voice-touch', pageX: 320, pageY: 700};
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Record voice message'}).props.onPressIn({nativeEvent: touch});
  });
  const dock = renderer.root.findByProps({testID: 'chat-composer-dock'});
  await ReactTestRenderer.act(async () => {
    dock.props.onTouchMove({nativeEvent: {touches: [{...touch, pageY: 693}]}});
    dock.props.onTouchEnd({nativeEvent: {touches: []}});
  });

  expect(sendGroupMedia).toHaveBeenCalledTimes(1);
  // `.m4a` goes up as audio/mp4, one of the types the group upload accepts.
  expect(sendGroupMedia).toHaveBeenCalledWith('group-1', expect.objectContaining({uri: 'file:///voice.m4a', type: 'audio/mp4'}));
  expect(sendChatMedia).not.toHaveBeenCalled();
});

// An album card is a two-column grid. Its height follows its rows, so two photos
// leave no empty band between the media and the caption, and a lone last tile
// fills its row instead of leaving a hole beside it.
const albumPhoto = (index: number) => ({
  id: `album-${index}`, text: index === 1 ? 'Beach day' : '',
  createdAt: `2026-08-24T00:55:0${index}.000Z`, isOwn: true, status: 'read' as const,
  messageType: 'image' as const, mediaUrl: `https://cdn/photo-${index}.jpg`, mediaGroupId: 'batch-aligned',
});

test.each([
  [2, 93.5, [false, false]],
  [3, 190, [false, false, true]],
  [4, 190, [false, false, false, false]],
])('lays out a %i-photo album with no empty space under its tiles', async (count, gridHeight, wideTiles) => {
  jest.mocked(getChatMessages).mockResolvedValue(Array.from({length: count}, (_value, index) => albumPhoto(index + 1)));
  const renderer = await renderScreen();

  const grid = StyleSheet.flatten(renderer.root.findByProps({accessibilityLabel: `${count} media items`}).props.style);
  expect(grid).toEqual(expect.objectContaining({width: 210, height: gridHeight}));

  wideTiles.forEach((wide, index) => {
    const tile = renderer.root.findByProps({accessibilityLabel: `Open media ${index + 1} of ${count}`}).parent!;
    expect(StyleSheet.flatten(tile.props.style).width).toBe(wide ? 210 : 103.5);
  });
  // The caption still sits under the media, once.
  expect(renderer.root.findAllByProps({children: 'Beach day'}).length).toBeGreaterThan(0);
});

// A multi-select send is one upload per file. The backend keeps no batch id, so
// the files are tagged through the upload name; reading it back is what rebuilds
// the album after a reinstall (see mediaAlbum and normalizeMessage).
async function sendSharedPhotos(fileNames: string[]) {
  const incomingMedia = {
    id: 'share-test',
    media: fileNames.map((fileName, index) => ({
      id: `shared-${index}`, uri: `file:///shared/${fileName}`, fileName, mimeType: 'image/jpeg', type: 'image' as const,
    })),
  };
  jest.mocked(sendChatMedia).mockImplementation(async (_receiverId, upload) => ({
    id: `server-${upload.name}`, text: '', createdAt: new Date().toISOString(), isOwn: true, status: 'sent',
    messageType: 'image', mediaUrl: `https://cdn/${upload.name}`,
  }));
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{
        frame: {x: 0, y: 0, width: 307, height: 641},
        insets: {top: 24, right: 0, bottom: 18, left: 0},
      }}>
        <ChatScreen chatId="chat-1" contact={contact} incomingMedia={incomingMedia} onBack={jest.fn()} />
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });
  mountedRenderers.push(renderer!);
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({accessibilityLabel: 'Send selected media'}).props.onPress();
    for (let tick = 0; tick < 40; tick += 1) { await Promise.resolve(); }
  });
  return renderer!;
}

test('tags every file of a multi-photo send with one album token', async () => {
  const renderer = await sendSharedPhotos(['beach.jpg', 'sunset.jpg', 'dinner.jpg']);

  const names = jest.mocked(sendChatMedia).mock.calls.map(call => call[1].name);
  expect(names).toHaveLength(3);
  const tokens = names.map(name => /^(?:beach|sunset|dinner)~album-([a-z0-9]+)\.jpg$/.exec(name)?.[1]);
  expect(tokens.every(Boolean)).toBe(true);
  expect(new Set(tokens).size).toBe(1);
  // The sender's thread shows it as one album.
  expect(renderer.root.findByProps({accessibilityLabel: 'Message album with 3 items'})).toBeDefined();
});

test('a single photo is sent under its own name, with no album tag', async () => {
  await sendSharedPhotos(['beach.jpg']);

  expect(jest.mocked(sendChatMedia).mock.calls.map(call => call[1].name)).toEqual(['beach.jpg']);
});

test('the sender sees their own photo and video without a download button', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([
    {
      id: 'sent-photo', text: '', createdAt: '2026-08-24T00:55:00.000Z', isOwn: true, status: 'read',
      messageType: 'image', mediaUrl: 'https://cdn/photo.jpg',
    },
    {
      id: 'sent-video', text: '', createdAt: '2026-08-24T00:56:00.000Z', isOwn: true, status: 'read',
      messageType: 'video', mediaUrl: 'https://cdn/clip.mp4',
    },
  ]);
  const renderer = await renderScreen();

  // Nothing offers to download what the user just sent, and nothing sits where
  // they would tap to open it.
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Download image'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Download video'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Open photo preview'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Open video preview'})).toBeDefined();
  // A sent video says it can be played.
  expect(renderer.root.findByProps({accessibilityLabel: 'Play video'})).toBeDefined();
});

test('a received photo and video keep their download button', async () => {
  jest.mocked(getChatMessages).mockResolvedValue([
    {
      id: 'got-photo', text: '', createdAt: '2026-08-24T00:55:00.000Z', isOwn: false,
      messageType: 'image', mediaUrl: 'https://cdn/photo.jpg',
    },
    {
      id: 'got-video', text: '', createdAt: '2026-08-24T00:56:00.000Z', isOwn: false,
      messageType: 'video', mediaUrl: 'https://cdn/clip.mp4',
    },
  ]);
  const renderer = await renderScreen();

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Download image'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Download video'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Play video'})).toHaveLength(0);
});

test('the emoji button opens the Story 6 picker below the composer', async () => {
  const renderer = await renderScreen();

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Emoji picker'})).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add emoji'}).props.onPress();
    await Promise.resolve();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Emoji picker'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Search Emoji'})).toBeDefined();
  // The composer stays put; the panel takes the keyboard's place beneath it.
  expect(renderer.root.findByProps({accessibilityLabel: 'Type a message'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add emoji'}).props.onPress();
  });

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Emoji picker'})).toHaveLength(0);
});

test('focusing the composer closes the picker so the keyboard has the space', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add emoji'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Type a message'}).props.onFocus();
  });

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Emoji picker'})).toHaveLength(0);
});

test('an emoji lands at the caret rather than at the end of the draft', async () => {
  const renderer = await renderScreen();
  const composer = () => renderer.root.findByProps({accessibilityLabel: 'Type a message'});

  await ReactTestRenderer.act(async () => {
    composer().props.onChangeText('Great job');
  });
  // Caret parked between "Great" and " job".
  await ReactTestRenderer.act(async () => {
    composer().props.onSelectionChange({nativeEvent: {selection: {start: 5, end: 5}}});
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add emoji'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add 📱'}).props.onPress();
    await Promise.resolve();
  });

  expect(composer().props.value).toBe('Great📱 job');
  // The caret is handed back so the next tap continues the run.
  expect(composer().props.selection).toEqual({start: 7, end: 7});
});

test('consecutive taps build a run of emoji instead of overwriting each other', async () => {
  const renderer = await renderScreen();
  const composer = () => renderer.root.findByProps({accessibilityLabel: 'Type a message'});

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add emoji'}).props.onPress();
    await Promise.resolve();
  });
  // Pinned to a category so the assertion does not depend on what the recents
  // history happens to hold.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Travel'}).props.onPress();
    await Promise.resolve();
  });
  for (const emoji of ['🚗', '🚕']) {
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel: `Add ${emoji}`}).props.onPress();
      await Promise.resolve();
    });
  }

  expect(composer().props.value).toBe('🚗🚕');
});

test('sends a picked GIF over the socket as a hosted image message', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add emoji'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'GIF'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Send Party GIF'}).props.onPress();
  });
  await flush();

  // No upload: the catalogue URL travels as the message's own mediaUrl.
  expect(sendChatMedia).not.toHaveBeenCalled();
  expect(sendMessageOverSocket).toHaveBeenCalledWith(expect.objectContaining({
    receiverId: 'user-ananya',
    mediaType: 'image',
    mediaUrl: expect.stringMatching(/^https:\/\/\S+\.gif$/),
  }));
  expect(renderer.root.findByProps({accessibilityLabel: 'Open photo preview'})).toBeDefined();
  expect(statusOf(renderer, 'Sent')).toEqual(['Sent']);
});

test('sends every picked GIF in order while a previous GIF is awaiting confirmation', async () => {
  let confirmFirst!: (ack: Awaited<ReturnType<typeof sendMessageOverSocket>>) => void;
  jest.mocked(sendMessageOverSocket).mockImplementationOnce(() => new Promise(resolve => {
    confirmFirst = resolve;
  })).mockImplementation(async payload => ({
    success: true, tempId: payload.tempId, messageId: `server-${payload.tempId}`, status: 'sent',
  }));
  const renderer = await renderScreen();
  for (const accessibilityLabel of ['Add emoji', 'GIF', 'Send Party GIF']) {
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({accessibilityLabel}).props.onPress();
    });
  }
  await flush();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Send Laughing GIF'}).props.onPress();
  });
  await flush();
  expect(sendMessageOverSocket).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    confirmFirst({success: true, tempId: 'temp', messageId: 'gif-server-1', status: 'sent'});
  });
  await flush();
  expect(sendMessageOverSocket).toHaveBeenCalledTimes(2);
  const attempts = jest.mocked(sendMessageOverSocket).mock.calls.map(([payload]) => payload);
  expect(attempts[0].mediaUrl).toContain('l0MYt5jPR6QX5pnqM');
  expect(attempts[1].mediaUrl).toContain('10JhviFuU2gWD6');
  expect(attempts[1].tempId).not.toBe(attempts[0].tempId);
  expect(attempts.every(payload => payload.mediaType === 'image')).toBe(true);
  expect(statusOf(renderer, 'Sent', 'Not sent, tap to retry')).toEqual(['Sent']);
  expect(sendChatMessage).not.toHaveBeenCalled();
});

test('queues a GIF picked while offline and sends it on reconnection', async () => {
  let reconnect!: (state: string) => void;
  jest.mocked(require('../src/services/chatRealtime').subscribeToConnection)
    .mockImplementation((listener: (state: string) => void) => {
      reconnect = listener;
      listener('offline');
      return () => undefined;
    });
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add emoji'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'GIF'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Send Party GIF'}).props.onPress();
  });
  await flush();

  expect(sendMessageOverSocket).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Queued to send when online'})).toBeDefined();
  await ReactTestRenderer.act(async () => { reconnect('connected'); });
  await flush();
  expect(sendMessageOverSocket).toHaveBeenCalledTimes(1);
  expect(sendMessageOverSocket).toHaveBeenCalledWith(expect.objectContaining({
    receiverId: 'user-ananya', mediaType: 'image',
    mediaUrl: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
  }));
  expect(statusOf(renderer, 'Sent', 'Queued to send when online')).toEqual(['Sent']);
});

test('a failed GIF retries as a GIF rather than as an empty text message', async () => {
  jest.mocked(sendMessageOverSocket).mockRejectedValueOnce(new Error('socket down'));
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add emoji'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'GIF'}).props.onPress();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Send Party GIF'}).props.onPress();
  });
  await flush();

  // The REST route only carries text, so a GIF must never fall back to it.
  expect(sendChatMessage).not.toHaveBeenCalled();

  expect(statusOf(renderer, 'Not sent, tap to retry')).toEqual(['Not sent, tap to retry']);

  const firstAttempt = jest.mocked(sendMessageOverSocket).mock.calls[0][0];
  jest.mocked(sendMessageOverSocket).mockClear();

  // The failed bubble itself is the retry affordance; the inner tap target
  // opens the preview.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Message: image'}).props.onPress();
  });
  await flush();

  expect(sendMessageOverSocket).toHaveBeenCalledWith(expect.objectContaining({
    tempId: firstAttempt.tempId,
    mediaType: 'image',
    mediaUrl: firstAttempt.mediaUrl,
  }));
});

test('a silent server is not retried over REST, which cannot carry the client id', async () => {
  // The socket accepted the emit and the server simply never answered, so it
  // may already hold the message. `POST /chats/send` mints its own tempId, so
  // retrying there would store a second copy instead of collapsing onto the
  // first - the bubble is failed instead, and the retry replays the socket.
  jest.mocked(sendMessageOverSocket).mockRejectedValue(
    Object.assign(new Error('The server did not confirm the message in time.'), {name: 'AckTimeoutError'}),
  );

  const renderer = await renderScreen();
  await sendMessage(renderer, 'Hello Ananya');

  expect(sendChatMessage).not.toHaveBeenCalled();
  expect(sendMessageOverSocket).toHaveBeenCalledTimes(1);
  expect(statusOf(renderer, 'Not sent, tap to retry')).toEqual(['Not sent, tap to retry']);
});


it('blocks from chat options, prevents calls, then restores the composer after unblocking', async () => {
  const blockedFetch = jest.spyOn(privacyApi, 'getBlockedUsers').mockResolvedValue([]);
  const unblock = jest.spyOn(privacyApi, 'unblockUser').mockResolvedValue('Unblocked');
  jest.mocked(blockChatUser).mockResolvedValue('Blocked');
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => renderer.root.findByType(DirectChatMenu).props.onBlock());
  await ReactTestRenderer.act(async () => renderer.root.findByType(BlockConfirmation).props.onConfirm());
  expect(blockChatUser).toHaveBeenCalledWith(contact.userId);
  expect(renderer.root.findAllByProps({accessibilityLabel:'Type a message'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer.root.findAllByProps({accessibilityLabel:'Call Ananya'})[0].props.onPress());
  expect(startCall).not.toHaveBeenCalled();
  expect(initiateCallOverSocket).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.root.findAllByProps({accessibilityLabel:'Unblock contact'})[0].props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByType(BlockConfirmation).props.onConfirm());
  expect(unblock).toHaveBeenCalledWith(contact.userId);
  expect(renderer.root.findAllByProps({accessibilityLabel:'Type a message'}).length).toBeGreaterThan(0);
  blockedFetch.mockRestore(); unblock.mockRestore();
});
