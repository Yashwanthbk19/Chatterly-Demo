import {createAudioPlayer, setAudioModeAsync} from 'expo-audio';
import {
  CALL_RINGTONE_STATE,
  incomingRingtoneState,
  outgoingRingtoneState,
  playNotificationTone,
  playNotificationTonePreview,
  stopNotificationTone,
  setCallRingtoneState,
  stopCallRingtone,
} from '../src/services/callRingtone';

const audio = require('expo-audio');

beforeEach(() => {
  stopCallRingtone();
  stopNotificationTone();
  jest.clearAllMocks();
});

afterEach(() => { stopCallRingtone(); stopNotificationTone(); });

test('video ringback preserves the loudspeaker selected by the call', async () => {
  await setCallRingtoneState({}, CALL_RINGTONE_STATE.OUTGOING_RINGING, 'Default', true);
  expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({shouldRouteThroughEarpiece: false}));
});

test('maps every incoming call outcome to the required ringtone state', () => {
  expect(incomingRingtoneState('calling')).toBe(CALL_RINGTONE_STATE.INCOMING_RINGING);
  expect(incomingRingtoneState('connecting')).toBe(CALL_RINGTONE_STATE.CONNECTING);
  expect(incomingRingtoneState('connected')).toBe(CALL_RINGTONE_STATE.CONNECTED);
  expect(incomingRingtoneState('rejected')).toBe(CALL_RINGTONE_STATE.REJECTED);
  expect(incomingRingtoneState('cancelled')).toBe(CALL_RINGTONE_STATE.CANCELLED);
  expect(incomingRingtoneState('ended')).toBe(CALL_RINGTONE_STATE.ENDED);
  expect(incomingRingtoneState('missed')).toBe(CALL_RINGTONE_STATE.TIMEOUT);
  expect(incomingRingtoneState('failed')).toBe(CALL_RINGTONE_STATE.FAILED);
});

test('maps the full outgoing waiting and terminal lifecycle', () => {
  expect(outgoingRingtoneState('calling')).toBe(CALL_RINGTONE_STATE.CALLING);
  expect(outgoingRingtoneState('ringing')).toBe(CALL_RINGTONE_STATE.OUTGOING_RINGING);
  expect(outgoingRingtoneState('connecting')).toBe(CALL_RINGTONE_STATE.CONNECTING);
  expect(outgoingRingtoneState('connected')).toBe(CALL_RINGTONE_STATE.CONNECTED);
  expect(outgoingRingtoneState('rejected')).toBe(CALL_RINGTONE_STATE.REJECTED);
  expect(outgoingRingtoneState('cancelled')).toBe(CALL_RINGTONE_STATE.CANCELLED);
  expect(outgoingRingtoneState('completed')).toBe(CALL_RINGTONE_STATE.ENDED);
  expect(outgoingRingtoneState('timeout')).toBe(CALL_RINGTONE_STATE.TIMEOUT);
  expect(outgoingRingtoneState('reconnecting')).toBe(CALL_RINGTONE_STATE.FAILED);
});

test('loops the bundled incoming ringtone and stops it on connecting', async () => {
  const owner = {};
  await setCallRingtoneState(owner, CALL_RINGTONE_STATE.INCOMING_RINGING);

  expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
    allowsRecording: false,
    interruptionMode: 'doNotMix',
    playsInSilentMode: false,
    shouldPlayInBackground: true,
    shouldRouteThroughEarpiece: false,
  }));
  expect(createAudioPlayer).toHaveBeenCalledWith(
    expect.objectContaining({testUri: expect.stringContaining('incoming_call.wav')}),
    {keepAudioSessionActive: true},
  );
  expect(audio.__player.loop).toBe(true);
  expect(audio.__player.play).toHaveBeenCalledTimes(1);

  await setCallRingtoneState(owner, CALL_RINGTONE_STATE.CONNECTING);
  expect(audio.__player.pause).toHaveBeenCalledTimes(1);
  expect(audio.__player.release).toHaveBeenCalledTimes(1);
});

test('plays the selected incoming-call tone from notification preferences', async () => {
  const owner = {};
  await setCallRingtoneState(owner, CALL_RINGTONE_STATE.INCOMING_RINGING, 'Chime');

  expect(createAudioPlayer).toHaveBeenCalledWith(
    expect.objectContaining({testUri: expect.stringContaining('incoming_call_chime.wav')}),
    {keepAudioSessionActive: true},
  );
});

test.each([
  ['Default', 'incoming_call.wav'],
  ['Chime', 'incoming_call_chime.wav'],
  ['Bell', 'incoming_call_bell.wav'],
  ['Pop', 'incoming_call_pop.wav'],
] as const)('plays the %s notification tone once', async (tone, asset) => {
  await playNotificationTone(tone);

  expect(createAudioPlayer).toHaveBeenCalledWith(
    expect.objectContaining({testUri: expect.stringContaining(asset)}),
  );
  expect(audio.__player.play).toHaveBeenCalledTimes(1);
});

test('previews reset the earpiece and recording route and remain audible in silent mode', async () => {
  await playNotificationTonePreview('Bell');
  expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({
    allowsRecording: false, allowsBackgroundRecording: false,
    shouldRouteThroughEarpiece: false, playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
  }));
  await playNotificationTone('Bell');
  expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({playsInSilentMode: false}));
});

test('a newer tone selection replaces playback and releases the previous player', async () => {
  await playNotificationTonePreview('Chime');
  await playNotificationTonePreview('Pop');
  expect(audio.__player.pause).toHaveBeenCalledTimes(1);
  expect(audio.__player.release).toHaveBeenCalledTimes(1);
  expect(audio.__player.play).toHaveBeenCalledTimes(2);
});

test('rapid selections only start the latest preview after audio mode is ready', async () => {
  let ready!: () => void;
  jest.mocked(setAudioModeAsync).mockImplementationOnce(() => new Promise<void>(resolve => { ready = resolve; }));
  const earlier = playNotificationTonePreview('Chime');
  await playNotificationTonePreview('Pop');
  ready();
  await earlier;
  expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  expect(createAudioPlayer).toHaveBeenLastCalledWith(expect.objectContaining({testUri: expect.stringContaining('incoming_call_pop.wav')}));
});

test('starts the separate ringback only after ringing and deduplicates repeated state', async () => {
  const owner = {};
  await setCallRingtoneState(owner, CALL_RINGTONE_STATE.CALLING);
  expect(createAudioPlayer).not.toHaveBeenCalled();

  await setCallRingtoneState(owner, CALL_RINGTONE_STATE.OUTGOING_RINGING);
  await setCallRingtoneState(owner, CALL_RINGTONE_STATE.OUTGOING_RINGING);

  expect(createAudioPlayer).toHaveBeenCalledWith(
    expect.objectContaining({testUri: expect.stringContaining('outgoing_call.wav')}),
    {keepAudioSessionActive: true},
  );
  expect(audio.__player.play).toHaveBeenCalledTimes(1);
  expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
    allowsRecording: true,
    shouldRouteThroughEarpiece: true,
  }));
});
