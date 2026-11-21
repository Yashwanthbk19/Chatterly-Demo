// Pure call-state model and lifecycle helpers.
//
// A call state is a plain object of the shape:
//   { callId, callerId, receiverId, callType, status, incoming, startedAt,
//     connectedAt, endedAt, isMuted, speakerEnabled }
//
// where `callType` is 'audio' or 'video' (see CALL_TYPE), `status` is one of the
// canonical CALL_STATUS values and `incoming` is a boolean flag distinguishing a
// received call from one this client placed. `connectedAt`/`endedAt` bound the
// active-call duration timer, and `isMuted`/`speakerEnabled` carry the in-call
// media controls — together they form the active-call snapshot the UI consumes
// (see `toActiveCallState`). An outgoing video call walks the shared lifecycle
// Calling → Ringing → Connecting → Connected → Ended (see createVideoCallState).
// Everything in this module is side-effect free so it can be unit tested and
// reused by the React context (see context/CallStateContext.jsx) or any
// socket/WebRTC layer.

export const CALL_STATUS = Object.freeze({
  // Outgoing lifecycle (this client placed the call).
  CALLING: 'Calling',
  RINGING: 'Ringing',
  // Incoming lifecycle (this client received the call).
  INCOMING: 'Incoming',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  MISSED: 'Missed',
  // Shared lifecycle.
  CONNECTING: 'Connecting',
  CONNECTED: 'Connected',
  RECONNECTING: 'Reconnecting',
  DISCONNECTED: 'Disconnected',
  ENDED: 'Ended',
});

export const CALL_TYPE = Object.freeze({
  AUDIO: 'audio',
  VIDEO: 'video',
});

export const CALL_STATUSES = Object.freeze(Object.values(CALL_STATUS));
export const CALL_TYPES = Object.freeze(Object.values(CALL_TYPE));
export const CALL_FIELDS = Object.freeze([
  'callId',
  'callerId',
  'receiverId',
  'callType',
  'status',
  'incoming',
  'startedAt',
  'connectedAt',
  'endedAt',
  'isMuted',
  'speakerEnabled',
]);
export const INCOMING_CALL_FIELDS = Object.freeze([
  'callerId',
  'callerName',
  'callerImage',
  'callType',
  'receivedAt',
  'status',
]);
export const CALL_SCHEMA = Object.freeze({
  fields: CALL_FIELDS,
  statuses: CALL_STATUSES,
});
export const INCOMING_CALL_SCHEMA = Object.freeze({
  fields: INCOMING_CALL_FIELDS,
  statuses: CALL_STATUSES,
  callTypes: CALL_TYPES,
});

// How long an unanswered incoming call rings before it is auto-marked `Missed`.
export const INCOMING_CALL_RING_TIMEOUT_MS = 30000;

