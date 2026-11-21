// The emoji picker draws every emoji with the operating system's own emoji font, and a font
// only knows the emoji of the Unicode version it shipped with. On an older system (Windows 10,
// a Linux box without an emoji font, ...) newer emoji come out as empty boxes or as the pieces
// of a sequence, so "some emojis are missing from the list" on that machine only
// (BUG_USR_557). Those emoji are drawn with Twemoji artwork instead.
//
// Drawing a glyph to test it costs a few milliseconds (a font lookup per call), which is far
// too slow to do for every emoji in a grid. Fonts are complete by Unicode version, so the
// test is first run on one of the newest emoji of each recent version: when all of those
// draw, nothing is missing and nothing else is checked. Only a device that fails one pays for
// checking each emoji, and it only pays once because the answers are remembered.

const EMOJI_CANVAS_FONT =
  '24px "Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji",system-ui,sans-serif';
const CANVAS_SIZE = 32;
// A colour emoji ignores the fill colour, while a missing-glyph box or a plain text symbol is
// drawn in it. The fill is a colour no emoji contains, so solid fill-coloured pixels mean the
// glyph is not a colour emoji.
const PROBE_FILL_STYLE = '#fe01fd';
const PROBE_FILL_RGB = Object.freeze([0xfe, 0x01, 0xfd]);
const PROBE_FILL_TOLERANCE = 6;
const PROBE_SOLID_ALPHA = 200;
// A sequence the font cannot join is drawn as its parts side by side, roughly N times as wide
// as its first part.
const UNJOINED_SEQUENCE_WIDTH_RATIO = 1.5;
const ZWJ_OR_SKIN_TONE_PATTERN = /‍|[\u{1F3FB}-\u{1F3FF}]/u;
const KEYCAP_PATTERN = /^[0-9#*]️?⃣$/;
const SUPPORT_STORAGE_KEY = 'chatterly_emoji_support_v1';
const SUPPORT_STORAGE_DELAY_MS = 400;
const IDLE_SLICE_BUDGET_MS = 8;

// Newer emoji, one or two from each recent Unicode version up to the newest one the picker
// offers (15.0), including a joined sequence and a skin-tone variant. Add the newest emoji of
// any version the picker starts to offer.
export const EMOJI_SUPPORT_CANARIES = Object.freeze([
  '🥱', // 12.0
  '🧑‍🤝‍🧑', // 12.0 (joined sequence)
  '🥲', // 13.0
  '🐻‍❄️', // 13.0 (joined sequence)
  '❤️‍🔥', // 13.1 (joined sequence)
  '🫠', // 14.0
  '🥹', // 14.0
  '🫶🏽', // 14.0 (skin tone)
  '🪷', // 15.0
  '🩷', // 15.0
]);

const supportByEmoji = new Map();
let measuringContext;
let isPlatformComplete;
let hasLoadedStoredSupport = false;
let storeTimeoutId = null;

const getMeasuringContext = () => {
  if (measuringContext !== undefined) return measuringContext;

  measuringContext = null;
  if (typeof document === 'undefined') return measuringContext;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context && typeof context.fillText === 'function' && typeof context.getImageData === 'function') {
      context.textBaseline = 'top';
      context.font = EMOJI_CANVAS_FONT;
      context.fillStyle = PROBE_FILL_STYLE;
      measuringContext = context;
    }
  } catch {
    measuringContext = null;
  }

  return measuringContext;
};

const getFirstEmojiPart = (emoji) => {
  const [firstCodePoint = ''] = Array.from(emoji);
  return `${firstCodePoint}️`;
};

// One draw: does the browser show `emoji` as a colour glyph?
const probeEmoji = (context, emoji) => {
  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  context.fillText(emoji, 1, 1);
  const pixels = context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
  let isDrawn = false;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (!alpha) continue;

    isDrawn = true;
    if (
      alpha >= PROBE_SOLID_ALPHA &&
      Math.abs(pixels[index] - PROBE_FILL_RGB[0]) <= PROBE_FILL_TOLERANCE &&
      Math.abs(pixels[index + 1] - PROBE_FILL_RGB[1]) <= PROBE_FILL_TOLERANCE &&
      Math.abs(pixels[index + 2] - PROBE_FILL_RGB[2]) <= PROBE_FILL_TOLERANCE
    ) {
      return false;
    }
  }

  if (!isDrawn) return false;

  if (ZWJ_OR_SKIN_TONE_PATTERN.test(emoji) && !KEYCAP_PATTERN.test(emoji)) {
    const wholeWidth = context.measureText(emoji).width;
    const firstPartWidth = context.measureText(getFirstEmojiPart(emoji)).width;
    if (firstPartWidth > 0 && wholeWidth > firstPartWidth * UNJOINED_SEQUENCE_WIDTH_RATIO) {
      return false;
    }
  }

  return true;
};

