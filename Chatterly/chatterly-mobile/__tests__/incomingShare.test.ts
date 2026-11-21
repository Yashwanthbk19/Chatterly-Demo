import {AppState, Image, Linking} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import {prepareIncomingMedia, startIncomingShareLifecycle} from '../src/services/incomingShare';
import type {ResolvedSharePayload, SharePayload} from 'expo-sharing';

let payloads: SharePayload[];
let onLink: (event: {url: string}) => void;
let onState: (state: string) => void;
const photo = (value: string): SharePayload => ({value, mimeType: 'image/jpeg', shareType: 'image'});
const details = (value: string, originalName = 'photo.jpg'): ResolvedSharePayload => ({
  ...photo(value), contentUri: 'file:///cache/photo.jpg', contentType: 'image',
  contentMimeType: 'image/jpeg', originalName, contentSize: 100,
});
const flush = async () => { for (let index = 0; index < 30; index++) { await Promise.resolve(); } };

beforeEach(() => {
  jest.clearAllMocks();
  payloads = [];
  jest.spyOn(Image, 'getSize').mockImplementation(() => Promise.resolve({width: 2400, height: 1800}));
  jest.spyOn(Linking, 'addEventListener').mockImplementation((_event, listener) => {
    onLink = listener;
    // The lifecycle only needs removal, rather than legacy emitter internals.
    return {remove: jest.fn()} as unknown as ReturnType<typeof Linking.addEventListener>;
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    onState = listener as typeof onState;
    return {remove: jest.fn()};
  });
  jest.mocked(Sharing.getSharedPayloads).mockImplementation(() => payloads);
  jest.mocked(Sharing.getResolvedSharedPayloadsAsync).mockImplementation(async () => payloads.map(item => details(item.value)));
  jest.mocked(Sharing.clearSharedPayloads).mockImplementation(() => { payloads = []; });
});
afterEach(() => jest.restoreAllMocks());

test('copies original gallery URLs separately when images have the same filename', async () => {
  const raw = [photo('content://gallery/one'), photo('content://gallery/two')];
  const share = await prepareIncomingMedia(raw, raw.map(item => details(item.value)));
  expect(share.media).toHaveLength(2);
  const copies = jest.mocked(FileSystem.copyAsync).mock.calls.map(([copy]) => copy);
  expect(copies.map(copy => copy.from)).toEqual(raw.map(item => item.value));
  expect(copies[0].to).not.toBe(copies[1].to);
  expect(share.media.every(media => media.width === 2400 && media.height === 1800)).toBe(true);
});

test('preserves a shared GIF MIME type and name', async () => {
  const item: SharePayload = {value: 'file:///app-group/dance.gif', shareType: 'image', mimeType: 'image/gif'};
  const share = await prepareIncomingMedia([item], [{...details(item.value, 'dance.gif'), contentMimeType: 'image/gif'}]);
  expect(share.media[0]).toEqual(expect.objectContaining({fileName: 'dance.gif', mimeType: 'image/gif', type: 'image'}));
});

test('rejects unsupported content and oversized selections before sharing', async () => {
  await expect(prepareIncomingMedia([{value: 'https://example.com/photo', shareType: 'url'}], []))
    .rejects.toThrow('gallery');
  await expect(prepareIncomingMedia(Array.from({length: 11}, () => photo('content://gallery/one')), []))
    .rejects.toThrow('10');
});

test('receives a cold-start share once and subsequent foreground shares through Linking', async () => {
  payloads = [photo('content://gallery/one')];
  const receive = jest.fn();
  const error = jest.fn();
  const cleanup = startIncomingShareLifecycle(receive, error);
  await flush();
  expect(receive).toHaveBeenCalledTimes(1);
  onState('active');
  await flush();
  expect(receive).toHaveBeenCalledTimes(1);
  payloads = [photo('content://gallery/two')];
  onLink({url: 'chatterly://expo-sharing'});
  await flush();
  expect(receive).toHaveBeenCalledTimes(2);
  expect(error).not.toHaveBeenCalled();
  cleanup();
  payloads = [photo('content://gallery/three')];
  onLink({url: 'chatterly://expo-sharing'});
  await flush();
  expect(receive).toHaveBeenCalledTimes(2);
});

test('a slow earlier share cannot clear or replace a newer selection', async () => {
  payloads = [photo('content://gallery/old')];
  let finish!: (result: ResolvedSharePayload[]) => void;
  jest.mocked(Sharing.getResolvedSharedPayloadsAsync).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const receive = jest.fn();
  const cleanup = startIncomingShareLifecycle(receive, jest.fn());
  payloads = [photo('content://gallery/new')];
  onLink({url: 'chatterly://expo-sharing'});
  finish([details('content://gallery/old', 'old.jpg')]);
  await flush();
  expect(receive).toHaveBeenCalledTimes(1);
  expect(jest.mocked(FileSystem.copyAsync).mock.calls.at(-1)?.[0].from).toBe('content://gallery/new');
  expect(Sharing.clearSharedPayloads).toHaveBeenCalledTimes(1);
  cleanup();
});
