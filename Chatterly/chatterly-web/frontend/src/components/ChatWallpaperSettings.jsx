import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_CHAT_WALLPAPER,
  clampWallpaperPosition,
  clampWallpaperZoom,
  createChatWallpaperStyle,
  isGifImageFile,
  normalizeChatWallpaper,
} from '../utils/chatWallpaper';

const WALLPAPER_COLORS = [
  '#FFFFFF', '#BDE7E9', '#B0DCCB', '#AED6C6',
  '#7DCDAF', '#C6D8EB', '#68C7D0', '#63B7CA',
  '#D3CDED', '#CECECE', '#CEDDBB', '#E9E3AF',
  '#FFE8A6', '#FFD09A', '#FF949A', '#FF656D',
  '#F83D60', '#971B42', '#A92C24', '#D96948',
  '#765B62', '#4D827F', '#5DABC9', '#305C92',
  '#485762', '#1E292C', '#302039', '#EBEFF0',
  '#FFFB9A', '#E7E6CA',
];

const MAX_WALLPAPER_FILE_SIZE = 10 * 1024 * 1024;
const WALLPAPER_ZOOM_STEP = 0.25;
const ACCEPTED_WALLPAPER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MESSAGE_COLOR_OPTIONS = [
  { label: 'Purple (Default)', value: '#8B5CF6' },
  { label: 'Indigo', value: '#6366F1' },
  { label: 'Ocean Blue', value: '#2684D9' },
  { label: 'Sky Blue', value: '#1597D4' },
  { label: 'Teal', value: '#16808A' },
  { label: 'Emerald', value: '#16835F' },
  { label: 'Rose', value: '#E12A76' },
  { label: 'Coral', value: '#EF6464' },
  { label: 'Amber', value: '#C76522' },
  { label: 'Slate', value: '#536173' },
  { label: 'Graphite', value: '#374151' },
];

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

const CheckIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12 4 4L19 7" />
  </svg>
);

