import NetInfo from '@react-native-community/netinfo';
import {File} from 'expo-file-system';
import {startAutoDownloadReceiving, downloadedFileFor} from '../src/services/autoDownload';
import {DEFAULT_AUTO_DOWNLOAD_SETTINGS, loadStoredAutoDownloadSettings, updateAutoDownloadSettings, type AutoDownloadSettings} from '../src/services/mediaPreferencesApi';
import {apiRequest} from '../src/api/client';
import type {ChatMessage} from '../src/types/chat';

let mockReceive: (message: ChatMessage) => void;
let mockNetwork: (state: {type: string; isConnected: boolean}) => void;
jest.mock('../src/services/chatRealtime', () => ({subscribeToLiveMessages: jest.fn(listener => { mockReceive = listener; return jest.fn(); })}));
jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: 'startup-user'}}), getToken: () => 'jwt'}));
jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));
jest.mock('../src/services/chatApi', () => ({getMediaDownloadUrl: jest.fn()}));
jest.mock('../src/services/mediaPreferencesApi', () => ({...jest.requireActual('../src/services/mediaPreferencesApi'), loadStoredAutoDownloadSettings: jest.fn()}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {fetch: jest.fn(), addEventListener: jest.fn(listener => { mockNetwork = listener; return jest.fn(); })},
}));
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test('waits for settings and network, and ignores stale startup reads after newer changes', async () => {
  let resolveSettings!: (settings: AutoDownloadSettings) => void;
  let resolveNetwork!: (state: {type: string; isConnected: boolean}) => void;
  jest.mocked(loadStoredAutoDownloadSettings).mockImplementationOnce(() => new Promise(resolve => { resolveSettings = resolve; }));
  jest.mocked(NetInfo.fetch).mockImplementationOnce(() => new Promise(resolve => { resolveNetwork = resolve as typeof resolveNetwork; }));
  jest.mocked(apiRequest).mockResolvedValue({json: async () => ({success: true, data: {mobileData: false, wifi: true, roaming: false}})} as Response);
  const stop = startAutoDownloadReceiving();
  try {
    const received: ChatMessage = {id: 'startup-media', messageType: 'file', mediaUrl: 'https://cdn.example/report.pdf', text: '', isOwn: false, createdAt: '2026-11-12T10:00:00Z'};
    mockReceive(received);
    await flush();
    expect(File.downloadFileAsync).not.toHaveBeenCalled();

    await updateAutoDownloadSettings(DEFAULT_AUTO_DOWNLOAD_SETTINGS);
    await flush();
    expect(File.downloadFileAsync).not.toHaveBeenCalled();
    mockNetwork({type: 'cellular', isConnected: true});
    // The older Wi-Fi fetch must not override the current cellular event.
    resolveNetwork({type: 'wifi', isConnected: true});
    const off = {photos: false, videos: false, audio: false, documents: false};
    resolveSettings({mobileData: off, wifi: off, roaming: {allMedia: false}});
    await flush();
    expect(File.downloadFileAsync).not.toHaveBeenCalled();

    mockNetwork({type: 'wifi', isConnected: true});
    await flush();
    expect(File.downloadFileAsync).toHaveBeenCalledTimes(1);
    expect(downloadedFileFor(received.id)).toContain('chatterly-startup-media');
  } finally { stop(); }
});
