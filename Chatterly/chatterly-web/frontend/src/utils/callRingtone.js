// Ringtone loudness. The synthesized patterns are pure sine tones, so they read
// as much louder than a recorded file at the same gain; a custom ringtone is
// therefore peak-normalized (see resolveCustomRingtoneGain) instead of being
// played at the synth gain, which left uploaded tones close to inaudible.
const RINGTONE_VOLUME = 0.42;
const RINGTONE_LOOP_MS = 1800;
const CUSTOM_RINGTONE_PEAK_TARGET = 0.94;
const CUSTOM_RINGTONE_MAX_GAIN = 6;
const TONE_PREVIEW_MS = 1500;
const CUSTOM_TONE_PREVIEW_MS = 4000;
const OUTGOING_RINGBACK_VOLUME = 0.22;
const OUTGOING_RINGBACK_LOOP_MS = 3200;
export const CALL_RINGTONE_STORAGE_KEY = 'chatterly_call_ringtone';
export const CALL_RINGTONE_ENABLED_STORAGE_KEY = 'chatterly_call_ringtone_enabled';
const CUSTOM_RINGTONE_DATABASE_NAME = 'chatterly-ringtones';
const CUSTOM_RINGTONE_STORE_NAME = 'custom-ringtones';
const CUSTOM_RINGTONE_RECORD_KEY = 'incoming-call';

// The one place a tone name is turned into notes. Both the call ringtone and the
// message-notification chime read this table, so "Bell" is the same Bell whether
// it is previewed in Settings, rung for a call, or played for a new message.
export const TONE_NAMES = ['Default', 'Chime', 'Bell', 'Pop'];

export const getTonePattern = (tone) => RINGTONE_PATTERNS[String(tone || '').trim()] || RINGTONE_PATTERNS.Default;

const RINGTONE_PATTERNS = {
  Default: [
    { delay: 0, frequency: 659.25, duration: 0.32 },
    { delay: 0.38, frequency: 880, duration: 0.32 },
  ],
  Chime: [
    { delay: 0, frequency: 523.25, duration: 0.24 },
    { delay: 0.24, frequency: 659.25, duration: 0.24 },
    { delay: 0.48, frequency: 783.99, duration: 0.3 },
  ],
  Bell: [
    { delay: 0, frequency: 987.77, duration: 0.42 },
    { delay: 0.46, frequency: 987.77, duration: 0.42 },
  ],
  Pop: [
    { delay: 0, frequency: 440, duration: 0.16 },
    { delay: 0.2, frequency: 587.33, duration: 0.16 },
  ],
};

let ringtoneAudioContext = null;
let activeRingtone = null;
let ringtoneRequestId = 0;
let activeOutgoingRingback = null;
let outgoingRingbackRequestId = 0;
let activeTonePreview = null;
let tonePreviewRequestId = 0;

const getRingtoneAudioContext = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }

  if (!ringtoneAudioContext) {
    ringtoneAudioContext = new AudioContextConstructor();
  }

  return ringtoneAudioContext;
};

const openCustomRingtoneDatabase = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('Custom ringtone storage is not supported by this browser.'));
    return;
  }

  const request = indexedDB.open(CUSTOM_RINGTONE_DATABASE_NAME, 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(CUSTOM_RINGTONE_STORE_NAME)) {
      database.createObjectStore(CUSTOM_RINGTONE_STORE_NAME);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Unable to open custom ringtone storage.'));
});

const readCustomCallRingtone = async () => {
  const database = await openCustomRingtoneDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(CUSTOM_RINGTONE_STORE_NAME, 'readonly');
      const request = transaction.objectStore(CUSTOM_RINGTONE_STORE_NAME).get(CUSTOM_RINGTONE_RECORD_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Unable to read the custom ringtone.'));
    });
  } finally {
    database.close();
  }
};

export const saveCustomCallRingtone = async (file) => {
  if (!file) throw new Error('Choose an audio file to use as your ringtone.');

  const audioContext = getRingtoneAudioContext();
  if (!audioContext) throw new Error('Custom ringtone playback is not supported by this browser.');

  try {
    await audioContext.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error('The selected audio file cannot be played by this browser.');
  }

  const database = await openCustomRingtoneDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(CUSTOM_RINGTONE_STORE_NAME, 'readwrite');
      transaction.objectStore(CUSTOM_RINGTONE_STORE_NAME).put({
        blob: file,
        name: String(file.name || 'Custom ringtone'),
        type: String(file.type || ''),
        updatedAt: Date.now(),
      }, CUSTOM_RINGTONE_RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Unable to save the custom ringtone.'));
      transaction.onabort = () => reject(transaction.error || new Error('Unable to save the custom ringtone.'));
    });
  } finally {
    database.close();
  }
};

const playTone = (audioContext, startTime, frequency, durationSeconds, gainNode) => {
  const oscillator = audioContext.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);
  oscillator.connect(gainNode);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds);
};

