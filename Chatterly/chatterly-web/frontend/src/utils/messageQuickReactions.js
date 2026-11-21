export const MESSAGE_ACTION_QUICK_REACTIONS_STORAGE_KEY = 'chatterly:message-action-quick-reactions';
export const MAX_MESSAGE_QUICK_REACTIONS = 6;

export const DEFAULT_MESSAGE_QUICK_REACTIONS = Object.freeze([
  '\u{1F44D}',
  '\u2764\uFE0F',
  '\u{1F602}',
  '\u{1F62E}',
  '\u{1F622}',
  '\u{1F621}',
]);

export const normalizeQuickReactionEmoji = (value) => String(
  typeof value === 'string'
    ? value
    : value?.emoji || value?.native || value?.value || ''
).trim();

export const dedupeQuickReactionEmojis = (values = []) => {
  const seen = new Set();
  return values.reduce((nextValues, value) => {
    const normalizedValue = normalizeQuickReactionEmoji(value);
    if (!normalizedValue || seen.has(normalizedValue)) {
      return nextValues;
    }
    seen.add(normalizedValue);
    nextValues.push(normalizedValue);
    return nextValues;
  }, []);
};

export const buildMessageQuickReactions = (storedReactions = []) => (
  dedupeQuickReactionEmojis([
    ...storedReactions,
    ...DEFAULT_MESSAGE_QUICK_REACTIONS,
  ]).slice(0, MAX_MESSAGE_QUICK_REACTIONS)
);

export const readMessageQuickReactions = () => {
  if (typeof localStorage === 'undefined') {
    return buildMessageQuickReactions();
  }

  try {
    const parsedValue = JSON.parse(localStorage.getItem(MESSAGE_ACTION_QUICK_REACTIONS_STORAGE_KEY) || '[]');
    return buildMessageQuickReactions(Array.isArray(parsedValue) ? parsedValue : []);
  } catch {
    return buildMessageQuickReactions();
  }
};

export const saveMessageQuickReactions = (reactions = []) => {
  const nextReactions = buildMessageQuickReactions(reactions);

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(
        MESSAGE_ACTION_QUICK_REACTIONS_STORAGE_KEY,
        JSON.stringify(nextReactions)
      );
    } catch {
      // Storage is best-effort; callers still receive the updated in-memory list.
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('chatterly:message-quick-reactions-change', {
      detail: { reactions: nextReactions },
    }));
  }

  return nextReactions;
};

export const addMessageQuickReaction = (emoji, currentReactions = readMessageQuickReactions()) => {
  const normalizedEmoji = normalizeQuickReactionEmoji(emoji);
  if (!normalizedEmoji) {
    return { emoji: '', reactions: buildMessageQuickReactions(currentReactions) };
  }

  const reactions = saveMessageQuickReactions([
    normalizedEmoji,
    ...currentReactions.filter((reaction) => reaction !== normalizedEmoji),
  ]);

  return { emoji: normalizedEmoji, reactions };
};
