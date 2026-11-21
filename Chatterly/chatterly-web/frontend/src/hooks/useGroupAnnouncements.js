import { useCallback, useMemo, useState } from 'react';
import {
  createGroupAnnouncementModel,
  normalizeGroupAnnouncementList,
  sortGroupAnnouncements,
} from '../utils/groupAnnouncements';

const toTrimmedString = (value) => String(value ?? '').trim();

const matchAnnouncementId = (announcement, announcementId) =>
  announcement?.announcementId === announcementId;

/**
 * useGroupAnnouncements — central state for a group's announcement list.
 *
 * Returns the normalized `announcements` array (sorted with pinned first,
 * then newest) plus handlers to add, remove, update, and toggle pinning.
 * Suitable for driving dynamic pinned-announcement management UI.
 */
export const useGroupAnnouncements = (initialAnnouncements = [], defaults = {}) => {
  const [announcements, setAnnouncements] = useState(() =>
    sortGroupAnnouncements(normalizeGroupAnnouncementList(initialAnnouncements, defaults))
  );

  const addAnnouncement = useCallback(
    (announcement) => {
      const nowIso = new Date().toISOString();
      const nextAnnouncement = createGroupAnnouncementModel(announcement, {
        index: announcements.length,
        postedBy: defaults.postedBy,
        postedAt: nowIso,
      });

      if (!nextAnnouncement) return null;

      setAnnouncements((current) =>
        sortGroupAnnouncements([
          ...current.filter(
            (existing) => existing.announcementId !== nextAnnouncement.announcementId
          ),
          nextAnnouncement,
        ])
      );

      return nextAnnouncement;
    },
    [announcements.length, defaults.postedBy]
  );

  const removeAnnouncement = useCallback((announcementId) => {
    const id = toTrimmedString(announcementId);
    if (!id) return;
    setAnnouncements((current) =>
      current.filter((announcement) => !matchAnnouncementId(announcement, id))
    );
  }, []);

  const updateAnnouncement = useCallback(
    (announcementId, updates) => {
      const id = toTrimmedString(announcementId);
      if (!id) return;
      setAnnouncements((current) =>
        sortGroupAnnouncements(
          current.map((announcement, index) => {
            if (!matchAnnouncementId(announcement, id)) return announcement;
            const merged = createGroupAnnouncementModel(
              {
                ...announcement,
                ...(typeof updates === 'object' && updates ? updates : {}),
                announcementId: announcement.announcementId,
                postedAt: announcement.postedAt,
              },
              { index, postedBy: announcement.postedBy }
            );
            return merged || announcement;
          })
        )
      );
    },
    []
  );

  const setAnnouncementList = useCallback(
    (nextAnnouncements) => {
      setAnnouncements(
        sortGroupAnnouncements(normalizeGroupAnnouncementList(nextAnnouncements, defaults))
      );
    },
    [defaults]
  );

  const pinAnnouncement = useCallback((announcementId) => {
    const id = toTrimmedString(announcementId);
    if (!id) return;
    setAnnouncements((current) =>
      sortGroupAnnouncements(
        current.map((announcement) =>
          matchAnnouncementId(announcement, id)
            ? { ...announcement, isPinned: true }
            : announcement
        )
      )
    );
  }, []);

  const unpinAnnouncement = useCallback((announcementId) => {
    const id = toTrimmedString(announcementId);
    if (!id) return;
    setAnnouncements((current) =>
      sortGroupAnnouncements(
        current.map((announcement) =>
          matchAnnouncementId(announcement, id)
            ? { ...announcement, isPinned: false }
            : announcement
        )
      )
    );
  }, []);

  const togglePinAnnouncement = useCallback((announcementId) => {
    const id = toTrimmedString(announcementId);
    if (!id) return;
    setAnnouncements((current) =>
      sortGroupAnnouncements(
        current.map((announcement) =>
          matchAnnouncementId(announcement, id)
            ? { ...announcement, isPinned: !announcement.isPinned }
            : announcement
        )
      )
    );
  }, []);

  const pinnedAnnouncements = useMemo(
    () => announcements.filter((announcement) => announcement.isPinned),
    [announcements]
  );

  const unpinnedAnnouncements = useMemo(
    () => announcements.filter((announcement) => !announcement.isPinned),
    [announcements]
  );

  const pinnedAnnouncement = pinnedAnnouncements[0] || null;

  return {
    announcements,
    pinnedAnnouncements,
    unpinnedAnnouncements,
    pinnedAnnouncement,
    addAnnouncement,
    removeAnnouncement,
    updateAnnouncement,
    setAnnouncementList,
    pinAnnouncement,
    unpinAnnouncement,
    togglePinAnnouncement,
  };
};
