/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState, BackHandler, DeviceEventEmitter, NativeModules, Platform} from 'react-native';
import App, {resolveAuthenticatedRoute, resolveLaunchRoute} from '../App';
import type {AuthOutcome} from '../src/types/auth';
import {googleLogin, logoutSession, sendEmailOtp, verifyEmailOtp} from '../src/services/authApi';
import {createProfile} from '../src/services/profileApi';
import {ProfileSetupScreen} from '../src/screens/ProfileSetupScreen';
import {ContactsScreen} from '../src/screens/ContactsScreen';
import {normalizeAuthResponse} from '../src/utils/authResponse';
import {clearLocalCache} from '../src/services/localCache';
import {signInWithGoogle, signOutOfFirebase} from '../src/services/firebaseAuth';
import {clearSession, markSessionProfileComplete, restoreSession, saveSession} from '../src/services/sessionStore';
import {DARK_THEME} from '../src/theme/palette';
import {setActiveThemeMode} from '../src/theme/themedStyles';
import * as notificationService from '../src/services/notificationService';
import {ChatScreen} from '../src/screens/ChatScreen';
import {ChatListScreen} from '../src/screens/ChatListScreen';
import {MediaAttachmentFlow} from '../src/components/MediaAttachmentFlow';
import * as incomingShare from '../src/services/incomingShare';
import * as callAudio from '../src/services/callAudio';
import * as chatRealtime from '../src/services/chatRealtime';
import {CallEndedScreen} from '../src/components/CallEndedScreen';
import {IncomingCallExperience} from '../src/components/IncomingCallExperience';
import type {IncomingCall} from '../src/types/call';

let expireSession: (message?: string) => void = () => undefined;
jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  subscribeToSessionExpiration: jest.fn((listener: (message?: string) => void) => {
    expireSession = listener;
    return () => undefined;
  }),
}));

jest.mock('expo', () => ({requireOptionalNativeModule: () => null}));
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  return {
    ...jest.requireActual('react-native-safe-area-context'),
    SafeAreaProvider: ({children}: {children: React.ReactNode}) => ReactModule.createElement(ReactModule.Fragment, null, children),
    useSafeAreaInsets: () => ({top: 24, right: 0, bottom: 20, left: 0}),
  };
});
jest.mock('../src/services/authApi', () => ({
  completeLoginTwoFactor: jest.fn(),
  googleLogin: jest.fn(),
  logoutSession: jest.fn().mockResolvedValue(undefined),
  sendEmailOtp: jest.fn(),
  resendEmailOtp: jest.fn(),
  verifyEmailOtp: jest.fn(),
  phoneLogin: jest.fn(),
}));
jest.mock('../src/services/localCache', () => ({clearLocalCache: jest.fn().mockResolvedValue(undefined)}));
jest.mock('../src/services/profileApi', () => ({createProfile: jest.fn(), updateProfile: jest.fn()}));
jest.mock('../src/services/firebaseAuth', () => ({
  GoogleSignInCancelledError: class MockGoogleSignInCancelledError extends Error {},
  getLastGoogleEmail: jest.fn(() => 'person@example.com'),
  signInWithGoogle: jest.fn(),
  signOutOfFirebase: jest.fn().mockResolvedValue(undefined),
  FirebaseNotConfiguredError: class MockFirebaseNotConfiguredError extends Error {},
  confirmPhoneCode: jest.fn(),
  getPendingPhoneVerification: jest.fn(),
  setPendingPhoneVerification: jest.fn(),
  startPhoneVerification: jest.fn(),
}));
jest.mock('../src/services/sessionStore', () => ({
  clearSession: jest.fn().mockResolvedValue(undefined),
  restoreSession: jest.fn().mockResolvedValue(null),
  saveSession: jest.fn().mockResolvedValue(undefined),
  markSessionProfileComplete: jest.fn().mockResolvedValue(undefined),
  getSession: jest.fn(() => null),
  getToken: jest.fn(() => 'jwt-token'),
  subscribeToSessionChange: jest.fn(() => () => undefined),
  updateSessionUser: jest.fn(),
}));

