import type {ChatMessage} from '../types/chat';

// Matches the existing backend REST and socket deletion policy.
export const DELETE_FOR_EVERYONE_LIMIT_MS = 24 * 60 * 60 * 1000;
export const DELETE_FOR_EVERYONE_NOTICE = 'Delete for Everyone is only available within 24 hours of sending.';

export function canDeleteForEveryone(message: ChatMessage, now = Date.now()): boolean {
  const sentAt = Date.parse(message.createdAt);
  return message.isOwn && Number.isFinite(sentAt) && sentAt <= now &&
    now - sentAt <= DELETE_FOR_EVERYONE_LIMIT_MS;
}
