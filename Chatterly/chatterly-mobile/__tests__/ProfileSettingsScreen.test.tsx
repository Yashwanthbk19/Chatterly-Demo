import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import {Dimensions, Image, Keyboard, Platform, ScrollView, Share, StyleSheet, Text, View} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { emojiPanelHeight } from '../src/components/EmojiPicker';
import { Snackbar } from '../src/components/Snackbar';
import { SettingsScreen } from '../src/screens/ProfileSettingsScreen';
import { QrIcon } from '../src/components/ContactsIcons';
import { sendEmailOtp, verifyEmailOtp } from '../src/services/authApi';
import { updateProfile } from '../src/services/profileApi';
import {
  clearSession,
  getSession,
  saveSession,
  updateSessionUser,
} from '../src/services/sessionStore';

jest.mock('../src/services/authApi', () => ({
  sendEmailOtp: jest.fn(),
  resendEmailOtp: jest.fn(),
  verifyEmailOtp: jest.fn(),
}));
jest.mock('../src/services/profileApi', () => ({ updateProfile: jest.fn() }));
// Profile settings imports the Media & Links route eagerly. Keep this suite on
// the account UI and away from Expo's native auto-download module.
jest.mock('../src/services/autoDownload', () => ({
  clearDownloadedMedia: jest.fn(async () => undefined),
  useAutoDownloadSnapshot: jest.fn(() => ({downloadedMedia: {count: 0, totalBytes: 0}})),
}));

jest.setTimeout(30000);
const createRenderer = ReactTestRenderer.create;
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(ReactTestRenderer, 'create').mockImplementation((...args) => {
    const renderer = createRenderer(...args);
    mountedRenderers.push(renderer);
    return renderer;
  });
  await SecureStore.deleteItemAsync('chatterly.account-dob.user-1');
  jest.mocked(sendEmailOtp).mockResolvedValue('OTP sent to email');
  jest.mocked(verifyEmailOtp).mockResolvedValue({
    token: 'verified-token',
    user: null,
    isProfileComplete: true,
    message: '',
    requires2FA: false,
    twoFactorUserId: '',
    twoFactorMethod: '',
  });
  jest.mocked(updateProfile).mockResolvedValue({ message: 'Email updated' });
  saveSession({
    token: 'jwt-token',
    user: {
      id: 'user-1',
      name: 'Akula Durga Prasad',
      status: 'Hey there! I am using Chatterly',
      phone: '+91 963 635 6512',
      email: 'example@gmail.com',
      dateOfBirth: '1896-03-12',
    },
    isProfileComplete: true,
    message: '',
    requires2FA: false,
    twoFactorUserId: '',
    twoFactorMethod: '',
  });
});

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    mountedRenderers.splice(0).forEach(renderer => renderer.unmount());
  });
  jest.restoreAllMocks();
  await clearSession();
});

test.each([0, 24, 48, 96])('keeps Settings tabs and content above a %s-point system navigation area', async bottom => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom, left: 0}}}>
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()}/>
      </SafeAreaProvider>,
    );
  });
  const viewStyles = renderer!.root.findAllByType(View).map(node => StyleSheet.flatten(node.props.style));
  const nav = viewStyles.find(style => style?.position === 'absolute' && style?.height === 69 + bottom);
  expect(nav).toMatchObject({bottom: 0, paddingBottom: bottom, paddingTop: 6});
  expect(nav!.height - nav!.paddingBottom).toBe(69);
  expect(StyleSheet.flatten(renderer!.root.findByType(ScrollView).props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(nav!.height);
  await ReactTestRenderer.act(async () => renderer!.unmount());
});

test('shows the Settings back arrow and follows the app back action', async () => {
  const onBack = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}}}>
        <SettingsScreen onBack={onBack} onOpenChats={jest.fn()} onOpenContacts={jest.fn()}/>
      </SafeAreaProvider>,
    );
  });

  const back = renderer!.root.findByProps({accessibilityLabel: 'Back from settings'});
  expect(back).toBeDefined();
  await ReactTestRenderer.act(async () => back.props.onPress());
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('renders the supplied shield artwork for Privacy', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, right: 0, bottom: 24, left: 0 },
        }}
      >
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  expect(
    renderer!.root.findByProps({
      d: 'M16.0002 16C15.735 16 15.4806 15.8946 15.2931 15.7071C15.1056 15.5196 15.0002 15.2652 15.0002 15C15.0002 14.7348 15.1056 14.4804 15.2931 14.2929C15.4806 14.1054 15.735 14 16.0002 14C16.2654 14 16.5198 14.1054 16.7073 14.2929C16.8948 14.4804 17.0002 14.7348 17.0002 15C17.0002 15.2652 16.8948 15.5196 16.7073 15.7071C16.5198 15.8946 16.2654 16 16.0002 16ZM16.0002 16V18.5M16.0002 7C18.336 9.06658 21.3847 10.1426 24.5002 10C24.9538 11.543 25.0926 13.1615 24.9083 14.7592C24.7241 16.3569 24.2205 17.9013 23.4276 19.3005C22.6347 20.6998 21.5686 21.9254 20.2927 22.9045C19.0167 23.8836 17.557 24.5962 16.0002 25C14.4434 24.5962 12.9837 23.8836 11.7077 22.9045C10.4318 21.9254 9.36571 20.6998 8.5728 19.3005C7.77988 17.9013 7.27633 16.3569 7.09208 14.7592C6.90782 13.1615 7.04661 11.543 7.5002 10C10.6157 10.1426 13.6644 9.06658 16.0002 7Z',
    }),
  ).toBeTruthy();
});

