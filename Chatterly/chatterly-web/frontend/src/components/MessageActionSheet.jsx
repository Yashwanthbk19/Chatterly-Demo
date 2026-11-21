import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import EmojiPicker, { EmojiGlyph } from './EmojiPicker';
import { getDownloadUrl } from '../api/chat';
import {
  addMessageQuickReaction,
  MESSAGE_ACTION_QUICK_REACTIONS_STORAGE_KEY,
  readMessageQuickReactions,
} from '../utils/messageQuickReactions';

const VIEWPORT_PADDING_PX = 12;
const MENU_OFFSET_PX = 10;
const FALLBACK_MENU_WIDTH_PX = 236;
const SHEET_TRANSITION_DURATION_MS = 220;

const CustomReactionIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 6.5v11" />
    <path d="M6.5 12h11" />
  </svg>
);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getRootZoom = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 1;
  const zoom = Number.parseFloat(window.getComputedStyle(document.documentElement).zoom);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
};

const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M8.26367 3.49902C8.84942 2.9136 9.79906 2.91348 10.3848 3.49902L12.499 5.61328C13.0849 6.19901 13.0847 7.14853 12.499 7.73438L6.27734 13.958C6.02253 14.2128 5.70513 14.3966 5.35742 14.4912L1.79102 15.4639C1.61722 15.511 1.43377 15.5121 1.25977 15.4658C1.08564 15.4194 0.926178 15.3277 0.798828 15.2002C0.671527 15.0727 0.580393 14.9134 0.53418 14.7393C0.48801 14.5651 0.488779 14.3818 0.536133 14.208L1.50781 10.6406C1.60257 10.2934 1.78655 9.97713 2.04102 9.72266L8.26367 3.49902ZM12.416 0.500977C13.1793 0.478637 13.9222 0.748841 14.4932 1.25586L14.499 1.26074L14.5039 1.26562L14.6104 1.36621L14.6211 1.37598L14.6309 1.38672L14.7324 1.49316L14.7373 1.49902L14.7432 1.50488C15.2503 2.07602 15.5206 2.81953 15.498 3.58301C15.4755 4.34631 15.1618 5.07214 14.6221 5.6123L14.6211 5.61328C14.0522 6.1812 13.131 6.18068 12.5625 5.6123L10.3857 3.43652C9.81705 2.8678 9.81708 1.94572 10.3857 1.37695C10.926 0.837079 11.6525 0.523377 12.416 0.500977Z"
      stroke="#0B1220"
    />
  </svg>
);