// Allowed forward transitions for each status. A call can always be forced to
// `Ended` (hang up / failure), but otherwise only moves forward through the
// lifecycle.
//
//   Outgoing:  Calling -> Ringing -> Connecting -> Connected -> Ended
//   Incoming:  Incoming -> Accepted -> Connecting -> Connected -> Ended
//              Incoming -> Rejected -> Ended            (receiver declined)
//              Incoming -> Missed   -> Ended            (ring timeout elapsed)
//
// `Rejected`, `Missed` and `Ended` are resolved states; the only move left from
// them is the terminal `Ended`.
const CALL_STATUS_TRANSITIONS = Object.freeze({
  [CALL_STATUS.CALLING]: Object.freeze([
    CALL_STATUS.RINGING,
    CALL_STATUS.CONNECTING,
    CALL_STATUS.DISCONNECTED,
    CALL_STATUS.ENDED,
  ]),
  [CALL_STATUS.RINGING]: Object.freeze([
    CALL_STATUS.CONNECTING,
    CALL_STATUS.DISCONNECTED,
    CALL_STATUS.ENDED,
  ]),
  [CALL_STATUS.INCOMING]: Object.freeze([
    CALL_STATUS.ACCEPTED,
    CALL_STATUS.REJECTED,
    CALL_STATUS.MISSED,
    CALL_STATUS.DISCONNECTED,
    CALL_STATUS.ENDED,
  ]),
  [CALL_STATUS.ACCEPTED]: Object.freeze([
    CALL_STATUS.CONNECTING,
    CALL_STATUS.CONNECTED,
    CALL_STATUS.DISCONNECTED,
    CALL_STATUS.ENDED,
  ]),
  [CALL_STATUS.CONNECTING]: Object.freeze([
    CALL_STATUS.CONNECTED,
    CALL_STATUS.RECONNECTING,
    CALL_STATUS.DISCONNECTED,
    CALL_STATUS.ENDED,
  ]),
  [CALL_STATUS.CONNECTED]: Object.freeze([
    CALL_STATUS.RECONNECTING,
    CALL_STATUS.DISCONNECTED,
    CALL_STATUS.ENDED,
  ]),
  [CALL_STATUS.RECONNECTING]: Object.freeze([
    CALL_STATUS.CONNECTED,
    CALL_STATUS.DISCONNECTED,
    CALL_STATUS.ENDED,
  ]),
  [CALL_STATUS.DISCONNECTED]: Object.freeze([CALL_STATUS.ENDED]),
  [CALL_STATUS.REJECTED]: Object.freeze([CALL_STATUS.ENDED]),
  [CALL_STATUS.MISSED]: Object.freeze([CALL_STATUS.ENDED]),
  [CALL_STATUS.ENDED]: Object.freeze([]),
});

// Statuses in which a call is no longer live: it was declined, never answered,
// or has ended. `Ended` is the single terminal state.
const RESOLVED_CALL_STATUSES = Object.freeze([
  CALL_STATUS.REJECTED,
  CALL_STATUS.MISSED,
  CALL_STATUS.DISCONNECTED,
  CALL_STATUS.ENDED,
]);

// Build a case-insensitive lookup so values coming from the network/UI such as
// 'ringing', 'RINGING' or ' Connected ' all resolve to the canonical form.
const CANONICAL_STATUS_BY_KEY = CALL_STATUSES.reduce((accumulator, status) => {
  accumulator[status.toLowerCase()] = status;
  return accumulator;
}, {});

export const isCallStatus = (value) =>
  typeof value === 'string' && CALL_STATUSES.includes(value);

export const normalizeCallStatus = (value, fallback = '') => {
  const normalizedKey = String(value || '').trim().toLowerCase();
  return CANONICAL_STATUS_BY_KEY[normalizedKey] || fallback;
};

export const isTerminalCallStatus = (status) =>
  normalizeCallStatus(status) === CALL_STATUS.ENDED;

// A call is "resolved" once it has been declined, missed or ended — it can no
// longer become a live conversation.
export const isResolvedCallStatus = (status) =>
  RESOLVED_CALL_STATUSES.includes(normalizeCallStatus(status));

export const isIncomingRingingStatus = (status) =>
  normalizeCallStatus(status) === CALL_STATUS.INCOMING;

// Media-kind selectors. `state` may be a full call state or a bare callType
// string; both resolve through the canonical CALL_TYPE values.
export const getCallType = (state) =>
  normalizeCallType(typeof state === 'string' ? state : state?.callType);

export const isVideoCall = (state) => getCallType(state) === CALL_TYPE.VIDEO;
export const isAudioCall = (state) => getCallType(state) === CALL_TYPE.AUDIO;

export const isActiveCallStatus = (status) => {
  const normalizedStatus = normalizeCallStatus(status);
  return Boolean(normalizedStatus) && !isResolvedCallStatus(normalizedStatus);
};

export const canTransitionCallStatus = (fromStatus, toStatus) => {
  const normalizedFrom = normalizeCallStatus(fromStatus);
  const normalizedTo = normalizeCallStatus(toStatus);
  if (!normalizedFrom || !normalizedTo) return false;

  return (CALL_STATUS_TRANSITIONS[normalizedFrom] || []).includes(normalizedTo);
};

export const generateCallId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeId = (value) => String(value ?? '').trim();
const normalizeText = (value) => String(value ?? '').trim();
const normalizeStartedAt = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};
const normalizeCallType = (value) => {
  const normalizedType = normalizeText(value).toLowerCase();
  return CALL_TYPES.includes(normalizedType) ? normalizedType : CALL_TYPE.AUDIO;
};

