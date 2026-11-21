import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Appearance, Platform, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AppearanceScreen} from '../src/screens/AppearanceScreen';
import {PersonalisationScreen} from '../src/screens/PersonalisationScreen';
import {ThemeProvider, useTheme} from '../src/theme/ThemeProvider';
import {CallContactSheet} from '../src/components/CallContactSheet';
import {OneToOneCallMoreOptionsSheet} from '../src/components/OneToOneCallMoreOptionsSheet';
import {DARK_THEME} from '../src/theme/palette';
import {activeThemeMode, createThemedStyles, setActiveThemeMode} from '../src/theme/themedStyles';
import {
  getThemePreference,
  loadStoredThemePreference,
  storeThemePreference,
  updateThemePreference,
} from '../src/services/preferencesApi';

// Sprint 11 Story 2: Settings -> Appearance -> Theme.

jest.mock('../src/services/preferencesApi', () => ({
  DEFAULT_CHAT_WALLPAPER: {type: 'default', value: '', transparency: 12, messageColor: '#8B27E9'},
  loadStoredThemePreference: jest.fn(),
  storeThemePreference: jest.fn(),
  getThemePreference: jest.fn(),
  updateThemePreference: jest.fn(),
  normalizeChatWallpaper: (wallpaper: any) => wallpaper,
}));
jest.mock('../src/services/sessionStore', () => ({getToken: () => 'jwt-token', subscribeToSessionChange: () => () => undefined}));

// System Default follows the device, so the device's scheme has to be steerable.
let mockDeviceScheme: 'light' | 'dark' = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockDeviceScheme,
}));

const metrics = {frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => undefined);
  mockDeviceScheme = 'light';
  setActiveThemeMode('light');
  jest.mocked(loadStoredThemePreference).mockResolvedValue(null);
  jest.mocked(getThemePreference).mockResolvedValue('system');
  jest.mocked(storeThemePreference).mockResolvedValue(undefined);
  jest.mocked(updateThemePreference).mockImplementation(async theme => theme);
});

afterEach(() => { setActiveThemeMode('light'); jest.restoreAllMocks(); });

async function openAppearance() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider><AppearanceScreen onBack={jest.fn()}/></ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return renderer;
}

async function openPersonalisation() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider><PersonalisationScreen onBack={jest.fn()}/></ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return renderer;
}

const press = async (renderer: ReactTestRenderer.ReactTestRenderer, label: string) => {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: label}).props.onPress();
  });
};

const shown = (renderer: ReactTestRenderer.ReactTestRenderer, text: string) =>
  renderer.root.findAllByProps({children: text}).length > 0;

/**
 * The radio rows, as the sheet renders them. A Pressable shows up as both a
 * composite and a host node with the same props, so only the host is counted.
 */
const radios = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAll(node => node.props?.accessibilityRole === 'radio' && typeof node.type === 'string');

const checked = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  radios(renderer).filter(radio => radio.props.accessibilityState?.checked).map(radio => radio.props.accessibilityLabel);

