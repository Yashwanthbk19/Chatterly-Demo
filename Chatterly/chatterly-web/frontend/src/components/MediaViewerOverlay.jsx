import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  getMediaActionKey,
  getStarredMediaStorageKey,
  isMediaItemStarred,
  persistStoredStarredMedia,
  readStoredStarredMedia,
  setMediaItemStarred,
} from '../utils/starredMedia';

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;
const QUICK_REACTIONS = [
  '\u2764\uFE0F',
  '\u{1F602}',
  '\u{1F60D}',
  '\u{1F62E}',
  '\u{1F44D}',
  '\u{1F525}',
];

const createDefaultViewState = (mediaId = '') => ({
  mediaId,
  zoom: 1,
  rotation: 0,
  offset: { x: 0, y: 0 },
  dragState: null,
  showReactionPicker: false,
  mediaMetadata: {
    width: 0,
    height: 0,
    duration: null,
  },
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const formatViewerTime = (dateInput) => {
  if (!dateInput) return '';

  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return typeof dateInput === 'string' ? dateInput : '';
  }

  const now = new Date();
  const timeLabel = date
    .toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace('AM', 'am')
    .replace('PM', 'pm');

  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isSameDay) {
    return `Today at ${timeLabel}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `Yesterday at ${timeLabel}`;
  }

  return `${date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: now.getFullYear() === date.getFullYear() ? undefined : 'numeric',
  })} at ${timeLabel}`;
};

const formatDuration = (value) => {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0) return '';

  const totalSeconds = Math.round(duration);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = `${totalSeconds % 60}`.padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const formatFileSize = (value) => {
  const size = Number(value || 0);
  if (!size) return '';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
};

const getUserId = (user = {}) =>
  String(user?._id || user?.userId || user?.id || '').trim();

const getUserName = (user = {}, fallback = 'You') =>
  String(
    user?.name ||
      user?.fullName ||
      `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
      user?.username ||
      fallback
  ).trim() || fallback;

const getInitials = (name = '') =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';

const isGifItem = (item = {}) => {
  const mimeType = String(item?.mimeType || item?.message?.mimeType || '').trim().toLowerCase();
  const url = String(item?.url || '').trim().toLowerCase();
  return mimeType.includes('gif') || url.endsWith('.gif');
};

const resolveAuthorMeta = (item = {}, currentUser = {}, contact = {}) => {
  const currentUserId = getUserId(currentUser);
  const messageSenderId = String(item?.message?.senderId || '').trim();
  const isSentByCurrentUser =
    Boolean(item?.isSentByCurrentUser) ||
    (currentUserId && messageSenderId && currentUserId === messageSenderId) ||
    item?.message?.direction === 'sent';

  if (isSentByCurrentUser) {
    const name = getUserName(currentUser, 'You');
    return {
      isOwn: true,
      name: 'You',
      subtitle: formatViewerTime(item?.timestamp || item?.message?.timestamp || item?.message?.createdAt || item?.time),
      avatarUrl: String(currentUser?.profilePic || '').trim(),
      initials: getInitials(name),
    };
  }

  const contactName = String(contact?.name || item?.author || 'Contact').trim() || 'Contact';
  return {
    isOwn: false,
    name: contactName,
    subtitle: formatViewerTime(item?.timestamp || item?.message?.timestamp || item?.message?.createdAt || item?.time),
    avatarUrl: String(contact?.profilePic || '').trim(),
    initials: String(contact?.initials || getInitials(contactName)).trim() || getInitials(contactName),
  };
};

const ActionButton = ({
  active = false,
  disabled = false,
  title,
  pressed,
  expanded,
  controls,
  onClick,
  children,
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    aria-pressed={pressed}
    aria-expanded={expanded}
    aria-controls={controls}
    disabled={disabled}
    onClick={onClick}
    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
      active
        ? 'bg-[#E7FCEB] text-[#16A34A]'
        : 'text-[#111827] hover:bg-[#F3F4F6]'
    } ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
  >
    {children}
  </button>
);