const PinIcon = () => (
  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M0.5 16.5L4.94443 12.0556M9.61909 14.6076C6.2911 13.852 3.14799 10.7089 2.39244 7.38091C2.27244 6.85469 2.21288 6.59158 2.38622 6.16403C2.55866 5.73736 2.7711 5.60403 3.19421 5.34003C4.15066 4.7427 5.1871 4.55248 6.26176 4.6467C7.7702 4.78092 8.52487 4.84759 8.90175 4.65114C9.27775 4.45559 9.53286 3.99692 10.0449 3.08048L10.692 1.91871C11.1186 1.15426 11.332 0.771154 11.8342 0.59071C12.3364 0.410266 12.6386 0.519599 13.2431 0.738265C13.9377 0.987698 14.5686 1.38769 15.0904 1.90957C15.6123 2.43145 16.0123 3.0623 16.2617 3.75692C16.4804 4.36137 16.5897 4.66359 16.4093 5.16581C16.2288 5.66714 15.8466 5.88047 15.0813 6.30803L13.8929 6.97025C12.9773 7.48047 12.5204 7.73647 12.324 8.11602C12.1284 8.49647 12.1995 9.23424 12.3417 10.7098C12.4466 11.7942 12.2662 12.8378 11.6609 13.8067C11.396 14.2298 11.2635 14.4413 10.836 14.6147C10.4093 14.7871 10.1462 14.7276 9.61909 14.6076Z"
      stroke="#0B1220"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PinnedIcon = () => (
  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M0.5 16.5L4.94443 12.0556M15.5 12.5L12.2061 9L8 4.77279L4.5 1.5M8 4.77279C7.57635 4.76355 7.01238 4.71349 6.26176 4.6467C5.1871 4.55248 4.15066 4.7427 3.19422 5.34003C2.77111 5.60403 2.55866 5.73736 2.38622 6.16403C2.21288 6.59158 2.27244 6.85469 2.39244 7.38091C3.14799 10.7089 6.2911 13.852 9.61909 14.6076C10.1462 14.7276 10.4093 14.7871 10.836 14.6147C11.2635 14.4413 11.396 14.2298 11.6609 13.8067C12.2662 12.8378 12.4466 11.7942 12.3417 10.7098C12.2705 9.97069 12.2171 9.4167 12.2061 9M13 7.48572C13.2324 7.33853 13.5258 7.17482 13.8929 6.97025L15.0813 6.30803C15.8466 5.88047 16.2288 5.66714 16.4093 5.16581C16.5897 4.66359 16.4804 4.36137 16.2617 3.75692C16.0123 3.0623 15.6123 2.43145 15.0904 1.90957C14.5686 1.38769 13.9377 0.987698 13.2431 0.738265C12.6386 0.519599 12.3364 0.410266 11.8342 0.59071C11.332 0.771154 11.1186 1.15426 10.692 1.91871L10.0449 3.08048C9.82619 3.47188 9.65438 3.77978 9.5 4.01935"
      stroke="#0B1220"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ReplyIcon = () => (
  <svg width="17" height="12" viewBox="0 0 17 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M16.5 11.5V9.5C16.5 8.43913 16.0786 7.42172 15.3284 6.67157C14.5783 5.92143 13.5609 5.5 12.5 5.5H0.5M5.5 0.5L0.5 5.5L5.5 10.5"
      stroke="#0B1220"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ForwardIcon = () => (
  <svg width="17" height="12" viewBox="0 0 17 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M0.5 11.5V9.5C0.5 8.43913 0.935023 7.42172 1.70937 6.67157C2.48371 5.92143 3.53395 5.5 4.62903 5.5H13.4032M8.24194 0.5L13.4032 5.5L8.24194 10.5M11.3387 10.5L16.5 5.5L11.3387 0.5"
      stroke="#0B1220"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MailUnreadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12 4.2 4.2L13 12.4" />
    <path d="M13.2 12.4 19 6.6" />
  </svg>
);

const TrashIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5.8A1.8 1.8 0 0 1 11.3 4h1.4a1.8 1.8 0 0 1 1.8 1.8V7" />
    <path d="m6.6 7 .8 11A1.8 1.8 0 0 0 9.2 19.7h5.6a1.8 1.8 0 0 0 1.8-1.7l.8-11" />
    <path d="M10 10.5v5" />
    <path d="M14 10.5v5" />
  </svg>
);

const FavoriteHeartIcon = ({ filled = false }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.8 8.6c0 4.1-8.8 10.5-8.8 10.5S3.2 12.7 3.2 8.6a4.6 4.6 0 0 1 8.8-1.8 4.6 4.6 0 0 1 8.8 1.8Z" />
  </svg>
);

const HIDDEN_POSITION = {
  left: VIEWPORT_PADDING_PX,
  top: VIEWPORT_PADDING_PX,
  visibility: 'hidden',
};

export default function MessageActionSheet({
  isOpen,
  message,
  anchorElement,
  menuRef,
  onClose,
  onEdit,
  onReply,
  onForward,
  onTogglePin,
  onMarkUnread,
  onDelete,
  onReact,
  selectedReaction = '',
  pinItemLabel = 'Message',
  favoriteMode = false,
  canEdit = false,
}) {
  const fallbackMenuRef = useRef(null);
  const resolvedMenuRef = menuRef || fallbackMenuRef;
  const closeTimeoutRef = useRef(null);
  const customReactionPickerRef = useRef(null);
  const customReactionButtonRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(HIDDEN_POSITION);
  const [shouldRender, setShouldRender] = useState(Boolean(isOpen && message));
  const [isVisible, setIsVisible] = useState(Boolean(isOpen && message));
  const [renderedMessage, setRenderedMessage] = useState(message || null);
  const [isCustomReactionPickerOpen, setIsCustomReactionPickerOpen] = useState(false);
  const [customReactionPickerPosition, setCustomReactionPickerPosition] = useState(null);
  const [quickReactions, setQuickReactions] = useState(readMessageQuickReactions);

  // Closing always drops the measured position so a reopen never paints one
  // frame at the previous anchor's coordinates.
  const closeCustomReactionPicker = useCallback(() => {
    setIsCustomReactionPickerOpen(false);
    setCustomReactionPickerPosition(null);
  }, []);

  const customizeQuickReactions = useCallback((emoji) => {
    const { emoji: normalizedEmoji, reactions } = addMessageQuickReaction(emoji, quickReactions);
    if (!normalizedEmoji) {
      return normalizedEmoji;
    }
    setQuickReactions(reactions);

    return normalizedEmoji;
  }, [quickReactions]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleQuickReactionsChange = (event) => {
      if (Array.isArray(event?.detail?.reactions)) {
        setQuickReactions(event.detail.reactions);
        return;
      }
      setQuickReactions(readMessageQuickReactions());
    };

    const handleStorageChange = (event) => {
      if (event.key === MESSAGE_ACTION_QUICK_REACTIONS_STORAGE_KEY) {
        setQuickReactions(readMessageQuickReactions());
      }
    };

    window.addEventListener('chatterly:message-quick-reactions-change', handleQuickReactionsChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('chatterly:message-quick-reactions-change', handleQuickReactionsChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearCloseTimeout();
  }, [clearCloseTimeout]);

  useEffect(() => {
    const isSheetActive = Boolean(isOpen && message);

    if (isSheetActive) {
      clearCloseTimeout();
      setRenderedMessage(message);
      setShouldRender(true);

      const rafId = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });

      return () => {
        window.cancelAnimationFrame(rafId);
      };
    }

    setIsVisible(false);
    closeCustomReactionPicker();

    if (!shouldRender) {
      setRenderedMessage(null);
      return undefined;
    }

    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setShouldRender(false);
      setRenderedMessage(null);
      setMenuPosition(HIDDEN_POSITION);
      closeTimeoutRef.current = null;
    }, SHEET_TRANSITION_DURATION_MS);

    return () => {
      clearCloseTimeout();
    };
  }, [clearCloseTimeout, closeCustomReactionPicker, isOpen, message, shouldRender]);

  useEffect(() => {
    if (!shouldRender) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      // Escape closes the emoji picker first so the action sheet stays open.
      if (isCustomReactionPickerOpen) {
        closeCustomReactionPicker();
        return;
      }
      onClose?.();
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeCustomReactionPicker, isCustomReactionPickerOpen, onClose, shouldRender]);

  // The action sheet itself is a narrow, overflow-hidden card, so the emoji
  // picker is rendered as a sibling in the portal and positioned against the
  // trigger button - clamped to the viewport so it never runs off screen.
  useLayoutEffect(() => {
    if (!isCustomReactionPickerOpen) {
      return undefined;
    }

    const updatePickerPosition = () => {
      const buttonRect = customReactionButtonRef.current?.getBoundingClientRect();
      if (!buttonRect) {
        setCustomReactionPickerPosition(null);
        return;
      }

      // The whole UI is scaled by `zoom` on <html> (index.css --app-zoom).
      // Rects and innerWidth/innerHeight are screen pixels, but the left/top
      // set below are CSS pixels that the zoom scales again, which dropped the
      // picker over the reaction row instead of under "+". Work in CSS pixels.
      const zoom = getRootZoom();
      const anchorRect = {
        top: buttonRect.top / zoom,
        bottom: buttonRect.bottom / zoom,
        left: buttonRect.left / zoom,
        width: buttonRect.width / zoom,
      };
      const viewportWidth = window.innerWidth / zoom;
      const viewportHeight = window.innerHeight / zoom;

      const pickerWidth = Math.min(360, viewportWidth - VIEWPORT_PADDING_PX * 2);
      const spaceBelow = viewportHeight - anchorRect.bottom - MENU_OFFSET_PX - VIEWPORT_PADDING_PX;
      const spaceAbove = anchorRect.top - MENU_OFFSET_PX - VIEWPORT_PADDING_PX;
      const shouldFlipAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
      const pickerHeight = Math.max(220, Math.min(400, shouldFlipAbove ? spaceAbove : spaceBelow));
      const maximumLeft = Math.max(VIEWPORT_PADDING_PX, viewportWidth - pickerWidth - VIEWPORT_PADDING_PX);
      const left = clamp(
        anchorRect.left + anchorRect.width / 2 - pickerWidth / 2,
        VIEWPORT_PADDING_PX,
        maximumLeft
      );
      const top = shouldFlipAbove
        ? Math.max(VIEWPORT_PADDING_PX, anchorRect.top - MENU_OFFSET_PX - pickerHeight)
        : anchorRect.bottom + MENU_OFFSET_PX;

      setCustomReactionPickerPosition({
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(pickerWidth),
        height: Math.round(pickerHeight),
      });
    };

    const rafId = window.requestAnimationFrame(updatePickerPosition);
    window.addEventListener('resize', updatePickerPosition);
    window.addEventListener('scroll', updatePickerPosition, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updatePickerPosition);
      window.removeEventListener('scroll', updatePickerPosition, true);
    };
  }, [isCustomReactionPickerOpen, menuPosition]);

  // Close the custom reaction picker when clicking outside of it.
  useEffect(() => {
    if (!isCustomReactionPickerOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        customReactionPickerRef.current?.contains(event.target) ||
        customReactionButtonRef.current?.contains(event.target)
      ) {
        return;
      }
      closeCustomReactionPicker();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [closeCustomReactionPicker, isCustomReactionPickerOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !renderedMessage) {
      return undefined;
    }

    const updatePosition = () => {
      const menuNode = resolvedMenuRef.current;

      if (!anchorElement?.getBoundingClientRect || !menuNode) {
        setMenuPosition(HIDDEN_POSITION);
        return;
      }

      // The menu hangs off the message's own "more" control when it has one. A lengthy message
      // can be taller than the screen, so its bubble is a poor anchor, whereas the control is
      // kept inside the visible part of the bubble.
      const triggerElement = anchorElement.querySelector?.('[data-message-actions-trigger]');
      const rowRect = anchorElement.getBoundingClientRect();
      const anchorRect = triggerElement ? triggerElement.getBoundingClientRect() : rowRect;

      // The whole UI is scaled by `zoom` on <html> (index.css --app-zoom). Rects and
      // innerWidth/innerHeight are screen pixels, but the left/top set below are CSS pixels
      // that the zoom scales again, which put the menu up and to the left of its anchor
      // (further the lower or further right the message was). Work in CSS pixels.
      const zoom = getRootZoom();
      const anchor = {
        left: anchorRect.left / zoom,
        right: anchorRect.right / zoom,
        top: anchorRect.top / zoom,
        bottom: anchorRect.bottom / zoom,
        width: anchorRect.width / zoom,
      };
      const viewportWidth = window.innerWidth / zoom;
      const viewportHeight = window.innerHeight / zoom;
      const menuRect = menuNode.getBoundingClientRect();
      const menuWidth = Math.max(Math.ceil(menuRect.width / zoom) || 0, FALLBACK_MENU_WIDTH_PX);
      const menuHeight = Math.ceil(menuRect.height / zoom) || 0;
      const maximumLeft = Math.max(VIEWPORT_PADDING_PX, viewportWidth - menuWidth - VIEWPORT_PADDING_PX);
      const maximumTop = Math.max(VIEWPORT_PADDING_PX, viewportHeight - menuHeight - VIEWPORT_PADDING_PX);
      const anchorCenter = anchor.left + (anchor.width / 2);

      // The control sits left of a sent bubble and right of a received one: open away from it.
      const alignRight = triggerElement
        ? anchorCenter < (rowRect.left + rowRect.right) / 2 / zoom
        : anchorCenter > viewportWidth / 2;
      const left = alignRight
        ? clamp(anchor.right - menuWidth, VIEWPORT_PADDING_PX, maximumLeft)
        : clamp(anchor.left, VIEWPORT_PADDING_PX, maximumLeft);

      let top;
      if (triggerElement) {
        // Drop down from the control, flipping above it when the screen edge is too close.
        const spaceBelow = viewportHeight - anchor.bottom - MENU_OFFSET_PX - VIEWPORT_PADDING_PX;
        const spaceAbove = anchor.top - MENU_OFFSET_PX - VIEWPORT_PADDING_PX;
        const belowTop = anchor.bottom + MENU_OFFSET_PX;
        const aboveTop = anchor.top - menuHeight - MENU_OFFSET_PX;
        if (spaceBelow >= menuHeight) top = belowTop;
        else if (spaceAbove >= menuHeight) top = aboveTop;
        else top = clamp(spaceBelow >= spaceAbove ? belowTop : aboveTop, VIEWPORT_PADDING_PX, maximumTop);
      } else {
        // No control to hang off (long-press / right-click): above the visible part of the
        // message, else below it, else over its middle.
        const visibleTop = Math.max(anchor.top, VIEWPORT_PADDING_PX);
        const visibleBottom = Math.min(anchor.bottom, viewportHeight - VIEWPORT_PADDING_PX);
        const aboveTop = visibleTop - menuHeight - MENU_OFFSET_PX;
        const belowTop = visibleBottom + MENU_OFFSET_PX;
        if (aboveTop >= VIEWPORT_PADDING_PX) top = aboveTop;
        else if (belowTop <= maximumTop) top = belowTop;
        else top = clamp((visibleTop + visibleBottom) / 2 - menuHeight / 2, VIEWPORT_PADDING_PX, maximumTop);
      }

      setMenuPosition({
        left: Math.round(left),
        top: Math.round(top),
        visibility: 'visible',
      });
    };

    const rafId = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorElement, isOpen, renderedMessage, resolvedMenuRef]);

  if (!shouldRender || !renderedMessage || typeof document === 'undefined') {
    return null;
  }


  const isPinned = Boolean(renderedMessage?.isPinned);
  const actionItems = [
    {
      key: 'edit',
      label: 'Edit',
      icon: <EditIcon />,
      onClick: onEdit,
      className: 'text-[#111827]',
      isHidden: !canEdit,
    },
    {
      key: 'reply',
      label: 'Reply',
      icon: <ReplyIcon />,
      onClick: onReply,
      className: 'text-[#111827]',
    },
    {
      key: 'forward',
      label: 'Forward',
      icon: <ForwardIcon />,
      onClick: onForward,
      className: 'text-[#111827]',
    },
    {
      key: 'pin',
      label: favoriteMode
        ? (isPinned ? 'Remove from favorites' : 'Add to favorites')
        : (isPinned ? `Unpin ${pinItemLabel}` : `Pin ${pinItemLabel}`),
      icon: favoriteMode ? <FavoriteHeartIcon filled={isPinned} /> : (isPinned ? <PinnedIcon /> : <PinIcon />),
      onClick: onTogglePin,
      className: 'text-[#111827]',
    },
    {
      key: 'unread',
      label: 'Mark as Unread',
      icon: <MailUnreadIcon />,
      onClick: onMarkUnread,
      className: 'text-[#111827]',
      isHidden: !onMarkUnread,
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: <TrashIcon />,
      onClick: onDelete,
      className: 'text-[#FF3B30]',
    },
  ];

  return createPortal(
    <div className={`fixed inset-0 z-[215] ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <button
        type="button"
        aria-label="Close message actions"
        className={`absolute inset-0 bg-transparent transition-opacity duration-[220ms] ease-out ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      <div
        ref={resolvedMenuRef}
        role="menu"
        aria-label="Message actions"
        className={`chatterly-message-actions-menu pointer-events-auto fixed w-[236px] overflow-hidden rounded-[16px] border border-[#D9E2EA] bg-white py-2 shadow-[0_18px_38px_rgba(15,23,42,0.14)] transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${isOpen ? '' : 'pointer-events-none'} ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
        style={{
          left: `${menuPosition.left}px`,
          top: `${menuPosition.top}px`,
          visibility: menuPosition.visibility,
        }}
      >
        <div className="relative flex items-center justify-center gap-1 border-b border-[#EEF2F7] px-2 pb-2 pt-1">
          {quickReactions.map((reaction) => {
            const isActiveReaction = selectedReaction === reaction;

            return (
              <button
                key={reaction}
                type="button"
                role="menuitem"
                aria-label={`React with ${reaction}`}
                aria-pressed={isActiveReaction}
                onClick={() => onReact?.(reaction)}
                className={`chatterly-emoji-glyph flex h-8 w-8 items-center justify-center rounded-full text-[19px] leading-none transition-all ${
                  isActiveReaction
                    ? 'bg-[#F3E8FF] shadow-[0_0_0_1px_rgba(139,92,246,0.35)]'
                    : 'hover:bg-[#F8FAFC]'
                }`}
              >
                <EmojiGlyph emoji={reaction} className="text-[19px]" flagClassName="h-5 w-5" />
              </button>
            );
          })}

          {/* Customise the reaction with any emoji, not just the six quick ones. */}
          <button
            ref={customReactionButtonRef}
            type="button"
            role="menuitem"
            aria-label="Customize quick reaction emojis"
            aria-haspopup="dialog"
            aria-expanded={isCustomReactionPickerOpen}
            onClick={() => setIsCustomReactionPickerOpen((currentValue) => !currentValue)}
            className={`flex h-8 w-8 items-center justify-center rounded-full border border-dashed transition-all ${
              isCustomReactionPickerOpen || (selectedReaction && !quickReactions.includes(selectedReaction))
                ? 'border-[#8B5CF6] bg-[#F3E8FF] text-[#6D28D9]'
                : 'border-[#CBD5E1] text-[#64748B] hover:bg-[#F8FAFC]'
            }`}
          >
            {selectedReaction && !quickReactions.includes(selectedReaction) ? (
              <EmojiGlyph emoji={selectedReaction} className="text-[19px]" flagClassName="h-5 w-5" />
            ) : (
              <CustomReactionIcon />
            )}
          </button>

        </div>
        {actionItems.filter((action) => !action.isHidden).map((action) => (
          action.isStatic ? (
            <div
              key={action.key}
              className={`flex min-h-[48px] w-full items-center gap-4 px-5 text-left text-[15px] font-normal tracking-[-0.02em] ${action.className}`}
            >
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                {action.icon}
              </span>
              <span className="leading-none">{action.label}</span>
            </div>
          ) : (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              data-message-action-item={action.key}
              onClick={action.onClick}
              className={`flex min-h-[48px] w-full items-center gap-4 px-5 text-left text-[15px] font-normal tracking-[-0.02em] transition-colors hover:bg-[#F8FAFC] ${action.className} ${action.key === 'delete' ? 'hover:bg-[#FFF7F7]' : ''}`}
            >
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                {action.icon}
              </span>
              <span className="leading-none">{action.label}</span>
            </button>
          )
        ))}
      </div>

      {isCustomReactionPickerOpen && customReactionPickerPosition ? (
        <div
          className="pointer-events-auto fixed z-[216] [&>div]:!mt-0 [&>div]:!h-full [&>div]:!max-h-full [&>div]:!w-full"
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          style={{
            left: `${customReactionPickerPosition.left}px`,
            top: `${customReactionPickerPosition.top}px`,
            width: `${customReactionPickerPosition.width}px`,
            height: `${customReactionPickerPosition.height}px`,
          }}
        >
          <EmojiPicker
            isOpen
            pickerRef={customReactionPickerRef}
            chromeVariant="chat-list"
            placement="inline-below"
            initialCategoryId="smileys"
            showGifTab={false}
            onEmojiSelect={(emoji) => {
              const nextReaction = customizeQuickReactions(emoji);
              if (!nextReaction) return;
              onReact?.(nextReaction);
              closeCustomReactionPicker();
            }}
          />
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
