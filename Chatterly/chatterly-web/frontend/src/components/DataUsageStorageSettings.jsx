import { useEffect, useRef, useState } from 'react';
import {
  readAutoDownloadMediaPreferences,
  saveAutoDownloadMediaPreferences,
} from '../utils/autoDownloadPreferences';
import { useLanguage } from '../hooks/useLanguage';

const UPLOAD_QUALITY_KEY = 'chatterly_media_upload_quality';

const QUALITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium (Default)' },
  { value: 'low', label: 'Low' },
];

const MEDIA_AUTO_DOWNLOAD_ROWS = [
  {
    key: 'photos',
    label: 'Photos',
    description: 'Automatically download photos you receive.',
  },
  {
    key: 'videos',
    label: 'Videos',
    description: 'Automatically download videos you receive.',
  },
  {
    key: 'audio',
    label: 'Audio',
    description: 'Automatically download audio files you receive.',
  },
  {
    key: 'documents',
    label: 'Documents',
    description: 'Automatically download documents you receive.',
  },
];

const DEFAULT_MEDIA_AUTO_DOWNLOAD = {
  photos: true,
  videos: false,
  audio: true,
  documents: false,
};

const getStoredQuality = () => {
  if (typeof localStorage === 'undefined') return 'medium';

  const storedValue = localStorage.getItem(UPLOAD_QUALITY_KEY);
  return QUALITY_OPTIONS.some((option) => option.value === storedValue) ? storedValue : 'medium';
};

const getQualityLabel = (quality) =>
  QUALITY_OPTIONS.find((option) => option.value === quality)?.label || 'Medium (Default)';

const readMediaAutoDownloadSettings = () => {
  const preferences = readAutoDownloadMediaPreferences();
  const wifiPreferences = preferences?.wifi || {};
  const mobilePreferences = preferences?.mobileData || {};

  return MEDIA_AUTO_DOWNLOAD_ROWS.reduce((settings, row) => {
    const wifiValue = wifiPreferences[row.key];
    const mobileValue = mobilePreferences[row.key];
    return {
      ...settings,
      [row.key]:
        typeof wifiValue === 'boolean'
          ? wifiValue
          : typeof mobileValue === 'boolean'
            ? mobileValue
            : DEFAULT_MEDIA_AUTO_DOWNLOAD[row.key],
    };
  }, {});
};

const persistMediaAutoDownloadSettings = (settings) =>
  saveAutoDownloadMediaPreferences({
    mobileData: {
      photos: Boolean(settings.photos),
      videos: Boolean(settings.videos),
      audio: Boolean(settings.audio),
      documents: Boolean(settings.documents),
    },
    wifi: {
      photos: Boolean(settings.photos),
      videos: Boolean(settings.videos),
      audio: Boolean(settings.audio),
      documents: Boolean(settings.documents),
    },
    roaming: { allMedia: false },
  });

const UploadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
);

const OpenIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 5h5v5" />
    <path d="m19 5-8 8" />
    <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const InfoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </svg>
);

const StorageIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
    <path d="M4.5 5.5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
    <path d="M4.5 11.5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
  </svg>
);

const TrashIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

const formatStorageBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (value <= 0) return '0 KB';
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value)} B`;
};

const estimateCacheStorageBytes = async () => {
  if (typeof caches === 'undefined') return 0;

  try {
    const cacheKeys = await caches.keys();
    let total = 0;
    for (const cacheKey of cacheKeys) {
      const cache = await caches.open(cacheKey);
      const requests = await cache.keys();
      const responses = await Promise.all(requests.map((request) => cache.match(request)));
      const responseSizes = await Promise.all(responses.map(async (response) => {
        if (!response) return 0;
        const contentLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength >= 0) return contentLength;
        try {
          return (await response.clone().blob()).size;
        } catch {
          return 0;
        }
      }));
      total += responseSizes.reduce((sum, size) => sum + size, 0);
    }
    return total;
  } catch {
    return 0;
  }
};

const readStorageEstimate = async () => {
  const usage = await estimateCacheStorageBytes();
  let quota = 0;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      quota = Number(estimate?.quota || 0);
    } catch {
      // Cache usage is still exact even when the browser hides its quota.
    }
  }
  return { usage, quota };
};

const clearCachedAppData = async () => {
  // Clears browser-managed caches (Service Worker / Cache Storage) without
  // touching the user's session, settings, or saved conversations.
  if (typeof caches !== 'undefined') {
    try {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
    } catch {
      // Ignore environments where the Cache Storage API is unavailable.
    }
  }
};

const MediaSettingsRow = ({ icon, title, description, children }) => (
  <div className="flex min-h-[96px] w-full items-center gap-4 border-b border-[#EEF1F5] last:border-b-0">
    <span className="flex h-[54px] w-[54px] flex-shrink-0 items-center justify-center rounded-[12px] bg-[#F7F8FA] text-[#64748B]">
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-semibold leading-5 text-[#111827]">{title}</span>
      <span className="mt-1 block text-[12px] font-normal leading-5 text-[#667085]">{description}</span>
    </span>
    <span className="flex flex-shrink-0 items-center">{children}</span>
  </div>
);

const MediaToggle = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border border-[#E2E8F0] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]/35 ${
      checked ? 'bg-[#8B5CF6]' : 'bg-[#CBD5E1]'
    }`}
  >
    <span
      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.24)] transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