const NavigationButton = ({
  direction = 'left',
  disabled = false,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={direction === 'left' ? 'Show previous media' : 'Show next media'}
    className={`absolute top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[#6B7280] text-white transition-colors ${
      direction === 'left' ? 'left-4 sm:left-6' : 'right-4 sm:right-6'
    } ${disabled ? 'cursor-not-allowed opacity-35' : 'hover:bg-[#4B5563]'}`}
  >
    <svg
      className={`h-6 w-6 ${direction === 'right' ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </svg>
  </button>
);

const Avatar = ({ avatarUrl = '', initials = '?' }) => (
  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E5E7EB] text-sm font-bold text-[#111827]">
    {avatarUrl ? (
      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
    ) : (
      <span>{initials}</span>
    )}
  </div>
);

const MagnifierIcon = ({ kind = 'plus' }) => (
  <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="6.5" strokeWidth="1.8" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" strokeWidth="1.8" />
    {kind === 'plus' ? (
      <>
        <path d="M11 8.2v5.6" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M8.2 11h5.6" strokeLinecap="round" strokeWidth="1.8" />
      </>
    ) : (
      <path d="M8.2 11h5.6" strokeLinecap="round" strokeWidth="1.8" />
    )}
  </svg>
);

const StripIcon = () => (
  <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" strokeWidth="1.8" />
    <path d="M8 8.5v7" strokeWidth="1.6" />
    <path d="M16 8.5h2.5" strokeLinecap="round" strokeWidth="1.6" />
    <path d="M16 12h2.5" strokeLinecap="round" strokeWidth="1.6" />
    <path d="M16 15.5h2.5" strokeLinecap="round" strokeWidth="1.6" />
  </svg>
);

const RotateIcon = () => (
  <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M8 6H4v4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    <path d="M4.5 10A7.5 7.5 0 1 1 8 17.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
  </svg>
);

const StarIcon = ({ filled = false }) => (
  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor">
    <path d="m12 3.8 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8 2.5-5Z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
  </svg>
);

const PinIcon = ({ filled = false }) => (
  <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 3h8" strokeLinecap="round" strokeWidth="1.8" />
    <path
      d="M9 3v6l-3 5h12l-3-5V3Z"
      fill={filled ? 'currentColor' : 'none'}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path d="M12 14v7" strokeLinecap="round" strokeWidth="1.8" />
  </svg>
);

const SmileIcon = () => (
  <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" strokeWidth="1.8" />
    <path d="M9 10h.01" strokeLinecap="round" strokeWidth="2.2" />
    <path d="M15 10h.01" strokeLinecap="round" strokeWidth="2.2" />
    <path d="M8.5 14c.9 1.15 2.15 1.75 3.5 1.75S14.6 15.15 15.5 14" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
  </svg>
);

const ForwardIcon = () => (
  <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M5 12h10" strokeLinecap="round" strokeWidth="1.8" />
    <path d="m11 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    <path d="M17 6h2v12h-2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M12 4v10" strokeLinecap="round" strokeWidth="1.8" />
    <path d="m8 10 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    <path d="M5 18.5h14" strokeLinecap="round" strokeWidth="1.8" />
  </svg>
);

const CloseIcon = () => (
  <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M18 6 6 18" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    <path d="m6 6 12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);

export default function MediaViewerOverlay({
  items = [],
  activeIndex = 0,
  onClose,
  onSelect,
  contact = {},
  currentUser = {},
  isItemStarred,
  isItemPinned,
  getItemReaction,
  onRequestRemoveStar,
  onToggleStar,
  onTogglePin,
  onReact,
  onRemoveReaction,
}) {
  const mediaItems = useMemo(() => (Array.isArray(items) ? items.filter(Boolean) : []), [items]);
  const safeActiveIndex = mediaItems.length
    ? clamp(activeIndex, 0, mediaItems.length - 1)
    : -1;
  const activeItem = safeActiveIndex >= 0 ? mediaItems[safeActiveIndex] : null;
  const canGoPrevious = safeActiveIndex > 0;
  const canGoNext = safeActiveIndex >= 0 && safeActiveIndex < mediaItems.length - 1;
  const authorMeta = activeItem ? resolveAuthorMeta(activeItem, currentUser, contact) : null;
  const starredMediaStorageKey = getStarredMediaStorageKey(getUserId(currentUser));

  const [viewState, setViewState] = useState(() => createDefaultViewState());
  const [showThumbnails, setShowThumbnails] = useState(true);
  const mediaStripId = useId();
  const [starredById, setStarredById] = useState(() => readStoredStarredMedia(starredMediaStorageKey));
  const [pinnedById, setPinnedById] = useState({});
  const [reactionsById, setReactionsById] = useState({});
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const feedbackTimeoutRef = useRef(null);
  const thumbnailRefs = useRef({});

  const currentViewState =
    activeItem && viewState.mediaId === activeItem.id
      ? viewState
      : createDefaultViewState(activeItem?.id || '');
  const { zoom, rotation, offset, dragState, showReactionPicker, mediaMetadata } = currentViewState;

  const updateCurrentViewState = useCallback((updater) => {
    if (!activeItem?.id) return;

    setViewState((currentState) => {
      const baseState =
        currentState.mediaId === activeItem.id
          ? currentState
          : createDefaultViewState(activeItem.id);
      const nextState =
        typeof updater === 'function'
          ? updater(baseState)
          : { ...baseState, ...updater };

      return {
        ...baseState,
        ...nextState,
        mediaId: activeItem.id,
      };
    });
  }, [activeItem]);

  const showFeedback = (message) => {
    window.clearTimeout(feedbackTimeoutRef.current);
    setFeedbackMessage(message);
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setFeedbackMessage('');
    }, 1800);
  };

  const updateZoom = useCallback((nextZoom) => {
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    updateCurrentViewState((currentState) => ({
      ...currentState,
      zoom: clampedZoom,
      offset: clampedZoom <= 1 ? { x: 0, y: 0 } : currentState.offset,
    }));
  }, [updateCurrentViewState]);

  const handleDownload = () => {
    if (!activeItem?.url || typeof document === 'undefined') return;

    const link = document.createElement('a');
    link.href = activeItem.url;
    link.download =
      activeItem.name ||
      (activeItem.type === 'video'
        ? 'video'
        : isGifItem(activeItem)
          ? 'gif'
          : 'image');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showFeedback('Media download started');
  };

  const handleForward = async () => {
    if (!activeItem?.url) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: authorMeta?.name || 'Shared media',
          text: activeItem.caption || '',
          url: activeItem.url,
        });
        showFeedback('Media shared');
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeItem.url);
        showFeedback('Media link copied');
        return;
      }

      showFeedback('Sharing is not available here');
    } catch (error) {
      if (error?.name !== 'AbortError') {
        showFeedback('Unable to share this media');
      }
    }
  };

  useEffect(() => {
    if (!activeItem || typeof document === 'undefined') {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeItem]);

  useEffect(() => {
    if (!activeItem || typeof window === 'undefined') {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key === 'ArrowLeft' && canGoPrevious) {
        event.preventDefault();
        onSelect?.(safeActiveIndex - 1);
        return;
      }

      if (event.key === 'ArrowRight' && canGoNext) {
        event.preventDefault();
        onSelect?.(safeActiveIndex + 1);
        return;
      }

      if ((event.key === '+' || event.key === '=') && activeItem.type !== 'video') {
        event.preventDefault();
        updateZoom(zoom + ZOOM_STEP);
        return;
      }

      if (event.key === '-' && activeItem.type !== 'video') {
        event.preventDefault();
        updateZoom(zoom - ZOOM_STEP);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeItem, canGoNext, canGoPrevious, onClose, onSelect, safeActiveIndex, updateZoom, zoom]);

  useEffect(() => {
    if (!dragState || typeof window === 'undefined') {
      return undefined;
    }

    const handleMove = (event) => {
      const point = event.touches?.[0] || event;
      if (!point) return;

      if (event.cancelable) {
        event.preventDefault();
      }

      updateCurrentViewState({
        offset: {
          x: dragState.originX + (point.clientX - dragState.startX),
          y: dragState.originY + (point.clientY - dragState.startY),
        },
      });
    };

    const handleEnd = () => {
      updateCurrentViewState({ dragState: null });
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [dragState, updateCurrentViewState]);

  useEffect(() => {
    if (!activeItem || !showThumbnails) {
      return undefined;
    }

    const thumbnailNode = thumbnailRefs.current[activeItem.id];
    if (thumbnailNode?.scrollIntoView) {
      thumbnailNode.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }

    return undefined;
  }, [activeItem, showThumbnails]);

  useEffect(() => {
    return () => {
      window.clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof isItemStarred === 'function') return;
    persistStoredStarredMedia(starredMediaStorageKey, starredById);
  }, [isItemStarred, starredById, starredMediaStorageKey]);

  if (!activeItem || !authorMeta) {
    return null;
  }

  const activeMediaKey = getMediaActionKey(activeItem);
  const hasControlledStarredState = typeof isItemStarred === 'function';
  const hasControlledReaction = typeof getItemReaction === 'function';
  const hasControlledPinnedState = typeof isItemPinned === 'function';
  const selectedReaction = hasControlledReaction
    ? String(getItemReaction(activeItem) || '').trim()
    : reactionsById[activeMediaKey] || '';
  const isStarred = hasControlledStarredState
    ? Boolean(isItemStarred(activeItem))
    : isMediaItemStarred(starredById, activeItem);
  const isPinned = hasControlledPinnedState
    ? Boolean(isItemPinned(activeItem))
    : Boolean(pinnedById[activeMediaKey]);
  const fileSizeLabel = formatFileSize(activeItem.fileSize || activeItem.message?.fileSize);
  const durationLabel = formatDuration(activeItem.duration || activeItem.message?.duration || mediaMetadata.duration);
  const transformStyle = {
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
    cursor: zoom > 1 ? (dragState ? 'grabbing' : 'grab') : 'default',
  };

  const handleStartDrag = (event) => {
    if (zoom <= 1) return;

    const point = event.touches?.[0] || event;
    if (!point) return;

    updateCurrentViewState({
      dragState: {
        startX: point.clientX,
        startY: point.clientY,
        originX: offset.x,
        originY: offset.y,
      },
    });
  };

  const handleToggleStar = async () => {
    if (!activeMediaKey) {
      showFeedback('Unable to identify this media');
      return;
    }

    const nextStarredState = !isStarred;
    try {
      if (!nextStarredState && typeof onRequestRemoveStar === 'function') {
        onRequestRemoveStar(activeItem);
        return;
      }
      if (typeof onToggleStar === 'function') {
        const appliedStarredState = await onToggleStar(activeItem, nextStarredState);
        if (typeof appliedStarredState === 'boolean' && appliedStarredState !== nextStarredState) {
          showFeedback('Unable to update star');
          return;
        }
      } else {
        setStarredById((currentValue) =>
          setMediaItemStarred(currentValue, activeItem, nextStarredState)
        );
      }
      showFeedback(nextStarredState ? 'Media starred' : 'Star removed');
    } catch (error) {
      showFeedback(error?.message || 'Unable to update star');
    }
  };

  const handleTogglePin = async () => {
    if (!activeMediaKey) {
      showFeedback('Unable to identify this media');
      return;
    }

    const nextPinnedState = !isPinned;
    try {
      if (typeof onTogglePin === 'function') {
        const appliedPinnedState = await onTogglePin(activeItem, nextPinnedState);
        if (typeof appliedPinnedState === 'boolean' && appliedPinnedState !== nextPinnedState) {
          showFeedback(`Unable to ${nextPinnedState ? 'pin' : 'unpin'} media`);
          return;
        }
      } else {
        setPinnedById((currentValue) => ({
          ...currentValue,
          [activeMediaKey]: nextPinnedState,
        }));
      }
      showFeedback(nextPinnedState ? 'Media pinned' : 'Media unpinned');
    } catch (error) {
      showFeedback(error?.message || `Unable to ${nextPinnedState ? 'pin' : 'unpin'} media`);
    }
  };

  const handleSelectReaction = async (reaction) => {
    if (!activeMediaKey || !reaction) return;

    const shouldRemoveReaction = selectedReaction === reaction;
    const nextReaction = shouldRemoveReaction ? '' : reaction;
    try {
      let appliedReaction = nextReaction;
      if (hasControlledReaction) {
        if (shouldRemoveReaction && typeof onRemoveReaction === 'function') {
          const reactionResult = await onRemoveReaction(activeItem);
          if (typeof reactionResult === 'string') appliedReaction = reactionResult;
        } else if (typeof onReact === 'function') {
          const reactionResult = await onReact(activeItem, reaction);
          if (typeof reactionResult === 'string') appliedReaction = reactionResult;
        }
      } else {
        setReactionsById((currentValue) => ({
          ...currentValue,
          [activeMediaKey]: nextReaction,
        }));
      }
      updateCurrentViewState({ showReactionPicker: false });
      showFeedback(
        appliedReaction === nextReaction
          ? shouldRemoveReaction ? 'Reaction removed' : 'Reaction added'
          : 'Unable to update reaction'
      );
    } catch (error) {
      showFeedback(error?.message || 'Unable to update reaction');
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex flex-col overflow-hidden bg-white">
      <div className="relative z-30 flex shrink-0 items-center justify-between gap-4 border-b border-[#E5E7EB] px-5 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar avatarUrl={authorMeta.avatarUrl} initials={authorMeta.initials} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-[#111827]">{authorMeta.name}</p>
            <p className="truncate text-sm text-[#4B5563]">{authorMeta.subtitle || activeItem.time}</p>
          </div>
        </div>

        <div className="relative flex items-center gap-1 sm:gap-1.5">
          {feedbackMessage ? (
            <div role="status" aria-live="polite" className="absolute right-0 top-full z-40 mt-2 rounded-full bg-[#111827] px-3 py-1 text-xs font-medium text-white shadow-lg">
              {feedbackMessage}
            </div>
          ) : null}

          <ActionButton
            title="Zoom out"
            disabled={zoom <= MIN_ZOOM || activeItem.type === 'video'}
            onClick={() => updateZoom(zoom - ZOOM_STEP)}
          >
            <MagnifierIcon kind="minus" />
          </ActionButton>
          <ActionButton
            title="Zoom in"
            disabled={zoom >= MAX_ZOOM || activeItem.type === 'video'}
            onClick={() => updateZoom(zoom + ZOOM_STEP)}
          >
            <MagnifierIcon kind="plus" />
          </ActionButton>
          <ActionButton
            title={showThumbnails ? 'Hide media strip' : 'Show media strip'}
            active={showThumbnails}
            pressed={showThumbnails}
            expanded={showThumbnails}
            controls={mediaStripId}
            onClick={() => setShowThumbnails((currentValue) => !currentValue)}
          >
            <StripIcon />
          </ActionButton>
          <ActionButton
            title="Rotate left"
            disabled={activeItem.type === 'video'}
            onClick={() =>
              updateCurrentViewState((currentState) => ({
                ...currentState,
                rotation: currentState.rotation - 90,
              }))
            }
          >
            <RotateIcon />
          </ActionButton>
          <ActionButton
            title={isStarred ? 'Remove star' : 'Star media'}
            active={isStarred}
            pressed={isStarred}
            onClick={() => { void handleToggleStar(); }}
          >
            <StarIcon filled={isStarred} />
          </ActionButton>
          <ActionButton
            title={isPinned ? 'Unpin media' : 'Pin media'}
            active={isPinned}
            pressed={isPinned}
            onClick={() => { void handleTogglePin(); }}
          >
            <PinIcon filled={isPinned} />
          </ActionButton>
          <ActionButton
            title={showReactionPicker ? 'Hide reactions' : 'React to media'}
            active={showReactionPicker || Boolean(selectedReaction)}
            pressed={Boolean(selectedReaction)}
            onClick={() =>
              updateCurrentViewState((currentState) => ({
                ...currentState,
                showReactionPicker: !currentState.showReactionPicker,
              }))
            }
          >
            <SmileIcon />
          </ActionButton>
          <ActionButton title="Forward or share" onClick={handleForward}>
            <ForwardIcon />
          </ActionButton>
          <ActionButton title="Download" onClick={handleDownload}>
            <DownloadIcon />
          </ActionButton>
          <ActionButton title="Close preview" onClick={() => onClose?.()}>
            <CloseIcon />
          </ActionButton>

          {showReactionPicker ? (
            <div className="absolute right-[104px] top-full z-40 mt-2 flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-white px-2 py-1 shadow-lg">
              {QUICK_REACTIONS.map((reaction) => {
                const isActiveReaction = selectedReaction === reaction;
                return (
                  <button
                    key={reaction}
                    type="button"
                    aria-label={`React with ${reaction}`}
                    onClick={() => { void handleSelectReaction(reaction); }}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition-colors ${
                      isActiveReaction ? 'bg-[#DCFCE7]' : 'hover:bg-[#F3F4F6]'
                    }`}
                  >
                    {reaction}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 bg-[#F8FAFC]">
        {mediaItems.length > 1 ? (
          <>
            <NavigationButton
              direction="left"
              disabled={!canGoPrevious}
              onClick={() => canGoPrevious && onSelect?.(safeActiveIndex - 1)}
            />
            <NavigationButton
              direction="right"
              disabled={!canGoNext}
              onClick={() => canGoNext && onSelect?.(safeActiveIndex + 1)}
            />
          </>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-6 sm:px-12">
              <div
                className={`flex h-full min-h-0 w-full items-center justify-center overflow-hidden ${
                activeItem.type !== 'video' ? 'select-none' : ''
              }`}
              onWheel={(event) => {
                if (activeItem.type === 'video') return;
                event.preventDefault();
                updateZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
              }}
              onDoubleClick={() => {
                if (activeItem.type === 'video') return;
                if (zoom > 1) {
                  updateZoom(1);
                  return;
                }
                updateZoom(1.8);
              }}
            >
              {activeItem.type === 'video' ? (
                <video
                  key={activeItem.id || activeItem.url}
                  src={activeItem.url}
                  controls
                  playsInline
                  autoPlay
                  onLoadedMetadata={(event) => {
                    updateCurrentViewState({
                      mediaMetadata: {
                        width: Math.round(event.currentTarget.videoWidth || 0),
                        height: Math.round(event.currentTarget.videoHeight || 0),
                        duration: event.currentTarget.duration || null,
                      },
                    });
                  }}
                  className="max-h-full max-w-full rounded-[6px] bg-black shadow-[0_20px_60px_rgba(15,23,42,0.18)]"
                  style={transformStyle}
                />
              ) : (
                <img
                  src={activeItem.url}
                  alt={activeItem.caption || 'Shared media preview'}
                  draggable="false"
                  onMouseDown={handleStartDrag}
                  onTouchStart={handleStartDrag}
                  onLoad={(event) => {
                    updateCurrentViewState({
                      mediaMetadata: {
                        width: Math.round(event.currentTarget.naturalWidth || 0),
                        height: Math.round(event.currentTarget.naturalHeight || 0),
                        duration: null,
                      },
                    });
                  }}
                  className="max-h-full max-w-full rounded-[4px] object-contain shadow-[0_20px_60px_rgba(15,23,42,0.14)]"
                  style={transformStyle}
                />
              )}
            </div>
          </div>

          {activeItem.caption || selectedReaction || fileSizeLabel || durationLabel ? (
            <div className="shrink-0 px-6 pb-4 sm:px-8">
              <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 text-center">
                {activeItem.caption ? (
                  <p className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-[#1F2937] shadow-sm">
                    {activeItem.caption}
                  </p>
                ) : null}
                {selectedReaction ? (
                  <span className="rounded-full bg-[#111827] px-3 py-1.5 text-sm text-white">
                    {selectedReaction}
                  </span>
                ) : null}
                {durationLabel ? (
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#4B5563] shadow-sm">
                    {durationLabel}
                  </span>
                ) : null}
                {fileSizeLabel ? (
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#4B5563] shadow-sm">
                    {fileSizeLabel}
                  </span>
                ) : null}
                {mediaMetadata.width && mediaMetadata.height ? (
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#4B5563] shadow-sm">
                    {mediaMetadata.width} x {mediaMetadata.height}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {showThumbnails ? (
            <div id={mediaStripId} role="region" aria-label="Media strip" className="shrink-0 border-t border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3">
              <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {mediaItems.map((item, index) => {
                  const isActiveItem = index === safeActiveIndex;
                  const itemDuration = formatDuration(item.duration || item.message?.duration);
                  const itemIsGif = isGifItem(item);

                  return (
                    <button
                      key={item.id}
                      ref={(node) => {
                        if (node) {
                          thumbnailRefs.current[item.id] = node;
                        } else {
                          delete thumbnailRefs.current[item.id];
                        }
                      }}
                      type="button"
                      onClick={() => onSelect?.(index)}
                      className={`relative h-[96px] w-[96px] flex-shrink-0 overflow-hidden rounded-[10px] border-4 bg-[#E5E7EB] transition-all ${
                        isActiveItem
                          ? 'border-[#16A34A] shadow-[0_0_0_2px_rgba(34,197,94,0.18)]'
                          : 'border-transparent hover:border-[#D1D5DB]'
                      }`}
                    >
                      {item.type === 'video' ? (
                        <video src={item.url} className="h-full w-full object-cover" muted playsInline />
                      ) : (
                        <img src={item.url} alt={item.caption || 'Media thumbnail'} className="h-full w-full object-cover" />
                      )}

                      {itemIsGif ? (
                        <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-bold text-white">
                          GIF
                        </span>
                      ) : null}

                      {item.type === 'video' ? (
                        <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                          <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 12 12" aria-hidden="true">
                            <path d="M3 2.35v7.3a.55.55 0 0 0 .84.47l5.7-3.65a.55.55 0 0 0 0-.94l-5.7-3.65a.55.55 0 0 0-.84.47Z" />
                          </svg>
                          <span>{itemDuration || 'Video'}</span>
                        </span>
                      ) : null}

                      {((typeof isItemStarred === 'function' ? isItemStarred(item) : isMediaItemStarred(starredById, item)) || pinnedById[getMediaActionKey(item)] || (typeof isItemPinned === 'function' && isItemPinned(item))) ? (
                        <div className="absolute right-1 top-1 flex items-center gap-1">
                          {(typeof isItemStarred === 'function' ? isItemStarred(item) : isMediaItemStarred(starredById, item)) ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white">
                              <StarIcon filled />
                            </span>
                          ) : null}
                          {(typeof isItemPinned === 'function' ? isItemPinned(item) : pinnedById[getMediaActionKey(item)]) ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white">
                              <PinIcon filled />
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