const authenticatedOutcome: AuthOutcome = {
  token: 'jwt-token',
  user: {id: 'user-1', email: 'person@example.com', name: 'Person'},
  isProfileComplete: true,
  message: '',
  requires2FA: false,
  twoFactorUserId: '',
  twoFactorMethod: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(restoreSession).mockResolvedValue(null);
  jest.mocked(clearSession).mockResolvedValue(undefined);
  jest.mocked(saveSession).mockResolvedValue(undefined);
  jest.mocked(logoutSession).mockResolvedValue(undefined);
  jest.mocked(clearLocalCache).mockResolvedValue(undefined);
  jest.mocked(signOutOfFirebase).mockResolvedValue(undefined);
});

afterEach(async () => {
  // The theme is module state shared by every screen, so a test that changes it
  // has to hand the light theme back to the ones that follow.
  await AsyncStorage.clear();
  setActiveThemeMode('light');
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });
});

test('routes launches from the persisted authenticated session', () => {
  expect(resolveLaunchRoute(null)).toBe('welcome');
  expect(resolveLaunchRoute({token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true})).toBe('chats');
  expect(resolveLaunchRoute({token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: false})).toBe('profile-setup');
});

test('restores a completed session directly to Chats on cold start', async () => {
  jest.mocked(restoreSession).mockResolvedValue({
    token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true,
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });

  expect(renderer!.root.findByProps({accessibilityLabel: 'Search chats'})).toBeDefined();
  expect(renderer!.root.findAllByProps({accessibilityLabel: 'Continue with Google'})).toHaveLength(0);
  await ReactTestRenderer.act(() => renderer!.unmount());
});

test('an idle authenticated Android user remains available for incoming calls while backgrounded', async () => {
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  const stateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
  Object.defineProperty(AppState, 'currentState', {configurable: true, writable: true, value: 'active'});
  const stateImplementation = jest.mocked(AppState.addEventListener).getMockImplementation();
  const stateListeners = jest.spyOn(AppState, 'addEventListener');
  const native = {start: jest.fn(async () => undefined), stop: jest.fn(async () => undefined)};
  NativeModules.CallAvailability = native;
  jest.mocked(restoreSession).mockResolvedValue({token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true});
  let receive!: Parameters<typeof chatRealtime.subscribeToIncomingCalls>[0];
  const incoming = jest.spyOn(chatRealtime, 'subscribeToIncomingCalls').mockImplementation(listener => {
    receive = listener;
    return jest.fn();
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    expect(native.start).toHaveBeenCalledWith(authenticatedOutcome.user?.id);
    await ReactTestRenderer.act(async () => {
      AppState.currentState = 'background';
      stateListeners.mock.calls.forEach(([event, listener]) => { if (event === 'change') listener('background'); });
    });
    expect(native.stop).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      receive({callId: 'background-incoming', chatId: 'background-chat', callerId: 'caller-167', callerName: 'Ram', callerProfilePic: 'https://cdn.test/ram.jpg', type: 'video', status: 'calling'});
    });
    expect(renderer.root.findByType(IncomingCallExperience).props.call.callId).toBe('background-incoming');
    expect(native.stop).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => renderer.unmount());
    expect(native.stop).toHaveBeenCalledWith(authenticatedOutcome.user?.id);
    renderer = undefined as never;
  } finally {
    if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
    incoming.mockRestore();
    stateListeners.mockRestore();
    if (stateImplementation) jest.mocked(AppState.addEventListener).mockImplementation(stateImplementation);
    Object.defineProperty(AppState, 'currentState', stateDescriptor);
    delete NativeModules.CallAvailability;
    os.restore();
  }
});