test('shows the Settings navigation, profile shortcut, requested sections, and app version', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, right: 0, bottom: 24, left: 0 },
        }}
      >
        <SettingsScreen
          onLogout={jest.fn()}
          onOpenChats={jest.fn()}
          onOpenContacts={jest.fn()}
        />
      </SafeAreaProvider>,
    );
  });

  for (const label of [
    'Account',
    'Appearance',
    'Personalisation',
    'Notifications',
    'Privacy',
    'Media & Links',
    'Devices',
    'Help & Feedback',
    'Logout',
    'Chats',
    'Contacts',
    'Calls',
    'Settings',
    'Edit profile',
    'App Version: 1.0.0',
  ]) {
    expect(
      renderer!.root.findByProps({ accessibilityLabel: label }),
    ).toBeDefined();
  }
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'App Version: 1.0.0' }).props.children.join(''),
  ).toBe('App Version: 1.0.0');
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({ accessibilityLabel: 'Personalisation' }).props.onPress();
  });
  expect(renderer!.root.findByProps({children: 'Personalisation'})).toBeDefined();
  expect(renderer!.root.findByProps({accessibilityLabel: 'Chat Customization'})).toBeDefined();
  expect(renderer!.root.findByProps({accessibilityLabel: 'Back to settings'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer!.unmount());
});

async function renderSettingsScreen() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}}}>
        <SettingsScreen onLogout={jest.fn()} onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  return renderer;
}

test.each(['android', 'ios'] as const)('uses the web default profile symbol without a photo on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
    updateSessionUser({name: 'Chatterly', profilePic: ''});
    const renderer = await renderSettingsScreen();
    const avatar = () => renderer.root.findByProps({accessibilityLabel: 'Default profile picture'});
    expect(avatar().props.source).toBe(require('../src/assets/default-profile.png'));
    expect(StyleSheet.flatten(avatar().props.style)).toMatchObject({width: 64, height: 64});
    expect(renderer.root.findAllByProps({children: 'C'})).toHaveLength(0);
    await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'View profile picture'}).props.onPress(); });
    expect(StyleSheet.flatten(avatar().props.style)).toMatchObject({width: 180, height: 180});
    await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Back'}).props.onPress(); });
    await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Edit profile'}).props.onPress(); });
    expect(StyleSheet.flatten(avatar().props.style)).toMatchObject({width: 82, height: 82});
  } finally { os.restore(); }
});

test.each(['android', 'ios'] as const)('keeps an uploaded profile photo on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
    const profilePic = 'https://cdn.test/my-profile.jpg';
    updateSessionUser({profilePic});
    const renderer = await renderSettingsScreen();
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Default profile picture'})).toHaveLength(0);
    const hero = renderer.root.findByProps({accessibilityLabel: 'View profile picture'});
    expect(hero.findByType(Image).props.source).toEqual({uri: profilePic});
  } finally { os.restore(); }
});

const searchSettings = (renderer: ReactTestRenderer.ReactTestRenderer, text: string) =>
  ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Search settings'}).props.onChangeText(text);
  });
const isShown = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAllByProps({accessibilityLabel: label}).length > 0;
const wordsOnScreen = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).filter(part => typeof part === 'string').join('')).join(' | ');

// The profile picture, name and Edit Profile stayed above the results while a
// search was typed, so the matches were pushed down the screen.
test('searching Settings hides the profile picture block and leaves only the matching rows', async () => {
  const renderer = await renderSettingsScreen();
  expect(isShown(renderer, 'View profile picture')).toBe(true);
  expect(isShown(renderer, 'Edit profile')).toBe(true);

  await searchSettings(renderer, 'priv');

  expect(isShown(renderer, 'View profile picture')).toBe(false);
  expect(isShown(renderer, 'Edit profile')).toBe(false);
  expect(isShown(renderer, 'Privacy')).toBe(true);
  expect(isShown(renderer, 'Appearance')).toBe(false);

  await searchSettings(renderer, '');

  expect(isShown(renderer, 'View profile picture')).toBe(true);
  expect(isShown(renderer, 'Edit profile')).toBe(true);
  expect(isShown(renderer, 'Appearance')).toBe(true);
});

test('says "No results found" when nothing in Settings matches the search', async () => {
  const renderer = await renderSettingsScreen();
  expect(wordsOnScreen(renderer)).not.toContain('No results found');

  await searchSettings(renderer, 'zzzz');

  expect(wordsOnScreen(renderer)).toContain('No results found');
  expect(isShown(renderer, 'Privacy')).toBe(false);
  expect(isShown(renderer, 'View profile picture')).toBe(false);

  await searchSettings(renderer, 'privacy');

  expect(wordsOnScreen(renderer)).not.toContain('No results found');
  expect(isShown(renderer, 'Privacy')).toBe(true);
});

