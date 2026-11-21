import {GIF_ITEMS, GIF_ROW_SIZE, gifRowWidths, gifRows, searchGifs} from '../src/constants/gifs';

test('the GIF tab offers the web catalogue, not just nine reactions', () => {
  expect(GIF_ITEMS.length).toBeGreaterThanOrEqual(40);
});

test('every GIF is unique, sent at full size and previewed from the small rendition', () => {
  expect(new Set(GIF_ITEMS.map(item => item.id)).size).toBe(GIF_ITEMS.length);
  expect(new Set(GIF_ITEMS.map(item => item.url)).size).toBe(GIF_ITEMS.length);
  GIF_ITEMS.forEach(item => {
    expect(item.url).toMatch(/^https:\/\/media\.giphy\.com\/media\/[A-Za-z0-9]+\/giphy\.gif$/);
    expect(item.previewUrl).toBe(item.url.replace('/giphy.gif', '/200w.gif'));
  });
});

test('the media that Giphy no longer serves is not offered', () => {
  const ids = GIF_ITEMS.map(item => item.url);
  expect(ids).not.toContain('https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif');
  expect(ids).not.toContain('https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif');
});

test('search needs every term to match, across label, category and keywords', () => {
  expect(searchGifs('')).toHaveLength(GIF_ITEMS.length);
  expect(searchGifs('thank you').map(item => item.label)).toEqual(expect.arrayContaining(['Thank you', 'Thanks so much']));
  expect(searchGifs('thank you').map(item => item.label)).not.toContain('Thumbs up');
  // "celebrate" is a category as well as a keyword.
  expect(searchGifs('celebrate').length).toBeGreaterThan(3);
  expect(searchGifs('zzzz-nothing')).toEqual([]);
});

test('the grid lays three GIFs to a row and every full row fills the panel exactly', () => {
  const rows = gifRows(GIF_ITEMS);
  expect(rows.slice(0, -1).every(row => row.length === GIF_ROW_SIZE)).toBe(true);
  rows.filter(row => row.length === GIF_ROW_SIZE).forEach(row => {
    const widths = gifRowWidths(row, 383, 8);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(383 - 16);
    expect(Math.min(...widths)).toBeGreaterThan(60);
  });
  // A short last row keeps the three-across width instead of stretching.
  const short = gifRowWidths(GIF_ITEMS.slice(0, 2), 383, 8);
  expect(short).toEqual([122, 122]);
});