const ChatWallpaperSettings = ({
  globalWallpaper = DEFAULT_CHAT_WALLPAPER,
  isDarkMode = false,
  onApply,
  onBack,
}) => {
  const initialWallpaper = useMemo(() => {
    const normalized = normalizeChatWallpaper(globalWallpaper);
    if (normalized.type === 'image') {
      return { ...normalized, doodle: false };
    }
    return normalized.type === 'default'
      ? normalizeChatWallpaper({ type: 'color', value: '#FFFFFF', doodle: true })
      : normalized;
  }, [globalWallpaper]);

  const [draft, setDraft] = useState(initialWallpaper);
  const [selectedFile, setSelectedFile] = useState(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isMessageColorMenuOpen, setIsMessageColorMenuOpen] = useState(false);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [messageColorMenuPosition, setMessageColorMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const fileInputRef = useRef(null);
  const messageColorButtonRef = useRef(null);
  const messageColorMenuRef = useRef(null);

  useEffect(() => {
    setDraft(initialWallpaper);
    setSelectedFile(null);
    setLocalPreviewUrl('');
    setError('');
    setIsDraggingFile(false);
    setIsMessageColorMenuOpen(false);
    setIsCropOpen(false);
  }, [initialWallpaper]);

  useEffect(() => () => {
    if (localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
  }, [localPreviewUrl]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (isMessageColorMenuOpen) {
        setIsMessageColorMenuOpen(false);
        return;
      }
      if (isCropOpen) {
        setIsCropOpen(false);
        return;
      }
      if (!isApplying) onBack?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isApplying, isCropOpen, isMessageColorMenuOpen, onBack]);

  useEffect(() => {
    if (!isMessageColorMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (
        !messageColorButtonRef.current?.contains(event.target) &&
        !messageColorMenuRef.current?.contains(event.target)
      ) {
        setIsMessageColorMenuOpen(false);
      }
    };
    const closeMenu = () => setIsMessageColorMenuOpen(false);
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [isMessageColorMenuOpen]);

  const previewWallpaper = draft.type === 'image' && localPreviewUrl
    ? { ...draft, value: localPreviewUrl }
    : draft;

  const chooseWallpaperType = (type) => {
    setError('');
    setIsMessageColorMenuOpen(false);
    setIsCropOpen(false);
    if (type === 'color') {
      setSelectedFile(null);
      setLocalPreviewUrl('');
      setDraft((current) => normalizeChatWallpaper({
        ...current,
        type: 'color',
        value: current.type === 'color' ? current.value : '#FFFFFF',
      }));
      return;
    }

    setDraft((current) => ({
      ...current,
      type: 'image',
      value: current.type === 'image' ? current.value : '',
      doodle: false,
    }));
  };

  const selectWallpaperFile = async (file) => {
    setError('');
    if (!file) return;
    if (await isGifImageFile(file)) {
      setError('GIF files cannot be used as chat wallpaper. Choose a JPG, PNG, or WEBP image.');
      return;
    }
    if (!ACCEPTED_WALLPAPER_TYPES.has(file.type)) {
      setError('Choose a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > MAX_WALLPAPER_FILE_SIZE) {
      setError('Wallpaper images must be 10 MB or smaller.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setIsCropOpen(false);
    setSelectedFile(file);
    setLocalPreviewUrl(previewUrl);
    setDraft((current) => ({
      ...current,
      type: 'image',
      value: previewUrl,
      zoom: 1,
      positionX: 50,
      positionY: 50,
      doodle: false,
    }));
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    void selectWallpaperFile(file);
  };

  const handleFileDrop = (event) => {
    event.preventDefault();
    setIsDraggingFile(false);
    void selectWallpaperFile(event.dataTransfer.files?.[0]);
  };

  const removeSelectedImage = () => {
    setError('');
    setIsMessageColorMenuOpen(false);
    setIsCropOpen(false);
    setSelectedFile(null);
    setLocalPreviewUrl('');
    setDraft((current) => ({
      ...current,
      type: 'image',
      value: '',
      doodle: false,
    }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApply = async () => {
    if (draft.type === 'image' && !selectedFile && !draft.value) {
      setError('Choose an image before applying this wallpaper.');
      return;
    }
    if (selectedFile && await isGifImageFile(selectedFile)) {
      setError('GIF files cannot be used as chat wallpaper. Choose a JPG, PNG, or WEBP image.');
      return;
    }

    setIsApplying(true);
    setError('');
    try {
      await onApply?.({
        scope: 'global',
        wallpaper: normalizeChatWallpaper({
          ...draft,
          value: selectedFile ? '' : draft.value,
        }),
        file: selectedFile,
      });
      onBack?.();
    } catch (applyError) {
      setError(applyError?.message || 'Unable to apply the wallpaper. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  const hasSelectedImage = draft.type === 'image' && Boolean(localPreviewUrl || draft.value);
  const selectedMessageColor =
    MESSAGE_COLOR_OPTIONS.find((option) => option.value === draft.messageColor) ||
    MESSAGE_COLOR_OPTIONS[0];
  const previewStyle = createChatWallpaperStyle(
    hasSelectedImage ? { ...previewWallpaper, doodle: false } : previewWallpaper,
    { isDark: isDarkMode }
  );

  const toggleMessageColorMenu = () => {
    if (isMessageColorMenuOpen) {
      setIsMessageColorMenuOpen(false);
      return;
    }
    const bounds = messageColorButtonRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setMessageColorMenuPosition({
      top: bounds.bottom + 6,
      left: bounds.left,
      width: bounds.width,
    });
    setIsMessageColorMenuOpen(true);
  };

  const changeWallpaperZoom = (change) => {
    setDraft((current) => ({
      ...current,
      zoom: clampWallpaperZoom(current.zoom + change),
    }));
  };

  const changeWallpaperPosition = (axis, value) => {
    setDraft((current) => ({
      ...current,
      [axis]: clampWallpaperPosition(value),
    }));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isApplying) onBack?.();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-wallpaper-title"
        className="relative flex h-[730px] max-h-[calc(100vh-32px)] w-full max-w-[940px] flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-[66px] flex-shrink-0 items-center justify-between border-b border-[#E8ECF2] px-6">
          <h2 id="chat-wallpaper-title" className="text-[15px] font-semibold text-[#172033]">Chat Wallpaper</h2>
          <button
            type="button"
            onClick={() => onBack?.()}
            disabled={isApplying}
            aria-label="Close chat wallpaper"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#172033] disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
          <div className="chatterly-scrollbar flex min-h-[470px] flex-col overflow-y-auto border-b border-[#E8ECF2] px-6 py-5 md:min-h-0 md:border-b-0 md:border-r">
            <div>
              <p className="text-[13px] font-semibold text-[#172033]">Wallpaper Type</p>
              <p className="mt-1.5 text-[10px] leading-4 text-[#8A94A6]">
                Choose a solid color or image for the background of your chats.
              </p>
            </div>

            <div className="mt-3 flex items-center gap-6">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-medium text-[#172033]">
                <input
                  type="radio"
                  name="wallpaper-type"
                  checked={draft.type === 'color'}
                  onChange={() => chooseWallpaperType('color')}
                  className="h-3.5 w-3.5 accent-[#8B5CF6]"
                />
                Solid Color
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-medium text-[#64748B]">
                <input
                  type="radio"
                  name="wallpaper-type"
                  checked={draft.type === 'image'}
                  onChange={() => chooseWallpaperType('image')}
                  className="h-3.5 w-3.5 accent-[#8B5CF6]"
                />
                Image
              </label>
            </div>

            {draft.type === 'color' ? (
              <div className="mt-4 grid grid-cols-4 gap-2 pb-2" aria-label="Solid wallpaper colors">
                {WALLPAPER_COLORS.map((color) => {
                  const selected = draft.value.toUpperCase() === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Use ${color}`}
                      aria-pressed={selected}
                      onClick={() => {
                        setError('');
                        setDraft((current) => normalizeChatWallpaper({ ...current, type: 'color', value: color }));
                      }}
                      className={`relative h-[42px] rounded-[3px] border transition-transform hover:-translate-y-0.5 ${
                        selected
                          ? 'border-2 border-[#7C3AED] shadow-[0_0_0_1px_rgba(124,58,237,0.1)]'
                          : 'border-white/70'
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {selected ? (
                        <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-tl-[3px] bg-[#7C3AED] text-white">
                          <CheckIcon size={10} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : hasSelectedImage ? (
              <div className="mt-4">
                <div
                  className="relative aspect-[16/9] w-full overflow-hidden rounded-[9px] bg-[#111827]"
                  style={previewStyle}
                  aria-label="Selected wallpaper image preview"
                >
                  <div className="absolute bottom-2.5 left-2.5 flex h-9 items-center gap-2 rounded-[7px] bg-white px-2.5 shadow-[0_3px_12px_rgba(15,23,42,0.18)]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
                    </svg>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      step="1"
                      value={draft.transparency}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        transparency: Number(event.target.value),
                      }))}
                      aria-label="Wallpaper brightness"
                      className="h-1 w-[102px] cursor-pointer accent-[#8B5CF6]"
                    />
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="3.5" />
                      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
                    </svg>
                    <span className="h-5 w-px bg-[#E2E8F0]" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => setIsCropOpen((open) => !open)}
                      aria-label="Crop and reposition wallpaper"
                      aria-expanded={isCropOpen}
                      title="Crop image"
                      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition-colors ${
                        isCropOpen ? 'bg-[#F1E9FF] text-[#7C3AED]' : 'text-[#64748B] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h12a2 2 0 0 1 2 2v12" />
                      </svg>
                    </button>
                    <span className="h-5 w-px bg-[#E2E8F0]" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => changeWallpaperZoom(-WALLPAPER_ZOOM_STEP)}
                      disabled={draft.zoom <= 1}
                      aria-label="Zoom out wallpaper"
                      title="Zoom out"
                      className="flex h-6 w-6 items-center justify-center rounded text-[18px] leading-none text-[#64748B] hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      −
                    </button>
                    <span className="min-w-[34px] text-center text-[9px] font-semibold text-[#64748B]">
                      {Math.round(draft.zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => changeWallpaperZoom(WALLPAPER_ZOOM_STEP)}
                      disabled={draft.zoom >= 3}
                      aria-label="Zoom in wallpaper"
                      title="Zoom in"
                      className="flex h-6 w-6 items-center justify-center rounded text-[18px] leading-none text-[#64748B] hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      +
                    </button>
                  </div>

                  {isCropOpen ? (
                    <div className="absolute right-2.5 top-2.5 w-[210px] rounded-[8px] border border-[#E2E8F0] bg-white/95 p-3 text-[#475569] shadow-[0_8px_24px_rgba(15,23,42,0.18)] backdrop-blur-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold">Crop position</span>
                        <button
                          type="button"
                          onClick={() => setDraft((current) => ({ ...current, positionX: 50, positionY: 50 }))}
                          className="text-[9px] font-semibold text-[#7C3AED] hover:text-[#6D28D9]"
                        >
                          Center
                        </button>
                      </div>
                      <label className="mt-2 flex items-center gap-2 text-[9px] font-medium">
                        <span className="w-10">Left / right</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={draft.positionX}
                          onChange={(event) => changeWallpaperPosition('positionX', event.target.value)}
                          aria-label="Horizontal crop position"
                          className="h-1 min-w-0 flex-1 cursor-pointer accent-[#8B5CF6]"
                        />
                      </label>
                      <label className="mt-2 flex items-center gap-2 text-[9px] font-medium">
                        <span className="w-10">Up / down</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={draft.positionY}
                          onChange={(event) => changeWallpaperPosition('positionY', event.target.value)}
                          aria-label="Vertical crop position"
                          className="h-1 min-w-0 flex-1 cursor-pointer accent-[#8B5CF6]"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="relative">
                    <button
                      ref={messageColorButtonRef}
                      type="button"
                      onClick={toggleMessageColorMenu}
                      aria-haspopup="listbox"
                      aria-expanded={isMessageColorMenuOpen}
                      className={`flex h-9 min-w-[148px] items-center rounded-[6px] border bg-white pl-3 pr-2.5 text-[11px] font-medium text-[#475569] outline-none transition-colors ${
                        isMessageColorMenuOpen ? 'border-[#A78BFA]' : 'border-[#E1E6ED] hover:border-[#C4B5FD]'
                      }`}
                    >
                      <span className="mr-2.5 h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: selectedMessageColor.value }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-left">{selectedMessageColor.label}</span>
                      <svg className={`ml-2 flex-shrink-0 text-[#64748B] transition-transform ${isMessageColorMenuOpen ? 'rotate-180' : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m7 10 5 5 5-5" />
                    </svg>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={removeSelectedImage}
                    className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[#F5F7FA] px-4 text-[11px] font-medium text-[#475569] transition-colors hover:bg-[#EEF1F5]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 7h16M9 7V4h6v3M8 10v7M12 10v7M16 10v7M6 7l1 14h10l1-14" />
                    </svg>
                    Remove Image
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`mt-4 flex h-[252px] flex-shrink-0 flex-col items-center justify-center rounded-[9px] border px-5 text-center transition-colors ${
                  isDraggingFile
                    ? 'border-[#A78BFA] bg-[#F5F0FF]'
                    : 'border-transparent bg-[#F7F8FA]'
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                  setIsDraggingFile(true);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setIsDraggingFile(false);
                }}
                onDrop={handleFileDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <span className="flex h-[62px] w-[62px] items-center justify-center text-[#9AABC8]">
                  <svg width="58" height="58" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 42.5h-2.5a10.5 10.5 0 0 1-1.2-20.9A16 16 0 0 1 45.9 24 9.5 9.5 0 0 1 48 42.8h-3" />
                    <path d="M32 48V27" />
                    <path d="m24.5 34.5 7.5-7.5 7.5 7.5" />
                  </svg>
                </span>
                <p className="mt-1 text-[11px] font-medium text-[#667085]">Drag and Drop an Image here</p>
                <p className="mt-2 text-[10px] text-[#98A2B3]">or</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 inline-flex h-9 items-center gap-2 rounded-[6px] border border-[#CDBDFA] bg-[#F7F2FF] px-4 text-[11px] font-semibold text-[#7C3AED] shadow-[0_2px_5px_rgba(124,58,237,0.08)] transition-colors hover:bg-[#F1E9FF]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3.5 7.5h6l2-2h9v13h-17z" />
                  </svg>
                  {selectedFile || draft.value ? 'Choose Another Image' : 'Choose Image'}
                </button>
                <p className="mt-7 text-[10px] leading-4 text-[#7A8699]">PNG, JPEG or WEBP · Max Size 10MB</p>
              </div>
            )}

            {draft.type === 'color' ? (
              <label className="mt-auto flex cursor-pointer items-center gap-2 pt-4 text-[11px] font-medium text-[#475569]">
                <input
                  type="checkbox"
                  checked={draft.doodle}
                  onChange={(event) => setDraft((current) => ({ ...current, doodle: event.target.checked }))}
                  className="h-4 w-4 rounded accent-[#8B5CF6]"
                />
                Add Chatterly Doodle
              </label>
            ) : null}
          </div>

          <div className="relative min-h-[470px] overflow-hidden" style={previewStyle}>
            <span className="absolute left-1/2 top-4 -translate-x-1/2 rounded-[4px] border border-[#DDE3EB] bg-white/95 px-2.5 py-1.5 text-[9px] font-medium text-[#687386] shadow-sm">
              Wallpaper Preview
            </span>

            {draft.type !== 'image' || hasSelectedImage ? (
              <div className="absolute inset-x-4 bottom-6 text-[11px] text-[#475569]">
                <div className="flex items-end gap-2">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#4D827F,#B0DCCB)] text-[8px] font-bold text-white">L</span>
                  <div>
                    <p className="mb-1 text-[9px] font-semibold text-[#475569]">Livia</p>
                    <div className="rounded-[6px] rounded-bl-[2px] bg-white px-3 py-2 text-[#475569] shadow-[0_2px_7px_rgba(15,23,42,0.10)]">
                      Hi! It is a pleasure to meet you!
                    </div>
                    <p className="mt-1 text-[8px] text-[#6B7280]">10:10 AM</p>
                  </div>
                </div>

                <div className="mt-7 flex items-end justify-end gap-2">
                  <div className="text-right">
                    <p className="mb-1 text-[8px] font-medium text-[#475569]">You</p>
                    <div
                      className="rounded-[6px] rounded-br-[2px] px-3 py-2 text-white shadow-[0_3px_10px_rgba(15,23,42,0.24)]"
                      style={{ backgroundColor: selectedMessageColor.value }}
                    >
                      Hello, How are you?
                    </div>
                    <p className="mt-1 text-[8px] text-[#6B7280]">10:12 AM <span className="font-bold" style={{ color: selectedMessageColor.value }}>✓✓</span></p>
                  </div>
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#172033,#9AA5B5)] text-[8px] font-bold text-white">Y</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="flex h-[84px] flex-shrink-0 items-center justify-between border-t border-[#E8ECF2] bg-white px-6">
          <button
            type="button"
            onClick={() => onBack?.()}
            disabled={isApplying}
            className="h-10 min-w-[100px] rounded-[6px] border border-[#D8E0EA] bg-white px-5 text-[11px] font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying}
            className="h-10 min-w-[156px] rounded-[6px] bg-[#8B5CF6] px-5 text-[11px] font-semibold text-white shadow-[0_7px_18px_rgba(124,58,237,0.30)] transition-colors hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isApplying ? 'Applying…' : 'Apply Wallpaper'}
          </button>
        </footer>

        {error ? (
          <p role="alert" className="absolute bottom-[92px] left-1/2 z-10 -translate-x-1/2 rounded-[7px] bg-[#B91C1C] px-4 py-2 text-[11px] font-medium text-white shadow-lg">
            {error}
          </p>
        ) : null}
      </section>

      {isMessageColorMenuOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            ref={messageColorMenuRef}
            role="listbox"
            aria-label="Message color preset"
            className="fixed z-[140] overflow-hidden rounded-[6px] border border-[#E6EAF0] bg-white p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.18)]"
            style={{
              top: messageColorMenuPosition.top,
              left: messageColorMenuPosition.left,
              width: Math.max(messageColorMenuPosition.width, 148),
            }}
          >
            {MESSAGE_COLOR_OPTIONS.map((option) => {
              const isSelected = option.value === selectedMessageColor.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setDraft((current) => ({ ...current, messageColor: option.value }));
                    setIsMessageColorMenuOpen(false);
                  }}
                  className={`flex h-[31px] w-full items-center rounded-[4px] px-2 text-left text-[10px] font-medium text-[#475569] transition-colors hover:bg-[#F5F3FF] ${
                    isSelected ? 'bg-[#F7F4FF]' : ''
                  }`}
                >
                  <span className="mr-2.5 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: option.value }} aria-hidden="true" />
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )
        : null}
    </div>
  );
};

export default ChatWallpaperSettings;
