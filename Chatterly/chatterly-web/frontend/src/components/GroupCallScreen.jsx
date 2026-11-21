import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mainLogo from '../assets/logo.png';
import groupCallBackgroundBlur from '../assets/group-call-background-blur.svg';
import groupCallBackgroundOffice from '../assets/group-call-background-office.svg';
import groupCallBackgroundHome from '../assets/group-call-background-home.svg';
import groupCallBackgroundForest from '../assets/group-call-background-forest.svg';
import groupCallControlUnmute from '../assets/group-call-control-unmute.svg';
import groupCallControlSpeaker from '../assets/group-call-control-speaker.svg';
import groupCallControlScreenShare from '../assets/group-call-control-screen-share.svg';
import groupCallControlParticipants from '../assets/group-call-control-participants.svg';
import groupCallControlSettings from '../assets/group-call-control-settings.svg';
import socketService from '../utils/socketService';
import {
  GROUP_CALL_PARTICIPANT_STATUS,
  addGroupCallParticipants,
  createGroupCallState,
  formatGroupCallDuration,
  getConnectedParticipants,
  getGroupCallGridColumns,
  getParticipantStatusLabel,
  getSpotlightParticipantId,
  isResolvedParticipantStatus,
  isRingingParticipantStatus,
  pinParticipant,
  removeGroupCallParticipant,
  setParticipantStatus,
  toggleMeetingLocked,
  toggleParticipantCamera,
  toggleParticipantMuted,
} from '../utils/groupCallModel';

// Story 2 - Group Conferencing. A self-contained group video call screen that
// renders the approved Figma design: an auto-adjusting participant grid with
// active-speaker/pin highlighting, a call control bar, the Participants panel
// (with host mute/remove controls and per-participant ring status) and the Add
// Participants picker. In-call presentation state is driven by the pure model
// in utils/groupCallModel.js, while the current user's camera and microphone
// are backed by a real browser MediaStream.

// How long a freshly-invited participant "rings" before auto-joining the grid,
// so adding a participant mid-call demonstrably fills a tile.
const RING_TO_CONNECT_MS = 2600;
const GROUP_CALL_OFFER_RETRY_DELAY_MS = 700;
const GROUP_CALL_MAX_OFFER_RETRIES = 3;
const GROUP_CALL_RTC_CONFIGURATION = Object.freeze({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
});

// --- Icons -------------------------------------------------------------------

const CloseIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const CameraIcon = ({ size = 16, off = false }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="6" width="13" height="12" rx="2.5" />
    <path d="M16 10l5-3v10l-5-3z" />
    {off ? <path d="M4 3l16 18" strokeWidth="1.9" /> : null}
  </svg>
);
const LockIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);
const ExpandIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M4.88235 12.0588V6.76471C4.88235 6.29668 5.06828 5.84782 5.39922 5.51687C5.73017 5.18592 6.17903 5 6.64706 5H17.2353C17.7033 5 18.1522 5.18592 18.4831 5.51687C18.8141 5.84782 19 6.29668 19 6.76471V17.3529C19 17.821 18.8141 18.2698 18.4831 18.6008C18.1522 18.9317 17.7033 19.1176 17.2353 19.1176H11.9412M11.0588 9.41176V12.9412H14.5882M11.0588 12.9412L15.4706 8.52941M4 16.4706C4 16.2366 4.09296 16.0121 4.25844 15.8467C4.42391 15.6812 4.64834 15.5882 4.88235 15.5882H7.52941C7.76343 15.5882 7.98786 15.6812 8.15333 15.8467C8.3188 16.0121 8.41176 16.2366 8.41176 16.4706V19.1176C8.41176 19.3517 8.3188 19.5761 8.15333 19.7416C7.98786 19.907 7.76343 20 7.52941 20H4.88235C4.64834 20 4.42391 19.907 4.25844 19.7416C4.09296 19.5761 4 19.3517 4 19.1176V16.4706Z" stroke="#0B1220" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const PersonAddIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3.4" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M18 8v6M21 11h-6" />
  </svg>
);
const MicIcon = ({ size = 22, muted = false }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    {muted ? <path d="M4 3l16 18" stroke="currentColor" strokeWidth="1.9" /> : null}
  </svg>
);
const SpeakerIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>
);
const HoldIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="7" y="5.5" width="3.6" height="13" rx="1.3" />
    <rect x="13.4" y="5.5" width="3.6" height="13" rx="1.3" />
  </svg>
);
const ScreenShareIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="12" rx="2.2" />
    <path d="M8 20h8M12 16.5V20" />
    <path d="M12 8v5M9.5 10.5 12 8l2.5 2.5" />
  </svg>
);
const ParticipantsIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 6M17.5 19a5.5 5.5 0 0 0-3-4.9" />
  </svg>
);
const ChatIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="13" rx="3" />
    <path d="M8 10h8M8 13.5h5" />
  </svg>
);
const SettingsIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1A2 2 0 1 1 4 16.9l.1-.1a1.6 1.6 0 0 0-1.1-2.7 2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1A2 2 0 1 1 7.3 4l.1.1a1.6 1.6 0 0 0 1.8.3H9.3a1.6 1.6 0 0 0 1-1.5 2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1A2 2 0 1 1 20 7.1l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1 2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </svg>
);
const EndCallButtonIcon = () => (
  <svg width="80" height="48" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="80" height="48" rx="6" fill="#FF383C"/>
    <path d="M46.2546 26.9375L48.529 24.8917C48.8306 24.6204 49 24.2524 49 23.8687C49 23.4851 48.8306 23.1171 48.529 22.8458C46.1762 20.972 43.1424 19.9375 40 19.9375C36.8576 19.9375 33.8238 20.972 31.471 22.8458C31.1694 23.1171 31 23.4851 31 23.8687C31 24.2524 31.1694 24.6204 31.471 24.8917L33.7454 26.9375L37.7256 25.4031L37.157 23.3573C39.0007 22.7944 40.9993 22.7944 42.843 23.3573L42.2744 25.4031L46.2546 26.9375Z" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const SearchIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
);
const PlayTriangleIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M4 3.25 8.5 6 4 8.75V3.25Z" fill="currentColor" />
  </svg>
);
const NoneBackgroundIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="7" cy="7" r="5.25" />
    <path d="M3.3 10.7 10.7 3.3" />
  </svg>
);
const ChevronDownIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const BackIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
const CheckIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);
const SignalBarsIcon = ({ size = 12, level = 4 }) => {
  const activeBars = Math.max(0, Math.min(4, level));
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {[4, 7, 10, 13].map((height, index) => (
        <rect
          key={height}
          x={1 + index * 4}
          y={15 - height}
          width="2.4"
          height={height}
          rx="1"
          fill={index < activeBars ? 'currentColor' : '#CBD5E1'}
        />
      ))}
    </svg>
  );
};
const MoreVerticalIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="12" cy="19" r="1.7" />
  </svg>
);
const PersonSilhouetteIcon = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0z" />
  </svg>
);

// --- Small helpers -----------------------------------------------------------

const getInitials = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const normalizeContactId = (contact = {}) =>
  String(contact?.id || contact?._id || contact?.userId || contact?.memberId || '').trim();

const CALL_SETTINGS_TABS = [
  { key: 'audio-video', label: 'Audio & Video' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'advanced', label: 'Advanced' },
];

const CALL_SETTINGS_DEVICE_OPTIONS = {
  microphones: [
    'Default - Windows HID Interface',
    'Built-in Microphone (Realtek Audio)',
    'USB Conference Mic',
  ],
  speakers: [
    'Default - SoundBlaster X4 SPDIF Interface',
    'Laptop Speakers (Realtek Audio)',
    'Bluetooth Headset Stereo',
  ],
  cameras: [
    'Built-in Camera (ASUS X Prime QF edition)',
    'USB HD Webcam',
    'Virtual Camera',
  ],
};

const CALL_VIDEO_BACKGROUNDS = [
  { key: 'none', label: 'None', swatch: 'bg-[#F4EFFF]', accent: 'text-[#8B5CF6]' },
  {
    key: 'blur',
    label: 'Blur',
    imageUrl: groupCallBackgroundBlur,
    sceneStyle: {
      backgroundImage: `url("${groupCallBackgroundBlur}")`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'cover',
    },
  },
  {
    key: 'office',
    label: 'Office',
    imageUrl: groupCallBackgroundOffice,
    sceneStyle: {
      backgroundImage: `url("${groupCallBackgroundOffice}")`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'cover',
    },
  },
  {
    key: 'home',
    label: 'Home',
    imageUrl: groupCallBackgroundHome,
    sceneStyle: {
      backgroundImage: `url("${groupCallBackgroundHome}")`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'cover',
    },
  },
  {
    key: 'forest',
    label: 'Forest',
    imageUrl: groupCallBackgroundForest,
    sceneStyle: {
      backgroundImage: `url("${groupCallBackgroundForest}")`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'cover',
    },
  },
];


const CALL_ADVANCED_VIDEO_RESOLUTION_OPTIONS = [
  'Auto',
  '360p',
  '480p (SD)',
  '720p (HD)',
  '1080p (FHD)',
];
const DEFAULT_ADVANCED_VIDEO_RESOLUTION = '720p (HD)';
const getVideoBackgroundOption = (key = 'none') =>
  CALL_VIDEO_BACKGROUNDS.find((background) => background.key === key) || CALL_VIDEO_BACKGROUNDS[0];

const getCompactResolutionLabel = (value = 'Auto') => String(value).split(' ')[0];

const getNetworkQualityLevel = (resolution, adaptiveBitrate, networkLowBandwidthMode) => {
  if (networkLowBandwidthMode) return adaptiveBitrate ? 1 : 2;
  const compactResolution = getCompactResolutionLabel(resolution);
  if (compactResolution === '1080p') return 4;
  if (compactResolution === '720p') return 3;
  if (compactResolution === '480p') return 2;
  if (compactResolution === '360p') return 1;
  return adaptiveBitrate ? 3 : 2;
};

const isParticipantVerified = (participant) => participant?.isVerified !== false;

