import { buildPinnedMessagePatch, getMessageIdentityKeys, isMessageExpired, messagesShareIdentity, toPersistedMessageData } from './message.js';

const storageKey = (userId, groupId) => userId && groupId
  ? `chatterly_personal_group_favorites:${encodeURIComponent(userId)}:${encodeURIComponent(groupId)}`
  : '';

const isVisibleFavorite = (message) => message && !message.isDeleted && !message.isHiddenForMe &&
  message.deletedFor !== 'me' && message.deletedFor !== 'everyone' && !isMessageExpired(message);

export const readPersonalGroupFavorites = (userId, groupId, storage = globalThis.localStorage) => {
  const key = storageKey(userId, groupId);
  if (!key) return [];
  try {
    const messages = JSON.parse(storage?.getItem(key) || '[]');
    return Array.isArray(messages) ? messages.filter((message) => isVisibleFavorite(message) &&
      !(Array.isArray(message.deletedFor) && message.deletedFor.some((id) => String(id) === String(userId)))) : [];
  } catch {
    return [];
  }
};

export const setPersonalGroupFavorite = (userId, groupId, message, isFavorite, storage = globalThis.localStorage) => {
  const key = storageKey(userId, groupId);
  if (!key || !getMessageIdentityKeys(message).length) throw new Error('Unable to identify this favorite.');
  const favorites = readPersonalGroupFavorites(userId, groupId, storage)
    .filter((favorite) => !messagesShareIdentity(favorite, message));
  if (isFavorite && isVisibleFavorite(message)) {
    const snapshot = toPersistedMessageData({
      ...message,
      ...buildPinnedMessagePatch(true, { message }),
      chatId: groupId,
      groupId,
    }, { currentUserId: userId });
    if (!snapshot) throw new Error('Unable to save this favorite.');
    favorites.unshift(snapshot);
  }
  if (!storage) throw new Error('Browser storage is unavailable.');
  storage.setItem(key, JSON.stringify(favorites));
  return favorites;
};

// Shared server pins are group-wide. Only this user's explicit favorites may
// supply the favorite flag, including for cached messages and socket updates.
export const applyPersonalGroupFavorites = (messages, favorites) => messages.map((message) => {
  const favorite = favorites.find((candidate) => messagesShareIdentity(candidate, message));
  return {
    ...message,
    isPinned: Boolean(favorite) && isVisibleFavorite(message),
    pinnedAt: favorite?.pinnedAt || null,
    pinnedBy: null,
  };
});
