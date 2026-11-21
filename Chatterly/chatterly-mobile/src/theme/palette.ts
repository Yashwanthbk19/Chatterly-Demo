// Sprint 11 Story 2 - Theme Selection.
//
// The web client paints its dark theme with one central CSS overlay keyed on
// `.chatterly-theme-dark` (frontend/src/index.css) rather than a dark variant of
// every rule. React Native has no cascade to lean on, so the same idea is done
// in JavaScript: every colour the light theme already uses is mapped to a dark
// counterpart, and `themedStyles.ts` runs a whole StyleSheet through that map.
//
// Curated entries come first so the surfaces, borders and inks in the design
// land on exact values. Everything else - and the app uses over five hundred
// distinct colour literals - falls through to the derivation below, which keeps
// hue and saturation and only moves lightness. That means a colour nobody
// remembered to curate still comes out readable instead of invisible.

export type ThemePreference = 'light' | 'dark' | 'system';
export type ThemeMode = 'light' | 'dark';

export const THEME_PREFERENCES: ThemePreference[] = ['light', 'dark', 'system'];

/** The label the design shows for each choice, e.g. the Appearance status pill. */
export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  light: 'Light Mode',
  dark: 'Dark Mode',
  system: 'System Default',
};

export function normalizeThemePreference(value: unknown): ThemePreference {
  const preference = String(value ?? '').trim().toLowerCase();
  return THEME_PREFERENCES.includes(preference as ThemePreference) ? (preference as ThemePreference) : 'system';
}

/**
 * The dark surfaces from the design, for screens that need a colour directly.
 *
 * Every screen in this app paints its page white and its sections, inputs and
 * chips in light greys on top, so the dark scale runs the same way round: the
 * page is the darkest tone and anything sitting on it is lighter, which is how
 * the design's dark screen reads. `surface` is deliberately not the darkest
 * navy available, because a bottom sheet is a white surface too and it has to
 * stay distinguishable from the dimmed page behind it.
 */
export const DARK_THEME = {
  /** What a white page, card or sheet becomes. */
  surface: '#131C2E',
  /** A light-grey section sitting on that page. */
  raised: '#1B2740',
  /** An input, a chip, an inactive fill. */
  field: '#22304A',
  border: '#2E3C55',
  text: '#F7F9FC',
  secondaryText: '#94A3B8',
  mutedText: '#7A8699',
  accent: '#8B5CF6',
  accentSoft: '#2A1E4A',
} as const;

/**
 * Curated light -> dark colours. Keys are upper-case six-digit hex, which is
 * what `normalizeHex` reduces every written form to, so `#fff` and `#FFFFFF`
 * both find the same entry.
 */
