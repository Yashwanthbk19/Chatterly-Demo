import {File} from 'expo-file-system';
import {downloadedFileFor, markMediaDownloaded, startAutoDownloadReceiving, startAutoDownloadTracking} from '../src/services/autoDownload';
import {DEFAULT_AUTO_DOWNLOAD_SETTINGS, updateAutoDownloadSettings, type AutoDownloadSettings} from '../src/services/mediaPreferencesApi';
import {apiRequest} from '../src/api/client';
import {getMediaDownloadUrl} from '../src/services/chatApi';
import type {ChatMessage} from '../src/types/chat';

let mockReceive: ((message: ChatMessage, group: boolean) => void) | undefined;
const mockStop = jest.fn();
let mockNetwork: (state: {type: string; isConnected: boolean; isInternetReachable?: boolean}) => void;
jest.mock('../src/services/chatRealtime', () => ({
  subscribeToLiveMessages: jest.fn((listener: typeof mockReceive) => {
    mockReceive = listener;
    return () => { mockReceive = undefined; mockStop(); };
  }),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({type: 'wifi', isConnected: true})),
    addEventListener: jest.fn(listener => { mockNetwork = listener; return jest.fn(); }),
  },
}));
jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: 'me'}}), getToken: () => 'jwt'}));
jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));
jest.mock('../src/services/chatApi', () => ({getMediaDownloadUrl: jest.fn()}));

const download = jest.mocked(File.downloadFileAsync);
const off = {photos: false, videos: false, audio: false, documents: false};
let stop: (() => void) | undefined;
let sequence = 0;
const message = (messageType: ChatMessage['messageType'] = 'image'): ChatMessage => ({
  id: `received-${++sequence}`, messageType, mediaUrl: `https://cdn.example/media-${sequence}`,
  text: '', isOwn: false, createdAt: '2026-11-12T10:00:00Z',
});
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const saveSettings = (settings: AutoDownloadSettings) => updateAutoDownloadSettings(settings);

beforeEach(async () => {
  jest.clearAllMocks();
  download.mockReset().mockImplementation(async (_url, destination) => destination as File);
  jest.mocked(apiRequest).mockImplementation(async (_url, options) => ({json: async () => ({success: true, data: JSON.parse(String(options?.body || '{}'))})}) as Response);
  startAutoDownloadTracking();
  await flush();
  mockNetwork({type: 'wifi', isConnected: true});
  await saveSettings(DEFAULT_AUTO_DOWNLOAD_SETTINGS);
  stop = startAutoDownloadReceiving();
});
afterEach(() => { stop?.(); stop = undefined; });

test.each([false, true])('downloads all enabled live media without opening a chat (group=%s)', async group => {
  const received = ['image', 'video', 'audio', 'file'].map(type => message(type as ChatMessage['messageType']));
  received.forEach(item => mockReceive!(item, group));
  await flush();
  expect(download).toHaveBeenCalledTimes(4);
  received.forEach(item => expect(downloadedFileFor(item.id)).toContain(`chatterly-${item.id}`));
});

test('uses the current network and per-media switches, then downloads waiting media on Wi-Fi', async () => {
  await saveSettings({mobileData: {photos: true, videos: false, audio: true, documents: false}, wifi: {photos: false, videos: true, audio: false, documents: true}, roaming: {allMedia: false}});
  mockNetwork({type: 'cellular', isConnected: true});
  const received = ['image', 'video', 'audio', 'file'].map(type => message(type as ChatMessage['messageType']));
  received.forEach(item => mockReceive!(item, false));
  await flush();
  expect(download.mock.calls.map(args => args[0])).toEqual([received[0].mediaUrl, received[2].mediaUrl]);
  mockNetwork({type: 'wifi', isConnected: true});
  await flush();
  expect(download).toHaveBeenCalledTimes(4);
  received.forEach(item => expect(downloadedFileFor(item.id)).not.toBe(''));
});

test('queues offline receipts and retries them on reconnection to the same network', async () => {
  mockNetwork({type: 'wifi', isConnected: false});
  const received = message('file');
  mockReceive!(received, false);
  await flush();
  expect(download).not.toHaveBeenCalled();
  mockNetwork({type: 'wifi', isConnected: true});
  await flush();
  expect(download).toHaveBeenCalledTimes(1);
  expect(downloadedFileFor(received.id)).not.toBe('');
});

test('retries a failed transfer after reconnecting and refreshes private download links', async () => {
  download.mockRejectedValueOnce(new Error('Offline'));
  jest.mocked(getMediaDownloadUrl).mockRejectedValueOnce(new Error('Offline'));
  const received = message('video');
  mockReceive!(received, false);
  await flush();
  expect(getMediaDownloadUrl).toHaveBeenCalledWith(received.id);
  expect(downloadedFileFor(received.id)).toBe('');
  mockNetwork({type: 'wifi', isConnected: false});
  mockNetwork({type: 'wifi', isConnected: true});
  await flush();
  expect(download).toHaveBeenCalledTimes(2);
  expect(downloadedFileFor(received.id)).not.toBe('');
});

test('enabling a media type starts queued downloads and a marker without a file does not block them', async () => {
  await saveSettings({...DEFAULT_AUTO_DOWNLOAD_SETTINGS, wifi: off});
  const received = message('audio');
  markMediaDownloaded(received.id);
  mockReceive!(received, false);
  await flush();
  expect(download).not.toHaveBeenCalled();
  await saveSettings({...DEFAULT_AUTO_DOWNLOAD_SETTINGS, wifi: {...off, audio: true}});
  await flush();
  expect(download).toHaveBeenCalledTimes(1);
  expect(downloadedFileFor(received.id)).not.toBe('');
});

test('duplicate receipts share one native download and stopping clears pending work', async () => {
  const received = message();
  mockReceive!(received, false);
  mockReceive!(received, false);
  await flush();
  expect(download).toHaveBeenCalledTimes(1);
  mockNetwork({type: 'wifi', isConnected: false});
  mockReceive!(message('file'), false);
  stop!(); stop = undefined;
  mockNetwork({type: 'wifi', isConnected: true});
  await flush();
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(download).toHaveBeenCalledTimes(1);
});