// The statuses that only ever describe a call from the receiver's perspective.
const RECEIVER_SIDE_STATUSES = Object.freeze([
  CALL_STATUS.INCOMING,
  CALL_STATUS.ACCEPTED,
  CALL_STATUS.REJECTED,
  CALL_STATUS.MISSED,
]);
const isReceiverSideStatus = (status) =>
  RECEIVER_SIDE_STATUSES.includes(normalizeCallStatus(status));

// Create a normalized, frozen call state. `callId` is generated when omitted so
// callers can rely on every active call having a stable identifier. When
// `incoming` is omitted it is inferred from the status (the receiver-side
// statuses default to an incoming call). Active-call controls default to
// unmuted with the speaker off; `connectedAt` is stamped automatically when a
// call is created already `Connected` so its duration timer starts from there.
export const createCallState = ({
  callId,
  callerId,
  receiverId,
  callType,
  status = CALL_STATUS.CALLING,
  incoming,
  startedAt,
  connectedAt,
  endedAt,
  isMuted = false,
  speakerEnabled = false,
} = {}) => {
  const normalizedStatus = normalizeCallStatus(status);
  if (!normalizedStatus) {
    throw new Error(`Invalid call status: ${String(status)}`);
  }

  const normalizedCallerId = normalizeId(callerId);
  const normalizedReceiverId = normalizeId(receiverId);
  if (!normalizedCallerId || !normalizedReceiverId) {
    throw new Error('callerId and receiverId are required to create a call state.');
  }

  const normalizedStartedAt = normalizeStartedAt(startedAt);
  const resolvedConnectedAt = connectedAt
    ? normalizeStartedAt(connectedAt)
    : normalizedStatus === CALL_STATUS.CONNECTED
      ? normalizedStartedAt
      : null;

  return Object.freeze({
    callId: normalizeId(callId) || generateCallId(),
    callerId: normalizedCallerId,
    receiverId: normalizedReceiverId,
    callType: normalizeCallType(callType),
    status: normalizedStatus,
    incoming: incoming === undefined ? isReceiverSideStatus(normalizedStatus) : Boolean(incoming),
    startedAt: normalizedStartedAt,
    connectedAt: resolvedConnectedAt,
    endedAt: endedAt ? normalizeStartedAt(endedAt) : null,
    isMuted: Boolean(isMuted),
    speakerEnabled: Boolean(speakerEnabled),
  });
};

// Convenience builders for the two ways a call enters the system.
export const createOutgoingCallState = ({ callId, callerId, receiverId, callType, startedAt } = {}) =>
  createCallState({
    callId,
    callerId,
    receiverId,
    callType,
    status: CALL_STATUS.CALLING,
    incoming: false,
    startedAt,
  });

// Start an outgoing video call. It enters at `Calling` and walks the shared
// lifecycle Calling → Ringing → Connecting → Connected → Ended via
// transitionCallState; `callType` is fixed to 'video' so the snapshot carries
// the right media kind for the UI/WebRTC layer.
export const createVideoCallState = ({ callId, callerId, receiverId, startedAt } = {}) =>
  createOutgoingCallState({
    callId,
    callerId,
    receiverId,
    callType: CALL_TYPE.VIDEO,
    startedAt,
  });

export const createIncomingCallModel = ({
  callerId,
  callerName,
  senderName,
  name,
  callerImage,
  profilePic,
  callerAvatar,
  avatar,
  callType,
  receivedAt,
  startedAt,
  status = CALL_STATUS.INCOMING,
} = {}) => {
  const normalizedStatus = normalizeCallStatus(status);
  if (!normalizedStatus) {
    throw new Error(`Invalid incoming call status: ${String(status)}`);
  }

  const normalizedCallerId = normalizeId(callerId);
  if (!normalizedCallerId) {
    throw new Error('callerId is required to create an incoming call model.');
  }

  return Object.freeze({
    callerId: normalizedCallerId,
    callerName: normalizeText(callerName || senderName || name),
    callerImage: normalizeText(callerImage || profilePic || callerAvatar || avatar),
    callType: normalizeCallType(callType),
    receivedAt: normalizeStartedAt(receivedAt || startedAt),
    status: normalizedStatus,
  });
};