// Round avatar that falls back to gradient initials when there is no picture.
const Avatar = ({ name, src, defaultAvatar, size = 44, className = '' }) => {
  const hasImage = Boolean(src) && src !== defaultAvatar;
  return (
    <div
      className={`relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ height: size, width: size }}
    >
      {hasImage ? (
        <img
          src={src}
          alt={name}
          onError={(event) => {
            if (defaultAvatar) event.currentTarget.src = defaultAvatar;
          }}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#8B5CF6_0%,#7C3AED_100%)] font-semibold uppercase text-white"
          style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}
        >
          {getInitials(name)}
        </span>
      )}
    </div>
  );
};

const RolePill = ({ role, isOrganizer }) => {
  if (isOrganizer) {
    return (
      <span className="rounded-full bg-[#F1EBFE] px-2 py-[2px] text-[10px] font-semibold text-[#7C3AED]">
        Organizer
      </span>
    );
  }
  if (role === 'admin') {
    return (
      <span className="rounded-full bg-[#EEF2FF] px-2 py-[2px] text-[10px] font-semibold text-[#4F46E5]">
        Admin
      </span>
    );
  }
  if (role === 'moderator') {
    return (
      <span className="rounded-full bg-[#ECFDF5] px-2 py-[2px] text-[10px] font-semibold text-[#047857]">
        Moderator
      </span>
    );
  }
  return null;
};

// --- Participant grid tile ---------------------------------------------------

const ParticipantTile = ({
  participant,
  defaultAvatar,
  isSpotlighted,
  isPinned,
  onToggleMenu,
  menuOpen,
  onPin,
  onToggleMute,
  onToggleCamera,
  onRemove,
  canManage,
  showParticipantNames = true,
  showNetworkQuality = true,
  highContrastMode = true,
  showReactions = false,
  showVerification = true,
  isMirrorVideo = true,
  videoBackground = 'none',
  connectionQualityLevel = 4,
  defaultView = 'Grid View',
  localMediaStream = null,
  remoteMediaStream = null,
  isOnHold = false,
  hideMenu = false,
}) => {
  const videoRef = useRef(null);
  const hasPhoto = Boolean(participant.profilePic) && participant.profilePic !== defaultAvatar;
  const participantVerified = isParticipantVerified(participant);
  const backgroundOption = getVideoBackgroundOption(videoBackground);
  const shouldShowVideoBackground = participant.isCurrentUser && videoBackground !== 'none';
  const shouldShowLocalVideo = Boolean(
    participant.isCurrentUser && participant.isCameraOn && !isOnHold &&
    localMediaStream?.getVideoTracks?.().some((track) => track.readyState === 'live')
  );
  const shouldShowRemoteVideo = Boolean(
    !participant.isCurrentUser && participant.isCameraOn &&
    remoteMediaStream?.getVideoTracks?.().some((track) =>
      track.readyState === 'live' && track.enabled && !track.muted
    )
  );
  const visibleMediaStream = shouldShowLocalVideo
    ? localMediaStream
    : shouldShowRemoteVideo
      ? remoteMediaStream
      : null;

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    if (videoElement.srcObject !== visibleMediaStream) {
      videoElement.srcObject = visibleMediaStream;
    }
    if (visibleMediaStream) {
      void videoElement.play?.().catch(() => {});
    }
    return () => {
      if (videoElement.srcObject === visibleMediaStream) {
        videoElement.srcObject = null;
      }
    };
  }, [visibleMediaStream]);

  return (
    <div
      className={`group relative overflow-hidden rounded-[8px] ${
        highContrastMode ? 'bg-[#D7E0E8] shadow-[inset_0_0_0_1px_#CBD5E1]' : 'bg-[#DCE5EC]'
      } ${isSpotlighted ? 'ring-2 ring-[#8B5CF6] ring-offset-1 ring-offset-white' : 'ring-1 ring-[#E4EAF1]'}`}
      style={{ aspectRatio: defaultView === 'Speaker View' ? '16 / 8.8' : '16 / 10' }}
    >
      {shouldShowVideoBackground ? (
        <div
          className={`absolute inset-0 ${backgroundOption.blur ? 'scale-[1.05] blur-[10px]' : ''}`}
          style={backgroundOption.sceneStyle}
        />
      ) : null}

      {visibleMediaStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
          style={participant.isCurrentUser && isMirrorVideo ? { transform: 'scaleX(-1)' } : undefined}
        />
      ) : hasPhoto ? (
        <img
          src={participant.profilePic}
          alt={participant.name}
          className="absolute inset-0 h-full w-full object-cover"
          style={participant.isCurrentUser && isMirrorVideo ? { transform: 'scaleX(-1)' } : undefined}
        />
      ) : (
        <div
          className={`absolute inset-0 flex items-center justify-center ${
            shouldShowVideoBackground
              ? 'bg-[linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(15,23,42,0.08)_100%)] text-white/75'
              : 'bg-[#E6EBF1] text-[#B7C2CF]'
          }`}
          style={participant.isCurrentUser && isMirrorVideo ? { transform: 'scaleX(-1)' } : undefined}
        >
          <PersonSilhouetteIcon size={40} />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 h-20 bg-[linear-gradient(180deg,rgba(15,23,42,0)_0%,rgba(15,23,42,0.14)_100%)]" />

      {showParticipantNames ? (
        <span className={`absolute left-1.5 top-1.5 inline-flex max-w-[70%] items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[10px] font-medium text-white ${
          highContrastMode ? 'bg-[rgba(15,23,42,0.94)]' : 'bg-[rgba(71,85,105,0.9)]'
        }`}>
          <span className="truncate">
            {participant.name}
            {participant.isCurrentUser ? ' (You)' : ''}
          </span>
          {showVerification && participantVerified ? (
            <span className="text-[#A7F3D0]">
              <CheckIcon size={9} />
            </span>
          ) : null}
        </span>
      ) : showVerification && participantVerified ? (
        <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#ECFDF5] text-[#059669] shadow-sm">
          <CheckIcon size={9} />
        </span>
      ) : null}

      {showNetworkQuality ? (
        <span className="absolute right-8 top-1.5 inline-flex items-center rounded-full bg-white/90 px-1.5 py-0.5 text-[#475569] shadow-sm">
          <SignalBarsIcon size={11} level={connectionQualityLevel} />
        </span>
      ) : null}

      {!hideMenu ? <div className="absolute right-1.5 top-1.5">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggleMenu(participant.id); }}
          className="flex h-5 w-5 items-center justify-center rounded-[3px] bg-white/85 text-[#475569] transition-colors hover:bg-white"
          aria-label={`Options for ${participant.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <MoreVerticalIcon size={13} />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-6 z-20 w-[168px] overflow-hidden rounded-[12px] border border-[#E7ECF3] bg-white py-1 text-left shadow-[0_16px_40px_rgba(15,23,42,0.16)]">
            <button type="button" onClick={() => onPin(participant.id)} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#334155] transition-colors hover:bg-[#F5F3FF]">
              {isPinned ? 'Unpin' : 'Pin to spotlight'}
            </button>
            {participant.isCurrentUser ? (
              <button
                type="button"
                onClick={onToggleCamera}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#334155] transition-colors hover:bg-[#F5F3FF]"
                title={participant.isCameraOn ? 'Camera Off' : 'Camera On'}
              >
                {participant.isCameraOn ? 'Turn camera off' : 'Turn camera on'}
              </button>
            ) : null}
            {canManage && !participant.isCurrentUser ? (
              <>
                <button type="button" onClick={() => onToggleMute(participant.id)} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#334155] transition-colors hover:bg-[#F5F3FF]">
                  {participant.isMuted ? 'Unmute participant' : 'Mute participant'}
                </button>
                <button type="button" onClick={() => onRemove(participant.id)} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#EF4444] transition-colors hover:bg-[#FEF2F2]">
                  Remove from the call
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div> : null}

      {showReactions && isSpotlighted ? (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-[#7C3AED] shadow-sm">
          👏 Live
        </span>
      ) : null}

      <span
        className={`absolute bottom-1.5 right-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-[3px] text-white ${
          participant.isMuted ? 'bg-[#0F172A]' : 'bg-[#10B981]'
        }`}
      >
        <MicIcon size={10} muted={participant.isMuted} />
      </span>
    </div>
  );
};

// --- Control bar -------------------------------------------------------------

const ControlButton = ({ label, tooltip = label, icon, active, danger, badge, artwork, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="group flex h-[72px] w-[80px] flex-none flex-col items-center p-0 disabled:cursor-not-allowed disabled:opacity-60"
    aria-label={label}
    aria-pressed={active}
    title={tooltip}
  >
    {artwork ? (
      <img src={artwork} alt="" title={tooltip} className="h-[72px] w-[80px] object-contain" aria-hidden="true" />
    ) : (
      <>
        <span title={tooltip} className="relative flex h-[48px] w-[56px] flex-none items-center justify-center rounded-[6px] transition-colors">
          <span className={`flex h-full w-full items-center justify-center rounded-[6px] [&>svg]:h-4 [&>svg]:w-4 ${
            danger
              ? 'bg-[#FF383C] text-white group-hover:bg-[#EB2430]'
              : active
                ? 'bg-[#F1EBFE] text-[#5121BF]'
                : 'text-[#0B1220] group-hover:bg-[#F4F6FA]'
          }`}>
            {icon}
          </span>
          {badge != null ? (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#8B5CF6] px-1 text-[9px] font-bold text-white">
              {badge}
            </span>
          ) : null}
        </span>
        <span className={`mt-[8px] whitespace-nowrap text-[12px] font-normal leading-4 ${danger ? 'text-[#DC2626]' : active ? 'text-[#5121BF]' : 'text-[#0B1220]'}`}>
          {label}
        </span>
      </>
    )}
  </button>
);

const ToggleSwitch = ({ checked, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
      checked ? 'bg-[#8B5CF6]' : 'bg-[#CBD5E1]'
    }`}
  >
    <span
      className={`h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.18)] transition-transform ${
        checked ? 'translate-x-5' : ''
      }`}
    />
  </button>
);

const SettingsSelect = ({ label, value, options, onChange }) => (
  <label className="block">
    <span className="mb-2 block text-[12px] font-medium uppercase tracking-[0.02em] text-[#111827]">
      {label}
    </span>
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-[12px] border border-[#E5E7EB] bg-white px-3 pr-9 text-[12px] text-[#475569] outline-none transition-colors focus:border-[#C4B5FD]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#94A3B8]">
        <ChevronDownIcon size={15} />
      </span>
    </div>
  </label>
);

const SettingsSectionHeading = ({ icon, title }) => (
  <div className="mb-4 flex items-center gap-2 text-[#111827]">
    <span className="text-[#111827]">{icon}</span>
    <h4 className="text-[12px] font-semibold uppercase tracking-[0.03em]">{title}</h4>
  </div>
);

const BellIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 17H5.5a1 1 0 0 1-.8-1.6l1.1-1.4a2 2 0 0 0 .4-1.2V10a5 5 0 0 1 10 0v2.8a2 2 0 0 0 .4 1.2l1.1 1.4" />
    <path d="M9 19a2 2 0 0 0 4 0" />
    <path d="M18.5 8.5v4M20.5 10.5h-4" />
  </svg>
);
const LayoutGridIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <rect x="14" y="14" width="6" height="6" rx="1" />
  </svg>
);
const AccessibilityIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="5" r="1.8" />
    <path d="M6 9.5h12M12 9.5v10M9 21l3-6 3 6M8.5 14.5 12 11l3.5 3.5" />
  </svg>
);
const NetworkIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 18h16" />
    <path d="M7 18a5 5 0 0 1 10 0" />
    <path d="M9.5 13a2.5 2.5 0 0 1 5 0" />
    <path d="M12 6h.01" />
  </svg>
);
const SecurityIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 5.5 6v5.5c0 4.1 2.6 7.8 6.5 9.1 3.9-1.3 6.5-5 6.5-9.1V6L12 3Z" />
    <path d="M9.5 12.2 11.2 14l3.6-4" />
  </svg>
);
const ChevronRightIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 6 6 6-6 6" />
  </svg>
);
const PreferenceSection = ({ icon, title, children }) => (
  <section className="mt-8 first:mt-0">
    <SettingsSectionHeading icon={icon} title={title} />
    <div className="space-y-5">{children}</div>
  </section>
);
const PreferenceToggleRow = ({ label, helper, checked, onChange }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0 flex-1">
      <p className="text-[12px] font-medium text-[#111827]">{label}</p>
      <p className="mt-1 text-[11px] leading-4 text-[#9CA3AF]">{helper}</p>
    </div>
    <ToggleSwitch checked={checked} onChange={onChange} ariaLabel={label} />
  </div>
);
const PreferenceSelectRow = ({ label, helper, value, options, onChange }) => (
  <div>
    <p className="text-[12px] font-medium text-[#111827]">{label}</p>
    <p className="mt-1 text-[11px] leading-4 text-[#9CA3AF]">{helper}</p>
    <div className="mt-2 relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-[12px] border border-[#E5E7EB] bg-white px-3 pr-9 text-[12px] text-[#475569] outline-none transition-colors focus:border-[#C4B5FD]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#94A3B8]">
        <ChevronDownIcon size={15} />
      </span>
    </div>
  </div>
);
const HighlightedSelectRow = ({ label, helper, value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef}>
      <p className="text-[12px] font-medium text-[#111827]">{label}</p>
      <p className="mt-1 text-[11px] leading-4 text-[#9CA3AF]">{helper}</p>
      <div className="relative mt-2">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="flex h-11 w-full items-center justify-between rounded-[12px] border border-[#E5E7EB] bg-white px-4 text-[12px] text-[#374151] outline-none transition-colors hover:border-[#D8DDE6] focus:border-[#C4B5FD]"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span>{value}</span>
          <span className={`text-[#6B7280] transition-transform ${isOpen ? 'rotate-180' : ''}`}>
            <ChevronDownIcon size={15} />
          </span>
        </button>

        {isOpen ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-[8px] border border-[#E5E7EB] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <div role="listbox" aria-label={label} className="py-1">
              {options.map((option) => {
                const selected = option === value;
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(option);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-[12px] transition-colors ${
                      selected
                        ? 'font-medium text-[#6D28D9]'
                        : 'text-[#111827] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <span>{option}</span>
                    <span className={selected ? 'text-[#6D28D9]' : 'text-transparent'}>
                      <CheckIcon size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
const AdvancedActionRow = ({ label, helper, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-start justify-between gap-4 text-left"
  >
    <div className="min-w-0 flex-1">
      <p className="text-[12px] font-medium text-[#111827]">{label}</p>
      <p className="mt-1 text-[11px] leading-4 text-[#9CA3AF]">{helper}</p>
    </div>
    <span className="mt-0.5 text-[#6B7280]">
      <ChevronRightIcon size={16} />
    </span>
  </button>
);

const VideoPreviewCard = ({
  participant,
  defaultAvatar,
  videoBackground = 'none',
  isMirrorVideo = true,
  networkLowBandwidthMode = false,
  maximumVideoResolution = DEFAULT_ADVANCED_VIDEO_RESOLUTION,
  adaptiveBitrate = true,
}) => {
  const hasPhoto = Boolean(participant?.profilePic) && participant.profilePic !== defaultAvatar;
  const effectiveVideoBackground = networkLowBandwidthMode ? 'none' : videoBackground;
  const backgroundOption = getVideoBackgroundOption(effectiveVideoBackground);
  const previewResolution = getCompactResolutionLabel(
    networkLowBandwidthMode && adaptiveBitrate ? '360p' : maximumVideoResolution
  );

  return (
    <div className="overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-[#E6EBF1]">
      <div className="relative aspect-[16/9]">
        {effectiveVideoBackground !== 'none' ? (
          <div
            className={`absolute inset-0 ${backgroundOption.blur ? 'scale-[1.06] blur-[14px]' : ''}`}
            style={backgroundOption.sceneStyle}
          />
        ) : (
          <div className="absolute inset-0 bg-[#E6EBF1]" />
        )}
        <span className="absolute right-3 top-3 z-[1] rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-[#475569] shadow-sm">
          {previewResolution}
        </span>
        {networkLowBandwidthMode ? (
          <span className="absolute left-3 top-3 z-[1] rounded-full bg-[#FFF7ED] px-2 py-1 text-[10px] font-semibold text-[#C2410C] shadow-sm">
            Low bandwidth
          </span>
        ) : null}
        {hasPhoto ? (
          <img
            src={participant.profilePic}
            alt={participant?.name || 'Video preview'}
            className="absolute inset-0 h-full w-full object-cover"
            style={isMirrorVideo ? { transform: 'scaleX(-1)' } : undefined}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(15,23,42,0.05)_100%)]">
            <div
              className={`flex h-[58%] w-[44%] items-center justify-center rounded-t-[999px] ${
                effectiveVideoBackground === 'none' ? 'bg-white/45 text-[#A8B4C2]' : 'bg-white/22 text-white/75'
              }`}
              style={isMirrorVideo ? { transform: 'scaleX(-1)' } : undefined}
            >
              <PersonSilhouetteIcon size={74} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CallSettingsPanel = ({
  activeTab,
  onTabChange,
  onClose,
  microphoneDevice,
  onMicrophoneDeviceChange,
  speakerDevice,
  onSpeakerDeviceChange,
  cameraDevice,
  onCameraDeviceChange,
  onTestSpeaker,
  videoBackground,
  onVideoBackgroundChange,
  isMirrorVideo,
  onMirrorVideoChange,
  onReset,
  canManage,
  isLocked,
  onToggleLock,
  previewParticipant,
  defaultAvatar,
  showReactions,
  onShowReactionsChange,
  showParticipantNames,
  onShowParticipantNamesChange,
  playJoinLeaveSounds,
  onPlayJoinLeaveSoundsChange,
  focusOnSpeaker,
  onFocusOnSpeakerChange,
  notifyWhenSomeoneSpeaks,
  onNotifyWhenSomeoneSpeaksChange,
  notificationSound,
  onNotificationSoundChange,
  defaultView,
  onDefaultViewChange,
  gridSize,
  onGridSizeChange,
  highContrastMode,
  onHighContrastModeChange,
  captions,
  onCaptionsChange,
  networkLowBandwidthMode,
  onNetworkLowBandwidthModeChange,
  networkQualityIndicator,
  onNetworkQualityIndicatorChange,
  adaptiveBitrate,
  onAdaptiveBitrateChange,
  maximumVideoResolution,
  onMaximumVideoResolutionChange,
  verifyParticipants,
  onVerifyParticipantsChange,
  blockUnverifiedParticipants,
  onBlockUnverifiedParticipantsChange,
  onOpenEncryptionDetails,
  onPreferencesReset,
  onAdvancedReset,
}) => (
  <aside
    className="flex h-full w-full flex-shrink-0 flex-col bg-white"
    style={{ width: '366px', borderLeft: '0.5px solid #E5E7EB' }}
  >
    <div className="flex items-center justify-between px-4 pb-4 pt-4">
      <h3 className="text-[20px] font-medium text-[#111827]">Settings</h3>
      <button
        type="button"
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F3F4F6]"
        aria-label="Close settings panel"
      >
        <CloseIcon size={18} />
      </button>
    </div>

    <div className="flex h-10 items-stretch gap-2 px-4" style={{ borderBottom: '0.5px solid #E5E7EB' }}>
      {CALL_SETTINGS_TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`flex h-full flex-1 items-center justify-center border-b-2 text-[13px] font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'border-[#8B5CF6] text-[#7C3AED]'
                : 'border-transparent text-[#1F2937] hover:text-[#111827]'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {activeTab === 'audio-video' ? (
        <div className="px-4 py-5">
          <section>
            <SettingsSectionHeading icon={<MicIcon size={14} />} title="Audio" />
            <div className="space-y-4">
              <SettingsSelect
                label="Microphone"
                value={microphoneDevice}
                options={CALL_SETTINGS_DEVICE_OPTIONS.microphones}
                onChange={onMicrophoneDeviceChange}
              />
              <SettingsSelect
                label="Speaker"
                value={speakerDevice}
                options={CALL_SETTINGS_DEVICE_OPTIONS.speakers}
                onChange={onSpeakerDeviceChange}
              />
              <button
                type="button"
                onClick={onTestSpeaker}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#F7F7FA] text-[12px] font-medium text-[#374151] transition-colors hover:bg-[#F0F1F5]"
              >
                <span className="text-[#475569]"><PlayTriangleIcon size={11} /></span>
                Test Speaker
              </button>
            </div>
          </section>

          <section className="mt-8">
            <SettingsSectionHeading icon={<CameraIcon size={14} />} title="Video" />
            <div className="space-y-4">
              <SettingsSelect
                label="Camera"
                value={cameraDevice}
                options={CALL_SETTINGS_DEVICE_OPTIONS.cameras}
                onChange={onCameraDeviceChange}
              />

              <VideoPreviewCard
                participant={previewParticipant}
                defaultAvatar={defaultAvatar}
                videoBackground={videoBackground}
                isMirrorVideo={isMirrorVideo}
                networkLowBandwidthMode={networkLowBandwidthMode}
                maximumVideoResolution={maximumVideoResolution}
                adaptiveBitrate={adaptiveBitrate}
              />

              <div>
                <p className="mb-3 text-[12px] font-medium text-[#111827]">Video Background</p>
                <div className="grid grid-cols-5 gap-2">
                  {CALL_VIDEO_BACKGROUNDS.map((background) => {
                    const selected = videoBackground === background.key;
                    return (
                      <button
                        key={background.key}
                        type="button"
                        onClick={() => onVideoBackgroundChange(background.key)}
                        className="text-center"
                        aria-pressed={selected}
                      >
                        <span
                          className={`relative flex h-[52px] w-full items-center justify-center overflow-hidden rounded-[10px] border transition-colors ${
                            selected ? 'border-[#8B5CF6] ring-1 ring-[#8B5CF6]' : 'border-[#E5E7EB]'
                          } ${background.swatch || ''} ${background.accent || 'text-transparent'}`}
                        >
                          {background.key === 'none' ? (
                            <NoneBackgroundIcon size={16} />
                          ) : (
                            <>
                              <img
                                src={background.imageUrl}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                                aria-hidden="true"
                              />
                            </>
                          )}
                        </span>
                        <span className="mt-1 block text-[11px] text-[#4B5563]">{background.label}</span>
                      </button>
                    );
                  })}
                </div>
                {networkLowBandwidthMode ? (
                  <p className="mt-2 text-[11px] font-medium text-[#7C3AED]">
                    Background effects pause while Low Bandwidth Mode is enabled.
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[12px] text-[#374151]">Mirror my video</span>
                <ToggleSwitch
                  checked={isMirrorVideo}
                  onChange={onMirrorVideoChange}
                  ariaLabel="Toggle mirror my video"
                />
              </div>
            </div>
          </section>

          <div className="mt-8 flex items-center justify-between border-t border-[#E5E7EB] pt-4">
            <div>
              <p className="text-[12px] font-medium text-[#111827]">Reset to Default</p>
              <p className="text-[11px] text-[#9CA3AF]">
                Restore all Audio &amp; Video settings to default
              </p>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="rounded-[8px] bg-[#F3F4F6] px-4 py-2 text-[12px] font-medium text-[#374151] transition-colors hover:bg-[#E5E7EB]"
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'preferences' ? (
        <div className="px-4 py-5">
          <PreferenceSection icon={<SettingsIcon size={14} />} title="General">
            <PreferenceToggleRow
              label="Show reactions"
              helper="Show reactions when user interacts with it."
              checked={showReactions}
              onChange={onShowReactionsChange}
            />
            <PreferenceToggleRow
              label="Show Participants Name"
              helper="Display names on video tiles."
              checked={showParticipantNames}
              onChange={onShowParticipantNamesChange}
            />
            <PreferenceToggleRow
              label="Play Join/leave Sounds"
              helper="Play a tone when a participant join or leave the call."
              checked={playJoinLeaveSounds}
              onChange={onPlayJoinLeaveSoundsChange}
            />
            <PreferenceToggleRow
              label="Focus on Speaker"
              helper="Highlight the active speaker."
              checked={focusOnSpeaker}
              onChange={onFocusOnSpeakerChange}
            />
          </PreferenceSection>

          <PreferenceSection icon={<BellIcon size={14} />} title="Notifications">
            <PreferenceToggleRow
              label="Notify when Someone Speaks"
              helper="Show a notification banner when someone speaks on a call when it was in mute for a very long time"
              checked={notifyWhenSomeoneSpeaks}
              onChange={onNotifyWhenSomeoneSpeaksChange}
            />
            <HighlightedSelectRow
              label="Notification Sound"
              helper="Set the desired sound for the notification for calls"
              value={notificationSound}
              options={['Default', 'Bell', 'Pop', 'Chime', 'Silent']}
              onChange={onNotificationSoundChange}
            />
          </PreferenceSection>

          <PreferenceSection icon={<LayoutGridIcon size={14} />} title="Layout">
            <HighlightedSelectRow
              label="Default View"
              helper="Select the default view while joining the call"
              value={defaultView}
              options={['Grid View', 'Speaker View', 'Focus Mode']}
              onChange={onDefaultViewChange}
            />
            <HighlightedSelectRow
              label="Grid Size"
              helper="Select the no of participants to show per page"
              value={gridSize}
              options={['4', '8', '16', 'Auto']}
              onChange={onGridSizeChange}
            />
          </PreferenceSection>

          <PreferenceSection icon={<AccessibilityIcon size={14} />} title="Accessibility">
            <PreferenceToggleRow
              label="High Contrast Mode"
              helper="Increase the contrast for better visibility"
              checked={highContrastMode}
              onChange={onHighContrastModeChange}
            />
            <PreferenceToggleRow
              label="Captions"
              helper="Show live captions when available"
              checked={captions}
              onChange={onCaptionsChange}
            />
          </PreferenceSection>

          <div className="mt-8 flex items-center justify-between border-t border-[#E5E7EB] pt-4">
            <div>
              <p className="text-[12px] font-medium text-[#111827]">Reset to Default</p>
              <p className="text-[11px] text-[#9CA3AF]">
                Restore all Preference settings to default
              </p>
            </div>
            <button
              type="button"
              onClick={onPreferencesReset}
              className="rounded-[8px] bg-[#F3F4F6] px-4 py-2 text-[12px] font-medium text-[#374151] transition-colors hover:bg-[#E5E7EB]"
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'advanced' ? (
        <div className="px-4 py-5">
          <PreferenceSection icon={<NetworkIcon size={14} />} title="Network">
            <PreferenceToggleRow
              label="Low Bandwidth Mode"
              helper="Optimize video quality and disable background effects"
              checked={networkLowBandwidthMode}
              onChange={onNetworkLowBandwidthModeChange}
            />
            <PreferenceToggleRow
              label="Network Quality Indicator"
              helper="Show connection quality in call"
              checked={networkQualityIndicator}
              onChange={onNetworkQualityIndicatorChange}
            />
            <PreferenceToggleRow
              label="Enable Adaptive Bitrate"
              helper="Automatically adjust quality based on network"
              checked={adaptiveBitrate}
              onChange={onAdaptiveBitrateChange}
            />
            <HighlightedSelectRow
              label="Maximum Video Resolution"
              helper="Set the highest resolution for outgoing video"
              value={maximumVideoResolution}
              options={CALL_ADVANCED_VIDEO_RESOLUTION_OPTIONS}
              onChange={onMaximumVideoResolutionChange}
            />
          </PreferenceSection>

          <section className="mt-8 border-t border-[#E5E7EB] pt-6">
            <SettingsSectionHeading icon={<SecurityIcon size={14} />} title="Security" />
            <div className="space-y-5">
              <AdvancedActionRow
                label="End-to-end Encryption"
                helper="Optimize video quality and disable background effects"
                onClick={onOpenEncryptionDetails}
              />
              <PreferenceToggleRow
                label="Verify Participants"
                helper="Show connection quality in call"
                checked={verifyParticipants}
                onChange={onVerifyParticipantsChange}
              />
              <PreferenceToggleRow
                label="Block Unverified Participants"
                helper="Automatically adjust quality based on network"
                checked={blockUnverifiedParticipants}
                onChange={onBlockUnverifiedParticipantsChange}
              />
            </div>
          </section>

          <div className="mt-8 flex items-center justify-between border-t border-[#E5E7EB] pt-4">
            <div>
              <p className="text-[12px] font-medium text-[#111827]">Reset to Default</p>
              <p className="text-[11px] text-[#9CA3AF]">
                Restore all Advanced setting to default
              </p>
            </div>
            <button
              type="button"
              onClick={onAdvancedReset}
              className="rounded-[8px] bg-[#F3F4F6] px-4 py-2 text-[12px] font-medium text-[#374151] transition-colors hover:bg-[#E5E7EB]"
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}
    </div>
  </aside>
);

// --- Participants panel ------------------------------------------------------

const ParticipantsPanel = ({
  participants,
  spotlightId,
  defaultAvatar,
  canManage,
  onClose,
  onOpenAddParticipants,
  onToggleMute,
  onRemove,
  onPin,
}) => {
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return participants;
    return participants.filter((participant) =>
      participant.name.toLowerCase().includes(query) || participant.phone.toLowerCase().includes(query)
    );
  }, [participants, search]);

  return (
    <aside className="flex h-full w-full max-w-[340px] flex-shrink-0 flex-col border-l border-[#E7ECF3] bg-white">
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <h3 className="text-[16px] font-semibold text-[#111827]">Participants</h3>
        <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9]" aria-label="Close participants panel">
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="px-5 pb-3">
        <div className="flex items-center gap-2 rounded-[12px] border border-[#E6EAF1] bg-[#F8FAFC] px-3 py-2.5 text-[#94A3B8]">
          <SearchIcon size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Members"
            className="w-full bg-transparent text-[13px] text-[#334155] outline-none placeholder:text-[#94A3B8]"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenAddParticipants}
        className="mx-5 mb-2 flex items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-[#F5F3FF]"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F1EBFE] text-[#7C3AED]">
          <PersonAddIcon size={20} />
        </span>
        <span className="text-[14px] font-medium text-[#7C3AED]">Add Participants</span>
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {filtered.map((participant) => {
          const isSpotlighted = participant.id === spotlightId;
          const statusLabel = getParticipantStatusLabel(participant.status);
          const isResolved = isResolvedParticipantStatus(participant.status);
          const isDeclined = participant.status === GROUP_CALL_PARTICIPANT_STATUS.DECLINED;
          return (
            <div
              key={participant.id}
              className={`relative flex items-center gap-3 rounded-[14px] px-2 py-2 ${
                isSpotlighted ? 'bg-[#F3EFFE]' : 'hover:bg-[#F8FAFC]'
              }`}
            >
              <Avatar name={participant.name} src={participant.profilePic} defaultAvatar={defaultAvatar} size={42} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14px] font-semibold text-[#172033]">
                    {participant.name}
                    {participant.isCurrentUser ? ' (You)' : ''}
                  </p>
                  <RolePill role={participant.role} isOrganizer={participant.isOrganizer} />
                </div>
                <p className="truncate text-[12px] text-[#94A3B8]">{participant.phone || 'Group participant'}</p>
              </div>

              {statusLabel ? (
                <span
                  className={`whitespace-nowrap text-[12px] font-medium ${
                    isDeclined ? 'text-[#EF4444]' : isResolved ? 'text-[#94A3B8]' : 'text-[#7C3AED]'
                  }`}
                >
                  {statusLabel}
                </span>
              ) : (
                <div className="flex items-center gap-1.5 text-[#64748B]">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full ${participant.isMuted ? 'bg-[#F1F5F9] text-[#94A3B8]' : 'text-[#334155]'}`}>
                    <MicIcon size={15} muted={participant.isMuted} />
                  </span>
                  <span className="flex h-6 w-6 items-center justify-center text-[#334155]">
                    <CameraIcon size={15} />
                  </span>
                  {canManage && !participant.isCurrentUser ? (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId((current) => (current === participant.id ? '' : participant.id))}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#EEF2F7] hover:text-[#475569]"
                        aria-label={`Manage ${participant.name}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === participant.id}
                      >
                        <MoreVerticalIcon size={16} />
                      </button>
                      {openMenuId === participant.id ? (
                        <div className="absolute right-0 top-7 z-30 w-[172px] overflow-hidden rounded-[12px] border border-[#E7ECF3] bg-white py-1 shadow-[0_16px_40px_rgba(15,23,42,0.16)]">
                          <button type="button" onClick={() => { onPin(participant.id); setOpenMenuId(''); }} className="flex w-full items-center px-3 py-2 text-left text-[12px] font-medium text-[#334155] transition-colors hover:bg-[#F5F3FF]">
                            {isSpotlighted ? 'Remove from spotlight' : 'Pin to spotlight'}
                          </button>
                          <button type="button" onClick={() => { onToggleMute(participant.id); setOpenMenuId(''); }} className="flex w-full items-center px-3 py-2 text-left text-[12px] font-medium text-[#334155] transition-colors hover:bg-[#F5F3FF]">
                            {participant.isMuted ? 'Unmute participant' : 'Mute participant'}
                          </button>
                          <button type="button" onClick={() => { onRemove(participant.id); setOpenMenuId(''); }} className="flex w-full items-center px-3 py-2 text-left text-[12px] font-medium text-[#EF4444] transition-colors hover:bg-[#FEF2F2]">
                            Remove from the call
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
        {!filtered.length ? (
          <p className="px-3 py-6 text-center text-[13px] text-[#94A3B8]">No members found.</p>
        ) : null}
      </div>
    </aside>
  );
};

// --- Add participants panel --------------------------------------------------

const AddParticipantsPanel = ({ contacts, defaultAvatar, isLocked, onBack, onClose, onAdd }) => {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const normalizedContacts = useMemo(
    () =>
      contacts
        .map((contact) => ({
          id: normalizeContactId(contact),
          name: String(contact?.name || contact?.fullName || contact?.phone || 'Contact').trim(),
          phone: String(contact?.phone || contact?.status || '').trim(),
          profilePic: contact?.profilePic || contact?.photo || contact?.avatar || '',
        }))
        .filter((contact) => contact.id),
    [contacts]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return normalizedContacts;
    return normalizedContacts.filter(
      (contact) => contact.name.toLowerCase().includes(query) || contact.phone.toLowerCase().includes(query)
    );
  }, [normalizedContacts, search]);

  const selectedContacts = useMemo(
    () => normalizedContacts.filter((contact) => selectedIds.has(contact.id)),
    [normalizedContacts, selectedIds]
  );

  const toggle = (id) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className="flex h-full w-full max-w-[340px] flex-shrink-0 flex-col border-l border-[#E7ECF3] bg-white">
      <div className="flex items-center gap-2 px-4 pb-3 pt-5">
        <button type="button" onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-full text-[#334155] transition-colors hover:bg-[#F1F5F9]" aria-label="Back to participants">
          <BackIcon size={18} />
        </button>
        <h3 className="flex-1 text-[16px] font-semibold text-[#111827]">Add Participants</h3>
        <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9]" aria-label="Close add participants panel">
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="px-5 pb-3">
        <div className="flex items-center gap-2 rounded-[12px] border border-[#E6EAF1] bg-[#F8FAFC] px-3 py-2.5 text-[#94A3B8]">
          <SearchIcon size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Contacts"
            className="w-full bg-transparent text-[13px] text-[#334155] outline-none placeholder:text-[#94A3B8]"
          />
        </div>
      </div>

      {selectedContacts.length ? (
        <div className="px-5 pb-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[13px] font-medium text-[#334155]">Selected Participants</span>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F1EBFE] px-1.5 text-[11px] font-bold text-[#7C3AED]">
              {selectedContacts.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedContacts.map((contact) => (
              <span key={contact.id} className="flex items-center gap-1.5 rounded-full border border-[#E7ECF3] bg-white py-1 pl-1 pr-2 shadow-sm">
                <Avatar name={contact.name} src={contact.profilePic} defaultAvatar={defaultAvatar} size={20} />
                <span className="max-w-[100px] truncate text-[12px] font-medium text-[#334155]">{contact.name}</span>
                <button type="button" onClick={() => toggle(contact.id)} className="flex h-4 w-4 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#475569]" aria-label={`Remove ${contact.name}`}>
                  <CloseIcon size={11} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <p className="px-5 pb-1 text-[13px] font-semibold text-[#111827]">Contacts</p>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {filtered.map((contact) => {
          const checked = selectedIds.has(contact.id);
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => toggle(contact.id)}
              className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left transition-colors hover:bg-[#F8FAFC]"
            >
              <Avatar name={contact.name} src={contact.profilePic} defaultAvatar={defaultAvatar} size={42} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-[#172033]">{contact.name}</p>
                <p className="truncate text-[12px] text-[#94A3B8]">{contact.phone || 'Contact'}</p>
              </div>
              <span
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                  checked ? 'border-[#8B5CF6] bg-[#8B5CF6] text-white' : 'border-[#CBD5E1] text-transparent'
                }`}
              >
                <CheckIcon size={12} />
              </span>
            </button>
          );
        })}
        {!filtered.length ? (
          <p className="px-3 py-6 text-center text-[13px] text-[#94A3B8]">No contacts to add.</p>
        ) : null}
      </div>

      <div className="border-t border-[#EEF1F6] p-4">
        <button
          type="button"
          disabled={!selectedContacts.length || isLocked}
          onClick={() => onAdd(selectedContacts)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(90deg,#8D44F7_0%,#B534F6_100%)] text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(151,71,255,0.24)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-[18px] leading-none">+</span>
          {isLocked ? 'Meeting Locked' : 'Add to Call'}
        </button>
      </div>
    </aside>
  );
};

const InCallChatPanel = ({
  messages = [],
  currentUserId = '',
  onClose,
  onSendMessage,
}) => {
  const [draft, setDraft] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || typeof onSendMessage !== 'function') return;
    onSendMessage(text);
    setDraft('');
  };

  return (
    <aside className="flex h-full w-full max-w-[340px] flex-shrink-0 flex-col border-l border-[#E7ECF3] bg-white" aria-label="In-call chat">
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <div>
          <h3 className="text-[16px] font-semibold text-[#111827]">In-call chat</h3>
          <p className="mt-0.5 text-[11px] text-[#64748B]">Messages stay available during your call</p>
        </div>
        <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9]" aria-label="Close in-call chat">
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto border-t border-[#E7ECF3] p-4">
        {messages.slice(-30).map((message) => {
          const isSent =
            String(message?.senderId || '') === String(currentUserId || '') ||
            message?.direction === 'sent';
          const text = String(
            message?.text || message?.content || message?.caption || 'Attachment'
          ).trim();
          const messageKey = String(
            message?.id ||
              message?.messageId ||
              message?._id ||
              `${text}-${message?.timestamp || message?.createdAt || ''}`
          );

          return (
            <p
              key={messageKey}
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-5 ${
                isSent ? 'ml-auto bg-[#8B5CF6] text-white' : 'bg-[#F1F5F9] text-[#334155]'
              }`}
            >
              {text}
            </p>
          );
        })}
        {!messages.length ? (
          <p className="py-8 text-center text-[12px] text-[#94A3B8]">No messages yet.</p>
        ) : null}
      </div>

      <form className="flex gap-2 border-t border-[#E7ECF3] p-3" onSubmit={handleSubmit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message"
          className="min-w-0 flex-1 rounded-full border border-[#D8E0EB] px-3 py-2 text-[12px] outline-none focus:border-[#8B5CF6]"
          aria-label="Type an in-call message"
        />
        <button type="submit" className="rounded-full bg-[#8B5CF6] px-3 text-[12px] font-semibold text-white" aria-label="Send message">
          Send
        </button>
      </form>
    </aside>
  );
};

// --- Screen ------------------------------------------------------------------

export default function GroupCallScreen({
  group,
  groupCallId = '',
  participants = [],
  addableContacts = [],
  currentUserId,
  currentUserName = 'You',
  currentUserAvatar = '',
  organizerId = '',
  defaultAvatar = '',
  callType = 'video',
  messages = [],
  participantStatuses = {},
  onSendMessage,
  isMinimized = false,
  onMinimize,
  onRestore,
  onClose,
}) {
  const normalizedCurrentUserId = String(currentUserId || '').trim();
  const normalizedOrganizerId = String(organizerId || '').trim();
  const activeGroupCallId = String(groupCallId || group?.groupCallId || group?.callId || '').trim();
  const isVideoCall = String(callType || '').trim().toLowerCase() !== 'audio';

  const [call, setCall] = useState(() =>
    createGroupCallState({
      callId: activeGroupCallId,
      groupId: group?.chatId || group?.groupId || group?.id,
      groupName: group?.name || group?.groupName || 'Group call',
      hostId: normalizedOrganizerId || normalizedCurrentUserId,
      participants: participants.map((participant) => {
        const id = String(participant?.id || participant?.userId || participant?.memberId || '').trim();
        const isCurrentUser = Boolean(participant?.isCurrentUser) || id === normalizedCurrentUserId;
        return {
          id,
          name: isCurrentUser ? currentUserName || participant?.name : participant?.name,
          phone: participant?.phone || participant?.subtitle || participant?.status,
          profilePic: isCurrentUser ? currentUserAvatar || participant?.profilePic : participant?.profilePic,
          role: participant?.isGroupAdmin ? 'admin' : participant?.isGroupModerator ? 'moderator' : 'member',
          isOrganizer: Boolean(normalizedOrganizerId) && id === normalizedOrganizerId,
          isCurrentUser,
          isMuted: Boolean(participant?.isMuted),
          isCameraOn: isVideoCall && (participant?.isCameraOn ?? true),
          isVerified: participant?.isVerified ?? participant?.verified ?? true,
          status: GROUP_CALL_PARTICIPANT_STATUS.CONNECTED,
        };
      }),
    })
  );

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [panel, setPanel] = useState(''); // '' | 'participants' | 'add' | 'chat' | 'settings'
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isOnHold, setIsOnHold] = useState(false);
  const [openTileMenuId, setOpenTileMenuId] = useState('');
  const [settingsTab, setSettingsTab] = useState('audio-video');
  const [microphoneDevice, setMicrophoneDevice] = useState(CALL_SETTINGS_DEVICE_OPTIONS.microphones[0]);
  const [speakerDevice, setSpeakerDevice] = useState(CALL_SETTINGS_DEVICE_OPTIONS.speakers[0]);
  const [cameraDevice, setCameraDevice] = useState(CALL_SETTINGS_DEVICE_OPTIONS.cameras[0]);
  const [videoBackground, setVideoBackground] = useState('none');
  const [isMirrorVideo, setIsMirrorVideo] = useState(true);
  const [showReactions, setShowReactions] = useState(false);
  const [showParticipantNames, setShowParticipantNames] = useState(true);
  const [playJoinLeaveSounds, setPlayJoinLeaveSounds] = useState(true);
  const [focusOnSpeaker, setFocusOnSpeaker] = useState(true);
  const [notifyWhenSomeoneSpeaks, setNotifyWhenSomeoneSpeaks] = useState(true);
  const [notificationSound, setNotificationSound] = useState('Chime');
  const [defaultView, setDefaultView] = useState('Grid View');
  const [gridSize, setGridSize] = useState('16');
  const [highContrastMode, setHighContrastMode] = useState(true);
  const [captions, setCaptions] = useState(false);
  const [networkLowBandwidthMode, setNetworkLowBandwidthMode] = useState(true);
  const [networkQualityIndicator, setNetworkQualityIndicator] = useState(true);
  const [adaptiveBitrate, setAdaptiveBitrate] = useState(true);
  const [maximumVideoResolution, setMaximumVideoResolution] = useState(DEFAULT_ADVANCED_VIDEO_RESOLUTION);
  const [verifyParticipants, setVerifyParticipants] = useState(true);
  const [blockUnverifiedParticipants, setBlockUnverifiedParticipants] = useState(true);
  const [isScreenShareDialogOpen, setIsScreenShareDialogOpen] = useState(false);
  const [screenShareMode, setScreenShareMode] = useState('screen');
  const [isScreenShareWindowSelectOpen, setIsScreenShareWindowSelectOpen] = useState(false);
  const [selectedScreenShareWindow, setSelectedScreenShareWindow] = useState(0);
  const [isScreenShareAudioEnabled, setIsScreenShareAudioEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isStartingScreenShare, setIsStartingScreenShare] = useState(false);
  const [localMediaStream, setLocalMediaStream] = useState(null);
  const [remoteMediaStreamVersion, setRemoteMediaStreamVersion] = useState(0);
  const localMediaStreamRef = useRef(null);
  const groupPeerConnectionsRef = useRef(new Map());
  const groupPendingIceCandidatesRef = useRef(new Map());
  const groupPendingOffersRef = useRef(new Map());
  const groupRemoteAudioElementsRef = useRef(new Map());
  const groupRemoteStreamsRef = useRef(new Map());
  const groupOfferInProgressRef = useRef(new Set());
  const groupOfferRetryTimersRef = useRef(new Map());
  const groupOfferRetryAttemptsRef = useRef(new Map());
  const startGroupWebRtcOfferRef = useRef(null);
  const screenShareStreamRef = useRef(null);
  const previousParticipantCountRef = useRef(null);
  const previousSpotlightIdRef = useRef('');
  const [toast, setToast] = useState('');
  const activeGroupCallIdRef = useRef(activeGroupCallId);
  const isSpeakerOnRef = useRef(isSpeakerOn);
  const isOnHoldRef = useRef(isOnHold);

  activeGroupCallIdRef.current = activeGroupCallId;
  isSpeakerOnRef.current = isSpeakerOn;
  isOnHoldRef.current = isOnHold;

  const showToast = useCallback((message) => setToast(message), []);

  const ensureRemoteGroupAudioElement = useCallback((peerUserId) => {
    const normalizedPeerUserId = String(peerUserId || '').trim();
    if (!normalizedPeerUserId) return null;

    const existingAudio = groupRemoteAudioElementsRef.current.get(normalizedPeerUserId);
    if (existingAudio) return existingAudio;

    const audio = new Audio();
    audio.autoplay = true;
    audio.playsInline = true;
    audio.preload = 'auto';
    audio.muted = isOnHoldRef.current || !isSpeakerOnRef.current;
    audio.volume = audio.muted ? 0 : 1;
    groupRemoteAudioElementsRef.current.set(normalizedPeerUserId, audio);
    return audio;
  }, []);

  const syncRemoteGroupAudioPlayback = useCallback(() => {
    const shouldMute = isOnHoldRef.current || !isSpeakerOnRef.current;
    groupRemoteStreamsRef.current.forEach((stream) => {
      stream?.getAudioTracks?.().forEach((track) => {
        track.enabled = !shouldMute;
      });
    });
    groupRemoteAudioElementsRef.current.forEach((audio) => {
      audio.muted = shouldMute;
      audio.volume = shouldMute ? 0 : 1;
      if (!shouldMute && audio.srcObject) {
        audio.play?.().catch((error) => {
          console.warn('Remote group call audio playback was blocked:', error);
        });
      }
    });
  }, []);

  const closeGroupPeerConnection = useCallback((peerUserId) => {
    const normalizedPeerUserId = String(peerUserId || '').trim();
    if (!normalizedPeerUserId) return;

    const peerConnection = groupPeerConnectionsRef.current.get(normalizedPeerUserId);
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.close();
      groupPeerConnectionsRef.current.delete(normalizedPeerUserId);
    }

    const audio = groupRemoteAudioElementsRef.current.get(normalizedPeerUserId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      groupRemoteAudioElementsRef.current.delete(normalizedPeerUserId);
    }

    groupRemoteStreamsRef.current.delete(normalizedPeerUserId);
    groupPendingIceCandidatesRef.current.delete(normalizedPeerUserId);
    groupPendingOffersRef.current.delete(normalizedPeerUserId);
    groupOfferInProgressRef.current.delete(normalizedPeerUserId);
    const retry = groupOfferRetryTimersRef.current.get(normalizedPeerUserId);
    if (retry?.timerId) {
      window.clearTimeout(retry.timerId);
    }
    groupOfferRetryTimersRef.current.delete(normalizedPeerUserId);
    setRemoteMediaStreamVersion((currentVersion) => currentVersion + 1);
  }, []);

  const closeAllGroupPeerConnections = useCallback(() => {
    Array.from(groupPeerConnectionsRef.current.keys()).forEach((peerUserId) => {
      closeGroupPeerConnection(peerUserId);
    });
    groupPendingIceCandidatesRef.current.clear();
    groupPendingOffersRef.current.clear();
    groupOfferInProgressRef.current.clear();
    groupOfferRetryTimersRef.current.forEach(({ timerId }) => window.clearTimeout(timerId));
    groupOfferRetryTimersRef.current.clear();
    groupOfferRetryAttemptsRef.current.clear();
  }, [closeGroupPeerConnection]);

  const stopScreenShare = useCallback(() => {
    screenShareStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    screenShareStreamRef.current = null;
    setIsScreenSharing(false);
    setIsScreenShareDialogOpen(false);
    setIsScreenShareWindowSelectOpen(false);
    setIsStartingScreenShare(false);
  }, []);

  useEffect(() => () => stopScreenShare(), [stopScreenShare]);

  useEffect(() => {
    let isCancelled = false;

    const startLocalMedia = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        showToast('Camera and microphone are not available in this browser.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideoCall,
        });
        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localMediaStreamRef.current = stream;
        setLocalMediaStream(stream);
      } catch (error) {
        if (!isCancelled) {
          console.warn('Unable to acquire group call media:', error);
          showToast(
            isVideoCall
              ? 'Allow camera and microphone access to use the group video call.'
              : 'Allow microphone access to use the group call.'
          );
        }
      }
    };

    void startLocalMedia();
    return () => {
      isCancelled = true;
      localMediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      localMediaStreamRef.current = null;
    };
  }, [isVideoCall, showToast]);

  useEffect(() => () => closeAllGroupPeerConnections(), [closeAllGroupPeerConnections]);

  useEffect(() => {
    syncRemoteGroupAudioPlayback();
  }, [isOnHold, isSpeakerOn, syncRemoteGroupAudioPlayback]);

  const attachPendingGroupIceCandidates = useCallback(async (peerUserId) => {
    const normalizedPeerUserId = String(peerUserId || '').trim();
    const peerConnection = groupPeerConnectionsRef.current.get(normalizedPeerUserId);
    if (!normalizedPeerUserId || !peerConnection?.remoteDescription) return;

    const pendingCandidates = groupPendingIceCandidatesRef.current.get(normalizedPeerUserId) || [];
    groupPendingIceCandidatesRef.current.delete(normalizedPeerUserId);

    for (const candidate of pendingCandidates) {
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.error('Failed to add queued group call ICE candidate:', error);
      }
    }
  }, []);

  const createGroupPeerConnection = useCallback((peerUserId) => {
    const normalizedPeerUserId = String(peerUserId || '').trim();
    const normalizedGroupCallId = String(activeGroupCallIdRef.current || '').trim();
    const localStream = localMediaStreamRef.current;

    if (!normalizedGroupCallId || !normalizedPeerUserId || normalizedPeerUserId === normalizedCurrentUserId) {
      return null;
    }

    const existingPeerConnection = groupPeerConnectionsRef.current.get(normalizedPeerUserId);
    if (existingPeerConnection) return existingPeerConnection;

    const PeerConnectionConstructor =
      window.RTCPeerConnection ||
      window.webkitRTCPeerConnection ||
      window.mozRTCPeerConnection;

    if (!PeerConnectionConstructor) {
      throw new Error('Group calls are not supported in this browser.');
    }
    if (!localStream) {
      throw new Error('Microphone is not ready yet.');
    }

    const peerConnection = new PeerConnectionConstructor(GROUP_CALL_RTC_CONFIGURATION);
    groupPeerConnectionsRef.current.set(normalizedPeerUserId, peerConnection);

    localStream.getTracks?.().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      socketService.sendGroupIceCandidate({
        groupCallId: normalizedGroupCallId,
        targetUserId: normalizedPeerUserId,
        candidate: event.candidate,
      }).catch((error) => {
        console.error('Failed to send group call ICE candidate:', error);
      });
    };

    peerConnection.ontrack = (event) => {
      const [eventStream] = event.streams || [];
      const remoteStream =
        groupRemoteStreamsRef.current.get(normalizedPeerUserId) ||
        eventStream ||
        new MediaStream();

      if (event.track && !remoteStream.getTracks().includes(event.track)) {
        remoteStream.addTrack(event.track);
      }
      if (event.track?.kind === 'audio') {
        event.track.enabled = !isOnHoldRef.current && isSpeakerOnRef.current;
      }
      if (event.track?.kind === 'video') {
        const bumpRemoteMediaStreamVersion = () => {
          setRemoteMediaStreamVersion((currentVersion) => currentVersion + 1);
        };
        event.track.onmute = bumpRemoteMediaStreamVersion;
        event.track.onunmute = bumpRemoteMediaStreamVersion;
        event.track.onended = bumpRemoteMediaStreamVersion;
      }

      groupRemoteStreamsRef.current.set(normalizedPeerUserId, remoteStream);
      setRemoteMediaStreamVersion((currentVersion) => currentVersion + 1);
      const audio = ensureRemoteGroupAudioElement(normalizedPeerUserId);
      if (audio && audio.srcObject !== remoteStream) {
        audio.srcObject = remoteStream;
      }
      syncRemoteGroupAudioPlayback();
    };

    const syncConnectionState = () => {
      const state = peerConnection.connectionState || peerConnection.iceConnectionState || '';
      if (state === 'failed' || state === 'closed') {
        closeGroupPeerConnection(normalizedPeerUserId);
      }
    };
    peerConnection.onconnectionstatechange = syncConnectionState;
    peerConnection.oniceconnectionstatechange = syncConnectionState;

    return peerConnection;
  }, [
    closeGroupPeerConnection,
    ensureRemoteGroupAudioElement,
    normalizedCurrentUserId,
    syncRemoteGroupAudioPlayback,
  ]);

  const startGroupWebRtcOffer = useCallback(async (peerUserId) => {
    const normalizedPeerUserId = String(peerUserId || '').trim();
    const normalizedGroupCallId = String(activeGroupCallIdRef.current || '').trim();
    if (
      !normalizedGroupCallId ||
      !normalizedPeerUserId ||
      !normalizedCurrentUserId ||
      normalizedPeerUserId === normalizedCurrentUserId ||
      normalizedCurrentUserId > normalizedPeerUserId ||
      groupOfferInProgressRef.current.has(normalizedPeerUserId)
    ) {
      return;
    }

    const existingPeerConnection = groupPeerConnectionsRef.current.get(normalizedPeerUserId);
    if (existingPeerConnection?.remoteDescription) return;

    groupOfferInProgressRef.current.add(normalizedPeerUserId);
    try {
      const peerConnection = createGroupPeerConnection(normalizedPeerUserId);
      if (!peerConnection) return;

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: isVideoCall,
      });
      await peerConnection.setLocalDescription(offer);
      await socketService.sendGroupCallOffer({
        groupCallId: normalizedGroupCallId,
        targetUserId: normalizedPeerUserId,
        offer: peerConnection.localDescription || offer,
      });
      groupOfferRetryAttemptsRef.current.delete(normalizedPeerUserId);
    } catch (error) {
      closeGroupPeerConnection(normalizedPeerUserId);
      console.warn('Unable to start group call audio with participant:', error);
      // A participant can appear in the UI before the server has completed the
      // group_call_join write. Retry the offer briefly so that enrollment race
      // does not leave the participant without published media.
      const attempt = Number(groupOfferRetryAttemptsRef.current.get(normalizedPeerUserId) || 0) + 1;
      if (attempt <= GROUP_CALL_MAX_OFFER_RETRIES) {
        groupOfferRetryAttemptsRef.current.set(normalizedPeerUserId, attempt);
        const timerId = window.setTimeout(() => {
          groupOfferRetryTimersRef.current.delete(normalizedPeerUserId);
          void startGroupWebRtcOfferRef.current?.(normalizedPeerUserId);
        }, GROUP_CALL_OFFER_RETRY_DELAY_MS);
        groupOfferRetryTimersRef.current.set(normalizedPeerUserId, { timerId });
      }
    } finally {
      groupOfferInProgressRef.current.delete(normalizedPeerUserId);
    }
  }, [
    closeGroupPeerConnection,
    createGroupPeerConnection,
    isVideoCall,
    normalizedCurrentUserId,
  ]);

  startGroupWebRtcOfferRef.current = startGroupWebRtcOffer;

  const acceptGroupWebRtcOffer = useCallback(async ({ fromUserId, offer } = {}) => {
    const normalizedPeerUserId = String(fromUserId || '').trim();
    const normalizedGroupCallId = String(activeGroupCallIdRef.current || '').trim();
    if (!normalizedGroupCallId || !normalizedPeerUserId || !offer) return;
    if (!localMediaStreamRef.current) {
      groupPendingOffersRef.current.set(normalizedPeerUserId, { fromUserId: normalizedPeerUserId, offer });
      return;
    }

    try {
      const peerConnection = createGroupPeerConnection(normalizedPeerUserId);
      if (!peerConnection || peerConnection.signalingState !== 'stable') return;

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      await attachPendingGroupIceCandidates(normalizedPeerUserId);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await socketService.sendGroupCallAnswer({
        groupCallId: normalizedGroupCallId,
        targetUserId: normalizedPeerUserId,
        answer: peerConnection.localDescription || answer,
      });
    } catch (error) {
      closeGroupPeerConnection(normalizedPeerUserId);
      console.error('Failed to accept group call WebRTC offer:', error);
    }
  }, [attachPendingGroupIceCandidates, closeGroupPeerConnection, createGroupPeerConnection]);

  const acceptGroupWebRtcAnswer = useCallback(async ({ fromUserId, answer } = {}) => {
    const normalizedPeerUserId = String(fromUserId || '').trim();
    const peerConnection = groupPeerConnectionsRef.current.get(normalizedPeerUserId);
    if (!normalizedPeerUserId || !peerConnection || !answer || peerConnection.remoteDescription) return;

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      await attachPendingGroupIceCandidates(normalizedPeerUserId);
    } catch (error) {
      closeGroupPeerConnection(normalizedPeerUserId);
      console.error('Failed to accept group call WebRTC answer:', error);
    }
  }, [attachPendingGroupIceCandidates, closeGroupPeerConnection]);

  const addGroupWebRtcIceCandidate = useCallback(async ({ fromUserId, candidate } = {}) => {
    const normalizedPeerUserId = String(fromUserId || '').trim();
    if (!normalizedPeerUserId || !candidate) return;

    const rtcCandidate = new RTCIceCandidate(candidate);
    const peerConnection = groupPeerConnectionsRef.current.get(normalizedPeerUserId);

    if (!peerConnection?.remoteDescription) {
      const pendingCandidates = groupPendingIceCandidatesRef.current.get(normalizedPeerUserId) || [];
      groupPendingIceCandidatesRef.current.set(normalizedPeerUserId, [...pendingCandidates, rtcCandidate]);
      return;
    }

    try {
      await peerConnection.addIceCandidate(rtcCandidate);
    } catch (error) {
      console.error('Failed to add group call ICE candidate:', error);
    }
  }, []);

  useEffect(() => {
    if (!localMediaStream || !activeGroupCallId) return;
    const pendingOffers = Array.from(groupPendingOffersRef.current.values());
    groupPendingOffersRef.current.clear();
    pendingOffers.forEach((payload) => {
      acceptGroupWebRtcOffer(payload);
    });
  }, [acceptGroupWebRtcOffer, activeGroupCallId, localMediaStream]);

  useEffect(() => {
    const statuses = Object.entries(participantStatuses || {});
    if (!statuses.length) return;
    setCall((current) => statuses.reduce(
      (nextCall, [participantId, status]) => setParticipantStatus(nextCall, participantId, status),
      current
    ));
  }, [participantStatuses]);

  // Auto-dismiss the transient toast.
  useEffect(() => {
    if (!toast) return undefined;
    const timerId = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timerId);
  }, [toast]);

  // Call duration timer.
  useEffect(() => {
    const startedAtMs = new Date(call.startedAt).getTime();
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [call.startedAt]);

  // Escape closes an open panel/menu, or leaves the call screen.
  useEffect(() => {
    if (isMinimized) return undefined;
    const handleKey = (event) => {
      if (event.key !== 'Escape') return;
      if (openTileMenuId) setOpenTileMenuId('');
      else if (panel) setPanel('');
      else onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isMinimized, onClose, openTileMenuId, panel]);

  // Stable signal of who is currently ringing (added mid-call, not yet answered).
  const ringingKey = useMemo(
    () =>
      call.participants
        .filter((participant) => isRingingParticipantStatus(participant.status))
        .map((participant) => participant.id)
        .sort()
        .join(','),
    [call.participants]
  );

  // Simulate each invited participant answering and joining the grid after a
  // short ring. Keyed on the set of ringing ids so unrelated in-call changes
  // (mute, pin, ...) never reset a pending join. Timers are torn down on unmount.
  useEffect(() => {
    if (!ringingKey) return undefined;
    const ringingIds = ringingKey.split(',');
    const timers = ringingIds.map((id) =>
      window.setTimeout(() => {
        setCall((current) => setParticipantStatus(current, id, GROUP_CALL_PARTICIPANT_STATUS.CONNECTED));
      }, RING_TO_CONNECT_MS)
    );
    return () => timers.forEach((timerId) => window.clearTimeout(timerId));
  }, [ringingKey]);

  const selfParticipant = useMemo(
    () => call.participants.find((participant) => participant.isCurrentUser) || null,
    [call.participants]
  );
  const isSelfMuted = Boolean(selfParticipant?.isMuted);
  const isSelfCameraOn = Boolean(selfParticipant?.isCameraOn);
  const canManage = Boolean(
    selfParticipant?.isOrganizer ||
      selfParticipant?.role === 'admin' ||
      selfParticipant?.role === 'moderator'
  );

  const connectedParticipants = useMemo(() => getConnectedParticipants(call), [call]);
  const effectiveVideoBackground = networkLowBandwidthMode ? 'none' : videoBackground;
  const effectiveResolution = useMemo(
    () => (networkLowBandwidthMode && adaptiveBitrate ? '360p' : maximumVideoResolution),
    [adaptiveBitrate, maximumVideoResolution, networkLowBandwidthMode]
  );
  const connectionQualityLevel = useMemo(
    () => getNetworkQualityLevel(effectiveResolution, adaptiveBitrate, networkLowBandwidthMode),
    [adaptiveBitrate, effectiveResolution, networkLowBandwidthMode]
  );
  const spotlightId = useMemo(
    () => (focusOnSpeaker ? getSpotlightParticipantId(call) : String(call?.pinnedId || '').trim()),
    [call, focusOnSpeaker]
  );
  const gridParticipants = useMemo(() => {
    let items = connectedParticipants.filter(
      (participant) => !blockUnverifiedParticipants || isParticipantVerified(participant)
    );
    if ((defaultView === 'Speaker View' || defaultView === 'Focus Mode') && spotlightId) {
      const spotlightParticipant = items.find((participant) => participant.id === spotlightId);
      if (spotlightParticipant) {
        items = [
          spotlightParticipant,
          ...items.filter((participant) => participant.id !== spotlightId),
        ];
      }
    }
    const limit =
      gridSize === 'Auto' ? items.length : Math.max(1, Number(gridSize) || items.length);
    return items.slice(0, limit);
  }, [blockUnverifiedParticipants, connectedParticipants, defaultView, gridSize, spotlightId]);
  const remoteMediaStreamsByParticipantId = useMemo(
    () => new Map(groupRemoteStreamsRef.current),
    [remoteMediaStreamVersion]
  );
  const participantCount = connectedParticipants.length;
  const hiddenParticipantCount = Math.max(0, participantCount - gridParticipants.length);
  const spotlightParticipant = useMemo(
    () =>
      gridParticipants.find((participant) => participant.id === spotlightId) ||
      connectedParticipants.find((participant) => participant.id === spotlightId) ||
      gridParticipants[0] ||
      null,
    [connectedParticipants, gridParticipants, spotlightId]
  );
  const gridColumns = useMemo(() => {
    if (defaultView === 'Speaker View') return 1;
    if (defaultView === 'Focus Mode') {
      return Math.min(2, getGroupCallGridColumns(gridParticipants.length));
    }
    return getGroupCallGridColumns(gridParticipants.length);
  }, [defaultView, gridParticipants.length]);
  const durationText = formatGroupCallDuration(elapsedSeconds);
  const isSettingsOpen = panel === 'settings';
  const groupSignalParticipantIds = useMemo(
    () =>
      connectedParticipants
        .map((participant) => String(participant?.id || '').trim())
        .filter((participantId) => participantId && participantId !== normalizedCurrentUserId)
        .sort(),
    [connectedParticipants, normalizedCurrentUserId]
  );
  const groupSignalParticipantKey = useMemo(
    () =>
      [
        activeGroupCallId,
        localMediaStream?.id || '',
        ...groupSignalParticipantIds,
        ...Object.entries(participantStatuses || {})
          .map(([participantId, status]) => `${participantId}:${status}`)
          .sort(),
      ].join('|'),
    [activeGroupCallId, groupSignalParticipantIds, localMediaStream?.id, participantStatuses]
  );

  useEffect(() => {
    if (!activeGroupCallId) return undefined;
    return socketService.onGroupCallSignal((payload = {}) => {
      const signalGroupCallId = String(payload?.groupCallId || payload?.callId || '').trim();
      const fromUserId = String(payload?.fromUserId || payload?.from || payload?.userId || '').trim();
      if (
        signalGroupCallId !== activeGroupCallId ||
        !fromUserId ||
        fromUserId === normalizedCurrentUserId
      ) {
        return;
      }

      if (payload?.type === 'offer') {
        acceptGroupWebRtcOffer({ fromUserId, offer: payload.offer });
        return;
      }
      if (payload?.type === 'answer') {
        acceptGroupWebRtcAnswer({ fromUserId, answer: payload.answer });
        return;
      }
      if (payload?.type === 'ice') {
        addGroupWebRtcIceCandidate({ fromUserId, candidate: payload.candidate });
      }
    });
  }, [
    acceptGroupWebRtcAnswer,
    acceptGroupWebRtcOffer,
    activeGroupCallId,
    addGroupWebRtcIceCandidate,
    normalizedCurrentUserId,
  ]);

  useEffect(() => {
    if (!activeGroupCallId || !localMediaStream || !normalizedCurrentUserId) return;

    groupSignalParticipantIds.forEach((participantId) => {
      startGroupWebRtcOffer(participantId);
    });

    const connectedPeerIds = new Set(groupSignalParticipantIds);
    Array.from(groupPeerConnectionsRef.current.keys()).forEach((peerUserId) => {
      if (!connectedPeerIds.has(peerUserId)) {
        closeGroupPeerConnection(peerUserId);
      }
    });
  }, [
    activeGroupCallId,
    closeGroupPeerConnection,
    groupSignalParticipantIds,
    groupSignalParticipantKey,
    localMediaStream,
    normalizedCurrentUserId,
    startGroupWebRtcOffer,
  ]);

  useEffect(() => {
    if (previousParticipantCountRef.current == null) {
      previousParticipantCountRef.current = participantCount;
      return;
    }
    if (!playJoinLeaveSounds || previousParticipantCountRef.current === participantCount) {
      previousParticipantCountRef.current = participantCount;
      return;
    }
    const delta = participantCount - previousParticipantCountRef.current;
    previousParticipantCountRef.current = participantCount;
    const soundSuffix = notificationSound !== 'Silent' ? ` • ${notificationSound}` : '';
    showToast(
      `${Math.abs(delta)} participant${Math.abs(delta) === 1 ? '' : 's'} ${
        delta > 0 ? 'joined' : 'left'
      }${soundSuffix}`
    );
  }, [notificationSound, participantCount, playJoinLeaveSounds, showToast]);

  useEffect(() => {
    if (!spotlightId) {
      previousSpotlightIdRef.current = '';
      return;
    }
    if (!notifyWhenSomeoneSpeaks) {
      previousSpotlightIdRef.current = spotlightId;
      return;
    }
    if (
      previousSpotlightIdRef.current &&
      previousSpotlightIdRef.current !== spotlightId &&
      spotlightParticipant?.name
    ) {
      const soundSuffix = notificationSound !== 'Silent' ? ` • ${notificationSound}` : '';
      showToast(`${spotlightParticipant.name} is speaking${soundSuffix}`);
    }
    previousSpotlightIdRef.current = spotlightId;
  }, [notificationSound, notifyWhenSomeoneSpeaks, showToast, spotlightId, spotlightParticipant]);

  // --- Handlers --------------------------------------------------------------

  const handleToggleSelfMute = useCallback(() => {
    if (!normalizedCurrentUserId) return;
    localMediaStreamRef.current?.getAudioTracks?.().forEach((track) => {
      track.enabled = isSelfMuted && !isOnHold;
    });
    setCall((current) => toggleParticipantMuted(current, normalizedCurrentUserId));
  }, [isOnHold, isSelfMuted, normalizedCurrentUserId]);

  const handleToggleSelfCamera = useCallback(() => {
    if (!normalizedCurrentUserId || !isVideoCall) return;
    localMediaStreamRef.current?.getVideoTracks?.().forEach((track) => {
      track.enabled = !isSelfCameraOn && !isOnHold;
    });
    setCall((current) => toggleParticipantCamera(current, normalizedCurrentUserId));
  }, [isOnHold, isSelfCameraOn, isVideoCall, normalizedCurrentUserId]);

  useEffect(() => {
    localMediaStreamRef.current?.getAudioTracks?.().forEach((track) => {
      track.enabled = !isSelfMuted && !isOnHold;
    });
    localMediaStreamRef.current?.getVideoTracks?.().forEach((track) => {
      track.enabled = isSelfCameraOn && !isOnHold;
    });
  }, [isOnHold, isSelfCameraOn, isSelfMuted, localMediaStream]);

  const handleToggleParticipantMute = useCallback((id) => {
    setCall((current) => toggleParticipantMuted(current, id));
    setOpenTileMenuId('');
  }, []);

  const handleRemoveParticipant = useCallback((id) => {
    setCall((current) => removeGroupCallParticipant(current, id));
    setOpenTileMenuId('');
    showToast('Participant removed from the call.');
  }, [showToast]);

  const handlePinParticipant = useCallback((id) => {
    setCall((current) => pinParticipant(current, id));
    setOpenTileMenuId('');
  }, []);

  const handleToggleTileMenu = useCallback((id) => {
    setOpenTileMenuId((current) => (current === id ? '' : id));
  }, []);

  const handleAddParticipants = useCallback((selectedContacts) => {
    if (!selectedContacts?.length) return;
    const additions = selectedContacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      profilePic: contact.profilePic,
      isVerified: contact?.isVerified ?? contact?.verified ?? true,
      status: GROUP_CALL_PARTICIPANT_STATUS.RINGING,
    }));

    // Added as "Ringing" - the ring->connect effect above moves each to the grid.
    setCall((current) => addGroupCallParticipants(current, additions));
    setPanel('participants');
    showToast(`Inviting ${additions.length} ${additions.length === 1 ? 'participant' : 'participants'}...`);
  }, [showToast]);

  const handleToggleLock = useCallback(() => {
    setCall((current) => toggleMeetingLocked(current));
  }, []);

  const handleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      stopScreenShare();
      showToast('Screen sharing stopped.');
      return;
    }

    setScreenShareMode('screen');
    setIsScreenShareWindowSelectOpen(false);
    setSelectedScreenShareWindow(0);
    setIsScreenShareDialogOpen(true);
  }, [isScreenSharing, showToast, stopScreenShare]);

  const handleStartScreenShare = useCallback(async () => {
    if (isStartingScreenShare) {
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      showToast('Screen sharing is not supported in this browser.');
      return;
    }

    setIsStartingScreenShare(true);
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: isScreenShareAudioEnabled,
      });
      const displayTrack = displayStream?.getVideoTracks?.()[0];

      if (!displayTrack) {
        displayStream?.getTracks?.().forEach((track) => track.stop());
        showToast('Unable to start screen sharing.');
        return;
      }

      screenShareStreamRef.current = displayStream;
      displayTrack.onended = () => {
        stopScreenShare();
      };
      setIsScreenSharing(true);
      setIsScreenShareDialogOpen(false);
      setIsScreenShareWindowSelectOpen(false);
      showToast('Screen sharing started.');
    } catch (error) {
      if (String(error?.name || '') !== 'NotAllowedError') {
        console.error('Failed to start group screen share:', error);
      }
      showToast('Screen sharing was cancelled.');
    } finally {
      setIsStartingScreenShare(false);
    }
  }, [isScreenShareAudioEnabled, isStartingScreenShare, showToast, stopScreenShare]);

  const handleShareDialogPrimaryAction = useCallback(() => {
    if (screenShareMode === 'window' && !isScreenShareWindowSelectOpen) {
      setIsScreenShareWindowSelectOpen(true);
      return;
    }

    void handleStartScreenShare();
  }, [handleStartScreenShare, isScreenShareWindowSelectOpen, screenShareMode]);

  const handleToggleParticipantsPanel = useCallback(() => {
    setPanel((current) => (current === 'participants' ? '' : 'participants'));
  }, []);

  const handleToggleSettingsPanel = useCallback(() => {
    setSettingsTab('audio-video');
    setOpenTileMenuId('');
    setPanel((current) => (current === 'settings' ? '' : 'settings'));
  }, []);

  const handleToggleChatPanel = useCallback(() => {
    setOpenTileMenuId('');
    setPanel((current) => (current === 'chat' ? '' : 'chat'));
  }, []);

  const handleResetSettings = useCallback(() => {
    setMicrophoneDevice(CALL_SETTINGS_DEVICE_OPTIONS.microphones[0]);
    setSpeakerDevice(CALL_SETTINGS_DEVICE_OPTIONS.speakers[0]);
    setCameraDevice(CALL_SETTINGS_DEVICE_OPTIONS.cameras[0]);
    setVideoBackground('none');
    setIsMirrorVideo(true);
    showToast('Call settings reset to default.');
  }, [showToast]);

  const handleVideoBackgroundChange = useCallback((nextBackground) => {
    setVideoBackground(nextBackground);
    if (nextBackground !== 'none') {
      setNetworkLowBandwidthMode(false);
    }
  }, []);

  const handleResetPreferences = useCallback(() => {
    setShowReactions(false);
    setShowParticipantNames(true);
    setPlayJoinLeaveSounds(true);
    setFocusOnSpeaker(true);
    setNotifyWhenSomeoneSpeaks(true);
    setNotificationSound('Chime');
    setDefaultView('Grid View');
    setGridSize('16');
    setHighContrastMode(true);
    setCaptions(false);
    showToast('Preferences reset to default.');
  }, [showToast]);

  const handleOpenEncryptionDetails = useCallback(() => {
    showToast('End-to-end encryption is active for this call.');
  }, [showToast]);

  const handleResetAdvanced = useCallback(() => {
    setNetworkLowBandwidthMode(true);
    setNetworkQualityIndicator(true);
    setAdaptiveBitrate(true);
    setMaximumVideoResolution(DEFAULT_ADVANCED_VIDEO_RESOLUTION);
    setVerifyParticipants(true);
    setBlockUnverifiedParticipants(true);
    showToast('Advanced settings reset to default.');
  }, [showToast]);

  // Control-bar model shared by the one-row and two-row layouts.
  const primaryControls = [
    { key: 'add', label: 'Add', tooltip: 'Add Participant', icon: <PersonAddIcon size={16} />, onClick: () => setPanel('add') },
    { key: 'mic', label: isSelfMuted ? 'Unmute' : 'Mute', tooltip: isSelfMuted ? 'Unmute' : 'Mute', icon: <MicIcon size={16} muted={isSelfMuted} />, active: isSelfMuted, artwork: isSelfMuted ? groupCallControlUnmute : '', onClick: handleToggleSelfMute },
    { key: 'speaker', label: 'Speaker', tooltip: isSpeakerOn ? 'Speaker Off' : 'Speaker On', icon: <SpeakerIcon size={16} />, active: isSpeakerOn, artwork: isSpeakerOn ? groupCallControlSpeaker : '', onClick: () => setIsSpeakerOn((value) => !value) },
    { key: 'hold', label: 'Hold', tooltip: isOnHold ? 'Resume Call' : 'Hold', icon: <HoldIcon size={16} />, active: isOnHold, onClick: () => setIsOnHold((value) => !value) },
    { key: 'screen', label: 'Screen Share', tooltip: isScreenSharing ? 'Stop Screen Share' : 'Screen Share', icon: <ScreenShareIcon size={16} />, active: isScreenSharing, artwork: !isScreenSharing ? groupCallControlScreenShare : '', onClick: handleScreenShare },
  ];
  const secondaryControls = [
    { key: 'participants', label: 'Participants', tooltip: 'Participants', icon: <ParticipantsIcon size={16} />, active: panel === 'participants', badge: participantCount, artwork: participantCount === 16 && panel !== 'participants' ? groupCallControlParticipants : '', onClick: handleToggleParticipantsPanel },
    { key: 'chat', label: 'Chat', icon: <ChatIcon size={16} />, active: panel === 'chat', onClick: handleToggleChatPanel },
    { key: 'settings', label: 'Settings', icon: <SettingsIcon size={16} />, active: isSettingsOpen, artwork: !isSettingsOpen ? groupCallControlSettings : '', onClick: handleToggleSettingsPanel },
  ];

  const groupTitle = group?.name || group?.groupName || 'Group call';

  if (isMinimized) {
    const floatingParticipant = spotlightParticipant || selfParticipant || connectedParticipants[0] || null;
    const floatingParticipantStream = floatingParticipant?.isCurrentUser
      ? localMediaStream
      : remoteMediaStreamsByParticipantId.get(floatingParticipant?.id) || null;

    return (
      <aside
        className="fixed bottom-6 right-6 z-[300] w-[300px] overflow-hidden rounded-[16px] border border-[#D8E0EB] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.24)]"
        role="dialog"
        aria-label={`Ongoing group call - ${groupTitle}`}
      >
        <div className="flex h-12 items-center justify-between gap-3 border-b border-[#E5EAF2] px-3.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#0F172A]">{groupTitle}</p>
            <p className="text-[11px] font-medium tabular-nums text-[#64748B]">{durationText}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onRestore?.()}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#0F172A] transition-colors hover:bg-[#F1F5F9]"
              aria-label="Return to group call"
              title="Return to group call"
            >
              <ExpandIcon size={16} />
            </button>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#DC2626] transition-colors hover:bg-[#FEF2F2]"
              aria-label="End group call"
              title="End group call"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRestore?.()}
          className="block w-full bg-[#E6EBF1] text-left"
          aria-label="Open group call"
        >
          {floatingParticipant ? (
            <ParticipantTile
              participant={floatingParticipant}
              defaultAvatar={defaultAvatar}
              isSpotlighted={false}
              isPinned={false}
              onToggleMenu={() => {}}
              menuOpen={false}
              onPin={() => {}}
              onToggleMute={() => {}}
              onToggleCamera={handleToggleSelfCamera}
              onRemove={() => {}}
              canManage={false}
              showParticipantNames
              showNetworkQuality={networkQualityIndicator}
              highContrastMode={highContrastMode}
              showReactions={false}
              showVerification={verifyParticipants}
              isMirrorVideo={isMirrorVideo}
              videoBackground={effectiveVideoBackground}
              connectionQualityLevel={connectionQualityLevel}
              defaultView="Grid View"
              localMediaStream={floatingParticipant.isCurrentUser ? floatingParticipantStream : null}
              remoteMediaStream={floatingParticipant.isCurrentUser ? null : floatingParticipantStream}
              isOnHold={floatingParticipant.isCurrentUser && isOnHold}
              hideMenu
            />
          ) : (
            <div className="flex h-[170px] items-center justify-center text-[13px] font-medium text-[#64748B]">
              Waiting for participants...
            </div>
          )}
        </button>

        <div className="flex h-10 items-center justify-between px-3.5 text-[11px] font-medium text-[#64748B]">
          <span>{participantCount} {participantCount === 1 ? 'participant' : 'participants'}</span>
          <span className="text-[#7C3AED]">Ongoing group {isVideoCall ? 'video' : 'voice'} call</span>
        </div>
      </aside>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-white" role="dialog" aria-label={`Group call - ${groupTitle}`}>
      <header
        className="flex h-20 flex-shrink-0 items-center justify-between gap-4 bg-white px-6 sm:px-8"
        style={{ borderBottom: '0.5px solid #D8E0EB' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <img src={mainLogo} alt="" className="h-10 w-10 flex-shrink-0 object-contain" />
          <span className="text-[16px] font-extrabold leading-none tracking-normal text-[#24262D]">Chatterly</span>
        </div>

        <label className="mx-auto hidden h-11 w-full max-w-[520px] items-center gap-3 rounded-full border border-[#D8E0EB] bg-[#FAFBFD] px-4 text-[#8A9AB2] shadow-[0_2px_8px_rgba(15,23,42,0.03)] md:flex">
          <SearchIcon size={18} />
          <input
            type="text"
            value=""
            readOnly
            placeholder="Search anything in chatterly"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[#475569] outline-none placeholder:text-[#94A3B8]"
            aria-label="Search anything in chatterly"
          />
          <span className="inline-flex rounded-full border border-[#D8E0EB] bg-white px-3 py-1 text-[11px] font-medium text-[#94A3B8]">
            Ctrl +K
          </span>
        </label>
        {currentUserAvatar ? (
          <img
            src={currentUserAvatar}
            alt={currentUserName}
            onError={(event) => {
              if (defaultAvatar) event.currentTarget.src = defaultAvatar;
            }}
            className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <Avatar name={currentUserName} src={currentUserAvatar} defaultAvatar={defaultAvatar} size={40} />
        )}
      </header>

      {isScreenSharing ? (
        <div className="absolute left-1/2 top-5 z-[330] flex h-[38px] -translate-x-1/2 items-center gap-3 rounded-[4px] bg-[#030712] px-3 text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)]">
          <span className="flex h-4 w-4 items-center justify-center text-white" aria-hidden="true">
            <ScreenShareIcon size={14} />
          </span>
          <span className="whitespace-nowrap text-[12px] font-medium">You're sharing your screen</span>
          <button
            type="button"
            onClick={() => {
              stopScreenShare();
              showToast('Screen sharing stopped.');
            }}
            className="ml-1 inline-flex h-[24px] items-center justify-center rounded-[3px] bg-[#DC2626] px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-[#B91C1C]"
          >
            Stop Sharing
          </button>
        </div>
      ) : null}

      {isScreenShareDialogOpen ? (
        <div className="pointer-events-none absolute inset-0 z-[320] flex items-end justify-center px-5 pb-[144px] pt-28">
          <div className="pointer-events-auto w-full max-w-[560px] rounded-[4px] bg-white px-4 pb-4 pt-4 shadow-[0_14px_34px_rgba(15,23,42,0.14)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[14px] font-semibold leading-5 text-[#111827]">
                  {isScreenShareWindowSelectOpen ? 'Choose an application window' : 'Share your screen'}
                </h3>
                <p className="mt-1 text-[12px] leading-4 text-[#667085]">
                  {isScreenShareWindowSelectOpen ? 'Select a window to share' : 'Choose what you want to share with others'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsScreenShareDialogOpen(false);
                  setIsScreenShareWindowSelectOpen(false);
                }}
                className="flex h-7 w-7 items-center justify-center text-[#111827] transition-colors hover:text-[#475569]"
                aria-label="Close screen sharing dialog"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            {isScreenShareWindowSelectOpen ? (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <button
                    key={`screen-share-window-${index}`}
                    type="button"
                    onClick={() => setSelectedScreenShareWindow(index)}
                    className={`rounded-[4px] border-2 bg-[#2F343B] p-1 transition-colors ${
                      selectedScreenShareWindow === index ? 'border-[#6D3AEF]' : 'border-transparent hover:border-[#A78BFA]'
                    }`}
                    aria-label={`Select application window ${index + 1}`}
                    aria-pressed={selectedScreenShareWindow === index}
                  >
                    <div className="aspect-[16/9] bg-[#DDE2E8] p-2">
                      <div className="flex h-full flex-col gap-1 bg-white p-1">
                        <div className="h-2 w-10 rounded-sm bg-[#EEE7FF]" />
                        <div className="flex flex-1 gap-1">
                          <div className="w-1/3 rounded-sm bg-[#F1F5F9]" />
                          <div className="flex flex-1 flex-col gap-1">
                            <div className="h-3 rounded-sm bg-[#F1F5F9]" />
                            <div className="flex-1 rounded-sm bg-[#F8FAFC]" />
                            <div className="h-2 w-12 self-end rounded-sm bg-[#8B5CF6]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setScreenShareMode('screen');
                    setIsScreenShareWindowSelectOpen(false);
                  }}
                  className={`flex h-[128px] flex-col items-center justify-center rounded-[4px] border-2 transition-colors ${
                    screenShareMode === 'screen'
                      ? 'border-[#6D3AEF] bg-[#F0E8FF]'
                      : 'border-[#EAECF0] bg-[#F8F8F9] hover:border-[#D8DCE3]'
                  }`}
                  aria-pressed={screenShareMode === 'screen'}
                >
                  <span className="flex h-[42px] items-center justify-center text-[#5B2BEF]" aria-hidden="true">
                    <svg width="42" height="34" viewBox="0 0 58 48" fill="none">
                      <rect x="13.5" y="6.5" width="31" height="25" rx="3.5" stroke="currentColor" strokeWidth="2" />
                      <path d="M29 32v9M19 41h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="mt-3 text-[11px] font-semibold leading-4 text-[#111827]">Entire Screen</span>
                  <span className="mt-0.5 text-[9px] leading-3 text-[#667085]">Share everything on your screen</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScreenShareMode('window')}
                  className={`flex h-[128px] flex-col items-center justify-center rounded-[4px] border transition-colors ${
                    screenShareMode === 'window'
                      ? 'border-2 border-[#6D3AEF] bg-[#F0E8FF]'
                      : 'border-[#EAECF0] bg-[#F8F8F9] hover:border-[#D8DCE3]'
                  }`}
                  aria-pressed={screenShareMode === 'window'}
                >
                  <span className="flex h-[42px] items-center justify-center text-[#111827]" aria-hidden="true">
                    <svg width="42" height="34" viewBox="0 0 58 48" fill="none">
                      <rect x="13.5" y="8.5" width="31" height="24" rx="4.5" stroke="currentColor" strokeWidth="2" />
                      <circle cx="22" cy="16" r="1" fill="currentColor" />
                      <circle cx="28" cy="16" r="1" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="mt-3 text-[11px] font-semibold leading-4 text-[#111827]">Application Window</span>
                  <span className="mt-0.5 text-[9px] leading-3 text-[#667085]">Share a specific app window</span>
                </button>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setIsScreenShareAudioEnabled((currentEnabled) => !currentEnabled)}
                className="flex min-w-0 items-center gap-2 text-left"
                aria-pressed={isScreenShareAudioEnabled}
              >
                <span className={`relative h-[18px] w-[34px] rounded-full transition-colors ${isScreenShareAudioEnabled ? 'bg-[#8B5CF6]' : 'bg-[#DDE5EF]'}`}>
                  <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.18)] transition-transform ${isScreenShareAudioEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                </span>
                <span className="truncate text-[10px] font-medium text-[#344054]">Share computer audio</span>
              </button>

              <div className="flex items-center gap-2">
                {isScreenShareWindowSelectOpen ? (
                  <button
                    type="button"
                    onClick={() => setIsScreenShareWindowSelectOpen(false)}
                    className="inline-flex h-[28px] min-w-[48px] items-center justify-center rounded-[4px] bg-[#F3F4F6] px-3 text-[10px] font-semibold text-[#475569] transition-colors hover:bg-[#E5E7EB]"
                  >
                    Back
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleShareDialogPrimaryAction}
                  disabled={isStartingScreenShare}
                  className="inline-flex h-[28px] min-w-[48px] items-center justify-center rounded-[4px] bg-[#8B5CF6] px-3 text-[10px] font-semibold text-white transition-colors hover:bg-[#7C3AED] disabled:cursor-wait disabled:opacity-75"
                >
                  {isStartingScreenShare ? 'Sharing' : screenShareMode === 'window' && !isScreenShareWindowSelectOpen ? 'Select Window' : 'Share'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Body: grid (+ optional right panel) */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="grid flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center px-5 py-4 sm:px-8">
            <button
              type="button"
              onClick={() => onClose?.()}
              className="inline-flex items-center gap-2 justify-self-start text-[#0F172A] transition-colors hover:text-[#475569]"
              aria-label="Close call screen"
            >
              <CloseIcon size={20} />
              <span className="text-[15px] font-normal">Close</span>
            </button>

            <div className="flex items-center gap-3 rounded-full border border-[#E5EAF2] bg-white px-4 py-2 text-[13px] font-medium text-[#0F172A] shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
              <span className="flex items-center gap-2 text-[#334155]">
                <CameraIcon size={16} />
                <span className="tabular-nums">{durationText}</span>
              </span>
              <span className="h-4 w-px bg-[#E2E8F0]" aria-hidden="true" />
              <span className="flex items-center gap-1.5 text-[#334155]">
                <LockIcon size={13} />
                <span>{call.isLocked ? 'Locked - Encrypted' : 'Encrypted Call'}</span>
              </span>
            </div>

            <div className="justify-self-end">
              <button
                type="button"
                onClick={() => onMinimize?.()}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#0F172A] transition-colors hover:bg-[#F1F5F9]"
                aria-label="Floating window"
                title="Floating window"
              >
                <ExpandIcon size={16} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-8">
            {participantCount ? (
              <div className="mx-auto w-full max-w-[1100px]">
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
                >
                  {gridParticipants.map((participant) => (
                    <div
                      key={participant.id}
                      className={
                        defaultView === 'Focus Mode' &&
                        participant.id === spotlightId &&
                        gridColumns > 1 &&
                        gridParticipants.length > 2
                          ? 'sm:col-span-2'
                          : ''
                      }
                    >
                      <ParticipantTile
                        participant={participant}
                        defaultAvatar={defaultAvatar}
                        isSpotlighted={Boolean(spotlightId) && participant.id === spotlightId}
                        isPinned={participant.id === call.pinnedId}
                        menuOpen={openTileMenuId === participant.id}
                        onToggleMenu={handleToggleTileMenu}
                        onPin={handlePinParticipant}
                        onToggleMute={handleToggleParticipantMute}
                        onToggleCamera={handleToggleSelfCamera}
                        onRemove={handleRemoveParticipant}
                        canManage={canManage}
                        showParticipantNames={showParticipantNames}
                        showNetworkQuality={networkQualityIndicator}
                        highContrastMode={highContrastMode}
                        showReactions={showReactions}
                        showVerification={verifyParticipants}
                        isMirrorVideo={isMirrorVideo}
                        videoBackground={effectiveVideoBackground}
                        connectionQualityLevel={connectionQualityLevel}
                        defaultView={defaultView}
                        localMediaStream={participant.isCurrentUser ? localMediaStream : null}
                        remoteMediaStream={participant.isCurrentUser ? null : remoteMediaStreamsByParticipantId.get(participant.id) || null}
                        isOnHold={participant.isCurrentUser && isOnHold}
                      />
                    </div>
                  ))}
                </div>
                {hiddenParticipantCount ? (
                  <p className="mt-3 text-center text-[12px] font-medium text-[#64748B]">
                    Showing {gridParticipants.length} of {participantCount} participants
                  </p>
                ) : null}
                {networkLowBandwidthMode ? (
                  <p className="mt-3 text-center text-[12px] font-medium text-[#7C3AED]">
                    Low bandwidth mode is reducing background effects for smoother calling.
                  </p>
                ) : null}
                {captions && spotlightParticipant ? (
                  <div className="mt-3 flex justify-center">
                    <span className="rounded-full bg-[#0F172A] px-4 py-2 text-[12px] font-medium text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)]">
                      Live captions: {spotlightParticipant.name} is speaking
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <h2 className="text-[18px] font-semibold text-[#111827]">Waiting for participants...</h2>
                <p className="mt-1 text-[13px] text-[#94A3B8]">Invite members to start the conversation.</p>
              </div>
            )}
          </div>

          {/* Control bar */}
          <div className="flex flex-shrink-0 justify-center px-4 pb-6 pt-2">
            <div className="relative w-full max-w-[848px]">
              <div
                className="box-border flex h-[120px] w-[848px] max-w-full items-start gap-[12px] overflow-hidden rounded-[9px] border-[0.5px] border-[#E2E8F0] bg-white px-[16px] pb-[32px] pt-[16px] shadow-[0_6px_20px_rgba(15,23,42,0.06)]"
              >
                {primaryControls.map((control) => (
                  <ControlButton key={control.key} {...control} />
                ))}
                {secondaryControls.map((control) => (
                  <ControlButton key={control.key} {...control} />
                ))}
                <button
                  key="end"
                  type="button"
                  onClick={() => onClose?.()}
                  className="group flex h-[72px] w-[80px] flex-none flex-col items-center p-0"
                  aria-label="End call"
                  title="End call"
                >
                  <EndCallButtonIcon />
                  <span className="mt-[8px] whitespace-nowrap text-[12px] font-normal leading-4 text-[#DC2626]">
                    End call
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {panel === 'participants' ? (
          <ParticipantsPanel
            participants={call.participants}
            spotlightId={spotlightId}
            defaultAvatar={defaultAvatar}
            canManage={canManage}
            onClose={() => setPanel('')}
            onOpenAddParticipants={() => setPanel('add')}
            onToggleMute={handleToggleParticipantMute}
            onRemove={handleRemoveParticipant}
            onPin={handlePinParticipant}
          />
        ) : null}

        {panel === 'add' ? (
          <AddParticipantsPanel
            contacts={addableContacts}
            defaultAvatar={defaultAvatar}
            isLocked={call.isLocked}
            onBack={() => setPanel('participants')}
            onClose={() => setPanel('')}
            onAdd={handleAddParticipants}
          />
        ) : null}

        {panel === 'chat' ? (
          <InCallChatPanel
            messages={messages}
            currentUserId={currentUserId}
            onClose={() => setPanel('')}
            onSendMessage={onSendMessage}
          />
        ) : null}

        {panel === 'settings' ? (
          <CallSettingsPanel
            activeTab={settingsTab}
            onTabChange={setSettingsTab}
            onClose={() => setPanel('')}
            microphoneDevice={microphoneDevice}
            onMicrophoneDeviceChange={setMicrophoneDevice}
            speakerDevice={speakerDevice}
            onSpeakerDeviceChange={setSpeakerDevice}
            cameraDevice={cameraDevice}
            onCameraDeviceChange={setCameraDevice}
            onTestSpeaker={() => showToast('Playing test speaker tone.')}
            videoBackground={videoBackground}
            onVideoBackgroundChange={handleVideoBackgroundChange}
            isMirrorVideo={isMirrorVideo}
            onMirrorVideoChange={setIsMirrorVideo}
            onReset={handleResetSettings}
            canManage={canManage}
            isLocked={call.isLocked}
            onToggleLock={handleToggleLock}
            previewParticipant={selfParticipant}
            defaultAvatar={defaultAvatar}
            showReactions={showReactions}
            onShowReactionsChange={setShowReactions}
            showParticipantNames={showParticipantNames}
            onShowParticipantNamesChange={setShowParticipantNames}
            playJoinLeaveSounds={playJoinLeaveSounds}
            onPlayJoinLeaveSoundsChange={setPlayJoinLeaveSounds}
            focusOnSpeaker={focusOnSpeaker}
            onFocusOnSpeakerChange={setFocusOnSpeaker}
            notifyWhenSomeoneSpeaks={notifyWhenSomeoneSpeaks}
            onNotifyWhenSomeoneSpeaksChange={setNotifyWhenSomeoneSpeaks}
            notificationSound={notificationSound}
            onNotificationSoundChange={setNotificationSound}
            defaultView={defaultView}
            onDefaultViewChange={setDefaultView}
            gridSize={gridSize}
            onGridSizeChange={setGridSize}
            highContrastMode={highContrastMode}
            onHighContrastModeChange={setHighContrastMode}
            captions={captions}
            onCaptionsChange={setCaptions}
            networkLowBandwidthMode={networkLowBandwidthMode}
            onNetworkLowBandwidthModeChange={setNetworkLowBandwidthMode}
            networkQualityIndicator={networkQualityIndicator}
            onNetworkQualityIndicatorChange={setNetworkQualityIndicator}
            adaptiveBitrate={adaptiveBitrate}
            onAdaptiveBitrateChange={setAdaptiveBitrate}
            maximumVideoResolution={maximumVideoResolution}
            onMaximumVideoResolutionChange={setMaximumVideoResolution}
            verifyParticipants={verifyParticipants}
            onVerifyParticipantsChange={setVerifyParticipants}
            blockUnverifiedParticipants={blockUnverifiedParticipants}
            onBlockUnverifiedParticipantsChange={setBlockUnverifiedParticipants}
            onOpenEncryptionDetails={handleOpenEncryptionDetails}
            onAdvancedReset={handleResetAdvanced}
            onPreferencesReset={handleResetPreferences}
          />
        ) : null}
      </div>

      {toast ? (
        <div className="pointer-events-none fixed bottom-28 left-1/2 z-[310] -translate-x-1/2 rounded-full bg-[#0F172A] px-4 py-2 text-[13px] font-medium text-white shadow-[0_10px_30px_rgba(15,23,42,0.25)]">
          {toast}
        </div>
      ) : null}
    </div>
  );
}







