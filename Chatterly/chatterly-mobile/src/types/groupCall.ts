import type {CallType} from '../services/chatRealtime';

/** A conference this device is currently in. Owned by App, passed to the screen. */
export type GroupCallSession = {
  groupCallId: string;
  groupId: string;
  groupName: string;
  groupPhoto?: string | null;
  type: CallType;
  /** Who created the call - the "Organizer" tag and the host controls key off it. */
  startedBy: string;
  startedAt: string;
  /** True when this device ran `group_call_start` rather than joining. */
  isInitiator: boolean;
};

/** An inbound `group_call_invitation`, resolved far enough to render a prompt. */
export type GroupCallInvite = {
  groupCallId: string;
  groupId: string;
  groupName: string;
  groupPhoto?: string | null;
  type: CallType;
  startedBy: string;
  startedByName: string;
  isMidCallInvite: boolean;
};

/** How a conference finished, so the caller can write the right chat log line. */
export type GroupCallOutcome = {
  durationSeconds: number;
  endedForEveryone: boolean;
  reason?: string;
};
