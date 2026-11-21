import React, { useEffect, useRef, useState } from 'react';
import { getNotificationSettings, updateNotificationSettings } from '../api/preferences';
import {
  getStoredGlobalNotificationsEnabled,
  NOTIFICATION_TONE_STORAGE_KEY,
  playNotificationSound,
  setStoredNotificationAlertPreferences,
  setStoredGlobalNotificationsEnabled,
} from '../utils/pushNotifications';
import {
  CALL_RINGTONE_ENABLED_STORAGE_KEY,
  CALL_RINGTONE_STORAGE_KEY,
  playCallTonePreview,
  saveCustomCallRingtone,
  stopCallTonePreview,
} from '../utils/callRingtone';
import { useLanguage } from '../hooks/useLanguage';

const DEFAULTS = {
  notifications: true,
  messageNotifications: true,
  groupNotifications: true,
  callNotifications: true,
  soundEnabled: true,
  notificationTone: 'Default',
  vibrationEnabled: true,
  popupPreview: true,
};

// Owned by pushNotifications.js, which reads it when a message arrives.
const TONE_KEY = NOTIFICATION_TONE_STORAGE_KEY;
const MESSAGE_UI_PREFERENCES_KEY = 'chatterly_message_notification_preferences';
const GROUP_UI_PREFERENCES_KEY = 'chatterly_group_notification_preferences';
const TONES = ['Default', 'Chime', 'Bell', 'Pop'];
const MAX_CUSTOM_RINGTONE_SIZE = 10 * 1024 * 1024;
const CUSTOM_RINGTONE_EXTENSION_PATTERN = /\.(aac|flac|m4a|mp3|ogg|opus|wav)$/i;

const MessageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 6.5h14v9H9l-4 3v-12Z" />
    <path d="M9 10h6M9 13h3" />
  </svg>
);

const GroupsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19" />
    <path d="M15 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4V19" />
  </svg>
);

const CallsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7.2 3.8 10 8.4 7.8 10a14.4 14.4 0 0 0 6.2 6.2l1.6-2.2 4.6 2.8-.7 3a2 2 0 0 1-2.2 1.5C9.8 20.4 3.6 14.2 2.7 6.7a2 2 0 0 1 1.5-2.2l3-.7Z" />
  </svg>
);

const PreviewIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 4h6v6" />
    <path d="m20 4-9 9" />
    <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
  </svg>
);

const VibrationIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="8" y="4" width="8" height="16" rx="2" />
    <path d="M4 9v6M20 9v6" />
  </svg>
);

const ManageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 5h5v5" />
    <path d="m19 5-8 8" />
    <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

const ToggleSvg = ({ checked }) => (
  <svg className="chatterly-notification-toggle" data-checked={checked ? 'true' : 'false'} width="44" height="24" viewBox="0 0 44 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect
      x="0.25"
      y="0.25"
      width="43.5"
      height="23.5"
      rx="11.75"
      fill={checked ? '#8B5CF6' : '#CBD5E1'}
    />
    <rect
      x="0.25"
      y="0.25"
      width="43.5"
      height="23.5"
      rx="11.75"
      stroke="#E2E8F0"
      strokeWidth="0.5"
    />
    <rect x={checked ? '22' : '2'} y="2" width="20" height="20" rx="10" fill="white" />
  </svg>
);

// The On/Off text beside each switch is the only state read-out some users get.
// Its colours live in index.css (.chatterly-toggle-state-pill) rather than in
// utility classes so the dark-mode overlay cannot flatten the pill and its label
// into the same colour.
const ToggleStatePill = ({ checked, children }) => (
  <span className="chatterly-toggle-state-pill" data-state={checked ? 'on' : 'off'}>
    {children ?? (checked ? 'On' : 'Off')}
  </span>
);

const Toggle = ({ checked, disabled, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onChange}
    className="h-6 w-11 flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]/40 disabled:cursor-wait disabled:opacity-60"
  >
    <ToggleSvg checked={checked} />
  </button>
);

const CompactToggle = ({ checked, disabled, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onChange}
    className="h-6 w-11 flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]/40 disabled:cursor-wait disabled:opacity-60"
  >
    <ToggleSvg checked={checked} />
  </button>
);