test.each(['android', 'ios'] as const)('keeps an active incoming call connected when opening its chat on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  jest.mocked(restoreSession).mockResolvedValue({token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true});
  let receiveCall!: NonNullable<Parameters<typeof notificationService.startNotificationLifecycle>[1]>;
  const lifecycle = jest.spyOn(notificationService, 'startNotificationLifecycle').mockImplementation((_onOpen, onIncoming) => {
    receiveCall = onIncoming!;
    return jest.fn();
  });
  const resolved = {chatId: 'incoming-chat', contact: {userId: 'caller-1', name: 'Caller'}};
  const resolver = jest.spyOn(notificationService, 'resolveNotificationConversation').mockResolvedValue(resolved);
  const stopAudio = jest.spyOn(callAudio, 'stopCallAudio').mockResolvedValue(undefined);
  const call: IncomingCall = {callId: 'incoming-call-1', chatId: resolved.chatId, callerId: resolved.contact.userId, callerName: 'Caller', callerProfilePic: 'https://cdn.test/caller.jpg', type: 'audio', status: 'connected', connectedAt: '2026-10-16T10:00:00.000Z', muted: true, speaker: true};
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    await ReactTestRenderer.act(async () => { receiveCall(call, true); });
    expect(renderer.root.findByType(IncomingCallExperience).props.presentation).toBe('full');
    const connectedCall = renderer.root.findByType(IncomingCallExperience).props.call;
    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({accessibilityLabel: 'Chat'}).props.onPress();
    });
    expect(renderer.root.findByType(ChatScreen).props).toEqual(expect.objectContaining(resolved));
    const minimized = renderer.root.findByType(IncomingCallExperience);
    expect(minimized.props.presentation).toBe('banner');
    expect(minimized.props.call).toBe(connectedCall);
    expect(stopAudio).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => { minimized.props.onOpen(); });
    expect(renderer.root.findByType(IncomingCallExperience).props.presentation).toBe('full');
    expect(stopAudio).not.toHaveBeenCalled();
  } finally {
    if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
    stopAudio.mockRestore(); resolver.mockRestore(); lifecycle.mockRestore(); os.restore();
  }
});

test.each(['onMissed', 'onEnded', 'onCancelled'] as const)('%s clears an unanswered incoming call without showing the answered-call summary', async terminalEvent => {
  jest.useFakeTimers();
  jest.mocked(restoreSession).mockResolvedValue({token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true});
  let receiveCall!: NonNullable<Parameters<typeof notificationService.startNotificationLifecycle>[1]>;
  let callHandlers!: Parameters<typeof chatRealtime.subscribeToCall>[1];
  const lifecycle = jest.spyOn(notificationService, 'startNotificationLifecycle').mockImplementation((_onOpen, onIncoming) => {
    receiveCall = onIncoming!;
    return jest.fn();
  });
  const subscription = jest.spyOn(chatRealtime, 'subscribeToCall').mockImplementation((_callId, handlers) => {
    callHandlers = handlers;
    return jest.fn();
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    await ReactTestRenderer.act(async () => {
      receiveCall({callId: 'incoming-call-1', chatId: 'incoming-chat', callerId: 'caller-1', callerName: 'Caller', type: 'audio', status: 'calling'}, true);
    });
    expect(renderer.root.findByType(IncomingCallExperience)).toBeDefined();

    await ReactTestRenderer.act(async () => {
      callHandlers[terminalEvent]?.({callId: 'incoming-call-1', duration: 0});
    });

    expect(renderer.root.findAllByType(IncomingCallExperience)).toHaveLength(0);
    expect(renderer.root.findAllByType(CallEndedScreen)).toHaveLength(0);
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Close call result'})).toHaveLength(0);
  } finally {
    if (renderer) { await ReactTestRenderer.act(async () => renderer.unmount()); }
    jest.clearAllTimers();
    jest.useRealTimers();
    subscription.mockRestore();
    lifecycle.mockRestore();
  }
});

test.each(['accept', 'reject'] as const)('the notification %s action uses the existing video call handler', async action => {
  jest.mocked(restoreSession).mockResolvedValue({token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true});
  let receiveCall!: NonNullable<Parameters<typeof notificationService.startNotificationLifecycle>[1]>;
  const lifecycle = jest.spyOn(notificationService, 'startNotificationLifecycle').mockImplementation((_onOpen, onIncoming) => {
    receiveCall = onIncoming!;
    return jest.fn();
  });
  const ack = {success: true, message: '', callId: `notification-${action}`, chatId: 'incoming-chat'};
  const accept = jest.spyOn(chatRealtime, 'acceptCallOverSocket').mockResolvedValue(ack);
  const reject = jest.spyOn(chatRealtime, 'rejectCallOverSocket').mockResolvedValue(ack);
  const join = jest.spyOn(chatRealtime, 'joinCallRoom').mockResolvedValue(ack);
  const audio = jest.spyOn(callAudio, 'startCallAudio').mockResolvedValue(undefined);
  const call: IncomingCall = {callId: `notification-${action}`, chatId: 'incoming-chat', callerId: 'caller-1', callerName: 'Caller', callerProfilePic: 'https://cdn.test/caller.jpg', type: 'video', status: 'calling'};
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    await ReactTestRenderer.act(async () => { receiveCall(call, true, action); });
    const incoming = renderer.root.findByType(IncomingCallExperience);
    if (action === 'accept') {
      expect(accept).toHaveBeenCalledTimes(1);
      expect(accept).toHaveBeenCalledWith(call.callId);
      expect(reject).not.toHaveBeenCalled();
      expect(audio).toHaveBeenCalledWith(expect.objectContaining({callId: call.callId, role: 'receiver', type: 'video'}));
      expect(incoming.props.call.status).toBe('connected');
    } else {
      expect(reject).toHaveBeenCalledTimes(1);
      expect(reject).toHaveBeenCalledWith(call.callId);
      expect(accept).not.toHaveBeenCalled();
      expect(audio).not.toHaveBeenCalled();
      expect(incoming.props.call.status).toBe('rejected');
    }
  } finally {
    if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
    lifecycle.mockRestore(); accept.mockRestore(); reject.mockRestore(); join.mockRestore(); audio.mockRestore();
  }
});