test('searching Settings finds call settings across all sections with their paths', async () => {
  const renderer = await renderSettingsScreen();

  await searchSettings(renderer, 'call');

  const words = wordsOnScreen(renderer);
  expect(words).toContain('Incoming Call Notifications');
  expect(words).toContain('Call Ringtone');
  expect(words).toContain('Notifications → Calls');
  expect(words).toContain('End-to-End Encryption');
  expect(words).toContain('Privacy → Protect your chats and calls');
  expect(words).toContain('Media & Links → Data Usage');
  expect(isShown(renderer, 'Appearance')).toBe(false);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Incoming Call Notifications'}).props.onPress();
  });
  expect(isShown(renderer, 'Search Notifications')).toBe(true);
});

test.each(['android', 'ios'] as const)('opens a scannable profile QR screen using the Contacts icon and returns to Settings on %s', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, right: 0, bottom: 24, left: 0 },
        }}
      >
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  const qrButton = renderer!.root.findAllByProps({ accessibilityLabel: 'Open my QR code' })[0];
  expect(qrButton.findByType(QrIcon)).toBeDefined();
  await ReactTestRenderer.act(async () => qrButton.props.onPress());

  expect(
    renderer!.root.findAllByProps({ children: 'QR Code' }).length,
  ).toBeGreaterThan(0);
  expect(
    renderer!.root.findAllByProps({ accessibilityLabel: 'My profile QR code' })
      .length,
  ).toBeGreaterThan(0);
  expect(
    renderer!.root.findAllByProps({
      value: 'https://chatterly.stacklycloud.com/profile/user-1',
    }).length,
  ).toBeGreaterThan(0);
  expect(
    renderer!.root.findAllByProps({ children: 'Akula Durga Prasad' }).length,
  ).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findAllByProps({ accessibilityLabel: 'Back to settings' })[0]
      .props.onPress();
  });
  expect(
    renderer!.root.findAllByProps({ children: 'Settings' }).length,
  ).toBeGreaterThan(0);
});

test('opens the Edit Profile screen from the Settings profile button', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, right: 0, bottom: 24, left: 0 },
        }}
      >
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Edit profile' })
      .props.onPress();
  });

  const save = () =>
    renderer!.root.findByProps({ accessibilityLabel: 'Save Changes' });
  const name = renderer!.root.findByProps({ accessibilityLabel: 'Full Name' });
  expect(renderer!.root.findByProps({ accessibilityLabel: 'Full Name, required' })).toBeDefined();
  expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Bio' }).length).toBeGreaterThan(0);
  expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Bio, required' })).toHaveLength(0);
  const originalName = name.props.value;
  expect(save().props.disabled).toBe(true);
  await ReactTestRenderer.act(async () => {
    name.props.onChangeText('Changed name');
  });
  expect(save().props.disabled).toBe(false);
  await ReactTestRenderer.act(async () => {
    name.props.onChangeText(originalName);
  });
  expect(save().props.disabled).toBe(true);
});

async function openEditProfile() {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}}}>
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({ accessibilityLabel: 'Edit profile' }).props.onPress();
  });
  return renderer!;
}

test.each(['ios', 'android'] as const)('shows a readable name-update confirmation on Profile above the save bar on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
    jest.mocked(updateProfile).mockResolvedValueOnce({user: {name: 'Updated Name'}});
    const renderer = await openEditProfile();
    const saveBar = renderer.root.findByProps({accessibilityLabel: 'Save Changes'}).parent!;
    await ReactTestRenderer.act(() => {
      saveBar.props.onLayout?.({nativeEvent: {layout: {height: 96}}});
      renderer.root.findByProps({accessibilityLabel: 'Full Name'}).props.onChangeText('  Updated Name  ');
    });
    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({accessibilityLabel: 'Save Changes'}).props.onPress();
    });

    expect(updateProfile).toHaveBeenCalledWith('jwt-token', expect.objectContaining({name: 'Updated Name'}));
    expect(getSession()?.user?.name).toBe('Updated Name');
    expect(renderer.root.findByProps({accessibilityLabel: 'Full Name'}).props.value).toBe('Updated Name');
    expect(renderer.root.findByProps({accessibilityLabel: 'Save Changes'}).props.disabled).toBe(true);
    expect(renderer.root.findByType(Snackbar).props.message).toBe('Profile Updated');
    const confirmation = renderer.root.findByProps({children: 'Profile Updated'});
    expect(StyleSheet.flatten(confirmation.props.style).fontSize).toBeGreaterThanOrEqual(14);
    const placement = StyleSheet.flatten(confirmation.parent!.props.style);
    expect(placement.bottom).toBeGreaterThan(96);
    expect(placement.top).toBeUndefined();
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Search settings'})).toHaveLength(0);

    await ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Back to settings'}).props.onPress());
    expect(renderer.root.findByProps({accessibilityLabel: 'Search settings'})).toBeTruthy();
    expect(renderer.root.findAllByProps({children: 'Profile Updated'})).toHaveLength(0);
    await ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Edit profile'}).props.onPress());
    expect(renderer.root.findAllByProps({children: 'Profile Updated'})).toHaveLength(0);
  } finally {
    os.restore();
  }
});