// A recorded ringtone carries its own level, so playing it at the synth gain
// left quiet uploads inaudible. Scale by the buffer's peak instead, capped so a
// near-silent file cannot be amplified into noise and a loud one cannot clip.
const resolveCustomRingtoneGain = (audioBuffer) => {
  if (!audioBuffer?.numberOfChannels) return 1;

  let peak = 0;
  // Sampling every 64th frame keeps a multi-minute upload cheap to measure while
  // still landing on the waveform's crests.
  const stride = 64;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const samples = audioBuffer.getChannelData(channel);
    for (let index = 0; index < samples.length; index += stride) {
      const amplitude = Math.abs(samples[index]);
      if (amplitude > peak) peak = amplitude;
    }
  }

  if (!(peak > 0)) return 1;

  return Math.min(CUSTOM_RINGTONE_MAX_GAIN, CUSTOM_RINGTONE_PEAK_TARGET / peak);
};

const fadeOutAndDisconnect = (gainNode) => {
  if (!gainNode) return;

  try {
    const audioContext = getRingtoneAudioContext();
    if (audioContext) {
      const now = audioContext.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(Math.max(gainNode.gain.value, 0.0001), now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    }

    window.setTimeout(() => {
      try {
        gainNode.disconnect();
      } catch {
        // The node may already be disconnected if playback was interrupted.
      }
    }, 120);
  } catch {
    try {
      gainNode.disconnect();
    } catch {
      // Ignore cleanup errors from already-disconnected audio nodes.
    }
  }
};

const scheduleRingPattern = (audioContext, gainNode, ringtone) => {
  const now = audioContext.currentTime;
  const pattern = RINGTONE_PATTERNS[ringtone] || RINGTONE_PATTERNS.Default;

  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(RINGTONE_VOLUME, now + 0.02);
  gainNode.gain.setValueAtTime(RINGTONE_VOLUME, now + 0.72);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.84);

  pattern.forEach(({ delay, frequency, duration }) => {
    playTone(audioContext, now + delay, frequency, duration, gainNode);
  });
};

const getStoredCallRingtone = () => {
  try {
    return localStorage.getItem(CALL_RINGTONE_STORAGE_KEY) || 'Default';
  } catch {
    return 'Default';
  }
};

const isCallRingtoneEnabled = () => {
  try {
    return localStorage.getItem(CALL_RINGTONE_ENABLED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
};

const scheduleOutgoingRingbackPattern = (audioContext, gainNode) => {
  const now = audioContext.currentTime;

  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(OUTGOING_RINGBACK_VOLUME, now + 0.03);
  gainNode.gain.setValueAtTime(OUTGOING_RINGBACK_VOLUME, now + 1.22);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.36);

  playTone(audioContext, now, 440, 1.3, gainNode);
  playTone(audioContext, now, 480, 1.3, gainNode);
};

export const stopIncomingCallRingtone = () => {
  ringtoneRequestId += 1;

  if (!activeRingtone) {
    return;
  }

  const { gainNode, intervalId, sourceNode } = activeRingtone;
  activeRingtone = null;

  if (intervalId) {
    window.clearInterval(intervalId);
  }

  if (sourceNode) {
    try {
      sourceNode.stop();
      sourceNode.disconnect();
    } catch {
      // The custom ringtone may already have stopped or disconnected.
    }
  }

  fadeOutAndDisconnect(gainNode);
};

export const startIncomingCallRingtone = async () => {
  if (!isCallRingtoneEnabled()) {
    stopIncomingCallRingtone();
    return false;
  }

  const audioContext = getRingtoneAudioContext();
  if (!audioContext) {
    return false;
  }

  stopOutgoingCallRingback();
  stopIncomingCallRingtone();
  const requestId = ringtoneRequestId;
  let ringtone = getStoredCallRingtone();

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (requestId !== ringtoneRequestId || audioContext.state !== 'running') {
      return false;
    }

    let customAudioBuffer = null;
    if (ringtone === 'Custom') {
      const customRingtone = await readCustomCallRingtone();
      if (requestId !== ringtoneRequestId) return false;
      if (customRingtone?.blob) {
        customAudioBuffer = await audioContext.decodeAudioData(await customRingtone.blob.arrayBuffer());
      } else {
        ringtone = 'Default';
      }
    }

    if (requestId !== ringtoneRequestId || audioContext.state !== 'running') {
      return false;
    }

    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);

    if (customAudioBuffer) {
      gainNode.gain.setValueAtTime(resolveCustomRingtoneGain(customAudioBuffer), audioContext.currentTime);
      const sourceNode = audioContext.createBufferSource();
      sourceNode.buffer = customAudioBuffer;
      sourceNode.loop = true;
      sourceNode.connect(gainNode);
      activeRingtone = { gainNode, sourceNode };
      sourceNode.start();
      return true;
    }

    activeRingtone = {
      gainNode,
      intervalId: window.setInterval(() => {
        scheduleRingPattern(audioContext, gainNode, ringtone);
      }, RINGTONE_LOOP_MS),
    };

    scheduleRingPattern(audioContext, gainNode, ringtone);
    return true;
  } catch (error) {
    console.error('Unable to play incoming call ringtone:', error);
    stopIncomingCallRingtone();
    return false;
  }
};

