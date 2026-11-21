import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {File, Paths} from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import {requireOptionalNativeModule} from 'expo-modules-core';
import {useEffect, useSyncExternalStore} from 'react';
import {
  DEFAULT_AUTO_DOWNLOAD_SETTINGS,
  loadStoredAutoDownloadSettings,
  subscribeToAutoDownloadSettings,
  type AutoDownloadSettings,
  type DownloadMediaType,
} from './mediaPreferencesApi';
import {getSession} from './sessionStore';
import {downloadMediaFile} from './mediaDownload';
import {subscribeToLiveMessages} from './chatRealtime';
import {getMediaDownloadUrl} from './chatApi';

// Sprint 11 Story 5: Media Auto-Download. The choices made in Media & Links
// decide what a received photo, video, voice note or document does when it
// appears in a chat: load on its own, or wait behind a download button. This
// mirrors the web client's shouldAutoDownloadMediaType.
//
export type AutoDownloadNetwork = 'wifi' | 'mobileData' | 'roaming';
export type DownloadableMediaKind = 'image' | 'video' | 'audio' | 'file';
export type DownloadTransferState = {
  phase: 'downloading' | 'failed';
  kind: DownloadableMediaKind;
  progress: number | null;
  error?: string;
};
export type DownloadedMediaDetail = {
  uri: string;
  kind: DownloadableMediaKind;
  size: number;
  fileName: string;
  gallerySaved?: boolean;
};
export type DownloadedMediaSummary = {
  count: number;
  totalBytes: number;
  byType: Record<DownloadMediaType, number>;
};

const MEDIA_SETTING: Record<DownloadableMediaKind, DownloadMediaType> = {
  image: 'photos',
  video: 'videos',
  audio: 'audio',
  file: 'documents',
};

const DOWNLOADS_PREFIX = 'chatterly.media-downloads.v1';
const MAX_REMEMBERED_DOWNLOADS = 800;
const roamingNativeModule = requireOptionalNativeModule<{getIsRoaming: () => boolean | null}>('ChatterlyRoamingNetwork');

type Snapshot = {
  settings: AutoDownloadSettings;
  network: AutoDownloadNetwork;
  ready: boolean;
  connected: boolean;
  /** Media fetched by hand (or already saved), by message id, with any local file. */
  downloads: ReadonlyMap<string, string>;
  downloadDetails: ReadonlyMap<string, DownloadedMediaDetail>;
  transfers: ReadonlyMap<string, DownloadTransferState>;
  downloadedMedia: DownloadedMediaSummary;
};

let snapshot: Snapshot = {
  settings: DEFAULT_AUTO_DOWNLOAD_SETTINGS,
  network: 'wifi',
  ready: false,
  connected: false,
  downloads: new Map(),
  downloadDetails: new Map(),
  transfers: new Map(),
  downloadedMedia: {count: 0, totalBytes: 0, byType: {photos: 0, videos: 0, audio: 0, documents: 0}},
};
const listeners = new Set<() => void>();
let started = false;
let downloadsOwner: string | null = null;
let downloadsLoad: Promise<void> | null = null;
const clearedDownloads = new Set<string>();
let settingsLoaded = false;
let networkLoaded = false;
let downloadsLoaded = false;

function emit(next: Partial<Snapshot>): void {
  snapshot = {...snapshot, ...next, ready: settingsLoaded && networkLoaded && downloadsLoaded};
  listeners.forEach(listener => listener());
}

export function mediaKindOf(messageType: unknown): DownloadableMediaKind | null {
  const type = String(messageType || '').toLowerCase();
  return type === 'image' || type === 'video' || type === 'audio' || type === 'file' ? type : null;
}

/** Roaming and each media type have independent choices in all three networks. */
export function shouldAutoDownload(kind: DownloadableMediaKind, settings: AutoDownloadSettings, network: AutoDownloadNetwork): boolean {
  return Boolean(settings[network]?.[MEDIA_SETTING[kind]]);
}

/**
 * Which rules apply on a connection. Wi-Fi, ethernet and anything a device
 * cannot classify use the Wi-Fi choices; cellular uses Mobile Data. While
 * offline the last connection's rules stay in force, so the thread does not
 * flip every tile to a download button only to flip back on reconnect.
 */
