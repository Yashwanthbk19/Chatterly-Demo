import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import defaultProfilePic from '../assets/image.png';

// Full-size view of a profile, group or broadcast photo, opened by clicking the
// avatar in an info panel (BUG_USR_509). Escape, the close button or a click on
// the backdrop closes it. Colours avoid the bg-white / bg-[#F…] class names the
// dark-mode overlay rewrites, so it looks the same in both themes.
export default function ProfilePhotoPreviewDialog({ isOpen = false, imageUrl = '', name = '', onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      // Only the preview closes; the panel underneath stays open.
      event.stopImmediatePropagation();
      onClose?.();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl || typeof document === 'undefined') return null;

  const displayName = String(name || '').trim();
  // React events bubble out of a portal to the owning panel; keep them here.
  const handleClose = (event) => {
    event.stopPropagation();
    onClose?.();
  };

  // Portalled to <body> so no panel's stacking context or overflow can clip it.
  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex flex-col bg-[rgba(8,12,22,0.92)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={displayName ? `Profile photo of ${displayName}` : 'Profile photo'}
      onClick={handleClose}
    >
      <div className="flex flex-shrink-0 items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <p className="min-w-0 truncate text-[16px] font-semibold text-white">{displayName}</p>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.12)] text-white transition-colors hover:bg-[rgba(255,255,255,0.22)]"
          aria-label="Close photo preview"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-8 sm:px-10">
        <img
          src={imageUrl}
          alt={displayName ? `${displayName}'s profile photo` : 'Profile photo'}
          className="h-auto max-h-full w-[min(92vw,560px)] max-w-full rounded-[12px] object-contain shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
          onClick={(event) => event.stopPropagation()}
          onError={(event) => {
            event.currentTarget.src = defaultProfilePic;
          }}
        />
      </div>
    </div>,
    document.body
  );
}
