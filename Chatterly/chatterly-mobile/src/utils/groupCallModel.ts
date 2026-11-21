import type {GroupMember, GroupMemberRole} from '../services/groupApi';

// Sprint 9 Story 2 - Group Conferencing.
//
// The pure, side-effect-free model behind GroupCallScreen. It is the mobile
// port of the web client's utils/groupCallModel.js, so both clients describe a
// conference the same way: a frozen call snapshot holding normalized
// participants, each with its own lifecycle status, media flags and role.
//
// Nothing here touches a socket, the camera or React. Transitions return the
// *original* reference when nothing changed so a caller can skip a re-render,
// and every selector is derived rather than stored.

/**
 * Lifecycle of one participant inside a conference. `Connected` is the only
 * state that renders a live tile; the ringing states describe an invite that
 * has not been answered, and the resolved states describe someone who will not
 * (or no longer) occupy a tile.
 */
export const GROUP_CALL_PARTICIPANT_STATUS = {
  CONNECTED: 'Connected',
  CALLING: 'Calling',
  RINGING: 'Ringing',
  DECLINED: 'Declined',
  NO_RESPONSE: 'No Response',
  LEFT: 'Left',
  REMOVED: 'Removed',
} as const;

export type GroupCallParticipantStatus = (typeof GROUP_CALL_PARTICIPANT_STATUS)[keyof typeof GROUP_CALL_PARTICIPANT_STATUS];

/** Role a participant holds in the conference. The organizer started the call. */
export const GROUP_CALL_ROLE = {
  ORGANIZER: 'organizer',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  MEMBER: 'member',
} as const;

export type GroupCallRole = (typeof GROUP_CALL_ROLE)[keyof typeof GROUP_CALL_ROLE];

export type GroupCallParticipant = {
  id: string;
  name: string;
  phone: string;
  profilePic: string;
  role: GroupCallRole;
  isOrganizer: boolean;
  isCurrentUser: boolean;
  status: GroupCallParticipantStatus;
  isMuted: boolean;
  isCameraOn: boolean;
  isSpeaking: boolean;
  isSharingScreen: boolean;
  /** Per-tile network label shown under the participant name. */
  connection: GroupCallConnection;
};

export type GroupCallConnection = 'Good' | 'Moderate' | 'Weak';

export type GroupCallState = {
  callId: string;
  groupId: string;
  groupName: string;
  hostId: string;
  participants: GroupCallParticipant[];
  activeSpeakerId: string;
  pinnedId: string;
  isLocked: boolean;
  startedAt: string;
};

export type GroupCallParticipantInput = Partial<Omit<GroupCallParticipant, 'id' | 'isOrganizer'>> & {
  id: string;
  isOrganizer?: boolean;
};

const RINGING_STATUSES: GroupCallParticipantStatus[] = [
  GROUP_CALL_PARTICIPANT_STATUS.CALLING,
  GROUP_CALL_PARTICIPANT_STATUS.RINGING,
];

const RESOLVED_STATUSES: GroupCallParticipantStatus[] = [
  GROUP_CALL_PARTICIPANT_STATUS.DECLINED,
  GROUP_CALL_PARTICIPANT_STATUS.NO_RESPONSE,
  GROUP_CALL_PARTICIPANT_STATUS.LEFT,
  GROUP_CALL_PARTICIPANT_STATUS.REMOVED,
];

export const GROUP_CALL_PARTICIPANT_STATUSES = Object.values(GROUP_CALL_PARTICIPANT_STATUS);
export const GROUP_CALL_ROLES = Object.values(GROUP_CALL_ROLE);

const STATUS_BY_KEY = new Map(GROUP_CALL_PARTICIPANT_STATUSES.map(status => [status.toLowerCase(), status]));
const ROLE_BY_KEY = new Map(GROUP_CALL_ROLES.map(role => [role.toLowerCase(), role]));

const text = (value: unknown): string => String(value ?? '').trim();

const timestamp = (value?: string | null): string => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

export function normalizeParticipantStatus(value: unknown, fallback: GroupCallParticipantStatus = GROUP_CALL_PARTICIPANT_STATUS.CONNECTED): GroupCallParticipantStatus {
  return STATUS_BY_KEY.get(text(value).toLowerCase()) ?? fallback;
}

export function normalizeGroupCallRole(value: unknown, fallback: GroupCallRole = GROUP_CALL_ROLE.MEMBER): GroupCallRole {
  return ROLE_BY_KEY.get(text(value).toLowerCase()) ?? fallback;
}

export const isRingingParticipant = (participant: Pick<GroupCallParticipant, 'status'>): boolean =>
  RINGING_STATUSES.includes(participant.status);