test.each(['accept', 'decline'] as const)('conference invitation %s preserves the ongoing call', async action => {
  jest.mocked(restoreSession).mockResolvedValue({token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true});
  let receive!: Parameters<typeof chatRealtime.subscribeToIncomingCalls>[0];
  const subscription = jest.spyOn(chatRealtime, 'subscribeToIncomingCalls').mockImplementation(listener => { receive = listener; return jest.fn(); });
  const ack = {success: true, message: '', callId: 'conference', chatId: ''};
  const accept = jest.spyOn(chatRealtime, 'acceptCallOverSocket').mockResolvedValue(ack);
  const reject = jest.spyOn(chatRealtime, 'rejectCallOverSocket').mockResolvedValue(ack);
  const join = jest.spyOn(chatRealtime, 'joinConferenceOverSocket').mockResolvedValue(ack);
  const room = jest.spyOn(chatRealtime, 'joinCallRoom').mockResolvedValue(ack);
  const audio = jest.spyOn(callAudio, 'startCallAudio').mockResolvedValue(undefined);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    await ReactTestRenderer.act(async () => { receive({callId: 'conference', chatId: '', callerId: 'inviter', callerName: 'Inviter', callerProfilePic: 'https://cdn.test/avatar.jpg', type: 'video', status: 'calling', conference: true}); });
    const incoming = renderer.root.findByType(IncomingCallExperience);
    await ReactTestRenderer.act(async () => { await incoming.props[action === 'accept' ? 'onAccept' : 'onDecline'](); });
    expect(accept).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    if (action === 'accept') {
      expect(join).toHaveBeenCalledWith('conference');
      expect(audio).toHaveBeenCalledWith(expect.objectContaining({conferenceOnly: true, speaker: true}));
      expect(renderer.root.findByType(IncomingCallExperience).props.call.status).toBe('connected');
    } else {
      expect(join).not.toHaveBeenCalled();
      expect(renderer.root.findAllByType(IncomingCallExperience)).toHaveLength(0);
    }
  } finally {
    if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
    subscription.mockRestore(); accept.mockRestore(); reject.mockRestore(); join.mockRestore(); room.mockRestore(); audio.mockRestore();
  }
});

