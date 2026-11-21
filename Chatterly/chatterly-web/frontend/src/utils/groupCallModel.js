// Pure, side-effect-free model for group conferencing (Sprint 9 · Story 2).
//
// A group call is a plain object of the shape:
//   { callId, groupId, groupName, hostId, participants[], activeSpeakerId,
//     pinnedId, isLocked, startedAt }
//
// where `participants` is a list of normalized participant snapshots (see
// createGroupCallParticipant) each carrying its own lifecycle `status`, media
// flags and role. Everything here mirrors the design language of the one-to-one
// call utils (see callState.js / videoCallModel.js): frozen values, canonical
// status normalization and transition helpers that return the original
// reference on a no-op so React can skip re-renders. It is deliberately free of
// any DOM/socket/WebRTC concern so it can be unit tested and reused by the UI
// (see components/GroupCallScreen.jsx) or a future signaling layer.

import { formatCallDuration, generateCallId } from './callState';

// Lifecycle of a single participant inside a conference. `CONNECTED` is the only
// state that renders a live tile in the grid; the ringing states describe an
// invite that has not been answered yet, and the resolved states (`DECLINED`,
// `NO_RESPONSE`, `LEFT`, `REMOVED`) describe an invite/participant that will not
// (or no longer) occupy a tile.
export const GROUP_CALL_PARTICIPANT_STATUS = Object.freeze({
  CONNECTED: 'Connected',
  CALLING: 'Calling',
  RINGING: 'Ringing',
  DECLINED: 'Declined',
  NO_RESPONSE: 'No Response',
  LEFT: 'Left',
  REMOVED: 'Removed',
});

// Role a participant holds in the conference. The organizer is the meeting host
// (the group creator) and is surfaced with the "Organizer" tag in the design.
export const GROUP_CALL_ROLE = Object.freeze({
  ORGANIZER: 'organizer',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  MEMBER: 'member',
});

export const GROUP_CALL_PARTICIPANT_STATUSES = Object.freeze(
  Object.values(GROUP_CALL_PARTICIPANT_STATUS)
);
export const GROUP_CALL_ROLES = Object.freeze(Object.values(GROUP_CALL_ROLE));

// Statuses that keep an invite "pending" — it is still waiting on the peer.
const RINGING_STATUSES = Object.freeze([
  GROUP_CALL_PARTICIPANT_STATUS.CALLING,
  GROUP_CALL_PARTICIPANT_STATUS.RINGING,
]);

// Statuses in which a participant no longer occupies a tile in the grid.
const RESOLVED_STATUSES = Object.freeze([
  GROUP_CALL_PARTICIPANT_STATUS.DECLINED,
  GROUP_CALL_PARTICIPANT_STATUS.NO_RESPONSE,
  GROUP_CALL_PARTICIPANT_STATUS.LEFT,
  GROUP_CALL_PARTICIPANT_STATUS.REMOVED,
]);

const STATUS_BY_KEY = GROUP_CALL_PARTICIPANT_STATUSES.reduce((accumulator, status) => {
  accumulator[status.toLowerCase()] = status;
  return accumulator;
}, {});

const ROLE_BY_KEY = GROUP_CALL_ROLES.reduce((accumulator, role) => {
  accumulator[role.toLowerCase()] = role;
  return accumulator;
}, {});

const normalizeId = (value) => String(value ?? '').trim();
const normalizeText = (value) => String(value ?? '').trim();

const normalizeTimestamp = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

export const normalizeGroupCallParticipantStatus = (
  value,
  fallback = GROUP_CALL_PARTICIPANT_STATUS.CONNECTED
) => STATUS_BY_KEY[normalizeText(value).toLowerCase()] || fallback;

export const normalizeGroupCallRole = (value, fallback = GROUP_CALL_ROLE.MEMBER) =>
  ROLE_BY_KEY[normalizeText(value).toLowerCase()] || fallback;

export const isRingingParticipantStatus = (status) =>
  RINGING_STATUSES.includes(normalizeGroupCallParticipantStatus(status, ''));

export const isResolvedParticipantStatus = (status) =>
  RESOLVED_STATUSES.includes(normalizeGroupCallParticipantStatus(status, ''));