const NOTIFICATION_ROWS = [
  {
    key: 'messageNotifications',
    label: 'Messages',
    description: 'Manage notifications for new messages.',
    icon: <MessageIcon />,
  },
  {
    key: 'groupNotifications',
    label: 'Groups',
    description: 'Manage notifications for group messages and activity.',
    icon: <GroupsIcon />,
  },
  {
    key: 'callNotifications',
    label: 'Calls',
    description: 'Manage notifications for incoming calls.',
    icon: <CallsIcon />,
  },
];

const TonePreviewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />
  </svg>
);

const TonePreviewButton = ({ onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[7px] bg-[#F5F3FF] text-[#8B5CF6] transition-colors hover:bg-[#EDE7FF]"
    aria-label={label}
    title={label}
  >
    <TonePreviewIcon />
  </button>
);

export default function NotificationSettings() {
  const { language, t } = useLanguage();
  const [settings, setSettings] = useState(DEFAULTS);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const customRingtoneInputRef = useRef(null);
  const [callRingtone, setCallRingtone] = useState(() => {
    try {
      return localStorage.getItem(CALL_RINGTONE_STORAGE_KEY) || 'Default';
    } catch {
      return 'Default';
    }
  });
  const [callRingtoneEnabled, setCallRingtoneEnabled] = useState(() => {
    try {
      return localStorage.getItem(CALL_RINGTONE_ENABLED_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [messageUiPreferences, setMessageUiPreferences] = useState(() => {
    try {
      return {
        reactions: true,
        sentMessageSound: true,
        ...JSON.parse(localStorage.getItem(MESSAGE_UI_PREFERENCES_KEY) || '{}'),
      };
    } catch {
      return { reactions: true, sentMessageSound: true };
    }
  });
  const [groupUiPreferences, setGroupUiPreferences] = useState(() => {
    try {
      return {
        reactions: true,
        sentMessageSound: true,
        ...JSON.parse(localStorage.getItem(GROUP_UI_PREFERENCES_KEY) || '{}'),
      };
    } catch {
      return { reactions: true, sentMessageSound: true };
    }
  });

  useEffect(() => {
    let active = true;

    getNotificationSettings()
      .then((data) => {
        if (!active) return;
        const loadedSettings = { ...DEFAULTS, ...data };
        setSettings(loadedSettings);
        setStoredNotificationAlertPreferences(loadedSettings);
        localStorage.setItem(TONE_KEY, loadedSettings.notificationTone);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleGlobalNotificationsChanged = (event) => {
      const enabled = event?.detail?.enabled ?? getStoredGlobalNotificationsEnabled();
      setSettings((current) => ({ ...current, notifications: Boolean(enabled) }));
    };

    window.addEventListener('chatterly-global-notifications-changed', handleGlobalNotificationsChanged);
    return () => window.removeEventListener('chatterly-global-notifications-changed', handleGlobalNotificationsChanged);
  }, []);

  useEffect(() => {
    if (!activeCategory) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setActiveCategory(null);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      stopCallTonePreview();
    };
  }, [activeCategory]);

  useEffect(() => stopCallTonePreview, []);

  const changeSetting = async (key) => {
    if (pending) return;

    const previous = settings;
    const next = { ...settings, [key]: !settings[key] };
    const categoryKeys = ['messageNotifications', 'groupNotifications', 'callNotifications'];
    const payload = { [key]: next[key] };

    if (categoryKeys.includes(key)) {
      payload.notifications = categoryKeys.some((category) => next[category]);
    }

    setSettings(next);
    if (key === 'soundEnabled' || key === 'vibrationEnabled' || key === 'popupPreview') {
      setStoredNotificationAlertPreferences(next);
    }
    if (key === 'notifications' || categoryKeys.includes(key)) {
      setStoredGlobalNotificationsEnabled(next.notifications !== false);
    }
    setPending(key);
    setError('');

    try {
      const saved = await updateNotificationSettings(payload);
      setSettings((current) => ({ ...current, ...saved }));
      if (key === 'soundEnabled' || key === 'vibrationEnabled' || key === 'popupPreview') {
        setStoredNotificationAlertPreferences({ ...next, ...saved });
      }
      if (payload.notifications !== undefined) {
        setStoredGlobalNotificationsEnabled(saved.notifications !== false);
      }
    } catch (requestError) {
      setSettings(previous);
      if (key === 'soundEnabled' || key === 'vibrationEnabled' || key === 'popupPreview') {
        setStoredNotificationAlertPreferences(previous);
      }
      if (key === 'notifications' || categoryKeys.includes(key)) {
        setStoredGlobalNotificationsEnabled(previous.notifications !== false);
      }
      setError(requestError.message);
    } finally {
      setPending('');
    }
  };

  const chooseTone = async (nextTone) => {
    if (pending || settings.notificationTone === nextTone) return;

    // Preview first: the save round-trip below can fail or lag, and the user
    // needs to hear the tone they just selected, not the one that was stored.
    // This is the same call an arriving message makes, so the preview and the
    // real alert cannot drift apart.
    void playNotificationSound(nextTone);

    const previousTone = settings.notificationTone;
    setSettings((current) => ({ ...current, notificationTone: nextTone }));
    setPending('notificationTone');
    setError('');

    try {
      const saved = await updateNotificationSettings({ notificationTone: nextTone });
      const savedTone = saved.notificationTone || nextTone;
      setSettings((current) => ({ ...current, ...saved, notificationTone: savedTone }));
      localStorage.setItem(TONE_KEY, savedTone);
    } catch (requestError) {
      setSettings((current) => ({ ...current, notificationTone: previousTone }));
      setError(requestError.message);
    } finally {
      setPending('');
    }
  };

  const chooseCallRingtone = (nextRingtone) => {
    if (nextRingtone === 'ChooseCustom') {
      customRingtoneInputRef.current?.click();
      return;
    }
    setCallRingtone(nextRingtone);
    localStorage.setItem(CALL_RINGTONE_STORAGE_KEY, nextRingtone);
    void playCallTonePreview(nextRingtone);
  };

  const chooseCustomCallRingtoneFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const isSupportedAudioFile =
      String(file.type || '').toLowerCase().startsWith('audio/') ||
      CUSTOM_RINGTONE_EXTENSION_PATTERN.test(String(file.name || ''));
    if (!isSupportedAudioFile) {
      setError('Choose a supported audio file for the custom ringtone.');
      return;
    }
    if (file.size > MAX_CUSTOM_RINGTONE_SIZE) {
      setError('Custom ringtone files must be 10 MB or smaller.');
      return;
    }

    setPending('callRingtone');
    setError('');
    try {
      await saveCustomCallRingtone(file);
      setCallRingtone('Custom');
      localStorage.setItem(CALL_RINGTONE_STORAGE_KEY, 'Custom');
      void playCallTonePreview('Custom');
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save the custom ringtone.');
    } finally {
      setPending('');
    }
  };

  const toggleCallRingtone = () => {
    setCallRingtoneEnabled((current) => {
      const next = !current;
      localStorage.setItem(CALL_RINGTONE_ENABLED_STORAGE_KEY, String(next));
      return next;
    });
  };

  const toggleMessageUiPreference = (key) => {
    setMessageUiPreferences((current) => {
      const next = { ...current, [key]: !current[key] };
      localStorage.setItem(MESSAGE_UI_PREFERENCES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const toggleGroupUiPreference = (key) => {
    setGroupUiPreferences((current) => {
      const next = { ...current, [key]: !current[key] };
      localStorage.setItem(GROUP_UI_PREFERENCES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const isGroupCategory = activeCategory?.key === 'groupNotifications';
  const categoryUiPreferences = isGroupCategory ? groupUiPreferences : messageUiPreferences;
  const toggleCategoryUiPreference = isGroupCategory ? toggleGroupUiPreference : toggleMessageUiPreference;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="chatterly-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-6 lg:px-6">
        <div className="w-full">
          <h2 className="text-[15px] font-semibold leading-5 text-[#111827]">{t('Notification')}</h2>
          <p className="mt-1 max-w-[390px] text-[13px] font-normal leading-5 text-[#64748B]">
            {t("Choose how you're notified about messages,")}
            <br />
            {t('groups, and calls.')}
          </p>

          {error ? (
            <p role="alert" className="mt-3 max-w-[520px] rounded-[8px] bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <section className="mt-5 w-full" aria-label="Notification controls">
            {NOTIFICATION_ROWS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={settings[item.key]}
                aria-label={`${t('Notification')}: ${t(item.label)}`}
                onClick={() => setActiveCategory(item)}
                className="group flex min-h-[76px] w-full items-center gap-3 border-b border-[#E8EDF3] px-0 text-left transition-colors hover:bg-[#FAFBFD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8B5CF6]/30"
              >
                <span className="chatterly-notification-category-icon flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#F6F7FA] text-[#65758B]">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold leading-5 text-[#111827]">{t(item.label)}</span>
                  <span className="mt-1 block text-[12px] font-normal leading-[17px] text-[#64748B]">{t(item.description)}</span>
                </span>
                <span className="chatterly-notification-config-icon mr-1 flex h-8 w-8 flex-shrink-0 items-center justify-center text-[#8492A6] transition-colors group-hover:text-[#6D28D9]">
                  <ManageIcon />
                </span>
              </button>
            ))}

            <div className="flex min-h-[76px] w-full items-center gap-3 border-b border-[#E8EDF3]">
              <span className="chatterly-notification-category-icon flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#F6F7FA] text-[#65758B]">
                <PreviewIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-5 text-[#111827]">{t('Popup preview')}</span>
                <span className="mt-1 block text-[12px] font-normal leading-[17px] text-[#64748B]">
                  {t('Show popup preview for incoming notifications.')}
                </span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-3">
                <ToggleStatePill checked={settings.popupPreview}>
                  {language === 'Hindi' ? `पूर्वावलोकन ${t(settings.popupPreview ? 'On' : 'Off')}` : `Preview Turned ${settings.popupPreview ? 'On' : 'Off'}`}
                </ToggleStatePill>
                <Toggle
                  checked={settings.popupPreview}
                  disabled={Boolean(pending)}
                  onChange={() => changeSetting('popupPreview')}
                  label="Popup preview"
                />
              </span>
            </div>

            <div className="flex min-h-[76px] w-full items-center gap-3 border-b border-[#E8EDF3]">
              <span className="chatterly-notification-category-icon flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#F6F7FA] text-[#65758B]">
                <VibrationIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-5 text-[#111827]">{t('Vibration')}</span>
                <span className="mt-1 block text-[12px] font-normal leading-[17px] text-[#64748B]">
                  {t('Vibrate this device when a new notification arrives.')}
                </span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-3">
                <ToggleStatePill checked={settings.vibrationEnabled}>
                  {t('Vibration')} {t(settings.vibrationEnabled ? 'On' : 'Off')}
                </ToggleStatePill>
                <Toggle
                  checked={settings.vibrationEnabled}
                  disabled={Boolean(pending)}
                  onChange={() => changeSetting('vibrationEnabled')}
                  label="Notification vibration"
                />
              </span>
            </div>
          </section>
        </div>
      </div>
      {activeCategory ? (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-[#111827]/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notification-category-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveCategory(null);
          }}
        >
          {activeCategory.key === 'messageNotifications' || activeCategory.key === 'groupNotifications' ? (
            <div className="w-full max-w-[460px] overflow-hidden rounded-[14px] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.24)]">
              <div className="flex h-[58px] items-center justify-between border-b border-[#E7EBF0] px-5">
                <h3 id="notification-category-title" className="text-[14px] font-semibold leading-5 text-[#111827]">
                  {isGroupCategory ? 'Group Notifications' : 'Message Notifications'}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  aria-label={`Close ${isGroupCategory ? 'group' : 'message'} notifications`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] leading-none text-[#7C8798] transition-colors hover:bg-[#F3F5F8]"
                >
                  ×
                </button>
              </div>

              <div className="px-5">
                <div className="flex min-h-[72px] items-center gap-4 border-b border-[#E7EBF0]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-5 text-[#111827]">
                      {isGroupCategory ? 'Group Message Notifications' : 'New Messages'}
                    </span>
                    <span className="mt-1 block text-[12px] leading-[17px] text-[#64748B]">Get notified when you receive a new message.</span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-3">
                    <ToggleStatePill checked={settings[activeCategory.key]} />
                    <CompactToggle
                      checked={settings[activeCategory.key]}
                      disabled={Boolean(pending)}
                      onChange={() => changeSetting(activeCategory.key)}
                      label={isGroupCategory ? 'Group message notifications' : 'New message notifications'}
                    />
                  </span>
                </div>

                <div className="flex min-h-[72px] items-center gap-4 border-b border-[#E7EBF0]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-5 text-[#111827]">Reactions</span>
                    <span className="mt-1 block text-[12px] leading-[17px] text-[#64748B]">Get notified when someone reacts to your messages.</span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-3">
                    <ToggleStatePill checked={categoryUiPreferences.reactions} />
                    <CompactToggle
                      checked={categoryUiPreferences.reactions}
                      onChange={() => toggleCategoryUiPreference('reactions')}
                      label={`${isGroupCategory ? 'Group reaction' : 'Reaction'} notifications`}
                    />
                  </span>
                </div>

                <div className="flex min-h-[72px] items-center gap-4 border-b border-[#E7EBF0]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-5 text-[#111827]">
                      {isGroupCategory ? 'Group Message Sounds' : 'Message Sounds'}
                    </span>
                    <span className="mt-1 block text-[12px] leading-[17px] text-[#64748B]">Play a sound when you receive a new message.</span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-3">
                    <ToggleStatePill checked={settings.soundEnabled} />
                    <CompactToggle
                      checked={settings.soundEnabled}
                      disabled={Boolean(pending)}
                      onChange={() => changeSetting('soundEnabled')}
                      label="Message sounds"
                    />
                  </span>
                </div>

                <div className="flex min-h-[72px] items-center gap-4 border-b border-[#E7EBF0]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-5 text-[#111827]">Notification Sound</span>
                    <span className="mt-1 block text-[12px] leading-[17px] text-[#64748B]">
                      Choose the sound played for {isGroupCategory ? 'group' : 'new'} messages.
                    </span>
                  </span>
                  <select
                    value={settings.notificationTone}
                    disabled={Boolean(pending)}
                    onChange={(event) => chooseTone(event.target.value)}
                    aria-label="Notification sound"
                    className="h-9 min-w-[118px] rounded-[7px] border-0 bg-[#F5F6F8] px-3 text-[12px] font-medium text-[#334155] outline-none focus:ring-2 focus:ring-[#8B5CF6]/30 disabled:opacity-60"
                  >
                    {TONES.map((tone) => (
                      <option key={tone} value={tone}>{tone === 'Default' ? 'System Default' : tone}</option>
                    ))}
                  </select>
                  <TonePreviewButton
                    onClick={() => playNotificationSound(settings.notificationTone)}
                    label={`Play the ${settings.notificationTone} notification sound`}
                  />
                </div>

                <div className="flex min-h-[72px] items-center gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-5 text-[#111827]">Sent Message Sound</span>
                    <span className="mt-1 block text-[12px] leading-[17px] text-[#64748B]">Play a sound when you send a message.</span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-3">
                    <ToggleStatePill checked={categoryUiPreferences.sentMessageSound} />
                    <CompactToggle
                      checked={categoryUiPreferences.sentMessageSound}
                      onChange={() => toggleCategoryUiPreference('sentMessageSound')}
                      label={`${isGroupCategory ? 'Group sent' : 'Sent'} message sound`}
                    />
                  </span>
                </div>
              </div>

              <div className="flex min-h-[60px] items-start gap-2.5 bg-[#FAFBFC] px-5 py-4 text-[#64748B]">
                <svg className="mt-0.5 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
                </svg>
                <p className="text-[12px] leading-[17px]">
                  Browser or device settings may need to allow notifications for Chatterly to
                  <br className="hidden sm:block" /> notify you.
                </p>
              </div>
            </div>
          ) : activeCategory.key === 'callNotifications' ? (
            <div className="w-full max-w-[440px] overflow-hidden rounded-[14px] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.24)]">
              <div className="flex h-[58px] items-center justify-between border-b border-[#E7EBF0] px-5">
                <h3 id="notification-category-title" className="text-[14px] font-semibold leading-5 text-[#111827]">
                  Call Notifications
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  aria-label="Close call notifications"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] leading-none text-[#7C8798] transition-colors hover:bg-[#F3F5F8]"
                >
                  ×
                </button>
              </div>

              <div className="px-5">
                <div className="flex min-h-[72px] items-center gap-4 border-b border-[#E7EBF0]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-5 text-[#111827]">Incoming Call Notifications</span>
                    <span className="mt-1 block text-[12px] leading-[17px] text-[#64748B]">Get notified when you receive an incoming call.</span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-3">
                    <ToggleStatePill checked={settings.callNotifications} />
                    <CompactToggle
                      checked={settings.callNotifications}
                      disabled={Boolean(pending)}
                      onChange={() => changeSetting('callNotifications')}
                      label="Incoming call notifications"
                    />
                  </span>
                </div>

                <div className="flex min-h-[72px] items-center gap-4 border-b border-[#E7EBF0]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-5 text-[#111827]">Call Ringtones</span>
                    <span className="mt-1 block text-[12px] leading-[17px] text-[#64748B]">Play a ringtone when you receive an incoming call.</span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-3">
                    <ToggleStatePill checked={callRingtoneEnabled} />
                    <CompactToggle
                      checked={callRingtoneEnabled}
                      onChange={toggleCallRingtone}
                      label="Call ringtones"
                    />
                  </span>
                </div>

                <div className="flex min-h-[72px] items-center gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-5 text-[#111827]">Ringtone</span>
                    <span className="mt-1 block text-[12px] leading-[17px] text-[#64748B]">Choose the sound played for incoming calls.</span>
                  </span>
                  <select
                    value={callRingtone}
                    disabled={Boolean(pending)}
                    onChange={(event) => {
                      const nextRingtone = event.target.value;
                      if (nextRingtone === 'ChooseCustom') event.target.value = callRingtone;
                      chooseCallRingtone(nextRingtone);
                    }}
                    aria-label="Call ringtone"
                    className="h-9 min-w-[118px] rounded-[7px] border-0 bg-[#F5F6F8] px-3 text-[12px] font-medium text-[#334155] outline-none focus:ring-2 focus:ring-[#8B5CF6]/30 disabled:opacity-60"
                  >
                    {TONES.map((tone) => (
                      <option key={tone} value={tone}>{tone === 'Default' ? 'System Default' : tone}</option>
                    ))}
                    {callRingtone === 'Custom' ? <option value="Custom">Custom ringtone</option> : null}
                    <option value="ChooseCustom">Choose from device…</option>
                  </select>
                  <TonePreviewButton
                    onClick={() => playCallTonePreview(callRingtone)}
                    label={`Play the ${callRingtone === 'Custom' ? 'custom' : callRingtone} ringtone`}
                  />
                  <input
                    ref={customRingtoneInputRef}
                    type="file"
                    accept="audio/*,.aac,.flac,.m4a,.mp3,.ogg,.opus,.wav"
                    onChange={chooseCustomCallRingtoneFile}
                    className="sr-only"
                    aria-label="Choose custom call ringtone from device"
                  />
                </div>
              </div>

              <div className="flex min-h-[64px] items-start gap-2.5 bg-[#FAFBFC] px-5 py-4 text-[#64748B]">
                <svg className="mt-0.5 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
                </svg>
                <p className="text-[12px] leading-[17px]">
                  Browser or device settings may need to allow notifications and sound for
                  <br className="hidden sm:block" /> Chatterly to alert you about incoming calls.
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[410px] overflow-hidden rounded-[16px] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#E8EDF3] px-5 py-4">
                <span>
                  <h3 id="notification-category-title" className="text-[16px] font-semibold text-[#111827]">
                    {activeCategory.label} notifications
                  </h3>
                  <p className="mt-0.5 text-[13px] text-[#64748B]">Manage alerts and notification behavior.</p>
                </span>
                <button type="button" onClick={() => setActiveCategory(null)} aria-label="Close notification preferences" className="flex h-8 w-8 items-center justify-center rounded-full text-[22px] leading-none text-[#64748B] hover:bg-[#F1F5F9]">×</button>
              </div>
              <div className="divide-y divide-[#E8EDF3] px-5">
                <div className="flex min-h-[66px] items-center gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[#111827]">Allow notifications</span>
                    <span className="mt-0.5 block text-[13px] text-[#64748B]">{activeCategory.description}</span>
                  </span>
                  <Toggle checked={settings[activeCategory.key]} disabled={Boolean(pending)} onChange={() => changeSetting(activeCategory.key)} label={`${activeCategory.label} notifications`} />
                </div>
                <div className="flex min-h-[66px] items-center gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[#111827]">Vibration</span>
                    <span className="mt-0.5 block text-[13px] text-[#64748B]">Vibrate when a notification arrives.</span>
                  </span>
                  <Toggle checked={settings.vibrationEnabled} disabled={Boolean(pending)} onChange={() => changeSetting('vibrationEnabled')} label="Notification vibration" />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
