import {AppState, Image, Linking} from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import type {ResolvedSharePayload, SharePayload} from 'expo-sharing';
import type {AttachmentMedia} from '../types/media';

export type IncomingMediaShare = {id: string; media: AttachmentMedia[]};
let shareCounter = 0;
const mimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm',
};

/** Copy granted/gallery URLs before their temporary permission can expire. */
export async function prepareIncomingMedia(
  raw: SharePayload[], resolved: ResolvedSharePayload[],
): Promise<IncomingMediaShare> {
  if (raw.length > 10) { throw new Error('Share up to 10 photos or videos at a time.'); }
  if (!FileSystem.cacheDirectory) { throw new Error('Unable to prepare shared media on this device.'); }
  const id = `share-${Date.now()}-${++shareCounter}`;
  const media: AttachmentMedia[] = [];
  for (let index = 0; index < raw.length; index++) {
    const item = raw[index];
    const details = resolved[index];
    const source = item.value;
    if (!/^(?:file|content):\/\//i.test(source)) {
      throw new Error('Please share photos or videos from your gallery.');
    }
    let fileName = details?.originalName || source.split(/[?#]/)[0].split('/').filter(Boolean).pop() || 'media';
    try { fileName = decodeURIComponent(fileName); } catch { /* Keep a provider's literal file name. */ }
    fileName = fileName.split(/[\\/]/).pop() || 'media';
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const providedMime = (details?.contentMimeType || item.mimeType || '').split(';')[0].toLowerCase();
    const mimeType = providedMime.includes('*') || !providedMime || providedMime === 'application/octet-stream'
      ? mimeByExtension[extension] || '' : providedMime;
    const type = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : null;
    if (!type) { throw new Error('Please share photos or videos from your gallery.'); }
    if (!fileName.includes('.')) {
      fileName += `.${Object.keys(mimeByExtension).find(key => mimeByExtension[key] === mimeType) || (type === 'image' ? 'jpg' : 'mp4')}`;
    }
    // The original URI avoids the resolver's cache-name collisions when two
    // gallery items have the same name. Each copy has its own stable path.
    const uri = `${FileSystem.cacheDirectory}${id}-${index}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await FileSystem.copyAsync({from: source, to: uri});
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) { throw new Error('Unable to read the shared media. Please share it again.'); }
    let dimensions: {width: number; height: number} | undefined;
    if (type === 'image') {
      try { dimensions = await Image.getSize(uri); } catch { /* The encoder can still read the file. */ }
    }
    media.push({id: `${id}-${index}`, uri, fileName, mimeType, type, ...dimensions});
  }
  return {id, media};
}

/** Receive both launch shares and subsequent shares while the app is open. */
export function startIncomingShareLifecycle(
  onReceive: (share: IncomingMediaShare) => void,
  onError: (message: string) => void,
): () => void {
  if (Constants.appOwnership === 'expo') { return () => undefined; }
  let sharing: typeof import('expo-sharing');
  try { sharing = require('expo-sharing'); } catch { return () => undefined; }
  if (typeof sharing.getSharedPayloads !== 'function' || typeof sharing.getResolvedSharedPayloadsAsync !== 'function') {
    return () => undefined;
  }
  let disposed = false;
  let resolving = false;
  let queued = false;
  const keyFor = (items: SharePayload[]) => JSON.stringify(items.map(item => [item.value, item.mimeType, item.shareType]));
  const refresh = async () => {
    if (disposed) { return; }
    if (resolving) { queued = true; return; }
    resolving = true;
    try {
      const raw = sharing.getSharedPayloads();
      if (!raw.length) { return; }
      const key = keyFor(raw);
      const resolved = await sharing.getResolvedSharedPayloadsAsync();
      const share = await prepareIncomingMedia(raw, resolved);
      if (disposed) { return; }
      // A newer share must not be cleared or replaced by a slower old one.
      if (keyFor(sharing.getSharedPayloads()) !== key) { queued = true; return; }
      onReceive(share);
      sharing.clearSharedPayloads();
    } catch (error) {
      if (!disposed) { onError(error instanceof Error ? error.message : 'Unable to open shared media.'); }
    } finally {
      resolving = false;
      if (queued && !disposed) { queued = false; refresh().catch(() => undefined); }
    }
  };
  const link = Linking.addEventListener('url', event => {
    if (/^chatterly:\/\/expo-sharing(?:[/?#]|$)/i.test(event.url)) { refresh().catch(() => undefined); }
  });
  const state = AppState.addEventListener('change', next => {
    if (next === 'active') { refresh().catch(() => undefined); }
  });
  refresh().catch(() => undefined);
  return () => { disposed = true; link.remove(); state.remove(); };
}
