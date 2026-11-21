import test from 'node:test';
import assert from 'node:assert/strict';

const MODULE_URL = new URL('../src/utils/emojiSupport.js', import.meta.url).href;
let importCounter = 0;
// The module remembers its canvas and its answers, so every scenario gets a fresh copy.
const loadFresh = async () => import(`${MODULE_URL}?scenario=${(importCounter += 1)}`);

const SIZE = 32;
const FILL = [0xfe, 0x01, 0xfd, 255];

// A canvas whose "font" is a lookup table: each emoji is either a colour glyph (pixels do not
// depend on the fill), a missing-glyph box (drawn in the fill colour), or not drawn at all.
const installFakeCanvas = (glyphs, { canaries = 'color' } = {}) => {
  const table = { ...glyphs };
  const counters = { draws: 0 };
  let fillStyle = '#000000';
  let lastText = '';
  const context = {
    textBaseline: 'alphabetic',
    font: '',
    clearRect() {
      lastText = '';
    },
    fillText(text) {
      counters.draws += 1;
      lastText = text;
    },
    measureText(text) {
      return { width: table[text]?.width ?? 24 };
    },
    getImageData() {
      const data = new Uint8ClampedArray(SIZE * SIZE * 4);
      const glyph = table[lastText] ?? (canaries === 'color' ? { kind: 'color' } : undefined);
      if (!glyph || glyph.kind === 'blank') return { data };

      const pixel = glyph.kind === 'color' ? [220, 60, 40, 255] : FILL;
      for (let index = 0; index < 40; index += 1) {
        data.set(pixel, index * 4);
      }
      return { data };
    },
  };
  Object.defineProperty(context, 'fillStyle', {
    get: () => fillStyle,
    set: (value) => {
      fillStyle = value;
    },
  });
  globalThis.document = {
    createElement: () => ({ getContext: () => context, width: 0, height: 0 }),
  };
  return { counters, table };
};

const storage = new Map();
const installFakeStorage = () => {
  storage.clear();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
  };
  globalThis.navigator = { userAgent: 'test-agent', platform: 'test-platform' };
};

test.afterEach(() => {
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.navigator;
});

test('Twemoji file names follow the artwork convention', async () => {
  const { getTwemojiAssetName } = await loadFresh();
  assert.equal(getTwemojiAssetName('😀'), '1f600');
  assert.equal(getTwemojiAssetName('🫠'), '1fae0');
  assert.equal(getTwemojiAssetName('❤️'), '2764');
  assert.equal(getTwemojiAssetName('0️⃣'), '30-20e3');
  assert.equal(getTwemojiAssetName('👍🏽'), '1f44d-1f3fd');
  assert.equal(getTwemojiAssetName('👩‍💻'), '1f469-200d-1f4bb');
  assert.equal(getTwemojiAssetName('🏳️‍🌈'), '1f3f3-fe0f-200d-1f308');
  assert.equal(getTwemojiAssetName(''), '');
});

test('without a canvas nothing is reported unsupported', async () => {
  const { isEmojiRenderable } = await loadFresh();
  assert.equal(isEmojiRenderable('🫠'), true);
});

test('a device that draws all the newest emoji is trusted with the rest, without checking each one', async () => {
  const { counters } = installFakeCanvas({ '🧿': { kind: 'tofu' } });
  const { isEmojiRenderable, EMOJI_SUPPORT_CANARIES } = await loadFresh();
  assert.equal(isEmojiRenderable('😀'), true);
  assert.equal(counters.draws, EMOJI_SUPPORT_CANARIES.length);

  // even an emoji that would not draw is not looked at: the device is complete by version
  assert.equal(isEmojiRenderable('🧿'), true);
  assert.equal(isEmojiRenderable('🥳'), true);
  assert.equal(counters.draws, EMOJI_SUPPORT_CANARIES.length);
});

test('every canary is a different emoji and each is checked', async () => {
  const { EMOJI_SUPPORT_CANARIES } = await loadFresh();
  assert.equal(new Set(EMOJI_SUPPORT_CANARIES).size, EMOJI_SUPPORT_CANARIES.length);
  assert.ok(EMOJI_SUPPORT_CANARIES.length >= 8);
});

test('one canary the font cannot draw switches on per-emoji checks', async () => {
  installFakeStorage();
  installFakeCanvas({
    '🪷': { kind: 'tofu' },
    '😀': { kind: 'color' },
    '🥹': { kind: 'color' },
    '🫠': { kind: 'blank' },
    '🧿': { kind: 'tofu' },
  });
  const { isEmojiRenderable } = await loadFresh();
  assert.equal(isEmojiRenderable('😀'), true);
  assert.equal(isEmojiRenderable('🥹'), true);
  assert.equal(isEmojiRenderable('🫠'), false);
  assert.equal(isEmojiRenderable('🪷'), false);
  assert.equal(isEmojiRenderable('🧿'), false);
  assert.equal(isEmojiRenderable(''), true);
});

test('on such a device a sequence drawn as separate parts is unsupported, a joined one is not', async () => {
  installFakeStorage();
  installFakeCanvas({
    '🪷': { kind: 'blank' },
    '👩': { kind: 'color', width: 24 },
    '👩️': { kind: 'color', width: 24 },
    '👩‍💻': { kind: 'color', width: 25 },
    '👩‍🦱': { kind: 'color', width: 49 },
    '0️⃣': { kind: 'color', width: 24 },
    '0️': { kind: 'color', width: 14 },
  });
  const { isEmojiRenderable } = await loadFresh();
  assert.equal(isEmojiRenderable('👩‍💻'), true);
  assert.equal(isEmojiRenderable('👩‍🦱'), false);
  // keycaps are one glyph even though their first character is narrow
  assert.equal(isEmojiRenderable('0️⃣'), true);
});

