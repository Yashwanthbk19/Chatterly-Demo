import {emitWithAck, onSocketReady, subscribeToSocketEvents, type CallType} from './chatRealtime';

// Sprint 9 Story 2 - the client half of the backend's group-call socket
// contract (backend/src/sockets/groupCallSocket.js). Every emitter here maps
// one-to-one onto a `socket.on(...)` the server registers, and every
// subscription onto an event it broadcasts, so nothing in this file invents
// behaviour the server does not have.
//
// Host-only events (end, lock/unlock, mute, add, remove, pin/unpin) are gated
// server-side by validateGroupCallAdmin. The UI hides them for non-admins, and
// the ACK's `message` is surfaced verbatim when the server refuses anyway.

export type GroupCallAck = {success: boolean; message: string; groupCallId?: string};

export type GroupCallInvitationPayload = {
  groupCallId: string;
  /** Only the initial invitation carries these; a mid-call invite does not. */
  groupId?: string;
  type?: CallType;
  startedBy?: string;
  invitedBy?: string;
  isMidCallInvite?: boolean;
};

export type GroupCallSignalPayload = {
  groupCallId: string;
  fromUserId: string;
  offer?: unknown;
  answer?: unknown;
  candidate?: unknown;
};

export type GroupCallHandlers = {
  onStarted?: (payload: {groupCallId: string; groupId?: string; startedBy?: string; type?: CallType}) => void;
  onUserJoined?: (userId: string) => void;
  onUserLeft?: (userId: string) => void;
  onEnded?: (payload: {duration?: number; reason?: string}) => void;
  onLocked?: (locked: boolean) => void;
  /** This device was muted by a host. The server sends it to the personal room. */
  onMutedByHost?: () => void;
  onUserUnmuted?: (userId: string) => void;
  onParticipantAdded?: (userId: string) => void;
  onUserRemoved?: (userId: string) => void;
  onActiveSpeaker?: (userId: string) => void;
  onParticipantPinned?: (userId: string) => void;
  onParticipantUnpinned?: (userId: string) => void;
  onScreenShareStarted?: (userId: string) => void;
  onScreenShareStopped?: (userId: string) => void;
  onHold?: (userId: string) => void;
  onResume?: (userId: string) => void;
  onOffer?: (payload: GroupCallSignalPayload) => void;
  onAnswer?: (payload: GroupCallSignalPayload) => void;
  onIceCandidate?: (payload: GroupCallSignalPayload) => void;
};

const id = (value: unknown): string => String(value ?? '').trim();

const requireCallId = (groupCallId: string): string => {
  const normalized = id(groupCallId);
  if (!normalized) { throw new Error('Group call id is required.'); }
  return normalized;
};

const emitForCall = (event: string, groupCallId: string, fallbackMessage: string): Promise<GroupCallAck> => {
  try {
    return emitWithAck<GroupCallAck>(event, {groupCallId: requireCallId(groupCallId)}, fallbackMessage);
  } catch (error) {
    return Promise.reject(error);
  }
};

const emitForTarget = (event: string, groupCallId: string, targetUserId: string, fallbackMessage: string): Promise<GroupCallAck> => {
  try {
    const target = id(targetUserId);
    if (!target) { throw new Error('Participant id is required.'); }
    return emitWithAck<GroupCallAck>(event, {groupCallId: requireCallId(groupCallId), targetUserId: target}, fallbackMessage);
  } catch (error) {
    return Promise.reject(error);
  }
};

/**
 * Start the conference. The server refuses a second call while one is live
 * ("Group call already active"), which is how a member who taps call while a
 * conference is running is routed into joining it instead.
 */
export function startGroupCall(groupId: string, type: CallType = 'video'): Promise<GroupCallAck> {
  const normalizedGroupId = id(groupId);
  if (!normalizedGroupId) { return Promise.reject(new Error('Group id is required to start a call.')); }
  return emitWithAck<GroupCallAck>('group_call_start', {groupId: normalizedGroupId, type: type === 'audio' ? 'audio' : 'video'}, 'Group call started')
    // The server answers with the Mongo document id; normalizing it here means
    // no caller has to care whether it arrived as a string or an object.
    .then(ack => ({...ack, groupCallId: id(ack.groupCallId) || undefined}));
}