export const isResolvedParticipant = (participant: Pick<GroupCallParticipant, 'status'>): boolean =>
  RESOLVED_STATUSES.includes(participant.status);

export const isConnectedParticipant = (participant: Pick<GroupCallParticipant, 'status'>): boolean =>
  participant.status === GROUP_CALL_PARTICIPANT_STATUS.CONNECTED;

/**
 * Trailing label in the participant panel. Connected members carry none (they
 * render live); ringing invites get the animated ellipsis and the resolved
 * states surface their outcome verbatim.
 */
export function participantStatusLabel(status: GroupCallParticipantStatus): string {
  switch (status) {
    case GROUP_CALL_PARTICIPANT_STATUS.CALLING: return 'Calling…';
    case GROUP_CALL_PARTICIPANT_STATUS.RINGING: return 'Ringing…';
    case GROUP_CALL_PARTICIPANT_STATUS.DECLINED: return 'Declined';
    case GROUP_CALL_PARTICIPANT_STATUS.NO_RESPONSE: return 'No Response';
    case GROUP_CALL_PARTICIPANT_STATUS.LEFT: return 'Left';
    case GROUP_CALL_PARTICIPANT_STATUS.REMOVED: return 'Removed';
    default: return '';
  }
}

/** The group role a member holds maps onto the conference role one-to-one. */
export function roleFromGroupMember(role: GroupMemberRole | undefined): GroupCallRole {
  if (role === 'superadmin' || role === 'admin') { return GROUP_CALL_ROLE.ADMIN; }
  if (role === 'moderator') { return GROUP_CALL_ROLE.MODERATOR; }
  return GROUP_CALL_ROLE.MEMBER;
}

export function createGroupCallParticipant(input: GroupCallParticipantInput): GroupCallParticipant {
  const id = text(input.id);
  if (!id) { throw new Error('id is required to create a group call participant.'); }
  const role = input.isOrganizer ? GROUP_CALL_ROLE.ORGANIZER : normalizeGroupCallRole(input.role);
  return {
    id,
    name: text(input.name) || 'Participant',
    phone: text(input.phone),
    profilePic: text(input.profilePic),
    role,
    isOrganizer: role === GROUP_CALL_ROLE.ORGANIZER,
    isCurrentUser: Boolean(input.isCurrentUser),
    status: normalizeParticipantStatus(input.status),
    isMuted: Boolean(input.isMuted),
    isCameraOn: Boolean(input.isCameraOn),
    isSpeaking: Boolean(input.isSpeaking),
    isSharingScreen: Boolean(input.isSharingScreen),
    connection: input.connection === 'Moderate' || input.connection === 'Weak' ? input.connection : 'Good',
  };
}

/** Build a call participant straight from the group roster fetched over REST. */
export function participantFromGroupMember(member: GroupMember, options: {currentUserId?: string; hostId?: string; status?: GroupCallParticipantStatus} = {}): GroupCallParticipant {
  const currentUserId = text(options.currentUserId);
  const hostId = text(options.hostId);
  return createGroupCallParticipant({
    id: member.userId,
    name: member.name,
    phone: member.phone || '',
    profilePic: member.profilePic || '',
    role: roleFromGroupMember(member.role),
    isOrganizer: Boolean(hostId) && member.userId === hostId,
    isCurrentUser: Boolean(currentUserId) && member.userId === currentUserId,
    status: options.status ?? GROUP_CALL_PARTICIPANT_STATUS.CALLING,
  });
}

const dedupe = (participants: GroupCallParticipant[]): GroupCallParticipant[] => {
  const seen = new Set<string>();
  return participants.filter(participant => {
    if (!participant.id || seen.has(participant.id)) { return false; }
    seen.add(participant.id);
    return true;
  });
};

export function createGroupCallState(input: {
  callId?: string;
  groupId?: string;
  groupName?: string;
  hostId?: string;
  participants?: GroupCallParticipantInput[];
  startedAt?: string | null;
  isLocked?: boolean;
  activeSpeakerId?: string;
  pinnedId?: string;
} = {}): GroupCallState {
  const participants = dedupe((input.participants || []).map(createGroupCallParticipant));
  const connected = participants.filter(isConnectedParticipant);
  return {
    callId: text(input.callId),
    groupId: text(input.groupId),
    groupName: text(input.groupName) || 'Group Call',
    hostId: text(input.hostId),
    participants,
    activeSpeakerId:
      text(input.activeSpeakerId) ||
      text((connected.find(participant => !participant.isCurrentUser) || connected[0])?.id),
    pinnedId: text(input.pinnedId),
    isLocked: Boolean(input.isLocked),
    startedAt: timestamp(input.startedAt),
  };
}