test.each(['notification', 'screen'] as const)('the callee can hang up from the %s after the screen turns off', async source => {
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(restoreSession).mockResolvedValue({token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true});
  let receiveCall!: NonNullable<Parameters<typeof notificationService.startNotificationLifecycle>[1]>;
  const lifecycle = jest.spyOn(notificationService, 'startNotificationLifecycle').mockImplementation((_open, incoming) => {
    receiveCall = incoming!;
    return jest.fn();
  });
  const end = jest.spyOn(chatRealtime, 'endCallOverSocket').mockResolvedValue({success: true, message: '', callId: 'locked-call', chatId: 'chat-164'});
  const stop = jest.spyOn(callAudio, 'stopCallAudio').mockResolvedValue(undefined);
  const appStateImplementation = jest.isMockFunction(AppState.addEventListener)
    ? jest.mocked(AppState.addEventListener).getMockImplementation() : undefined;
  const appState = jest.spyOn(AppState, 'addEventListener');
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    await ReactTestRenderer.act(async () => {
      receiveCall({callId: 'locked-call', chatId: 'chat-164', callerId: 'caller-164', callerName: 'Ram', callerProfilePic: 'https://cdn.test/ram.jpg', type: 'video', status: 'connected', connectedAt: new Date().toISOString()}, true);
    });
    await ReactTestRenderer.act(async () => {
      appState.mock.calls.forEach(([event, listener]) => { if (event === 'change') listener('background'); });
    });
    expect(renderer.root.findByType(IncomingCallExperience).props.call.status).toBe('connected');
    expect(stop).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      if (source === 'notification') DeviceEventEmitter.emit('chatterly.callBackgroundEnd', {callId: 'locked-call'});
      else await renderer.root.findByType(IncomingCallExperience).props.onDecline();
    });
    expect(end).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith('locked-call');
    expect(stop).toHaveBeenCalled();
    expect(renderer.root.findAllByType(IncomingCallExperience)).toHaveLength(0);
  } finally {
    if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
    lifecycle.mockRestore(); end.mockRestore(); stop.mockRestore(); appState.mockRestore(); os.restore();
    if (appStateImplementation) jest.mocked(AppState.addEventListener).mockImplementation(appStateImplementation);
  }
});

test('opens the notification conversation after restoring an authenticated session', async () => {
  jest.mocked(restoreSession).mockResolvedValue({
    token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true,
  });
  const resolved = {chatId: 'notification-chat', contact: {userId: 'rahul-1', name: 'Rahul'}};
  const resolver = jest.spyOn(notificationService, 'resolveNotificationConversation').mockResolvedValue(resolved);
  const lifecycle = jest.spyOn(notificationService, 'startNotificationLifecycle').mockImplementation(onOpen => {
    onOpen({chatId: resolved.chatId, contactId: resolved.contact.userId});
    return jest.fn();
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    expect(renderer.root.findByType(ChatScreen).props).toEqual(expect.objectContaining(resolved));
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Search chats'})).toHaveLength(0);
  } finally {
    if (renderer) { await ReactTestRenderer.act(async () => renderer.unmount()); }
    lifecycle.mockRestore();
    resolver.mockRestore();
  }
});

test('a gallery share waits for session restoration and opens the existing preview after choosing a chat', async () => {
  let finishRestore!: (session: Awaited<ReturnType<typeof restoreSession>>) => void;
  jest.mocked(restoreSession).mockImplementationOnce(() => new Promise(resolve => { finishRestore = resolve; }));
  const share: incomingShare.IncomingMediaShare = {id: 'gallery-share', media: [{
    id: 'gallery-gif', uri: 'file:///cache/dance.gif', fileName: 'dance.gif', mimeType: 'image/gif', type: 'image',
  }]};
  const lifecycle = jest.spyOn(incomingShare, 'startIncomingShareLifecycle').mockImplementation(onReceive => {
    onReceive(share);
    return jest.fn();
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    expect(renderer.root.findAllByType(ChatListScreen)).toHaveLength(0);
    await ReactTestRenderer.act(async () => {
      finishRestore({token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true});
    });
    expect(renderer.root.findAllByType(ChatListScreen)).toHaveLength(1);
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(ChatListScreen).props.onOpenConversation({userId: 'rahul-1', name: 'Rahul'}, 'gallery-chat');
    });
    const preview = renderer.root.findByType(MediaAttachmentFlow);
    expect(preview.props.initialMedia).toEqual(share.media);
    expect(preview.props.visible).toBe(true);
    expect(renderer.root.findByProps({accessibilityLabel: 'Selected image preview'}).props.source.uri).toBe(share.media[0].uri);
    await ReactTestRenderer.act(async () => { preview.props.onClose(); });
    expect(renderer.root.findByType(ChatScreen).props.incomingMedia).toBeNull();
  } finally {
    if (renderer) { await ReactTestRenderer.act(async () => renderer.unmount()); }
    lifecycle.mockRestore();
  }
});

