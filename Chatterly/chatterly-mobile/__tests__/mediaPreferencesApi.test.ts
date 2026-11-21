import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiRequest} from '../src/api/client';
import {API_BASE_URL} from '../src/config/api';
import {
  getAutoDownloadSettings,
  getDataUsageSettings,
  loadStoredAutoDownloadSettings,
  loadStoredDataUsageSettings,
  storageValueToBytes,
  updateAutoDownloadSettings,
  updateDataUsageSettings,
} from '../src/services/mediaPreferencesApi';

jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({getToken: () => 'jwt-token'}));

const respond = (payload: unknown) => ({json: jest.fn().mockResolvedValue(payload)}) as unknown as Response;

beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); });

test('loads and normalizes data usage from the documented preference endpoint', async () => {
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {mediaUploadQuality: 'High', storageUsed: '2.4 GB', cacheClearedAt: null}}));
  await expect(getDataUsageSettings()).resolves.toEqual({mediaUploadQuality: 'high', storageUsed: 2.4 * 1024 ** 3, cacheClearedAt: null});
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/preferences/data-usage`, expect.objectContaining({method: 'GET'}));
  await expect(loadStoredDataUsageSettings()).resolves.toEqual(expect.objectContaining({mediaUploadQuality: 'high'}));
  expect(storageValueToBytes('512 MB')).toBe(512 * 1024 ** 2);
});

test('updates upload quality using the API enum and string storage units', async () => {
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {mediaUploadQuality: 'low', storageUsed: 0}}));
  await expect(updateDataUsageSettings({mediaUploadQuality: 'low'})).resolves.toEqual(expect.objectContaining({mediaUploadQuality: 'low'}));
  expect(apiRequest).toHaveBeenCalledWith(`${API_BASE_URL}/preferences/data-usage`, expect.objectContaining({method: 'PUT', body: JSON.stringify({mediaUploadQuality: 'Low'})}));
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {mediaUploadQuality: 'High', storageUsed: '2.0 MB'}}));
  await updateDataUsageSettings({storageUsed: 2 * 1024 ** 2});
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/preferences/data-usage`, expect.objectContaining({method: 'PUT', body: JSON.stringify({storageUsed: '2097152'})}));
});

test('reads and updates per-network auto-download preferences', async () => {
  const settings = {mobileData: {photos: false, videos: true, audio: false, documents: false}, wifi: {photos: true, videos: true, audio: true, documents: true}, roaming: {allMedia: false}};
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: settings}));
  await expect(getAutoDownloadSettings()).resolves.toEqual(settings);
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/preferences/auto-download`, expect.objectContaining({method: 'GET'}));

  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {...settings, roaming: {allMedia: true}}}));
  await updateAutoDownloadSettings({...settings, roaming: {allMedia: true}});
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/preferences/auto-download`, expect.objectContaining({
    method: 'PUT',
    body: JSON.stringify({
      mobileData: true,
      wifi: true,
      roaming: true,
    }),
  }));
});

