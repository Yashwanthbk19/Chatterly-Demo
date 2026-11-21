export type CallActivity = {
  callId: string;
  chatId: string;
  contactId: string;
  contactName: string;
  type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing';
  status: 'dialed' | 'answered' | 'missed' | 'ended';
};

const listeners = new Set<(activity: CallActivity) => void>();

/** Confirmed call transitions shared by the call UI, alerts and chat refresh. */
export function publishCallActivity(activity: CallActivity): void {
  if (!activity.callId) return;
  listeners.forEach(listener => listener(activity));
}

export function subscribeToCallActivity(listener: (activity: CallActivity) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