const CURATED: Record<string, string> = {
  // Pages, cards and sheets - anything white in the light theme.
  FFFFFF: DARK_THEME.surface,
  FEFEFE: DARK_THEME.surface,
  FDFDFD: DARK_THEME.surface,
  // The off-white sections and search fields that sit on those pages, which the
  // design's dark screen shows a shade lighter than the page rather than cut
  // into it.
  FAFAFA: DARK_THEME.raised,
  FAFAFB: DARK_THEME.raised,
  FBFBFC: DARK_THEME.raised,
  F9FAFB: DARK_THEME.raised,
  F8F9FB: DARK_THEME.raised,
  F7F8FA: DARK_THEME.raised,
  F5F5F5: DARK_THEME.raised,
  F6F7F9: DARK_THEME.raised,
  // Inputs, chips and inactive fills.
  F1F5F9: DARK_THEME.field,
  F2F4F8: DARK_THEME.field,
  F3F5F9: DARK_THEME.field,
  F0F2F6: DARK_THEME.field,
  EEF0F4: DARK_THEME.field,
  EDF0F4: DARK_THEME.field,
  E7EAF0: DARK_THEME.field,
  E5E9F0: DARK_THEME.field,
  EFF1F5: DARK_THEME.field,
  // Borders and dividers.
  E2E8F0: DARK_THEME.border,
  EAECF0: DARK_THEME.border,
  E4E7EC: DARK_THEME.border,
  E1E6ED: DARK_THEME.border,
  E1E6EF: DARK_THEME.border,
  E7ECF3: DARK_THEME.border,
  DFE5ED: DARK_THEME.border,
  DDE3EB: DARK_THEME.border,
  DCE2EA: DARK_THEME.border,
  CBD5E1: DARK_THEME.border,
  D0D5DD: DARK_THEME.border,
  // Primary ink. These read as text and icons in the light theme.
  '0B1220': DARK_THEME.text,
  '111827': DARK_THEME.text,
  '101828': DARK_THEME.text,
  '0D1422': DARK_THEME.text,
  '121826': DARK_THEME.text,
  '172033': DARK_THEME.text,
  '152033': DARK_THEME.text,
  '1E293B': DARK_THEME.text,
  '0F172A': DARK_THEME.text,
  '344054': '#CBD5E1',
  '344256': '#CBD5E1',
  '334155': '#CBD5E1',
  '263448': '#C3CDDB',
  '273448': '#C3CDDB',
  '42516A': '#B6C1D1',
  // Secondary ink.
  '64748B': DARK_THEME.secondaryText,
  '667085': DARK_THEME.secondaryText,
  '526176': DARK_THEME.secondaryText,
  '526179': DARK_THEME.secondaryText,
  '8792A4': DARK_THEME.secondaryText,
  '758196': DARK_THEME.secondaryText,
  '98A2B3': DARK_THEME.secondaryText,
  '66758C': DARK_THEME.secondaryText,
  '667587': DARK_THEME.secondaryText,
  '657188': DARK_THEME.secondaryText,
  '61708A': DARK_THEME.secondaryText,
  '475569': DARK_THEME.mutedText,
  // Brand purple stays the brand purple; only its pale tints move.
  '7137DD': '#8B5CF6',
  '6F28F5': '#8B5CF6',
  '8B27E9': '#9B6BFA',
  '641CFF': '#8B5CF6',
  '7C3AED': '#8B5CF6',
  '6D28D9': '#8B5CF6',
  '5121BF': '#7C4DEF',
  F0E7FF: DARK_THEME.accentSoft,
  F1EBFF: DARK_THEME.accentSoft,
  F1EBFE: DARK_THEME.accentSoft,
  F0E8FF: DARK_THEME.accentSoft,
  EEE5FF: DARK_THEME.accentSoft,
  EDE9FE: DARK_THEME.accentSoft,
  F3EAFE: DARK_THEME.accentSoft,
  F2EBFF: DARK_THEME.accentSoft,
  F3EEFF: DARK_THEME.accentSoft,
  F5ECFF: DARK_THEME.accentSoft,
  F2ECFC: DARK_THEME.accentSoft,
  EDE5FC: DARK_THEME.accentSoft,
  F0E6FF: DARK_THEME.accentSoft,
  EEE6FF: DARK_THEME.accentSoft,
  EEE8FA: DARK_THEME.accentSoft,
  // Destructive tints.
  FFF0F1: '#3A1620',
  FFF0F0: '#3A1620',
  FFF2F3: '#3A1620',
  FEF2F2: '#3A1620',
  FEE4E2: '#3A1620',
  // The chat and broadcast threads, a shade under the page so a bubble lifts
  // off them the way it does on white.
  FBFAFE: '#0E1728',
  FCFBFE: '#0E1728',
};

/** The hue and saturation of the dark ramp above, which derived surfaces join. */
const THEME_HUE = 219;
const THEME_SATURATION = 0.38;

function clamp(value: number, low = 0, high = 1): number {
  return value < low ? low : value > high ? high : value;
}

/** '#abc' / '#aabbccdd' / 'abc' -> 'AABBCC', or '' when it is not hex. */
function normalizeHex(value: string): string {
  const digits = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(digits)) { return ''; }
  if (digits.length === 3 || digits.length === 4) {
    return digits.slice(0, 3).split('').map(character => character + character).join('').toUpperCase();
  }
  if (digits.length === 6 || digits.length === 8) { return digits.slice(0, 6).toUpperCase(); }
  return '';
}

