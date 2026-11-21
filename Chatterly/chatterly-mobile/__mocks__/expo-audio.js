const recorder = {
  uri: 'file:///voice.m4a',
  prepareToRecordAsync: jest.fn(async () => undefined),
  record: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(async () => undefined),
  getStatus: jest.fn(() => recorderState),
};

const player = {
  replace: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(async () => undefined),
  release: jest.fn(),
  addListener: jest.fn(() => ({remove: jest.fn()})),
  setPlaybackRate: jest.fn(),
  volume: 1,
};

const recorderState = {
  canRecord: true,
  isRecording: false,
  durationMillis: 0,
  url: 'file:///voice.m4a',
};

const playerStatus = {
  playing: false,
  currentTime: 0,
  duration: 0,
  didJustFinish: false,
};

module.exports = {
  RecordingPresets: {HIGH_QUALITY: {}, LOW_QUALITY: {}},
  __player: player,
  __playerStatus: playerStatus,
  __recorder: recorder,
  __recorderState: recorderState,
  createAudioPlayer: jest.fn(() => player),
  preload: jest.fn(async () => undefined),
  getRecordingPermissionsAsync: jest.fn(async () => ({granted: true})),
  requestRecordingPermissionsAsync: jest.fn(async () => ({granted: true})),
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioPlayer: jest.fn(() => player),
  useAudioPlayerStatus: jest.fn(() => playerStatus),
  useAudioRecorder: jest.fn(() => recorder),
  useAudioRecorderState: jest.fn(() => recorderState),
};
