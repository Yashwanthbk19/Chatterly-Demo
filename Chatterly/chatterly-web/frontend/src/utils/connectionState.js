// Call connection-state model and lifecycle helpers.
//
// While a call is live its transport health is tracked as a plain object:
//   { networkStatus, connectionState, reconnectAttempts, timeoutStatus }
// where `networkStatus` is whether the device has a network (Online / Offline),
// `connectionState` is the call's transport phase (Connecting → Connected,
// dropping to Reconnecting and finally Disconnected), `reconnectAttempts` counts
// the consecutive recovery tries since the last stable Connected, and
// `timeoutStatus` tracks the connect/reconnect watchdog (Idle / Pending /
// TimedOut).
//
// Everything here is side-effect free so it can be unit tested and reused by the
// React call screen or a real WebRTC/socket transport. The connection phases
// intentionally reuse the canonical CALL_STATUS strings, so a connection
// snapshot lines up with the call lifecycle in callState.js.

import { CALL_STATUS, normalizeCallStatus } from './callState';

// The four transport phases of a live call.
//   Connecting   -> first attempt to establish the call
//   Connected    -> media is flowing; the stable state
//   Reconnecting -> the connection dropped and is being recovered
//   Disconnected -> recovery gave up (or the network is gone); terminal
export const CONNECTION_STATE = Object.freeze({
  CONNECTING: CALL_STATUS.CONNECTING,
  CONNECTED: CALL_STATUS.CONNECTED,
  RECONNECTING: CALL_STATUS.RECONNECTING,
  DISCONNECTED: CALL_STATUS.DISCONNECTED,
});

export const NETWORK_STATUS = Object.freeze({
  ONLINE: 'Online',
  OFFLINE: 'Offline',
});

// The connect/reconnect watchdog. `Pending` while an attempt is being timed,
// `TimedOut` once it overran its window, `Idle` when nothing is armed.
export const TIMEOUT_STATUS = Object.freeze({
  IDLE: 'Idle',
  PENDING: 'Pending',
  TIMED_OUT: 'TimedOut',
});

export const CONNECTION_STATES = Object.freeze(Object.values(CONNECTION_STATE));
export const NETWORK_STATUSES = Object.freeze(Object.values(NETWORK_STATUS));
export const TIMEOUT_STATUSES = Object.freeze(Object.values(TIMEOUT_STATUS));
export const CONNECTION_FIELDS = Object.freeze([
  'networkStatus',
  'connectionState',
  'reconnectAttempts',
  'timeoutStatus',
]);

// Reconnection tuning. A dropped call retries with exponential backoff (base
// doubling, capped) plus jitter, and gives up after MAX_RECONNECT_ATTEMPTS so a
// flapping network can never reconnect forever. The watchdog windows mirror the
// call screen's connect/reconnect timeouts.
export const MAX_RECONNECT_ATTEMPTS = 5;
export const RECONNECT_BASE_DELAY_MS = 1000;
export const RECONNECT_MAX_DELAY_MS = 10000;
export const RECONNECT_JITTER_RATIO = 0.5;
export const CONNECT_TIMEOUT_MS = 20000;
export const RECONNECT_TIMEOUT_MS = 15000;

// Allowed forward transitions for each connection phase. A connection can always
// drop to Reconnecting or Disconnected; Disconnected can only restart via a
// fresh Connecting.
//
//   Connecting   -> Connected | Reconnecting | Disconnected
//   Connected    -> Reconnecting | Disconnected
//   Reconnecting -> Connected | Reconnecting (retry) | Disconnected
//   Disconnected -> Connecting (restart)
const CONNECTION_STATE_TRANSITIONS = Object.freeze({
  [CONNECTION_STATE.CONNECTING]: Object.freeze([
    CONNECTION_STATE.CONNECTED,
    CONNECTION_STATE.RECONNECTING,
    CONNECTION_STATE.DISCONNECTED,
  ]),
  [CONNECTION_STATE.CONNECTED]: Object.freeze([
    CONNECTION_STATE.RECONNECTING,
    CONNECTION_STATE.DISCONNECTED,
  ]),
  [CONNECTION_STATE.RECONNECTING]: Object.freeze([
    CONNECTION_STATE.CONNECTED,
    CONNECTION_STATE.RECONNECTING,
    CONNECTION_STATE.DISCONNECTED,
  ]),
  [CONNECTION_STATE.DISCONNECTED]: Object.freeze([CONNECTION_STATE.CONNECTING]),
});

const buildCanonicalLookup = (values) =>
  values.reduce((accumulator, value) => {
    accumulator[value.toLowerCase()] = value;
    return accumulator;
  }, {});

const CANONICAL_NETWORK_BY_KEY = buildCanonicalLookup(NETWORK_STATUSES);
const CANONICAL_TIMEOUT_BY_KEY = buildCanonicalLookup(TIMEOUT_STATUSES);