test('persists media selections locally while syncing documented network booleans', async () => {
  await AsyncStorage.setItem('chatterly.media-auto-download.v1', JSON.stringify({
    mobileData: {photos: false, videos: false, audio: true, documents: false},
    wifi: {photos: true, videos: true, audio: false, documents: true},
    roaming: {allMedia: false},
  }));
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {mobileData: false, wifi: true, roaming: false}}));
  await expect(getAutoDownloadSettings()).resolves.toEqual({
    mobileData: {photos: false, videos: false, audio: false, documents: false},
    wifi: {photos: true, videos: true, audio: false, documents: true},
    roaming: {allMedia: false},
  });
  const settings = {mobileData: {photos: false, videos: true, audio: false, documents: false}, wifi: {photos: true, videos: true, audio: true, documents: true}, roaming: {allMedia: true}};
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {mobileData: true, wifi: true, roaming: true}}));
  await updateAutoDownloadSettings(settings);
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/preferences/auto-download`, expect.objectContaining({
    method: 'PUT', body: JSON.stringify({mobileData: true, wifi: true, roaming: true}),
  }));
  await expect(loadStoredAutoDownloadSettings()).resolves.toEqual(settings);
});

test('a network the account has on is not overruled by a device copy with every type off', async () => {
  await AsyncStorage.setItem('chatterly.media-auto-download.v1', JSON.stringify({
    mobileData: {photos: false, videos: false, audio: false, documents: false},
    wifi: {photos: false, videos: false, audio: false, documents: false},
    roaming: {allMedia: false},
  }));
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {mobileData: false, wifi: true, roaming: false}}));
  await expect(getAutoDownloadSettings()).resolves.toEqual({
    mobileData: {photos: false, videos: false, audio: false, documents: false},
    wifi: {photos: true, videos: true, audio: true, documents: true},
    roaming: {allMedia: false},
  });
});

test('a slow account read cannot turn off media types enabled while it was in flight', async () => {
  let resolveRemote!: (value: Response) => void;
  jest.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { resolveRemote = resolve; }));
  const reading = getAutoDownloadSettings();
  // Let the cached settings and storage-presence reads finish before saving.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  const settings = {mobileData: {photos: true, videos: true, audio: true, documents: true}, wifi: {photos: true, videos: true, audio: true, documents: true}, roaming: {allMedia: false}};
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {mobileData: true, wifi: true, roaming: false}}));
  await updateAutoDownloadSettings(settings);
  resolveRemote(respond({success: true, data: {mobileData: false, wifi: false, roaming: false}}));
  await expect(reading).resolves.toEqual(settings);
  await expect(loadStoredAutoDownloadSettings()).resolves.toEqual(settings);
});

test('the server disabling Wi-Fi keeps all Wi-Fi media types off after saving', async () => {
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {mobileData: false, wifi: false, roaming: false}}));
  const saved = await updateAutoDownloadSettings({mobileData: {photos: false, videos: false, audio: false, documents: false}, wifi: {photos: true, videos: false, audio: false, documents: false}, roaming: {allMedia: false}});
  expect(saved.wifi).toEqual({photos: false, videos: false, audio: false, documents: false});
  await expect(loadStoredAutoDownloadSettings()).resolves.toEqual(saved);
});

test('a stale data-usage read does not replace newly measured storage', async () => {
  let resolveOld!: (response: Response) => void;
  jest.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const reading = getDataUsageSettings();
  jest.mocked(apiRequest).mockResolvedValue(respond({success: true, data: {storageUsed: 1234567}}));
  await updateDataUsageSettings({storageUsed: 1234567});
  resolveOld(respond({success: true, data: {storageUsed: 1024}}));
  await expect(reading).resolves.toEqual(expect.objectContaining({storageUsed: 1234567}));
  await expect(loadStoredDataUsageSettings()).resolves.toEqual(expect.objectContaining({storageUsed: 1234567}));
  expect(apiRequest).toHaveBeenLastCalledWith(`${API_BASE_URL}/preferences/data-usage`, expect.objectContaining({body: JSON.stringify({storageUsed: '1234567'})}));
});

test('a read started during a pending storage update cannot restore the previous server value', async () => {
  let resolvePut!: (response: Response) => void;
  let resolveGet!: (response: Response) => void;
  jest.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { resolvePut = resolve; }));
  const saving = updateDataUsageSettings({storageUsed: 4096});
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  jest.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { resolveGet = resolve; }));
  const reading = getDataUsageSettings();
  resolvePut(respond({success: true, data: {storageUsed: 4096}}));
  await saving;
  resolveGet(respond({success: true, data: {storageUsed: 1024}}));
  await expect(reading).resolves.toEqual(expect.objectContaining({storageUsed: 4096}));
  await expect(loadStoredDataUsageSettings()).resolves.toEqual(expect.objectContaining({storageUsed: 4096}));
});
