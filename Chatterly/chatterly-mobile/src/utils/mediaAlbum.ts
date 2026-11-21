/**
 * Albums that survive a reinstall.
 *
 * One multi-select send is uploaded as one message per file, and the backend has
 * no batch id to keep them together. The grouping therefore lived only in the
 * sending device's cache: signing in on a fresh install (or looking at the chat
 * from the other phone) showed every file as its own bubble.
 *
 * The one per-message field that both the one-to-one and the group media routes
 * store and hand back untouched is the uploaded file's name, so the batch id
 * rides in it, just before the extension:
 *
 *   IMG_0412.jpg  ->  IMG_0412~album-lq3x9k2f7a.jpg
 *
 * `normalizeMessage` reads the tag back into `mediaGroupId` and hands the rest
 * of the app the original name, so it never shows up in a download or a forward.
 */

const TAG = /^(.*)~album-([a-z0-9]+)(\.[A-Za-z0-9]{1,8})?$/;

/** A short id that is unique to one send, also across two devices. */
export function createAlbumToken(now: number = Date.now(), random: () => number = Math.random): string {
  const entropy = Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0');
  return `${now.toString(36)}${entropy}`;
}

/** The id the thread groups on, for the token a send was tagged with. */
export function albumGroupId(token: string): string {
  return `media-batch-${token}`;
}

/** `photo.jpg` with this send's token in it, ready to be the upload's name. */
export function tagAlbumFileName(fileName: string, token: string): string {
  const original = parseAlbumFileName(fileName)?.fileName ?? fileName;
  const [, base = original, extension = ''] = /^(.*?)(\.[A-Za-z0-9]{1,8})?$/.exec(original) || [];
  return `${base}~album-${token}${extension}`;
}

/** The album a stored file name belongs to, with the name it was uploaded as. */
export function parseAlbumFileName(fileName?: string | null): {fileName: string; mediaGroupId: string} | null {
  const match = fileName ? TAG.exec(fileName) : null;
  if (!match) { return null; }
  const [, base, token, extension = ''] = match;
  return {fileName: `${base}${extension}`, mediaGroupId: albumGroupId(token)};
}