test('shows profile confirmation only after success and keeps save errors on the Profile page', async () => {
  let resolveSave!: (response: {user: {name: string}}) => void;
  jest.mocked(updateProfile).mockImplementationOnce(() => new Promise(resolve => {resolveSave = resolve;}));
  const renderer = await openEditProfile();
  await ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Full Name'}).props.onChangeText('Updated Name'));
  let pendingSave!: Promise<void>;
  await ReactTestRenderer.act(() => {
    pendingSave = renderer.root.findByProps({accessibilityLabel: 'Save Changes'}).props.onPress();
  });
  expect(renderer.root.findAllByProps({children: 'Profile Updated'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Save Changes'}).props.disabled).toBe(true);
  await ReactTestRenderer.act(async () => {
    resolveSave({user: {name: 'Updated Name'}});
    await pendingSave;
  });
  expect(renderer.root.findByProps({children: 'Profile Updated'})).toBeTruthy();

  jest.mocked(updateProfile).mockRejectedValueOnce(new Error('Unable to save your profile.'));
  await ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Full Name'}).props.onChangeText('Another Name'));
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Save Changes'}).props.onPress();
  });
  expect(renderer.root.findAllByProps({children: 'Profile Updated'})).toHaveLength(0);
  expect(renderer.root.findByProps({children: 'Unable to save your profile.'})).toBeTruthy();
  expect(getSession()?.user?.name).toBe('Updated Name');
  expect(renderer.root.findByProps({accessibilityLabel: 'Full Name'}).props.value).toBe('Another Name');
  expect(renderer.root.findByProps({accessibilityLabel: 'Save Changes'}).props.disabled).toBe(false);

  jest.mocked(updateProfile).mockResolvedValueOnce({});
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Save Changes'}).props.onPress();
  });
  expect(renderer.root.findByType(Snackbar).props.message).toBe('Profile Updated');
  expect(renderer.root.findAllByProps({children: 'Unable to save your profile.'})).toHaveLength(0);
  expect(getSession()?.user?.name).toBe('Another Name');
});

test('dismisses each profile confirmation automatically and confirms subsequent saves', async () => {
  jest.mocked(updateProfile).mockResolvedValue({});
  const renderer = await openEditProfile();
  jest.useFakeTimers();
  try {
    for (const name of ['First Update', 'Second Update']) {
      await ReactTestRenderer.act(() => renderer.root.findByProps({accessibilityLabel: 'Full Name'}).props.onChangeText(name));
      await ReactTestRenderer.act(async () => {
        await renderer.root.findByProps({accessibilityLabel: 'Save Changes'}).props.onPress();
      });
      expect(renderer.root.findByProps({children: 'Profile Updated'})).toBeTruthy();
      await ReactTestRenderer.act(() => jest.advanceTimersByTime(3500));
      expect(renderer.root.findAllByProps({children: 'Profile Updated'})).toHaveLength(0);
    }
  } finally {
    await ReactTestRenderer.act(() => renderer.unmount());
    jest.useRealTimers();
  }
});

test('Full Name has an emoji button in its corner that swaps the keyboard for the emoji panel and back', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  const renderer = await openEditProfile();
  const find = (accessibilityLabel: string) => renderer.root.findAllByProps({ accessibilityLabel });
  // A component and the native view behind it both carry the label.
  const shown = (accessibilityLabel: string) => find(accessibilityLabel).length > 0;
  const saveBarBottom = () => StyleSheet.flatten(find('Save Changes')[0].parent!.props.style).bottom;

  // Typing mode: the emoji button, no panel, save bar at the screen edge.
  expect(shown('Add emoji')).toBe(true);
  expect(shown('Show keyboard')).toBe(false);
  expect(shown('Emoji picker')).toBe(false);
  expect(saveBarBottom()).toBe(0);

  await ReactTestRenderer.act(async () => {
    find('Add emoji')[0].props.onPress();
    await Promise.resolve();
  });

  // The panel takes the keyboard's place; the same corner now offers the keyboard.
  expect(dismiss).toHaveBeenCalled();
  expect(shown('Emoji picker')).toBe(true);
  expect(shown('Show keyboard')).toBe(true);
  expect(shown('Add emoji')).toBe(false);
  // A name has no use for GIFs.
  expect(shown('GIF')).toBe(false);
  expect(shown('Search Emoji')).toBe(true);
  // The Save button rides above the panel instead of behind it.
  expect(saveBarBottom()).toBe(emojiPanelHeight(Dimensions.get('window').height) + 24);

  await ReactTestRenderer.act(async () => {
    find('Show keyboard')[0].props.onPress();
  });
  expect(shown('Emoji picker')).toBe(false);
  expect(shown('Add emoji')).toBe(true);
  expect(saveBarBottom()).toBe(0);
  dismiss.mockRestore();
});