export const findParticipant = (state: GroupCallState | null, id: string): GroupCallParticipant | null =>
  state?.participants.find(participant => participant.id === text(id)) || null;

/**
 * Replace one participant through `updater`. The original state reference comes
 * back when the updater made no change, which is what lets the screen skip a
 * re-render for the many socket events that repeat what we already know.
 */
function updateParticipant(state: GroupCallState, id: string, updater: (participant: GroupCallParticipant) => GroupCallParticipant): GroupCallState {
  const participantId = text(id);
  if (!participantId) { return state; }

  let changed = false;
  const participants = state.participants.map(participant => {
    if (participant.id !== participantId) { return participant; }
    const next = updater(participant);
    if (next !== participant) { changed = true; return next; }
    return participant;
  });

  return changed ? {...state, participants} : state;
}

// --- Participant-list operations --------------------------------------------

/**
 * Add participants mid-call. Known ids are ignored rather than duplicated, and
 * a brand-new entry defaults to `Calling` so the panel rings until they answer.
 */
export function addGroupCallParticipants(state: GroupCallState, incoming: GroupCallParticipantInput | GroupCallParticipantInput[]): GroupCallState {
  const list = Array.isArray(incoming) ? incoming : [incoming];
  const known = new Set(state.participants.map(participant => participant.id));
  const additions = dedupe(
    list.map(participant => createGroupCallParticipant({status: GROUP_CALL_PARTICIPANT_STATUS.CALLING, ...participant})),
  ).filter(participant => !known.has(participant.id));

  if (!additions.length) { return state; }
  return {...state, participants: [...state.participants, ...additions]};
}

/**
 * Drop a participant from the call entirely (the host's "Remove from the call").
 * Clears the pin and the active speaker when they pointed at the removed
 * participant, so every derived selector stays valid.
 */
export function removeGroupCallParticipant(state: GroupCallState, id: string): GroupCallState {
  const participantId = text(id);
  if (!participantId || !state.participants.some(participant => participant.id === participantId)) { return state; }

  const participants = state.participants.filter(participant => participant.id !== participantId);
  return {
    ...state,
    participants,
    pinnedId: state.pinnedId === participantId ? '' : state.pinnedId,
    activeSpeakerId: state.activeSpeakerId === participantId
      ? text(participants.find(participant => !participant.isCurrentUser && isConnectedParticipant(participant))?.id)
      : state.activeSpeakerId,
  };
}

// --- Per-participant transitions --------------------------------------------

export function setParticipantStatus(state: GroupCallState, id: string, status: GroupCallParticipantStatus): GroupCallState {
  const next = normalizeParticipantStatus(status, GROUP_CALL_PARTICIPANT_STATUS.CONNECTED);
  const updated = updateParticipant(state, id, participant =>
    participant.status === next ? participant : {...participant, status: next});
  if (updated === state) { return state; }
  // Someone who stopped being connected cannot keep the spotlight.
  const stillConnected = findParticipant(updated, id);
  if (stillConnected && isConnectedParticipant(stillConnected)) { return updated; }
  return {
    ...updated,
    pinnedId: updated.pinnedId === text(id) ? '' : updated.pinnedId,
    activeSpeakerId: updated.activeSpeakerId === text(id)
      ? text(updated.participants.find(participant => !participant.isCurrentUser && isConnectedParticipant(participant))?.id)
      : updated.activeSpeakerId,
  };
}

export const setParticipantMuted = (state: GroupCallState, id: string, isMuted: boolean): GroupCallState =>
  updateParticipant(state, id, participant =>
    participant.isMuted === isMuted ? participant : {...participant, isMuted});

export const toggleParticipantMuted = (state: GroupCallState, id: string): GroupCallState =>
  updateParticipant(state, id, participant => ({...participant, isMuted: !participant.isMuted}));

export const setParticipantCameraOn = (state: GroupCallState, id: string, isCameraOn: boolean): GroupCallState =>
  updateParticipant(state, id, participant =>
    participant.isCameraOn === isCameraOn ? participant : {...participant, isCameraOn});

export const toggleParticipantCamera = (state: GroupCallState, id: string): GroupCallState =>
  updateParticipant(state, id, participant => ({...participant, isCameraOn: !participant.isCameraOn}));

export const setParticipantSharingScreen = (state: GroupCallState, id: string, isSharingScreen: boolean): GroupCallState => {
  // Only one screen can be shared at a time, mirroring the backend's single
  // `screenSharingUser` field, so starting one clears everybody else's.
  const participantId = text(id);
  let changed = false;
  const participants = state.participants.map(participant => {
    const next = participant.id === participantId ? isSharingScreen : isSharingScreen ? false : participant.isSharingScreen;
    if (participant.isSharingScreen === next) { return participant; }
    changed = true;
    return {...participant, isSharingScreen: next};
  });
  return changed ? {...state, participants} : state;
};