function toHsl(hex: string): {hue: number; saturation: number; lightness: number} {
  const red = parseInt(hex.slice(0, 2), 16) / 255;
  const green = parseInt(hex.slice(2, 4), 16) / 255;
  const blue = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const span = max - min;
  if (!span) { return {hue: 0, saturation: 0, lightness}; }

  const saturation = span / (1 - Math.abs(2 * lightness - 1));
  const hue = max === red
    ? ((green - blue) / span + (green < blue ? 6 : 0))
    : max === green ? (blue - red) / span + 2 : (red - green) / span + 4;
  return {hue: hue * 60, saturation, lightness};
}

function toHex({hue, saturation, lightness}: {hue: number; saturation: number; lightness: number}): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = ((((hue % 360) + 360) % 360) / 60);
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] = sector < 1 ? [chroma, second, 0]
    : sector < 2 ? [second, chroma, 0]
    : sector < 3 ? [0, chroma, second]
    : sector < 4 ? [0, second, chroma]
    : sector < 5 ? [second, 0, chroma]
    : [chroma, 0, second];
  const offset = lightness - chroma / 2;
  const channel = (value: number) => Math.round(clamp(value + offset) * 255).toString(16).padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase();
}

/**
 * The fallback for any colour the curated table does not name.
 *
 * Near-neutral colours are the app's surfaces and inks, so their lightness is
 * flipped onto the dark scale. Saturated colours are brand or status colours,
 * so hue and saturation survive and only lightness is pulled into a band that
 * reads on a dark surface.
 */
function deriveDark(hex: string): string {
  const {hue, saturation, lightness} = toHsl(hex);

  // A near-white with the faintest tint - #FBFAFE, the chat thread's background -
  // has a very high HSL saturation even though the tint is invisible, so it has
  // to be read as a surface. Left in the saturated branch it would come back as
  // a deep, thoroughly purple slab.
  if (saturation <= 0.14 || lightness >= 0.945) {
    // Light greys are this app's pages, sections and fields. They land on the
    // theme's own navy ramp rather than keeping a hue that means nothing at that
    // lightness, so the dozens of near-identical off-whites across the app come
    // out as the same few tones the curated ones use.
    if (lightness >= 0.7) {
      const step = lightness >= 0.955 ? 0.13 : lightness >= 0.88 ? 0.18 : 0.26;
      return toHex({hue: THEME_HUE, saturation: THEME_SATURATION, lightness: step});
    }

    const darkLightness = lightness >= 0.45 ? clamp(lightness + 0.12, 0, 0.78) : clamp(1 - lightness * 0.55, 0.62, 0.97);
    return toHex({hue, saturation: Math.min(saturation, 0.14) * 0.8, lightness: darkLightness});
  }

  const darkLightness = lightness >= 0.86 ? 0.22
    : lightness >= 0.7 ? clamp(lightness - 0.32, 0.28, 0.5)
    : lightness < 0.42 ? clamp(lightness + 0.16, 0, 0.7)
    : lightness;
  return toHex({hue, saturation: clamp(saturation, 0, 0.82), lightness: darkLightness});
}

const resolved = new Map<string, string>();

/**
 * The dark-theme counterpart of a background, border or other surface. Anything
 * this cannot reason about - `transparent`, a gradient token, a number - comes
 * back untouched, so a style that uses one is simply left alone.
 */
export function darkSurface(value: unknown): string {
  if (typeof value !== 'string') { return value as string; }
  const color = value.trim();
  if (!color || color === 'transparent') { return value; }

  const cached = resolved.get(color);
  if (cached !== undefined) { return cached; }

  const dark = resolveDark(color);
  resolved.set(color, dark);
  return dark;
}

/**
 * A translucent colour is a scrim, a shadow or a glass highlight rather than a
 * surface: it is composited over whatever is behind it and already works in both
 * themes. Flipping one is how a dim backdrop turns into a white sheet over the
 * app, so they are left exactly as written.
 */
