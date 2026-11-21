import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {AppState, Text, type AppStateStatus} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {MediaLinksScreen} from '../src/screens/MediaLinksScreen';
import {getAutoDownloadSettings, getDataUsageSettings, updateAutoDownloadSettings, updateDataUsageSettings} from '../src/services/mediaPreferencesApi';
import {clearTemporaryMediaCache, getDeviceStorageStatistics} from '../src/services/mediaStorage';
import {flushDataUsage, recordDataUsage} from '../src/services/dataUsage';

let mockOwner = '', sequence = 0;
jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: mockOwner}}), getToken: () => 'jwt'}));

jest.mock('../src/services/mediaPreferencesApi', () => {
  const actual = jest.requireActual('../src/services/mediaPreferencesApi');
  const data = {mediaUploadQuality: 'medium', storageUsed: 1.2 * 1024 ** 3, cacheClearedAt: null};
  const auto = actual.DEFAULT_AUTO_DOWNLOAD_SETTINGS;
  return {...actual, loadStoredDataUsageSettings: jest.fn(async () => data), loadStoredAutoDownloadSettings: jest.fn(async () => auto), getDataUsageSettings: jest.fn(async () => data), getAutoDownloadSettings: jest.fn(async () => auto), updateDataUsageSettings: jest.fn(async update => ({...data, ...update})), updateAutoDownloadSettings: jest.fn(async settings => settings)};
});
jest.mock('../src/services/mediaStorage', () => {
  const actual = jest.requireActual('../src/services/mediaStorage');
  return {...actual, getDeviceStorageStatistics: jest.fn(async () => ({capacity: 128 * 1024 ** 3, free: 32 * 1024 ** 3, used: 96 * 1024 ** 3, cache: 64 * 1024 ** 2})), clearTemporaryMediaCache: jest.fn(async () => undefined)};
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const renderScreen = async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}}}><MediaLinksScreen onBack={jest.fn()}/></SafeAreaProvider>); });
  mounted.push(renderer!);
  return renderer!;
};

beforeEach(() => { jest.clearAllMocks(); mockOwner = `usage-screen-${++sequence}`; });
afterEach(async () => {
  await ReactTestRenderer.act(async () => { mounted.splice(0).forEach(renderer => renderer.unmount()); });
  await flushDataUsage();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('follows the quality, auto-download, cache, and data-usage flows', async () => {
  const renderer = await renderScreen();
  expect(renderer.root.findByProps({children: 'Media & Links'})).toBeDefined();
  expect(getDataUsageSettings).toHaveBeenCalled();
  expect(getAutoDownloadSettings).toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Mobile Data'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Wi-Fi'})).toBeDefined();
  expect(renderer.root.findByProps({children: 'No media selected'})).toBeDefined();
  expect(renderer.root.findByProps({children: 'Photos, Videos, Audio, Documents'})).toBeDefined();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Media Upload quality'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Media Upload quality options'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'High'}).props.onPress());
  expect(updateDataUsageSettings).toHaveBeenCalledWith({mediaUploadQuality: 'high'});

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Mobile Data'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Media Auto-Download options'})).toBeDefined();
  expect(renderer.root.findByProps({children: 'Roaming'})).toBeDefined();
  expect(renderer.root.findByProps({children: 'All Media'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Auto-download while roaming'}).props.onPress());
  expect(updateAutoDownloadSettings).toHaveBeenCalledWith(expect.objectContaining({roaming: {allMedia: true}}));
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Photos on mobile data'}).props.onPress());
  expect(updateAutoDownloadSettings).toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Audio on mobile data'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Audio on Wi-Fi'})).toBeDefined();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Back to Media & Links'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Wi-Fi'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Media Auto-Download options'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Back to Media & Links'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Clear Cache'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Clear cache confirmation'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Confirm Clear Cache'}).props.onPress());
  expect(clearTemporaryMediaCache).toHaveBeenCalled();

  const readsBeforeDetail = jest.mocked(getDataUsageSettings).mock.calls.length;
  jest.mocked(getDataUsageSettings).mockResolvedValueOnce({mediaUploadQuality: 'medium', storageUsed: 2.5 * 1024 ** 3, cacheClearedAt: null});
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Data Usage'}).props.onPress());
  expect(getDataUsageSettings).toHaveBeenCalledTimes(readsBeforeDetail + 1);
  expect(renderer.root.findByProps({children: 'Data Usage'})).toBeDefined();
  expect(renderer.root.findByProps({children: '2.5 GB'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Reset Statistics'})).toBeDefined();
});

test('sent and received totals update live, and Reset Statistics clears the measured counters', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => {
    recordDataUsage('media', {sent: 1024, received: 2048});
    recordDataUsage('messages', {sent: 50, received: 100});
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('1.0 KB Sent');
  expect(JSON.stringify(renderer.toJSON())).toContain('2.1 KB Received');
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Data Usage'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Data sent'}).props.children).toBe('1.0 KB');
  expect(renderer.root.findByProps({accessibilityLabel: 'Data received'}).props.children).toBe('2.1 KB');
  await ReactTestRenderer.act(async () => { recordDataUsage('calls', {sent: 1024, received: 2048}); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Data sent'}).props.children).toBe('2.0 KB');
  expect(renderer.root.findByProps({accessibilityLabel: 'Data received'}).props.children).toBe('4.1 KB');
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Reset Statistics'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Data sent'}).props.children).toBe('0 B');
  expect(renderer.root.findByProps({accessibilityLabel: 'Data received'}).props.children).toBe('0 B');
  expect(renderer.root.findByProps({children: 'Usage statistics reset.'})).toBeDefined();
});

