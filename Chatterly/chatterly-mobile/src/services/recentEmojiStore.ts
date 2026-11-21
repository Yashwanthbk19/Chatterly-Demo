import AsyncStorage from '@react-native-async-storage/async-storage';
import {getSession} from './sessionStore';

/**
 * Sprint 4 Story 6's "Recent Emojis".
 *
 * Recents are scoped to the signed-in user rather than the device, the same way
 * cached threads are in `messageStore`: two people sharing a phone should not
 * see each other's picks. Nothing here is allowed to throw - a picker that
 * cannot read its history still has all nine categories to offer.
 */

const STORE_VERSION = 1;
const KEY_PREFIX = `chatterly.recent-emojis.v${STORE_VERSION}`;

/** Two full rows on the widest phone, which is what the design's grid shows. */
export const MAX_RECENT_EMOJIS = 24;

function keyFor(): string | null {
  const userId = String(getSession()?.user?.id || '');
  return userId ? `${KEY_PREFIX}.${encodeURIComponent(userId)}` : null;
}

function readGlyphs(raw: string | null): string[] {
  if (!raw) { return []; }
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) { return []; }
  return parsed
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, MAX_RECENT_EMOJIS);
}

export async function loadRecentEmojis(): Promise<string[]> {
  const key = keyFor();
  if (!key) { return []; }
  try {
    return readGlyphs(await AsyncStorage.getItem(key));
  } catch {
    // A corrupt or unavailable store must never keep the picker from opening.
    return [];
  }
}

/**
 * Moves one emoji to the front of the history and returns the new list.
 *
 * The caller gets the list back so the open picker can re-render from the same
 * value that was persisted, instead of reading its own state a second time and
 * risking the two disagreeing.
 */
export async function recordRecentEmoji(emoji: string): Promise<string[]> {
  const glyph = emoji.trim();
  if (!glyph) { return loadRecentEmojis(); }

  const previous = await loadRecentEmojis();
  const next = [glyph, ...previous.filter(item => item !== glyph)].slice(0, MAX_RECENT_EMOJIS);

  const key = keyFor();
  if (key) {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
    } catch {
      // The in-memory list still updates, so this session behaves correctly.
    }
  }
  return next;
}
