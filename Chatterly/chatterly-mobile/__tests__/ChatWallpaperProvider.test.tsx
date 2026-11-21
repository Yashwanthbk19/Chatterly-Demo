import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  getChatWallpaper,
  loadStoredChatWallpaper,
  storeChatWallpaper,
  updateChatWallpaper,
  type ChatWallpaperPreference,
} from '../src/services/preferencesApi';
import {ChatWallpaperProvider, useChatWallpaper} from '../src/wallpaper/ChatWallpaperProvider';

jest.mock('../src/services/preferencesApi', () => {
  const actual = jest.requireActual('../src/services/preferencesApi');
  return {
    ...actual,
    getChatWallpaper: jest.fn(),
    loadStoredChatWallpaper: jest.fn(),
    storeChatWallpaper: jest.fn(),
    updateChatWallpaper: jest.fn(),
  };
});
jest.mock('../src/services/sessionStore', () => ({getToken: () => 'expired-jwt', subscribeToSessionChange: () => () => undefined}));

let context!: ReturnType<typeof useChatWallpaper>;

function Probe() {
  context = useChatWallpaper();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadStoredChatWallpaper).mockResolvedValue(null);
  jest.mocked(storeChatWallpaper).mockResolvedValue(undefined);
  jest.mocked(getChatWallpaper).mockResolvedValue('');
  jest.mocked(updateChatWallpaper).mockImplementation(async value => value);
});

test('an expired wallpaper-sync session never turns a successful local apply into an error', async () => {
  jest.mocked(updateChatWallpaper).mockRejectedValue(new Error('Session expired due to inactivity. Please login again.'));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<ChatWallpaperProvider><Probe/></ChatWallpaperProvider>);
  });

  const chosen: ChatWallpaperPreference = {
    type: 'color',
    value: '#D8EEE4',
    transparency: 20,
    messageColor: '#6366F1',
  };
  let applied = false;
  await ReactTestRenderer.act(async () => {
    applied = await context.applyWallpaper(chosen);
  });

  expect(applied).toBe(true);
  expect(context.wallpaper).toEqual(chosen);
  expect(storeChatWallpaper).toHaveBeenCalledWith(chosen);
  expect(updateChatWallpaper).toHaveBeenCalledWith('#D8EEE4');
  expect(context).not.toHaveProperty('error');

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('a failed initial sync disables repeated preference requests while keeping Apply local', async () => {
  jest.mocked(getChatWallpaper).mockRejectedValue(new Error('Session expired due to inactivity. Please login again.'));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<ChatWallpaperProvider><Probe/></ChatWallpaperProvider>);
  });

  await ReactTestRenderer.act(async () => {
    await context.applyWallpaper({...context.wallpaper, type: 'preset', value: 'warm-waves'});
  });

  expect(updateChatWallpaper).not.toHaveBeenCalled();
  expect(context.wallpaper).toEqual(expect.objectContaining({type: 'preset', value: 'warm-waves'}));

  await ReactTestRenderer.act(async () => renderer.unmount());
});