export const stopOutgoingCallRingback = () => {
  outgoingRingbackRequestId += 1;

  if (!activeOutgoingRingback) {
    return;
  }

  const { gainNode, intervalId } = activeOutgoingRingback;
  activeOutgoingRingback = null;

  if (intervalId) {
    window.clearInterval(intervalId);
  }

  fadeOutAndDisconnect(gainNode);
};

export const startOutgoingCallRingback = async () => {
  const audioContext = getRingtoneAudioContext();
  if (!audioContext) {
    return false;
  }

  stopIncomingCallRingtone();
  stopOutgoingCallRingback();
  const requestId = outgoingRingbackRequestId;

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (requestId !== outgoingRingbackRequestId || audioContext.state !== 'running') {
      return false;
    }

    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);

    activeOutgoingRingback = {
      gainNode,
      intervalId: window.setInterval(() => {
        scheduleOutgoingRingbackPattern(audioContext, gainNode);
      }, OUTGOING_RINGBACK_LOOP_MS),
    };

    scheduleOutgoingRingbackPattern(audioContext, gainNode);
    return true;
  } catch (error) {
    console.error('Unable to play outgoing call ringback:', error);
    stopOutgoingCallRingback();
    return false;
  }
};

// Settings tone preview. Selecting a tone has to play that exact tone, so the
// preview runs the same pattern table (and the same stored custom-ringtone
// buffer) the live incoming ringtone uses, on its own channel so it never
// disturbs a call that is actually ringing.
export const stopCallTonePreview = () => {
  tonePreviewRequestId += 1;

  if (!activeTonePreview) {
    return;
  }

  const { gainNode, intervalId, sourceNode, timeoutId } = activeTonePreview;
  activeTonePreview = null;

  if (intervalId) window.clearInterval(intervalId);
  if (timeoutId) window.clearTimeout(timeoutId);

  if (sourceNode) {
    try {
      sourceNode.stop();
      sourceNode.disconnect();
    } catch {
      // The preview may already have finished on its own.
    }
  }

  fadeOutAndDisconnect(gainNode);
};

export const playCallTonePreview = async (tone = 'Default') => {
  const audioContext = getRingtoneAudioContext();
  if (!audioContext) {
    return false;
  }

  stopCallTonePreview();
  const requestId = tonePreviewRequestId;
  const requestedTone = String(tone || '').trim() || 'Default';

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (requestId !== tonePreviewRequestId || audioContext.state !== 'running') {
      return false;
    }

    if (requestedTone === 'Custom') {
      const customRingtone = await readCustomCallRingtone().catch(() => null);
      if (requestId !== tonePreviewRequestId) return false;

      if (customRingtone?.blob) {
        const audioBuffer = await audioContext.decodeAudioData(await customRingtone.blob.arrayBuffer());
        if (requestId !== tonePreviewRequestId || audioContext.state !== 'running') return false;

        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(resolveCustomRingtoneGain(audioBuffer), audioContext.currentTime);
        gainNode.connect(audioContext.destination);

        const sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(gainNode);
        sourceNode.start();

        activeTonePreview = {
          gainNode,
          sourceNode,
          timeoutId: window.setTimeout(
            stopCallTonePreview,
            Math.min(CUSTOM_TONE_PREVIEW_MS, Math.max(600, audioBuffer.duration * 1000))
          ),
        };
        return true;
      }
    }

    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    activeTonePreview = {
      gainNode,
      timeoutId: window.setTimeout(stopCallTonePreview, TONE_PREVIEW_MS),
    };
    scheduleRingPattern(audioContext, gainNode, requestedTone);
    return true;
  } catch (error) {
    console.error('Unable to preview the selected tone:', error);
    stopCallTonePreview();
    return false;
  }
};

export const prepareIncomingCallRingtone = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const unlockAudio = () => {
    const audioContext = getRingtoneAudioContext();
    if (audioContext?.state === 'suspended') {
      void audioContext.resume().catch(() => {
        // A later user interaction will retry audio activation.
      });
    }
  };

  const activationEvents = ['pointerdown', 'touchend', 'keydown'];
  activationEvents.forEach((eventName) => {
    document.addEventListener(eventName, unlockAudio, { capture: true });
  });

  return () => {
    activationEvents.forEach((eventName) => {
      document.removeEventListener(eventName, unlockAudio, { capture: true });
    });
  };
};
