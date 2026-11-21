/**
 * How a send failure is classified, kept out of the transport module so the
 * classification still works when the transport itself is swapped for a double.
 *
 * Only one distinction matters to the caller: whether the server was silent
 * (it may already hold the message) or whether it actively refused / was never
 * reachable (it definitely does not).
 */

export const ACK_TIMEOUT_ERROR_NAME = 'AckTimeoutError';

/**
 * Raised when `sendMessage` was emitted but no ACK came back in time.
 *
 * This is the one send failure that must NOT be retried over REST: the server
 * may well have stored the message already, and `POST /chats/send` mints its
 * own `tempId`, so a retry there is written as a second copy instead of
 * collapsing onto the first. Callers mark the bubble failed and let the user
 * retry over the socket, where the original `tempId` makes the replay
 * idempotent.
 */
export class AckTimeoutError extends Error {
  constructor(message = 'The server did not confirm the message in time.') {
    super(message);
    this.name = ACK_TIMEOUT_ERROR_NAME;
  }
}

/**
 * Identified by name rather than by `instanceof` so the check survives the
 * error crossing a module boundary - a mocked transport in a test, or a second
 * copy of the module in a bundle - where class identity would not match.
 */
export function isAckTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === ACK_TIMEOUT_ERROR_NAME;
}
