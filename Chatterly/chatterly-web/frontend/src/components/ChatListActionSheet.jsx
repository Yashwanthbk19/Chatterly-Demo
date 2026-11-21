import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const VIEWPORT_PADDING_PX = 12;
const MENU_OFFSET_PX = 10;
const FALLBACK_MENU_WIDTH_PX = 220;

const HIDDEN_POSITION = {
  left: VIEWPORT_PADDING_PX,
  top: VIEWPORT_PADDING_PX,
  visibility: 'hidden',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const MailUnreadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12 4.2 4.2L13 12.4" />
    <path d="M13.2 12.4 19 6.6" />
  </svg>
);

const ReportGroupIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.3 4.2 3.1 17a2 2 0 0 0 1.75 3h14.3a2 2 0 0 0 1.75-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 16.5h.01" />
  </svg>
);

export default function ChatListActionSheet({
  isOpen,
  contact,
  anchorElement,
  onClose,
  onMarkUnread,
  onReport,
}) {
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(HIDDEN_POSITION);

  useEffect(() => {
    if (!isOpen || !contact) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contact, isOpen, onClose]);

  useLayoutEffect(() => {
    if (!isOpen || !contact) {
      return undefined;
    }

    const updatePosition = () => {
      const anchorRect = anchorElement?.getBoundingClientRect?.();
      const menuNode = menuRef.current;

      if (!anchorRect || !menuNode) {
        setMenuPosition(HIDDEN_POSITION);
        return;
      }

      const { width: measuredWidth, height: measuredHeight } = menuNode.getBoundingClientRect();
      const menuWidth = Math.max(Math.ceil(measuredWidth) || 0, FALLBACK_MENU_WIDTH_PX);
      const menuHeight = Math.ceil(measuredHeight) || 0;
      const maximumLeft = Math.max(VIEWPORT_PADDING_PX, window.innerWidth - menuWidth - VIEWPORT_PADDING_PX);
      const alignRight = anchorRect.left + (anchorRect.width / 2) > window.innerWidth / 2;
      const left = alignRight
        ? clamp(anchorRect.right - menuWidth, VIEWPORT_PADDING_PX, maximumLeft)
        : clamp(anchorRect.left, VIEWPORT_PADDING_PX, maximumLeft);
      const preferredTop = anchorRect.top - menuHeight - MENU_OFFSET_PX;
      const maximumTop = Math.max(VIEWPORT_PADDING_PX, window.innerHeight - menuHeight - VIEWPORT_PADDING_PX);
      const top = preferredTop >= VIEWPORT_PADDING_PX
        ? preferredTop
        : clamp(anchorRect.bottom + MENU_OFFSET_PX, VIEWPORT_PADDING_PX, maximumTop);

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
  }, [anchorElement, contact, isOpen]);

  if (!isOpen || !contact || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[215] pointer-events-auto">
      <button
        type="button"
        aria-label="Close chat actions"
        className="absolute inset-0 bg-transparent"
        onClick={onClose}
      />

      <div
        ref={menuRef}
        role="menu"
        aria-label={`Actions for ${contact?.name || 'chat'}`}
        className="pointer-events-auto fixed w-[220px] overflow-hidden rounded-[16px] border border-[#D9E2EA] bg-white py-2 shadow-[0_18px_38px_rgba(15,23,42,0.14)]"
        style={{
          left: `${menuPosition.left}px`,
          top: `${menuPosition.top}px`,
          visibility: menuPosition.visibility,
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={onMarkUnread}
          className="flex min-h-[48px] w-full items-center gap-4 px-5 text-left text-[15px] font-normal tracking-[-0.02em] text-[#111827] transition-colors hover:bg-[#F8FAFC]"
        >
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
            <MailUnreadIcon />
          </span>
          <span className="leading-none">Mark as Unread</span>
        </button>

        {onReport ? (
          <button
            type="button"
            role="menuitem"
            onClick={onReport}
            className="flex min-h-[48px] w-full items-center gap-4 px-5 text-left text-[15px] font-normal tracking-[-0.02em] text-[#DC2626] transition-colors hover:bg-[#FFF5F5]"
          >
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
              <ReportGroupIcon />
            </span>
            <span className="leading-none">Report Group</span>
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