test('an emoji picked for Full Name lands at the caret and counts toward the 30-character limit', async () => {
  const renderer = await openEditProfile();
  const name = () => renderer.root.findByProps({ accessibilityLabel: 'Full Name' });
  const openPanel = async () => ReactTestRenderer.act(async () => {
    renderer.root.findByProps({ accessibilityLabel: 'Add emoji' }).props.onPress();
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => name().props.onChangeText('Maya Rao'));
  // Caret parked between "Maya" and " Rao".
  await ReactTestRenderer.act(async () => name().props.onSelectionChange({ nativeEvent: { selection: { start: 4, end: 4 } } }));
  await openPanel();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({ accessibilityLabel: 'Add 📱' }).props.onPress();
    await Promise.resolve();
  });

  expect(name().props.value).toBe('Maya📱 Rao');
  // The caret is handed back after the emoji so the next tap continues the run,
  // and the edit counts as a change the user can save.
  expect(name().props.selection).toEqual({ start: 6, end: 6 });
  expect(renderer.root.findByProps({ accessibilityLabel: 'Save Changes' }).props.disabled).toBe(false);

  // A name that is already full takes no more.
  await ReactTestRenderer.act(async () => name().props.onChangeText('x'.repeat(29)));
  await ReactTestRenderer.act(async () => name().props.onSelectionChange({ nativeEvent: { selection: { start: 29, end: 29 } } }));
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({ accessibilityLabel: 'Add 📱' }).props.onPress();
    await Promise.resolve();
  });
  expect(name().props.value).toBe('x'.repeat(29));
  expect(renderer.root.findAllByProps({ children: 'Name cannot exceed 30 characters.' }).length).toBeGreaterThan(0);
});

test('tapping into Full Name or Bio closes the emoji panel so the keyboard has the space', async () => {
  const renderer = await openEditProfile();
  const open = async () => ReactTestRenderer.act(async () => {
    renderer.root.findByProps({ accessibilityLabel: 'Add emoji' }).props.onPress();
    await Promise.resolve();
  });

  for (const field of ['Full Name', 'Bio']) {
    await open();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Emoji picker' }).length).toBeGreaterThan(0);
    // A field's caption now carries the same accessibility label as its input, so pick the input.
    const input = renderer.root.findAllByProps({ accessibilityLabel: field }).find(node => typeof node.props.onFocus === 'function');
    await ReactTestRenderer.act(async () => input!.props.onFocus());
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Emoji picker' })).toHaveLength(0);
  }
});

test('the Full Name screen in Account swaps the keyboard for the emoji panel the same way', async () => {
  const renderer = await openAccountForEditing();
  const shown = (accessibilityLabel: string) => renderer.root.findAllByProps({ accessibilityLabel }).length > 0;
  const input = () => renderer.root.findByProps({ accessibilityLabel: 'Full Name input' });
  await ReactTestRenderer.act(async () => renderer.root.findByProps({ accessibilityLabel: 'Full Name' }).props.onPress());

  expect(shown('Add emoji')).toBe(true);
  expect(shown('Emoji picker')).toBe(false);
  // Caret parked after "Akula".
  await ReactTestRenderer.act(async () => input().props.onSelectionChange({ nativeEvent: { selection: { start: 5, end: 5 } } }));
  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({ accessibilityLabel: 'Add emoji' })[0].props.onPress();
    await Promise.resolve();
  });
  expect(shown('Emoji picker')).toBe(true);
  expect(shown('Show keyboard')).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({ accessibilityLabel: 'Add 📱' }).props.onPress();
    await Promise.resolve();
  });
  expect(input().props.value).toBe('Akula📱 Durga Prasad');
  expect(renderer.root.findByProps({ accessibilityLabel: 'Save Full Name' }).props.disabled).toBe(false);

  // Tapping back into the field hands the space to the keyboard again.
  await ReactTestRenderer.act(async () => input().props.onFocus());
  expect(shown('Emoji picker')).toBe(false);
  expect(shown('Add emoji')).toBe(true);
});

test('the Settings profile card offers Share Profile beside Edit Profile', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  const renderer = await renderSettingsScreen();
  const button = renderer.root
    .findAllByProps({ accessibilityLabel: 'Share Profile' })
    .find(node => typeof node.props.onPress === 'function');
  expect(button).toBeDefined();

  await ReactTestRenderer.act(async () => { await button!.props.onPress(); });

  expect(share).toHaveBeenCalledWith({
    message: 'Akula Durga Prasad Chatterly profile\nPhone: +91 963 635 6512\nEmail: example@gmail.com',
  });
});