test('the latest notification tap wins when an earlier chat lookup finishes later', async () => {
  jest.mocked(restoreSession).mockResolvedValue({
    token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true,
  });
  let onOpen!: Parameters<typeof notificationService.startNotificationLifecycle>[0];
  let finishFirst!: (result: Awaited<ReturnType<typeof notificationService.resolveNotificationConversation>>) => void;
  const latest = {chatId: 'latest-chat', contact: {userId: 'ananya-1', name: 'Ananya'}};
  const resolver = jest.spyOn(notificationService, 'resolveNotificationConversation')
    .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
    .mockResolvedValueOnce(latest);
  const lifecycle = jest.spyOn(notificationService, 'startNotificationLifecycle').mockImplementation(listener => {
    onOpen = listener;
    return jest.fn();
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    await ReactTestRenderer.act(async () => { onOpen({chatId: 'earlier-chat'}); onOpen({chatId: 'latest-chat'}); });
    await ReactTestRenderer.act(async () => {
      finishFirst({chatId: 'earlier-chat', contact: {userId: 'rahul-1', name: 'Rahul'}});
    });
    expect(renderer.root.findByType(ChatScreen).props).toEqual(expect.objectContaining(latest));
  } finally {
    if (renderer) { await ReactTestRenderer.act(async () => renderer.unmount()); }
    lifecycle.mockRestore();
    resolver.mockRestore();
  }
});

test('Android hardware Back returns to the previous app screen', async () => {
  jest.mocked(restoreSession).mockResolvedValue({
    token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true,
  });
  let hardwareBack: Parameters<typeof BackHandler.addEventListener>[1] = () => false;
  const backListener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    hardwareBack = handler;
    return {remove: jest.fn()};
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({accessibilityLabel: 'Contacts'}).props.onPress();
  });
  expect(renderer!.root.findByProps({accessibilityLabel: 'Search contacts'})).toBeDefined();

  await ReactTestRenderer.act(async () => { expect(hardwareBack({} as never)).toBe(true); });

  expect(renderer!.root.findByProps({accessibilityLabel: 'Search chats'})).toBeDefined();
  await ReactTestRenderer.act(() => renderer!.unmount());
  backListener.mockRestore();
});

test('Call History Back returns to the screen that opened it', async () => {
  jest.mocked(restoreSession).mockResolvedValue({
    token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true,
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({accessibilityLabel: 'Contacts'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({accessibilityLabel: 'Calls'}).props.onPress();
  });

  expect(renderer!.root.findByProps({accessibilityLabel: 'Search calls'})).toBeDefined();
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({accessibilityLabel: 'Back from call history'}).props.onPress();
  });

  expect(renderer!.root.findByProps({accessibilityLabel: 'Search contacts'})).toBeDefined();
  await ReactTestRenderer.act(() => renderer!.unmount());
});

test('Android hardware Back is consumed on the authenticated landing screen', async () => {
  jest.mocked(restoreSession).mockResolvedValue({
    token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true,
  });
  let hardwareBack: Parameters<typeof BackHandler.addEventListener>[1] = () => false;
  const backListener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    hardwareBack = handler;
    return {remove: jest.fn()};
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });

  expect(hardwareBack({} as never)).toBe(true);
  expect(renderer!.root.findByProps({accessibilityLabel: 'Search chats'})).toBeDefined();
  await ReactTestRenderer.act(() => renderer!.unmount());
  backListener.mockRestore();
});

