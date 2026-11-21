import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NotificationControlsScreen} from '../src/screens/NotificationControlsScreen';
import {DEFAULT_NOTIFICATION_SETTINGS, getNotificationSettings, loadStoredNotificationSettings, storeNotificationSettings, updateNotificationSettings} from '../src/services/notificationPreferencesApi';
import {playNotificationTonePreview as playNotificationTone} from '../src/services/callRingtone';
import {vibrateNotification} from '../src/services/notificationVibration';

jest.mock('../src/services/callRingtone', () => ({playNotificationTonePreview: jest.fn()}));
jest.mock('../src/services/notificationVibration', () => ({vibrateNotification: jest.fn()}));

jest.mock('../src/services/notificationPreferencesApi', () => ({
  DEFAULT_NOTIFICATION_SETTINGS: {notifications: true, messageNotifications: true, groupNotifications: true, callNotifications: true, soundEnabled: true, notificationTone: 'Default', vibrationEnabled: true, popupPreview: true, messageReactions: true, sentMessageSound: true, groupReactions: true, groupSentMessageSound: true, callRingtone: true, messageVibration: 'Turned Off', groupVibration: 'Turned Off', callVibration: 'Turned Off'},
  NOTIFICATION_TONES: ['Default', 'Chime', 'Bell', 'Pop'],
  getNotificationSettings: jest.fn(),
  loadStoredNotificationSettings: jest.fn(),
  normalizeNotificationSettings: (value: unknown) => value,
  storeNotificationSettings: jest.fn().mockResolvedValue(undefined),
  updateNotificationSettings: jest.fn(),
}));

const metrics = {frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue(DEFAULT_NOTIFICATION_SETTINGS);
  jest.mocked(getNotificationSettings).mockResolvedValue(DEFAULT_NOTIFICATION_SETTINGS);
  jest.mocked(updateNotificationSettings).mockImplementation(async settings => settings);
});

test('Incoming Call Notifications applies locally when switched off and on, and Save syncs the choice', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><NotificationControlsScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Calls'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Incoming Call Notifications'}).props.onPress(); });
  expect(storeNotificationSettings).toHaveBeenLastCalledWith(expect.objectContaining({callNotifications: false}));
  expect(updateNotificationSettings).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Save Settings'}).props.onPress(); });
  expect(updateNotificationSettings).toHaveBeenLastCalledWith(expect.objectContaining({callNotifications: false}));
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Incoming Call Notifications'}).props.onPress(); });
  expect(storeNotificationSettings).toHaveBeenLastCalledWith(expect.objectContaining({callNotifications: true}));
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('loads settings, enforces one valid notification tone, and saves the chosen settings', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><NotificationControlsScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  await ReactTestRenderer.act(async () => Promise.resolve());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Messages'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Notification Sound'}).props.onPress());

  const toneOptions = renderer.root.findAll(node => node.props?.accessibilityRole === 'radio' && ['Default', 'Chime', 'Bell', 'Pop'].includes(node.props?.accessibilityLabel));
  expect([...new Set(toneOptions.map(option => option.props.accessibilityLabel))]).toEqual(['Default', 'Chime', 'Bell', 'Pop']);
  expect([...new Set(toneOptions.filter(option => option.props.accessibilityState?.checked).map(option => option.props.accessibilityLabel))]).toEqual(['Default']);

  const chimeOptions = renderer.root.findAll(node => node.props?.accessibilityRole === 'radio' && node.props?.accessibilityLabel === 'Chime' && typeof node.props?.onPress === 'function');
  await ReactTestRenderer.act(async () => chimeOptions[0].props.onPress());
  expect(playNotificationTone).toHaveBeenCalledWith('Chime');
  // Delivery reads this local choice even before the account Save completes.
  expect(storeNotificationSettings).toHaveBeenCalledWith(expect.objectContaining({notificationTone: 'Chime'}));
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Save Settings'}).props.onPress());
  expect(updateNotificationSettings).toHaveBeenCalledWith(expect.objectContaining({notificationTone: 'Chime'}));

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('exposes central notification settings and a save action', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><NotificationControlsScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  await ReactTestRenderer.act(async () => Promise.resolve());
  expect(renderer.root.findByProps({accessibilityLabel: 'All Notifications'}).props.accessibilityState.checked).toBe(true);
  expect(renderer.root.findByProps({accessibilityLabel: 'Popup preview'}).props.accessibilityState.checked).toBe(true);
  expect(renderer.root.findByProps({accessibilityLabel: 'Save Settings'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('turning off popup preview takes effect locally immediately and saves the disabled value', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><NotificationControlsScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  await ReactTestRenderer.act(async () => Promise.resolve());

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Popup preview'}).props.onPress());

  expect(renderer.root.findByProps({accessibilityLabel: 'Popup preview'}).props.accessibilityState.checked).toBe(false);
  expect(storeNotificationSettings).toHaveBeenCalledWith(expect.objectContaining({popupPreview: false}));
  expect(updateNotificationSettings).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Save Settings'}).props.onPress());
  expect(updateNotificationSettings).toHaveBeenCalledWith(expect.objectContaining({popupPreview: false}));
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('a late account response cannot turn popup preview back on after the user disables it', async () => {
  let resolveRemote!: (settings: typeof DEFAULT_NOTIFICATION_SETTINGS) => void;
  jest.mocked(getNotificationSettings).mockImplementationOnce(() => new Promise(resolve => { resolveRemote = resolve; }));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><NotificationControlsScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  await ReactTestRenderer.act(async () => Promise.resolve());

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Popup preview'}).props.onPress());
  await ReactTestRenderer.act(async () => resolveRemote(DEFAULT_NOTIFICATION_SETTINGS));

  expect(renderer.root.findByProps({accessibilityLabel: 'Popup preview'}).props.accessibilityState.checked).toBe(false);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('previews the selected vibration mode', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><NotificationControlsScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  await ReactTestRenderer.act(async () => Promise.resolve());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Messages'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Vibrate'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Medium'}).props.onPress());
  expect(vibrateNotification).toHaveBeenCalledWith('Medium');
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test.each(['Short', 'Medium', 'Long'] as const)('applies the %s message vibration locally and saves it with sound disabled', async mode => {
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, vibrationEnabled: false, soundEnabled: false});
  jest.mocked(getNotificationSettings).mockResolvedValue({...DEFAULT_NOTIFICATION_SETTINGS, vibrationEnabled: false, soundEnabled: false});
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><NotificationControlsScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  try {
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Messages'}).props.onPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Vibrate'}).props.onPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: mode}).props.onPress());
    expect(vibrateNotification).toHaveBeenCalledWith(mode);
    expect(storeNotificationSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      messageVibration: mode, vibrationEnabled: true, soundEnabled: false,
    }));
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Save Settings'}).props.onPress());
    expect(updateNotificationSettings).toHaveBeenCalledWith(expect.objectContaining({
      messageVibration: mode, vibrationEnabled: true, soundEnabled: false,
    }));
  } finally {
    await ReactTestRenderer.act(async () => renderer.unmount());
  }
});

