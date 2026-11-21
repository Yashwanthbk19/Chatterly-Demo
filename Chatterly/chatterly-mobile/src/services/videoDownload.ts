import * as MediaLibrary from 'expo-media-library/legacy';
import {downloadedFileFor, markMediaGallerySaved, mediaGallerySaved, saveDocumentLocally} from './autoDownload';

type VideoMessage = {id: string; mediaUrl?: string; fileName?: string; fileType?: string};
const pending = new Map<string, Promise<void>>();

export function isVideoAttachment(message: {messageType?: string; fileName?: string; fileType?: string}): boolean {
  return message.messageType === 'video' ||
    /^video\//i.test(String(message.fileType || '')) ||
    /\.(?:mp4|mov|m4v|webm|avi|mkv|3gp)$/i.test(String(message.fileName || ''));
}

/** Explicit Download saves a public library copy, rather than opening a share sheet. */
export function saveVideoToDevice(message: VideoMessage, resolveUrl: () => Promise<string>): Promise<void> {
  const running = pending.get(message.id);
  if (running) { return running; }
  const task = (async () => {
    if (!mediaGallerySaved(message.id)) {
      // Add-only access on iOS; no read access to the user's library is needed.
      const permission = await MediaLibrary.requestPermissionsAsync(true, []);
      if (!permission.granted) {
        throw new Error('Allow photo and video saving in Settings to save this video to your device.');
      }
    }

    let uri = downloadedFileFor(message.id);
    if (!uri) {
      uri = await saveDocumentLocally(
        {...message, messageType: 'video'},
        resolveUrl,
        false,
      );
    }
    if (!mediaGallerySaved(message.id)) {
      await MediaLibrary.saveToLibraryAsync(uri);
      markMediaGallerySaved(message.id);
    }
  })().finally(() => { pending.delete(message.id); });
  pending.set(message.id, task);
  return task;
}