export const isConnectedParticipantStatus = (status) =>
  normalizeGroupCallParticipantStatus(status, '') === GROUP_CALL_PARTICIPANT_STATUS.CONNECTED;

// Human-friendly status label used in the participant panel. Connected members
// carry no trailing label (they render live), ringing invites get the animated
// ellipsis and the resolved states surface their outcome verbatim.
export const getParticipantStatusLabel = (status) => {
  const normalizedStatus = normalizeGroupCallParticipantStatus(status, '');
  switch (normalizedStatus) {
    case GROUP_CALL_PARTICIPANT_STATUS.CALLING:
      return 'Calling…';
    case GROUP_CALL_PARTICIPANT_STATUS.RINGING:
      return 'Ringing…';
    case GROUP_CALL_PARTICIPANT_STATUS.DECLINED:
      return 'Declined';
    case GROUP_CALL_PARTICIPANT_STATUS.NO_RESPONSE:
      return 'No Response';
    case GROUP_CALL_PARTICIPANT_STATUS.LEFT:
      return 'Left';
    case GROUP_CALL_PARTICIPANT_STATUS.REMOVED:
      return 'Removed';
    default:
      return '';
  }
};

// Create a normalized, frozen participant snapshot. `id` and `name` are the only
// required fields; the media flags default to a camera-off, unmuted member so a
// freshly-invited participant renders as expected in the grid/panel.
export const createGroupCallParticipant = ({
  id,
  name,
  phone,
  profilePic,
  role,
  isOrganizer,
  isCurrentUser = false,
  status = GROUP_CALL_PARTICIPANT_STATUS.CONNECTED,
  isMuted = false,
  isCameraOn = false,
  isSpeaking = false,
  isVerified = true,
} = {}) => {
  const normalizedId = normalizeId(id);
  if (!normalizedId) {
    throw new Error('id is required to create a group call participant.');
  }

  const normalizedRole = isOrganizer
    ? GROUP_CALL_ROLE.ORGANIZER
    : normalizeGroupCallRole(role);

  return Object.freeze({
    id: normalizedId,
    name: normalizeText(name) || 'Participant',
    phone: normalizeText(phone),
    profilePic: normalizeText(profilePic),
    role: normalizedRole,
    isOrganizer: normalizedRole === GROUP_CALL_ROLE.ORGANIZER,
    isCurrentUser: Boolean(isCurrentUser),
    status: normalizeGroupCallParticipantStatus(status),
    isMuted: Boolean(isMuted),
    isCameraOn: Boolean(isCameraOn),
    isSpeaking: Boolean(isSpeaking),
    isVerified: Boolean(isVerified),
  });
};

// De-duplicate a participant list by id, keeping the first occurrence.
const dedupeParticipants = (participants = []) => {
  const seen = new Set();
  return participants.filter((participant) => {
    const participantId = normalizeId(participant?.id);
    if (!participantId || seen.has(participantId)) return false;
    seen.add(participantId);
    return true;
  });
};

// Build a frozen group-call state from a group and its participant list. The
// active speaker defaults to the first connected non-self participant so a tile
// is highlighted the moment the grid renders.
export const createGroupCallState = ({
  callId,
  groupId,
  groupName,
  hostId,
  participants = [],
  startedAt,
  isLocked = false,
  activeSpeakerId,
  pinnedId,
} = {}) => {
  const normalizedParticipants = dedupeParticipants(
    participants.map((participant) => createGroupCallParticipant(participant))
  );

  const connected = normalizedParticipants.filter(
    (participant) => participant.status === GROUP_CALL_PARTICIPANT_STATUS.CONNECTED
  );
  const resolvedActiveSpeakerId =
    normalizeId(activeSpeakerId) ||
    normalizeId(
      (connected.find((participant) => !participant.isCurrentUser) || connected[0])?.id
    );

  return Object.freeze({
    callId: normalizeId(callId) || generateCallId(),
    groupId: normalizeId(groupId),
    groupName: normalizeText(groupName) || 'Group call',
    hostId: normalizeId(hostId),
    participants: Object.freeze(normalizedParticipants),
    activeSpeakerId: resolvedActiveSpeakerId,
    pinnedId: normalizeId(pinnedId),
    isLocked: Boolean(isLocked),
    startedAt: normalizeTimestamp(startedAt),
  });
};