test('a device that failed a canary because a sequence came apart is also checked per emoji', async () => {
  installFakeStorage();
  installFakeCanvas({
    '🧑‍🤝‍🧑': { kind: 'color', width: 72 },
    '🧑️': { kind: 'color', width: 24 },
    '😀': { kind: 'color' },
    '🥱': { kind: 'color' },
  });
  const { isEmojiRenderable } = await loadFresh();
  assert.equal(isEmojiRenderable('😀'), true);
  assert.equal(isEmojiRenderable('🧑‍🤝‍🧑'), false);
});

// A scheduler that runs queued slices one by one, and a clock that moves 3 ms per reading.
const manualScheduling = () => {
  const queued = [];
  let clock = 0;
  return {
    schedule: (callback) => queued.push(callback),
    now: () => (clock += 3),
    runAll: () => {
      let slices = 0;
      while (queued.length) {
        queued.shift()();
        slices += 1;
      }
      return slices;
    },
  };
};

test('the background warm-up does nothing more on a device that draws every canary', async () => {
  const { counters } = installFakeCanvas({});
  const { warmUpEmojiSupport, EMOJI_SUPPORT_CANARIES } = await loadFresh();
  const scheduling = manualScheduling();
  warmUpEmojiSupport(['😀', '😃', '😄', '😁'], scheduling);
  assert.equal(scheduling.runAll(), 1);
  assert.equal(counters.draws, EMOJI_SUPPORT_CANARIES.length);
});

test('on a device that needs per-emoji checks the warm-up works through the list in small slices', async () => {
  installFakeStorage();
  const { counters } = installFakeCanvas({ '🪷': { kind: 'blank' }, '🧿': { kind: 'tofu' } });
  const { warmUpEmojiSupport, isEmojiRenderable, EMOJI_SUPPORT_CANARIES } = await loadFresh();
  const scheduling = manualScheduling();
  const emojis = Array.from({ length: 12 }, (_, index) => `e${index}`).concat('🧿');
  warmUpEmojiSupport(emojis, scheduling);

  const slices = scheduling.runAll();
  assert.ok(slices > 1, `expected several slices, got ${slices}`);

  const drawsAfterWarmUp = counters.draws;
  assert.equal(isEmojiRenderable('🧿'), false);
  assert.equal(isEmojiRenderable('e5'), true);
  assert.equal(counters.draws, drawsAfterWarmUp, 'the picker finds every answer already known');
  assert.equal(drawsAfterWarmUp, EMOJI_SUPPORT_CANARIES.indexOf('🪷') + 1 + emojis.length);
});

test('the warm-up is a no-op without a canvas or without emoji', async () => {
  const { warmUpEmojiSupport } = await loadFresh();
  const scheduling = manualScheduling();
  warmUpEmojiSupport(['😀'], scheduling);
  assert.equal(scheduling.runAll(), 0);

  installFakeCanvas({});
  const fresh = await loadFresh();
  fresh.warmUpEmojiSupport([], scheduling);
  assert.equal(scheduling.runAll(), 0);
});

test('answers are remembered, in memory and across sessions', async () => {
  installFakeStorage();
  const first = installFakeCanvas({ '🪷': { kind: 'blank' }, '🧿': { kind: 'tofu' }, '😀': { kind: 'color' } });
  const realSetTimeout = globalThis.setTimeout;
  const pendingTimers = [];
  globalThis.setTimeout = (callback) => pendingTimers.push(callback);
  const flushTimers = () => {
    while (pendingTimers.length) pendingTimers.shift()();
  };

  try {
    const firstSession = await loadFresh();
    assert.equal(firstSession.isEmojiRenderable('🧿'), false);
    assert.equal(firstSession.isEmojiRenderable('😀'), true);
    const drawsAfterChecks = first.counters.draws;
    assert.equal(firstSession.isEmojiRenderable('🧿'), false);
    assert.equal(first.counters.draws, drawsAfterChecks, 'a second ask must not draw again');
    flushTimers();

    const stored = JSON.parse(storage.get('chatterly_emoji_support_v1'));
    assert.equal(stored.results['🧿'], false);
    assert.equal(stored.results['😀'], true);

    // a new session on the same browser answers from storage and only re-runs the canaries
    const second = installFakeCanvas({ '🪷': { kind: 'blank' }, '🧿': { kind: 'tofu' }, '😀': { kind: 'color' } });
    const secondSession = await loadFresh();
    assert.equal(secondSession.isEmojiRenderable('🧿'), false);
    assert.equal(secondSession.isEmojiRenderable('😀'), true);
    assert.equal(second.counters.draws, secondSession.EMOJI_SUPPORT_CANARIES.indexOf('🪷') + 1);

    // another browser does not trust the stored answers
    globalThis.navigator = { userAgent: 'another-agent', platform: 'test-platform' };
    const third = installFakeCanvas({ '🪷': { kind: 'blank' }, '🧿': { kind: 'color' } });
    const thirdSession = await loadFresh();
    assert.equal(thirdSession.isEmojiRenderable('🧿'), true);
    assert.ok(third.counters.draws > thirdSession.EMOJI_SUPPORT_CANARIES.indexOf('🪷') + 1);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});
