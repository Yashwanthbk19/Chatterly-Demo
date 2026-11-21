import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {IncomingGroupCall} from '../src/components/IncomingGroupCall';

const metrics = {
  frame: {x: 0, y: 0, width: 393, height: 852},
  insets: {top: 24, right: 0, bottom: 24, left: 0},
};

test('rings for an incoming group-call invitation and releases on dismissal', async () => {
  const audio = require('expo-audio');
  jest.clearAllMocks();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <IncomingGroupCall
          busy={false}
          invite={{
            groupCallId: 'group-call-1',
            groupId: 'group-1',
            groupName: 'Weekend Crew',
            type: 'audio',
            startedBy: 'user-1',
            startedByName: 'Ananya',
            isMidCallInvite: false,
          }}
          onDismiss={jest.fn()}
          onJoin={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(audio.__player.play).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
  expect(audio.__player.pause).toHaveBeenCalledTimes(1);
  expect(audio.__player.release).toHaveBeenCalledTimes(1);
});