const MediaUploadQualityDropdown = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="flex h-12 min-w-[192px] items-center justify-between gap-4 rounded-[10px] bg-[#F7F8FA] px-4 text-left text-[16px] font-normal leading-6 text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:bg-[#F1F4F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]/30"
      >
        <span className="block min-h-6 truncate leading-6">{getQualityLabel(value)}</span>
        <span className="text-[#53657F]">
          <ChevronDownIcon />
        </span>
      </button>

      {isOpen ? (
        <div
          role="listbox"
          aria-label="Media upload quality"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-[192px] overflow-hidden rounded-[10px] bg-[#F7F8FA] shadow-[0_18px_42px_rgba(15,23,42,0.12)]"
        >
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className="flex h-12 w-full items-center bg-[#F7F8FA] px-4 text-left text-[16px] font-normal leading-6 text-[#111827] transition-colors hover:bg-[#EEF1F5]"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const MediaAutoDownloadDialog = ({ settings, onToggle, onClose = () => {} }) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[#111827]/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-auto-download-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[460px] overflow-hidden rounded-[14px] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.25)]">
        <div className="flex h-[66px] items-center justify-between px-6">
          <h3 id="media-auto-download-title" className="text-[15px] font-semibold leading-5 text-[#111827]">
            Media Auto-Download
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close media auto-download settings"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] leading-none text-[#667085] transition-colors hover:bg-[#F3F5F8]"
          >
            x
          </button>
        </div>

        <div className="px-6">
          {MEDIA_AUTO_DOWNLOAD_ROWS.map((row) => {
            const isChecked = Boolean(settings[row.key]);
            return (
              <div key={row.key} className="flex min-h-[76px] items-center gap-4 border-b border-[#EEF1F5] last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold leading-5 text-[#111827]">{row.label}</span>
                  <span className="mt-1 block text-[12px] font-normal leading-[17px] text-[#667085]">{row.description}</span>
                </span>
                <span className="flex w-[124px] flex-shrink-0 items-center justify-end gap-4">
                  <span
                    className="chatterly-toggle-state-pill flex-shrink-0"
                    data-state={isChecked ? 'on' : 'off'}
                  >
                    {isChecked ? 'On' : 'Off'}
                  </span>
                  <MediaToggle
                    checked={isChecked}
                    onChange={() => onToggle(row.key)}
                    label={`${row.label} auto-download`}
                  />
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex min-h-[64px] items-start gap-3 bg-[#FAFBFC] px-6 py-4 text-[#526173]">
          <span className="mt-0.5 flex-shrink-0">
            <InfoIcon />
          </span>
          <p className="text-[13px] font-normal leading-5">
            Automatically downloaded media may use additional data and device storage.
          </p>
        </div>
      </div>
    </div>
  );
};

export function AutoDownloadMediaSettings({ onBack }) {
  const [settings, setSettings] = useState(() => readMediaAutoDownloadSettings());

  const toggleAutoDownload = (key) => {
    setSettings((currentSettings) => {
      const nextSettings = { ...currentSettings, [key]: !currentSettings[key] };
      persistMediaAutoDownloadSettings(nextSettings);
      return nextSettings;
    });
  };

  return (
    <MediaAutoDownloadDialog
      settings={settings}
      onToggle={toggleAutoDownload}
      onClose={onBack}
    />
  );
}

export default function DataUsageStorageSettings() {
  const { t } = useLanguage();
  const [uploadQuality, setUploadQuality] = useState(getStoredQuality);
  const [autoDownloadSettings, setAutoDownloadSettings] = useState(() => readMediaAutoDownloadSettings());
  const [isAutoDownloadOpen, setIsAutoDownloadOpen] = useState(false);
  const [storageUsage, setStorageUsage] = useState(null);
  const [isMeasuringStorage, setIsMeasuringStorage] = useState(true);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  const refreshStorageEstimate = async () => {
    setIsMeasuringStorage(true);
    const estimate = await readStorageEstimate();
    setStorageUsage(estimate);
    setIsMeasuringStorage(false);
    return estimate;
  };

  useEffect(() => {
    let active = true;
    readStorageEstimate().then((estimate) => {
      if (!active) return;
      setStorageUsage(estimate);
      setIsMeasuringStorage(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleClearCache = async () => {
    if (isClearingCache) return;
    setIsClearingCache(true);
    setCacheCleared(false);
    try {
      await clearCachedAppData();
      await refreshStorageEstimate();
      setCacheCleared(true);
      window.setTimeout(() => setCacheCleared(false), 2600);
    } finally {
      setIsClearingCache(false);
    }
  };

  const usedStorageLabel = isMeasuringStorage
    ? 'Calculating…'
    : formatStorageBytes(storageUsage?.usage);
  const storagePercent =
    storageUsage?.quota > 0
      ? Math.min(100, Math.max(2, Math.round((storageUsage.usage / storageUsage.quota) * 100)))
      : 0;

  const chooseUploadQuality = (quality) => {
    setUploadQuality(quality);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(UPLOAD_QUALITY_KEY, quality);
    }
  };

  const toggleAutoDownload = (key) => {
    setAutoDownloadSettings((currentSettings) => {
      const nextSettings = { ...currentSettings, [key]: !currentSettings[key] };
      persistMediaAutoDownloadSettings(nextSettings);
      return nextSettings;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="chatterly-scrollbar min-h-0 flex-1 overflow-y-auto px-7 pb-8 pt-7 lg:px-7">
        <div className="w-full">
          <h2 className="text-[18px] font-semibold leading-6 text-[#111827]">{t('Media & Links')}</h2>
          <p className="mt-1.5 max-w-[460px] text-[12px] font-normal leading-5 text-[#667085]">
            {t('Manage how media is downloaded, uploaded, and stored in Chatterly.')}
          </p>

          <section className="mt-11 w-full" aria-label="Media and links settings">
            <MediaSettingsRow
              icon={<UploadIcon />}
              title={t('Media Upload quality')}
              description={t('Choose the quality of photos and videos when sending them.')}
            >
              <MediaUploadQualityDropdown value={uploadQuality} onChange={chooseUploadQuality} />
            </MediaSettingsRow>

            <MediaSettingsRow
              icon={<DownloadIcon />}
              title={t('Media Auto-download')}
              description={t('Control when photos, videos, and other media download automatically.')}
            >
              <button
                type="button"
                onClick={() => setIsAutoDownloadOpen(true)}
                aria-label="Open media auto-download settings"
                className="mr-1 flex h-10 w-10 items-center justify-center text-[#8492A6] transition-colors hover:text-[#6D28D9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]/30"
              >
                <OpenIcon />
              </button>
            </MediaSettingsRow>

            <MediaSettingsRow
              icon={<StorageIcon />}
              title={t('Storage Used')}
              description={t('See how much space Chatterly is using on this device.')}
            >
              <div className="flex w-[192px] flex-col items-end gap-2">
                <span className="text-[16px] font-semibold leading-6 text-[#111827]">{usedStorageLabel}</span>
                {storagePercent > 0 ? (
                  <span className="h-1.5 w-full overflow-hidden rounded-full bg-[#EDF1F5]" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-[#8B5CF6] transition-[width] duration-500"
                      style={{ width: `${storagePercent}%` }}
                    />
                  </span>
                ) : null}
                {storageUsage?.quota > 0 ? (
                  <span className="text-[12px] font-normal leading-4 text-[#667085]">
                    of {formatStorageBytes(storageUsage.quota)} available
                  </span>
                ) : null}
              </div>
            </MediaSettingsRow>

            <MediaSettingsRow
              icon={<TrashIcon />}
              title={t('Clear Cache')}
              description={t('Free up space by clearing temporary cached files. Your chats and settings stay safe.')}
            >
              <button
                type="button"
                onClick={handleClearCache}
                disabled={isClearingCache}
                aria-label="Clear cache"
                className={`flex h-12 min-w-[132px] items-center justify-center gap-2 rounded-[10px] px-4 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]/30 ${
                  cacheCleared
                    ? 'bg-[#E9F9F0] text-[#158A5B]'
                    : 'bg-[#F7F8FA] text-[#6D28D9] hover:bg-[#F1E9FF] disabled:opacity-60'
                }`}
              >
                {t(isClearingCache ? 'Clearing…' : cacheCleared ? 'Cleared' : 'Clear Cache')}
              </button>
            </MediaSettingsRow>
          </section>
        </div>
      </div>

      {isAutoDownloadOpen ? (
        <MediaAutoDownloadDialog
          settings={autoDownloadSettings}
          onToggle={toggleAutoDownload}
          onClose={() => setIsAutoDownloadOpen(false)}
        />
      ) : null}
    </div>
  );
}
