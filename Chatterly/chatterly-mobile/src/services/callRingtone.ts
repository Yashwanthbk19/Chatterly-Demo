import {createAudioPlayer, preload, setAudioModeAsync} from 'expo-audio';
import type {NotificationTone} from './notificationPreferencesApi';

export const CALL_RINGTONE_STATE = {
  CALLING: 'CALLING',
  INCOMING_RINGING: 'INCOMING_RINGING',
  OUTGOING_RINGING: 'OUTGOING_RINGING',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  ENDED: 'ENDED',
  TIMEOUT: 'TIMEOUT',
  FAILED: 'FAILED',
} as const;

export type CallRingtoneState = typeof CALL_RINGTONE_STATE[keyof typeof CALL_RINGTONE_STATE];
export type CallRingtoneOwner = object;

type RingingState =
  | typeof CALL_RINGTONE_STATE.INCOMING_RINGING
  | typeof CALL_RINGTONE_STATE.OUTGOING_RINGING;

type RingtonePlayer = ReturnType<typeof createAudioPlayer>;

const INCOMING_TONE_SOURCES: Record<NotificationTone, number> = {
  Default: require('../assets/sounds/incoming_call.wav'),
  Chime: require('../assets/sounds/incoming_call_chime.wav'),
  Bell: require('../assets/sounds/incoming_call_bell.wav'),
  Pop: require('../assets/sounds/incoming_call_pop.wav'),
};
const OUTGOING_TONE_SOURCE = require('../assets/sounds/outgoing_call.wav');

// Local assets are small and calls are time-sensitive. Loading them at module
// startup prevents the first ring from being lost while the native player
// prepares its source after an incoming socket/push event.
Object.values({...INCOMING_TONE_SOURCES, outgoing: OUTGOING_TONE_SOURCE}).forEach(source => {
  preload(source).catch(() => undefined);
});

let activeOwner: CallRingtoneOwner | null = null;
let activeRingingState: RingingState | null = null;
let activeTone: NotificationTone | null = null;
let activePlayer: RingtonePlayer | null = null;
let requestVersion = 0;

/** A short foreground cue when the other participant rejects an active call. */
export async function playCallRejectedTone(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: 'doNotMix',
    });
const player = createAudioPlayer(OUTGOING_TONE_SOURCE);    player.volume = 0.45;
    const subscription = player.addListener('playbackStatusUpdate', status => {
      if (status.didJustFinish) {
        subscription.remove();
        player.release();
      }
    });
    player.play();
  } catch {
    // Call state still updates if this device cannot play the local cue.
  }
}

/** Plays the selected notification sound once for previews and foreground alerts. */
let notificationPlayer: RingtonePlayer | null = null;
let notificationCleanup: (() => void) | null = null;
let notificationVersion = 0;

export function stopNotificationTone(): void {
  notificationVersion += 1;
  notificationCleanup?.();
}

export function playNotificationTonePreview(tone: NotificationTone): Promise<void> {
  return playNotificationTone(tone, true);
}

