import {
  isRetryable,
  isUnacknowledged,
  mergeStatus,
  normalizeStatus,
  statusLabel,
} from '../src/utils/messageStatus';

test('maps the statuses the server and the composer use onto the wireframe ladder', () => {
  expect(normalizeStatus('sending')).toBe('pending');
  expect(normalizeStatus('sent')).toBe('sent');
  expect(normalizeStatus('delivered')).toBe('delivered');
  expect(normalizeStatus('read')).toBe('read');
  expect(normalizeStatus('seen')).toBe('read');
  // The server defaults a stored message to "sent", so an absent status means
  // the message exists rather than that it is still on its way.
  expect(normalizeStatus(undefined)).toBe('sent');
});

test('walks the ladder forward through the full Story 2 flow', () => {
  let status = mergeStatus(undefined, 'pending');
  expect(status).toBe('pending');
  status = mergeStatus(status, 'sent');
  expect(status).toBe('sent');
  status = mergeStatus(status, 'delivered');
  expect(status).toBe('delivered');
  status = mergeStatus(status, 'read');
  expect(status).toBe('read');
});

test('never lets a late event drag the ticks back down', () => {
  // The send ACK can land after the delivery receipt, which would otherwise
  // turn a double tick back into a single one on screen.
  expect(mergeStatus('delivered', 'sent')).toBe('delivered');
  expect(mergeStatus('read', 'delivered')).toBe('read');
  // Re-opening a chat refetches messages whose stored status may be older than
  // what a live socket event already reported.
  expect(mergeStatus('read', 'sent')).toBe('read');
});

test('only lets an unacknowledged send be marked failed', () => {
  expect(mergeStatus('pending', 'failed')).toBe('failed');
  // A local timeout that fires after the server confirmed the message is stale
  // information and must not put a retry prompt on a delivered bubble.
  expect(mergeStatus('sent', 'failed')).toBe('sent');
  expect(mergeStatus('delivered', 'failed')).toBe('delivered');
});

test('a failed send can still be overtaken by a receipt that arrives late', () => {
  expect(mergeStatus('failed', 'sent')).toBe('sent');
  expect(mergeStatus('failed', 'delivered')).toBe('delivered');
});

test('reports which states are unacknowledged and which offer a retry', () => {
  expect(isUnacknowledged('pending')).toBe(true);
  expect(isUnacknowledged('failed')).toBe(true);
  expect(isUnacknowledged('sent')).toBe(false);

  expect(isRetryable('failed')).toBe(true);
  expect(isRetryable('pending')).toBe(false);
  expect(isRetryable('delivered')).toBe(false);
});

test('labels every rung for screen readers, since the ticks alone are silent', () => {
  expect(statusLabel('pending')).toBe('Sending');
  expect(statusLabel('sent')).toBe('Sent');
  expect(statusLabel('delivered')).toBe('Delivered');
  expect(statusLabel('read')).toBe('Read');
  expect(statusLabel('failed')).toBe('Not sent, tap to retry');
});
