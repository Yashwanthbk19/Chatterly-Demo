import type {ChatMessage} from '../types/chat';

const MESSAGE_REACTION_CONTROL_PREFIX = '__CHATTERLY_MESSAGE_REACTION__:';

/**
 * One-line summaries of a message for the chat list.
 *
 * Only a text message carries words. Everything else - a photo, a voice note,
 * a document, a GIF - stores its body as a media reference, so a preview taken
 * from the text alone comes out blank and the row falls back to whatever it was
 * showing before. That reads as if the message was never sent.
 */

/**
 * A GIF is an image message whose `mediaUrl` is a remote address rather than
 * something this device uploaded, which is what separates it from a photo.
 */
export function isGifMessage(message: Pick<ChatMessage, 'messageType' | 'mediaUrl'>): boolean {
  return message.messageType === 'image' &&
    /^https?:\/\/\S+\.gif(\?|$)/i.test(String(message.mediaUrl || ''));
}

export function messagePreview(message: ChatMessage): string {
  const caption = message.text.trim();
  if (caption.startsWith(MESSAGE_REACTION_CONTROL_PREFIX)) {
    try {
      const reaction = JSON.parse(caption.slice(MESSAGE_REACTION_CONTROL_PREFIX.length)) as {emoji?: string; remove?: boolean; removed?: boolean};
      return reaction.remove || reaction.removed || !reaction.emoji ? 'Reaction removed' : `Reacted ${reaction.emoji}`;
    } catch { return ''; }
  }
  if (message.systemEventType === 'disappearing_timer') { return caption; }
  // Membership and role notices ("Abc was added to the group") are stored as
  // `system` messages and become the group's last message; they already read as
  // a sentence, and must not fall through to the attachment labels below.
  if (message.systemEvent || String(message.messageType) === 'system') { return caption; }
  if (message.messageType === 'text' || !message.messageType) { return caption; }

  // A call log already reads as a sentence, so it is the preview verbatim.
  if (message.messageType === 'call') { return caption || 'Call'; }

  const label = message.messageType === 'image'
    ? (isGifMessage(message) ? 'GIF' : 'Photo')
    : message.messageType === 'video' ? 'Video'
    : message.messageType === 'audio' ? 'Voice message'
    : message.messageType === 'location' ? (message.locationName || 'Location')
    : message.fileName || 'Document';

  // A caption is the message the sender actually wrote, so it leads; the kind
  // of attachment it belongs to is the qualifier.
  return caption ? `${label} · ${caption}` : label;
}