export async function playNotificationTone(tone: NotificationTone, preview = false): Promise<void> {
  const version = ++notificationVersion;
  notificationCleanup?.();
  try {
    await setAudioModeAsync({
      // Preview through the speaker; foreground alerts retain any live call's route.
      ...(preview ? {
        allowsRecording: false,
        allowsBackgroundRecording: false,
        shouldRouteThroughEarpiece: false,
      } : {}),
      playsInSilentMode: preview,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
    if (version !== notificationVersion) return;
    const player = createAudioPlayer(INCOMING_TONE_SOURCES[tone]);
    notificationPlayer = player;
    player.volume = 0.5;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = player.addListener('playbackStatusUpdate', status => {
      if (status.didJustFinish) cleanup();
    });
    const cleanup = () => {
      if (notificationPlayer !== player) return;
      notificationPlayer = null;
      notificationCleanup = null;
      if (timer) clearTimeout(timer);
      subscription.remove();
      try { player.pause(); } catch { /* The player may already be stopped. */ }
      try { player.release(); } catch { /* Native cleanup is best effort. */ }
    };
    notificationCleanup = cleanup;
    // Also release if the platform never reports completion (e.g. an interruption).
    timer = setTimeout(cleanup, 10000);
    player.play();
  } catch {
    if (version === notificationVersion) notificationCleanup?.();
    // Notification delivery must continue if a local preview cannot play.
  }
}

const isRingingState = (state: CallRingtoneState): state is RingingState =>
  state === CALL_RINGTONE_STATE.INCOMING_RINGING || state === CALL_RINGTONE_STATE.OUTGOING_RINGING;

function releaseActivePlayer(): void {
  const player = activePlayer;
  activePlayer = null;
  if (!player) { return; }

  // The player is owned here instead of by useAudioPlayer, so pause and release
  // have a deterministic order on Android and cannot race hook cleanup.
  try { player.pause(); } catch { /* The native player may already be unavailable during shutdown. */ }
  try { player.release(); } catch { /* Releasing twice must never keep a call screen alive. */ }
}

export function stopCallRingtone(owner?: CallRingtoneOwner): void {
  if (owner && activeOwner !== owner) { return; }
  requestVersion += 1;
  activeOwner = null;
  activeRingingState = null;
  activeTone = null;
  releaseActivePlayer();
}

export async function setCallRingtoneState(
  owner: CallRingtoneOwner,
  state: CallRingtoneState,
  tone: NotificationTone = 'Default',
  speaker = false,
): Promise<void> {
  if (!isRingingState(state)) {
    stopCallRingtone(owner);
    return;
  }

  // Mark the requested state before awaiting the native audio session. This
  // also deduplicates effects that render again while player creation is still
  // pending.
  if (activeOwner === owner && activeRingingState === state && activeTone === tone) { return; }

  const version = ++requestVersion;
  activeOwner = owner;
  activeRingingState = state;
  activeTone = tone;
  releaseActivePlayer();

  const incoming = state === CALL_RINGTONE_STATE.INCOMING_RINGING;
  // Incoming audio must use the loudspeaker, even if a previous voice message
  // or call left the session routed through the earpiece. Outgoing ringback
  // keeps recording enabled because WebRTC prepares the microphone while it
  // waits for the receiver.
  await setAudioModeAsync({
    allowsRecording: !incoming,
    allowsBackgroundRecording: !incoming,
    interruptionMode: 'doNotMix',
    // Incoming ringers follow the device silent switch / ringer mode.
    playsInSilentMode: !incoming,
    shouldPlayInBackground: true,
    shouldRouteThroughEarpiece: !incoming && !speaker,
  }).catch(() => undefined);

  if (version !== requestVersion || activeOwner !== owner) { return; }

  try {
    const source = incoming ? INCOMING_TONE_SOURCES[tone] : OUTGOING_TONE_SOURCE;
    const player = createAudioPlayer(source, {keepAudioSessionActive: true});
    if (version !== requestVersion || activeOwner !== owner) {
      player.release();
      return;
    }
    player.loop = true;
    player.volume = state === CALL_RINGTONE_STATE.INCOMING_RINGING ? 0.85 : 0.32;
    activePlayer = player;
    player.play();
  } catch {
    if (version === requestVersion && activeOwner === owner) {
      activeOwner = null;
      activeRingingState = null;
      releaseActivePlayer();
    }
  }
}

export function incomingRingtoneState(status?: string): CallRingtoneState {
  switch (String(status || '').toLowerCase()) {
    case 'calling':
    case 'ringing': return CALL_RINGTONE_STATE.INCOMING_RINGING;
    case 'connecting': return CALL_RINGTONE_STATE.CONNECTING;
    case 'connected': return CALL_RINGTONE_STATE.CONNECTED;
    case 'rejected': return CALL_RINGTONE_STATE.REJECTED;
    case 'cancelled':
    case 'canceled': return CALL_RINGTONE_STATE.CANCELLED;
    case 'ended':
    case 'completed': return CALL_RINGTONE_STATE.ENDED;
    case 'missed':
    case 'timeout': return CALL_RINGTONE_STATE.TIMEOUT;
    default: return CALL_RINGTONE_STATE.FAILED;
  }
}

export function outgoingRingtoneState(status?: string): CallRingtoneState {
  switch (String(status || '').toLowerCase()) {
    case 'calling': return CALL_RINGTONE_STATE.CALLING;
    case 'ringing': return CALL_RINGTONE_STATE.OUTGOING_RINGING;
    case 'connecting': return CALL_RINGTONE_STATE.CONNECTING;
    case 'connected': return CALL_RINGTONE_STATE.CONNECTED;
    case 'rejected': return CALL_RINGTONE_STATE.REJECTED;
    case 'cancelled':
    case 'canceled': return CALL_RINGTONE_STATE.CANCELLED;
    case 'ended':
    case 'completed': return CALL_RINGTONE_STATE.ENDED;
    case 'missed':
    case 'timeout': return CALL_RINGTONE_STATE.TIMEOUT;
    default: return CALL_RINGTONE_STATE.FAILED;
  }
}
