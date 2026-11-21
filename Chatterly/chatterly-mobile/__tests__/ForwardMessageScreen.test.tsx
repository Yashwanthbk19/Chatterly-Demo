import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ForwardMessageScreen} from '../src/screens/ForwardMessageScreen';
import {getForwardDestinations} from '../src/services/chatApi';

jest.mock('../src/services/chatApi', () => ({
  getForwardDestinations: jest.fn(),
  searchChatContacts: jest.fn().mockResolvedValue([]),
}));

jest.setTimeout(15000);

test('requires at least one contact before the Forward action is available', async () => {
  jest.mocked(getForwardDestinations).mockResolvedValue([{
    id: 'user-1', name: 'Ananya', kind: 'contact', subtitle: 'Recent chat',
  }]);
  const onForward = jest.fn().mockResolvedValue(undefined);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{
        frame: {x: 0, y: 0, width: 393, height: 852},
        insets: {top: 24, right: 0, bottom: 24, left: 0},
      }}>
        <ForwardMessageScreen messageCount={1} onBack={jest.fn()} onForward={onForward}/>
      </SafeAreaProvider>,
    );
    await Promise.resolve();
  });

  expect(renderer!.root.findAll(node => String(node.props.accessibilityLabel || '').startsWith('Forward 1 messages'))).toHaveLength(0);
  expect(onForward).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    renderer!.root.findAllByProps({accessibilityLabel: 'Select chat Ananya'})[0].props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({accessibilityLabel: 'Forward 1 messages to 1 chats'}).props.onPress();
    await Promise.resolve();
  });

  // ForwardMessageScreen hands over the whole destination plus the covering
  // note, which is what its own `onForward` type declares.
  expect(onForward).toHaveBeenCalledWith(
    [{id: 'user-1', name: 'Ananya', kind: 'contact', subtitle: 'Recent chat'}],
    '',
  );
  ReactTestRenderer.act(() => renderer!.unmount());
});