const getPlatformSignature = () =>
  typeof navigator === 'undefined' ? '' : `${navigator.userAgent || ''}|${navigator.platform || ''}`;

// A device that needed per-emoji checks remembers the answers, so the cost is paid once.
const loadStoredSupport = () => {
  if (hasLoadedStoredSupport) return;
  hasLoadedStoredSupport = true;

  try {
    const stored = JSON.parse(localStorage.getItem(SUPPORT_STORAGE_KEY) || 'null');
    if (stored?.signature !== getPlatformSignature() || typeof stored?.results !== 'object') return;
    Object.entries(stored.results).forEach(([emoji, isSupported]) => {
      if (!supportByEmoji.has(emoji)) supportByEmoji.set(emoji, Boolean(isSupported));
    });
  } catch {
    // No storage, or an unreadable record: every emoji is simply checked again.
  }
};

const scheduleStoreSupport = () => {
  if (storeTimeoutId !== null || typeof setTimeout !== 'function') return;

  storeTimeoutId = setTimeout(() => {
    storeTimeoutId = null;
    try {
      localStorage.setItem(
        SUPPORT_STORAGE_KEY,
        JSON.stringify({
          signature: getPlatformSignature(),
          results: Object.fromEntries(supportByEmoji),
        })
      );
    } catch {
      // Storage can be full or blocked; the answers are then recomputed next session.
    }
  }, SUPPORT_STORAGE_DELAY_MS);
};

/**
 * Whether this browser can actually draw `emoji` with a native emoji glyph. When it cannot be
 * determined (no canvas, canvas reads blocked) the answer is true, so nothing changes.
 */
export const isEmojiRenderable = (emoji) => {
  const value = String(emoji || '');
  if (!value) return true;

  const context = getMeasuringContext();
  if (!context) return true;

  if (isPlatformComplete === undefined) {
    try {
      isPlatformComplete = EMOJI_SUPPORT_CANARIES.every((canary) => probeEmoji(context, canary));
    } catch {
      // Reading pixels can be blocked (privacy modes): keep every native glyph.
      isPlatformComplete = true;
    }
  }
  if (isPlatformComplete) return true;

  try {
    loadStoredSupport();
    if (supportByEmoji.has(value)) return supportByEmoji.get(value);

    const isRenderable = probeEmoji(context, value);
    supportByEmoji.set(value, isRenderable);
    scheduleStoreSupport();
    return isRenderable;
  } catch {
    // Reading pixels can be blocked (privacy modes); keep the native glyph.
    return true;
  }
};

const defaultSchedule = (callback) => {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(callback, { timeout: 2000 });
    return;
  }
  setTimeout(callback, 50);
};

/**
 * Checks a long list of emoji in the background, a few milliseconds at a time, so that a device
 * which needs per-emoji checks has the answers before the picker is opened. A device that does
 * not need them is recognised by the first check and nothing more is done.
 */
export const warmUpEmojiSupport = (
  emojis = [],
  { schedule = defaultSchedule, now = () => performance.now() } = {}
) => {
  const queue = Array.from(emojis);
  if (!queue.length || !getMeasuringContext()) return;

  const runSlice = () => {
    const startedAt = now();
    while (queue.length && now() - startedAt < IDLE_SLICE_BUDGET_MS) {
      isEmojiRenderable(queue.shift());
      if (isPlatformComplete) return;
    }
    if (queue.length) schedule(runSlice);
  };

  schedule(runSlice);
};

/**
 * The file name Twemoji gives an emoji: its code points in hex joined by "-", with the
 * emoji-presentation selector (FE0F) dropped unless the sequence has a zero-width joiner.
 */
export const getTwemojiAssetName = (emoji = '') => {
  const value = String(emoji || '');
  const normalizedValue = value.includes('‍') ? value : value.replace(/️/g, '');

  return Array.from(normalizedValue)
    .map((character) => character.codePointAt(0).toString(16))
    .join('-');
};
