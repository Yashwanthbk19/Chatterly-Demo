/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import {
  CALL_STATUS,
  CALL_TYPE,
  INCOMING_CALL_RING_TIMEOUT_MS,
  createIncomingCallState,
  createOutgoingCallState,
  getCallDurationSeconds,
  getRemainingRingTimeMs,
  isActiveCallStatus,
  isConnectedCallStatus,
  isIncomingRingingStatus,
  isVideoCall,
  markMissedIfTimedOut,
  setCallMuted,
  setCallSpeakerEnabled,
  toActiveCallState,
  toggleCallMute,
  toggleCallSpeaker,
  transitionCallState,
} from '../utils/callState';

// The provider holds at most one active call. `call` is either a normalized
// call-state object ({ callId, callerId, receiverId, status, incoming }) or null
// when idle. `missedCalls` is a most-recent-first log of calls that finished as
// `Missed` (rung past the timeout without being answered), so the UI can surface
// missed-call updates.
const CALL_ACTIONS = Object.freeze({
  START_OUTGOING: 'START_OUTGOING',
  START_INCOMING: 'START_INCOMING',
  SET_STATUS: 'SET_STATUS',
  SET_MUTED: 'SET_MUTED',
  SET_SPEAKER: 'SET_SPEAKER',
  TIMEOUT: 'TIMEOUT',
  CLEAR: 'CLEAR',
  CLEAR_MISSED: 'CLEAR_MISSED',
});

const MAX_MISSED_CALL_HISTORY = 50;

const initialState = { call: null, missedCalls: [] };

// Prepend a freshly-missed call to the log, de-duplicating by callId and capping
// the history. A no-op (returns the same array) for any non-missed call.
const recordMissedCall = (missedCalls, call) => {
  if (!call || call.status !== CALL_STATUS.MISSED) {
    return missedCalls;
  }

  const withoutDuplicate = missedCalls.filter((entry) => entry.callId !== call.callId);
  return [call, ...withoutDuplicate].slice(0, MAX_MISSED_CALL_HISTORY);
};

// Apply a transitioned call to the state, recording it when it became missed.
// Returns the original state reference on a no-op so React can skip re-renders.
const applyCallTransition = (state, nextCall) => {
  if (nextCall === state.call) {
    return state;
  }

  return {
    ...state,
    call: nextCall,
    missedCalls: recordMissedCall(state.missedCalls, nextCall),
  };
};

// Swap in an updated call (e.g. a mute/speaker change) without touching the
// missed-call log. Returns the original state reference on a no-op so React can
// skip re-renders.
const replaceCall = (state, nextCall) =>
  nextCall === state.call ? state : { ...state, call: nextCall };

function callReducer(state, action) {
  switch (action.type) {
    case CALL_ACTIONS.START_OUTGOING:
      return { ...state, call: createOutgoingCallState(action.payload) };

    case CALL_ACTIONS.START_INCOMING:
      return { ...state, call: createIncomingCallState(action.payload) };

    case CALL_ACTIONS.SET_STATUS: {
      if (!state.call) return state;
      // transitionCallState returns the same reference on an invalid/no-op
      // transition (e.g. a stale/out-of-order event), so applyCallTransition
      // bails out to avoid a needless re-render.
      return applyCallTransition(state, transitionCallState(state.call, action.payload.status));
    }

    case CALL_ACTIONS.SET_MUTED: {
      if (!state.call) return state;
      // `toggle` flips the current value; otherwise set it explicitly. Both
      // setters return the same reference on a no-op, which replaceCall skips.
      const nextCall = action.payload.toggle
        ? toggleCallMute(state.call)
        : setCallMuted(state.call, action.payload.isMuted);
      return replaceCall(state, nextCall);
    }

    case CALL_ACTIONS.SET_SPEAKER: {
      if (!state.call) return state;
      const nextCall = action.payload.toggle
        ? toggleCallSpeaker(state.call)
        : setCallSpeakerEnabled(state.call, action.payload.speakerEnabled);
      return replaceCall(state, nextCall);
    }

    case CALL_ACTIONS.TIMEOUT: {
      if (!state.call || state.call.callId !== action.payload.callId) {
        // The call already changed/ended before the timer fired — ignore.
        return state;
      }
      // Re-check the elapsed time so a call answered in the final moment before
      // the timer fires is never wrongly marked missed.
      return applyCallTransition(
        state,
        markMissedIfTimedOut(state.call, { timeoutMs: action.payload.timeoutMs })
      );
    }

    case CALL_ACTIONS.CLEAR:
      return state.call === null ? state : { ...state, call: null };

    case CALL_ACTIONS.CLEAR_MISSED:
      return state.missedCalls.length === 0 ? state : { ...state, missedCalls: [] };

    default:
      return state;
  }
}

const noop = () => {};

const CallStateContext = createContext({
  call: null,
  status: '',
  callType: '',
  isVideoCall: false,
  incoming: false,
  isInCall: false,
  duration: 0,
  isMuted: false,
  speakerEnabled: false,
  activeCall: null,
  missedCalls: [],
  startOutgoingCall: noop,
  startOutgoingVideoCall: noop,
  receiveIncomingCall: noop,
  setCallStatus: noop,
  markRinging: noop,
  markConnecting: noop,
  acceptCall: noop,
  rejectCall: noop,
  markMissed: noop,
  markConnected: noop,
  endCall: noop,
  toggleMute: noop,
  setMuted: noop,
  toggleSpeaker: noop,
  setSpeakerEnabled: noop,
  clearCall: noop,
  clearMissedCalls: noop,
});

