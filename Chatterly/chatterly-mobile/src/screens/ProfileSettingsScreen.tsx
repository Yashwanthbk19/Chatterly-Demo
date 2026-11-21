import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import QRCode from 'react-native-qrcode-svg';
import { EmojiKeyboardToggle, useEmojiKeyboardToggle } from '../components/EmojiKeyboardToggle';
import {
  CallsTabIcon,
  ChatTabIcon,
  ContactTabIcon,
  QrIcon,
  SearchIcon,
  SettingsTabIcon,
} from '../components/ContactsIcons';
import { EmojiPicker, emojiPanelHeight } from '../components/EmojiPicker';
import { Snackbar } from '../components/Snackbar';
import { AppearanceScreen } from './AppearanceScreen';
import { PersonalisationScreen } from './PersonalisationScreen';
import { MediaLinksScreen } from './MediaLinksScreen';
import { NotificationControlsScreen } from './NotificationControlsScreen';
import { PrivacySecurityScreen } from './PrivacySecurityScreen';
import {
  resendEmailOtp,
  sendEmailOtp,
  verifyEmailOtp,
} from '../services/authApi';
import { updateProfile } from '../services/profileApi';
import {formatAccountDateInput, isValidAccountDate, loadAccountDateOfBirth, normalizeAccountDate, normalizeAccountPhone, saveAccountDateOfBirth} from '../services/accountProfile';
import { prepareProfileImage } from '../services/profileImage';
import { getSession, updateSessionUser } from '../services/sessionStore';
import {
  PROFILE_NAME_MAX_LENGTH,
  PROFILE_STATUS_MAX_LENGTH,
  validateProfileImage,
  validateProfileUpdate,
} from '../utils/profileValidation';
import type { AuthUser } from '../types/auth';
import { createThemedStyles, themeInk } from '../theme/themedStyles';

type Props = {
  initialScreen?: 'settings' | 'edit';
  onBack?: () => void;
  onOpenChats: () => void;
  onOpenContacts: () => void;
  onOpenCalls?: () => void;
  onLogout?: () => void | Promise<void>;
  onReportSubmitted?: (message: string) => void;
};
type Screen =
  | 'settings'
  | 'account'
  | 'change-name'
  | 'change-phone'
  | 'change-email'
  | 'change-date-of-birth'
  | 'verify-email-otp'
  | 'edit'
  | 'edit-photo'
  | 'photo'
  | 'qr'
  | 'privacy'
  | 'appearance'
  | 'personalisation'
  | 'notifications'
  | 'media-links'
  | 'storage-data';
type IconName =
  | 'account'
  | 'appearance'
  | 'personalisation'
  | 'notification'
  | 'privacy'
  | 'media'
  | 'devices'
  | 'help';
const FONT = Platform.select({ android: 'sans-serif', ios: 'System' });
const APP_VERSION = Constants.expoConfig?.version || '1.0.0';
const DEFAULT_BIO = 'Hey there! I am using Chatterly';
type Setting = {id: string; title: string; description: string; icon: IconName; screen?: Screen};
const SETTINGS: Setting[] = [
  {
    id: 'account',
    title: 'Account',
    description: 'Phone number, Email and Personal Information.',
    icon: 'account',
  },
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Choose your app theme.',
    icon: 'appearance',
  },
  {
    id: 'personalisation',
    title: 'Personalisation',
    description: 'Customize wallpapers and message bubbles.',
    icon: 'personalisation',
    screen: 'personalisation',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Manage message and call alerts.',
    icon: 'notification',
  },
  {
    id: 'privacy',
    title: 'Privacy',
    description: 'Manage privacy and account security.',
    icon: 'privacy',
  },
  {
    id: 'media-links',
    title: 'Media & Links',
    description: 'Manage shared media and links.',
    icon: 'media',
  },
  {
    id: 'storage-data',
    title: 'Storage and Data',
    description: 'Manage media downloads, storage, and network usage.',
    icon: 'media',
    screen: 'storage-data',
  },
  {
    id: 'devices',
    title: 'Devices',
    description: 'Manage your linked devices.',
    icon: 'devices',
  },
  {
    id: 'help-feedback',
    title: 'Help & Feedback',
    description: 'Get help and send feedback.',
    icon: 'help',
  },
];
const SEARCH_SETTINGS: Setting[] = [
  ...SETTINGS,
  {id: 'call-notifications', title: 'Incoming Call Notifications', description: 'Notifications → Calls', icon: 'notification', screen: 'notifications'},
  {id: 'call-ringtone', title: 'Call Ringtone', description: 'Notifications → Calls', icon: 'notification', screen: 'notifications'},
  {id: 'call-vibration', title: 'Vibrate', description: 'Notifications → Calls', icon: 'notification', screen: 'notifications'},
  {id: 'call-ringtone-sound', title: 'Call Ringtone Sound', description: 'Notifications → Calls', icon: 'notification', screen: 'notifications'},
  {id: 'call-encryption', title: 'End-to-End Encryption', description: 'Privacy → Protect your chats and calls', icon: 'privacy', screen: 'privacy'},
  {id: 'call-data-usage', title: 'Calls', description: 'Media & Links → Data Usage', icon: 'media', screen: 'media-links'},
];

