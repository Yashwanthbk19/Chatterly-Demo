import React from 'react';

const TYPE_LABELS = {
  image: 'photo',
  video: 'video',
  file: 'document',
};

const formatDownloadSize = (bytes = 0) => {
  const normalizedBytes = Number(bytes || 0);
  if (!normalizedBytes) return '';
  return `${(normalizedBytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ManualMediaDownloadPlaceholder = ({
  type = 'file',
  name = '',
  size = '',
  isSent = false,
  isDownloading = false,
  isFailed = false,
  loadedBytes = 0,
  totalBytes = 0,
  errorMessage = '',
  onDownload,
}) => {
  const label = TYPE_LABELS[type] || 'media';
  const title = name || `Tap to download ${label}`;
  const loadedLabel = formatDownloadSize(loadedBytes);
  const totalLabel = formatDownloadSize(totalBytes);
  const progressPercent = Number(totalBytes || 0) > 0
    ? Math.min(100, Math.max(0, Math.round((Number(loadedBytes || 0) / Number(totalBytes || 0)) * 100)))
    : 0;
  const progressLabel = loadedLabel && totalLabel
    ? `${loadedLabel} / ${totalLabel}`
    : totalLabel || size || 'Manual download';
  const helperText = isFailed
    ? errorMessage || 'Download failed. Tap to retry.'
    : isDownloading
      ? progressLabel
      : totalLabel || size || 'Manual download';
  const icon = type === 'video' ? (
    <path d="m9 8 7 4-7 4V8Z" />
  ) : type === 'image' ? (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m5 17 4.5-4.5 3.5 3.5 2-2 4 4" />
    </>
  ) : (
    <>
      <path d="M14 3.75H8.75A1.75 1.75 0 0 0 7 5.5v13A1.75 1.75 0 0 0 8.75 20.25h6.5A1.75 1.75 0 0 0 17 18.5V6.75L14 3.75Z" />
      <path d="M14 3.75v3h3" />
    </>
  );

  return (
    <button
      type="button"
      onClick={onDownload}
      disabled={isDownloading}
      data-disable-message-long-press="true"
      className={`flex min-h-[168px] w-[min(280px,72vw)] flex-col items-center justify-center rounded-[18px] border border-dashed px-5 py-6 text-center transition-colors ${
        isSent
          ? 'border-white/35 bg-white/12 text-white hover:bg-white/18'
          : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#334155] hover:bg-[#F1F5F9]'
      } disabled:cursor-wait disabled:opacity-75`}
      aria-label={isFailed ? `Retry ${label} download` : isDownloading ? `Downloading ${label}` : `Download ${label}`}
    >
      <span className={`flex h-12 w-12 items-center justify-center rounded-full ${isSent ? 'bg-white/18' : 'bg-white shadow-sm'}`}>
        {isDownloading ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.24" />
            <path d="M20 12a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {icon}
          </svg>
        )}
      </span>
      <span className="mt-3 max-w-full truncate text-[14px] font-semibold">
        {isFailed ? `Retry ${label} download` : isDownloading ? `Downloading ${label}...` : title}
      </span>
      <span className={`mt-1 text-[12px] font-medium ${isSent ? 'text-white/72' : 'text-[#64748B]'}`}>
        {helperText}
      </span>
      {isDownloading ? (
        <span className={`mt-4 block h-1.5 w-full max-w-[190px] overflow-hidden rounded-full ${isSent ? 'bg-white/20' : 'bg-[#E2E8F0]'}`} aria-hidden="true">
          <span
            className={`block h-full rounded-full transition-[width] duration-200 ${isSent ? 'bg-white' : 'bg-[#8B5CF6]'}`}
            style={{ width: `${progressPercent || 8}%` }}
          />
        </span>
      ) : null}
    </button>
  );
};

export default React.memo(ManualMediaDownloadPlaceholder);