export function networkFor(state: {type?: string | null; isConnected?: boolean | null; details?: {isRoaming?: boolean | null} | null}, previous: AutoDownloadNetwork): AutoDownloadNetwork {
  if (state.isConnected === false || state.type === 'none') { return previous; }
  if (state.type !== 'cellular') { return 'wifi'; }
  return state.details?.isRoaming ? 'roaming' : 'mobileData';
}

const downloadsKey = (owner: string) => `${DOWNLOADS_PREFIX}:${owner || 'anonymous'}`;
const downloadDetailsKey = (owner: string) => `chatterly.media-download-details.v1:${owner || 'anonymous'}`;
const clearedDownloadsKey = (owner: string) => `chatterly.media-downloads-cleared.v1:${owner || 'anonymous'}`;
const kindForSetting = (kind: DownloadableMediaKind): DownloadMediaType => MEDIA_SETTING[kind];

function summaryFor(details: ReadonlyMap<string, DownloadedMediaDetail>, count: number): DownloadedMediaSummary {
  const byType: Record<DownloadMediaType, number> = {photos: 0, videos: 0, audio: 0, documents: 0};
  details.forEach(detail => { byType[kindForSetting(detail.kind)] += Math.max(0, detail.size || 0); });
  return {count, totalBytes: Object.values(byType).reduce((sum, size) => sum + size, 0), byType};
}