function BackIcon({ light = false }: { light?: boolean }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="m14.5 5-7 7 7 7M8 12h11"
        stroke={light ? themeInk('#FFF') : themeInk('#0B1220')}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function AccountBackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 6L9 12L15 18"
        stroke={themeInk('#0B1220')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function ChevronIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="m9 5 7 7-7 7"
        stroke={themeInk('#526177')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function MailIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3.5}
        y={5.5}
        width={17}
        height={13}
        rx={1.5}
        stroke={themeInk('#344054')}
        strokeWidth={1.4}
      />
      <Path
        d="m4.5 7 7.5 5.5L19.5 7"
        stroke={themeInk('#344054')}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function EditIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path
        d="m14 5 5 5M4 20l4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"
        stroke={themeInk('#7137DD')}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function ShareIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15V4m0 0L8 8m4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke={themeInk('#7137DD')}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function ViewerEditIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 19 19" fill="none">
      <Path
        d="M3.75 4.75011H2.75C2.21957 4.75011 1.71086 4.96082 1.33579 5.33589C0.960714 5.71097 0.75 6.21967 0.75 6.75011V15.7501C0.75 16.2805 0.960714 16.7892 1.33579 17.1643C1.71086 17.5394 2.21957 17.7501 2.75 17.7501H11.75C12.2804 17.7501 12.7891 17.5394 13.1642 17.1643C13.5393 16.7892 13.75 16.2805 13.75 15.7501V14.7501M12.7625 2.76261L14.165 1.36511C14.5588 0.971261 15.093 0.75 15.65 0.75C16.207 0.75 16.7412 0.971261 17.135 1.36511C17.5288 1.75895 17.7501 2.29312 17.7501 2.85011C17.7501 3.40709 17.5288 3.94126 17.135 4.33511L15.7375 5.73761M12.7625 2.76261L5.75 9.75011V12.7501H8.75L15.7375 5.73761M12.7625 2.76261L12.75 2.75011M12.7625 2.76261L15.7375 5.73761M15.7375 5.73761L15.75 5.75011"
        stroke="white"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function CameraIcon() {
  return (
    <Svg width={21} height={18} viewBox="0 0 21 18" fill="none">
      <Path
        d="M4.125 4H3.08333C2.5308 4 2.00089 4.21071 1.61019 4.58579C1.21949 4.96086 1 5.46957 1 6V15C1 15.5304 1.21949 16.0391 1.61019 16.4142C2.00089 16.7893 2.5308 17 3.08333 17H17.6667C18.2192 17 18.7491 16.7893 19.1398 16.4142C19.5305 16.0391 19.75 15.5304 19.75 15V6C19.75 5.46957 19.5305 4.96086 19.1398 4.58579C18.7491 4.21071 18.2192 4 17.6667 4H16.625C16.0725 4 15.5426 3.78929 15.1519 3.41421C14.7612 3.03914 14.5417 2.53043 14.5417 2C14.5417 1.73478 14.4319 1.48043 14.2366 1.29289C14.0412 1.10536 13.7763 1 13.5 1H7.25C6.97373 1 6.70878 1.10536 6.51343 1.29289C6.31808 1.48043 6.20833 1.73478 6.20833 2C6.20833 2.53043 5.98884 3.03914 5.59814 3.41421C5.20744 3.78929 4.67753 4 4.125 4Z"
        stroke={themeInk('#0B1220')}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7.25 10C7.25 10.7956 7.57924 11.5587 8.16529 12.1213C8.75134 12.6839 9.5462 13 10.375 13C11.2038 13 11.9987 12.6839 12.5847 12.1213C13.1708 11.5587 13.5 10.7956 13.5 10C13.5 9.20435 13.1708 8.44129 12.5847 7.87868C11.9987 7.31607 11.2038 7 10.375 7C9.5462 7 8.75134 7.31607 8.16529 7.87868C7.57924 8.44129 7.25 9.20435 7.25 10Z"
        stroke={themeInk('#0B1220')}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function GalleryIcon() {
  return (
    <Svg width={21} height={20} viewBox="0 0 21 20" fill="none">
      <Path
        d="M13.5 6H13.5104M1 14L6.20833 9C7.175 8.107 8.36667 8.107 9.33333 9L14.5417 14M12.4583 12L13.5 11C14.4667 10.107 15.6583 10.107 16.625 11L19.75 14M1 4C1 3.20435 1.32924 2.44129 1.91529 1.87868C2.50134 1.31607 3.2962 1 4.125 1H16.625C17.4538 1 18.2487 1.31607 18.8347 1.87868C19.4208 2.44129 19.75 3.20435 19.75 4V16C19.75 16.7956 19.4208 17.5587 18.8347 18.1213C18.2487 18.6839 17.4538 19 16.625 19H4.125C3.2962 19 2.50134 18.6839 1.91529 18.1213C1.32924 17.5587 1 16.7956 1 16V4Z"
        stroke={themeInk('#0B1220')}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function TrashIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5"
        stroke={themeInk('#EF4444')}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function CloseIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="m6 6 12 12M18 6 6 18"
        stroke={themeInk('#344054')}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}
function SettingIcon({ name }: { name: IconName }) {
  const common = {
    stroke: themeInk('#0B1220'),
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (name === 'notification')
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="M13 21v1a3 3 0 0 0 6 0v-1M14 9a2 2 0 0 1 4 0c2.32 1.1 3.87 3.36 4 6v3c.15 1.25.88 2.36 2 3H8c1.12-.64 1.85-1.75 2-3v-3c.13-2.64 1.68-4.9 4-6Z"
          {...common}
        />
      </Svg>
    );
  if (name === 'appearance')
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="M21 25a4 4 0 0 1-4-4V9a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12a4 4 0 0 1-4 4Zm0 0H9a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2.3M17 11.35l-2-2a2 2 0 0 0-2.83 0l-2.83 2.83a2 2 0 0 0 0 2.83l9 9M21 21v.01"
          {...common}
        />
      </Svg>
    );
  if (name === 'personalisation')
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="m10 24 12-12M18.5 8.5l5 5M9 7v4M7 9h4M24 20v4M22 22h4"
          {...common}
        />
      </Svg>
    );
  if (name === 'media')
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="M19 12h.01M7 20l5-5c.93-.89 2.07-.89 3 0l5 5M18 18l1-1c.93-.89 2.07-.89 3 0l3 3M10 7h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Z"
          {...common}
        />
      </Svg>
    );
  if (name === 'devices')
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="M15 8h2M16 21v.01M12 7h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
          {...common}
        />
      </Svg>
    );
  if (name === 'help')
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="M8 18v-3a8 8 0 0 1 16 0v3M8 18a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3Zm14 5a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1Zm0 0c0 1.66-2.69 3-6 3"
          {...common}
        />
      </Svg>
    );
  if (name === 'privacy')
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <Path
          d="M16.0002 16C15.735 16 15.4806 15.8946 15.2931 15.7071C15.1056 15.5196 15.0002 15.2652 15.0002 15C15.0002 14.7348 15.1056 14.4804 15.2931 14.2929C15.4806 14.1054 15.735 14 16.0002 14C16.2654 14 16.5198 14.1054 16.7073 14.2929C16.8948 14.4804 17.0002 14.7348 17.0002 15C17.0002 15.2652 16.8948 15.5196 16.7073 15.7071C16.5198 15.8946 16.2654 16 16.0002 16ZM16.0002 16V18.5M16.0002 7C18.336 9.06658 21.3847 10.1426 24.5002 10C24.9538 11.543 25.0926 13.1615 24.9083 14.7592C24.7241 16.3569 24.2205 17.9013 23.4276 19.3005C22.6347 20.6998 21.5686 21.9254 20.2927 22.9045C19.0167 23.8836 17.557 24.5962 16.0002 25C14.4434 24.5962 12.9837 23.8836 11.7077 22.9045C10.4318 21.9254 9.36571 20.6998 8.5728 19.3005C7.77988 17.9013 7.27633 16.3569 7.09208 14.7592C6.90782 13.1615 7.04661 11.543 7.5002 10C10.6157 10.1426 13.6644 9.06658 16.0002 7Z"
          {...common}
        />
      </Svg>
    );
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
      <Circle cx={16} cy={12} r={4} {...common} />
      <Path d="M8.5 25a7.5 7.5 0 0 1 15 0" {...common} />
    </Svg>
  );
}
function LogoutIcon() {
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
      <Path
        d="M18.6667 10.6693V8.0026C18.6667 7.29536 18.3857 6.61708 17.8856 6.11699C17.3855 5.61689 16.7072 5.33594 16 5.33594H6.66667C5.95942 5.33594 5.28115 5.61689 4.78105 6.11699C4.28095 6.61708 4 7.29536 4 8.0026V24.0026C4 24.7098 4.28095 25.3881 4.78105 25.8882C5.28115 26.3883 5.95942 26.6693 6.66667 26.6693H16C16.7072 26.6693 17.3855 26.3883 17.8856 25.8882C18.3857 25.3883 18.6667 24.7098 18.6667 24.0026V21.3359M12 16.0026H28M24 20.0026L28 16.0026L24 12.0026"
        stroke="#DC2626"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function LogoutDialogIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 32 32" fill="none">
      <Path
        d="M18.6667 10.6693V8.0026C18.6667 7.29536 18.3857 6.61708 17.8856 6.11699C17.3855 5.61689 16.7072 5.33594 16 5.33594H6.66667C5.95942 5.33594 5.28115 5.61689 4.78105 6.11699C4.28095 6.61708 4 7.29536 4 8.0026V24.0026C4 24.7098 4.28095 25.3881 4.78105 25.8882C5.28115 26.3883 5.95942 26.6693 6.66667 26.6693H16C16.7072 26.6693 17.3855 26.3883 17.8856 25.8882C18.3857 25.3883 18.6667 24.7098 18.6667 24.0026V21.3359M12 16.0026H28M24 20.0026L28 16.0026L24 12.0026"
        stroke="#DC2626"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
// Settings' profile card and the Account screen both offer Share Profile.
function shareProfileDetails(user: AuthUser) {
  return Share.share({
    message: `${user.name || 'My'} Chatterly profile${user.phone ? `\nPhone: ${user.phone}` : ''}${user.email ? `\nEmail: ${user.email}` : ''}`,
  });
}
function isUploadedPhoto(uri?: string | null): uri is string {
  return Boolean(uri && !uri.includes('ui-avatars.com'));
}
function displayDateOfBirth(value?: string): string {
  if (!value) {
    return 'Not added';
  }
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoDate) {
    const date = new Date(
      Number(isoDate[1]),
      Number(isoDate[2]) - 1,
      Number(isoDate[3]),
    );
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
  }
  const slashDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (slashDate) {
    const date = new Date(
      Number(slashDate[3]),
      Number(slashDate[2]) - 1,
      Number(slashDate[1]),
    );
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
  }
  return value;
}
function Avatar({
  user,
  uri,
  size = 72,
}: {
  user: AuthUser;
  uri?: string | null;
  size?: number;
}) {
  const source = uri === null ? '' : uri || user.profilePic;
  return isUploadedPhoto(source) ? (
    <Image
      source={{ uri: source }}
      resizeMode="cover"
      style={{ width: size, height: size, borderRadius: 6 }}
    />
  ) : (
    <Image
      accessibilityLabel="Default profile picture"
      source={require('../assets/default-profile.png')}
      resizeMode="contain"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}

export function SettingsScreen({
  initialScreen = 'settings',
  onBack,
  onOpenChats,
  onOpenContacts,
  onOpenCalls,
  onLogout,
  onReportSubmitted,
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [user, setUser] = useState<AuthUser>(getSession()?.user || {});
  const accountId = getSession()?.user?.id || '';
  useEffect(() => {
    let active = true;
    const original = getSession()?.user?.dateOfBirth;
    loadAccountDateOfBirth(accountId).then(dateOfBirth => {
      if (active && dateOfBirth && getSession()?.user?.id === accountId && getSession()?.user?.dateOfBirth === original) {
        setUser(current => ({...current, dateOfBirth}));
        updateSessionUser({dateOfBirth});
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [accountId]);
  const [emailForVerification, setEmailForVerification] = useState('');
  const [emailUpdated, setEmailUpdated] = useState(false);
  const [notice, setNotice] = useState('');
  const [settingsQuery, setSettingsQuery] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutConfirmationVisible, setLogoutConfirmationVisible] =
    useState(false);
  if (screen === 'account')
    return (
      <AccountScreen
        user={user}
        emailUpdated={emailUpdated}
        onBack={() => setScreen('settings')}
        onOpenName={() => setScreen('change-name')}
        onOpenEmail={() => setScreen('change-email')}
        onOpenPhone={() => setScreen('change-phone')}
        onOpenDateOfBirth={() => setScreen('change-date-of-birth')}
        onHideEmailUpdated={() => setEmailUpdated(false)}
      />
    );
  if (screen === 'change-name')
    return (
      <ChangeNameScreen
        initialName={user.name || ''}
        onBack={() => setScreen('account')}
        onSaved={name => {
          setUser(current => ({ ...current, name }));
          updateSessionUser({ name });
          setScreen('account');
        }}
      />
    );
  if (screen === 'change-phone')
    return <ChangePhoneScreen initialPhone={user.phone || ''} onBack={() => setScreen('account')} onSaved={phone => {
      setUser(current => ({...current, phone}));
      updateSessionUser({phone});
      setScreen('account');
    }} />;
  if (screen === 'change-date-of-birth')
    return (
      <ChangeDateOfBirthScreen
        initialDateOfBirth={user.dateOfBirth || ''}
        onBack={() => setScreen('account')}
        onSaved={dateOfBirth => {
          setUser(current => ({ ...current, dateOfBirth }));
          updateSessionUser({ dateOfBirth });
          setScreen('account');
        }}
      />
    );
  if (screen === 'change-email')
    return (
      <ChangeEmailScreen
        initialEmail={emailForVerification}
        onBack={() => setScreen('account')}
        onOtpSent={email => {
          setEmailForVerification(email);
          setScreen('verify-email-otp');
        }}
      />
    );
  if (screen === 'verify-email-otp')
    return (
      <VerifyEmailOtpScreen
        email={emailForVerification}
        onBack={() => setScreen('change-email')}
        onChangeEmail={() => setScreen('change-email')}
        onVerified={() => {
          setUser(current => ({ ...current, email: emailForVerification }));
          updateSessionUser({ email: emailForVerification });
          setEmailUpdated(true);
          setScreen('account');
        }}
      />
    );
  if (screen === 'edit' || screen === 'edit-photo')
    return (
      <EditProfileScreen
        user={user}
        openPhotoOptions={screen === 'edit-photo'}
        onBack={() => setScreen('settings')}
        onSaved={next => {
          setUser(next);
        }}
      />
    );
  if (screen === 'photo')
    return (
      <PhotoViewer
        user={user}
        onBack={() => setScreen('settings')}
        onEdit={() => setScreen('edit-photo')}
      />
    );
  if (screen === 'qr')
    return <QrCodeScreen user={user} onBack={() => setScreen('settings')} />;
  if (screen === 'privacy')
    return (
      <PrivacySecurityScreen
        onBack={() => setScreen('settings')}
        onReportSubmitted={onReportSubmitted}
      />
    );
  if (screen === 'appearance')
    return <AppearanceScreen onBack={() => setScreen('settings')} />;
  if (screen === 'personalisation')
    return <PersonalisationScreen onBack={() => setScreen('settings')} />;
  if (screen === 'notifications')
    return <NotificationControlsScreen onBack={() => setScreen('settings')} />;
  if (screen === 'media-links')
    return <MediaLinksScreen onBack={() => setScreen('settings')} />;
  if (screen === 'storage-data')
    return <MediaLinksScreen onBack={() => setScreen('settings')} title="Storage and Data" />;
  const searchingSettings = Boolean(settingsQuery.trim());
  const filteredSettings = (searchingSettings ? SEARCH_SETTINGS : SETTINGS).filter(
    item =>
      !searchingSettings ||
      `${item.title} ${item.description}`
        .toLowerCase()
        .includes(settingsQuery.trim().toLowerCase()),
  );
  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.settingsContent,
          { paddingTop: insets.top + 12, paddingBottom: 90 + insets.bottom },
        ]}
      >
        <View style={styles.settingsHeader}>
          <View style={styles.settingsHeaderLeading}>
            <Pressable
              accessibilityLabel="Back from settings"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onBack || onOpenChats}
              style={styles.settingsBack}
            >
              <BackIcon />
            </Pressable>
            <Text style={styles.settingsTitle}>Settings</Text>
          </View>
          <Pressable
            accessibilityLabel="Open my QR code"
            onPress={() => setScreen('qr')}
            hitSlop={6}
            style={styles.qrButton}
          >
            <QrIcon />
          </Pressable>
        </View>
        <View style={styles.search}>
          <SearchIcon />
          <TextInput
            accessibilityLabel="Search settings"
            onChangeText={setSettingsQuery}
            placeholder="Search Settings"
            placeholderTextColor="#8791A2"
            returnKeyType="search"
            style={styles.searchInput}
            value={settingsQuery}
          />
        </View>
        {searchingSettings ? null : (
          <View style={styles.accountHero}>
            <Pressable
              accessibilityLabel="View profile picture"
              onPress={() => setScreen('photo')}
            >
              <Avatar user={user} size={64} />
            </Pressable>
            <Text style={styles.heroName}>{user.name || 'Your profile'}</Text>
            <Text numberOfLines={1} style={styles.heroStatus}>
              {user.status || DEFAULT_BIO}
            </Text>
            <View style={styles.heroActions}>
              <Pressable
                accessibilityLabel="Edit profile"
                onPress={() => setScreen('edit')}
                style={styles.editPill}
              >
                <EditIcon />
                <Text style={styles.editPillText}>Edit Profile</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Share Profile"
                accessibilityRole="button"
                onPress={() =>
                  shareProfileDetails(user).catch(() =>
                    setNotice('Unable to share this profile.'),
                  )
                }
                style={styles.editPill}
              >
                <ShareIcon />
                <Text style={styles.editPillText}>Share Profile</Text>
              </Pressable>
            </View>
          </View>
        )}
        <View style={styles.settingsList}>
          {filteredSettings.map(item => (
            <Pressable
              accessibilityLabel={item.title}
              key={item.id}
              onPress={() =>
                item.screen
                  ? setScreen(item.screen)
                  : item.title === 'Account'
                  ? setScreen('account')
                  : item.title === 'Privacy'
                  ? setScreen('privacy')
                  : item.title === 'Appearance'
                  ? setScreen('appearance')
                  : item.title === 'Notifications'
                  ? setScreen('notifications')
                  : item.title === 'Media & Links'
                  ? setScreen('media-links')
                  : setNotice(`${item.title} settings are ready to configure.`)
              }
              style={styles.settingRow}
            >
              <SettingIcon name={item.icon} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>{item.title}</Text>
                <Text style={styles.settingDescription}>
                  {item.description}
                </Text>
              </View>
            </Pressable>
          ))}
          {searchingSettings && !filteredSettings.length ? (
            <View style={styles.noResults}>
              <Text style={styles.noResultsTitle}>No results found</Text>
              <Text style={styles.noResultsText}>
                Try a different search term.
              </Text>
            </View>
          ) : null}
          {onLogout && !searchingSettings ? (
            <Pressable
              accessibilityLabel="Logout"
              accessibilityState={{ disabled: loggingOut }}
              disabled={loggingOut}
              onPress={() => setLogoutConfirmationVisible(true)}
              style={styles.settingRow}
            >
              <LogoutIcon />
              <View style={styles.settingCopy}>
                <Text style={styles.logoutTitle}>Logout</Text>
                <Text style={styles.settingDescription}>
                  Sign out of your Chatterly account.
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
        <Text accessibilityLabel={`App Version: ${APP_VERSION}`} style={styles.versionText}>
          App Version: {APP_VERSION}
        </Text>
      </ScrollView>
      <BottomNav
        onOpenCalls={onOpenCalls}
        onOpenChats={onOpenChats}
        onOpenContacts={onOpenContacts}
      />
      <Snackbar message={notice} onHide={() => setNotice('')} />
      <Modal
        animationType="fade"
        onRequestClose={() =>
          !loggingOut && setLogoutConfirmationVisible(false)
        }
        statusBarTranslucent
        transparent
        visible={logoutConfirmationVisible}
      >
        <View style={styles.logoutModalRoot}>
          <Pressable
            accessibilityLabel="Dismiss logout confirmation"
            disabled={loggingOut}
            onPress={() => setLogoutConfirmationVisible(false)}
            style={styles.logoutScrim}
          />
          <View accessibilityViewIsModal style={styles.logoutDialog}>
            <View style={styles.logoutDialogIcon}>
              <LogoutDialogIcon />
            </View>
            <Text style={styles.logoutDialogTitle}>Log out of Chatterly?</Text>
            <Text style={styles.logoutDialogDescription}>
              You’ll need to sign in again to access your chats and account.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm Logout"
              disabled={loggingOut}
              onPress={async () => {
                if (!onLogout || loggingOut) {
                  return;
                }
                setLoggingOut(true);
                try {
                  await onLogout();
                  setLogoutConfirmationVisible(false);
                } catch {
                  setNotice('Unable to log out. Please try again.');
                } finally {
                  setLoggingOut(false);
                }
              }}
              style={styles.logoutConfirmButton}
            >
              <Text style={styles.logoutConfirmText}>
                {loggingOut ? 'Logging out…' : 'Logout'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel logout"
              disabled={loggingOut}
              onPress={() => setLogoutConfirmationVisible(false)}
              style={styles.logoutCancelButton}
            >
              <Text style={styles.logoutCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AccountScreen({
  user,
  emailUpdated,
  onBack,
  onOpenName,
  onOpenEmail,
  onOpenPhone,
  onOpenDateOfBirth,
  onHideEmailUpdated,
}: {
  user: AuthUser;
  emailUpdated: boolean;
  onBack: () => void;
  onOpenName: () => void;
  onOpenEmail: () => void;
  onOpenPhone: () => void;
  onOpenDateOfBirth: () => void;
  onHideEmailUpdated: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState('');
  const copyValue = async (value: string | undefined, label: string) => {
    if (!value) { setNotice(`No ${label.toLowerCase()} available.`); return; }
    try {
      await Clipboard.setStringAsync(value);
      setNotice(`${label} copied to clipboard.`);
    } catch {
      setNotice(`Unable to copy ${label.toLowerCase()}.`);
    }
  };
  const shareProfile = async () => {
    try {
      await shareProfileDetails(user);
    } catch {
      setNotice('Unable to share this profile.');
    }
  };
  return (
    <View style={styles.accountScreen}>
      <View
        accessibilityLabel="Account header"
        style={[
          styles.accountHeader,
          { height: insets.top + 42, paddingTop: insets.top },
        ]}
      >
        <Pressable
          accessibilityLabel="Back to settings"
          onPress={onBack}
          hitSlop={12}
          style={styles.accountBack}
        >
          <AccountBackIcon />
        </Pressable>
        <Text style={styles.accountTitle}>Account</Text>
      </View>
      <ScrollView
        style={styles.accountScroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.accountRows,
          { paddingBottom: insets.bottom + 20 },
        ]}
      >
        <Pressable
          accessibilityLabel="Full Name"
          accessibilityRole="button"
          onPress={onOpenName}
          style={styles.accountRow}
        >
          <View style={styles.accountRowCopy}>
            <Text style={styles.accountLabel}>Full Name</Text>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={styles.accountValue}
            >
              {user.name || 'Not added'}
            </Text>
          </View>
          <ChevronIcon />
        </Pressable>
        <Pressable accessible={false} onPress={onOpenPhone} style={styles.accountRow}>
          <Pressable accessibilityLabel="Phone Number" accessibilityRole="button" onPress={onOpenPhone} style={styles.accountRowCopy}>
            <Text style={styles.accountLabel}>Phone Number</Text>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={styles.accountValue}
            >
              {user.phone || 'Not added'}
            </Text>
          </Pressable>
          <ChevronIcon />
          <Pressable accessibilityRole="button" accessibilityLabel="Copy phone number" hitSlop={8} onPress={event => {event.stopPropagation(); return copyValue(user.phone, 'Phone number');}} style={styles.accountCopyButton}><Text style={styles.accountCopyText}>Copy</Text></Pressable>
        </Pressable>
        <View style={styles.accountRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Change email" onPress={onOpenEmail} style={styles.accountRowCopy}>
            <Text accessibilityLabel="Email" style={styles.accountLabel}>Email</Text>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={styles.accountValue}
            >
              {user.email || 'Not added'}
            </Text>
          </Pressable>
          <ChevronIcon />
          <Pressable accessibilityRole="button" accessibilityLabel="Copy email address" hitSlop={8} onPress={() => copyValue(user.email, 'Email')} style={styles.accountCopyButton}><Text style={styles.accountCopyText}>Copy</Text></Pressable>
        </View>
        <Pressable
          accessibilityLabel="Date of Birth"
          accessibilityRole="button"
          onPress={onOpenDateOfBirth}
          style={styles.accountRow}
        >
          <View style={styles.accountRowCopy}>
            <Text style={styles.accountLabel}>Date of Birth</Text>
            <Text style={styles.accountValue}>
              {displayDateOfBirth(user.dateOfBirth)}
            </Text>
          </View>
          <ChevronIcon />
        </Pressable>
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel="Share Profile" onPress={shareProfile} style={[styles.shareProfileButton, {marginBottom: Math.max(insets.bottom, 16)}]}>
        <Text style={styles.shareProfileButtonText}>Share Profile</Text>
      </Pressable>
      <Snackbar message={notice} onHide={() => setNotice('')} />
      <EmailUpdatedToast visible={emailUpdated} onHide={onHideEmailUpdated} />
    </View>
  );
}

function ChangeNameScreen({
  initialName,
  onBack,
  onSaved,
}: {
  initialName: string;
  onBack: () => void;
  onSaved: (name: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [saveBarHeight, setSaveBarHeight] = useState(0);
  const nameEmoji = useEmojiKeyboardToggle({
    value: name,
    onChangeText: setName,
    maxLength: PROFILE_NAME_MAX_LENGTH,
    onLimit: () =>
      setNotice(`Name cannot exceed ${PROFILE_NAME_MAX_LENGTH} characters.`),
  });
  // The emoji panel below the save bar already covers the home-indicator gap.
  const saveBarPadding = nameEmoji.emojiOpen ? 16 : Math.max(insets.bottom, 16);
  const trimmedName = name.trim();
  const validationError = validateProfileUpdate(trimmedName, '');
  const canSave = Boolean(
    !validationError && trimmedName !== initialName.trim() && !saving,
  );
  const save = async () => {
    const session = getSession();
    if (!canSave || !session?.token) {
      return;
    }
    setSaving(true);
    try {
      const response = await updateProfile(session.token, { name: trimmedName });
      onSaved(response.user?.name || trimmedName);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to update your name.',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.changeEmailScreen}
    >
      <View
        style={[
          styles.changeEmailHeader,
          { height: insets.top + 42, paddingTop: insets.top },
        ]}
      >
        <Pressable
          accessibilityLabel="Back to account"
          onPress={onBack}
          hitSlop={12}
          style={styles.changeEmailBack}
        >
          <BackIcon />
        </Pressable>
        <Text style={styles.changeEmailTitle}>Full Name</Text>
      </View>
      <View style={styles.changeEmailContent}>
        <Text style={styles.changeEmailDescription}>
          Update the name shown on your Chatterly profile.
        </Text>
        <Text style={styles.changeEmailLabel}>Full Name</Text>
        <View style={styles.emailInputWrap}>
          <TextInput
            accessibilityLabel="Full Name input"
            autoCapitalize="words"
            autoCorrect={false}
            value={name}
            onChangeText={setName}
            maxLength={PROFILE_NAME_MAX_LENGTH}
            style={styles.emailInput}
            editable={!saving}
            ref={nameEmoji.inputProps.ref}
            onFocus={nameEmoji.inputProps.onFocus}
            onSelectionChange={nameEmoji.inputProps.onSelectionChange}
            selection={nameEmoji.inputProps.selection}
          />
          <EmojiKeyboardToggle
            open={nameEmoji.emojiOpen}
            onPress={nameEmoji.toggle}
          />
        </View>
        {name.length > 0 && validationError ? (
          <Text
            accessibilityLiveRegion="polite"
            style={styles.changeEmailDescription}
          >
            {validationError}
          </Text>
        ) : null}
      </View>
      <View
        onLayout={event => setSaveBarHeight(event.nativeEvent.layout.height)}
        style={[styles.accountSaveBar, { paddingBottom: saveBarPadding }]}
      >
        <Pressable
          accessibilityLabel="Save Full Name"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave, busy: saving }}
          disabled={!canSave}
          onPress={save}
          style={[
            styles.sendOtpButton,
            canSave && styles.sendOtpButtonEnabled,
          ]}
        >
          <Text
            style={[
              styles.sendOtpText,
              canSave && styles.sendOtpTextEnabled,
            ]}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Text>
        </Pressable>
      </View>
      <View style={styles.nameEmojiPanel}>
        <EmojiPicker
          bottomInset={insets.bottom}
          onSelectEmoji={nameEmoji.insertEmoji}
          showGifTab={false}
          visible={nameEmoji.emojiOpen}
        />
      </View>
      <Snackbar
        bottomInset={
          nameEmoji.emojiOpen
            ? emojiPanelHeight(windowHeight) + insets.bottom + saveBarHeight
            : 0
        }
        message={notice}
        onHide={() => setNotice('')}
      />
    </KeyboardAvoidingView>
  );
}

function ChangePhoneScreen({initialPhone, onBack, onSaved}: {
  initialPhone: string; onBack: () => void; onSaved: (phone: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const normalized = normalizeAccountPhone(phone);
  const canSave = Boolean(normalized && normalized !== normalizeAccountPhone(initialPhone) && !saving);
  const save = async () => {
    const session = getSession();
    if (!canSave || !normalized || !session?.token) { return; }
    setSaving(true);
    try {
      const response = await updateProfile(session.token, {phone: normalized});
      onSaved(response.user?.phone || normalized);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update your phone number.');
    } finally { setSaving(false); }
  };
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.changeEmailScreen}>
    <View style={[styles.changeEmailHeader, {height: insets.top + 42, paddingTop: insets.top}]}>
      <Pressable accessibilityLabel="Back to account" onPress={onBack} hitSlop={12} style={styles.changeEmailBack}><BackIcon /></Pressable>
      <Text style={styles.changeEmailTitle}>Phone Number</Text>
    </View>
    <View style={styles.changeEmailContent}>
      <Text style={styles.changeEmailDescription}>Enter a 10-digit Indian phone number, with or without +91.</Text>
      <Text style={styles.changeEmailLabel}>Phone Number</Text>
      <View style={styles.emailInputWrap}>
        <TextInput accessibilityLabel="Phone number input" autoFocus autoComplete="tel" keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={24} style={styles.emailInput} editable={!saving} />
      </View>
      {phone && !normalized ? <Text accessibilityLiveRegion="polite" style={styles.changeEmailDescription}>Enter a valid 10-digit Indian phone number.</Text> : null}
    </View>
    <View style={[styles.accountSaveBar, {paddingBottom: Math.max(insets.bottom, 16)}]}>
      <Pressable accessibilityLabel="Save Phone Number" accessibilityRole="button" accessibilityState={{disabled: !canSave, busy: saving}} disabled={!canSave} onPress={save} style={[styles.sendOtpButton, canSave && styles.sendOtpButtonEnabled]}>
        <Text style={[styles.sendOtpText, canSave && styles.sendOtpTextEnabled]}>{saving ? 'Saving…' : 'Save Changes'}</Text>
      </Pressable>
    </View>
    <Snackbar message={notice} onHide={() => setNotice('')} />
  </KeyboardAvoidingView>;
}

function ChangeDateOfBirthScreen({
  initialDateOfBirth,
  onBack,
  onSaved,
}: {
  initialDateOfBirth: string;
  onBack: () => void;
  onSaved: (dateOfBirth: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const session = getSession();
  const [dateOfBirth, setDateOfBirth] = useState(normalizeAccountDate(initialDateOfBirth));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const valid = isValidAccountDate(dateOfBirth);
  const canSave = valid && dateOfBirth !== normalizeAccountDate(initialDateOfBirth) && !saving;
  const save = async () => {
    if (!canSave || !session?.token) return;
    setSaving(true);
    try {
      await saveAccountDateOfBirth(session.user?.id || '', dateOfBirth);
      onSaved(dateOfBirth);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to update your date of birth.',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.changeEmailScreen}>
      <View style={[styles.changeEmailHeader, { height: insets.top + 42, paddingTop: insets.top }]}>
        <Pressable
          accessibilityLabel="Back to account"
          onPress={onBack}
          hitSlop={12}
          style={styles.changeEmailBack}
        >
          <BackIcon />
        </Pressable>
        <Text style={styles.changeEmailTitle}>Date of Birth</Text>
      </View>
      <View style={styles.changeEmailContent}>
        <Text style={styles.changeEmailDescription}>
          Use the format YYYY-MM-DD. Saved on this device.
        </Text>
        <Text style={styles.changeEmailLabel}>Date of Birth</Text>
        <View style={styles.emailInputWrap}>
          <TextInput
            accessibilityLabel="Date of Birth input"
            autoFocus
            keyboardType="number-pad"
            maxLength={10}
            onChangeText={value => setDateOfBirth(formatAccountDateInput(value))}
            placeholder="YYYY-MM-DD"
            style={styles.emailInput}
            value={dateOfBirth}
            editable={!saving}
          />
        </View>
        {dateOfBirth.length === 10 && !valid ? <Text accessibilityLiveRegion="polite" style={styles.changeEmailDescription}>Enter a valid date that is not in the future.</Text> : null}
      </View>
      <View
        style={[
          styles.accountSaveBar,
          { paddingBottom: Math.max(insets.bottom, 30) },
        ]}
      >
        <Pressable
          accessibilityLabel="Save Date of Birth"
          accessibilityRole="button"
          accessibilityState={{disabled: !canSave, busy: saving}}
          disabled={!canSave}
          onPress={save}
          style={[styles.sendOtpButton, canSave && styles.sendOtpButtonEnabled]}
        >
          <Text
            style={[styles.sendOtpText, canSave && styles.sendOtpTextEnabled]}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Text>
        </Pressable>
      </View>
      <Snackbar message={notice} onHide={() => setNotice('')} />
    </KeyboardAvoidingView>
  );
}

function ChangeEmailScreen({
  initialEmail,
  onBack,
  onOtpSent,
}: {
  initialEmail: string;
  onBack: () => void;
  onOtpSent: (email: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const canSendOtp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const sendOtp = async () => {
    if (!canSendOtp || sending) {
      return;
    }
    setSending(true);
    try {
      await sendEmailOtp(email.trim());
      onOtpSent(email.trim());
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to send the email OTP.',
      );
    } finally {
      setSending(false);
    }
  };
  return (
    <View style={styles.changeEmailScreen}>
      <View style={[styles.changeEmailHeader, { height: insets.top + 42, paddingTop: insets.top }]}>
        <Pressable
          accessibilityLabel="Back to account"
          onPress={onBack}
          hitSlop={12}
          style={styles.changeEmailBack}
        >
          <BackIcon />
        </Pressable>
        <Text style={styles.changeEmailTitle}>Change your email</Text>
      </View>
      <View style={styles.changeEmailContent}>
        <Text style={styles.changeEmailDescription}>
          Enter a email ID to continue. We use this email ID to verify{`\n`}your
          identity if you lost access to your account.
        </Text>
        <Text style={styles.changeEmailLabel}>Email</Text>
        <View style={styles.emailInputWrap}>
          <MailIcon />
          <TextInput
            accessibilityLabel="New email address"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder=""
            style={styles.emailInput}
            value={email}
          />
        </View>
      </View>
      <View
        style={[
          styles.sendOtpBar,
          { paddingBottom: Math.max(insets.bottom, 30) },
        ]}
      >
        <Pressable
          accessibilityLabel="Send OTP"
          disabled={!canSendOtp || sending}
          onPress={sendOtp}
          style={[
            styles.sendOtpButton,
            canSendOtp && !sending && styles.sendOtpButtonEnabled,
          ]}
        >
          <Text
            style={[
              styles.sendOtpText,
              canSendOtp && !sending && styles.sendOtpTextEnabled,
            ]}
          >
            {sending ? 'Sending OTP…' : 'Send OTP'}
          </Text>
        </Pressable>
      </View>
      <Snackbar message={notice} onHide={() => setNotice('')} />
    </View>
  );
}

function VerifyEmailOtpScreen({
  email,
  onBack,
  onChangeEmail,
  onVerified,
}: {
  email: string;
  onBack: () => void;
  onChangeEmail: () => void;
  onVerified: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState('');
  const inputs = useRef<Array<{ focus: () => void } | null>>([]);
  const complete = code.every(Boolean);
  const updateCode = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length > 1) {
      const next = [...code];
      digits
        .slice(0, 6 - index)
        .split('')
        .forEach((digit, offset) => {
          next[index + offset] = digit;
        });
      setCode(next);
      inputs.current[Math.min(index + digits.length, 5)]?.focus();
      return;
    }
    const next = [...code];
    next[index] = digits;
    setCode(next);
    if (digits && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };
  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      const next = [...code];
      next[index - 1] = '';
      setCode(next);
      inputs.current[index - 1]?.focus();
    }
  };
  const verify = async () => {
    if (!complete || verifying) {
      return;
    }
    const session = getSession();
    if (!session?.token) {
      setNotice('Your session has expired. Please sign in again.');
      return;
    }
    setVerifying(true);
    try {
      await verifyEmailOtp(email, code.join(''));
      await updateProfile(session.token, { email });
      onVerified();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Invalid or expired OTP.',
      );
    } finally {
      setVerifying(false);
    }
  };
  const resend = async () => {
    try {
      await resendEmailOtp(email);
      setNotice('A new code is on its way.');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to resend the OTP.',
      );
    }
  };
  return (
    <View style={styles.verifyOtpScreen}>
      <View style={[styles.verifyOtpHeader, { height: insets.top + 42, paddingTop: insets.top }]}>
        <Pressable
          accessibilityLabel="Back to change email"
          onPress={onBack}
          hitSlop={12}
          style={styles.verifyOtpBack}
        >
          <BackIcon />
        </Pressable>
        <Text style={styles.verifyOtpTitle}>Verify OTP</Text>
      </View>
      <View style={styles.verifyOtpContent}>
        <Text style={styles.verifyOtpDescription}>
          Enter the verification code sent to your email inbox.
        </Text>
        <View style={styles.verifyEmailIdentity}>
          <Text style={styles.notYourEmail}>Not your email?</Text>
          <View style={styles.verifyEmailLine}>
            <Text style={styles.verifyEmailAddress}>{email}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Copy email address" onPress={async () => {
              try { await Clipboard.setStringAsync(email); setNotice('Email copied to clipboard.'); }
              catch { setNotice('Unable to copy email.'); }
            }} style={styles.copyEmailAction}><Text style={styles.changeEmailActionText}>Copy</Text></Pressable>
            <Pressable
              accessibilityLabel="Change email"
              onPress={onChangeEmail}
              style={styles.changeEmailAction}
            >
              <EditIcon />
              <Text style={styles.changeEmailActionText}>Change</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.otpRow}>
          {code.map((digit, index) => (
            <TextInput
              accessibilityLabel={`OTP digit ${index + 1}`}
              autoFocus={index === 0}
              caretHidden={false}
              keyboardType="number-pad"
              key={index}
              maxLength={6}
              onChangeText={value => updateCode(index, value)}
              onKeyPress={({ nativeEvent }) =>
                handleKeyPress(index, nativeEvent.key)
              }
              ref={input => {
                inputs.current[index] = input;
              }}
              selectTextOnFocus
              style={[styles.otpBox, index === 0 && styles.otpBoxFocused]}
              textAlign="center"
              value={digit}
            />
          ))}
        </View>
        <Text style={styles.resendText}>
          Did't get the code?{' '}
          <Text
            accessibilityRole="button"
            onPress={resend}
            style={styles.resendLink}
          >
            Resend OTP
          </Text>
        </Text>
      </View>
      <View
        style={[
          styles.verifyOtpBar,
          { paddingBottom: Math.max(insets.bottom, 30) },
        ]}
      >
        <Pressable
          accessibilityLabel="Verify OTP"
          disabled={!complete || verifying}
          onPress={verify}
          style={[
            styles.verifyOtpButton,
            complete && !verifying && styles.verifyOtpButtonEnabled,
          ]}
        >
          <Text
            style={[
              styles.verifyOtpButtonText,
              complete && !verifying && styles.verifyOtpButtonTextEnabled,
            ]}
          >
            {verifying ? 'Verifying…' : 'Verify OTP'}
          </Text>
        </Pressable>
      </View>
      <Snackbar message={notice} onHide={() => setNotice('')} />
    </View>
  );
}

function EmailUpdatedIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 6.5h14A1.5 1.5 0 0 1 20.5 8v8A1.5 1.5 0 0 1 19 17.5H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5Z"
        stroke={themeInk('#344054')}
        strokeWidth={1.5}
      />
      <Path
        d="m5 8 7 5 7-5M9.5 19.5l1.5 1.5 3.5-3.5"
        stroke={themeInk('#344054')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function EmailUpdatedToast({
  visible,
  onHide,
}: {
  visible: boolean;
  onHide: () => void;
}) {
  useEffect(() => {
    if (!visible) {
      return;
    }
    const timer = setTimeout(onHide, 2600);
    return () => clearTimeout(timer);
  }, [visible, onHide]);
  if (!visible) {
    return null;
  }
  return (
    <View accessibilityLiveRegion="polite" style={styles.emailUpdatedToast}>
      <EmailUpdatedIcon />
      <Text style={styles.emailUpdatedToastText}>
        Email Updated Successfully
      </Text>
    </View>
  );
}

export function QrCodeScreen({
  user,
  onBack,
  backLabel = 'Back to settings',
}: {
  user: AuthUser;
  onBack: () => void;
  backLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const identity =
    user.id || user.email || user.phone || user.name || 'profile';
  const profileLink = `https://chatterly.stacklycloud.com/profile/${encodeURIComponent(
    identity,
  )}`;
  return (
    <View
      style={[
        styles.qrScreen,
        { paddingTop: insets.top + 7, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.qrHeader}>
        <Pressable
          accessibilityLabel={backLabel}
          onPress={onBack}
          hitSlop={12}
        >
          <BackIcon />
        </Pressable>
        <Text style={styles.qrTitle}>QR Code</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.qrProfile}>
        <Avatar user={user} size={64} />
        <Text style={styles.qrName}>{user.name || 'Your profile'}</Text>
        <Text numberOfLines={1} style={styles.qrBio}>
          {user.status || DEFAULT_BIO}
        </Text>
      </View>
      <View style={styles.qrCard}>
        <View accessibilityLabel="My profile QR code">
          <QRCode
            value={profileLink}
            size={170}
            color="#000000"
            backgroundColor="#FFFFFF"
            ecl="M"
          />
        </View>
        <Text style={styles.qrDescription}>
          Connect in seconds. Scan this QR code to instantly{`\n`}access my
          profile and start the conversation. Fast,{`\n`}simple, and secure.
        </Text>
      </View>
    </View>
  );
}

function EditProfileScreen({
  user,
  openPhotoOptions = false,
  onBack,
  onSaved,
}: {
  user: AuthUser;
  openPhotoOptions?: boolean;
  onBack: () => void;
  onSaved: (user: AuthUser) => void;
}) {
  const insets = useSafeAreaInsets();
  const session = getSession();
  const [name, setName] = useState(user.name || '');
  const [bio, setBio] = useState(user.status || DEFAULT_BIO);
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(openPhotoOptions);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [saveBarHeight, setSaveBarHeight] = useState(0);
  const [original, setOriginal] = useState(() => ({
    name: user.name || '',
    bio: user.status || DEFAULT_BIO,
    photo: user.profilePic || '',
  }));
  // Full Name: the button in the field's corner swaps the keyboard for the emoji
  // panel and back.
  const { height: windowHeight } = useWindowDimensions();
  const nameEmoji = useEmojiKeyboardToggle({
    value: name,
    onChangeText: setName,
    maxLength: PROFILE_NAME_MAX_LENGTH,
    onLimit: () =>
      setNotice(`Name cannot exceed ${PROFILE_NAME_MAX_LENGTH} characters.`),
  });
  const emojiOpen = nameEmoji.emojiOpen;
  // With the emoji panel open the Save bar rides above it, and the panel already
  // covers the home-indicator gap.
  const saveBarPosition = {
    bottom: emojiOpen ? emojiPanelHeight(windowHeight) + insets.bottom : 0,
    paddingBottom: emojiOpen ? 16 : Math.max(insets.bottom, 16),
  };
  const validationError = validateProfileUpdate(name.trim(), bio);
  const changed =
    name !== original.name ||
    bio !== original.bio ||
    Boolean(image) ||
    (removePhoto && Boolean(original.photo));
  const canSave = changed && !saving && !validationError;
  const acceptImage = async (asset: ImagePicker.ImagePickerAsset) => {
    const error = validateProfileImage({ ...asset, fileSize: undefined });
    if (error) {
      setNotice(error);
      setSheetOpen(false);
      return;
    }
    try {
      const prepared = await prepareProfileImage(asset);
      setImage(prepared);
      setRemovePhoto(false);
    } catch (errorValue) {
      setNotice(
        errorValue instanceof Error
          ? errorValue.message
          : 'Unable to prepare this photo. Please choose another image.',
      );
    } finally {
      setSheetOpen(false);
    }
  };
  const pickLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Allow photo library access to choose a photo.');
      setSheetOpen(false);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      selectionLimit: 1,
    });
    if (!result.canceled) await acceptImage(result.assets[0]);
    else setSheetOpen(false);
  };
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setNotice('Allow camera access to take a photo.');
      setSheetOpen(false);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      cameraType: ImagePicker.CameraType.front,
    });
    if (!result.canceled) await acceptImage(result.assets[0]);
    else setSheetOpen(false);
  };
  const save = async () => {
    if (!canSave) return;
    const trimmedName = name.trim();
    if (!session?.token) {
      setNotice('Your session has expired. Please sign in again.');
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      const response = await updateProfile(session.token, {
        name: trimmedName,
        status: bio,
        image: image
          ? {
              uri: image.uri,
              fileName: image.fileName,
              mimeType: image.mimeType,
            }
          : undefined,
        removeProfilePic: removePhoto,
      });
      const next = {
        ...user,
        ...response.user,
        name: response.user?.name || trimmedName,
        status: response.user?.status ?? bio.trim(),
        profilePic: removePhoto
          ? ''
          : response.user?.profilePic || image?.uri || user.profilePic,
      };
      setOriginal({
        name: next.name || '',
        bio: next.status || DEFAULT_BIO,
        photo: next.profilePic || '',
      });
      setName(next.name || '');
      setBio(next.status || DEFAULT_BIO);
      setImage(null);
      setRemovePhoto(false);
      updateSessionUser(next);
      onSaved(next);
      setNotice('Profile Updated');
    } catch (errorValue) {
      setNotice(
        errorValue instanceof Error
          ? errorValue.message
          : 'Unable to update your profile.',
      );
    } finally {
      setSaving(false);
    }
  };
  const visiblePhoto = image?.uri || (removePhoto ? null : user.profilePic);
  if (previewOpen) {
    return (
      <PhotoViewer
        user={{ ...user, name }}
        uri={visiblePhoto}
        onBack={() => setPreviewOpen(false)}
        onEdit={() => {
          setPreviewOpen(false);
          setSheetOpen(true);
        }}
      />
    );
  }
  return (
    <View style={styles.root}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.editContent,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 92 },
        ]}
      >
        <View style={styles.editHeader}>
          <Pressable
            accessibilityLabel="Back to settings"
            onPress={onBack}
            hitSlop={12}
          >
            <BackIcon />
          </Pressable>
          <Text style={styles.editTitle}>Profile</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.profilePhoto}>
          <Pressable
            accessibilityLabel="View profile picture"
            onPress={() => setPreviewOpen(true)}
          >
            <Avatar user={{ ...user, name }} uri={visiblePhoto} size={82} />
          </Pressable>
          <Pressable
            accessibilityLabel="Change profile picture"
            onPress={() => setSheetOpen(true)}
            hitSlop={8}
            style={styles.editCameraBubble}
          >
            <CameraIcon />
          </Pressable>
        </View>
        <Field
          label="Full Name"
          required
          value={name}
          onChangeText={setName}
          maxLength={PROFILE_NAME_MAX_LENGTH}
          inputRef={nameEmoji.inputProps.ref}
          onFocus={nameEmoji.inputProps.onFocus}
          onSelectionChange={nameEmoji.inputProps.onSelectionChange}
          selection={nameEmoji.inputProps.selection}
          accessory={
            <EmojiKeyboardToggle open={emojiOpen} onPress={nameEmoji.toggle} />
          }
        />
        <Field
          label="Bio"
          value={bio}
          onChangeText={setBio}
          maxLength={PROFILE_STATUS_MAX_LENGTH}
          onFocus={nameEmoji.closeEmoji}
          multiline
        />
      </ScrollView>
      <EmojiPicker
        bottomInset={insets.bottom}
        onSelectEmoji={nameEmoji.insertEmoji}
        showGifTab={false}
        visible={emojiOpen}
      />
      <View
        onLayout={event => setSaveBarHeight(event.nativeEvent.layout.height)}
        style={[styles.saveBar, saveBarPosition]}
      >
        <Pressable
          accessibilityLabel="Save Changes"
          disabled={!canSave}
          onPress={save}
          style={[styles.saveButton, !canSave && styles.disabled]}
        >
          <Text style={styles.saveText}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Text>
        </Pressable>
      </View>
      <PhotoSheet
        visible={sheetOpen}
        canRemove={isUploadedPhoto(visiblePhoto)}
        onCamera={takePhoto}
        onLibrary={pickLibrary}
        onRemove={() => {
          setImage(null);
          setRemovePhoto(true);
          setSheetOpen(false);
        }}
        onCancel={() => setSheetOpen(false)}
      />
      <Snackbar
        bottomInset={saveBarPosition.bottom + saveBarHeight}
        message={notice}
        onHide={() => setNotice('')}
      />
    </View>
  );
}
function Field({
  label,
  required = false,
  accessory,
  inputRef,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  required?: boolean;
  /** Sits in the right corner of the input, like the emoji toggle on a name. */
  accessory?: React.ReactNode;
  inputRef?: React.Ref<React.ElementRef<typeof TextInput>>;
}) {
  const input = (
    <TextInput
      accessibilityLabel={label}
      ref={inputRef}
      {...props}
      style={[
        styles.fieldInput,
        props.multiline && styles.statusInput,
        accessory ? styles.fieldInputWithAccessory : null,
      ]}
    />
  );
  return (
    <View style={styles.field}>
      <Text accessibilityLabel={required ? `${label}, required` : label} style={styles.fieldLabel}>{label}{required ? <Text style={styles.requiredMark}> *</Text> : null}</Text>
      {accessory ? (
        <View>
          {input}
          <View style={styles.fieldAccessory}>{accessory}</View>
        </View>
      ) : (
        input
      )}
    </View>
  );
}
function PhotoSheet({
  visible,
  canRemove,
  onCamera,
  onLibrary,
  onRemove,
  onCancel,
}: {
  visible: boolean;
  canRemove: boolean;
  onCamera: () => void;
  onLibrary: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable
        accessibilityLabel="Close profile picture options"
        style={styles.scrim}
        onPress={onCancel}
      />
      <View
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Profile Picture</Text>
          <Pressable accessibilityLabel="Close" onPress={onCancel} hitSlop={10}>
            <CloseIcon />
          </Pressable>
        </View>
        <View style={styles.photoChoices}>
          <PhotoChoice label="Camera" onPress={onCamera}>
            <CameraIcon />
          </PhotoChoice>
          <PhotoChoice label="Gallery" onPress={onLibrary}>
            <GalleryIcon />
          </PhotoChoice>
        </View>
        {canRemove ? (
          <Pressable
            accessibilityLabel="Remove Profile Picture"
            onPress={onRemove}
            style={styles.removePhoto}
          >
            <TrashIcon />
            <Text style={styles.removePhotoText}>Remove Profile Picture</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}
function PhotoChoice({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.photoChoice,
        pressed && styles.photoChoicePressed,
      ]}
    >
      {children}
      <Text style={styles.photoChoiceText}>{label}</Text>
    </Pressable>
  );
}
function PhotoViewer({
  user,
  uri,
  onBack,
  onEdit,
}: {
  user: AuthUser;
  uri?: string | null;
  onBack: () => void;
  onEdit?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const source = uri === undefined ? user.profilePic : uri;
  return (
    <View style={styles.viewer}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={[styles.viewerHeader, { paddingTop: insets.top }]}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={onBack}
          hitSlop={12}
        >
          <BackIcon light />
        </Pressable>
        <Text style={styles.viewerTitle}>Profile Picture</Text>
        {onEdit ? (
          <Pressable
            accessibilityLabel="Edit profile picture"
            accessibilityRole="button"
            onPress={onEdit}
            hitSlop={12}
            style={styles.viewerEditButton}
          >
            <ViewerEditIcon />
          </Pressable>
        ) : (
          <View style={styles.viewerActionSpacer} />
        )}
      </View>
      <View style={styles.viewerImageWrap}>
        {isUploadedPhoto(source) ? (
          <Image
            accessibilityLabel="Full profile picture"
            source={{ uri: source }}
            resizeMode="contain"
            style={styles.viewerImage}
          />
        ) : (
          <Avatar user={user} uri={null} size={180} />
        )}
      </View>
    </View>
  );
}
function BottomNav({
  onOpenChats,
  onOpenContacts,
  onOpenCalls,
}: Pick<Props, 'onOpenChats' | 'onOpenContacts' | 'onOpenCalls'>) {
  const insets = useSafeAreaInsets();
  const tabs = [
    { label: 'Chats', Icon: ChatTabIcon, press: onOpenChats },
    { label: 'Contacts', Icon: ContactTabIcon, press: onOpenContacts },
    { label: 'Calls', Icon: CallsTabIcon, press: onOpenCalls },
    { label: 'Settings', Icon: SettingsTabIcon, press: undefined },
  ];
  return (
    <View
      style={[
        styles.bottomNav,
        { height: 69 + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      {tabs.map(tab => {
        const active = tab.label === 'Settings';
        return (
          <Pressable
            accessibilityLabel={tab.label}
            onPress={tab.press}
            key={tab.label}
            style={styles.tab}
          >
            <View style={[styles.tabIcon, active && styles.tabIconActive]}>
              <tab.Icon active={active} />
            </View>
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = createThemedStyles({
  root: { flex: 1, backgroundColor: '#FFF' },
  settingsContent: { paddingHorizontal: 16, paddingBottom: 90 },
  settingsHeader: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsHeaderLeading: { flexDirection: 'row', alignItems: 'center' },
  settingsBack: {
    width: 25,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginRight: 1,
  },
  settingsTitle: {
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: '700',
    color: '#121826',
  },
  qrButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    height: 38,
    borderRadius: 6,
    backgroundColor: '#F7F8FA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    gap: 7,
    marginTop: 10,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    color: '#1D2939',
    fontFamily: FONT,
    fontSize: 12,
  },
  accountScreen: { flex: 1, backgroundColor: '#FFF', paddingHorizontal: 16 },
  accountHeader: { flexDirection: 'row', alignItems: 'center' },
  accountBack: {
    width: 26,
    height: 42,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginRight: 9,
  },
  accountTitle: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '700',
    color: '#121826',
  },
  accountScroll: { flex: 1 },
  accountRows: { flexGrow: 1, marginTop: 21 },
  accountRow: {
    minHeight: 81,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountRowCopy: { flex: 1, minWidth: 0, paddingRight: 16 },
  accountCopyButton: { minWidth: 48, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  accountCopyText: { fontFamily: FONT, color: '#7137DD', fontSize: 11, fontWeight: '600' },
  shareProfileButton: { height: 46, marginHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6F28F5' },
  shareProfileButtonText: { fontFamily: FONT, color: '#FFF', fontSize: 13, fontWeight: '700' },
  accountLabel: {
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: '500',
    color: '#121826',
  },
  accountValue: {
    fontFamily: FONT,
    fontSize: 10,
    color: '#344054',
    marginTop: 10,
  },
  emailUpdatedToast: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 38,
    height: 39,
    borderRadius: 20,
    paddingHorizontal: 13,
    backgroundColor: '#FFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EAECF0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 4,
    shadowColor: '#101828',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  emailUpdatedToastText: {
    fontFamily: FONT,
    fontSize: 10,
    color: '#121826',
    fontWeight: '500',
  },
  changeEmailScreen: {
    flex: 1,
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
  },
  changeEmailHeader: { flexDirection: 'row', alignItems: 'center' },
  changeEmailBack: {
    width: 26,
    height: 42,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginRight: 9,
  },
  changeEmailTitle: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '700',
    color: '#121826',
  },
  // The safe-area-aware header is eight points taller at the common Android
  // inset. Reducing this gap preserves the existing form-field alignment while
  // giving the title row its full 42-point height instead of clipping it.
  changeEmailContent: { marginTop: 8 },
  changeEmailDescription: {
    fontFamily: FONT,
    fontSize: 10,
    lineHeight: 14,
    color: '#526177',
  },
  changeEmailLabel: {
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: '500',
    color: '#121826',
    marginTop: 17,
    marginBottom: 7,
  },
  emailInputWrap: {
    height: 34,
    borderWidth: 1,
    borderColor: '#7C8798',
    borderRadius: 5,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  emailInput: {
    flex: 1,
    alignSelf: 'stretch',
    paddingHorizontal: 9,
    paddingVertical: 0,
    color: '#121826',
    fontFamily: FONT,
    fontSize: 11,
  },
  sendOtpBar: { position: 'absolute', bottom: 0, left: 16, right: 16 },
  accountSaveBar: {marginTop: 'auto', paddingTop: 16},
  // The screen is padded; the emoji panel spans the full width like the keyboard.
  nameEmojiPanel: { marginHorizontal: -16 },
  sendOtpButton: {
    height: 33,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F1',
  },
  sendOtpButtonEnabled: { backgroundColor: '#6F28F5' },
  sendOtpText: { fontFamily: FONT, fontSize: 10, color: '#65738A' },
  sendOtpTextEnabled: { color: '#FFF', fontWeight: '600' },
  verifyOtpScreen: { flex: 1, backgroundColor: '#FFF', paddingHorizontal: 16 },
  verifyOtpHeader: { flexDirection: 'row', alignItems: 'center' },
  verifyOtpBack: {
    width: 26,
    height: 42,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginRight: 9,
  },
  verifyOtpTitle: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: '700',
    color: '#121826',
  },
  verifyOtpContent: { marginTop: 8 },
  verifyOtpDescription: {
    fontFamily: FONT,
    fontSize: 10,
    lineHeight: 14,
    color: '#526177',
  },
  verifyEmailIdentity: { alignItems: 'center', marginTop: 37 },
  notYourEmail: { fontFamily: FONT, color: '#526177', fontSize: 9 },
  verifyEmailLine: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  verifyEmailAddress: { fontFamily: FONT, color: '#121826', fontSize: 11 },
  copyEmailAction: { height: 20, paddingHorizontal: 6, justifyContent: 'center', backgroundColor: '#F1EBFF', borderRadius: 4 },
  changeEmailAction: {
    height: 20,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1EBFF',
    borderRadius: 4,
  },
  changeEmailActionText: {
    fontFamily: FONT,
    color: '#7137DD',
    fontWeight: '500',
    fontSize: 9,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 11,
  },
  otpBox: {
    width: 32,
    height: 33,
    padding: 0,
    borderRadius: 5,
    backgroundColor: '#F4F5F7',
    color: '#121826',
    fontFamily: FONT,
    fontSize: 13,
  },
  otpBoxFocused: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#98A2B3',
  },
  resendText: {
    fontFamily: FONT,
    color: '#526177',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 17,
  },
  resendLink: { color: '#121826', textDecorationLine: 'underline' },
  verifyOtpBar: { position: 'absolute', bottom: 0, left: 16, right: 16 },
  verifyOtpButton: {
    height: 33,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F1',
  },
  verifyOtpButtonEnabled: { backgroundColor: '#6F28F5' },
  verifyOtpButtonText: { fontFamily: FONT, fontSize: 10, color: '#65738A' },
  verifyOtpButtonTextEnabled: { color: '#FFF', fontWeight: '600' },
  accountHero: { alignItems: 'center', marginTop: 20 },
  heroName: {
    fontFamily: FONT,
    fontWeight: '700',
    fontSize: 14,
    color: '#172033',
    marginTop: 8,
  },
  heroStatus: {
    fontFamily: FONT,
    fontSize: 10,
    color: '#667085',
    maxWidth: 190,
    marginTop: 2,
  },
  heroActions: { flexDirection: 'row', gap: 8 },
  editPill: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1EBFF',
    paddingHorizontal: 10,
    height: 25,
    borderRadius: 5,
  },
  editPillText: {
    fontFamily: FONT,
    fontSize: 10,
    fontWeight: '600',
    color: '#7137DD',
  },
  settingsList: { marginTop: 16 },
  settingRow: {
    minHeight: 57,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  settingCopy: { flex: 1 },
  settingTitle: {
    fontFamily: FONT,
    color: '#172033',
    fontSize: 12,
    fontWeight: '600',
  },
  settingDescription: {
    fontFamily: FONT,
    color: '#758196',
    fontSize: 9,
    marginTop: 3,
  },
  noResults: { alignItems: 'center', paddingTop: 48, paddingBottom: 32 },
  noResultsTitle: {
    fontFamily: FONT,
    color: '#172033',
    fontSize: 13,
    fontWeight: '600',
  },
  noResultsText: {
    fontFamily: FONT,
    color: '#758196',
    fontSize: 10,
    marginTop: 4,
  },
  logoutTitle: {
    fontFamily: FONT,
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  versionText: {
    fontFamily: FONT,
    color: '#758196',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  logoutModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoutScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  logoutDialog: {
    width: '100%',
    maxWidth: 300,
    minHeight: 166,
    borderRadius: 8,
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingTop: 11,
    paddingBottom: 8,
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  logoutDialogIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutDialogTitle: {
    fontFamily: FONT,
    color: '#172033',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 7,
  },
  logoutDialogDescription: {
    fontFamily: FONT,
    color: '#758196',
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
    marginTop: 3,
    maxWidth: 228,
  },
  logoutConfirmButton: {
    minHeight: 28,
    minWidth: 80,
    marginTop: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutConfirmText: {
    fontFamily: FONT,
    color: '#DC2626',
    fontSize: 10,
    fontWeight: '500',
  },
  logoutCancelButton: {
    minHeight: 28,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutCancelText: {
    fontFamily: FONT,
    color: '#101828',
    fontSize: 10,
    fontWeight: '500',
  },
  bottomNav: {
    height: 69,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 6,
  },
  tab: { width: 62, alignItems: 'center' },
  tabIcon: {
    height: 27,
    width: 34,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 7,
  },
  tabIconActive: { backgroundColor: '#F1EBFF' },
  tabText: { fontFamily: FONT, marginTop: 2, fontSize: 9, color: '#536178' },
  tabTextActive: { color: '#641CFF', fontWeight: '700' },
  editContent: { paddingHorizontal: 16, flexGrow: 1 },
  editHeader: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
  },
  headerSpacer: { width: 0 },
  editTitle: {
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: '700',
    color: '#0B1220',
  },
  profilePhoto: {
    width: 82,
    height: 82,
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  editCameraBubble: {
    position: 'absolute',
    right: -5,
    bottom: -3,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D5DBE5',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  cameraBubble: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#6F28F5',
    borderWidth: 2,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { marginBottom: 20 },
  fieldLabel: {
    fontFamily: FONT,
    color: '#0B1220',
    fontWeight: '500',
    fontSize: 12,
    marginBottom: 7,
  },
  requiredMark: { color: '#DC2626' },
  fieldInput: {
    height: 43,
    borderWidth: 1,
    borderColor: '#D9DEE7',
    borderRadius: 5,
    paddingHorizontal: 10,
    fontFamily: FONT,
    color: '#101828',
    fontSize: 13,
    backgroundColor: '#FFF',
  },
  statusInput: { height: 96, paddingTop: 10, textAlignVertical: 'top' },
  // The emoji/keyboard toggle sits inside the field's right edge, so the text
  // stops short of it.
  fieldInputWithAccessory: { paddingRight: 44 },
  fieldAccessory: {
    position: 'absolute',
    top: 0,
    right: 4,
    bottom: 0,
    justifyContent: 'center',
  },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEF0F3',
  },
  saveButton: {
    height: 43,
    borderRadius: 4,
    backgroundColor: '#6F28F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveText: {
    fontFamily: FONT,
    color: '#FFF',
    fontWeight: '600',
    fontSize: 12,
  },
  disabled: { opacity: 0.55 },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(11,18,32,.44)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: 270,
    opacity: 1,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 13,
  },
  sheetHeader: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: '600',
    color: '#101828',
  },
  photoChoices: { flexDirection: 'row', gap: 12, marginTop: 4 },
  photoChoice: {
    flex: 1,
    height: 64,
    borderWidth: 1,
    borderColor: '#E1E5EC',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF',
  },
  photoChoicePressed: { backgroundColor: '#F7F8FA' },
  photoChoiceText: { fontFamily: FONT, fontSize: 9, color: '#344054' },
  removePhoto: {
    height: 34,
    marginTop: 12,
    borderRadius: 4,
    backgroundColor: '#FFF0F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  removePhotoText: {
    fontFamily: FONT,
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '500',
  },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerHeader: {
    height: 82,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#050505',
  },
  viewerTitle: {
    flex: 1,
    marginLeft: 13,
    color: '#FFF',
    fontFamily: FONT,
    fontWeight: '600',
    fontSize: 16,
  },
  viewerEditButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerActionSpacer: { width: 24 },
  viewerImageWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewerImage: { width: '100%', height: '72%' },
  qrScreen: { flex: 1, backgroundColor: '#FFF', paddingHorizontal: 16 },
  qrHeader: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qrTitle: {
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: '700',
    color: '#0B1220',
  },
  qrProfile: { alignItems: 'center', marginTop: 48 },
  qrName: {
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: '500',
    color: '#172033',
    marginTop: 9,
  },
  qrBio: {
    fontFamily: FONT,
    fontSize: 9,
    color: '#667085',
    maxWidth: 260,
    marginTop: 4,
  },
  qrCard: {
    marginTop: 36,
    minHeight: 280,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    borderRadius: 6,
    alignItems: 'center',
    paddingTop: 15,
    paddingHorizontal: 12,
    paddingBottom: 14,
    backgroundColor: '#FFF',
    elevation: 1,
    shadowColor: '#101828',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  qrDescription: {
    fontFamily: FONT,
    marginTop: 16,
    fontSize: 10,
    lineHeight: 14,
    color: '#667085',
    textAlign: 'center',
  },
});
