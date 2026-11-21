import {ImageManipulator, SaveFormat} from 'expo-image-manipulator';

/**
 * The account copy of a photo wallpaper.
 *
 * The preference API stores the wallpaper as one string
 * (`PUT /api/preferences/chat-wallpaper`), the backend has no upload route
 * for it, and `express.json()` keeps its default ~100kb body limit. A photo
 * from the gallery or camera therefore syncs as a small JPEG data URL - which
 * the web client also renders, since it uses the value as a CSS image URL -
 * while this device keeps showing its full-resolution original.
 */

/** Leaves room under the 100kb body limit for the JSON around the string. */
export const MAX_SYNCED_WALLPAPER_LENGTH = 92_000;

const ATTEMPTS: ReadonlyArray<{width: number; compress: number}> = [
  {width: 540, compress: 0.5},
  {width: 480, compress: 0.42},
  {width: 420, compress: 0.34},
  {width: 360, compress: 0.28},
];

export function isInlineWallpaperImage(value: string): boolean {
  return /^data:image\//i.test(String(value || ''));
}

/**
 * Renders the photo down until it fits, or null when even the smallest
 * rendition is too large (it then stays on this device only).
 */
export async function wallpaperImageForSync(uri: string): Promise<string | null> {
  for (const attempt of ATTEMPTS) {
    const context = ImageManipulator.manipulate(uri);
    context.resize({width: attempt.width, height: null});
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({compress: attempt.compress, format: SaveFormat.JPEG, base64: true});
    if (!saved.base64) { continue; }
    const value = `data:image/jpeg;base64,${saved.base64}`;
    if (value.length <= MAX_SYNCED_WALLPAPER_LENGTH) { return value; }
  }
  return null;
}
