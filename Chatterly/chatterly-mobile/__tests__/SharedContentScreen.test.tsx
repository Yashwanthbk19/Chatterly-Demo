import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {SharedContentScreen} from '../src/screens/SharedContentScreen';
import {getChatFiles, getChatMessages, getSharedLinks, getSharedMedia} from '../src/services/chatApi';

jest.setTimeout(20000);
jest.mock('react-native-safe-area-context', () => ({...jest.requireActual('react-native-safe-area-context'),useSafeAreaInsets: () => ({top: 0, bottom: 0})}));
jest.mock('../src/services/chatApi', () => ({
  getChatFiles: jest.fn(async () => []),
  getChatMessages: jest.fn(async () => []),
  getGroupMessages: jest.fn(async () => []),
  getMediaDownloadUrl: jest.fn(async () => ''),
  getSharedLinks: jest.fn(async () => []),
  getSharedMedia: jest.fn(async () => []),
}));
jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: 'me'}})}));

beforeEach(() => jest.clearAllMocks());

async function renderSharedContent(initialTab: 'media' | 'history') {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SharedContentScreen
        chatId={'chat-1'}
        contact={{userId: 'contact-1', name: 'Ananya', kind: 'contact'}}
        initialTab={initialTab}
        onBack={jest.fn()}
        onNotice={jest.fn()}
        visible
      />,
    );
  });
  return tree!;
}

test('View All shows only Media, Files, and Links tabs', async () => {
  const tree = await renderSharedContent('media');

  expect(tree.root.findAllByProps({accessibilityLabel: 'Media tab'}).length).toBeGreaterThan(0);
  expect(tree.root.findAllByProps({accessibilityLabel: 'Files tab'}).length).toBeGreaterThan(0);
  expect(tree.root.findAllByProps({accessibilityLabel: 'Links tab'}).length).toBeGreaterThan(0);
  expect(tree.root.findAllByProps({accessibilityLabel: 'Chat History tab'})).toHaveLength(0);
  expect(getSharedMedia).toHaveBeenCalledWith('contact-1');
  expect(getChatFiles).toHaveBeenCalledWith('chat-1');
  expect(getSharedLinks).toHaveBeenCalledWith('contact-1');
  expect(getChatMessages).toHaveBeenCalledWith('chat-1');

  await act(async () => tree.unmount());
});

test('the existing Search history route remains available', async () => {
  const tree = await renderSharedContent('history');

  expect(tree.root.findAllByProps({accessibilityLabel: 'Chat History tab'}).length).toBeGreaterThan(0);

  await act(async () => tree.unmount());
});
