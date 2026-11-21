// Sprint 11 Story 2 - Theme Selection.
//
// One provider owns the choice for the whole app. It reads the device copy first
// so the app opens in the theme it was left in, then reconciles with
// `GET /api/preferences/theme` once there is a session, so the theme follows the
// account onto another device.
//
// The wireframe asks for both Instant Apply and Save Changes, which the sheet
// resolves as preview-then-commit: `previewPreference` repaints the app the
// moment a radio is tapped, `savePreference` writes it to the device and the
// server, and `cancelPreview` puts back the last saved theme when the sheet is
// dismissed without saving. Nothing is left applied that was not saved.

import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Appearance, AppState, StyleSheet} from 'react-native';
import {
  getThemePreference,
  loadStoredThemePreference,
  storeThemePreference,
  updateThemePreference,
} from '../services/preferencesApi';
import {getToken, subscribeToSessionChange} from '../services/sessionStore';
import {THEME_PREFERENCE_LABELS, normalizeThemePreference, type ThemeMode, type ThemePreference} from './palette';
import {setActiveThemeMode} from './themedStyles';

export type ThemeContextValue = {
  /** The theme being painted right now, which may be an unsaved preview. */
  preference: ThemePreference;
  /** The theme that has been committed to the device and the server. */
  savedPreference: ThemePreference;
  /** What `preference` resolves to once System Default is followed. */
  mode: ThemeMode;
  isDark: boolean;
  /** The label the design shows in the Appearance status pill. */
  label: string;
  /** True while a preview differs from what has been saved. */
  dirty: boolean;
  saving: boolean;
  error: string;
  previewPreference: (preference: ThemePreference) => void;
  savePreference: (preference?: ThemePreference) => Promise<boolean>;
  cancelPreview: () => void;
};

