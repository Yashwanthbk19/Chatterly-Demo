import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Modal, Platform, Vibration} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {IncomingCallExperience} from '../src/components/IncomingCallExperience';
import {DEFAULT_NOTIFICATION_SETTINGS} from '../src/services/notificationPreferencesApi';

test('stops and releases the incoming ringtone as soon as the call stops ringing', async () => {
  await AsyncStorage.setItem('chatterly.notification-preferences.v1', JSON.stringify({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    callVibration: 'Medium',
  }));
  const audio = require('expo-audio');
  const vibrate = jest.spyOn(Vibration, 'vibrate');
  const cancelVibration = jest.spyOn(Vibration, 'cancel');
  audio.__player.play.mockClear();
  audio.__player.pause.mockClear();
  audio.__player.release.mockClear();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{
        frame: {x: 0, y: 0, width: 307, height: 641},
        insets: {top: 24, right: 0, bottom: 18, left: 0},
      }}>
        <IncomingCallExperience
          call={{callId: 'call-1', chatId: 'chat-1', callerId: 'caller-1', callerName: 'Ananya', type: 'audio', status: 'calling'}}
          onAccept={jest.fn()}
          onDecline={jest.fn()}
          onDismissBanner={jest.fn()}
          onMinimize={jest.fn()}
          onOpen={jest.fn()}
          presentation="banner"
        />
      </SafeAreaProvider>,
    );
  });

  expect(audio.__player.play).toHaveBeenCalled();
  expect(audio.__player.pause).not.toHaveBeenCalled();
  expect(vibrate).toHaveBeenCalledTimes(1);
  if (Platform.OS === 'ios') expect(vibrate).toHaveBeenCalledWith();
  else expect(vibrate).toHaveBeenCalledWith([0, 250, 120, 250], false);

  ReactTestRenderer.act(() => renderer!.update(
    <SafeAreaProvider initialMetrics={{
      frame: {x: 0, y: 0, width: 307, height: 641},
      insets: {top: 24, right: 0, bottom: 18, left: 0},
    }}>
      <IncomingCallExperience
        call={{callId: 'call-1', chatId: 'chat-1', callerId: 'caller-1', callerName: 'Ananya', type: 'audio', status: 'missed'}}
        onAccept={jest.fn()} onDecline={jest.fn()} onDismissBanner={jest.fn()}
        onMinimize={jest.fn()} onOpen={jest.fn()} presentation="full"/>
    </SafeAreaProvider>,
  ));
  expect(audio.__player.pause).toHaveBeenCalledTimes(1);
  expect(audio.__player.release).toHaveBeenCalledTimes(1);
  expect(cancelVibration).toHaveBeenCalledTimes(2);

  ReactTestRenderer.act(() => renderer!.unmount());
  expect(audio.__player.pause).toHaveBeenCalledTimes(1);
  expect(audio.__player.release).toHaveBeenCalledTimes(1);
  vibrate.mockRestore();
  cancelVibration.mockRestore();
  await AsyncStorage.clear();
});

const metrics = {frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 20, left: 0}};

test('rejected call shows the result and wires message, retry, and close actions', async () => {
  const onMessage = jest.fn();
  const onCallAgain = jest.fn();
  const onClose = jest.fn();
  const audio = require('expo-audio');
  audio.__player.play.mockClear();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>
      <IncomingCallExperience
        call={{callId: 'call-1', chatId: 'chat-1', callerId: 'caller-1', callerName: 'Nathan', type: 'audio', status: 'rejected'}}
        presentation="full" onAccept={jest.fn()} onDecline={jest.fn()}
        onDismissBanner={jest.fn()} onMinimize={jest.fn()} onOpen={jest.fn()}
        onMessage={onMessage} onCallAgain={onCallAgain} onClose={onClose}/>
    </SafeAreaProvider>);
  });
  const tree = JSON.stringify(renderer.toJSON());
  expect(tree).toContain('Call Rejected');
  expect(audio.__player.play).not.toHaveBeenCalled();
  for (const label of ['Message', 'Call Again', 'Close call result']) {
    ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: label}).props.onPress());
  }
  expect(onMessage).toHaveBeenCalledTimes(1);
  expect(onCallAgain).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  ReactTestRenderer.act(() => renderer.unmount());
});

test('missed call does not leave a result screen behind', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>
      <IncomingCallExperience
        call={{callId: 'call-1', chatId: 'chat-1', callerId: 'caller-1', callerName: 'Nathan', type: 'audio', status: 'missed'}}
        presentation="full" onAccept={jest.fn()} onDecline={jest.fn()}
        onDismissBanner={jest.fn()} onMinimize={jest.fn()} onOpen={jest.fn()}/>
    </SafeAreaProvider>);
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Incoming audio call screen'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Close call result'})).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).not.toContain('No Answer');
  ReactTestRenderer.act(() => renderer.unmount());
});

test.each(['calling', 'connecting'] as const)('%s incoming call hides connected-call top controls', async status => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>
      <IncomingCallExperience
        call={{callId: 'call-1', chatId: 'chat-1', callerId: 'caller-1', callerName: 'Nathan', type: 'audio', status}}
        presentation="full" onAccept={jest.fn()} onDecline={jest.fn()}
        onDismissBanner={jest.fn()} onMinimize={jest.fn()} onOpen={jest.fn()}/>
    </SafeAreaProvider>);
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Minimize incoming call'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'One-to-one caller'})).toHaveLength(0);
  ReactTestRenderer.act(() => renderer.unmount());
});

