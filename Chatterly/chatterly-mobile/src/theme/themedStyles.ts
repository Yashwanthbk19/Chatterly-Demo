// Sprint 11 Story 2 - applying the theme to a screen.
//
// `createThemedStyles` wraps a StyleSheet so a screen only has to change the one
// line that builds it:
//
//   const styles = createThemedStyles({root: {backgroundColor: '#FFFFFF'}});
//
// Every rule is exposed as a getter that reads the mode that is active at the
// moment the style is used, so `styles.root` is the light rule in light mode and
// the derived dark rule in dark mode. Nothing inside the components changes, and
// in light mode the object handed back is the very same rule the screen always
// had - so light mode cannot regress.
//
// The mode is module state rather than context because a StyleSheet is built
// once at module load, long before any provider renders. `ThemeProvider` sets it
// and then re-renders the tree, which is what makes the new rules appear.

import {StyleSheet, type ImageStyle, type TextStyle, type ViewStyle} from 'react-native';
import {darkInk, darkSurface, type ThemeMode} from './palette';

type Rule = Record<string, unknown>;

/** The same constraint `StyleSheet.create` uses, so style literals still narrow. */
type NamedStyles<T> = {[P in keyof T]: ViewStyle | TextStyle | ImageStyle};

/**
 * Surfaces flip: a white card becomes a dark card, a light border becomes a dark
 * one. `shadowColor` and `textShadowColor` are deliberately absent, because a
 * shadow is dark in both themes and lifting it would turn every card into a
 * white halo.
 */
const SURFACE_PROPERTIES = new Set([
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'borderStartColor',
  'borderEndColor',
  'borderBlockColor',
  'borderBlockStartColor',
  'borderBlockEndColor',
  'overlayColor',
]);

/**
 * Inks only get lifted, never darkened. Text that is already light in the light
 * theme is knocked out of something coloured - a purple button, an avatar, a
 * badge - and that background does not change with the theme, so darkening the
 * text is what would make it disappear.
 */
const INK_PROPERTIES = new Set([
  'color',
  'textDecorationColor',
  'tintColor',
]);

let activeMode: ThemeMode = 'light';

/** Called by `ThemeProvider` before it re-renders the tree. */
export function setActiveThemeMode(mode: ThemeMode): void {
  activeMode = mode;
}

export function activeThemeMode(): ThemeMode {
  return activeMode;
}

export function isDarkTheme(): boolean {
  return activeMode === 'dark';
}

/**
 * The theme's version of an icon colour, for the hex literals written straight
 * onto `react-native-svg` props. Those are props rather than styles, so the
 * StyleSheet walker never sees them and each one is passed through here instead.
 */
export function themeInk(color: string): string {
  return activeMode === 'dark' ? darkInk(color) : color;
}

/** The dark counterpart of one style rule. */
export function darkenRule<T extends Rule>(rule: T): T {
  let changed = false;
  const dark: Rule = {};

  for (const [property, value] of Object.entries(rule)) {
    const convert = typeof value !== 'string' ? null
      : SURFACE_PROPERTIES.has(property) ? darkSurface
      : INK_PROPERTIES.has(property) ? darkInk
      : null;

    if (convert) {
      const replacement = convert(value);
      dark[property] = replacement;
      changed = changed || replacement !== value;
    } else {
      dark[property] = value;
    }
  }

  return (changed ? dark : rule) as T;
}

export type ThemedStyleOptions<T> = {
  /**
   * Rules that are already dark by design - a media viewer, camera chrome, the
   * in-call surfaces - and so must be left exactly as they are.
   */
  keep?: readonly (keyof T)[];
};

/**
 * A StyleSheet that follows the active theme. Pass the same object literal
 * `StyleSheet.create` would take.
 */
export function createThemedStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  definitions: T & NamedStyles<any>,
  options: ThemedStyleOptions<T> = {},
): T {
  const light = StyleSheet.create(definitions);
  const kept = new Set<unknown>(options.keep || []);
  const dark: Partial<Record<keyof T, unknown>> = {};
  const themed = {} as T;

  for (const name of Object.keys(light) as (keyof T)[]) {
    Object.defineProperty(themed, name, {
      enumerable: true,
      configurable: true,
      get() {
        const rule = light[name];
        if (activeMode !== 'dark' || kept.has(name) || !rule || typeof rule !== 'object') { return rule; }
        if (dark[name] === undefined) { dark[name] = darkenRule(rule as Rule); }
        return dark[name];
      },
    });
  }

  return themed;
}