export const joinGroupCall = (groupCallId: string) => emitForCall('group_call_join', groupCallId, 'Joined the group call');
export const leaveGroupCall = (groupCallId: string) => emitForCall('group_call_leave', groupCallId, 'Left the group call');
export const endGroupCall = (groupCallId: string) => emitForCall('group_call_end', groupCallId, 'Group call ended');
export const lockGroupCall = (groupCallId: string) => emitForCall('group_call_lock', groupCallId, 'Meeting locked');
export const unlockGroupCall = (groupCallId: string) => emitForCall('group_call_unlock', groupCallId, 'Meeting unlocked');
export const unmuteSelfInGroupCall = (groupCallId: string) => emitForCall('group_call_unmute_self', groupCallId, 'Microphone on');
export const announceActiveSpeaker = (groupCallId: string) => emitForCall('group_call_active_speaker', groupCallId, 'Speaking');
export const startGroupScreenShare = (groupCallId: string) => emitForCall('group_screen_share_start', groupCallId, 'Sharing your screen');
export const stopGroupScreenShare = (groupCallId: string) => emitForCall('group_screen_share_stop', groupCallId, 'Stopped sharing');
export const holdGroupCall = (groupCallId: string) => emitForCall('group_call_hold', groupCallId, 'Group call placed on hold');
export const resumeGroupCall = (groupCallId: string) => emitForCall('group_call_resume', groupCallId, 'Group call resumed');

export const muteGroupCallParticipant = (groupCallId: string, targetUserId: string) =>
  emitForTarget('group_call_mute_user', groupCallId, targetUserId, 'Participant muted');
export const addGroupCallParticipant = (groupCallId: string, targetUserId: string) =>
  emitForTarget('group_call_add_participant', groupCallId, targetUserId, 'Invitation sent');
export const removeGroupCallParticipantOverSocket = (groupCallId: string, targetUserId: string) =>
  emitForTarget('group_call_remove_user', groupCallId, targetUserId, 'Participant removed');
export const pinGroupCallParticipant = (groupCallId: string, targetUserId: string) =>
  emitForTarget('group_call_pin_participant', groupCallId, targetUserId, 'Participant pinned');
export const unpinGroupCallParticipant = (groupCallId: string, targetUserId: string) =>
  emitForTarget('group_call_unpin_participant', groupCallId, targetUserId, 'Participant unpinned');

export const sendGroupCallOffer = (groupCallId: string, targetUserId: string, offer: unknown) =>
  emitWithAck<GroupCallAck>('group_webrtc_offer', {groupCallId: id(groupCallId), targetUserId: id(targetUserId), offer}, 'Offer sent');
export const sendGroupCallAnswer = (groupCallId: string, targetUserId: string, answer: unknown) =>
  emitWithAck<GroupCallAck>('group_webrtc_answer', {groupCallId: id(groupCallId), targetUserId: id(targetUserId), answer}, 'Answer sent');
export const sendGroupCallIceCandidate = (groupCallId: string, targetUserId: string, candidate: unknown) =>
  emitWithAck<GroupCallAck>('group_ice_candidate', {groupCallId: id(groupCallId), targetUserId: id(targetUserId), candidate}, 'Candidate sent');

/**
 * App-level listener so a conference invitation can arrive on any screen. The
 * server sends it to the personal room, which `registerUser` already joined.
 */
export function subscribeToGroupCallInvitations(onInvitation: (invitation: GroupCallInvitationPayload) => void): () => void {
  return subscribeToSocketEvents({
    group_call_invitation: (payload: Record<string, unknown> = {}) => {
      const groupCallId = id(payload.groupCallId);
      if (!groupCallId) { return; }
      onInvitation({
        groupCallId,
        groupId: id(payload.groupId) || undefined,
        type: String(payload.type || '').toLowerCase() === 'audio' ? 'audio' : 'video',
        startedBy: id(payload.startedBy) || undefined,
        invitedBy: id(payload.invitedBy) || undefined,
        isMidCallInvite: Boolean(payload.isMidCallInvite),
      });
    },
  });
}

/**
 * Live state for one conference.
 *
 * The room broadcasts carry the call id, but the two personal-room events
 * (`group_call_muted` and the WebRTC signals) are addressed to this device
 * rather than the room, so they are matched on their own payload id. Anything
 * for a different call is ignored - two conferences can overlap while an
 * invitation is still on screen.
 */