export function CallStateProvider({ children, ringTimeoutMs = INCOMING_CALL_RING_TIMEOUT_MS }) {
  const [state, dispatch] = useReducer(callReducer, initialState);
  const currentCall = state.call;
  // A bare counter whose only job is to force a re-render once per second while
  // a call is connected. The duration itself is derived from `connectedAt`
  // during render (below), so the timer never churns the frozen call object or
  // the missed-call log — each tick is an isolated re-render.
  const [, setDurationTick] = useState(0);

  // Timeout logic: while a call is ringing as `Incoming`, arm a timer for the
  // remaining ring window and mark the call `Missed` if nobody answers. The
  // effect re-runs whenever the call object changes — accepting, rejecting or
  // clearing the call swaps the reference, which tears the timer down via the
  // cleanup before any missed transition can fire.
  useEffect(() => {
    if (!isIncomingRingingStatus(currentCall?.status)) {
      return undefined;
    }

    const remainingMs = getRemainingRingTimeMs(currentCall, { timeoutMs: ringTimeoutMs });
    const timeoutId = setTimeout(() => {
      dispatch({
        type: CALL_ACTIONS.TIMEOUT,
        payload: { callId: currentCall.callId, timeoutMs: ringTimeoutMs },
      });
    }, remainingMs);

    return () => clearTimeout(timeoutId);
  }, [currentCall, ringTimeoutMs]);

  // Active-call timer: while a call is `Connected`, tick once a second to drive
  // a live re-render. The effect re-runs on every call change, so leaving
  // `Connected` (the call ends or is cleared) tears the interval down — no tick
  // fires for an idle or ended call.
  useEffect(() => {
    if (!isConnectedCallStatus(currentCall?.status)) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setDurationTick((tick) => tick + 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [currentCall]);

  // Whole-second call duration, derived from `connectedAt` on each render the
  // tick above provokes. Deriving from the timestamp (instead of counting
  // ticks) keeps the timer accurate across tab throttling or sleep, and
  // `getCallDurationSeconds` freezes at the final `connectedAt`→`endedAt` value
  // for a just-ended call (or 0 when idle).
  const durationSeconds = getCallDurationSeconds(currentCall);

  const value = useMemo(() => {
    const setCallStatus = (status) =>
      dispatch({ type: CALL_ACTIONS.SET_STATUS, payload: { status } });

    return {
      call: state.call,
      status: state.call?.status || '',
      // Media kind of the live call: '' when idle, otherwise 'audio'/'video'.
      callType: state.call?.callType || '',
      isVideoCall: isVideoCall(state.call),
      incoming: Boolean(state.call?.incoming),
      isInCall: isActiveCallStatus(state.call?.status),
      // Active-call snapshot + live controls. `activeCall` is the normalized
      // { callId, startedAt, connectedAt, duration, isMuted, speakerEnabled, status } shape consumers
      // render, with `duration` driven by the per-second timer above.
      duration: durationSeconds,
      isMuted: Boolean(state.call?.isMuted),
      speakerEnabled: Boolean(state.call?.speakerEnabled),
      activeCall: toActiveCallState(state.call, { durationSeconds }),
      missedCalls: state.missedCalls,
      startOutgoingCall: (payload) =>
        dispatch({ type: CALL_ACTIONS.START_OUTGOING, payload }),
      // Place an outgoing video call; the state carries callType: 'video' and
      // enters the lifecycle at `Calling`.
      startOutgoingVideoCall: (payload) =>
        dispatch({
          type: CALL_ACTIONS.START_OUTGOING,
          payload: { ...payload, callType: CALL_TYPE.VIDEO },
        }),
      receiveIncomingCall: (payload) =>
        dispatch({ type: CALL_ACTIONS.START_INCOMING, payload }),
      setCallStatus,
      // Outgoing lifecycle.
      markRinging: () => setCallStatus(CALL_STATUS.RINGING),
      markConnecting: () => setCallStatus(CALL_STATUS.CONNECTING),
      // Incoming lifecycle.
      acceptCall: () => setCallStatus(CALL_STATUS.ACCEPTED),
      rejectCall: () => setCallStatus(CALL_STATUS.REJECTED),
      markMissed: () => setCallStatus(CALL_STATUS.MISSED),
      // Shared lifecycle.
      markConnected: () => setCallStatus(CALL_STATUS.CONNECTED),
      endCall: () => setCallStatus(CALL_STATUS.ENDED),
      // Active-call media controls.
      toggleMute: () => dispatch({ type: CALL_ACTIONS.SET_MUTED, payload: { toggle: true } }),
      setMuted: (isMuted) => dispatch({ type: CALL_ACTIONS.SET_MUTED, payload: { isMuted } }),
      toggleSpeaker: () =>
        dispatch({ type: CALL_ACTIONS.SET_SPEAKER, payload: { toggle: true } }),
      setSpeakerEnabled: (speakerEnabled) =>
        dispatch({ type: CALL_ACTIONS.SET_SPEAKER, payload: { speakerEnabled } }),
      clearCall: () => dispatch({ type: CALL_ACTIONS.CLEAR }),
      clearMissedCalls: () => dispatch({ type: CALL_ACTIONS.CLEAR_MISSED }),
    };
  }, [state.call, state.missedCalls, durationSeconds]);

  return (
    <CallStateContext.Provider value={value}>
      {children}
    </CallStateContext.Provider>
  );
}

export const useCallState = () => useContext(CallStateContext);
