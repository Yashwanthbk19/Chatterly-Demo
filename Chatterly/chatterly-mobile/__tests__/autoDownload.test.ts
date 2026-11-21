import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import {act, create} from 'react-test-renderer';
import {DEFAULT_AUTO_DOWNLOAD_SETTINGS, type AutoDownloadSettings} from '../src/services/mediaPreferencesApi';
import {
  downloadedFileFor,
  markMediaDownloaded,
  mediaKindOf,
  networkFor,
  saveDocumentLocally,
  shouldAutoDownload,
  useAutoDownloadMessages,
  useMediaDownloadGate,
} from '../src/services/autoDownload';

jest.mock('../src/services/sessionStore', () => ({getSession: () => ({token: 'jwt', user: {id: 'me'}}), getToken: () => 'jwt'}));
jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));

const settings: AutoDownloadSettings = {
  mobileData: {photos: true, videos: false, audio: true, documents: false},
  wifi: {photos: true, videos: true, audio: true, documents: true},
  roaming: {allMedia: false},
};

beforeEach(async () => { await AsyncStorage.clear(); });

test.each(['image', 'video', 'audio', 'file'])('enabled %s downloads a durable copy without a tap', async messageType => {
  const {File} = require('expo-file-system');
  File.downloadFileAsync.mockClear();
  const id = `automatic-${messageType}`;
  function Media() {
    useMediaDownloadGate({id, messageType, mediaUrl: `https://cdn.example/${id}`});
    return null;
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Media)); });
  expect(File.downloadFileAsync).toHaveBeenCalledTimes(1);
  expect(downloadedFileFor(id)).toContain(`chatterly-${id}`);
  await act(async () => { renderer!.unmount(); });
});

test('all enabled media in a loaded thread download without mounting each bubble', async () => {
  const {File} = require('expo-file-system');
  File.downloadFileAsync.mockClear();
  const messages = ['image', 'video', 'audio', 'file'].map(messageType => ({
    id: `thread-${messageType}`,
    messageType,
    mediaUrl: `https://cdn.example/thread-${messageType}`,
  }));
  function Thread() {
    useAutoDownloadMessages(messages);
    return null;
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Thread)); });
  expect(File.downloadFileAsync).toHaveBeenCalledTimes(messages.length);
  messages.forEach(message =>
    expect(downloadedFileFor(message.id)).toContain(`chatterly-${message.id}`),
  );
  await act(async () => { renderer!.unmount(); });
});

test('each media type follows its own switch on the current network', () => {
  expect(shouldAutoDownload('image', settings, 'mobileData')).toBe(true);
  expect(shouldAutoDownload('video', settings, 'mobileData')).toBe(false);
  expect(shouldAutoDownload('file', settings, 'mobileData')).toBe(false);
  expect(shouldAutoDownload('video', settings, 'wifi')).toBe(true);
  // Roaming has one switch for everything.
  expect(shouldAutoDownload('image', settings, 'roaming')).toBe(false);
  // The shipped defaults hold everything back on mobile data.
  expect(shouldAutoDownload('image', DEFAULT_AUTO_DOWNLOAD_SETTINGS, 'mobileData')).toBe(false);
});

test('cellular uses the Mobile Data rules, anything else Wi-Fi, and offline keeps the last', () => {
  expect(networkFor({type: 'cellular', isConnected: true}, 'wifi')).toBe('mobileData');
  expect(networkFor({type: 'wifi', isConnected: true}, 'mobileData')).toBe('wifi');
  expect(networkFor({type: 'ethernet', isConnected: true}, 'mobileData')).toBe('wifi');
  expect(networkFor({type: 'none', isConnected: false}, 'mobileData')).toBe('mobileData');
});

test('only media message types are gated', () => {
  expect(mediaKindOf('image')).toBe('image');
  expect(mediaKindOf('file')).toBe('file');
  expect(mediaKindOf('text')).toBeNull();
  expect(mediaKindOf('location')).toBeNull();
});

test('a hand-downloaded item stays downloaded and remembers its file', () => {
  markMediaDownloaded('message-1');
  expect(downloadedFileFor('message-1')).toBe('');
  markMediaDownloaded('message-1', 'file:///documents/report.pdf');
  expect(downloadedFileFor('message-1')).toBe('file:///documents/report.pdf');
  // A later mark without a file keeps the one already saved.
  markMediaDownloaded('message-1');
  expect(downloadedFileFor('message-1')).toBe('file:///documents/report.pdf');
});

test('a document is saved once under its message id, even when asked twice at once', async () => {
  const {File} = require('expo-file-system');
  File.downloadFileAsync.mockClear();
  const message = {id: 'doc-7', mediaUrl: 'https://cdn.example/report.pdf', fileName: 'Q3 report.pdf'};
  const [first, second] = await Promise.all([saveDocumentLocally(message), saveDocumentLocally(message)]);
  expect(File.downloadFileAsync).toHaveBeenCalledTimes(1);
  expect(first).toBe(second);
  expect(first).toContain('chatterly-doc-7-Q3_report.pdf');
  expect(downloadedFileFor('doc-7')).toBe(first);
  // Already saved: no second download.
  await saveDocumentLocally(message);
  expect(File.downloadFileAsync).toHaveBeenCalledTimes(1);
});

test('a document uses the authenticated download URL and keeps the exact shared size', async () => {
  const {File} = require('expo-file-system');
  const downloaded = {uri: 'file:///documents/report.pdf', size: 4096, delete: jest.fn()};
  File.downloadFileAsync.mockResolvedValueOnce(downloaded);
  const resolveUrl = jest.fn(async () => 'https://signed.example/report.pdf');

  await expect(saveDocumentLocally({
    id: 'doc-size-match', fileName: 'report.pdf', mediaSize: 4096,
  }, resolveUrl)).resolves.toBe(downloaded.uri);

  expect(resolveUrl).toHaveBeenCalledWith('doc-size-match');
  expect(File.downloadFileAsync).toHaveBeenCalledWith(
    'https://signed.example/report.pdf', expect.anything(), expect.objectContaining({idempotent: true}),
  );
  expect(downloaded.delete).not.toHaveBeenCalled();
});

test('a document with a different downloaded size is rejected as incomplete', async () => {
  const {File} = require('expo-file-system');
  const downloaded = {uri: 'file:///documents/incomplete.pdf', size: 2048, delete: jest.fn()};
  File.downloadFileAsync.mockResolvedValueOnce(downloaded);

  await expect(saveDocumentLocally({
    id: 'doc-size-mismatch', mediaUrl: 'https://cdn.example/report.pdf',
    fileName: 'report.pdf', mediaSize: 4096,
  })).rejects.toThrow('downloaded file size does not match');

  expect(downloaded.delete).toHaveBeenCalledTimes(1);
  expect(downloadedFileFor('doc-size-mismatch')).toBe('');
});
