import {applyCallAudioRoute, EARPIECE_ROUTE, listCallAudioRoutes, NO_AUDIO_ROUTE, SPEAKER_ROUTE} from '../src/services/callAudioRoutes';

const builtIn = {name: 'Built-in microphone', type: 'MicrophoneBuiltIn', uid: '1'};
const jbl = {name: 'JBL Flip 5', type: 'BluetoothSCO', uid: '7'};
const wired = {name: 'Headset', type: 'MicrophoneWired', uid: '9'};

function controls() {
  return {setSpeaker: jest.fn(async () => undefined), setRemoteAudio: jest.fn()};
}

test('lists only the hardware that is actually connected', () => {
  expect(listCallAudioRoutes(null).map(route => route.label)).toEqual(['Speaker', 'Headset', 'No Audio']);
  const routes = listCallAudioRoutes({getAvailableInputs: () => [builtIn, jbl, wired]});
  expect(routes.map(route => route.label)).toEqual(['Speaker', 'Headset', 'JBL Flip 5', 'Wired Headset', 'No Audio']);
  expect(routes.find(route => route.label === 'JBL Flip 5')).toEqual(expect.objectContaining({kind: 'bluetooth', uid: '7'}));
});

test('iOS port types are recognised too', () => {
  const routes = listCallAudioRoutes({getAvailableInputs: () => [{name: 'AirPods', type: 'BluetoothHFP', uid: 'a'}, {name: 'Headphones', type: 'HeadsetMicrophone', uid: 'w'}]});
  expect(routes.map(route => route.kind)).toEqual(['speaker', 'earpiece', 'bluetooth', 'wired', 'none']);
});

test('a device list that throws still leaves the built-in routes', () => {
  expect(listCallAudioRoutes({getAvailableInputs: () => { throw new Error('unsupported'); }})).toHaveLength(3);
});

test('a headset takes the call off the loudspeaker and selects that device', async () => {
  const setInput = jest.fn();
  const session = controls();
  const [bluetooth] = listCallAudioRoutes({getAvailableInputs: () => [builtIn, jbl]}).filter(route => route.kind === 'bluetooth');
  await applyCallAudioRoute(bluetooth, {getAvailableInputs: () => [builtIn, jbl], setInput}, session);
  expect(session.setRemoteAudio).toHaveBeenCalledWith(true);
  expect(session.setSpeaker).toHaveBeenCalledWith(false);
  expect(setInput).toHaveBeenCalledWith('7');
});

test('the loudspeaker and the earpiece hand the call back from a headset', async () => {
  const setInput = jest.fn();
  const session = controls();
  const source = {getAvailableInputs: () => [builtIn, jbl], setInput};
  await applyCallAudioRoute(SPEAKER_ROUTE, source, session);
  expect(setInput).toHaveBeenLastCalledWith('1');
  expect(session.setSpeaker).toHaveBeenLastCalledWith(true);
  await applyCallAudioRoute(EARPIECE_ROUTE, source, session);
  expect(session.setSpeaker).toHaveBeenLastCalledWith(false);
});

test('"No Audio" silences the other side without touching the microphone or the route', async () => {
  const setInput = jest.fn();
  const session = controls();
  await applyCallAudioRoute(NO_AUDIO_ROUTE, {getAvailableInputs: () => [builtIn], setInput}, session);
  expect(session.setRemoteAudio).toHaveBeenCalledWith(false);
  expect(session.setSpeaker).not.toHaveBeenCalled();
  expect(setInput).not.toHaveBeenCalled();
});