test('redirects an expired authenticated session to login', async () => {
  jest.mocked(restoreSession).mockResolvedValue({
    token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true,
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
  expect(renderer!.root.findByProps({accessibilityLabel: 'Search chats'})).toBeDefined();

  await ReactTestRenderer.act(async () => expireSession('Session expired due to inactivity. Please login again.'));

  expect(renderer!.root.findByProps({accessibilityLabel: 'Continue with Google'})).toBeDefined();
  expect(renderer!.root.findByProps({
    children: 'Session expired due to inactivity. Please login again.',
  })).toBeDefined();
  await ReactTestRenderer.act(() => renderer!.unmount());
});

test('routes profile-complete sign-ins to Chats after OTP verification', () => {
  expect(resolveAuthenticatedRoute(authenticatedOutcome)).toBe('chats');
});

test('still routes incomplete profiles to profile setup after OTP verification', () => {
  expect(resolveAuthenticatedRoute({
    ...authenticatedOutcome,
    isProfileComplete: false,
  })).toBe('profile-setup');
});

test('creates an email-login profile and waits for persistence before opening Contacts', async () => {
  jest.useFakeTimers();
  const emailOutcome = normalizeAuthResponse({
    token: 'email-token', isProfileComplete: false,
    user: {_id: 'email-user', email: 'maya@example.com', isProfileComplete: false},
  });
  jest.mocked(sendEmailOtp).mockResolvedValueOnce('OTP sent');
  jest.mocked(verifyEmailOtp).mockResolvedValueOnce(emailOutcome);
  jest.mocked(createProfile).mockResolvedValueOnce({
    user: {name: 'Maya Rao', email: 'maya@example.com', isProfileComplete: true},
  });
  let finishPersistence!: () => void;
  jest.mocked(markSessionProfileComplete).mockImplementationOnce(() => new Promise(resolve => {finishPersistence = resolve;}));
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    await ReactTestRenderer.act(() => renderer!.root.findByProps({accessibilityLabel: 'Continue with email'}).props.onPress());
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(1800); });
    await ReactTestRenderer.act(() => renderer!.root.findByProps({accessibilityLabel: 'Email address'}).props.onChangeText('maya@example.com'));
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByProps({accessibilityLabel: 'Send email OTP'}).props.onPress();
      await Promise.resolve();
    });
    await ReactTestRenderer.act(() => renderer!.root.findByProps({accessibilityLabel: '6 digit verification code'}).props.onChangeText('482913'));
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByProps({accessibilityLabel: 'Verify code'}).props.onPress();
      await Promise.resolve();
    });
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(900); });
    expect(verifyEmailOtp).toHaveBeenCalledWith('maya@example.com', '482913');
    expect(saveSession).toHaveBeenCalledWith(emailOutcome);
    expect(renderer!.root.findByType(ProfileSetupScreen).props).toEqual(expect.objectContaining({token: 'email-token', userId: 'email-user'}));
    await ReactTestRenderer.act(() => {
      renderer!.root.findByProps({accessibilityLabel: 'Full name'}).props.onChangeText('Maya Rao');
      renderer!.root.findByProps({accessibilityLabel: 'Date of birth'}).props.onChangeText('12051990');
      renderer!.root.findByProps({accessibilityLabel: 'Bio'}).props.onChangeText('Available');
    });
    let pendingSave!: Promise<void>;
    await ReactTestRenderer.act(async () => {
      pendingSave = renderer!.root.findByProps({accessibilityLabel: 'Create profile'}).props.onPress();
      await Promise.resolve();
    });
    expect(createProfile).toHaveBeenCalledWith('email-token', expect.objectContaining({name: 'Maya Rao'}), 'email-user');
    expect(markSessionProfileComplete).toHaveBeenCalledWith(expect.objectContaining({
      id: 'email-user', email: 'maya@example.com', name: 'Maya Rao', dateOfBirth: '1990-05-12', status: 'Available', isProfileComplete: true,
    }));
    expect(renderer!.root.findAllByType(ContactsScreen)).toHaveLength(0);
    await ReactTestRenderer.act(async () => { finishPersistence(); await pendingSave; });
    expect(renderer!.root.findAllByType(ProfileSetupScreen)).toHaveLength(0);
    expect(renderer!.root.findByType(ContactsScreen).props.initialMode).toBe('list');
  } finally {
    if (renderer) { await ReactTestRenderer.act(() => renderer!.unmount()); }
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('keeps unfinished auth challenges on the welcome flow', () => {
  expect(resolveAuthenticatedRoute({
    ...authenticatedOutcome,
    token: '',
  })).toBe('welcome');

  expect(resolveAuthenticatedRoute({
    ...authenticatedOutcome,
    requires2FA: true,
  })).toBe('welcome');
});

test('logs Google users in directly without routing through email OTP', async () => {
  jest.mocked(signInWithGoogle).mockResolvedValue('firebase-google-token');
  jest.mocked(googleLogin).mockResolvedValue(authenticatedOutcome);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({accessibilityLabel: 'Continue with Google'}).props.onPress();
  });

  expect(signInWithGoogle).toHaveBeenCalled();
  expect(googleLogin).toHaveBeenCalledWith('firebase-google-token');
  expect(renderer!.root.findByProps({accessibilityLabel: 'Search chats'})).toBeDefined();
  expect(renderer!.root.findAllByProps({children: 'Verify your email address'})).toHaveLength(0);
  await ReactTestRenderer.act(() => renderer!.unmount());
});

