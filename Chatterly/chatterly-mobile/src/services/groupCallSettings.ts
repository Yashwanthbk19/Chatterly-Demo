import AsyncStorage from '@react-native-async-storage/async-storage';
import {getSession} from './sessionStore';

// In-call preferences for Sprint 9 Story 2 (the Settings screen, the Video
// Effects sheet, Microphone Settings and Audio Output). They belong to the
// device rather than the account - the backend has no preference route for
// conference options - so they are cached per signed-in user the same way
// conversationPreferences caches a muted thread, and survive between calls.

export type GroupCallDefaultView = 'Grid View' | 'Speaker View';
export type GroupCallGridSize = '4' | '8 (Default)' | '12' | '16';
export type GroupCallNotificationSound = 'Default' | 'Bell' | 'Chime' | 'Digital' | 'Silent';
export type GroupCallVideoQuality = '360p (SD)' | '480p (SD)' | '720p (HD)' | '1080p (Full HD)';
/**
 * The loudspeaker or the earpiece ("Headset" in the design). Headsets and
 * "No Audio" are chosen per call from the devices actually connected (see
 * callAudioRoutes), so only these two are remembered between calls.
 */
export type GroupCallAudioOutput = 'Speaker' | 'Headset';
export type GroupCallVideoEffect = 'None' | 'Blur' | 'Office' | 'Home' | 'Forest';

export type GroupCallSettings = {
  // General
  showReactions: boolean;
  showParticipantNames: boolean;
  playJoinLeaveSounds: boolean;
  focusOnSpeaker: boolean;
  // Layout
  defaultView: GroupCallDefaultView;
  gridSize: GroupCallGridSize;
  // Notifications
  notifyWhenSomeoneSpeaks: boolean;
  notificationSound: GroupCallNotificationSound;
  // Network
  lowBandwidthMode: boolean;
  networkQualityIndicator: boolean;
  adaptiveBitrate: boolean;
  videoQuality: GroupCallVideoQuality;
  screenShareQuality: GroupCallVideoQuality;
  // Audio pipeline
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoReconnect: boolean;
  audioOutput: GroupCallAudioOutput;
  // Video effects
  videoEffect: GroupCallVideoEffect;
  mirrorVideo: boolean;
};

export const GROUP_CALL_DEFAULT_VIEWS: GroupCallDefaultView[] = ['Grid View', 'Speaker View'];
export const GROUP_CALL_GRID_SIZES: GroupCallGridSize[] = ['4', '8 (Default)', '12', '16'];
export const GROUP_CALL_NOTIFICATION_SOUNDS: GroupCallNotificationSound[] = ['Default', 'Bell', 'Chime', 'Digital', 'Silent'];
export const GROUP_CALL_VIDEO_QUALITIES: GroupCallVideoQuality[] = ['360p (SD)', '480p (SD)', '720p (HD)', '1080p (Full HD)'];
export const GROUP_CALL_AUDIO_OUTPUTS: GroupCallAudioOutput[] = ['Speaker', 'Headset'];
export const GROUP_CALL_VIDEO_EFFECTS: GroupCallVideoEffect[] = ['None', 'Blur', 'Office', 'Home', 'Forest'];

export const DEFAULT_GROUP_CALL_SETTINGS: GroupCallSettings = {
  showReactions: true,
  showParticipantNames: true,
  playJoinLeaveSounds: true,
  focusOnSpeaker: true,
  defaultView: 'Grid View',
  gridSize: '8 (Default)',
  notifyWhenSomeoneSpeaks: true,
  notificationSound: 'Chime',
  lowBandwidthMode: true,
  networkQualityIndicator: true,
  adaptiveBitrate: true,
  videoQuality: '720p (HD)',
  screenShareQuality: '720p (HD)',
  echoCancellation: true,
  noiseSuppression: true,
  autoReconnect: true,
  audioOutput: 'Speaker',
  videoEffect: 'None',
  mirrorVideo: true,
};

const PREFIX = 'chatterly.group-call-settings.v1';

const storageKey = () => `${PREFIX}.${encodeURIComponent(String(getSession()?.user?.id || 'anonymous'))}`;

/** How many tiles the grid renders per page, parsed from the Grid Size choice. */
export function gridSizeLimit(settings: Pick<GroupCallSettings, 'gridSize'>): number {
  const parsed = parseInt(settings.gridSize, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}

/**
 * The capture height Video Quality asks for. Low Bandwidth Mode caps it, which
 * is exactly what its "Optimize video quality" subtitle promises.
 */
export function captureVideoHeight(settings: Pick<GroupCallSettings, 'videoQuality' | 'lowBandwidthMode'>): number {
  const parsed = parseInt(settings.videoQuality, 10);
  const requested = Number.isFinite(parsed) && parsed > 0 ? parsed : 720;
  return settings.lowBandwidthMode ? Math.min(requested, 480) : requested;
}

export async function loadGroupCallSettings(): Promise<GroupCallSettings> {
  try {
    const stored = await AsyncStorage.getItem(storageKey());
    if (!stored) { return DEFAULT_GROUP_CALL_SETTINGS; }
    const parsed = JSON.parse(stored) as Partial<GroupCallSettings>;
    // Spread over the defaults so a stored blob written by an older build - or
    // one a user downgraded from - can never leave a field undefined. Older
    // builds also stored a fixed device name ("JBL Flip 5") or "No Audio".
    return {
      ...DEFAULT_GROUP_CALL_SETTINGS,
      ...parsed,
      audioOutput: parsed.audioOutput === 'Headset' ? 'Headset' : 'Speaker',
    };
  } catch {
    return DEFAULT_GROUP_CALL_SETTINGS;
  }
}

export async function saveGroupCallSettings(settings: GroupCallSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(), JSON.stringify(settings));
  } catch {
    // A full or unavailable store must never interrupt a live call; the
    // settings simply fall back to the defaults on the next launch.
  }
}
