import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {getToken, subscribeToSessionChange} from '../services/sessionStore';
import {
  DEFAULT_CHAT_WALLPAPER,
  getChatWallpaper,
  loadStoredChatWallpaper,
  loadSyncedChatWallpaperValue,
  normalizeChatWallpaper,
  storeChatWallpaper,
  storeSyncedChatWallpaperValue,
  updateChatWallpaper,
  wallpaperFromApiValue,
  wallpaperToApiValue,
  type ChatWallpaperPreference,
} from '../services/preferencesApi';
import {wallpaperImageForSync} from './wallpaperSyncImage';

type ChatWallpaperContextValue = {
  wallpaper: ChatWallpaperPreference;
  saving: boolean;
  applyWallpaper: (wallpaper: ChatWallpaperPreference) => Promise<boolean>;
};

const FALLBACK: ChatWallpaperContextValue = {
  wallpaper: DEFAULT_CHAT_WALLPAPER,
  saving: false,
  applyWallpaper: async () => false,
};

/** Coming back to the app re-reads the account at most this often. */
const FOREGROUND_SYNC_INTERVAL_MS = 15000;

const ChatWallpaperContext = createContext<ChatWallpaperContextValue>(FALLBACK);

export function useChatWallpaper(): ChatWallpaperContextValue {
  return useContext(ChatWallpaperContext);
}

function isDeviceOnlyImage(wallpaper: ChatWallpaperPreference): boolean {
  return wallpaper.type === 'image' && /^(file|content|ph):/i.test(wallpaper.value);
}

/**
 * Sprint 11 Story 3: the chat wallpaper, on this device and on the account.
 *
 * The account copy (`/api/preferences/chat-wallpaper`, one string) is read
 * whenever there is a session to read it with - the saved session restored at
 * launch, a fresh sign-in, and a return to the foreground - so a wallpaper set
 * on one device shows on the others without a restart. A gallery or camera
 * photo syncs as a small inline copy (see wallpaperSyncImage) while the device
 * that chose it keeps the original.
 *
 * Transparency and the bubble colour stay on the device: the Preference model
 * has a single wallpaper string and no field for either, and the web client
 * keeps them locally for the same reason.
 */
export function ChatWallpaperProvider({children}: {children: React.ReactNode}): React.JSX.Element {
  const [wallpaper, setWallpaperState] = useState<ChatWallpaperPreference>(DEFAULT_CHAT_WALLPAPER);
  const [saving, setSaving] = useState(false);
  const wallpaperRef = useRef<ChatWallpaperPreference | null>(null);
  // A rejected preference request must not turn a locally applied wallpaper
  // into an error. Once a sync fails, Apply stays device-local until the next
  // successful read (a new session, or a later return to the app).
  const syncAvailable = useRef(true);
  const accountApplied = useRef(false);
  const lastSyncAt = useRef(0);

  const setWallpaper = useCallback((next: ChatWallpaperPreference) => {
    wallpaperRef.current = next;
    setWallpaperState(next);
  }, []);

  /** Uploads a photo chosen on this device; false when it cannot be synced. */
  const pushDeviceImage = useCallback(async (image: ChatWallpaperPreference): Promise<boolean> => {
    const inline = await wallpaperImageForSync(image.value).catch(() => null);
    if (!inline) { return false; }
    const stored = await updateChatWallpaper(inline);
    await storeSyncedChatWallpaperValue(stored);
    return true;
  }, []);

  const syncFromAccount = useCallback(async () => {
    if (!getToken()) { return; }
    lastSyncAt.current = Date.now();
    try {
      const [remoteValue, syncedValue] = await Promise.all([getChatWallpaper(), loadSyncedChatWallpaperValue()]);
      syncAvailable.current = true;
      accountApplied.current = true;
      const local = wallpaperRef.current;

      if (local && isDeviceOnlyImage(local)) {
        // The account still holds the copy this device uploaded: keep showing
        // the full-resolution original.
        if (syncedValue !== null && remoteValue === syncedValue) { return; }
        // A photo chosen here before it could be synced, and the account has
        // nothing newer: upload it now instead of discarding it.
        if (!remoteValue && syncedValue === null) {
          await pushDeviceImage(local).catch(() => false);
          return;
        }
      }

      const remote = wallpaperFromApiValue(remoteValue, local || undefined);
      setWallpaper(remote);
      await storeChatWallpaper(remote);
      await storeSyncedChatWallpaperValue(remoteValue);
    } catch {
      // Offline or signed out: the device copy stays in charge.
      syncAvailable.current = false;
    }
  }, [pushDeviceImage, setWallpaper]);

  useEffect(() => {
    let cancelled = false;
    loadStoredChatWallpaper().then(local => {
      // The device copy paints the first frames; once the account has answered
      // it no longer gets a say.
      if (cancelled || !local || accountApplied.current) { return; }
      setWallpaper(local);
    }).catch(() => undefined).finally(() => {
      // Read the account after the device copy, so a photo kept on this device
      // is known when the account's value is compared with it.
      if (!cancelled) { syncFromAccount().catch(() => undefined); }
    });

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
  }, [setWallpaper, syncFromAccount]);

  const applyWallpaper = useCallback(async (next: ChatWallpaperPreference) => {
    const previous = wallpaperRef.current;
    const normalized = normalizeChatWallpaper(next);
    setWallpaper(normalized);
    setSaving(true);
    await storeChatWallpaper(normalized);

    if (!getToken() || !syncAvailable.current) {
      setSaving(false);
      return true;
    }

    try {
      if (isDeviceOnlyImage(normalized)) {
        // Only a new photo is uploaded; changing the bubble colour or the
        // transparency of the same photo changes nothing on the account.
        if (previous?.type === 'image' && previous.value === normalized.value) { return true; }
        await pushDeviceImage(normalized);
        return true;
      }

      const storedValue = await updateChatWallpaper(wallpaperToApiValue(normalized));
      await storeSyncedChatWallpaperValue(storedValue);
      const stored = wallpaperFromApiValue(storedValue, normalized);
      setWallpaper(stored);
      await storeChatWallpaper(stored);
      return true;
    } catch {
      syncAvailable.current = false;
      // The Apply action has succeeded on this device. Preference sync is a
      // background enhancement and must not expose a stale-session response or
      // discard/obscure the chosen wallpaper.
      return true;
    } finally {
      setSaving(false);
    }
  }, [pushDeviceImage, setWallpaper]);

  const value = useMemo(() => ({wallpaper, saving, applyWallpaper}), [wallpaper, saving, applyWallpaper]);
  return <ChatWallpaperContext.Provider value={value}>{children}</ChatWallpaperContext.Provider>;
}