test('confirms logout before signing out and lets the user cancel', async () => {
  const onLogout = jest.fn().mockResolvedValue(undefined);
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, right: 0, bottom: 24, left: 0 },
        }}
      >
        <SettingsScreen
          onLogout={onLogout}
          onOpenChats={jest.fn()}
          onOpenContacts={jest.fn()}
        />
      </SafeAreaProvider>,
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Logout' })
      .props.onPress();
  });

  expect(
    renderer!.root.findByProps({ children: 'Log out of Chatterly?' }),
  ).toBeDefined();
  expect(
    renderer!.root.findByProps({
      children:
        'You’ll need to sign in again to access your chats and account.',
    }),
  ).toBeDefined();
  expect(onLogout).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Cancel logout' })
      .props.onPress();
  });
  expect(onLogout).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Logout' })
      .props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ accessibilityLabel: 'Confirm Logout' })
      .props.onPress();
  });

  expect(onLogout).toHaveBeenCalledTimes(1);
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Account' }),
  ).toBeDefined();
  await ReactTestRenderer.act(() => renderer!.unmount());
});

test('opens the full profile picture viewer and exposes all picture edit actions', async () => {
  saveSession({
    token: 'jwt-token',
    user: {
      id: 'user-1',
      name: 'Akula Durga Prasad',
      profilePic: 'https://media.example.com/profiles/user-1.jpg',
    },
    isProfileComplete: true,
    message: '',
    requires2FA: false,
    twoFactorUserId: '',
    twoFactorMethod: '',
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, right: 0, bottom: 24, left: 0 },
        }}
      >
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'View profile picture' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ children: 'Profile Picture' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Full profile picture' })
      .props.resizeMode,
  ).toBe('contain');
  expect(
    renderer!.root.findByProps({
      d: 'M3.75 4.75011H2.75C2.21957 4.75011 1.71086 4.96082 1.33579 5.33589C0.960714 5.71097 0.75 6.21967 0.75 6.75011V15.7501C0.75 16.2805 0.960714 16.7892 1.33579 17.1643C1.71086 17.5394 2.21957 17.7501 2.75 17.7501H11.75C12.2804 17.7501 12.7891 17.5394 13.1642 17.1643C13.5393 16.7892 13.75 16.2805 13.75 15.7501V14.7501M12.7625 2.76261L14.165 1.36511C14.5588 0.971261 15.093 0.75 15.65 0.75C16.207 0.75 16.7412 0.971261 17.135 1.36511C17.5288 1.75895 17.7501 2.29312 17.7501 2.85011C17.7501 3.40709 17.5288 3.94126 17.135 4.33511L15.7375 5.73761M12.7625 2.76261L5.75 9.75011V12.7501H8.75L15.7375 5.73761M12.7625 2.76261L12.75 2.75011M12.7625 2.76261L15.7375 5.73761M15.7375 5.73761L15.75 5.75011',
    }),
  ).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Edit profile picture' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Camera' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Gallery' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({
      accessibilityLabel: 'Remove Profile Picture',
    }),
  ).toBeTruthy();
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ accessibilityLabel: 'Gallery' })
      .props.onPress();
  });
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
    mediaTypes: ['images'],
    quality: 1,
    selectionLimit: 1,
  });

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});

test('shows and persists the profile picture returned after saving changes', async () => {
  jest.mocked(updateProfile).mockResolvedValue({
    message: 'Profile updated successfully',
    user: {
      name: 'Akula Durga Prasad',
      profilePic: 'https://media.example.com/profiles/user-1.jpg',
    },
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, right: 0, bottom: 24, left: 0 },
        }}
      >
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Edit profile' })
      .props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Full Name' })
      .props.onChangeText('Akula Updated');
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Save Changes' })
      .props.onPress();
  });

  expect(
    renderer!.root.findByProps({ children: 'Profile Updated' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findAll(
      node =>
        node.props.source?.uri ===
        'https://media.example.com/profiles/user-1.jpg',
    ).length,
  ).toBeGreaterThan(0);
  expect(getSession()?.user?.profilePic).toBe(
    'https://media.example.com/profiles/user-1.jpg',
  );
  expect(renderer!.root.findByProps({ accessibilityLabel: 'Full Name' }).props.value)
    .toBe('Akula Durga Prasad');
  expect(renderer!.root.findByProps({ accessibilityLabel: 'Save Changes' }).props.disabled)
    .toBe(true);
  expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Account' })).toHaveLength(0);
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({ accessibilityLabel: 'Back to settings' }).props.onPress();
  });
  expect(renderer!.root.findAllByProps({ children: 'Profile Updated' })).toHaveLength(0);
  expect(renderer!.root.findByProps({ accessibilityLabel: 'Edit profile' })).toBeTruthy();
  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});

test('opens the Account screen with the signed-in user contact information', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, right: 0, bottom: 24, left: 0 },
        }}
      >
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Account' })
      .props.onPress();
  });

  expect(
    renderer!.root.findAllByProps({ children: 'Account' }).length,
  ).toBeGreaterThan(0);
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Full Name' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Phone Number' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Email' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Date of Birth' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ children: '+91 963 635 6512' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ children: 'example@gmail.com' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ children: '12 March 1896' }),
  ).toBeTruthy();
  expect(renderer!.root.findByProps({ d: 'M15 6L9 12L15 18' })).toBeTruthy();
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Account header' }).props
      .style,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ height: 66, paddingTop: 24 }),
    ]),
  );
});