test('Appearance owns app theme without duplicating chat personalisation', async () => {
  const renderer = await openAppearance();

  expect(shown(renderer, 'Appearance')).toBe(true);
  expect(shown(renderer, 'Choose your app theme.')).toBe(true);
  expect(shown(renderer, 'System Default')).toBe(true);
  expect(shown(renderer, 'Chat Customization')).toBe(false);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('Personalisation exposes wallpaper, message-bubble, brightness and preview features', async () => {
  const renderer = await openPersonalisation();
  expect(shown(renderer, 'Personalisation')).toBe(true);
  await press(renderer, 'Chat Customization');

  expect(shown(renderer, 'Chat Customization')).toBe(true);
  expect(shown(renderer, 'Wallpaper')).toBe(true);
  expect(shown(renderer, 'Chat Bubble')).toBe(true);

  await press(renderer, 'Wallpaper');
  expect(shown(renderer, 'Preview')).toBe(true);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Wallpaper preview conversation'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Apply wallpaper'}).length).toBeGreaterThan(0);

  await press(renderer, 'Adjust brightness');
  expect(renderer.root.findAll(node => node.props.accessibilityRole === 'adjustable' && typeof node.type === 'string')).toHaveLength(1);

  await press(renderer, 'Open wallpaper gallery');
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Choose wallpaper from gallery'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Warm waves'}).length).toBeGreaterThan(0);

  await press(renderer, 'Close');
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Choose chat bubble color'}).props.onLongPress();
  });
  expect(shown(renderer, 'Solid Colors')).toBe(true);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Default Chat Theme'}).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('the theme sheet offers the three options with exactly one selected', async () => {
  const renderer = await openAppearance();
  await press(renderer, 'Theme');

  expect(radios(renderer).map(radio => radio.props.accessibilityLabel)).toEqual(['System Default', 'Light Mode', 'Dark Mode']);
  // Validation: only one option is selectable.
  expect(checked(renderer)).toEqual(['System Default']);

  // The wireframe's live preview.
  expect(shown(renderer, 'Chat Preview')).toBe(true);
  expect(shown(renderer, 'Sample Conversation')).toBe(true);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('choosing an option repaints the app before anything is saved, and only that one is selected', async () => {
  const renderer = await openAppearance();
  await press(renderer, 'Theme');
  await press(renderer, 'Dark Mode');

  expect(activeThemeMode()).toBe('dark');
  expect(checked(renderer)).toEqual(['Dark Mode']);
  expect(updateThemePreference).not.toHaveBeenCalled();

  await press(renderer, 'Light Mode');
  expect(activeThemeMode()).toBe('light');
  expect(checked(renderer)).toEqual(['Light Mode']);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('Save Changes writes the theme to the device and the account, and closes the sheet', async () => {
  const renderer = await openAppearance();
  await press(renderer, 'Theme');
  await press(renderer, 'Dark Mode');
  await press(renderer, 'Save Changes');

  expect(storeThemePreference).toHaveBeenLastCalledWith('dark');
  expect(updateThemePreference).toHaveBeenCalledWith('dark');
  expect(activeThemeMode()).toBe('dark');

  // The sheet is gone and the row now reports the saved theme.
  expect(radios(renderer)).toHaveLength(0);
  expect(shown(renderer, 'Dark Mode')).toBe(true);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('dismissing the sheet puts back the saved theme, so nothing is left applied that was not saved', async () => {
  const renderer = await openAppearance();
  await press(renderer, 'Theme');
  await press(renderer, 'Dark Mode');
  expect(activeThemeMode()).toBe('dark');

  await press(renderer, 'Close');

  expect(activeThemeMode()).toBe('light');
  expect(updateThemePreference).not.toHaveBeenCalled();
  expect(shown(renderer, 'System Default')).toBe(true);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('a server that refuses keeps the theme on this device and says why', async () => {
  jest.mocked(updateThemePreference).mockRejectedValue(new Error('Theme must be light, dark or system'));
  const renderer = await openAppearance();
  await press(renderer, 'Theme');
  await press(renderer, 'Dark Mode');
  await press(renderer, 'Save Changes');

  expect(shown(renderer, 'Theme must be light, dark or system')).toBe(true);
  // The sheet stays open, and the theme the user picked is still applied.
  expect(radios(renderer).length).toBeGreaterThan(0);
  expect(activeThemeMode()).toBe('dark');
  expect(storeThemePreference).toHaveBeenLastCalledWith('dark');

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('the app opens in the theme the device last used, before the server answers', async () => {
  jest.mocked(loadStoredThemePreference).mockResolvedValue('dark');
  jest.mocked(getThemePreference).mockRejectedValue(new Error('offline'));

  const renderer = await openAppearance();

  expect(activeThemeMode()).toBe('dark');
  expect(shown(renderer, 'Dark Mode')).toBe(true);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('the account theme wins once it arrives', async () => {
  jest.mocked(loadStoredThemePreference).mockResolvedValue('light');
  jest.mocked(getThemePreference).mockResolvedValue('dark');

  const renderer = await openAppearance();

  expect(activeThemeMode()).toBe('dark');
  expect(storeThemePreference).toHaveBeenCalledWith('dark');

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('the dark theme actually repaints the screen, rather than only the label', async () => {
  jest.mocked(loadStoredThemePreference).mockResolvedValue('dark');
  jest.mocked(getThemePreference).mockResolvedValue('dark');
  const renderer = await openAppearance();

  const backgrounds = renderer.root
    .findAll(node => Boolean(node.props?.style))
    .flatMap(node => [node.props.style].flat(3))
    .map(style => (style as {backgroundColor?: string} | null)?.backgroundColor)
    .filter(Boolean);

  expect(backgrounds).toContain(DARK_THEME.surface);
  expect(backgrounds).not.toContain('#FFFFFF');

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('System Default follows the device, and an explicit choice overrides it', async () => {
  mockDeviceScheme = 'dark';
  const renderer = await openAppearance();

  // Nothing was chosen, so the device's dark scheme is what gets painted.
  expect(activeThemeMode()).toBe('dark');
  expect(shown(renderer, 'System Default')).toBe(true);

  await press(renderer, 'Theme');
  await press(renderer, 'Light Mode');
  await press(renderer, 'Save Changes');

  // Light Mode means light even on a device that is in dark mode.
  expect(activeThemeMode()).toBe('light');
  expect(updateThemePreference).toHaveBeenCalledWith('light');

  await ReactTestRenderer.act(async () => renderer.unmount());
});

const surfaceStyles = createThemedStyles({page: {backgroundColor: '#FFFFFF'}, label: {color: '#111827'}});
function ThemeSurfaces() {
  const theme = useTheme();
  const [draft, setDraft] = React.useState('');
  const noop = () => undefined;
  return <View testID="theme-page" style={surfaceStyles.page}>
    <Text testID="theme-resolution" style={surfaceStyles.label}>{`${theme.preference}:${theme.mode}`}</Text>
    <TextInput testID="theme-draft" value={draft} onChangeText={setDraft}/>
    <CallContactSheet bottomInset={24} loading={false} name="Theme Contact" onBack={noop} profile={null} visible/>
    <OneToOneCallMoreOptionsSheet autoReconnect bottomInset={24} onAddPeople={noop} onAudioOutput={noop} onCallStatus={noop} onClose={noop} onMicrophoneSettings={noop} onShareScreen={noop} onToggleAutoReconnect={noop} onViewContact={noop} visible/>
  </View>;
}

test.each([
  ['android', 'system'], ['ios', 'system'], ['android', 'dark'], ['ios', 'dark'],
] as const)('%s %s responds correctly when the device changes from dark to light', async (platform, preference) => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  mockDeviceScheme = 'dark';
  jest.mocked(getThemePreference).mockResolvedValue(preference);
  const tree = () => <SafeAreaProvider initialMetrics={metrics}><ThemeProvider><ThemeSurfaces/></ThemeProvider></SafeAreaProvider>;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(tree()); });
    expect(renderer.root.findByProps({testID: 'theme-resolution'}).props.children).toBe(`${preference}:dark`);
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith(preference === 'system' ? 'unspecified' : 'dark');
    await ReactTestRenderer.act(async () => { renderer.root.findByProps({testID: 'theme-draft'}).props.onChangeText('Keep my draft'); });
    mockDeviceScheme = 'light';
    await ReactTestRenderer.act(async () => { renderer.update(tree()); });
    const expectedDark = preference === 'dark';
    const background = expectedDark ? DARK_THEME.surface : '#FFFFFF';
    expect(renderer.root.findByProps({testID: 'theme-resolution'}).props.children).toBe(`${preference}:${expectedDark ? 'dark' : 'light'}`);
    expect(StyleSheet.flatten(renderer.root.findByProps({testID: 'theme-page'}).props.style).backgroundColor).toBe(background);
    expect(StyleSheet.flatten(renderer.root.findByProps({testID: 'theme-resolution'}).props.style).color).toBe(expectedDark ? DARK_THEME.text : '#111827');
    const contact = renderer.root.findByProps({accessibilityLabel: 'View Contact details'});
    expect(StyleSheet.flatten(contact.props.style).backgroundColor).toBe(background);
    const menu = renderer.root.findByProps({accessibilityLabel: 'More Options'});
    expect(StyleSheet.flatten(menu.props.style).backgroundColor).toBe(background);
    expect(renderer.root.findByProps({testID: 'theme-draft'}).props.value).toBe('Keep my draft');
    mockDeviceScheme = 'dark';
    await ReactTestRenderer.act(async () => { renderer.update(tree()); });
    expect(renderer.root.findByProps({testID: 'theme-resolution'}).props.children).toBe(`${preference}:dark`);
  } finally {
    if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
    os.restore();
  }
});

test('a late account response cannot replace a newly saved Dark Mode choice', async () => {
  let resolveRemote!: (preference: 'system') => void;
  jest.mocked(getThemePreference).mockImplementationOnce(() => new Promise(resolve => { resolveRemote = resolve; }));
  const renderer = await openAppearance();
  try {
    await press(renderer, 'Theme');
    await press(renderer, 'Dark Mode');
    await press(renderer, 'Save Changes');
    await ReactTestRenderer.act(async () => { resolveRemote('system'); });
    expect(activeThemeMode()).toBe('dark');
    expect(shown(renderer, 'Dark Mode')).toBe(true);
    expect(storeThemePreference).toHaveBeenLastCalledWith('dark');
  } finally { await ReactTestRenderer.act(async () => renderer.unmount()); }
});
