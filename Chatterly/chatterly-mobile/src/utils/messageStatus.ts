// Sprint 3 Story 2 - Message Status Flow.
//
// The wireframe describes one strictly forward journey:
//
//   Type Message -> Tap Send -> Sending... -> (/) Sent -> (//) Delivered -> (//) Blue Read
//
// The backend drives that journey from three independent places, and none of
// them are ordered relative to each other:
//
//   * the `sendMessage` socket ACK resolves the message as "sent",
//   * `message_delivered` arrives from the receiver's own socket registration,
//   * `messages_read` arrives when the receiver opens the chat.
//
// A slow ACK can therefore land *after* the delivery receipt, and a chat that
// is reopened re-fetches messages over REST whose stored status may be older
// than what a live socket event already told us. Both cases would flick a tick
// backwards on screen, so every status change goes through `mergeStatus`, which
// only ever moves forward along the ladder below.

export type MessageStatus = 'failed' | 'pending' | 'sent' | 'delivered' | 'read';

// Where each state sits on the wireframe's ladder. `failed` shares the bottom
// rung with `pending`: both mean "not acknowledged yet", so either can still be
// overtaken by a real receipt that arrives late.
const RANK: Record<MessageStatus, number> = {
  failed: 0,
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

// The server's Message model only stores "sent" | "delivered" | "read", but the
// client adds the two states that exist before the server has seen the message
// at all, and older payloads have been seen using looser spellings.
const ALIASES: Record<string, MessageStatus> = {
  sending: 'pending',
  queued: 'pending',
  pending: 'pending',
  'not-sent': 'failed',
  not_sent: 'failed',
  failed: 'failed',
  error: 'failed',
  sent: 'sent',
  delivered: 'delivered',
  received: 'delivered',
  read: 'read',
  seen: 'read',
};

/** Maps whatever the server or an optimistic bubble carries onto the ladder. */
export function normalizeStatus(value: string | null | undefined): MessageStatus {
  if (!value) { return 'sent'; }
  return ALIASES[String(value).trim().toLowerCase()] || 'sent';
}

/**
 * Picks the state a bubble should show once `incoming` arrives for a message
 * currently showing `current`. Ticks never travel back down the ladder, so an
 * out-of-order ACK cannot undo a delivery or read receipt.
 *
 * The single exception is `failed`, which is a local verdict about *our* send
 * attempt rather than a server receipt: a send that times out must be able to
 * mark a still-pending bubble as failed so the retry affordance appears.
 */
export function mergeStatus(
  current: string | null | undefined,
  incoming: string | null | undefined,
): MessageStatus {
  const to = normalizeStatus(incoming);

  // No current status means there is no floor to protect yet - the message is
  // being given its first state. This matters for the optimistic bubble, whose
  // opening "pending" would otherwise lose to the "absent means sent" default
  // that is only correct for a record the server has already stored.
  if (!current) { return to; }

  const from = normalizeStatus(current);

  if (to === 'failed') {
    // Only an unacknowledged send can fail. Once the server has confirmed the
    // message, a late local timeout is stale information.
    return RANK[from] > RANK.pending ? from : 'failed';
  }

  return RANK[to] > RANK[from] ? to : from;
}

/** True while the message is still waiting for its first server receipt. */
export function isUnacknowledged(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized === 'pending' || normalized === 'failed';
}

/** True when the user can tap the bubble to try the send again. */
export function isRetryable(status: string | null | undefined): boolean {
  return normalizeStatus(status) === 'failed';
}

/**
 * The screen-reader text for each rung. The wireframe labels the states
 * Sending / Sent / Delivered / Read, and the tick glyphs alone carry no
 * meaning for anyone not looking at the screen.
 */
export function statusLabel(status: string | null | undefined): string {
  switch (normalizeStatus(status)) {
    case 'failed': return 'Not sent, tap to retry';
    case 'pending': return 'Sending';
    case 'delivered': return 'Delivered';
    case 'read': return 'Read';
    default: return 'Sent';
  }
}
