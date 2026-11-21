export const BROADCAST_FIELDS = Object.freeze([
  'id',
  'name',
  'members',
  'createdBy',
  'createdAt',
  'lastMessage',
]);

export const BROADCAST_SCHEMA = Object.freeze({
  fields: BROADCAST_FIELDS,
  required: Object.freeze(['id', 'name', 'createdBy', 'createdAt']),
});

const isObjectRecord = (value) =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toTrimmedString = (value) => String(value ?? '').trim();

const normalizeOptionalText = (value) => toTrimmedString(value);

const normalizeBroadcastTimestamp = (value, fallbackValue = Date.now()) => {
  const parsedTimestamp = new Date(value || fallbackValue);
  const parsedFallback = new Date(fallbackValue || Date.now());
  const safeFallback = Number.isNaN(parsedFallback.getTime()) ? new Date() : parsedFallback;

  return Number.isNaN(parsedTimestamp.getTime())
    ? safeFallback.toISOString()
    : parsedTimestamp.toISOString();
};

const getParticipantKey = (participant) => {
  if (participant === undefined || participant === null) return '';
  if (typeof participant === 'string' || typeof participant === 'number') {
    return String(participant).trim();
  }
  if (!isObjectRecord(participant)) return '';

  return toTrimmedString(
    participant.participantId ||
      participant.memberId ||
      participant.member_id ||
      participant.userId ||
      participant.id ||
      participant._id ||
      participant.phone ||
      participant.email ||
      participant.name
  );
};

export const normalizeBroadcastMembers = (members = []) => {
  if (!Array.isArray(members)) return [];

  const seen = new Set();
  return members.reduce((result, member) => {
    const key = getParticipantKey(member);
    if (!key || seen.has(key)) return result;
    seen.add(key);
    result.push(key);
    return result;
  }, []);
};

export const normalizeBroadcastParticipants = normalizeBroadcastMembers;

const buildBroadcastId = (broadcast = {}) =>
  toTrimmedString(
    broadcast.id ??
      broadcast.broadcastId ??
      broadcast._id ??
      broadcast.chatId ??
      broadcast.groupId
  );

const buildBroadcastName = (broadcast = {}) =>
  toTrimmedString(broadcast.name ?? broadcast.broadcastName ?? broadcast.groupName);

const buildCreatedBy = (broadcast = {}) =>
  getParticipantKey(
    broadcast.createdBy ||
      broadcast.creatorId ||
      broadcast.ownerId ||
      broadcast.created_by
  );

const buildCreatedAt = (broadcast = {}) =>
  normalizeBroadcastTimestamp(
    broadcast.createdAt || broadcast.created_at || broadcast.timestamp
  );

const buildLastMessage = (broadcast = {}) => {
  const message =
    broadcast.lastMessage ??
    broadcast.latestMessage ??
    broadcast.last_message ??
    broadcast.lastMessageText ??
    null;

  if (message === null || message === undefined) return null;
  if (isObjectRecord(message)) return { ...message };

  return normalizeOptionalText(message);
};

const getBroadcastMemberDraft = (broadcast = {}) => {
  if (Array.isArray(broadcast.members)) return broadcast.members;
  if (Array.isArray(broadcast.participants)) return broadcast.participants;
  if (Array.isArray(broadcast.recipients)) return broadcast.recipients;
  if (Array.isArray(broadcast.users)) return broadcast.users;

  return [];
};

export const createBroadcastModel = (broadcast = {}) => {
  const source = isObjectRecord(broadcast) ? broadcast : {};
  const createdBy = buildCreatedBy(source);
  const members = normalizeBroadcastMembers(getBroadcastMemberDraft(source));
  const normalizedMembers = createdBy && !members.includes(createdBy)
    ? [createdBy, ...members]
    : members;
  const id = buildBroadcastId(source);
  const name = buildBroadcastName(source);
  const createdAt = buildCreatedAt(source);
  const lastMessage = buildLastMessage(source);

  return {
    id,
    name,
    members: normalizedMembers,
    createdBy,
    createdAt,
    lastMessage,
    broadcastId: id,
    broadcastName: name,
    participants: normalizedMembers,
  };
};

const generateBroadcastId = () =>
  `broadcast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createBroadcast = ({
  id,
  broadcastId,
  name,
  broadcastName,
  members,
  participants = [],
  createdBy,
  createdAt,
  lastMessage,
} = {}) => {
  const normalizedCreatedBy = getParticipantKey(createdBy);
  const normalizedName = toTrimmedString(name ?? broadcastName);
  const normalizedMembers = members !== undefined ? members : participants;

  if (!normalizedName) {
    throw new Error('createBroadcast: name is required');
  }
  if (!normalizedCreatedBy) {
    throw new Error('createBroadcast: createdBy is required');
  }

  return createBroadcastModel({
    id: toTrimmedString(id ?? broadcastId) || generateBroadcastId(),
    name: normalizedName,
    members: normalizedMembers,
    createdBy: normalizedCreatedBy,
    createdAt: createdAt || new Date().toISOString(),
    lastMessage,
  });
};

export const addBroadcastMembers = (broadcast, members) => {
  const model = createBroadcastModel(broadcast);
  const incoming = normalizeBroadcastMembers(
    Array.isArray(members) ? members : [members]
  );

  const merged = [...model.members];
  incoming.forEach((id) => {
    if (!merged.includes(id)) merged.push(id);
  });

  return { ...model, members: merged, participants: merged };
};

export const removeBroadcastMembers = (broadcast, members) => {
  const model = createBroadcastModel(broadcast);
  const removalIds = new Set(
    normalizeBroadcastMembers(
      Array.isArray(members) ? members : [members]
    )
  );

  const remaining = model.members.filter((id) => {
    if (id === model.createdBy) return true;
    return !removalIds.has(id);
  });

  return { ...model, members: remaining, participants: remaining };
};

export const setBroadcastMembers = (broadcast, members) => {
  const model = createBroadcastModel(broadcast);
  const normalized = normalizeBroadcastMembers(members);
  const withCreator =
    model.createdBy && !normalized.includes(model.createdBy)
      ? [model.createdBy, ...normalized]
      : normalized;

  return { ...model, members: withCreator, participants: withCreator };
};

export const addBroadcastParticipants = addBroadcastMembers;

export const removeBroadcastParticipants = removeBroadcastMembers;

export const setBroadcastParticipants = setBroadcastMembers;

export const updateBroadcastModel = (broadcast, updates = {}) => {
  const model = createBroadcastModel(broadcast);
  const source = isObjectRecord(updates) ? updates : {};
  const hasLastMessage = Object.prototype.hasOwnProperty.call(source, 'lastMessage');
  const nextModel = createBroadcastModel({
    ...model,
    ...source,
    id: model.id,
    broadcastId: model.id,
    createdBy: model.createdBy,
    createdAt: model.createdAt,
    name: source.name ?? source.broadcastName ?? model.name,
    members: source.members ?? source.participants ?? model.members,
    lastMessage: hasLastMessage ? source.lastMessage : model.lastMessage,
  });

  return nextModel;
};

export const toBroadcastModelData = (broadcast = {}) => {
  const model = createBroadcastModel(broadcast);

  return BROADCAST_SCHEMA.fields.reduce((data, field) => {
    data[field] = model[field];
    return data;
  }, {});
};

export const getBroadcastParticipantId = getParticipantKey;