// Accept the many shapes a network signal arrives in — navigator.onLine
// booleans, 'online'/'offline' strings, 1/0 — and resolve to the canonical
// Online/Offline value.
export const normalizeNetworkStatus = (value, fallback = NETWORK_STATUS.ONLINE) => {
  if (typeof value === 'boolean') {
    return value ? NETWORK_STATUS.ONLINE : NETWORK_STATUS.OFFLINE;
  }
  if (typeof value === 'number') {
    return value > 0 ? NETWORK_STATUS.ONLINE : NETWORK_STATUS.OFFLINE;
  }
  const key = String(value ?? '').trim().toLowerCase();
  if (CANONICAL_NETWORK_BY_KEY[key]) {
    return CANONICAL_NETWORK_BY_KEY[key];
  }
  if (['true', '1', 'connected', 'reachable'].includes(key)) return NETWORK_STATUS.ONLINE;
  if (['false', '0', 'disconnected', 'unreachable'].includes(key)) return NETWORK_STATUS.OFFLINE;
  return fallback;
};

// Resolve any call status to a connection phase, falling back to `Connecting`.
// Reuses the call-lifecycle normalizer, then keeps only the four phases.
export const normalizeConnectionState = (value, fallback = CONNECTION_STATE.CONNECTING) => {
  const normalized = normalizeCallStatus(value);
  return CONNECTION_STATES.includes(normalized) ? normalized : fallback;
};

export const normalizeTimeoutStatus = (value, fallback = TIMEOUT_STATUS.IDLE) => {
  const key = String(value ?? '').trim().toLowerCase();
  return CANONICAL_TIMEOUT_BY_KEY[key] || fallback;
};

const normalizeReconnectAttempts = (value) => {
  const attempts = Math.floor(Number(value));
  return Number.isFinite(attempts) && attempts > 0 ? attempts : 0;
};

// Map a full call-lifecycle status onto its connection phase, or '' when the
// status is not a connection phase (Ringing, Ended, …). Lets the call screen
// derive a connection snapshot straight from its lifecycle status.
export const toConnectionState = (status) => {
  const normalized = normalizeCallStatus(status);
  return CONNECTION_STATES.includes(normalized) ? normalized : '';
};

// Build a normalized, frozen connection snapshot with the full
// { networkStatus, connectionState, reconnectAttempts, timeoutStatus } shape.
export const createConnectionState = ({
  networkStatus,
  connectionState,
  reconnectAttempts,
  timeoutStatus,
} = {}) =>
  Object.freeze({
    networkStatus: normalizeNetworkStatus(networkStatus),
    connectionState: normalizeConnectionState(connectionState),
    reconnectAttempts: normalizeReconnectAttempts(reconnectAttempts),
    timeoutStatus: normalizeTimeoutStatus(timeoutStatus),
  });

// The snapshot a fresh call starts from: Connecting, no prior attempts, watchdog
// armed. `networkStatus` defaults to Online but can be seeded from navigator.
export const createInitialConnectionState = ({ networkStatus } = {}) =>
  createConnectionState({
    networkStatus,
    connectionState: CONNECTION_STATE.CONNECTING,
    reconnectAttempts: 0,
    timeoutStatus: TIMEOUT_STATUS.PENDING,
  });

export const canTransitionConnectionState = (fromState, toState) => {
  const from = normalizeConnectionState(fromState, '');
  const to = normalizeConnectionState(toState, '');
  if (!from || !to) return false;
  return (CONNECTION_STATE_TRANSITIONS[from] || []).includes(to);
};

const withState = (state) => (state ? createConnectionState(state) : createInitialConnectionState());

// --- Lifecycle actions -------------------------------------------------------
// Each returns a new frozen snapshot. Network status is preserved across
// connection moves; the transport drives the phase while these keep the
// reconnect counter and watchdog consistent.

// Begin (or restart) the initial connection attempt: Connecting, counter reset,
// watchdog armed.
export const startConnecting = (state) =>
  createConnectionState({
    networkStatus: withState(state).networkStatus,
    connectionState: CONNECTION_STATE.CONNECTING,
    reconnectAttempts: 0,
    timeoutStatus: TIMEOUT_STATUS.PENDING,
  });

// The live connection dropped: move to Reconnecting, count this attempt and
// re-arm the watchdog. This is the entry point of the reconnection loop.
export const startReconnecting = (state) => {
  const current = withState(state);
  return createConnectionState({
    networkStatus: current.networkStatus,
    connectionState: CONNECTION_STATE.RECONNECTING,
    reconnectAttempts: current.reconnectAttempts + 1,
    timeoutStatus: TIMEOUT_STATUS.PENDING,
  });
};

// Connection (re)established — full recovery: Connected, counter cleared,
// watchdog disarmed.
export const markConnected = (state) =>
  createConnectionState({
    networkStatus: withState(state).networkStatus,
    connectionState: CONNECTION_STATE.CONNECTED,
    reconnectAttempts: 0,
    timeoutStatus: TIMEOUT_STATUS.IDLE,
  });

// The connect/reconnect watchdog fired (the attempt overran its window).
export const markTimedOut = (state) => {
  const current = withState(state);
  if (current.timeoutStatus === TIMEOUT_STATUS.TIMED_OUT) return current;
  return createConnectionState({ ...current, timeoutStatus: TIMEOUT_STATUS.TIMED_OUT });
};

