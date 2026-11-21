export const CALL_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
export type CallReactionEmoji = typeof CALL_REACTIONS[number];
export type CallReaction = {callId: string; emoji: CallReactionEmoji; local: boolean};
const listeners = new Set<(reaction: CallReaction) => void>();
export function isCallReactionEmoji(value: unknown): value is CallReactionEmoji {
  return CALL_REACTIONS.some(emoji => emoji === value);
}
export function publishCallReaction(reaction: CallReaction): void {
  listeners.forEach(listener => listener(reaction));
}
export function subscribeToCallReactions(listener: (reaction: CallReaction) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