function isTranslucent(color: string): boolean {
  const parts = /^rgba\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+\s*[,/]\s*([\d.]+)\s*\)$/i.exec(color);
  if (parts) { return Number(parts[1]) < 1; }

  const digits = color.trim().replace(/^#/, '');
  if (digits.length === 8 && /^[0-9a-fA-F]+$/.test(digits)) { return parseInt(digits.slice(6), 16) < 255; }
  if (digits.length === 4 && /^[0-9a-fA-F]+$/.test(digits)) { return parseInt(digits[3], 16) < 15; }
  return false;
}

/** How much lighter a surface is allowed to get, which is how far a brand colour moves. */
const SURFACE_BRIGHTEN_LIMIT = 0.15;

/**
 * A surface never gets much lighter in the dark theme.
 *
 * The curated table maps the app's dark navies onto light values, because that
 * is what they mean as text. The same navy behind a dark toast or a video
 * control means the opposite, and there is no way to tell the two apart from the
 * colour alone - so a replacement that would brighten a surface sharply is
 * dropped and the original kept. A small lift is still allowed, which is what
 * lets the brand purple brighten a little against a dark background.
 */
function surfaceDark(hex: string): string {
  const candidate = CURATED[hex] || deriveDark(hex);
  const replacement = normalizeHex(candidate);
  if (!replacement) { return candidate; }

  const lift = toHsl(replacement).lightness - toHsl(hex).lightness;
  return lift > SURFACE_BRIGHTEN_LIMIT ? `#${hex}` : candidate;
}

function resolveDark(color: string): string {
  // High-opacity white is used for call controls over video. It is a surface,
  // unlike a dim scrim or a faint highlight, and needs a dark counterpart.
  const whitePanel = /^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*(0?\.\d+|1(?:\.0+)?)\s*\)$/i.exec(color);
  if (whitePanel && Number(whitePanel[1]) >= 0.75) {
    const rgb = DARK_THEME.surface.slice(1).match(/../g)!.map(value => parseInt(value, 16));
    return `rgba(${rgb.join(',')},${whitePanel[1]})`;
  }
  if (isTranslucent(color)) { return color; }

  const parts = /^rgb\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*\)$/i.exec(color);
  if (parts) {
    const light = normalizeHex([parts[1], parts[2], parts[3]]
      .map(part => Math.round(clamp(Number(part), 0, 255)).toString(16).padStart(2, '0'))
      .join(''));
    return light ? surfaceDark(light) : color;
  }

  if (color.toLowerCase() === 'white') { return DARK_THEME.surface; }
  if (color.toLowerCase() === 'black') { return color; }

  const hex = normalizeHex(color);
  if (!hex) { return color; }
  // Pure black is deliberate - media viewers and camera chrome - so it stays.
  if (hex === '000000') { return color; }

  return surfaceDark(hex);
}

/**
 * The dark counterpart of an icon colour, for the hex literals written straight
 * onto `react-native-svg` props.
 *
 * Only inks that are already dark are lifted. A white or pale glyph is almost
 * always knocked out of a coloured button or an avatar, and those backgrounds
 * do not change with the theme, so recolouring it would be what made it
 * disappear.
 */
export function darkInk(value: unknown): string {
  if (typeof value !== 'string') { return value as string; }
  if (isTranslucent(value)) { return value; }
  const hex = normalizeHex(value);
  if (!hex) { return value; }
  if (hex === '000000') { return '#E8ECF3'; }

  // Anything this light already reads on a dark surface, and is the case that
  // must not be touched: it is knocked out of something coloured.
  const {hue, saturation, lightness} = toHsl(hex);
  if (lightness > 0.62) { return value; }
  if (CURATED[hex]) { return CURATED[hex]; }

  // `deriveDark` cannot be used here: it reads a dark navy or slate as a
  // saturated brand colour - their HSL saturation really is high - and nudges it
  // by a little, which leaves text almost as dark as the surface behind it. An
  // ink instead lands in a band that reads on a dark surface, keeping its hue so
  // a red stays a red.
  return toHex({hue, saturation, lightness: clamp(0.94 - lightness * 0.5, 0.64, 0.94)});
}
