import {DARK_THEME, darkInk, darkSurface, normalizeThemePreference} from '../src/theme/palette';
import {createThemedStyles, isDarkTheme, setActiveThemeMode, themeInk} from '../src/theme/themedStyles';

// Sprint 11 Story 2: the rules the whole dark theme is derived from. A screen
// only wraps its StyleSheet, so if these are wrong every screen is wrong.

afterEach(() => setActiveThemeMode('light'));

test('the theme choice is one of three, whatever arrives', () => {
  expect(normalizeThemePreference('dark')).toBe('dark');
  expect(normalizeThemePreference(' LIGHT ')).toBe('light');
  expect(normalizeThemePreference('midnight')).toBe('system');
  expect(normalizeThemePreference(undefined)).toBe('system');
});

test('light mode hands back the very rules the screen was written with', () => {
  const definitions = {card: {backgroundColor: '#FFFFFF', color: '#111827'}};
  const styles = createThemedStyles(definitions);

  expect(styles.card).toEqual(definitions.card);
  // Same object, so React sees no change and light mode cannot regress.
  expect(styles.card).toBe(styles.card);
});

test('dark mode turns a white card into a dark card and lifts its text', () => {
  const styles = createThemedStyles({card: {backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', color: '#111827', fontSize: 12}});

  setActiveThemeMode('dark');
  expect(isDarkTheme()).toBe(true);
  expect(styles.card).toEqual({
    backgroundColor: DARK_THEME.surface,
    borderColor: DARK_THEME.border,
    color: DARK_THEME.text,
    fontSize: 12,
  });
});

test('a surface that is already dark stays dark', () => {
  // The snackbar is a dark toast in the light theme; inverting it would make it
  // a white slab with white text on it.
  expect(darkSurface('#242629')).toBe('#242629');
  expect(darkSurface('#0B1220')).toBe('#0B1220');
  expect(darkSurface('#000000')).toBe('#000000');
});

test('text that is already light is left alone, because it sits on something coloured', () => {
  // White on a purple button. Darkening it is what would make it vanish.
  expect(darkInk('#FFFFFF')).toBe('#FFFFFF');
  expect(darkInk('#FFF')).toBe('#FFF');
  expect(darkInk('#F1EBFE')).toBe('#F1EBFE');
});

test('dark text is lifted far enough to read on a dark surface', () => {
  for (const ink of ['#111827', '#0B1220', '#344054', '#667085', '#526176']) {
    const lifted = darkInk(ink);
    expect(lifted).not.toBe(ink);
    // Well clear of the darkest surface the theme paints, which is #0B1220.
    expect(brightness(lifted)).toBeGreaterThan(0.6);
  }
});

test('a colour nobody curated still comes out readable', () => {
  // Not in the table: a mid slate ink and an off-white surface.
  expect(brightness(darkInk('#2B3A4F'))).toBeGreaterThan(0.6);
  expect(brightness(darkSurface('#FCFDFE'))).toBeLessThan(0.25);
});

test('the brand purple stays purple', () => {
  expect(darkSurface('#6F28F5')).toBe(DARK_THEME.accent);
  expect(darkInk('#7137DD')).toBe(DARK_THEME.accent);
  // Its pale tint becomes a deep tint rather than staying a pale slab.
  expect(darkSurface('#F1EBFF')).toBe(DARK_THEME.accentSoft);
});

test('a translucent colour is left exactly as written', () => {
  // A scrim flipped to white is a white sheet over the app.
  expect(darkSurface('rgba(11,18,32,.44)')).toBe('rgba(11,18,32,.44)');
  expect(darkSurface('rgba(255, 255, 255, 0.12)')).toBe('rgba(255, 255, 255, 0.12)');
  expect(darkSurface('#0B122070')).toBe('#0B122070');
  expect(darkSurface('transparent')).toBe('transparent');
});

test('high-opacity white call controls become dark while retaining transparency', () => {
  expect(darkSurface('rgba(255,255,255,.96)')).toBe('rgba(19,28,46,.96)');
  expect(darkSurface('rgba(255,255,255,0.82)')).toBe('rgba(19,28,46,0.82)');
  expect(darkSurface('rgba(0,0,0,.40)')).toBe('rgba(0,0,0,.40)');
});

test('shadows are not lifted, so a card does not grow a white halo', () => {
  const styles = createThemedStyles({card: {shadowColor: '#0B1220', textShadowColor: '#111827', backgroundColor: '#FFFFFF'}});
  setActiveThemeMode('dark');
  expect(styles.card.shadowColor).toBe('#0B1220');
  expect((styles.card as {textShadowColor?: string}).textShadowColor).toBe('#111827');
});

test('rules a screen marks as dark by design are never touched', () => {
  const styles = createThemedStyles(
    {viewer: {backgroundColor: '#FFFFFF'}, page: {backgroundColor: '#FFFFFF'}},
    {keep: ['viewer']},
  );

  setActiveThemeMode('dark');
  expect(styles.viewer.backgroundColor).toBe('#FFFFFF');
  expect(styles.page.backgroundColor).toBe(DARK_THEME.surface);
});

test('an icon colour follows the active theme, and only in dark mode', () => {
  expect(themeInk('#0B1220')).toBe('#0B1220');
  setActiveThemeMode('dark');
  expect(themeInk('#0B1220')).toBe(DARK_THEME.text);
  expect(themeInk('#FFFFFF')).toBe('#FFFFFF');
});

/** 0 for black, 1 for white, from the same lightness the palette reasons about. */
function brightness(color: string): number {
  const hex = color.replace('#', '');
  const channels = hex.length === 3
    ? hex.split('').map(character => parseInt(character + character, 16))
    : [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
  return (Math.max(...channels) + Math.min(...channels)) / 2 / 255;
}