test('logout clears every session and a following login creates a new one', async () => {
  jest.mocked(restoreSession).mockResolvedValue({
    token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true,
  });
  jest.mocked(signInWithGoogle).mockResolvedValue('new-firebase-token');
  jest.mocked(googleLogin).mockResolvedValue({...authenticatedOutcome, token: 'new-session-token'});
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({accessibilityLabel: 'Settings'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({accessibilityLabel: 'Logout'}).props.onPress();
  });
  expect(renderer!.root.findByProps({accessibilityLabel: 'Confirm Logout'})).toBeDefined();
  expect(logoutSession).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({accessibilityLabel: 'Confirm Logout'}).props.onPress();
  });

  expect(logoutSession).toHaveBeenCalledWith('jwt-token');
  expect(signOutOfFirebase).toHaveBeenCalled();
  expect(clearSession).toHaveBeenCalled();
  expect(clearLocalCache).toHaveBeenCalled();
  expect(renderer!.root.findByProps({accessibilityLabel: 'Continue with Google'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({accessibilityLabel: 'Continue with Google'}).props.onPress();
  });
  expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({token: 'new-session-token'}));
  expect(renderer!.root.findByProps({accessibilityLabel: 'Search chats'})).toBeDefined();
  await ReactTestRenderer.act(() => renderer!.unmount());
});

test('the whole app opens in the theme the device stored, not just the settings screen', async () => {
  // Sprint 11 Story 2. The server copy cannot be reached in a test, so the
  // device copy is what the app has to honour.
  await AsyncStorage.setItem('chatterly.theme-preference.v1', 'dark');
  jest.mocked(restoreSession).mockResolvedValue({
    token: 'jwt-token', user: authenticatedOutcome.user, isProfileComplete: true,
  });

  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });

  const backgrounds = renderer!.root
    .findAll(node => Boolean(node.props?.style))
    .flatMap(node => [node.props.style].flat(3))
    .map(style => (style as {backgroundColor?: string} | null)?.backgroundColor)
    .filter(Boolean);

  // Contacts is the landing screen, and it is painted on the dark surfaces
  // rather than the white ones it uses in the light theme.
  expect(backgrounds).toContain(DARK_THEME.surface);
  expect(backgrounds).not.toContain('#FFFFFF');
  expect(backgrounds).not.toContain('#FFF');

  await ReactTestRenderer.act(() => renderer!.unmount());
});