test('refreshes latest data and device storage when the application returns to the foreground', async () => {
  let foreground!: (state: AppStateStatus) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { foreground = listener; return {remove: jest.fn()}; });
  const renderer = await renderScreen();
  const callsBefore = jest.mocked(getDataUsageSettings).mock.calls.length;
  jest.mocked(getDataUsageSettings).mockResolvedValueOnce({mediaUploadQuality: 'medium', storageUsed: 3 * 1024 ** 3, cacheClearedAt: null});
  await ReactTestRenderer.act(async () => { foreground('active'); });
  expect(getDataUsageSettings).toHaveBeenCalledTimes(callsBefore + 1);
  expect(getDeviceStorageStatistics).toHaveBeenCalled();
  expect(renderer.root.findAllByType(Text).some(node => Array.isArray(node.props.children) && node.props.children.join('') === 'Chatterly (3.0 GB)')).toBe(true);
});

test('measured app storage replaces an outdated server value and syncs through the existing API', async () => {
  jest.mocked(getDeviceStorageStatistics).mockResolvedValueOnce({capacity: 128 * 1024 ** 3, free: 32 * 1024 ** 3, used: 96 * 1024 ** 3, cache: 1024, app: 4096});
  const renderer = await renderScreen();
  expect(updateDataUsageSettings).toHaveBeenCalledWith({storageUsed: 4096});
  expect(renderer.root.findAllByType(Text).some(node => Array.isArray(node.props.children) && node.props.children.join('') === 'Chatterly (4.0 KB)')).toBe(true);
});

test('updates while the usage screen stays open and pauses refreshes in the background', async () => {
  jest.useFakeTimers();
  let foreground!: (state: AppStateStatus) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { foreground = listener; return {remove: jest.fn()}; });
  await renderScreen();
  await ReactTestRenderer.act(async () => { foreground('active'); });
  const reads = jest.mocked(getDataUsageSettings).mock.calls.length;
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(15000); });
  expect(getDataUsageSettings).toHaveBeenCalledTimes(reads + 1);
  await ReactTestRenderer.act(async () => { foreground('background'); jest.advanceTimersByTime(30000); });
  expect(getDataUsageSettings).toHaveBeenCalledTimes(reads + 1);
});