const findParticipant = (state, id) => {
  const normalizedId = normalizeId(id);
  return state?.participants?.find((participant) => participant.id === normalizedId) || null;
};

// Replace a single participant via `updater`, returning the original state
// reference when nothing changed (updater returned the same object) so callers
// can bail out of a re-render.
const updateParticipant = (state, id, updater) => {
  const normalizedId = normalizeId(id);
  if (!state || !normalizedId) return state;

  let didChange = false;
  const nextParticipants = state.participants.map((participant) => {
    if (participant.id !== normalizedId) return participant;
    const nextParticipant = updater(participant);
    if (nextParticipant && nextParticipant !== participant) {
      didChange = true;
      return Object.freeze(nextParticipant);
    }
    return participant;
  });

  if (!didChange) return state;
  return Object.freeze({ ...state, participants: Object.freeze(nextParticipants) });
};

// --- Participant-list operations ---------------------------------------------

// Add participants mid-call. Existing ids are ignored (no duplicates); brand-new
// entries default to `Calling` so the panel shows them ringing until answered.
export const addGroupCallParticipants = (state, participants = []) => {
  if (!state) return state;
  const incoming = (Array.isArray(participants) ? participants : [participants])
    .map((participant) =>
      createGroupCallParticipant({
        status: GROUP_CALL_PARTICIPANT_STATUS.CALLING,
        ...participant,
      })
    );

  const existingIds = new Set(state.participants.map((participant) => participant.id));
  const additions = dedupeParticipants(incoming).filter(
    (participant) => !existingIds.has(participant.id)
  );

  if (!additions.length) return state;
  return Object.freeze({
    ...state,
    participants: Object.freeze([...state.participants, ...additions]),
  });
};

// Drop a participant from the call entirely (used by the host "Remove from the
// call" control). Clears the pin/active-speaker if they pointed at the removed
// participant so the derived selectors stay valid.
export const removeGroupCallParticipant = (state, id) => {
  const normalizedId = normalizeId(id);
  if (!state || !normalizedId) return state;
  if (!state.participants.some((participant) => participant.id === normalizedId)) {
    return state;
  }

  const nextParticipants = state.participants.filter(
    (participant) => participant.id !== normalizedId
  );

  return Object.freeze({
    ...state,
    participants: Object.freeze(nextParticipants),
    pinnedId: state.pinnedId === normalizedId ? '' : state.pinnedId,
    activeSpeakerId:
      state.activeSpeakerId === normalizedId
        ? normalizeId(
            nextParticipants.find(
              (participant) =>
                !participant.isCurrentUser &&
                participant.status === GROUP_CALL_PARTICIPANT_STATUS.CONNECTED
            )?.id
          )
        : state.activeSpeakerId,
  });
};

// --- Per-participant state transitions ---------------------------------------

export const setParticipantStatus = (state, id, status) => {
  const nextStatus = normalizeGroupCallParticipantStatus(status, '');
  if (!nextStatus) return state;
  return updateParticipant(state, id, (participant) =>
    participant.status === nextStatus ? participant : { ...participant, status: nextStatus }
  );
};

export const setParticipantMuted = (state, id, isMuted) =>
  updateParticipant(state, id, (participant) => {
    const nextMuted = Boolean(isMuted);
    return participant.isMuted === nextMuted ? participant : { ...participant, isMuted: nextMuted };
  });

export const toggleParticipantMuted = (state, id) =>
  updateParticipant(state, id, (participant) => ({ ...participant, isMuted: !participant.isMuted }));

export const setParticipantCameraOn = (state, id, isCameraOn) =>
  updateParticipant(state, id, (participant) => {
    const nextCameraOn = Boolean(isCameraOn);
    return participant.isCameraOn === nextCameraOn
      ? participant
      : { ...participant, isCameraOn: nextCameraOn };
  });