export const createIncomingCallState = ({
  callId,
  callerId,
  receiverId,
  callerName,
  senderName,
  name,
  callerImage,
  profilePic,
  callerAvatar,
  avatar,
  callType,
  receivedAt,
  startedAt,
} = {}) => {
  const normalizedReceivedAt = receivedAt || startedAt;
  const callState = createCallState({
    callId,
    callerId,
    receiverId,
    callType,
    status: CALL_STATUS.INCOMING,
    incoming: true,
    startedAt: normalizedReceivedAt,
  });
  return Object.freeze({
    ...callState,
    ...createIncomingCallModel({
      callerId,
      callerName,
      senderName,
      name,
      callerImage,
      profilePic,
      callerAvatar,
      avatar,
      callType,
      receivedAt: normalizedReceivedAt,
      status: callState.status,
    }),
  });
};

// Return a new call state advanced to `nextStatus`. When the transition is not
// allowed the original state object is returned unchanged, so callers can detect
// a no-op via reference equality and stale/out-of-order events are ignored.
export const transitionCallState = (state, nextStatus) => {
  if (!state) return state;

  const normalizedNext = normalizeCallStatus(nextStatus);
  if (!normalizedNext) return state;
  if (normalizedNext === state.status) return state;

  if (!canTransitionCallStatus(state.status, normalizedNext)) {
    return state;
  }

  const nextState = { ...state, status: normalizedNext };
  // Stamp the duration-timer boundaries: `connectedAt` when the call goes live
  // and `endedAt` when it hangs up, so the active-call duration counts from
  // answer to end and freezes at a stable final value afterwards.
  if (normalizedNext === CALL_STATUS.CONNECTED && !nextState.connectedAt) {
    nextState.connectedAt = new Date().toISOString();
  }
  if (normalizedNext === CALL_STATUS.ENDED && !nextState.endedAt) {
    nextState.endedAt = new Date().toISOString();
  }

  return Object.freeze(nextState);
};

// Named transition shortcuts for the incoming-call lifecycle. Each returns the
// original reference when the move is not allowed (see transitionCallState).
export const acceptCall = (state) => transitionCallState(state, CALL_STATUS.ACCEPTED);
export const rejectCall = (state) => transitionCallState(state, CALL_STATUS.REJECTED);
export const missCall = (state) => transitionCallState(state, CALL_STATUS.MISSED);
export const connectCall = (state) => transitionCallState(state, CALL_STATUS.CONNECTED);
export const endCall = (state) => transitionCallState(state, CALL_STATUS.ENDED);

// --- Timeout / missed-call handling -----------------------------------------

// Milliseconds elapsed since the call started. Returns 0 for a missing or
// unparseable `startedAt` so callers never get a NaN.
export const getCallElapsedMs = (state, now = Date.now()) => {
  const startedAtMs = state?.startedAt ? new Date(state.startedAt).getTime() : NaN;
  if (Number.isNaN(startedAtMs)) return 0;
  return Math.max(0, now - startedAtMs);
};

// Milliseconds left before an unanswered incoming call should be missed. Returns
// 0 once the window has elapsed and 0 for calls that are not currently ringing.
export const getRemainingRingTimeMs = (
  state,
  { now = Date.now(), timeoutMs = INCOMING_CALL_RING_TIMEOUT_MS } = {}
) => {
  if (!isIncomingRingingStatus(state?.status)) return 0;
  return Math.max(0, timeoutMs - getCallElapsedMs(state, now));
};

// True when an incoming call has been ringing past the timeout without being
// accepted or rejected.
export const hasIncomingCallTimedOut = (
  state,
  { now = Date.now(), timeoutMs = INCOMING_CALL_RING_TIMEOUT_MS } = {}
) =>
  isIncomingRingingStatus(state?.status) &&
  getCallElapsedMs(state, now) >= timeoutMs;

