import * as Contacts from 'expo-contacts';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Platform} from 'react-native';
import {IncomingCallMoreOptions} from '../src/components/IncomingCallMoreOptions';
import {sendCallReaction, startCallScreenCapture, subscribeToCallMedia} from '../src/services/callAudio';
import {openCallMicrophoneMode} from '../src/services/callMicrophoneMode';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ActiveIncomingCallScreen} from '../src/components/ActiveIncomingCallScreen';
import {addCallParticipantOverSocket} from '../src/services/chatRealtime';
import {syncContacts} from '../src/services/contactsApi';
import {clearSession, saveSession} from '../src/services/sessionStore';

jest.mock('../src/services/callAudio', () => ({
  sendCallReaction: jest.fn(),
  startCallScreenCapture: jest.fn(),
  stopCallScreenCapture: jest.fn(),
  subscribeToCallMedia: jest.fn(() => () => undefined),
  switchCallCamera: jest.fn(),
}));
jest.mock('../src/services/callMicrophoneMode', () => ({getCallMicrophoneMode: jest.fn(async () => 'Voice Isolation'), openCallMicrophoneMode: jest.fn(async () => undefined)}));

jest.mock('../src/services/chatApi', () => ({
  getCallStatus: jest.fn().mockResolvedValue('connected'),
  getChatProfile: jest.fn().mockResolvedValue(null),
}));

jest.mock('../src/services/chatRealtime', () => ({
  addCallParticipantOverSocket: jest.fn(),
  setCallScreenShareOverSocket: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/contactsApi', () => ({
  syncContacts: jest.fn(),
}));

const metrics = {frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 20, left: 0}};

const grantedPermission = {
  status: Contacts.PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never' as const,
};

// The receiver's side of a one-to-one call: Dev rang, and the signed-in user answered.
const call = {
  callId: 'call-1',
  chatId: 'chat-1',
  callerId: 'user-dev',
  receiverId: 'user-me',
  callerName: 'Dev Caller',
  type: 'audio' as const,
  status: 'connected' as const,
};

beforeEach(async () => {
  jest.clearAllMocks();
  await clearSession();
  await saveSession({token: 'token', user: {id: 'user-me', name: 'Me'}} as never);
  jest.mocked(Contacts.getPermissionsAsync).mockResolvedValue(grantedPermission);
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([
    {id: 'c1', fullName: 'Anna Raj', phones: [{number: '+91 98765 43210'}]},
    {id: 'c4', fullName: 'Dev Caller', phones: [{number: '+91 98765 43213'}]},
  ] as never);
  jest.mocked(syncContacts).mockResolvedValue({
    registered: [
      {_id: 'user-anna', name: 'Anna', phone: '9876543210'},
      {_id: 'user-dev', name: 'Dev', phone: '9876543213'},
    ],
    unRegistered: [],
  });
  jest.mocked(addCallParticipantOverSocket).mockResolvedValue({success: true, message: 'Conference invitation sent', callId: 'call-1', chatId: 'chat-1'});
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(async () => {
  await ReactTestRenderer.act(async () => mounted.splice(0).forEach(renderer => renderer.unmount()));
  await clearSession();
});

async function settle() {
  await ReactTestRenderer.act(async () => {
    for (let tick = 0; tick < 25; tick += 1) { await Promise.resolve(); }
  });
}

async function renderCall(type: 'audio' | 'video' = 'audio', onOpenChat = jest.fn()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>
      <ActiveIncomingCallScreen busy={false} call={{...call, type}} insets={metrics.insets} onEnd={jest.fn()} onMinimize={jest.fn()} onOpenChat={onOpenChat}/>
    </SafeAreaProvider>);
  });
  await settle();
  mounted.push(renderer);
  return renderer;
}

const shows = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAllByProps({accessibilityLabel: label}).length > 0;

async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const target = renderer.root.findAllByProps({accessibilityLabel: label}).find(node => typeof node.props.onPress === 'function');
  expect(target).toBeDefined();
  await ReactTestRenderer.act(async () => { target!.props.onPress(); });
  await settle();
}