// Give up on the connection: Disconnected, watchdog disarmed.
export const markDisconnected = (state) => {
  const current = withState(state);
  if (current.connectionState === CONNECTION_STATE.DISCONNECTED) return current;
  return createConnectionState({
    ...current,
    connectionState: CONNECTION_STATE.DISCONNECTED,
    timeoutStatus: TIMEOUT_STATUS.IDLE,
  });
};

// Record a device network change without touching the connection phase.
export const setNetworkStatus = (state, networkStatusValue) => {
  const current = withState(state);
  const networkStatus = normalizeNetworkStatus(networkStatusValue);
  if (networkStatus === current.networkStatus) return current;
  return createConnectionState({ ...current, networkStatus });
};

// --- Reconnection / timeout / recovery logic ---------------------------------

// Whole-millisecond exponential backoff for the Nth reconnect attempt, doubling
// from the base delay and capped — deterministic, so callers can test it.
export const getReconnectBackoffMs = (attempt) => {
  const safeAttempt = Math.max(1, Math.floor(Number(attempt) || 1));
  const exponential = RECONNECT_BASE_DELAY_MS * 2 ** (safeAttempt - 1);
  return Math.min(RECONNECT_MAX_DELAY_MS, exponential);
};

// Backoff with +/- jitter applied so simultaneous reconnects don't thunder. The
// random source is injectable to keep it testable.
export const getReconnectDelayMs = (attempt, { random = Math.random } = {}) => {
  const base = getReconnectBackoffMs(attempt);
  const jitter = base * RECONNECT_JITTER_RATIO * (random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
};

export const isNetworkOnline = (state) => withState(state).networkStatus === NETWORK_STATUS.ONLINE;
export const isConnecting = (state) => withState(state).connectionState === CONNECTION_STATE.CONNECTING;
export const isConnected = (state) => withState(state).connectionState === CONNECTION_STATE.CONNECTED;
export const isReconnecting = (state) => withState(state).connectionState === CONNECTION_STATE.RECONNECTING;
export const isDisconnected = (state) => withState(state).connectionState === CONNECTION_STATE.DISCONNECTED;

// A connection is "stable" once it is Connected over a live network with no
// watchdog pending — the green-light condition for an undisturbed call.
export const isStableConnection = (state) => {
  const current = withState(state);
  return (
    current.connectionState === CONNECTION_STATE.CONNECTED &&
    current.networkStatus === NETWORK_STATUS.ONLINE &&
    current.timeoutStatus === TIMEOUT_STATUS.IDLE
  );
};

export const isConnectionTimedOut = (state) =>
  withState(state).timeoutStatus === TIMEOUT_STATUS.TIMED_OUT;

export const hasExhaustedReconnects = (state) =>
  withState(state).reconnectAttempts >= MAX_RECONNECT_ATTEMPTS;

export const canReconnect = (state) => !hasExhaustedReconnects(state);

// The watchdog window for the current phase: the shorter reconnect window while
// Reconnecting, the full connect window otherwise.
export const getConnectionTimeoutMs = (state) =>
  withState(state).connectionState === CONNECTION_STATE.RECONNECTING
    ? RECONNECT_TIMEOUT_MS
    : CONNECT_TIMEOUT_MS;

// Fold a device network change into the connection. Losing the network while a
// call is live moves it into Reconnecting (counting the attempt); other changes
// just record the new network status and let the transport drive the phase.
export const applyNetworkChange = (state, networkStatusValue) => {
  const withNetwork = setNetworkStatus(state, networkStatusValue);
  if (
    withNetwork.networkStatus === NETWORK_STATUS.OFFLINE &&
    (withNetwork.connectionState === CONNECTION_STATE.CONNECTED ||
      withNetwork.connectionState === CONNECTION_STATE.CONNECTING)
  ) {
    return startReconnecting(withNetwork);
  }
  return withNetwork;
};

// Decide what happens when a reconnect attempt's watchdog fires: keep retrying
// (next backoff) while attempts remain, otherwise give up as Disconnected and
// flag the timeout. This is the core "stable" guard against endless retries.
// The give-up state keeps `TimedOut` (unlike a clean markDisconnected, which
// idles the watchdog) so callers can tell a timed-out drop from a manual hangup.
export const onReconnectTimeout = (state) => {
  const current = withState(state);
  if (hasExhaustedReconnects(current)) {
    return createConnectionState({
      networkStatus: current.networkStatus,
      connectionState: CONNECTION_STATE.DISCONNECTED,
      reconnectAttempts: current.reconnectAttempts,
      timeoutStatus: TIMEOUT_STATUS.TIMED_OUT,
    });
  }
  return startReconnecting(current);
};

// Project a snapshot down to the plain CONNECTION_FIELDS data object.
export const toConnectionData = (state = {}) => {
  const model = createConnectionState(state);
  return CONNECTION_FIELDS.reduce((data, field) => {
    data[field] = model[field];
    return data;
  }, {});
};