// Mark a ringing incoming call as `Missed` once it has timed out. Any other
// state (already accepted/rejected, still within the window, not incoming) is
// returned unchanged so the result is safe to use as a reducer return value.
export const markMissedIfTimedOut = (state, options) => {
  if (!hasIncomingCallTimedOut(state, options)) return state;
  return missCall(state);
};

// --- Active-call media controls ----------------------------------------------
//
// Mute and speaker are boolean controls carried on the call state so the whole
// active-call snapshot stays in one place. Each setter returns the original
// reference when the value is unchanged, so callers can detect a no-op via
// reference equality and React can skip a re-render.

export const setCallMuted = (state, isMuted) => {
  if (!state) return state;
  const nextMuted = Boolean(isMuted);
  if (state.isMuted === nextMuted) return state;
  return Object.freeze({ ...state, isMuted: nextMuted });
};

export const toggleCallMute = (state) => setCallMuted(state, !state?.isMuted);

export const setCallSpeakerEnabled = (state, speakerEnabled) => {
  if (!state) return state;
  const nextEnabled = Boolean(speakerEnabled);
  if (state.speakerEnabled === nextEnabled) return state;
  return Object.freeze({ ...state, speakerEnabled: nextEnabled });
};

export const toggleCallSpeaker = (state) =>
  setCallSpeakerEnabled(state, !state?.speakerEnabled);

// --- Active-call duration timer ----------------------------------------------

export const isConnectedCallStatus = (status) =>
  normalizeCallStatus(status) === CALL_STATUS.CONNECTED;

// Milliseconds the call has been connected: measured from `connectedAt` up to
// `endedAt` (so a finished call keeps a stable final duration) or `now` while
// the call is still live. Returns 0 before the call connects.
export const getCallDurationMs = (state, now = Date.now()) => {
  const connectedAtMs = state?.connectedAt ? new Date(state.connectedAt).getTime() : NaN;
  if (Number.isNaN(connectedAtMs)) return 0;
  const endedAtMs = state?.endedAt ? new Date(state.endedAt).getTime() : NaN;
  const untilMs = Number.isNaN(endedAtMs) ? now : endedAtMs;
  return Math.max(0, untilMs - connectedAtMs);
};

// Whole seconds the call has been connected — the value driving the live timer.
export const getCallDurationSeconds = (state, now = Date.now()) =>
  Math.floor(getCallDurationMs(state, now) / 1000);

// Format a whole-second duration as a call timer: `mm:ss`, widening to `h:mm:ss`
// once the call passes an hour. Minutes are always shown (a 45-second call reads
// `00:45`), so a duration never reads as a bare count of seconds.
export const formatCallDuration = (totalSeconds = 0) => {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${paddedMinutes}:${paddedSeconds}`;
};

// Project a full call state down to the active-call snapshot the UI consumes:
//   { callId, callType, startedAt, connectedAt, duration, isMuted, speakerEnabled, status }
// `duration` is whole seconds. Pass a precomputed `durationSeconds` (e.g. from a
// live timer that ticks every second) to keep the snapshot in sync with it;
// otherwise it is derived from `now`.
export const toActiveCallState = (state, { now = Date.now(), durationSeconds } = {}) => {
  if (!state) return null;
  const duration =
    durationSeconds === undefined
      ? getCallDurationSeconds(state, now)
      : Math.max(0, Math.floor(Number(durationSeconds) || 0));
  return {
    callId: state.callId,
    callType: normalizeCallType(state.callType),
    startedAt: state.startedAt,
    connectedAt: state.connectedAt,
    duration,
    isMuted: Boolean(state.isMuted),
    speakerEnabled: Boolean(state.speakerEnabled),
    status: state.status,
  };
};

export const toCallData = (call = {}) => {
  const model = createCallState(call);
  return CALL_SCHEMA.fields.reduce((data, field) => {
    data[field] = model[field];
    return data;
  }, {});
};

export const toIncomingCallData = (call = {}) => {
  const model = createIncomingCallModel(call);
  return INCOMING_CALL_SCHEMA.fields.reduce((data, field) => {
    data[field] = model[field];
    return data;
  }, {});
};