// The receiver's "Add person" button had no handler, so tapping it did nothing.
test.each([
  ['android', 'audio'], ['android', 'video'], ['ios', 'audio'], ['ios', 'video'],
] as const)('shows Mute and switches the supplied mic icons on an incoming %s %s call', async (platform, type) => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  function Screen() {
    const [muted, setMuted] = React.useState(false);
    return <ActiveIncomingCallScreen busy={false} call={{...call, type, muted}} insets={metrics.insets} onEnd={jest.fn()} onMinimize={jest.fn()} onToggleMute={() => setMuted(value => !value)}/>;
  }
  try {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><Screen/></SafeAreaProvider>); });
    mounted.push(renderer);
    expect(renderer.root.findByProps({testID: 'call-mic-on-icon'}).props).toEqual(expect.objectContaining({width: 32, height: 32}));
    expect(renderer.root.findByProps({children: 'Mute'})).toBeDefined();
    expect(renderer.root.findAllByProps({children: 'Mic On'})).toHaveLength(0);
    await press(renderer, 'Mute');
    expect(renderer.root.findByProps({testID: 'call-mic-off-icon'}).props).toEqual(expect.objectContaining({width: 32, height: 32}));
    expect(renderer.root.findByProps({children: 'Mute'})).toBeDefined();
    await press(renderer, 'Unmute');
    expect(renderer.root.findByProps({testID: 'call-mic-on-icon'})).toBeDefined();
  } finally { os.restore(); }
});

test('the Add person button on the receiver\'s call screen opens the add-people sheet', async () => {
  const renderer = await renderCall();
  expect(shows(renderer, 'Add people to call')).toBe(false);

  await press(renderer, 'Add person');

  expect(shows(renderer, 'Add people to call')).toBe(true);
});

test('the receiver can invite a contact into the call and is told it went out', async () => {
  const renderer = await renderCall();

  await press(renderer, 'Add person');
  // The caller is already in the call, so only Anna is offered.
  expect(shows(renderer, 'Select Dev Caller')).toBe(false);
  await press(renderer, 'Select Anna Raj');
  await press(renderer, 'Add to Call');

  expect(addCallParticipantOverSocket).toHaveBeenCalledWith('call-1', 'user-anna');
  expect(shows(renderer, 'Add people to call')).toBe(false);
  expect(JSON.stringify(renderer.toJSON())).toContain('Participant invited to the call.');
});

test.each([
  ['android', 'audio'], ['android', 'video'], ['ios', 'audio'], ['ios', 'video'],
] as const)('opens the reference More menu for %s %s calls and runs its actions', async (platform, type) => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  const onOpenChat = jest.fn();
  try {
    const renderer = await renderCall(type, onOpenChat);
    await press(renderer, 'More');
    expect(shows(renderer, 'More Options')).toBe(true);
    expect(renderer.root.findByType(IncomingCallMoreOptions)).toBeDefined();
    expect(shows(renderer, 'Share screen')).toBe(type === 'video');
    expect(shows(renderer, 'Send message')).toBe(platform === 'android');
    expect(shows(renderer, 'Mic Mode')).toBe(platform === 'ios');
    for (const emoji of ['👍', '❤️', '😂', '😮', '😢', '🙏']) expect(shows(renderer, `Send call reaction ${emoji}`)).toBe(true);
    await press(renderer, 'Send call reaction 👍');
    expect(sendCallReaction).toHaveBeenCalledWith(call.callId, '👍');
    expect(shows(renderer, 'More Options')).toBe(false);
    await press(renderer, 'More');
    if (platform === 'android') {
      await press(renderer, 'Send message');
      expect(onOpenChat).toHaveBeenCalledTimes(1);
      await press(renderer, 'More');
    } else {
      expect(renderer.root.findByProps({children: 'Voice Isolation'})).toBeDefined();
      await press(renderer, 'Mic Mode');
      expect(openCallMicrophoneMode).toHaveBeenCalledTimes(1);
    }
    if (type === 'video') {
      await press(renderer, 'Share screen');
      expect(startCallScreenCapture).toHaveBeenCalled();
      await press(renderer, 'More');
    }
    await press(renderer, 'Close call options backdrop');
    expect(shows(renderer, 'More Options')).toBe(false);
  } finally { os.restore(); }
});


test('layers the live self preview above the remote video on Android', async () => {
  jest.mocked(subscribeToCallMedia).mockImplementationOnce(listener => {
    listener({localUrl: 'local-camera', remoteUrl: 'remote-camera', remoteVideoLive: true, sharingScreen: false});
    return () => undefined;
  });
  const tree = await renderCall('video');
  const {CallVideoView} = require('../src/components/CallVideoView');
  const views = tree.root.findAllByType(CallVideoView);
  expect(views.find(view => view.props.streamURL === 'local-camera')?.props.zOrder).toBe(1);
  expect(views.find(view => view.props.streamURL === 'remote-camera')?.props.zOrder).toBe(0);
});