export const toggleParticipantCamera = (state, id) =>
  updateParticipant(state, id, (participant) => ({
    ...participant,
    isCameraOn: !participant.isCameraOn,
  }));

// --- Call-level controls ------------------------------------------------------

// Pin a participant to the primary/spotlight slot. Pinning the already-pinned
// participant clears it (toggle), matching a tap-to-pin / tap-to-unpin control.
export const pinParticipant = (state, id) => {
  const normalizedId = normalizeId(id);
  if (!state) return state;
  const nextPinnedId = state.pinnedId === normalizedId ? '' : normalizedId;
  if (nextPinnedId && !findParticipant(state, nextPinnedId)) return state;
  if (state.pinnedId === nextPinnedId) return state;
  return Object.freeze({ ...state, pinnedId: nextPinnedId });
};

export const unpinParticipant = (state) => {
  if (!state || !state.pinnedId) return state;
  return Object.freeze({ ...state, pinnedId: '' });
};

// Highlight the active speaker. The UI auto-highlights whoever is talking; the
// value must reference a connected participant to take effect.
export const setActiveSpeaker = (state, id) => {
  const normalizedId = normalizeId(id);
  if (!state || state.activeSpeakerId === normalizedId) return state;
  if (normalizedId) {
    const participant = findParticipant(state, normalizedId);
    if (!participant || participant.status !== GROUP_CALL_PARTICIPANT_STATUS.CONNECTED) {
      return state;
    }
  }
  return Object.freeze({ ...state, activeSpeakerId: normalizedId });
};

// Lock the meeting so no new participants can join (host control).
export const setMeetingLocked = (state, isLocked) => {
  if (!state) return state;
  const nextLocked = Boolean(isLocked);
  if (state.isLocked === nextLocked) return state;
  return Object.freeze({ ...state, isLocked: nextLocked });
};

export const toggleMeetingLocked = (state) => setMeetingLocked(state, !state?.isLocked);

// --- Derived selectors --------------------------------------------------------

// Participants that render a live tile in the grid. A pinned participant is
// pulled to the front of the grid (the spotlight slot); the active speaker is
// only highlighted in place (see getSpotlightParticipantId) and never reorders
// the grid, so tiles don't jump around as people talk.
export const getConnectedParticipants = (state) => {
  if (!state) return [];
  const connected = state.participants.filter(
    (participant) => participant.status === GROUP_CALL_PARTICIPANT_STATUS.CONNECTED
  );

  const pinnedId = normalizeId(state.pinnedId);
  if (!pinnedId) return connected;

  const pinned = connected.find((participant) => participant.id === pinnedId);
  if (!pinned) return connected;
  return [pinned, ...connected.filter((participant) => participant.id !== pinnedId)];
};

// The tile count that drives the auto-adjusting grid layout.
export const getConnectedParticipantCount = (state) =>
  getConnectedParticipants(state).length;

export const getRingingParticipants = (state) =>
  (state?.participants || []).filter((participant) =>
    isRingingParticipantStatus(participant.status)
  );

export const getSpotlightParticipantId = (state) =>
  normalizeId(state?.pinnedId) || normalizeId(state?.activeSpeakerId);

export const isParticipantSpotlighted = (state, id) =>
  Boolean(id) && getSpotlightParticipantId(state) === normalizeId(id);

// Auto-adjusting column count for the participant grid (Story 2 wireframe shows
// an equal-block grid that widens as the call fills up, capping at five).
export const getGroupCallGridColumns = (participantCount = 0) => {
  const count = Math.max(0, Math.floor(Number(participantCount) || 0));
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  return 5;
};

// Whole seconds the call has been running, from `startedAt` to `now`.
export const getGroupCallElapsedSeconds = (state, now = Date.now()) => {
  const startedAtMs = state?.startedAt ? new Date(state.startedAt).getTime() : NaN;
  if (Number.isNaN(startedAtMs)) return 0;
  return Math.max(0, Math.floor((now - startedAtMs) / 1000));
};

// Reuse the one-to-one call timer formatting (`m:ss` / `h:mm:ss`).
export const formatGroupCallDuration = (totalSeconds = 0) => formatCallDuration(totalSeconds);
