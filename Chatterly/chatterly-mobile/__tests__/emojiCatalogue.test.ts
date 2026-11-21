import {
  ALL_EMOJI_ITEMS,
  EMOJI_CATEGORIES,
  EMOJI_CATEGORY_LABELS,
  emojiItemsForCategory,
  emojiItemsForGlyphs,
  searchEmojis,
} from '../src/constants/emoji';
import {GIF_ITEMS, searchGifs} from '../src/constants/gifs';

test('every catalogue category is populated and named for the rail', () => {
  expect(EMOJI_CATEGORIES).toHaveLength(9);

  EMOJI_CATEGORIES.forEach(category => {
    expect(category.emojis.length).toBeGreaterThan(30);
    expect(EMOJI_CATEGORY_LABELS[category.id]).toBeTruthy();
    expect(emojiItemsForCategory(category.id)).toHaveLength(category.emojis.length);
  });

  expect(ALL_EMOJI_ITEMS).toHaveLength(
    EMOJI_CATEGORIES.reduce((total, category) => total + category.emojis.length, 0),
  );
});

// A duplicate would give two grid cells the same key and make "recently used"
// ambiguous about which category an emoji came from.
test('no emoji appears in two categories', () => {
  const glyphs = ALL_EMOJI_ITEMS.map(item => item.emoji);
  expect(new Set(glyphs).size).toBe(glyphs.length);
});

test('searching finds an emoji by its own word, not just its category', () => {
  const results = searchEmojis('pizza').map(item => item.emoji);

  expect(results[0]).toBe('🍕');
  expect(results).not.toContain('🚗');
});

test.each([
  ['broccoli', '🥦'], ['unicorn', '🦄'], ['rose', '🌹'], ['taxi', '🚕'],
  ['keyboard', '⌨️'], ['cricket', '🏏'], ['purple heart', '💜'],
  ['flag south korea', '🇰🇷'], ['health worker', '🧑‍⚕️'],
])('finds formerly unindexed emoji by name: %s', (query, glyph) => {
  expect(searchEmojis(query).map(item => item.emoji)).toContain(glyph);
});

test('every emoji in the picker is searchable by its glyph, including variation selectors', () => {
  ALL_EMOJI_ITEMS.forEach(item => {
    expect(searchEmojis(item.emoji).map(result => result.emoji)).toContain(item.emoji);
  });
  expect(searchEmojis('⌨').map(item => item.emoji)).toContain('⌨️');
});

test('handles shortcodes, hyphenated words and whitespace', () => {
  expect(searchEmojis(':purple_heart:').map(item => item.emoji)).toContain('💜');
  expect(searchEmojis('  LIGHT-BLUE   HEART ').map(item => item.emoji)).toContain('🩵');
});

test('an exact keyword outranks a merely-contained one', () => {
  const results = searchEmojis('car').map(item => item.emoji);

  expect(results).toContain('🚗');
  expect(results.indexOf('🚗')).toBeLessThan(results.length);
  expect(results[0]).toBe('🚗');
});

// Both words have to match, otherwise "broken heart" would return every heart.
test('each typed word narrows the results', () => {
  const hearts = searchEmojis('heart');
  const broken = searchEmojis('broken heart');

  expect(broken.length).toBeLessThan(hearts.length);
  expect(broken.map(item => item.emoji)).toContain('💔');
});

test('a search with no match returns nothing rather than everything', () => {
  expect(searchEmojis('zzzznotanemoji')).toEqual([]);
  expect(searchEmojis('   ')).toEqual([]);
});

test('stored recents map back to catalogue entries and drop unknown glyphs', () => {
  const items = emojiItemsForGlyphs(['🍕', 'not-an-emoji', '🚗']);

  expect(items.map(item => item.emoji)).toEqual(['🍕', '🚗']);
});

test('the GIF catalogue is searchable and every entry has a usable address', () => {
  expect(searchGifs('')).toHaveLength(GIF_ITEMS.length);
  // Every thank-you GIF matches, the one labelled so first.
  const thanks = searchGifs('thank you');
  expect(thanks[0].id).toBe('thank-you');
  expect(thanks.every(gif => gif.category === 'thanks')).toBe(true);
  expect(searchGifs('zzzz')).toEqual([]);

  GIF_ITEMS.forEach(gif => {
    expect(gif.url).toMatch(/^https:\/\/\S+\.gif$/);
    expect(gif.label).toBeTruthy();
  });
});
