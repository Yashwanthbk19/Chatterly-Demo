import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/components/GroupCallScreen.jsx', import.meta.url), 'utf8')
  .replaceAll('\r\n', '\n');
const section = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Missing section: ${startMarker}`);
  return source.slice(start, end);
};
const track = (overrides = {}) => ({ readyState: 'live', enabled: true, muted: false, ...overrides });
const stream = (video = track(), audio = track()) => ({
  getVideoTracks: () => video ? [video] : [],
  getAudioTracks: () => audio ? [audio] : [],
});
const tile = (overrides = {}) => {
  let cleanup;
  let playCount = 0;
  const video = { srcObject: null, play: () => { playCount += 1; return Promise.resolve(); } };
  const result = runInNewContext(section(
    '  const videoRef = useRef(null);',
    '\n  return (',
  ) + '\n({ visibleMediaStream, shouldShowLocalVideo, shouldShowRemoteVideo, hasPhoto });', {
    participant: { isCurrentUser: true, isCameraOn: true, profilePic: 'avatar.png' },
    defaultAvatar: '',
    localMediaStream: null,
    remoteMediaStream: null,
    isOnHold: false,
    videoBackground: 'none',
    getVideoBackgroundOption: () => ({}),
    isParticipantVerified: () => true,
    useRef: () => ({ current: video }),
    useEffect: (effect) => { cleanup = effect(); },
    ...overrides,
  });
  return { ...result, video, playCount: () => playCount, cleanup: () => cleanup?.() };
};

test('holding a group video call uses the existing avatar fallback and resumes the same stream', () => {
  const camera = track();
  const localMediaStream = stream(camera);
  const active = tile({ localMediaStream });
  assert.equal(active.visibleMediaStream, localMediaStream);
  assert.equal(active.video.srcObject, localMediaStream);

  const held = tile({ localMediaStream, isOnHold: true });
  assert.equal(held.visibleMediaStream, null, 'A held camera must not cover the avatar with a black frame');
  assert.equal(held.hasPhoto, true);
  assert.equal(held.playCount(), 0);
  active.cleanup();
  assert.equal(active.video.srcObject, null);

  // Resuming renders before the parent effect re-enables the camera track.
  camera.enabled = false;
  const resumed = tile({ localMediaStream, isOnHold: false });
  assert.equal(resumed.visibleMediaStream, localMediaStream);
  assert.equal(resumed.video.srcObject, localMediaStream);
  assert.equal(resumed.playCount(), 1);
  assert.match(source, /isOnHold=\{participant\.isCurrentUser && isOnHold\}/);
});

test('camera-off, audio-only, and ended local streams retain the existing fallback', () => {
  for (const overrides of [
    { participant: { isCurrentUser: true, isCameraOn: false }, localMediaStream: stream() },
    { localMediaStream: stream(null) },
    { localMediaStream: stream(track({ readyState: 'ended' })) },
  ]) {
    assert.equal(tile(overrides).visibleMediaStream, null);
  }
});

test('muted or ended remote video falls back and unmuted video returns without replacing its stream', () => {
  const remoteTrack = track();
  const remoteMediaStream = stream(remoteTrack);
  const props = { participant: { isCurrentUser: false, isCameraOn: true }, remoteMediaStream };
  assert.equal(tile(props).visibleMediaStream, remoteMediaStream);
  remoteTrack.muted = true;
  assert.equal(tile(props).visibleMediaStream, null);
  remoteTrack.muted = false;
  assert.equal(tile(props).visibleMediaStream, remoteMediaStream);
  remoteTrack.enabled = false;
  assert.equal(tile(props).visibleMediaStream, null);
  remoteTrack.enabled = true;
  remoteTrack.readyState = 'ended';
  assert.equal(tile(props).visibleMediaStream, null);
});

test('placing the local call on hold leaves other participants video visible', () => {
  const remoteMediaStream = stream();
  assert.equal(tile({
    participant: { isCurrentUser: false, isCameraOn: true },
    remoteMediaStream,
    isOnHold: true,
  }).visibleMediaStream, remoteMediaStream);
});

test('hold disables media without stopping tracks, then restores camera and microphone preferences', () => {
  const effectSource = section(
    '  useEffect(() => {\n    localMediaStreamRef.current?.getAudioTracks?.().forEach',
    '  const handleToggleParticipantMute =',
  );
  for (const isSelfMuted of [true, false]) {
    for (const isSelfCameraOn of [true, false]) {
      const audio = track({ stop: () => assert.fail('Hold must keep the existing track') });
      const camera = track({ stop: () => assert.fail('Hold must keep the existing track') });
      const localMediaStream = stream(camera, audio);
      const sync = (isOnHold) => runInNewContext(effectSource, {
        useEffect: (effect) => effect(),
        isOnHold, isSelfMuted, isSelfCameraOn, localMediaStream,
        localMediaStreamRef: { current: localMediaStream },
      });
      sync(true);
      assert.equal(audio.enabled, false);
      assert.equal(camera.enabled, false);
      sync(false);
      assert.equal(audio.enabled, !isSelfMuted);
      assert.equal(camera.enabled, isSelfCameraOn);
    }
  }
});

test('camera and microphone toggles cannot briefly transmit media during hold', () => {
  for (const isOnHold of [true, false]) {
    const audio = track({ enabled: false });
    const camera = track({ enabled: false });
    const localMediaStream = stream(camera, audio);
    const handlers = runInNewContext(section(
      '  const handleToggleSelfMute =',
      '  useEffect(() => {\n    localMediaStreamRef.current?.getAudioTracks?.().forEach',
    ) + '\n({ handleToggleSelfMute, handleToggleSelfCamera });', {
      useCallback: (callback) => callback,
      normalizedCurrentUserId: 'me', isVideoCall: true, isOnHold,
      isSelfMuted: true, isSelfCameraOn: false,
      localMediaStreamRef: { current: localMediaStream },
      setCall: (update) => update({}),
      toggleParticipantMuted: (state) => state,
      toggleParticipantCamera: (state) => state,
    });
    handlers.handleToggleSelfMute();
    handlers.handleToggleSelfCamera();
    assert.equal(audio.enabled, !isOnHold);
    assert.equal(camera.enabled, !isOnHold);
  }
});
