import type {AttachmentMedia} from '../types/media';

/** Gallery providers may omit the MIME type or report all photos as JPEG. */
export function isGifMedia(media: Pick<AttachmentMedia, 'type' | 'mimeType' | 'fileName' | 'uri'>): boolean {
  return media.type === 'image' && (
    media.mimeType.toLowerCase() === 'image/gif' ||
    /\.gif(?:[?#]|$)/i.test(media.fileName) ||
    /\.gif(?:[?#]|$)/i.test(media.uri)
  );
}