test.each(['Groups', 'Calls'])('turning off %s vibration keeps enabled message vibration working', async category => {
  const initial = {...DEFAULT_NOTIFICATION_SETTINGS, messageVibration: 'Medium' as const,
    groupVibration: 'Short' as const, callVibration: 'Long' as const};
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue(initial);
  jest.mocked(getNotificationSettings).mockResolvedValue(initial);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><NotificationControlsScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  try {
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: category}).props.onPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Vibrate'}).props.onPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Turned Off'}).props.onPress());
    expect(storeNotificationSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      messageVibration: 'Medium', vibrationEnabled: true,
      [category === 'Groups' ? 'groupVibration' : 'callVibration']: 'Turned Off',
    }));
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Save Settings'}).props.onPress());
    expect(updateNotificationSettings).toHaveBeenCalledWith(expect.objectContaining({
      messageVibration: 'Medium', vibrationEnabled: true,
    }));
  } finally {
    await ReactTestRenderer.act(async () => renderer.unmount());
  }
});

test('turning off the last selected vibration pattern disables vibration', async () => {
  const initial = {...DEFAULT_NOTIFICATION_SETTINGS, messageVibration: 'Medium' as const};
  jest.mocked(loadStoredNotificationSettings).mockResolvedValue(initial);
  jest.mocked(getNotificationSettings).mockResolvedValue(initial);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><NotificationControlsScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  try {
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Messages'}).props.onPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Vibrate'}).props.onPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Turned Off'}).props.onPress());
    expect(storeNotificationSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      messageVibration: 'Turned Off', vibrationEnabled: false,
    }));
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Save Settings'}).props.onPress());
    expect(updateNotificationSettings).toHaveBeenCalledWith(expect.objectContaining({vibrationEnabled: false}));
  } finally {
    await ReactTestRenderer.act(async () => renderer.unmount());
  }
});

test.each(['Default', 'Chime', 'Bell', 'Pop'] as const)('previews %s from the Group Notification Sound picker', async tone => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><NotificationControlsScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  await ReactTestRenderer.act(async () => Promise.resolve());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Groups'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Group Notification Sound'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: tone}).props.onPress());
  expect(playNotificationTone).toHaveBeenCalledWith(tone);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Save Settings'}).props.onPress());
  expect(updateNotificationSettings).toHaveBeenCalledWith(expect.objectContaining({notificationTone: tone}));
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('search filters titles and descriptions, handles no matches, and restores all settings when cleared', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}><NotificationControlsScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  const search = async (query: string) => {
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Search Notifications'}).props.onChangeText(query));
  };
  const has = (label: string) => renderer.root.findAllByProps({accessibilityLabel: label}).length > 0;

  await search('  GrOuPs  ');
  expect(has('Groups')).toBe(true);
  expect(has('Messages')).toBe(false);
  expect(has('Calls')).toBe(false);
  expect(has('All Notifications')).toBe(false);
  expect(has('Popup preview')).toBe(false);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Groups'}).props.onPress());
  expect(has('Group Notification Sound')).toBe(true);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Back'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Search Notifications'}).props.value).toBe('  GrOuPs  ');

  await search('pause');
  expect(has('All Notifications')).toBe(true);
  expect(has('Groups')).toBe(false);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'All Notifications'}).props.onPress());
  await search('preview');
  expect(has('Popup preview')).toBe(true);
  expect(has('All Notifications')).toBe(false);
  await search('no-such-setting');
  expect(JSON.stringify(renderer.toJSON())).toContain('No matching notification settings.');
  expect(has('Popup preview')).toBe(false);
  await search('   ');
  for (const label of ['Messages', 'Groups', 'Calls', 'All Notifications', 'Popup preview']) {
    expect(has(label)).toBe(true);
  }
  expect(renderer.root.findByProps({accessibilityLabel: 'All Notifications'}).props.accessibilityState.checked).toBe(false);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Save Settings'}).props.onPress());
  expect(updateNotificationSettings).toHaveBeenCalledWith(expect.objectContaining({notifications: false}));
  await ReactTestRenderer.act(async () => renderer.unmount());
});