test('edits and displays the date of birth saved on this device', async () => {
  jest.mocked(updateProfile).mockResolvedValue({
    message: 'Profile updated',
    user: { dateOfBirth: '1990-05-12' },
  });
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, right: 0, bottom: 24, left: 0 },
        }}
      >
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Account' })
      .props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Date of Birth' })
      .props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Date of Birth input' })
      .props.onChangeText('1990-05-12');
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Save Date of Birth' })
      .props.onPress();
  });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('chatterly.account-dob.user-1', '1990-05-12');
  expect(updateProfile).not.toHaveBeenCalled();
  expect(
    renderer!.root.findAllByProps({ children: '12 May 1990' }).length,
  ).toBeGreaterThan(0);
});

async function openAccountForEditing() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}}}>
      <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
    </SafeAreaProvider>);
  });
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Account'}).props.onPress());
  return renderer;
}

test.each([
  ['Full Name', 'Full Name'],
  ['Phone Number', 'Phone Number'],
  ['Date of Birth', 'Date of Birth'],
  ['Change email', 'Change your email'],
] as const)('gives the %s editor title a full safe-area-aware header row', async (action, title) => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 48, right: 0, bottom: 24, left: 0}}}>
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Account'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: action}).props.onPress());

  const titleNode = renderer.root.findAllByType(Text).find(node =>
    node.props.children === title && StyleSheet.flatten(node.props.style)?.fontWeight === '700',
  );
  expect(titleNode).toBeDefined();
  expect(StyleSheet.flatten(titleNode!.parent!.props.style)).toMatchObject({
    height: 90,
    paddingTop: 48,
    alignItems: 'center',
  });
});

test.each([
  ['android', 'Phone Number', 'Phone number input', '+91 963 635 6512', '9876543210'],
  ['ios', 'Phone Number', 'Phone number input', '+91 963 635 6512', '9876543210'],
  ['android', 'Date of Birth', 'Date of Birth input', '1896-03-12', '19960615'],
  ['ios', 'Date of Birth', 'Date of Birth input', '1896-03-12', '19960615'],
] as const)('opens %s %s from its chevron and cancels without saving', async (platform, label, inputLabel, original, edited) => {
  jest.replaceProperty(Platform, 'OS', platform);
  const renderer = await openAccountForEditing();
  expect(renderer.root.findByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');

  // Start at the visible arrow, then follow its actual press target. Tapping
  // the text directly did not catch the inactive phone row/chevron regression.
  let row: ReactTestRenderer.ReactTestInstance | null = renderer.root.findByProps({accessibilityLabel: label});
  while (row && row.findAllByProps({d: 'm9 5 7 7-7 7'}).length === 0) { row = row.parent; }
  expect(row).not.toBeNull();
  let target: ReactTestRenderer.ReactTestInstance | null = row!.findAllByProps({d: 'm9 5 7 7-7 7'})[0];
  while (target && typeof target.props.onPress !== 'function') { target = target.parent; }
  expect(target).not.toBeNull();
  await ReactTestRenderer.act(async () => target!.props.onPress());

  const input = renderer.root.findByProps({accessibilityLabel: inputLabel});
  expect(input.props.value).toBe(original);
  expect(input.props.editable).toBe(true);
  expect(input.props.autoFocus).toBe(true);
  await ReactTestRenderer.act(async () => input.props.onChangeText(edited));
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Back to account'}).props.onPress());

  expect(renderer.root.findByProps({accessibilityLabel: 'Account header'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: inputLabel})).toHaveLength(0);
  expect(getSession()?.user?.phone).toBe('+91 963 635 6512');
  expect(getSession()?.user?.dateOfBirth).toBe('1896-03-12');
  expect(updateProfile).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith('chatterly.account-dob.user-1', expect.anything());
});

test('copying the phone number does not open the phone editor', async () => {
  const renderer = await openAccountForEditing();
  const stopPropagation = jest.fn();
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Copy phone number'}).props.onPress({stopPropagation});
  });
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('+91 963 635 6512');
  expect(renderer.root.findByProps({accessibilityLabel: 'Account header'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Phone number input'})).toHaveLength(0);
});

test('edits and saves the full name from Account', async () => {
  jest.mocked(updateProfile).mockResolvedValue({
    message: 'Profile updated',
    user: { name: 'Akula Updated' },
  });
  const renderer = await openAccountForEditing();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Full Name'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Full Name input' })
      .props.onChangeText('  Akula Updated  ');
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root
      .findByProps({ accessibilityLabel: 'Save Full Name' })
      .props.onPress();
  });

  expect(updateProfile).toHaveBeenCalledWith('jwt-token', {
    name: 'Akula Updated',
  });
  expect(getSession()?.user?.name).toBe('Akula Updated');
  expect(renderer.root.findByProps({children: 'Akula Updated'})).toBeTruthy();
});

