const isObjectRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toTrimmedString = (value) => String(value ?? '').trim();

export const toAnnouncementTitle = (value) => {
  if (isObjectRecord(value)) {
    return toTrimmedString(value.title || value.heading || value.subject || value.name);
  }
  return toTrimmedString(value);
};

export const toAnnouncementContent = (value) => {
  if (isObjectRecord(value)) {
    return toTrimmedString(value.content || value.body || value.message || value.text || value.description);
  }
  return toTrimmedString(value);
};

const normalizeAnnouncementTimestamp = (value) => {
  const timestamp = toTrimmedString(value);
  if (!timestamp) return '';

  const parsedTimestamp = new Date(timestamp);
  return Number.isNaN(parsedTimestamp.getTime()) ? timestamp : parsedTimestamp.toISOString();
};

const buildAnnouncementId = (title, content, index = 0) => {
  const source = `${title || ''}|${content || ''}|${index}`;
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }

  return `announcement-${index + 1}-${hash.toString(36)}`;
};

export const createGroupAnnouncementModel = (announcement, options = {}) => {
  const title = toAnnouncementTitle(announcement);
  const content = toAnnouncementContent(announcement);

  if (!title && !content) return null;

  const announcementId = isObjectRecord(announcement)
    ? toTrimmedString(announcement.announcementId || announcement.id || announcement._id)
    : '';

  const postedBy = isObjectRecord(announcement)
    ? toTrimmedString(
        announcement.postedBy || announcement.posted_by || announcement.authorId || announcement.createdBy
      )
    : '';

  const postedAt = isObjectRecord(announcement)
    ? announcement.postedAt || announcement.posted_at || announcement.createdAt || announcement.timestamp
    : '';

  const isPinnedRaw = isObjectRecord(announcement)
    ? announcement.isPinned ?? announcement.pinned ?? announcement.is_pinned
    : undefined;

  return {
    announcementId: announcementId || buildAnnouncementId(title, content, options.index ?? 0),
    title,
    content,
    postedBy: postedBy || toTrimmedString(options.postedBy),
    postedAt: normalizeAnnouncementTimestamp(postedAt || options.postedAt || new Date().toISOString()),
    isPinned: Boolean(isPinnedRaw),
  };
};

export const normalizeGroupAnnouncementList = (value, options = {}) => {
  if (!Array.isArray(value)) return [];

  return value.reduce((announcements, announcement, index) => {
    const normalized = createGroupAnnouncementModel(announcement, {
      ...options,
      index,
    });

    if (normalized) {
      announcements.push(normalized);
    }

    return announcements;
  }, []);
};

/**
 * Sort announcements with pinned ones first, then newest by postedAt.
 */
export const sortGroupAnnouncements = (announcements = []) => {
  const list = Array.isArray(announcements) ? announcements.slice() : [];

  return list.sort((a, b) => {
    const aPinned = a?.isPinned ? 1 : 0;
    const bPinned = b?.isPinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;

    const aTime = new Date(a?.postedAt || 0).getTime() || 0;
    const bTime = new Date(b?.postedAt || 0).getTime() || 0;
    return bTime - aTime;
  });
};