test('disables both answer actions while a server acknowledgement is pending', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>
      <IncomingCallExperience busy
        call={{callId: 'call-1', chatId: 'chat-1', callerId: 'caller-1', callerName: 'Nathan', type: 'audio', status: 'calling'}}
        presentation="full" onAccept={jest.fn()} onDecline={jest.fn()}
        onDismissBanner={jest.fn()} onMinimize={jest.fn()} onOpen={jest.fn()}/>
    </SafeAreaProvider>);
  });
  expect(renderer.root.findByProps({accessibilityLabel: 'Accept'}).props.disabled).toBe(true);
  expect(renderer.root.findByProps({accessibilityLabel: 'Decline'}).props.disabled).toBe(true);
  ReactTestRenderer.act(() => renderer.unmount());
});

test('accepted video call exposes every requested control and opens audio output from Speaker', async () => {
  jest.useFakeTimers();
  const onEnd = jest.fn();
  const onSelectAudioOutput = jest.fn();
  const onToggleMute = jest.fn();
  const onToggleVideo = jest.fn();
  const audio = require('expo-audio');
  audio.__player.play.mockClear();
  audio.__player.pause.mockClear();
  // Audio Output lists the devices expo-audio reports: here a paired speaker
  // with a microphone (so it can carry a call) next to the built-in mic.
  audio.__recorder.getAvailableInputs = jest.fn(() => [
    {name: 'Built-in microphone', type: 'MicrophoneBuiltIn', uid: '1'},
    {name: 'JBL Flip 5', type: 'BluetoothSCO', uid: '7'},
  ]);
  audio.__recorder.setInput = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>
      <IncomingCallExperience
        call={{callId: 'call-1', chatId: 'chat-1', callerId: 'caller-1', callerName: 'Nathan', type: 'video', status: 'connected', connectedAt: new Date().toISOString(), muted: false, speaker: false, videoEnabled: true}}
        presentation="full" onAccept={jest.fn()} onDecline={onEnd}
        onDismissBanner={jest.fn()} onMinimize={jest.fn()} onOpen={jest.fn()}
        onSelectAudioOutput={onSelectAudioOutput}
        onToggleMute={onToggleMute}
        onToggleVideo={onToggleVideo}/>
    </SafeAreaProvider>);
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Active one-to-one video call'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Floating self preview'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Good Connection'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Add person'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Switch camera'})).toBeDefined();
  expect(audio.__player.play).not.toHaveBeenCalled();
  expect(audio.__player.pause).not.toHaveBeenCalled();

  ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'More'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'More Options'})).toBeDefined();
  for (const label of ['Share screen', 'Send call reaction 👍', 'Send call reaction ❤️', 'Send call reaction 😂', 'Send call reaction 😮', 'Send call reaction 😢', 'Send call reaction 🙏']) {
    expect(renderer.root.findByProps({accessibilityLabel: label})).toBeDefined();
  }
  // Android routes Back through the existing call modal, closing only the menu.
  const callModal = renderer.root.findAllByType(Modal).find(node => node.props.visible && !node.props.transparent)!;
  ReactTestRenderer.act(() => callModal.props.onRequestClose());
  expect(renderer.root.findAllByProps({accessibilityLabel: 'More Options'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Active one-to-one video call'})).toBeDefined();
  expect(onEnd).not.toHaveBeenCalled();

  ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Mute'}).props.onPress());
  ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Video'}).props.onPress());
  ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Speaker'}).props.onPress());
  expect(onToggleMute).toHaveBeenCalledTimes(1);
  expect(onToggleVideo).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByProps({accessibilityLabel: 'Audio Output options'})).toBeDefined();

  // Only real routes are offered: no Bluetooth entry unless one is connected.
  for (const label of ['Use Speaker', 'Use Headset', 'Use JBL Flip 5', 'Use No Audio']) {
    expect(renderer.root.findByProps({accessibilityLabel: label})).toBeDefined();
  }
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Use JBL Flip 5'}).props.onPress(); });
  expect(onSelectAudioOutput).toHaveBeenCalledWith(expect.objectContaining({kind: 'bluetooth', label: 'JBL Flip 5'}));
  expect(audio.__recorder.setInput).toHaveBeenCalledWith('7');
  expect(renderer.root.findByProps({accessibilityLabel: 'JBL Flip 5'})).toBeDefined();

  const preview = renderer.root.findByProps({accessibilityLabel: 'Floating self preview'});
  expect(typeof preview.props.onMoveShouldSetResponder).toBe('function');
  ReactTestRenderer.act(() => {
    renderer.root.findByProps({accessibilityLabel: 'Hide self preview'}).props.onPress();
    jest.advanceTimersByTime(200);
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Floating self preview'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Show self preview'})).toBeDefined();

  ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Call preview surface'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Floating self preview'})).toBeDefined();
  ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Call preview surface'}).props.onPress());
  expect(renderer.root.findAllByProps({accessibilityLabel: 'More'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Floating self preview'})).toBeDefined();
  ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Call preview surface'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'More'})).toBeDefined();

  ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'End'}).props.onPress());
  expect(onEnd).toHaveBeenCalledTimes(1);
  ReactTestRenderer.act(() => renderer.unmount());
  jest.useRealTimers();
});
