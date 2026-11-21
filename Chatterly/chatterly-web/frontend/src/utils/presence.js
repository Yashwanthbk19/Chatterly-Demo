import socketService from './socketService';

export const normalizePresenceValue = (value) => {
  if (value && typeof value === 'object') {
    return normalizePresenceValue(
      value.kind ??
        value.status ??
        value.presence ??
        value.userStatus ??
        value.isOnline ??
        value.online
    );
  }

  if (typeof value === 'boolean') return value ? 'online' : 'offline';
  if (typeof value === 'number') return value > 0 ? 'online' : 'offline';

  const normalizedValue = String(value || '').trim().toLowerCase();
  if (['online', 'active', 'available', 'connected', 'true', '1'].includes(normalizedValue)) {
    return 'online';
  }
  if (['offline', 'inactive', 'away', 'disconnected', 'false', '0'].includes(normalizedValue)) {
    return 'offline';
  }

  return '';
};

export const resolvePresenceContactUserId = (contact = {}) => {
  const chatIdentifier = String(contact?.chatId || '').trim();
  const candidateIds = [
    contact?.userId,
    contact?.receiverId,
    contact?.contactId,
    contact?.participantId,
    contact?.id,
    contact?._id,
  ];

  for (const candidateId of candidateIds) {
    if (!candidateId) continue;
    if (chatIdentifier && String(candidateId).trim() === chatIdentifier) continue;
    return String(candidateId).trim();
  }

  return '';
};

export const getRealtimePresence = (contact = {}, options = {}) => {
  const isUserOnline =
    typeof options?.isUserOnline === 'function'
      ? options.isUserOnline
      : (userId) => socketService.isUserOnline(userId);
  const hasLivePresence =
    typeof options?.hasLivePresence === 'function'
      ? options.hasLivePresence
      : () => socketService.hasLivePresence();
  const resolvedUserId = resolvePresenceContactUserId(contact);

  // The server's online roster decides. It is replaced whole on every (re)connect
  // and then patched by user_online / user_offline, so it is the freshest answer
  // there is. The flags kept on a contact are only snapshots of an earlier moment
  // (the chat-list load, a profile fetch, the last session), and the chat list
  // stamps a default `isOnline: false` on every contact - reading them first
  // showed someone who was online as offline and, the other way round, kept a
  // stored "online" for someone who had since left.
  if (resolvedUserId) {
    if (isUserOnline(resolvedUserId)) return 'online';
    // A complete roster that does not list them means they are offline. Without
    // one (not connected yet, or the connection dropped) nothing is known, so
    // the stored flags below are the best remaining guess.
    if (hasLivePresence()) return 'offline';
  }

  const candidates = [contact?.presence, contact?.userStatus, contact?.isOnline, contact?.online];
  for (const candidate of candidates) {
    const normalizedPresence = normalizePresenceValue(candidate);
    if (normalizedPresence) {
      return normalizedPresence;
    }
  }

  return '';
};

const isSameCalendarDay = (leftDate, rightDate) =>
  leftDate.getDate() === rightDate.getDate() &&
  leftDate.getMonth() === rightDate.getMonth() &&
  leftDate.getFullYear() === rightDate.getFullYear();

export const formatLastSeenLabel = (dateInput) => {
  if (!dateInput) return '';

  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const timeLabel = date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (isSameCalendarDay(date, now)) {
    return `Last seen today at ${timeLabel}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) {
    return `Last seen yesterday at ${timeLabel}`;
  }

  return `Last seen ${date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
};

export const getContactPresence = (contact = {}, options = {}) => {
  const { appOnline = true } = options;
  const normalizedPresence = getRealtimePresence(contact, options);

  if (!appOnline) {
    return { kind: 'no-internet', label: 'Offline' };
  }

  if (normalizedPresence === 'online') {
    return { kind: 'online', label: 'Online' };
  }

  const lastSeenLabel = formatLastSeenLabel(contact?.lastSeenAt || contact?.lastSeen);
  if (lastSeenLabel) {
    return { kind: 'offline', label: lastSeenLabel };
  }

  return { kind: 'offline', label: 'Offline' };
};