export const setParticipantConnection = (state: GroupCallState, id: string, connection: GroupCallConnection): GroupCallState =>
  updateParticipant(state, id, participant =>
    participant.connection === connection ? participant : {...participant, connection});

// --- Call-level controls ------------------------------------------------------

/** Pin to the spotlight. Pinning the already-pinned participant clears it. */
export function pinParticipant(state: GroupCallState, id: string): GroupCallState {
  const participantId = text(id);
  const nextPinnedId = state.pinnedId === participantId ? '' : participantId;
  if (nextPinnedId && !findParticipant(state, nextPinnedId)) { return state; }
  if (state.pinnedId === nextPinnedId) { return state; }
  return {...state, pinnedId: nextPinnedId};
}

export const unpinParticipant = (state: GroupCallState): GroupCallState =>
  state.pinnedId ? {...state, pinnedId: ''} : state;

/** Highlight whoever is speaking. Only a connected participant can take it. */
export function setActiveSpeaker(state: GroupCallState, id: string): GroupCallState {
  const participantId = text(id);
  if (state.activeSpeakerId === participantId) { return state; }
  if (participantId) {
    const participant = findParticipant(state, participantId);
    if (!participant || !isConnectedParticipant(participant)) { return state; }
  }
  return {...state, activeSpeakerId: participantId};
}

export function setMeetingLocked(state: GroupCallState, isLocked: boolean): GroupCallState {
  return state.isLocked === isLocked ? state : {...state, isLocked};
}

export const toggleMeetingLocked = (state: GroupCallState): GroupCallState => setMeetingLocked(state, !state.isLocked);

// --- Derived selectors --------------------------------------------------------

/**
 * Participants that render a live tile. A pinned participant is pulled to the
 * front (the spotlight slot); the active speaker is only highlighted in place
 * so tiles never jump around as people talk.
 */
export function connectedParticipants(state: GroupCallState | null): GroupCallParticipant[] {
  if (!state) { return []; }
  const connected = state.participants.filter(isConnectedParticipant);
  const pinnedId = text(state.pinnedId);
  if (!pinnedId) { return connected; }
  const pinned = connected.find(participant => participant.id === pinnedId);
  if (!pinned) { return connected; }
  return [pinned, ...connected.filter(participant => participant.id !== pinnedId)];
}

export const ringingParticipants = (state: GroupCallState | null): GroupCallParticipant[] =>
  (state?.participants || []).filter(isRingingParticipant);

/** Everyone invited who is not on a tile: still ringing, or already resolved. */
export const offCallParticipants = (state: GroupCallState | null): GroupCallParticipant[] =>
  (state?.participants || []).filter(participant => !isConnectedParticipant(participant));

export const spotlightParticipantId = (state: GroupCallState | null): string =>
  text(state?.pinnedId) || text(state?.activeSpeakerId);

export const isParticipantSpotlighted = (state: GroupCallState | null, id: string): boolean =>
  Boolean(text(id)) && spotlightParticipantId(state) === text(id);

export const screenSharingParticipant = (state: GroupCallState | null): GroupCallParticipant | null =>
  state?.participants.find(participant => participant.isSharingScreen && isConnectedParticipant(participant)) || null;

/**
 * Column count for the tile grid. The Story 2 wireframe shows an equal-block
 * grid that stays two-up on a phone and only tightens once the call fills.
 */
export function groupCallGridColumns(participantCount: number, maximumTiles = 0): number {
  const visible = maximumTiles > 0 ? Math.min(participantCount, maximumTiles) : participantCount;
  const count = Math.max(0, Math.floor(Number(visible) || 0));
  if (count <= 1) { return 1; }
  if (count <= 6) { return 2; }
  if (count <= 12) { return 3; }
  return 4;
}

/** Whole seconds the call has been running. */
export function groupCallElapsedSeconds(state: GroupCallState | null, now = Date.now()): number {
  const startedAt = state?.startedAt ? new Date(state.startedAt).getTime() : NaN;
  if (Number.isNaN(startedAt)) { return 0; }
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** `hh:mm:ss`, matching the timer under the Group Call title in the design. */
export function formatGroupCallDuration(totalSeconds = 0): string {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
}

/**
 * Whether this user may run the host-only controls. The backend gates
 * `group_call_end`, `group_call_mute_user`, `group_call_add_participant`,
 * `group_call_remove_user`, the lock controls and pinning behind
 * validateGroupCallAdmin, so the UI hides what the server would reject.
 */
export function canManageGroupCall(role: GroupMemberRole | undefined): boolean {
  return role === 'superadmin' || role === 'admin';
}