const FALLBACK: ThemeContextValue = {
  preference: 'system',
  savedPreference: 'system',
  mode: 'light',
  isDark: false,
  label: THEME_PREFERENCE_LABELS.system,
  dirty: false,
  saving: false,
  error: '',
  previewPreference: () => {},
  savePreference: async () => false,
  cancelPreview: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(FALLBACK);

/**
 * The theme for the surrounding tree. Outside a `ThemeProvider` - which is how
 * a screen renders in a unit test - this answers the light theme, so a screen
 * never has to guard against the provider being absent.
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

const THEME_FADE_MS = 190;
/** Coming back to the app re-reads the account at most this often. */
const FOREGROUND_SYNC_INTERVAL_MS = 15000;

export function ThemeProvider({children}: {children: React.ReactNode}): React.JSX.Element {
  const [systemScheme, setSystemScheme] = useState(() => Appearance.getColorScheme());
  const [savedPreference, setSavedPreference] = useState<ThemePreference>('system');
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const mode: ThemeMode = preference === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : preference;

  // A StyleSheet is built once at module load, so the rules a screen renders
  // with are chosen when they are read rather than when they are defined. This
  // has to happen during render, before any child reads a style.
  setActiveThemeMode(mode);

  // Native alerts, pickers and modal chrome must use the same preference.
  // Clearing the override lets System Default resume following OS changes.
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({colorScheme}) => {
      setSystemScheme(colorScheme);
    });
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') { setSystemScheme(Appearance.getColorScheme()); }
    });
    return () => {
      subscription.remove();
      foreground.remove();
    };
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
    // setColorScheme updates Appearance's cache without necessarily emitting a
    // change event. Read it back so clearing a fixed theme also repaints JS.
    setSystemScheme(Appearance.getColorScheme());
  }, [preference]);

  // Set while the Theme sheet shows an unsaved choice, so a sync from the
  // account moves the saved theme underneath it without repainting it away.
  const previewing = useRef(false);
  const accountApplied = useRef(false);
  const lastSyncAt = useRef(0);
  const syncRequest = useRef(0);
  const localWriteRevision = useRef(0);
  const savingRef = useRef(false);

  /**
   * Reads the account's theme (`GET /api/preferences/theme`) and applies it.
   * Runs whenever there is a session to read it with: the saved session being
   * restored at launch, a fresh sign-in - so a second device takes the
   * account's theme without a restart - and the app coming back to the
   * foreground, which picks up a change made on another device.
   */
  const syncFromAccount = useCallback(async () => {
    const token = getToken();
    if (!token || savingRef.current) { return; }
    const request = ++syncRequest.current;
    lastSyncAt.current = Date.now();
    try {
      const remote = await getThemePreference();
      if (request !== syncRequest.current || token !== getToken()) { return; }
      accountApplied.current = true;
      if (!previewing.current) { setPreference(remote); }
      setSavedPreference(remote);
      await storeThemePreference(remote);
    } catch {
      // An unreachable server leaves the device copy in charge.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const localRevision = localWriteRevision.current;

    loadStoredThemePreference().then(stored => {
      // The device copy only paints the first frames; once the account has
      // answered it no longer gets a say.
      if (cancelled || !stored || accountApplied.current || localRevision !== localWriteRevision.current) { return; }
      setSavedPreference(stored);
      if (!previewing.current) { setPreference(stored); }
    }).catch(() => undefined);

    syncFromAccount().catch(() => undefined);
    const unsubscribe = subscribeToSessionChange(current => {
      if (current?.token) { syncFromAccount().catch(() => undefined); }
    });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active' && Date.now() - lastSyncAt.current > FOREGROUND_SYNC_INTERVAL_MS) {
        syncFromAccount().catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      appState.remove();
    };
  }, [syncFromAccount]);

  const previewPreference = useCallback((next: ThemePreference) => {
    previewing.current = true;
    setError('');
    setPreference(normalizeThemePreference(next));
  }, []);

  const cancelPreview = useCallback(() => {
    previewing.current = false;
    setError('');
    setPreference(savedPreference);
  }, [savedPreference]);

  const savePreference = useCallback(async (next?: ThemePreference) => {
    if (savingRef.current) { return false; }
    savingRef.current = true;
    syncRequest.current += 1;
    localWriteRevision.current += 1;
    previewing.current = false;
    const chosen = normalizeThemePreference(next ?? preference);
    setPreference(chosen);
    setError('');
    setSaving(true);
    // The device copy is written first so the choice survives a restart even if
    // the request fails.
    await storeThemePreference(chosen);
    setSavedPreference(chosen);

    if (!getToken()) {
      savingRef.current = false;
      setSaving(false);
      return true;
    }

    try {
      const stored = await updateThemePreference(chosen);
      if (stored !== chosen) {
        if (!previewing.current) { setPreference(stored); }
        setSavedPreference(stored);
        await storeThemePreference(stored);
      }
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your theme could not be saved.');
      // The theme stays applied: it is saved on this device, only not synced.
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [preference]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    savedPreference,
    mode,
    isDark: mode === 'dark',
    label: THEME_PREFERENCE_LABELS[preference],
    dirty: preference !== savedPreference,
    saving,
    error,
    previewPreference,
    savePreference,
    cancelPreview,
  }), [preference, savedPreference, mode, saving, error, previewPreference, savePreference, cancelPreview]);

  return (
    <ThemeContext.Provider value={value}>
      <ThemeTransition mode={mode}>{children}</ThemeTransition>
    </ThemeContext.Provider>
  );
}

/**
 * The wireframe's Theme Animation: the app cross-fades rather than snapping from
 * one palette to the other. The first paint is not animated, so launching the
 * app does not flash.
 */
function ThemeTransition({mode, children}: {mode: ThemeMode; children: React.ReactNode}): React.JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;
  const painted = useRef<ThemeMode | null>(null);

  useEffect(() => {
    if (painted.current === null) {
      painted.current = mode;
      return;
    }
    if (painted.current === mode) { return; }
    painted.current = mode;

    opacity.setValue(0.35);
    const fade = Animated.timing(opacity, {toValue: 1, duration: THEME_FADE_MS, useNativeDriver: true});
    fade.start();
    return () => fade.stop();
  }, [mode, opacity]);

  return <Animated.View style={[styles.fill, {opacity}]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({fill: {flex: 1}});
