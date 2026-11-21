import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Appearance, Platform, StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ChatCustomizationScreen} from '../src/screens/ChatCustomizationScreen';
import {ThemeProvider, useTheme} from '../src/theme/ThemeProvider';
import {DARK_THEME} from '../src/theme/palette';
import {setActiveThemeMode} from '../src/theme/themedStyles';
import {ChatWallpaperProvider, useChatWallpaper} from '../src/wallpaper/ChatWallpaperProvider';
import {WallpaperBackground} from '../src/wallpaper/WallpaperBackground';
import {loadStoredChatWallpaper, storeChatWallpaper, updateChatWallpaper} from '../src/services/preferencesApi';

let mockDeviceScheme: 'light' | 'dark' = 'light';
let appearanceChanged: (value: {colorScheme: 'light' | 'dark'}) => void;
jest.mock('../src/services/sessionStore', () => ({getToken: () => 'jwt', subscribeToSessionChange: () => () => undefined}));
jest.mock('../src/services/preferencesApi', () => ({
  ...jest.requireActual('../src/services/preferencesApi'),
  loadStoredThemePreference: jest.fn(async () => 'system'),
  storeThemePreference: jest.fn(async () => undefined),
  getThemePreference: jest.fn(async () => 'system'),
  updateThemePreference: jest.fn(async theme => theme),
  loadStoredChatWallpaper: jest.fn(),
  storeChatWallpaper: jest.fn(async () => undefined),
  getChatWallpaper: jest.fn(async () => 'preset:warm-waves'),
  updateChatWallpaper: jest.fn(async value => value),
  loadSyncedChatWallpaperValue: jest.fn(async () => null),
  storeSyncedChatWallpaperValue: jest.fn(async () => undefined),
}));

let theme!: ReturnType<typeof useTheme>;
let chat!: ReturnType<typeof useChatWallpaper>;
function Probe() {
  theme = useTheme();
  chat = useChatWallpaper();
  return null;
}
const metrics = {frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}};
const tree = () => <SafeAreaProvider initialMetrics={metrics}><ThemeProvider><ChatWallpaperProvider><Probe/><ChatCustomizationScreen onBack={jest.fn()}/></ChatWallpaperProvider></ThemeProvider></SafeAreaProvider>;
async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  await act(async () => renderer.root.findByProps({accessibilityLabel: label}).props.onPress());
}
function defaultBackground(renderer: ReactTestRenderer.ReactTestRenderer) {
  const background = renderer.root.findAllByType(WallpaperBackground).find(node => node.props.wallpaper.type === 'default');
  expect(background).toBeDefined();
  return StyleSheet.flatten(background!.findAllByType(View)[0].props.style).backgroundColor;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => undefined);
  jest.spyOn(Appearance, 'getColorScheme').mockImplementation(() => mockDeviceScheme);
  jest.spyOn(Appearance, 'addChangeListener').mockImplementation(listener => {
    appearanceChanged = listener;
    return {remove: jest.fn()};
  });
  mockDeviceScheme = 'light';
  setActiveThemeMode('light');
  jest.mocked(loadStoredChatWallpaper).mockResolvedValue(null);
});
afterEach(() => { jest.restoreAllMocks(); setActiveThemeMode('light'); });

test.each(['android', 'ios'] as const)('%s: default chat theme previews, saves and follows System Default while fixed Dark stays dark', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(tree()); });
  await press(renderer, 'Wallpaper');
  await press(renderer, 'Open wallpaper gallery');
  expect(renderer.root.findByProps({accessibilityLabel: 'Default Chat Theme'}).props.accessibilityState.checked).toBe(false);
  await press(renderer, 'Default Chat Theme');
  expect(renderer.root.findByProps({accessibilityLabel: 'Default Chat Theme'}).props.accessibilityState.checked).toBe(true);
  expect(chat.wallpaper.type).toBe('preset');
  expect(updateChatWallpaper).not.toHaveBeenCalled();
  await press(renderer, 'Close');
  await press(renderer, 'Apply wallpaper');
  expect(chat.wallpaper).toEqual(expect.objectContaining({type: 'default', value: ''}));
  expect(storeChatWallpaper).toHaveBeenLastCalledWith(chat.wallpaper);
  expect(updateChatWallpaper).toHaveBeenLastCalledWith('');
  expect(theme.preference).toBe('system');
  expect(defaultBackground(renderer)).toBe('#FBFAFE');

  mockDeviceScheme = 'dark';
  await act(async () => appearanceChanged({colorScheme: 'dark'}));
  await act(async () => renderer.update(tree()));
  expect(defaultBackground(renderer)).toBe(DARK_THEME.surface);
  mockDeviceScheme = 'light';
  await act(async () => appearanceChanged({colorScheme: 'light'}));
  await act(async () => renderer.update(tree()));
  expect(defaultBackground(renderer)).toBe('#FBFAFE');

  await act(async () => { await theme.savePreference('dark'); });
  expect(defaultBackground(renderer)).toBe(DARK_THEME.surface);
  mockDeviceScheme = 'dark';
  await act(async () => appearanceChanged({colorScheme: 'dark'}));
  await act(async () => renderer.update(tree()));
  mockDeviceScheme = 'light';
  await act(async () => appearanceChanged({colorScheme: 'light'}));
  await act(async () => renderer.update(tree()));
  expect(defaultBackground(renderer)).toBe(DARK_THEME.surface);
  expect(theme.preference).toBe('dark');

  // Clearing the native override may update its cache without an event.
  await act(async () => { await theme.savePreference('system'); });
  expect(defaultBackground(renderer)).toBe('#FBFAFE');
  expect(Appearance.setColorScheme).toHaveBeenLastCalledWith('unspecified');

  // Solid wallpaper colors remain available through the existing long press.
  await act(async () => renderer.root.findByProps({accessibilityLabel: 'Choose chat bubble color'}).props.onLongPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Default Chat Theme'}).props.accessibilityState.checked).toBe(true);
  await act(async () => renderer.unmount());
});
