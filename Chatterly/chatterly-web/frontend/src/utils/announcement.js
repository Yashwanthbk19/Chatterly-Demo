export const ANNOUNCEMENT_FIELDS = Object.freeze([
  'id',
  'title',
  'description',
  'createdBy',
  'createdAt',
  'isPinned',
]);

export const ANNOUNCEMENT_REQUIRED_FIELDS = Object.freeze([
  'id',
  'title',
  'description',
  'createdBy',
  'createdAt',
]);

export const ANNOUNCEMENT_SCHEMA = Object.freeze({
  fields: ANNOUNCEMENT_FIELDS,
  required: ANNOUNCEMENT_REQUIRED_FIELDS,
});

const isObjectRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeOptionalText = (value) => String(value ?? '').trim();

const normalizeAnnouncementTimestamp = (value, fallbackValue = Date.now()) => {
  const parsedTimestamp = new Date(value || fallbackValue);
  const parsedFallbackTimestamp = new Date(fallbackValue || Date.now());
  const safeFallbackTimestamp = Number.isNaN(parsedFallbackTimestamp.getTime())
    ? new Date()
    : parsedFallbackTimestamp;

  return Number.isNaN(parsedTimestamp.getTime())
    ? safeFallbackTimestamp.toISOString()
    : parsedTimestamp.toISOString();
};

const normalizePinnedValue = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalizedValue = normalizeOptionalText(value).toLowerCase();
  if (!normalizedValue) return false;

  return ['true', '1', 'yes', 'pinned', 'pin', 'on'].includes(normalizedValue);
};

const buildAnnouncementId = (title, description, index = 0) => {
  const source = `${title || ''}|${description || ''}|${index}`;
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }

  return `announcement-${index + 1}-${hash.toString(36)}`;
};

const resolveAnnouncementTitle = (announcement) => {
  if (!isObjectRecord(announcement)) return normalizeOptionalText(announcement);

  return normalizeOptionalText(
    announcement.title ||
      announcement.heading ||
      announcement.subject ||
      announcement.name ||
      ''
  );
};

const resolveAnnouncementDescription = (announcement) => {
  if (!isObjectRecord(announcement)) return '';

  return normalizeOptionalText(
    announcement.description ||
      announcement.content ||
      announcement.body ||
      announcement.message ||
      announcement.text ||
      ''
  );
};

export const createAnnouncementModel = (announcement = {}, options = {}) => {
  const title = resolveAnnouncementTitle(announcement);
  const description = resolveAnnouncementDescription(announcement);

  if (!title && !description) return null;

  const id = isObjectRecord(announcement)
    ? normalizeOptionalText(announcement.id || announcement._id || announcement.announcementId)
    : '';
  const createdBy = isObjectRecord(announcement)
    ? normalizeOptionalText(
        announcement.createdBy ||
          announcement.created_by ||
          announcement.postedBy ||
          announcement.authorId ||
          announcement.creatorId ||
          options.createdBy
      )
    : normalizeOptionalText(options.createdBy);
  const createdAt = isObjectRecord(announcement)
    ? announcement.createdAt ||
      announcement.created_at ||
      announcement.postedAt ||
      announcement.timestamp ||
      options.createdAt
    : options.createdAt;
  const isPinned = isObjectRecord(announcement)
    ? normalizePinnedValue(announcement.isPinned ?? announcement.pinned ?? announcement.is_pinned)
    : normalizePinnedValue(options.isPinned);

  return {
    id: id || buildAnnouncementId(title, description, options.index ?? 0),
    title,
    description,
    createdBy,
    createdAt: normalizeAnnouncementTimestamp(createdAt),
    isPinned,
  };
};

export const sortAnnouncements = (announcements = []) => {
  const list = Array.isArray(announcements) ? announcements.slice() : [];

  return list.sort((firstAnnouncement, secondAnnouncement) => {
    const firstPinned = firstAnnouncement?.isPinned ? 1 : 0;
    const secondPinned = secondAnnouncement?.isPinned ? 1 : 0;
    if (firstPinned !== secondPinned) return secondPinned - firstPinned;

    const firstCreatedAt = new Date(firstAnnouncement?.createdAt || 0).getTime() || 0;
    const secondCreatedAt = new Date(secondAnnouncement?.createdAt || 0).getTime() || 0;
    return secondCreatedAt - firstCreatedAt;
  });
};

export const normalizeAnnouncementList = (announcements = [], options = {}) => {
  if (!Array.isArray(announcements)) return [];

  return sortAnnouncements(
    announcements.reduce((normalizedAnnouncements, announcement, index) => {
      const normalizedAnnouncement = createAnnouncementModel(announcement, {
        ...options,
        index,
      });

      if (normalizedAnnouncement) {
        normalizedAnnouncements.push(normalizedAnnouncement);
      }

      return normalizedAnnouncements;
    }, [])
  );
};

export const toAnnouncementModelData = (announcement = {}, options = {}) => {
  const announcementModel = createAnnouncementModel(announcement, options);
  if (!announcementModel) return null;

  return ANNOUNCEMENT_SCHEMA.fields.reduce((modelData, fieldName) => {
    modelData[fieldName] = announcementModel[fieldName];
    return modelData;
  }, {});
};
