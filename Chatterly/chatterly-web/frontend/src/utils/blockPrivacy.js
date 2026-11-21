const BLOCKED_RECIPIENT_PENDING_REASON = 'blocked-recipient';

const truthyBlockValues = new Set(['true', '1', 'yes', 'blocked']);

const isTruthyBlockValue = (value) => {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  return truthyBlockValues.has(String(value).trim().toLowerCase());
};

const getObjectUserId = (value = {}) => {
  if (!value || typeof value !== 'object') return '';
  const nestedUser = value.user && typeof value.user === 'object' ? value.user : {};
  return String(
    value.userId ||
      value.memberId ||
      value.participantId ||
      value.contactId ||
      value.receiverId ||
      value.senderId ||
      value._id ||
      value.id ||
      nestedUser._id ||
      nestedUser.id ||
      nestedUser.userId ||
      ''
  ).trim();
};

const getContactComparableIds = (contact = {}) =>
  [
    contact?.userId,
    contact?.receiverId,
    contact?.contactId,
    contact?.participantId,
    contact?._id,
    contact?.id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

const contactHasFlag = (contact = {}, fields = []) =>
  fields.some((fieldName) => isTruthyBlockValue(contact?.[fieldName]));

const getParticipants = (contact = {}) =>
  Array.isArray(contact?.participants) ? contact.participants : [];

const getBlockedUserIds = (source = {}) =>
  [
    source?.blockedUserId,
    source?.blockedId,
    source?.blockedUser?._id,
    source?.blockedUser?.id,
    ...(Array.isArray(source?.blockedUsers) ? source.blockedUsers : []),
  ]
    .map((value) => getObjectUserId(value) || String(value || '').trim())
    .filter(Boolean);

const fieldReferencesAnyId = (source = {}, fields = [], targetIds = []) => {
  const normalizedTargetIds = new Set(
    targetIds.map((value) => String(value || '').trim()).filter(Boolean)
  );
  if (!normalizedTargetIds.size) return false;

  return fields.some((fieldName) => {
    const value = source?.[fieldName];
    const valueId = getObjectUserId(value) || String(value || '').trim();
    return valueId && normalizedTargetIds.has(valueId);
  });
};

const isContactBlockedByCurrentUserValue = (contact = {}, options = {}) => {
  if (contactHasFlag(contact, ['blockedByMe', 'hasBlockedContact'])) {
    return true;
  }

  const blockedChatIds = options?.blockedChatIds;
  const normalizedChatId = String(contact?.chatId || '').trim();
  return Boolean(
    normalizedChatId &&
      blockedChatIds &&
      typeof blockedChatIds.has === 'function' &&
      blockedChatIds.has(normalizedChatId)
  );
};

export const getBlockedRecipientPendingReason = () => BLOCKED_RECIPIENT_PENDING_REASON;

export const hasContactBlockedCurrentUser = (contact = {}, currentUserId = '', options = {}) => {
  const normalizedCurrentUserId = String(currentUserId || '').trim();
  const isBlockedByCurrentUser = isContactBlockedByCurrentUserValue(contact, options);
  const participants = getParticipants(contact);
  const otherParticipantIds = getContactComparableIds(contact).filter(
    (contactId) => contactId !== normalizedCurrentUserId
  );
  const currentParticipant = participants.find(
    (participant) => getObjectUserId(participant) === normalizedCurrentUserId
  );

  if (
    contactHasFlag(contact, [
      'isBlockedByContact',
      'blockedByContact',
      'blockedByOther',
      'blockedByOtherUser',
      'blockedMe',
      'hasBlockedMe',
      'isBlockedByUser',
    ])
  ) {
    return true;
  }

  if (
    currentParticipant &&
    (
      contactHasFlag(currentParticipant, [
        'isBlockedByUser',
        'isBlockedByContact',
        'blockedByContact',
        'blockedMe',
        'hasBlockedMe',
      ]) ||
      fieldReferencesAnyId(currentParticipant, ['blockedBy', 'blockedByUser'], otherParticipantIds)
    )
  ) {
    return true;
  }

  if (
    currentParticipant &&
    (
      getBlockedUserIds(currentParticipant).some((blockedUserId) => otherParticipantIds.includes(blockedUserId)) ||
      fieldReferencesAnyId(currentParticipant, ['blockedUserId', 'blockedId'], otherParticipantIds)
    )
  ) {
    return false;
  }

  if (isBlockedByCurrentUser) {
    return false;
  }

  if (contactHasFlag(contact, ['isBlocked', 'blocked'])) {
    return true;
  }

  if (contactHasFlag(contact, ['privacyRestricted'])) {
    return true;
  }

  if (!normalizedCurrentUserId) {
    return false;
  }

  if (
    currentParticipant &&
    (
      contactHasFlag(currentParticipant, [
        'blocked',
        'isBlocked',
      ])
    )
  ) {
    return true;
  }

  return participants.some((participant) => {
    const participantId = getObjectUserId(participant);
    if (!participantId || participantId === normalizedCurrentUserId) return false;
    if (
      contactHasFlag(participant, [
        'blocked',
        'isBlocked',
        'blockedCurrentUser',
        'hasBlockedCurrentUser',
        'blockedMe',
        'hasBlockedMe',
        'isBlockedByContact',
        'blockedByContact',
      ])
    ) {
      return true;
    }

    return getBlockedUserIds(participant).includes(normalizedCurrentUserId);
  });
};

export const isContactBlockedByCurrentUser = isContactBlockedByCurrentUserValue;

export const isContactPrivacyRestricted = (contact = {}, options = {}) => {
  if (!contact || typeof contact !== 'object') return false;
  if (contact?.isGroup || contact?.isBroadcast || contact?.chatType === 'group' || contact?.chatType === 'broadcast') {
    return false;
  }

  return hasContactBlockedCurrentUser(contact, options?.currentUserId, options);
};

export const applyContactPrivacyRedaction = (contact = {}, options = {}) => {
  if (!isContactPrivacyRestricted(contact, options)) {
    return contact;
  }

  return {
    ...contact,
    profilePic: '',
    profileImage: '',
    profilePicture: '',
    avatar: '',
    avatarUrl: '',
    photo: '',
    status: '',
    about: '',
    bio: '',
    userStatus: '',
    presence: '',
    presenceLabel: '',
    isOnline: false,
    online: false,
    active: false,
    isActive: false,
    inactive: false,
    lastSeen: null,
    lastSeenAt: null,
    lastActive: null,
    lastActiveAt: null,
    privacyRestricted: true,
  };
};

export const buildContactProfilePrivacyUpdates = () => ({
  profilePic: '',
  profileImage: '',
  profilePicture: '',
  avatar: '',
  avatarUrl: '',
  photo: '',
  status: '',
  about: '',
  bio: '',
  userStatus: '',
  presence: '',
  presenceLabel: '',
  isOnline: false,
  online: false,
  active: false,
  isActive: false,
  inactive: false,
  lastSeen: null,
  lastSeenAt: null,
  lastActive: null,
  lastActiveAt: null,
  privacyRestricted: true,
});

export const markContactBlockedByOther = (contact = {}) => ({
  ...contact,
  isBlockedByContact: true,
  blockedByContact: true,
  privacyRestricted: true,
  ...buildContactProfilePrivacyUpdates(),
});

export const isBlockedRecipientHeldMessage = (message = {}) =>
  String(message?.pendingReason || '').trim() === BLOCKED_RECIPIENT_PENDING_REASON;

export const normalizeBlockedRecipientHeldMessage = (message = {}, options = {}) => ({
  ...message,
  status: 'sent',
  uploadStatus: message?.type === 'text' ? null : (message?.uploadStatus || 'sent'),
  uploadProgress: message?.type === 'text' ? null : 100,
  pendingReason: BLOCKED_RECIPIENT_PENDING_REASON,
  metadata: {
    ...(message?.metadata || {}),
    blockedRecipientHeld: true,
    blockedRecipientHeldAt: message?.metadata?.blockedRecipientHeldAt || new Date().toISOString(),
    blockedRecipientUserId: String(options?.receiverId || message?.receiverId || '').trim(),
  },
});

export const isBlockedRecipientSendError = (error) => {
  const statusCode = Number(error?.status || error?.response?.status || 0);
  const errorText = String(
    error?.message ||
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.data?.message ||
      ''
  ).toLowerCase();

  return (
    /(block|blocked|privacy|forbidden|not allowed|permission)/i.test(errorText) ||
    (statusCode === 403 && !/auth|token|login|session/i.test(errorText))
  );
};

export const getContactPrivacyComparableIds = getContactComparableIds;