export function subscribeToGroupCall(groupCallId: string, handlers: GroupCallHandlers): () => void {
  const callId = id(groupCallId);
  if (!callId) { return () => undefined; }

  const mine = (payload?: {groupCallId?: unknown}) => !payload?.groupCallId || id(payload.groupCallId) === callId;
  const userOf = (payload?: {userId?: unknown; targetUserId?: unknown}) => id(payload?.userId ?? payload?.targetUserId);
  const signal = (payload: Record<string, unknown>): GroupCallSignalPayload => ({
    groupCallId: callId,
    fromUserId: id(payload.fromUserId),
    offer: payload.offer,
    answer: payload.answer,
    candidate: payload.candidate,
  });

  return subscribeToSocketEvents({
    group_call_started: (payload: Record<string, unknown> = {}) => {
      if (!mine(payload)) { return; }
      handlers.onStarted?.({
        groupCallId: callId,
        groupId: id(payload.groupId) || undefined,
        startedBy: id(payload.startedBy) || undefined,
        type: String(payload.type || '').toLowerCase() === 'audio' ? 'audio' : 'video',
      });
    },
    group_call_user_joined: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onUserJoined?.(userOf(payload)); }
    },
    group_call_user_left: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onUserLeft?.(userOf(payload)); }
    },
    group_call_ended: (payload: Record<string, unknown> = {}) => {
      if (!mine(payload)) { return; }
      handlers.onEnded?.({
        duration: Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : undefined,
        reason: payload.reason ? String(payload.reason) : undefined,
      });
    },
    // The lock broadcasts carry no payload at all, so they cannot be filtered
    // by call id; they only ever reach the room of the call they belong to.
    group_call_locked: () => handlers.onLocked?.(true),
    group_call_unlocked: () => handlers.onLocked?.(false),
    group_call_muted: (payload: Record<string, unknown> = {}) => {
      if (mine(payload)) { handlers.onMutedByHost?.(); }
    },
    group_call_user_unmuted: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onUserUnmuted?.(userOf(payload)); }
    },
    group_call_participant_added: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onParticipantAdded?.(userOf(payload)); }
    },
    group_call_user_removed: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onUserRemoved?.(userOf(payload)); }
    },
    group_call_active_speaker: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onActiveSpeaker?.(userOf(payload)); }
    },
    group_call_participant_pinned: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onParticipantPinned?.(userOf(payload)); }
    },
    group_call_participant_unpinned: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onParticipantUnpinned?.(userOf(payload)); }
    },
    group_screen_share_started: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onScreenShareStarted?.(userOf(payload)); }
    },
    group_screen_share_stopped: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onScreenShareStopped?.(userOf(payload)); }
    },
    group_call_hold: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onHold?.(userOf(payload)); }
    },
    group_call_resume: (payload: Record<string, unknown> = {}) => {
      if (mine(payload) && userOf(payload)) { handlers.onResume?.(userOf(payload)); }
    },
    group_webrtc_offer: (payload: Record<string, unknown> = {}) => {
      if (mine(payload)) { handlers.onOffer?.(signal(payload)); }
    },
    group_webrtc_answer: (payload: Record<string, unknown> = {}) => {
      if (mine(payload)) { handlers.onAnswer?.(signal(payload)); }
    },
    group_ice_candidate: (payload: Record<string, unknown> = {}) => {
      if (mine(payload)) { handlers.onIceCandidate?.(signal(payload)); }
    },
  });
}

/**
 * Re-joins the conference room after a reconnect.
 *
 * `socket.join` lives on the server's socket instance, so a dropped connection
 * silently leaves the `groupcall_<id>` room and every room broadcast stops
 * arriving. Emitting `group_call_join` again on reconnect restores it; the
 * server treats a re-join of a participant who never left as a no-op error
 * ("User already joined"), which is why the rejection is swallowed.
 */
export function keepGroupCallRoomJoined(groupCallId: string): () => void {
  const callId = id(groupCallId);
  if (!callId) { return () => undefined; }

  // `onSocketReady` fires synchronously when the socket is already up. That
  // first call is the join this device has just done itself, so it is skipped;
  // every later `connect` is a genuine reconnect that needs re-joining.
  let subscribing = true;
  const unsubscribe = onSocketReady(() => {
    if (subscribing) { return; }
    joinGroupCall(callId).catch(() => undefined);
  });
  subscribing = false;
  return unsubscribe;
}
