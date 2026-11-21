import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Modal, Platform, Vibration} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {IncomingCallExperience} from '../src/components/IncomingCallExperience';
import {IncomingGroupCall} from '../src/components/IncomingGroupCall';
import {ActiveIncomingCallScreen} from '../src/components/ActiveIncomingCallScreen';
import {DEFAULT_NOTIFICATION_SETTINGS, storeNotificationSettings} from '../src/services/notificationPreferencesApi';
import type {IncomingCall} from '../src/types/call';

const metrics = {frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}};
const call: IncomingCall = {callId: 'call-1', chatId: 'chat-1', callerId: 'caller-1', callerName: 'Ananya', type: 'audio', status: 'calling'};
const handlers = {onAccept: jest.fn(), onDecline: jest.fn(), onDismissBanner: jest.fn(), onMinimize: jest.fn(), onOpen: jest.fn()};
const audio = require('expo-audio');
let mounted: ReactTestRenderer.ReactTestRenderer[] = [];
async function render(element: React.ReactNode) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>); });
  mounted.push(renderer);
  return renderer;
}

function expectHidden(renderer: ReactTestRenderer.ReactTestRenderer) {
  expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
  expect((renderer.toJSON() as ReactTestRenderer.ReactTestRendererJSON).children).toBeNull();
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
});
afterEach(async () => {
  await act(async () => { mounted.forEach(renderer => renderer.unmount()); });
  mounted = [];
  jest.restoreAllMocks();
});

test.each(['android', 'ios'] as const)('%s: disabled incoming-call notifications hide banner and full-screen alerts without ringing', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  for (const disabled of ['callNotifications', 'notifications'] as const) {
    await act(async () => { await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, [disabled]: false, callVibration: 'Medium'}); });
    for (const type of ['audio', 'video'] as const) {
      for (const presentation of ['banner', 'full'] as const) {
        const renderer = await render(<IncomingCallExperience call={{...call, type}} presentation={presentation} {...handlers}/>);
        expectHidden(renderer);
      }
    }
  }
  expect(audio.__player.play).not.toHaveBeenCalled();
  expect(Vibration.vibrate).not.toHaveBeenCalled();
  expect(handlers.onAccept).not.toHaveBeenCalled();
  expect(handlers.onDecline).not.toHaveBeenCalled();
});

test('does not flash or ring while saved preferences are loading', async () => {
  let resolveSettings!: (value: string) => void;
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise(resolve => { resolveSettings = resolve; }));
  const renderer = await render(<IncomingCallExperience call={call} presentation="full" {...handlers}/>);
  expectHidden(renderer);
  expect(audio.__player.play).not.toHaveBeenCalled();
  await act(async () => { resolveSettings(JSON.stringify({...DEFAULT_NOTIFICATION_SETTINGS, callNotifications: false})); });
  expectHidden(renderer);
  expect(audio.__player.play).not.toHaveBeenCalled();
});

test('turning the setting off hides an existing prompt and re-enabling it restores incoming notifications', async () => {
  const renderer = await render(<IncomingCallExperience call={call} presentation="full" {...handlers}/>);
  expect(renderer.root.findByProps({accessibilityLabel: 'Accept'})).toBeDefined();
  expect(audio.__player.play).toHaveBeenCalled();
  await act(async () => { await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, callNotifications: false}); });
  expectHidden(renderer);
  expect(audio.__player.pause).toHaveBeenCalled();
  expect(audio.__player.release).toHaveBeenCalled();
  await act(async () => { await storeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Accept'})).toBeDefined();
  await act(async () => { renderer.root.findByProps({accessibilityLabel: 'Accept'}).props.onPress(); });
  expect(handlers.onAccept).toHaveBeenCalledTimes(1);
});

test('a newer disabled preference wins over an in-flight settings read', async () => {
  let resolveSettings!: (value: string) => void;
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise(resolve => { resolveSettings = resolve; }));
  const renderer = await render(<IncomingCallExperience call={call} presentation="banner" {...handlers}/>);
  await act(async () => { await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, callNotifications: false}); });
  await act(async () => { resolveSettings(JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS)); });
  expectHidden(renderer);
  expect(audio.__player.play).not.toHaveBeenCalled();
});

test('disabling notifications keeps an already connected call available', async () => {
  await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, callNotifications: false});
  const renderer = await render(<IncomingCallExperience call={{...call, status: 'connected'}} presentation="full" {...handlers}/>);
  expect(renderer.root.findByType(ActiveIncomingCallScreen)).toBeDefined();
  expect(audio.__player.play).not.toHaveBeenCalled();
});

test('disabled incoming-call notifications also hide group-call invitations', async () => {
  await storeNotificationSettings({...DEFAULT_NOTIFICATION_SETTINGS, callNotifications: false});
  const onJoin = jest.fn();
  const onDismiss = jest.fn();
  const renderer = await render(<IncomingGroupCall busy={false} invite={{groupCallId: 'group-call', groupId: 'group', groupName: 'Team', type: 'video', startedBy: 'caller', startedByName: 'Ananya', isMidCallInvite: false}} onJoin={onJoin} onDismiss={onDismiss}/>);
  expectHidden(renderer);
  expect(audio.__player.play).not.toHaveBeenCalled();
  expect(onJoin).not.toHaveBeenCalled();
  expect(onDismiss).not.toHaveBeenCalled();
});
