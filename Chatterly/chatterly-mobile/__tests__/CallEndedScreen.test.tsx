import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {CallEndedScreen} from '../src/components/CallEndedScreen';

jest.mock('react-native-safe-area-context', () => ({...jest.requireActual('react-native-safe-area-context'),useSafeAreaInsets: () => ({top: 24, bottom: 24})}));

test('shows the summary and dispatches all three actions', async () => {
  const onMessage = jest.fn();
  const onAudioCallAgain = jest.fn();
  const onClose = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<CallEndedScreen name="Nathan" duration={332} onMessage={onMessage} onAudioCallAgain={onAudioCallAgain} onClose={onClose}/>); });
  expect(JSON.stringify(renderer!.toJSON())).toContain('00:05:32');
  expect(JSON.stringify(renderer!.toJSON())).toContain('Call Ended');
  for (const label of ['Message', 'Audio Call Again', 'Close']) {
    act(() => renderer!.root.findAll(button => button.props.accessibilityLabel === label && typeof button.props.onPress === 'function')[0].props.onPress());
  }
  expect(onMessage).toHaveBeenCalledTimes(1);
  expect(onAudioCallAgain).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => renderer!.unmount());
});

test('shows a distinct declined status when the remote participant rejects', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <CallEndedScreen name="Nathan" duration={0} status="declined" onMessage={jest.fn()} onAudioCallAgain={jest.fn()} onClose={jest.fn()} />,
    );
  });
  const output = JSON.stringify(renderer!.toJSON());
  expect(output).toContain('Call Declined');
  expect(output).not.toContain('Call Ended');
  act(() => renderer!.unmount());
});
