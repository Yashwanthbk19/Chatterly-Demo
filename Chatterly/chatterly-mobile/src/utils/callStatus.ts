/** A missed outcome takes precedence over the call's incoming direction. */
export function normalizeCallStatus(value: unknown): string {
  const status = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['missed', 'missed_call', 'not_answered', 'notanswered', 'no_answer', 'noanswer', 'unanswered', 'timeout', 'timed_out'].includes(status)) return 'missed';
  if (['reject', 'rejected', 'decline', 'declined'].includes(status)) return 'rejected';
  if (status === 'canceled') return 'cancelled';
  return status;
}

export function isMissedCallStatus(value: unknown): boolean {
  return normalizeCallStatus(value) === 'missed';
}

export function callHistoryCategory(call: {direction: 'incoming' | 'outgoing'; status: string}): 'missed' | 'incoming' | 'outgoing' {
  return isMissedCallStatus(call.status) ? 'missed' : call.direction;
}
