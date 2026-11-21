import {setCallAudioSpeaker, setCallRemoteAudioEnabled} from './callAudio';

// Audio Output for one-to-one calls (Sprint 8 Story 3 "Switch Audio Output").
//
// The routes are the hardware actually present, read from expo-audio's input
// list: the loudspeaker, the phone's earpiece, a wired headset when one is
// plugged in and each connected Bluetooth headset under its own name. Picking a
// headset moves the call onto it with expo-audio's setInput - Android makes it
// the communication device, iOS its preferred input, which also moves the
// output. "No Audio" silences the other side without muting the microphone.

export type CallAudioRouteKind = 'speaker' | 'earpiece' | 'wired' | 'bluetooth' | 'none';

export type CallAudioRoute = {
  id: string;
  label: string;
  kind: CallAudioRouteKind;
  /** expo-audio's input uid, for a headset. */
  uid?: string;
};

type RecordingInputLike = {name?: string; type?: string; uid?: string};

/** The parts of expo-audio's AudioRecorder that know about audio hardware. */
export type AudioDeviceSource = {
  getAvailableInputs?: () => RecordingInputLike[];
  setInput?: (uid: string) => void;
};

export const SPEAKER_ROUTE: CallAudioRoute = {id: 'speaker', label: 'Speaker', kind: 'speaker'};
/** The phone's earpiece; the design names it "Headset". */
export const EARPIECE_ROUTE: CallAudioRoute = {id: 'earpiece', label: 'Headset', kind: 'earpiece'};
export const NO_AUDIO_ROUTE: CallAudioRoute = {id: 'none', label: 'No Audio', kind: 'none'};

function readInputs(source: AudioDeviceSource | null | undefined): RecordingInputLike[] {
  try {
    const inputs = source?.getAvailableInputs?.();
    return Array.isArray(inputs) ? inputs : [];
  } catch {
    // Older Android versions and simulators may not report devices.
    return [];
  }
}

// Android reports "BluetoothSCO" / "MicrophoneWired"; iOS reports its port
// types ("BluetoothHFP", "HeadsetMicrophone", "USBAudio", "CarAudio").
const isBluetooth = (type: string) => /bluetooth|carAudio/i.test(type);
const isWired = (type: string) => /wired|headsetmicrophone|usbaudio/i.test(type);
const isBuiltIn = (type: string) => /builtin|built-in/i.test(type);

export function listCallAudioRoutes(source: AudioDeviceSource | null | undefined): CallAudioRoute[] {
  const routes: CallAudioRoute[] = [SPEAKER_ROUTE, EARPIECE_ROUTE];
  const seen = new Set<string>();
  readInputs(source).forEach(input => {
    const type = String(input.type || '');
    const uid = String(input.uid || '');
    if (!uid || seen.has(uid)) { return; }
    if (isBluetooth(type)) {
      seen.add(uid);
      routes.push({id: `bluetooth:${uid}`, label: String(input.name || '').trim() || 'Bluetooth', kind: 'bluetooth', uid});
    } else if (isWired(type)) {
      seen.add(uid);
      routes.push({id: `wired:${uid}`, label: 'Wired Headset', kind: 'wired', uid});
    }
  });
  routes.push(NO_AUDIO_ROUTE);
  return routes;
}

function selectInput(source: AudioDeviceSource | null | undefined, uid: string | undefined): void {
  if (!uid) { return; }
  try {
    source?.setInput?.(uid);
  } catch {
    // Android 9 and older cannot choose an input; the system route applies.
  }
}

/** The media session a route is applied to: one-to-one by default, or a conference. */
export type CallAudioControls = {
  setSpeaker: (enabled: boolean) => Promise<void>;
  setRemoteAudio: (enabled: boolean) => void;
};

const ONE_TO_ONE_CONTROLS: CallAudioControls = {setSpeaker: setCallAudioSpeaker, setRemoteAudio: setCallRemoteAudioEnabled};

/**
 * Moves the call's audio onto a route. The loudspeaker and the earpiece first
 * hand the call back from any headset by selecting the built-in microphone.
 */
export async function applyCallAudioRoute(route: CallAudioRoute, source: AudioDeviceSource | null | undefined, controls: CallAudioControls = ONE_TO_ONE_CONTROLS): Promise<void> {
  if (route.kind === 'none') {
    controls.setRemoteAudio(false);
    return;
  }
  controls.setRemoteAudio(true);
  if (route.kind === 'speaker' || route.kind === 'earpiece') {
    const builtIn = readInputs(source).find(input => isBuiltIn(String(input.type || '')));
    selectInput(source, builtIn?.uid);
    await controls.setSpeaker(route.kind === 'speaker');
    return;
  }
  // A headset needs the call out of loudspeaker mode before it is selected.
  await controls.setSpeaker(false);
  selectInput(source, route.uid);
}