function inferredKind(uri: string, mimeType: string): DownloadableMediaKind {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) { return 'image'; }
  if (mime.startsWith('video/')) { return 'video'; }
  if (mime.startsWith('audio/')) { return 'audio'; }
  const name = uri.split(/[/?#]/).pop()?.toLowerCase() || '';
  if (/\.(?:jpe?g|png|gif|webp|heic|avif)$/.test(name)) { return 'image'; }
  if (/\.(?:mp4|mov|m4v|webm|avi|mkv|3gp)$/.test(name)) { return 'video'; }
  if (/\.(?:mp3|m4a|aac|ogg|opus|wav|amr)$/.test(name)) { return 'audio'; }
  return 'file';
}

function mediaExtension(kind: DownloadableMediaKind, fileType: string, uri: string): string {
  const urlName = uri.split(/[/?#]/).pop() || '';
  const urlExtension = /\.([a-z\d]{2,5})$/i.exec(urlName)?.[1]?.toLowerCase();
  if (urlExtension) { return urlExtension; }
  const mime = fileType.toLowerCase();
  if (mime === 'image/png') { return 'png'; }
  if (mime === 'image/gif') { return 'gif'; }
  if (mime === 'image/webp') { return 'webp'; }
  if (mime === 'image/heic') { return 'heic'; }
  if (mime === 'video/quicktime') { return 'mov'; }
  if (mime === 'video/webm') { return 'webm'; }
  if (mime === 'audio/ogg') { return 'ogg'; }
  if (mime === 'audio/mp4') { return 'm4a'; }
  if (mime === 'audio/mpeg') { return 'mp3'; }
  if (mime === 'audio/wav' || mime === 'audio/x-wav') { return 'wav'; }
  if (kind === 'image') { return 'jpg'; }
  if (kind === 'video') { return 'mp4'; }
  if (kind === 'audio') { return 'm4a'; }
  return '';
}

function emitTransfer(id: string, state?: DownloadTransferState): void {
  const transfers = new Map(snapshot.transfers);
  if (state) { transfers.set(id, state); } else { transfers.delete(id); }
  emit({transfers});
}

function loadDownloads(): Promise<void> {
  const owner = String(getSession()?.user?.id || '');
  if (owner === downloadsOwner && downloadsLoad) { return downloadsLoad; }
  downloadsOwner = owner;
  downloadsLoaded = false;
  clearedDownloads.clear();
  emit({downloads: new Map(), downloadDetails: new Map(), downloadedMedia: summaryFor(new Map(), 0)});
  downloadsLoad = (async () => {
    try {
      const [storedValue, detailValue, clearedValue] = await Promise.all([
        AsyncStorage.getItem(downloadsKey(owner)),
        AsyncStorage.getItem(downloadDetailsKey(owner)),
        AsyncStorage.getItem(clearedDownloadsKey(owner)),
      ]);
      const stored = JSON.parse(storedValue || '[]');
      const detailsStored = JSON.parse(detailValue || '[]');
      const clearedStored = JSON.parse(clearedValue || '[]');
      const entries: Array<[string, string]> = Array.isArray(stored)
        ? stored.filter((entry: unknown): entry is [string, string] => Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string' && Boolean(entry[1])).map(([id, uri]: [string, string]) => [id, uri])
        : [];
      const details: Array<[string, DownloadedMediaDetail]> = Array.isArray(detailsStored)
        ? detailsStored.filter((entry: unknown): entry is [string, DownloadedMediaDetail] => Array.isArray(entry) && typeof entry[0] === 'string' && entry[1] && typeof entry[1].uri === 'string' && Number.isFinite(Number(entry[1].size)) && ['image', 'video', 'audio', 'file'].includes(entry[1].kind))
        : [];
      if (owner !== downloadsOwner) { return; }
      // A transfer may have finished during the storage read; keep that copy.
      downloadsLoaded = true;
      const downloads = new Map(entries);
      snapshot.downloads.forEach((uri, id) => downloads.set(id, uri));
      const downloadDetails = new Map(details);
      snapshot.downloadDetails.forEach((detail, id) => downloadDetails.set(id, detail));
      downloads.forEach((uri, id) => {
        if (downloadDetails.has(id) || !uri.startsWith(Paths.document.uri)) { return; }
        try {
          const file = new File(uri);
          if (!file.exists) { downloads.delete(id); return; }
          downloadDetails.set(id, {uri, kind: inferredKind(uri, file.type), size: file.size, fileName: uri.split('/').pop() || 'download'});
        } catch { /* Keep the downloaded copy available even if metadata is unreadable. */ }
      });
      if (Array.isArray(clearedStored)) { clearedStored.forEach((id: unknown) => { if (typeof id === 'string') clearedDownloads.add(id); }); }
      emit({downloads, downloadDetails, downloadedMedia: summaryFor(downloadDetails, downloads.size)});
      persistDownloads().catch(() => undefined);
    } catch {
      if (owner !== downloadsOwner) { return; }
      downloadsLoaded = true;
      emit({downloadedMedia: summaryFor(snapshot.downloadDetails, snapshot.downloads.size)});
    }
  })();
  return downloadsLoad;
}

async function persistDownloads(): Promise<void> {
  const entries = Array.from(snapshot.downloads.entries()).slice(-MAX_REMEMBERED_DOWNLOADS);
  const details = Array.from(snapshot.downloadDetails.entries()).slice(-MAX_REMEMBERED_DOWNLOADS);
  try {
    const owner = downloadsOwner || String(getSession()?.user?.id || '');
    await Promise.all([
      AsyncStorage.setItem(downloadsKey(owner), JSON.stringify(entries)),
      AsyncStorage.setItem(downloadDetailsKey(owner), JSON.stringify(details)),
      AsyncStorage.setItem(clearedDownloadsKey(owner), JSON.stringify(Array.from(clearedDownloads).slice(-MAX_REMEMBERED_DOWNLOADS))),
    ]);
  } catch {
    // The media stays available for this session.
  }
}

/**
 * Starts following the saved choices and the connection. Safe to call more
 * than once; the first call wins. Reloads the per-account download list each
 * time, so it follows a sign-in on this device.
 */
export function startAutoDownloadTracking(): void {
  loadDownloads().catch(() => undefined);
  if (started) { return; }
  started = true;
  let settingsChanged = false;
  subscribeToAutoDownloadSettings(settings => {
    settingsChanged = true;
    settingsLoaded = true;
    emit({settings});
  });
  loadStoredAutoDownloadSettings().then(settings => {
    if (settingsChanged) { return; }
    settingsLoaded = true;
    emit({settings});
  }).catch(() => undefined);
  try {
    let networkRequest = 0;
    const updateNetwork = (state: {type?: string | null; isConnected?: boolean | null; isInternetReachable?: boolean | null; details?: {isRoaming?: boolean | null} | null}) => {
      const request = ++networkRequest;
      void (async () => {
        let network = networkFor(state, snapshot.network);
        if (state.type === 'cellular' && state.details?.isRoaming == null && roamingNativeModule) {
          try {
            if (await roamingNativeModule.getIsRoaming()) { network = 'roaming'; }
          } catch { /* Older Android versions use the Mobile Data rule. */ }
        }
        if (request !== networkRequest) { return; }
        const connected = state.isConnected === true && state.isInternetReachable !== false;
        const first = !networkLoaded;
        networkLoaded = true;
        const transfers = new Map(snapshot.transfers);
        // Retry interrupted auto-downloads when connectivity returns. Failures
        // while still online remain visible until the user taps Retry.
        if (connected && !snapshot.connected) {
          transfers.forEach((transfer, id) => { if (transfer.phase === 'failed') { transfers.delete(id); } });
        }
        if (first || network !== snapshot.network || connected !== snapshot.connected || transfers.size !== snapshot.transfers.size) {
          emit({network, connected, transfers});
        }
      })();
    };
    let networkChanged = false;
    NetInfo.addEventListener(state => {
      networkChanged = true;
      updateNetwork(state);
    });
    NetInfo.fetch().then(state => { if (!networkChanged) { updateNetwork(state); } }).catch(() => undefined);
  } catch {
    // Wait for connection information before starting automatic transfers.
  }
}

/** The media is now present in app storage and may be opened in the chat. */
export function markMediaDownloaded(
  messageId: string,
  localUri = '',
  details?: Omit<DownloadedMediaDetail, 'uri'>,
): void {
  const id = String(messageId || '').trim();
  if (!id) { return; }
  const previous = snapshot.downloads.get(id) || '';
  const next = localUri || previous;
  const downloads = new Map(snapshot.downloads);
  // Re-inserting moves the entry to the end, so the oldest are trimmed first.
  downloads.delete(id);
  downloads.set(id, next);
  const downloadDetails = new Map(snapshot.downloadDetails);
  if (details) { downloadDetails.set(id, {...details, uri: next}); }
  clearedDownloads.delete(id);
  emit({downloads, downloadDetails, downloadedMedia: summaryFor(downloadDetails, downloads.size)});
  emitTransfer(id);
  persistDownloads().catch(() => undefined);
}

export function markMediaGallerySaved(messageId: string): void {
  const id = String(messageId || '').trim();
  const detail = snapshot.downloadDetails.get(id);
  if (!id || !detail || detail.gallerySaved) { return; }
  const downloadDetails = new Map(snapshot.downloadDetails);
  downloadDetails.set(id, {...detail, gallerySaved: true});
  emit({downloadDetails, downloadedMedia: summaryFor(downloadDetails, snapshot.downloads.size)});
  persistDownloads().catch(() => undefined);
}

export function mediaGallerySaved(messageId: string): boolean {
  return Boolean(snapshot.downloadDetails.get(String(messageId || '').trim())?.gallerySaved);
}

const documentDownloads = new Map<string, Promise<string>>();

/**
 * Saves a received document on the device - what "auto-download" means for a
 * file, since unlike a photo it is not shown inline. The copy lives in the
 * app's documents folder under the message id, so two "report.pdf"s from
 * different messages never overwrite each other, and opening it later needs no
 * second download. Concurrent calls for one message share the same request.
 */
export function saveDocumentLocally(
  message: {id: string; mediaUrl?: string; fileName?: string; fileType?: string; mediaSize?: number; messageType?: string},
  resolveUrl?: (messageId: string) => Promise<string>,
  validateSize = true,
): Promise<string> {
  const id = String(message.id || '').trim();
  if (!id) { return Promise.reject(new Error('This document is not available yet.')); }
  const kind = mediaKindOf(message.messageType) || 'file';
  const saved = snapshot.downloads.get(id);
  if (saved && new File(saved).exists) { return Promise.resolve(saved); }
  if (saved) {
    const downloads = new Map(snapshot.downloads); downloads.delete(id);
    const downloadDetails = new Map(snapshot.downloadDetails); downloadDetails.delete(id);
    emit({downloads, downloadDetails, downloadedMedia: summaryFor(downloadDetails, downloads.size)});
  }
  const running = documentDownloads.get(id);
  if (running) { return running; }

  const task = (async () => {
    const owner = String(getSession()?.user?.id || '');
    const mediaUrl = String(message.mediaUrl || '');
    const originalName = String(message.fileName || mediaUrl.split(/[/?#]/).pop() || `${kind}-${id}`);
    const extension = mediaExtension(kind, String(message.fileType || ''), mediaUrl);
    const withExtension = extension && !/\.[a-z\d]{2,5}$/i.test(originalName)
      ? `${originalName}.${extension}`
      : originalName;
    const safeName = withExtension.replace(/[\\/:*?"<>|\s]+/g, '_').slice(-80);
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const destination = new File(Paths.document, `chatterly-${safeId}-${safeName}`);
    emitTransfer(id, {phase: 'downloading', kind, progress: 0});
    try {
      const downloaded = await downloadMediaFile(
        message.mediaUrl,
        destination,
        resolveUrl ? () => resolveUrl(id) : undefined,
        (bytesWritten, totalBytes) => emitTransfer(id, {
          phase: 'downloading',
          kind,
          progress: totalBytes > 0 ? Math.min(1, bytesWritten / totalBytes) : null,
        }),
      );
      const expectedSize = Math.max(0, Number(message.mediaSize || 0));
      const downloadedSize = Math.max(0, Number(downloaded.size || 0));
      // Documents use the advertised size as an integrity check. Transcoded
      // photo, video, and audio metadata may differ from the stored copy.
      if (validateSize && kind === 'file' && expectedSize > 0 && downloadedSize !== expectedSize) {
        try { downloaded.delete(); } catch { /* Do not retain a failed integrity check. */ }
        throw new Error('The downloaded file size does not match the shared file. Please try again.');
      }
      if (owner === String(getSession()?.user?.id || '')) {
        markMediaDownloaded(id, downloaded.uri, {
          kind,
          size: downloadedSize || expectedSize,
          fileName: safeName,
        });
        if (snapshot.settings.saveToGallery && (kind === 'image' || kind === 'video')) {
          try {
            const permission = await MediaLibrary.requestPermissionsAsync(true, []);
            if (permission.granted) {
              await MediaLibrary.saveToLibraryAsync(downloaded.uri);
              markMediaGallerySaved(id);
            }
          } catch { /* The app copy remains usable if gallery access is unavailable. */ }
        }
      } else {
        try { downloaded.delete(); } catch { /* Do not leave another account's media in app storage. */ }
      }
      return downloaded.uri;
    } catch (error) {
      emitTransfer(id, {
        phase: 'failed', kind, progress: null,
        error: error instanceof Error ? error.message : 'Unable to download media. Check your connection and retry.',
      });
      throw error;
    }
  })().finally(() => { documentDownloads.delete(id); });

  documentDownloads.set(id, task);
  return task;
}

export function downloadedFileFor(messageId: string): string {
  return snapshot.downloads.get(String(messageId || '')) || '';
}

/** Remove persisted app copies without touching chats or copies exported to Photos/Gallery. */
export async function clearDownloadedMedia(): Promise<void> {
  await Promise.allSettled(Array.from(documentDownloads.values()));
  const ids = Array.from(snapshot.downloads.keys());
  const documentRoot = Paths.document.uri;
  const uris = Array.from(new Set(snapshot.downloads.values())).filter(uri => uri.startsWith(documentRoot));
  await Promise.all(uris.map(async uri => {
    try { const file = new File(uri); if (file.exists) { file.delete(); } } catch { /* Continue clearing the remaining app copies. */ }
  }));
  ids.forEach(id => clearedDownloads.add(id));
  const transfers = new Map(snapshot.transfers);
  ids.forEach(id => transfers.delete(id));
  emit({
    downloads: new Map(),
    downloadDetails: new Map(),
    transfers,
    downloadedMedia: summaryFor(new Map(), 0),
  });
  await persistDownloads();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = () => snapshot;

export function useAutoDownloadSnapshot(): Snapshot {
  useEffect(() => { startAutoDownloadTracking(); }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type MediaDownloadGate = {
  /** Whether the media may load (or, for a document, be fetched) without a tap. */
  allowed: boolean;
  /** Whether the user fetched it by hand, which keeps it loaded from now on. */
  downloaded: boolean;
  /** A durable local copy, once this media has been downloaded. */
  localUri: string;
  /** Current transfer progress or retryable failure, if any. */
  transfer?: DownloadTransferState;
  /** Start or retry a download now, regardless of the auto-download choices. */
  download: () => void;
};

export type AutoDownloadMessage = {
  id?: string;
  isOwn?: boolean;
  messageType?: string;
  mediaUrl?: string;
  fileName?: string;
  fileType?: string;
  mediaSize?: number;
  queued?: boolean;
};

function queueMediaDownload(message: AutoDownloadMessage, kind: DownloadableMediaKind, force = false): void {
  const id = String(message.id || '').trim();
  if (!id || message.isOwn || message.queued || snapshot.downloads.get(id)) { return; }
  if (clearedDownloads.has(id)) {
    if (!force) { return; }
    clearedDownloads.delete(id);
    persistDownloads().catch(() => undefined);
  }
  const transfer = snapshot.transfers.get(id);
  if (transfer?.phase === 'downloading' || (!force && transfer?.phase === 'failed')) { return; }
  if (!force && (!snapshot.ready || !snapshot.connected || !shouldAutoDownload(kind, snapshot.settings, snapshot.network))) { return; }
  saveDocumentLocally(
    {
      id,
      mediaUrl: message.mediaUrl,
      fileName: message.fileName || `${kind}-${id}`,
      fileType: message.fileType,
      mediaSize: message.mediaSize,
      messageType: kind,
    },
    getMediaDownloadUrl,
    kind === 'file',
  ).catch(() => undefined);
}

/**
 * Queues every eligible item in the loaded thread, including media outside the
 * currently rendered/virtualized bubbles and album items hidden behind View All.
 */
export function useAutoDownloadMessages(messages: readonly AutoDownloadMessage[]): void {
  const state = useAutoDownloadSnapshot();
  useEffect(() => {
    messages.forEach(message => {
      const kind = mediaKindOf(message.messageType);
      if (!kind || !shouldAutoDownload(kind, state.settings, state.network)) {
        return;
      }
      queueMediaDownload(message, kind);
    });
  }, [messages, state.settings, state.network, state.downloads, state.ready, state.connected]);
}

/** Download live receipts even when their conversation is not open. */
export function startAutoDownloadReceiving(): () => void {
  startAutoDownloadTracking();
  const received = new Map<string, AutoDownloadMessage>();
  const drain = () => {
    if (!snapshot.ready || !snapshot.connected) { return; }
    received.forEach((message, id) => {
      if (snapshot.downloads.get(id)) { received.delete(id); return; }
      const kind = mediaKindOf(message.messageType);
      if (kind && shouldAutoDownload(kind, snapshot.settings, snapshot.network)) { queueMediaDownload(message, kind); }
    });
  };
  const unsubscribeState = subscribe(drain);
  const unsubscribeMessages = subscribeToLiveMessages(message => {
    if (!mediaKindOf(message.messageType) || message.isOwn || message.queued || message.isDeleted || message.deletedForMe) { return; }
    received.set(message.id, message);
    if (received.size > MAX_REMEMBERED_DOWNLOADS) { received.delete(received.keys().next().value!); }
    drain();
  });
  return () => {
    unsubscribeMessages();
    unsubscribeState();
    received.clear();
  };
}

/**
 * The gate for one received message. Your own messages always load: they were
 * sent from this account, so there is nothing to save data on.
 */
export function useMediaDownloadGate(message: AutoDownloadMessage): MediaDownloadGate {
  const state = useAutoDownloadSnapshot();
  const id = String(message.id || '');
  const kind = mediaKindOf(message.messageType);
  const downloaded = Boolean(id && state.downloads.get(id));
  const autoEnabled = Boolean(kind && state.ready && state.connected && shouldAutoDownload(kind, state.settings, state.network));
  const allowed = !kind || Boolean(message.isOwn) || downloaded;
  const localUri = id ? state.downloads.get(id) || '' : '';
  useEffect(() => {
    if (!id || !kind || !autoEnabled || downloaded || message.isOwn || message.queued) { return; }
    queueMediaDownload(message, kind);
  }, [id, kind, autoEnabled, downloaded, message, message.isOwn, message.queued]);
  return {
    allowed,
    downloaded,
    localUri,
    transfer: id ? state.transfers.get(id) : undefined,
    download: () => { if (kind) { queueMediaDownload(message, kind, true); } },
  };
}