test.each(['ios', 'android'] as const)('edits and saves the account phone on %s', async platform => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', {configurable: true, value: platform});
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    renderer = await openAccountForEditing();
    await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Phone Number'}).props.onPress());
    expect(renderer.root.findByProps({accessibilityLabel: 'Phone number input'}).props.editable).toBe(true);
    await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Phone number input'}).props.onChangeText('123'));
    expect(renderer.root.findByProps({accessibilityLabel: 'Save Phone Number'}).props.disabled).toBe(true);
    await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Phone number input'}).props.onChangeText('98765 43210'));
    expect(renderer.root.findByProps({accessibilityLabel: 'Save Phone Number'}).props.disabled).toBe(false);
    jest.mocked(updateProfile).mockResolvedValueOnce({user: {phone: '+919876543210'}});
    await ReactTestRenderer.act(async () => { await renderer!.root.findByProps({accessibilityLabel: 'Save Phone Number'}).props.onPress(); });
    expect(updateProfile).toHaveBeenCalledWith('jwt-token', {phone: '+919876543210'});
    expect(getSession()?.user?.phone).toBe('+919876543210');
    expect(renderer.root.findByProps({children: '+919876543210'})).toBeDefined();
  } finally {
    if (renderer) { await ReactTestRenderer.act(async () => renderer!.unmount()); }
    Object.defineProperty(Platform, 'OS', {configurable: true, value: original});
  }
});

test.each(['ios', 'android'] as const)('edits DOB from an ISO timestamp and restores the device-local value on %s', async platform => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', {configurable: true, value: platform});
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    updateSessionUser({dateOfBirth: '1990-05-12T00:00:00.000Z'});
    renderer = await openAccountForEditing();
    await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Date of Birth'}).props.onPress());
    expect(renderer.root.findByProps({accessibilityLabel: 'Date of Birth input'}).props.value).toBe('1990-05-12');
    await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Date of Birth input'}).props.onChangeText('20240231'));
    expect(renderer.root.findByProps({accessibilityLabel: 'Save Date of Birth'}).props.disabled).toBe(true);
    await ReactTestRenderer.act(async () => renderer!.root.findByProps({accessibilityLabel: 'Date of Birth input'}).props.onChangeText('19960615'));
    await ReactTestRenderer.act(async () => { await renderer!.root.findByProps({accessibilityLabel: 'Save Date of Birth'}).props.onPress(); });
    expect(getSession()?.user?.dateOfBirth).toBe('1996-06-15');
    expect(updateProfile).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => renderer!.unmount());
    updateSessionUser({dateOfBirth: undefined});
    renderer = await openAccountForEditing();
    expect(renderer.root.findByProps({children: '15 June 1996'})).toBeDefined();
  } finally {
    if (renderer) { await ReactTestRenderer.act(async () => renderer!.unmount()); }
    Object.defineProperty(Platform, 'OS', {configurable: true, value: original});
  }
});

test('keeps the previous phone when the backend rejects a duplicate number', async () => {
  const renderer = await openAccountForEditing();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Phone Number'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Phone number input'}).props.onChangeText('9876543210'));
  jest.mocked(updateProfile).mockRejectedValueOnce(new Error('Phone already in use'));
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Save Phone Number'}).props.onPress(); });
  expect(getSession()?.user?.phone).toBe('+91 963 635 6512');
  expect(renderer.root.findAllByProps({children: 'Phone already in use'}).length).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('opens the Change your email screen from Account and requires an email before enabling OTP', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, right: 0, bottom: 24, left: 0 },
        }}
      >
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Account' })
      .props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({ accessibilityLabel: 'Change email' }).props.onPress();
  });

  const sendOtp = renderer!.root.findByProps({
    accessibilityLabel: 'Send OTP',
  });
  expect(
    renderer!.root.findByProps({ children: 'Change your email' }),
  ).toBeTruthy();
  expect(sendOtp.props.disabled).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'New email address' })
      .props.onChangeText('new@example.com');
  });
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Send OTP' }).props
      .disabled,
  ).toBe(false);
});

test('verifies the OTP, returns to Account, and shows the updated email toast', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 24, right: 0, bottom: 24, left: 0 },
        }}
      >
        <SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Account' })
      .props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({ accessibilityLabel: 'Change email' }).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'New email address' })
      .props.onChangeText('new@example.com');
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Send OTP' })
      .props.onPress();
  });

  expect(
    renderer!.root.findAllByProps({ children: 'Verify OTP' }).length,
  ).toBeGreaterThan(0);
  expect(
    renderer!.root.findByProps({ children: 'new@example.com' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Verify OTP' }).props
      .disabled,
  ).toBe(true);

  for (let index = 1; index <= 6; index += 1) {
    await ReactTestRenderer.act(async () => {
      renderer!.root
        .findByProps({ accessibilityLabel: `OTP digit ${index}` })
        .props.onChangeText(String(index));
    });
  }
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Verify OTP' }).props
      .disabled,
  ).toBe(false);

  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Verify OTP' })
      .props.onPress();
  });
  expect(sendEmailOtp).toHaveBeenCalledWith('new@example.com');
  expect(verifyEmailOtp).toHaveBeenCalledWith('new@example.com', '123456');
  expect(updateProfile).toHaveBeenCalledWith('jwt-token', {
    email: 'new@example.com',
  });
  expect(
    renderer!.root.findByProps({ children: 'new@example.com' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ children: 'Email Updated Successfully' }),
  ).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});
