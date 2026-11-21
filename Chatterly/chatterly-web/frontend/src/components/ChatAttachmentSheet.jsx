import React, { useEffect } from 'react';

const attachmentOptions = [
  {
    id: 'camera',
    label: 'Camera',
    accent: 'from-[#26C281] to-[#1EA76F]',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M8.5 6.25 9.7 4.8A1.8 1.8 0 0 1 11.1 4h1.8c.54 0 1.05.24 1.4.66l1.2 1.59H18A2.5 2.5 0 0 1 20.5 8.75v7.75A2.5 2.5 0 0 1 18 19H6A2.5 2.5 0 0 1 3.5 16.5V8.75A2.5 2.5 0 0 1 6 6.25h2.5Z"
          stroke="white"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12.25" r="3.4" stroke="white" strokeWidth="1.7" />
      </svg>
    ),
  },
  {
    id: 'media',
    label: 'Photos & Videos',
    accent: 'from-[#7C5CFC] to-[#A43BF4]',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="4" width="17" height="16" rx="3.5" stroke="white" strokeWidth="1.7" />
        <circle cx="9" cy="9.25" r="1.5" fill="white" />
        <path d="m6.75 16.25 3.1-3.35a1 1 0 0 1 1.47-.03l2.13 2.23 1.42-1.4a1 1 0 0 1 1.38-.03l1.5 1.38" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'document',
    label: 'Document',
    accent: 'from-[#3B82F6] to-[#2563EB]',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 3.75h6.4L19 8.35V19a1.75 1.75 0 0 1-1.75 1.75H8A1.75 1.75 0 0 1 6.25 19V5.5A1.75 1.75 0 0 1 8 3.75Z" stroke="white" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M14.25 3.9v3.3c0 .64.51 1.15 1.15 1.15h3.28" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 12h6M9 15.5h6" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'contact',
    label: 'Contact',
    accent: 'from-[#F59E0B] to-[#F97316]',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8.25" r="3.25" stroke="white" strokeWidth="1.7" />
        <path d="M6.5 18.5a5.5 5.5 0 0 1 11 0" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function ChatAttachmentSheet({ isOpen, onClose, onSelect }) {
  useEffect(() => {
    if (!isOpen) {
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
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/30 px-4 pb-6 pt-12 backdrop-blur-[2px] sm:items-center sm:pb-4">
      <button
        type="button"
        aria-label="Close attachment options"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[360px] overflow-hidden rounded-[28px] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.22)] animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="border-b border-[#EEF2F7] px-5 pb-4 pt-5">
          <h3 className="text-[18px] font-bold text-[#0F172A]">Share attachment</h3>
          <p className="mt-1 text-[13px] leading-5 text-[#64748B]">
            Pick what you want to send in this chat.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 p-5">
          {attachmentOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect?.(option.id)}
              className="group flex flex-col items-center rounded-[24px] border border-[#E6ECF4] bg-[#FBFCFE] px-4 py-5 text-center transition-all hover:-translate-y-0.5 hover:border-[#D7E2F0] hover:bg-white hover:shadow-[0_14px_30px_rgba(148,163,184,0.16)]"
            >
              <span className={`mb-3 flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-br ${option.accent} shadow-[0_12px_24px_rgba(15,23,42,0.14)]`}>
                {option.icon}
              </span>
              <span className="text-[14px] font-semibold leading-5 text-[#1E293B]">
                {option.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
