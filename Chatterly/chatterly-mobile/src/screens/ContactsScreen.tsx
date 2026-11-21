import * as Contacts from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  AppState,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CallsTabIcon,
  ChatTabIcon,
  ChevronDownIcon,
  ContactBookIllustration,
  ContactPermissionIcon,
  ContactTabIcon,
  EmailInputIcon,
  PhoneInputIcon,
  QrIcon,
  RegisteredBadge,
  SearchIcon,
  SearchContactsGridIcon,
  SettingsTabIcon,
  TinyPlusIcon,
} from '../components/ContactsIcons';
import { Snackbar } from '../components/Snackbar';
import { BroadcastPhotoEditor } from '../components/BroadcastPhotoEditor';
import { GroupPermissionIcon } from '../components/GroupPermissionIcon';
import { InviteBottomSheet } from '../components/InviteBottomSheet';
import { INVITATION_MESSAGE_DESIGN_TEXT } from '../components/InviteSectionSvgs';
import { withAppInviteLink } from '../utils/appInvite';
import {
  chatIdOf,
  findDirectChatForUser,
  getForwardDestinations,
  getChatList,
  searchChatContacts,
  startChat,
  type SearchContact,
} from '../services/chatApi';
import {
  createBroadcast,
  saveBroadcastImage,
  type BroadcastList,
  type BroadcastParticipant,
} from '../services/broadcastApi';
import { syncContacts, type SyncedContactUser } from '../services/contactsApi';
import {
  assignGroupAdmin,
  assignGroupModerator,
  createGroup,
  enableGroupInviteLink,
  searchGroups,
  updateGroupPermissions,
  updateGroupMessagePermissions,
} from '../services/groupApi';
import {setGroupManageReportsPermission} from '../services/groupPermissionStore';
import type { ConversationContact } from '../types/chat';
import type {
  GroupPermissionKey,
  SimilarGroupDraft,
} from '../utils/groupAdmin';
import { createThemedStyles, themeInk } from '../theme/themedStyles';
import {phoneDigits, splitPhoneNumber} from '../utils/phoneNumber';
import {loadSavedContacts, saveLocalContact, type SavedContact} from '../services/savedContacts';
import {getSession} from '../services/sessionStore';
import {QrCodeScreen} from './ProfileSettingsScreen';

type ScreenMode =
  | 'list'
  | 'create'
  | 'createGroup'
  | 'groupMembers'
  | 'manageRoles'
  | 'managePermissions'
  | 'createBroadcast'
  | 'broadcastMembers';
type GroupRole = 'Admin' | 'Moderator' | 'Member';
type PermissionKey = GroupPermissionKey;
type TabKey = 'chats' | 'contacts' | 'calls' | 'settings';

type DeviceContact = SavedContact;

type ContactListItem = {
  id: string;
  name: string;
  phone: string;
  email: string;
  thumbnail?: string | null;
  status: string;
  registered: boolean;
  recentlyAdded: boolean;
  userId: string;
};

type ContactsScreenProps = {
  initialMode?: Extract<
    ScreenMode,
    'list' | 'create' | 'createGroup' | 'createBroadcast'
  >;
  showContactPermissionPrompt?: boolean;
  onContactPermissionPromptHandled?: () => void;
  onOpenConversation?: (contact: ConversationContact, chatId: string) => void;
  onOpenChats?: () => void;
  onOpenCalls?: () => void;
  onOpenSettings?: () => void;
  onBroadcastCreated?: (broadcast: BroadcastList) => void;
  /** "Create a Similar Group": prefills the description and members of an existing group. */
  initialGroupDraft?: SimilarGroupDraft | null;
};

type ContactDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  countryCode: '+91';
  syncToPhone: boolean;
};

const CONTACT_FIELDS = [
  Contacts.ContactField.FULL_NAME,
  Contacts.ContactField.GIVEN_NAME,
  Contacts.ContactField.FAMILY_NAME,
  Contacts.ContactField.PHONES,
  Contacts.ContactField.EMAILS,
  Contacts.ContactField.THUMBNAIL,
] as const;

const EMPTY_DRAFT: ContactDraft = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  countryCode: '+91',
  syncToPhone: false,
};

const FONT_FAMILY = Platform.select({ android: 'sans-serif', ios: 'System' });
const REFRESH_MINIMUM_MS = 700;
const DEFAULT_INVITATION_MESSAGE = withAppInviteLink(INVITATION_MESSAGE_DESIGN_TEXT);
const CONTACT_INDEX_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
const NAV_TABS: Array<{
  key: TabKey;
  label: string;
  Icon: (props: { active?: boolean }) => React.JSX.Element;
}> = [
  { key: 'chats', label: 'Chats', Icon: ChatTabIcon },
  { key: 'contacts', label: 'Contacts', Icon: ContactTabIcon },
  { key: 'calls', label: 'Calls', Icon: CallsTabIcon },
  { key: 'settings', label: 'Settings', Icon: SettingsTabIcon },
];
const DEFAULT_PERMISSIONS: Record<PermissionKey, boolean> = {
  memberSend: true,
  memberMedia: true,
  memberInvite: true,
  memberAdd: false,
  moderatorAdd: false,
  moderatorRoles: false,
  moderatorPin: true,
  moderatorEdit: false,
  moderatorReports: false,
  adminApprovals: false,
};
const PERMISSION_SECTIONS: Array<{
  title: string;
  items: Array<{ key: PermissionKey; title: string; subtitle: string }>;
}> = [
  {
    title: 'Members can',
    items: [
      {
        key: 'memberSend',
        title: 'Send Messages',
        subtitle: 'Participants in group conversations.',
      },
      {
        key: 'memberMedia',
        title: 'Share Media & Files',
        subtitle: 'Send photos, videos, and documents.',
      },
      {
        key: 'memberInvite',
        title: 'Invite via Link',
        subtitle: 'Invite new people using the group’s invite link.',
      },
      {
        key: 'memberAdd',
        title: 'Add Members',
        subtitle: 'Add contacts directly to the group.',
      },
    ],
  },
  {
    title: 'Moderators can',
    items: [
      {
        key: 'moderatorAdd',
        title: 'Add Members',
        subtitle: 'Add new people directly to the group.',
      },
      {
        key: 'moderatorRoles',
        title: 'Assign Roles',
        subtitle: 'Manage moderator access and responsibilities.',
      },
      {
        key: 'moderatorPin',
        title: 'Pin Messages',
        subtitle:
          'Highlight important messages so everyone can find them easily.',
      },
      {
        key: 'moderatorEdit',
        title: 'Edit Group Info',
        subtitle:
          'Update the group name, photo, description, and other basic details.',
      },
      {
        key: 'moderatorReports',
        title: 'Manage Reports',
        subtitle: 'Review and take action on reported messages or members.',
      },
    ],
  },
  {
    title: 'Admins can',
    items: [
      {
        key: 'adminApprovals',
        title: 'Approve Join Requests',
        subtitle: 'Review and approve requests from new members.',
      },
    ],
  },
];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').slice(-10);
}

function displayName(contact: DeviceContact): string {
  const fullName = contact.fullName?.trim();
  if (fullName) {
    return fullName;
  }
  return (
    `${contact.givenName || ''} ${contact.familyName || ''}`.trim() ||
    'Unnamed contact'
  );
}

function asDialedPhone(countryCode: '+91', phone: string): string {
  const digits = normalizePhone(phone);
  return digits ? `${countryCode}${digits}` : phone.trim();
}

function toContactListItem(
  contact: DeviceContact,
  registeredByPhone: Map<string, SyncedContactUser>,
  recentlyAddedIds: Set<string>,
): ContactListItem {
  const phone =
    contact.phones?.find(entry => entry.number)?.number?.trim() || '';
  const normalized = normalizePhone(phone);
  const matched = registeredByPhone.get(normalized);
  const name = matched?.name || matched?.fullName || displayName(contact);

  return {
    id: contact.id,
    name,
    phone,
    email: contact.emails?.find(entry => entry.address)?.address?.trim() || '',
    thumbnail: contact.thumbnail || matched?.profilePic || null,
    status:
      matched?.status ||
      (matched
        ? 'Exploring the world one step at a time'
        : 'Live, laugh, love'),
    registered: Boolean(matched),
    recentlyAdded: recentlyAddedIds.has(contact.id),
    userId: String(matched?._id || matched?.id || ''),
  };
}

function CountryFlag(): React.JSX.Element {
  return (
    <View style={styles.flag}>
      <View style={[styles.flagStripe, styles.flagSaffron]} />
      <View style={[styles.flagStripe, styles.flagWhite]} />
      <View style={[styles.flagStripe, styles.flagGreen]} />
    </View>
  );
}

function Header({ onBack, onOpenQr }: { onBack?: () => void; onOpenQr: () => void }): React.JSX.Element {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitleRow}>
        {onBack ? (
          <Pressable
            accessibilityLabel="Back to contacts"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onBack}
            style={styles.contactBackButton}
          >
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path
                d="M15 6L9 12L15 18"
                stroke={themeInk('#0B1220')}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        ) : null}
        <Text style={styles.title}>Contacts</Text>
      </View>
      <View style={styles.headerActions}>
        <Pressable
          accessibilityLabel="Scan QR"
          accessibilityRole="button"
          hitSlop={8}
          style={styles.iconButton}
          onPress={onOpenQr}
        >
          <QrIcon />
        </Pressable>
      </View>
    </View>
  );
}

function BackIcon(): React.JSX.Element {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="m15 5-7 7 7 7"
        stroke={themeInk('#0D1422')}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ContactActionIcon({
  kind,
}: {
  kind: 'contact' | 'group' | 'broadcast';
}): React.JSX.Element {
  if (kind === 'contact')
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Circle
          cx={9}
          cy={8}
          r={3}
          stroke={themeInk('#111827')}
          strokeWidth={1.4}
        />
        <Path
          d="M3.8 18c.5-3 2.2-4.5 5.2-4.5 1.25 0 2.3.26 3.1.78M17 11v7M13.5 14.5h7"
          stroke={themeInk('#111827')}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </Svg>
    );
  if (kind === 'group')
    return (
      <Svg width={34} height={34} viewBox="0 0 40 40" fill="none">
        <Path
          d="M0 8C0 3.58172 3.58172 0 8 0H32C36.4183 0 40 3.58172 40 8V32C40 36.4183 36.4183 40 32 40H8C3.58172 40 0 36.4183 0 32V8Z"
          fill={themeInk('#FAFAFA')}
        />
        <Path
          d="M10.875 29V27C10.875 25.9391 11.314 24.9217 12.0954 24.1716C12.8768 23.4214 13.9366 23 15.0417 23H19.2083C20.3134 23 21.3732 23.4214 22.1546 24.1716C22.936 24.9217 23.375 25.9391 23.375 27V29M24.4167 11.13C25.3129 11.3503 26.1073 11.8507 26.6746 12.5523C27.2419 13.2539 27.5498 14.1168 27.5498 15.005C27.5498 15.8932 27.2419 16.7561 26.6746 17.4577C26.1073 18.1593 25.3129 18.6597 24.4167 18.88M29.625 29V27C29.6197 26.1172 29.3103 25.2608 28.7451 24.5644C28.1798 23.868 27.3904 23.3707 26.5 23.15M12.9583 15C12.9583 16.0609 13.3973 17.0783 14.1787 17.8284C14.9601 18.5786 16.0199 19 17.125 19C18.2301 19 19.2899 18.5786 20.0713 17.8284C20.8527 17.0783 21.2917 16.0609 21.2917 15C21.2917 13.9391 20.8527 12.9217 20.0713 12.1716C19.2899 11.4214 18.2301 11 17.125 11C16.0199 11 14.9601 11.4214 14.1787 12.1716C13.3973 12.9217 12.9583 13.9391 12.9583 15Z"
          stroke={themeInk('#0B1220')}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  return (
    <Svg width={34} height={34} viewBox="0 0 40 40" fill="none">
      <Path
        d="M0 8C0 3.58172 3.58172 0 8 0H32C36.4183 0 40 3.58172 40 8V32C40 36.4183 36.4183 40 32 40H8C3.58172 40 0 36.4183 0 32V8Z"
        fill={themeInk('#FAFAFA')}
      />
      <Path
        d="M26.5 15.998C27.3288 15.998 28.1237 16.3141 28.7097 16.8767C29.2958 17.4393 29.625 18.2023 29.625 18.998C29.625 19.7936 29.2958 20.5567 28.7097 21.1193C28.1237 21.6819 27.3288 21.998 26.5 21.998M18.1667 15.998V26.998C18.1667 27.2632 18.0569 27.5176 17.8616 27.7051C17.6662 27.8926 17.4013 27.998 17.125 27.998H16.0833C15.8071 27.998 15.5421 27.8926 15.3468 27.7051C15.1514 27.5176 15.0417 27.2632 15.0417 26.998V21.998M20.25 15.998L24.9625 12.228C25.0994 12.1185 25.266 12.0487 25.4428 12.0269C25.6195 12.0051 25.7991 12.032 25.9605 12.1046C26.1218 12.1773 26.2583 12.2925 26.3538 12.4369C26.4494 12.5814 26.5001 12.7489 26.5 12.92V25.076C26.5001 25.2471 26.4494 25.4146 26.3538 25.559C26.2583 25.7035 26.1218 25.8187 25.9605 25.8913C25.7991 25.964 25.6195 25.9909 25.4428 25.9691C25.266 25.9472 25.0994 25.8775 24.9625 25.768L20.25 21.998H11.9167C11.6404 21.998 11.3754 21.8926 11.1801 21.7051C10.9847 21.5176 10.875 21.2632 10.875 20.998V16.998C10.875 16.7328 10.9847 16.4784 11.1801 16.2909C11.3754 16.1034 11.6404 15.998 11.9167 15.998H20.25Z"
        stroke={themeInk('#0B1220')}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ContactAction({
  label,
  kind,
  onPress,
}: {
  label: string;
  kind: 'contact' | 'group' | 'broadcast';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.contactAction}
    >
      <View style={styles.contactActionIcon}>
        <ContactActionIcon kind={kind} />
      </View>
      <Text style={styles.contactActionLabel}>{label}</Text>
    </Pressable>
  );
}

function CloseIcon(): React.JSX.Element {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="m6 6 12 12M18 6 6 18"
        stroke={themeInk('#111827')}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PictureSourceIcon({
  camera,
}: {
  camera?: boolean;
}): React.JSX.Element {
  return camera ? (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z"
        stroke={themeInk('#111827')}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Circle
        cx={12}
        cy={13}
        r={3.2}
        stroke={themeInk('#111827')}
        strokeWidth={1.6}
      />
    </Svg>
  ) : (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        stroke={themeInk('#111827')}
        strokeWidth={1.5}
      />
      <Circle
        cx={9}
        cy={9}
        r={1.5}
        stroke={themeInk('#111827')}
        strokeWidth={1.5}
      />
      <Path
        d="m5 17 4-4 3 3 2-2 5 4"
        stroke={themeInk('#111827')}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GroupPictureSheet({
  visible,
  bottomInset,
  title,
  onCamera,
  onGallery,
  onClose,
}: {
  visible: boolean;
  bottomInset: number;
  title: 'Group Picture' | 'Broadcast Picture';
  onCamera: () => void;
  onGallery: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      statusBarTranslucent
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable
          accessibilityLabel={`Close ${title.toLowerCase()} options`}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel={`${title} options`}
          renderToHardwareTextureAndroid
          style={[
            styles.pictureSheet,
            { minHeight: 154 + bottomInset, paddingBottom: 20 + bottomInset },
          ]}
        >
          <View pointerEvents="none" style={styles.pictureSheetSurface} />
          <View style={styles.pictureSheetContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text allowFontScaling={false} style={styles.sheetTitle}>
                {title}
              </Text>
              <Pressable
                accessibilityLabel="Close"
                hitSlop={10}
                onPress={onClose}
              >
                <CloseIcon />
              </Pressable>
            </View>
            <View style={styles.pictureChoices}>
              <Pressable
                accessibilityLabel="Camera"
                onPress={onCamera}
                style={styles.pictureChoice}
              >
                <PictureSourceIcon camera />
                <Text allowFontScaling={false} style={styles.pictureChoiceText}>
                  Camera
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Gallery"
                onPress={onGallery}
                style={styles.pictureChoice}
              >
                <PictureSourceIcon />
                <Text allowFontScaling={false} style={styles.pictureChoiceText}>
                  Gallery
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BottomNavigation({
  onChats,
  onContacts,
  onCalls,
  onSettings,
}: {
  onChats?: () => void;
  onContacts: () => void;
  onCalls?: () => void;
  onSettings?: () => void;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bottomNav,
        { height: 91 + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      {NAV_TABS.map(tab => {
        const active = tab.key === 'contacts';
        const Icon = tab.Icon;
        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="button"
            key={tab.key}
            onPress={
              tab.key === 'contacts'
                ? onContacts
                : tab.key === 'chats'
                ? onChats
                : tab.key === 'calls'
                ? onCalls
                : tab.key === 'settings'
                ? onSettings
                : undefined
            }
            style={styles.tabItem}
          >
            <View
              style={[styles.tabIconWrap, active && styles.tabIconWrapActive]}
            >
              <Icon active={active} />
            </View>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LoadingContacts({
  showBanner = true,
}: {
  showBanner?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.loadingContent}>
      {showBanner ? (
        <View style={styles.refreshBanner}>
          <ActivityIndicator color="#344256" size="small" />
          <Text style={styles.refreshBannerText}>Refreshing contact list</Text>
        </View>
      ) : null}

      <View style={styles.skeletonTopRow}>
        <View style={styles.skeletonShort} />
        <View style={styles.skeletonTiny} />
      </View>
      {[0, 1, 2, 3, 4, 5, 6].map(index => (
        <View
          key={index}
          style={[styles.skeletonRow, index === 3 && styles.skeletonRowGap]}
        >
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonCopy}>
            <View
              style={[
                styles.skeletonLine,
                (index === 1 || index === 5) && styles.skeletonLineSmall,
              ]}
            />
            <View
              style={[
                styles.skeletonLineBottom,
                (index === 1 || index === 5) && styles.skeletonBottomSmall,
              ]}
            />
          </View>
        </View>
      ))}

      <View style={styles.floatingRefreshPill}>
        <TinyPlusIcon color="#111827" />
        <View style={styles.floatingRefreshBar} />
      </View>
    </View>
  );
}

function EmptyContacts({
  onAdd,
  onInvite,
}: {
  onAdd: () => void;
  onInvite: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.emptyState}>
      <ContactBookIllustration />
      <Text style={styles.emptyTitle}>No contacts found</Text>
      <Text style={styles.emptyCopy}>
        Add a contact to easily reach your{'\n'}friends and family
      </Text>
      <Pressable
        accessibilityLabel="Add Contact"
        accessibilityRole="button"
        onPress={onAdd}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonLabel}>Add Contact</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Invite Friends"
        accessibilityRole="button"
        onPress={onInvite}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonLabel}>Invite Friends</Text>
      </Pressable>
    </View>
  );
}

function ContactAvatar({
  contact,
  compact = false,
  showRegisteredBadge = true,
}: {
  contact: ContactListItem;
  compact?: boolean;
  showRegisteredBadge?: boolean;
}): React.JSX.Element {
  const initials =
    contact.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('') || '?';

  return (
    <View>
      {contact.thumbnail ? (
        <Image
          source={{ uri: contact.thumbnail }}
          style={[styles.avatar, compact && styles.compactAvatar]}
        />
      ) : (
        <View style={[styles.avatarFallback, compact && styles.compactAvatar]}>
          <Text
            style={[
              styles.avatarInitial,
              compact && styles.compactAvatarInitial,
            ]}
          >
            {initials}
          </Text>
        </View>
      )}
      {contact.registered && showRegisteredBadge && (
        <View
          style={[
            styles.registeredBadge,
            compact && styles.compactRegisteredBadge,
          ]}
        >
          <RegisteredBadge />
        </View>
      )}
    </View>
  );
}

function ContactRow({
  contact,
  opening,
  onInvite,
  onOpen,
}: {
  contact: ContactListItem;
  opening: boolean;
  onInvite: (contact: ContactListItem) => void;
  onOpen: (contact: ContactListItem) => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={
        contact.registered ? `Chat with ${contact.name}` : undefined
      }
      accessibilityRole={contact.registered ? 'button' : undefined}
      accessibilityState={contact.registered ? { busy: opening } : undefined}
      disabled={!contact.registered || opening}
      onPress={() => onOpen(contact)}
      style={({ pressed }) => [
        styles.contactRow,
        pressed && styles.contactRowPressed,
      ]}
    >
      <ContactAvatar contact={contact} showRegisteredBadge={false} />
      <View style={styles.contactCopy}>
        <Text numberOfLines={1} style={styles.contactName}>
          {contact.name}
        </Text>
        <Text numberOfLines={1} style={styles.contactStatus}>
          {contact.status}
        </Text>
      </View>
      {opening ? (
        <ActivityIndicator color="#7B2AE8" size="small" />
      ) : (
        !contact.registered && (
          <Pressable
            accessibilityLabel={`Invite ${contact.name}`}
            accessibilityRole="button"
            onPress={() => onInvite(contact)}
            style={styles.inviteButton}
          >
            <TinyPlusIcon />
            <Text style={styles.inviteLabel}>Invite</Text>
          </Pressable>
        )
      )}
    </Pressable>
  );
}

function ContactsList({
  contacts,
  openingContactId,
  refreshing,
  onRefresh,
  onInvite,
  onOpen,
}: {
  contacts: ContactListItem[];
  openingContactId: string;
  refreshing: boolean;
  onRefresh: () => void;
  onInvite: (contact: ContactListItem) => void;
  onOpen: (contact: ContactListItem) => void;
}): React.JSX.Element {
  const recent = contacts.filter(contact => contact.recentlyAdded).slice(0, 3);
  const contactLetter = (name: string) => {
    const first = name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
    return /^[A-Z]$/.test(first) ? first : '#';
  };
  const alphabetized = [...contacts].sort((first, second) =>
    CONTACT_INDEX_LETTERS.indexOf(contactLetter(first.name)) - CONTACT_INDEX_LETTERS.indexOf(contactLetter(second.name)) ||
    first.name.trim().localeCompare(second.name.trim(), undefined, {sensitivity: 'base'}),
  );
  const groups = alphabetized.reduce<
    Array<{ letter: string; contacts: ContactListItem[] }>
  >((acc, contact) => {
    const letter = contactLetter(contact.name);
    const existing = acc.find(group => group.letter === letter);
    if (existing) {
      existing.contacts.push(contact);
    } else {
      acc.push({ letter, contacts: [contact] });
    }
    return acc;
  }, []);
  const rows: Array<
    | { kind: 'header'; key: string; label: string }
    | { kind: 'contact'; key: string; contact: ContactListItem }
  > = [];

  if (recent.length > 0) {
    rows.push({
      kind: 'header',
      key: 'header-recent',
      label: 'Recently Added',
    });
    recent.forEach(contact =>
      rows.push({ kind: 'contact', key: `recent-${contact.id}`, contact }),
    );
  }
  groups.forEach(group => {
    rows.push({
      kind: 'header',
      key: `header-${group.letter}`,
      label: group.letter,
    });
    group.contacts.forEach(contact =>
      rows.push({
        kind: 'contact',
        key: `contact-${group.letter}-${contact.id}`,
        contact,
      }),
    );
  });
  const listRef = useRef<FlatList<(typeof rows)[number]>>(null);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingJump = useRef<{index: number; attempts: number} | null>(null);
  const scrollOffset = useRef(new Animated.Value(0)).current;
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [indexHeight, setIndexHeight] = useState(0);

  useEffect(() => {
    pendingJump.current = null;
    if (jumpTimer.current) { clearTimeout(jumpTimer.current); }
    return () => {
      pendingJump.current = null;
      if (jumpTimer.current) { clearTimeout(jumpTimer.current); }
    };
  }, [contacts]);

  const headerIndexes = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row.kind === 'header' && row.label.length === 1) {
      headerIndexes.set(row.label, index);
    }
  });

  const jumpToLetter = (letter: string) => {
    const index = headerIndexes.get(letter);
    if (index === undefined) return;
    if (jumpTimer.current) { clearTimeout(jumpTimer.current); }
    pendingJump.current = {index, attempts: 0};
    listRef.current?.scrollToIndex({animated: false, index, viewPosition: 0});
  };

  const scrollRange = contentHeight - viewportHeight;
  const thumbHeight = Math.min(viewportHeight, Math.max(24, viewportHeight * viewportHeight / Math.max(1, contentHeight)));
  const letterLineHeight = indexHeight > 0 ? Math.min(11, indexHeight / CONTACT_INDEX_LETTERS.length) : 11;

  return (
    <View style={styles.contactListViewport}>
      <FlatList
        ref={listRef}
        contentContainerStyle={styles.contactListContent}
        data={rows}
        initialNumToRender={18}
        keyExtractor={item => item.key}
        keyboardShouldPersistTaps="handled"
        maxToRenderPerBatch={12}
        onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_width, height) => setContentHeight(height)}
        onScroll={Animated.event([{nativeEvent: {contentOffset: {y: scrollOffset}}}], {useNativeDriver: false})}
        scrollEventThrottle={16}
        onScrollToIndexFailed={({index, averageItemLength}) => {
          const jump = pendingJump.current;
          if (!jump || jump.index !== index || jump.attempts >= 5) { return; }
          jump.attempts += 1;
          if (jumpTimer.current) { clearTimeout(jumpTimer.current); }
          listRef.current?.scrollToOffset({animated: false, offset: index * averageItemLength});
          jumpTimer.current = setTimeout(() => {
            if (pendingJump.current === jump) {
              listRef.current?.scrollToIndex({animated: false, index, viewPosition: 0});
            }
          }, 100);
        }}
        persistentScrollbar
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7442E8"
            colors={['#7442E8']}
          />
        }
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Text style={styles.sectionLabel}>{item.label}</Text>
          ) : (
            <ContactRow
              contact={item.contact}
              opening={openingContactId === item.contact.id}
              onInvite={onInvite}
              onOpen={onOpen}
            />
          )
        }
        showsVerticalScrollIndicator
        style={styles.contactList}
        updateCellsBatchingPeriod={40}
        windowSize={7}
      />
      {viewportHeight > 0 && scrollRange > 0 ? (
        <View pointerEvents="none" accessible={false} testID="contact-list-scrollbar" style={styles.contactScrollTrack}>
          <Animated.View testID="contact-list-scroll-thumb" style={[styles.contactScrollThumb, {
            height: thumbHeight,
            transform: [{translateY: scrollOffset.interpolate({
              inputRange: [0, scrollRange], outputRange: [0, viewportHeight - thumbHeight], extrapolate: 'clamp',
            })}],
          }]} />
        </View>
      ) : null}
      <View accessibilityLabel="Contact alphabetical index" onLayout={event => setIndexHeight(event.nativeEvent.layout.height)} style={styles.alphabetIndex}>
        {CONTACT_INDEX_LETTERS.map(letter => {
          const available = headerIndexes.has(letter);
          return (
            <Pressable
              accessibilityLabel={`Jump to contacts starting with ${letter}`}
              accessibilityRole="button"
              accessibilityState={{disabled: !available}}
              disabled={!available}
              hitSlop={{left: 6, right: 6}}
              key={letter}
              onPress={() => jumpToLetter(letter)}>
              <Text allowFontScaling={false} style={[styles.alphabetIndexLetter,
                {lineHeight: letterLineHeight, fontSize: Math.min(9, letterLineHeight)},
                !available && styles.alphabetIndexLetterDisabled]}>
                {letter}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ContactsScreen({
  initialMode = 'list',
  showContactPermissionPrompt = false,
  onContactPermissionPromptHandled,
  onOpenConversation,
  onOpenChats,
  onOpenCalls,
  onOpenSettings,
  onBroadcastCreated,
  initialGroupDraft,
}: ContactsScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<ScreenMode>(initialMode);
  const [qrOpen, setQrOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [localContacts, setLocalContacts] = useState<DeviceContact[]>([]);
  const [recentContactIds, setRecentContactIds] = useState<Set<string>>(
    new Set(),
  );
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [permissionPrompt, setPermissionPrompt] = useState<
    'request' | 'denied' | null
  >(showContactPermissionPrompt ? 'request' : null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [countryOpen, setCountryOpen] = useState(false);
  const [openingContactId, setOpeningContactId] = useState('');
  const [inviteContact, setInviteContact] = useState<ContactListItem | null>(
    null,
  );
  const [invitationMessage, setInvitationMessage] = useState(
    DEFAULT_INVITATION_MESSAGE,
  );
  const [groupName, setGroupName] = useState('');
  const [groupNameError, setGroupNameError] = useState('');
  const [groupDescription, setGroupDescription] = useState(
    initialGroupDraft?.description || '',
  );
  const [groupPhoto, setGroupPhoto] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [broadcastPhoto, setBroadcastPhoto] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [broadcastPhotoCandidate, setBroadcastPhotoCandidate] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set(initialGroupDraft?.members.map(member => member.userId)),
  );
  const [seededGroupMembers, setSeededGroupMembers] = useState<
    SimilarGroupDraft['members']
  >(initialGroupDraft?.members || []);
  const [memberSearch, setMemberSearch] = useState('');
  const [groupChatContacts, setGroupChatContacts] = useState<ContactListItem[]>([]);
  const [groupSearchResults, setGroupSearchResults] = useState<SearchContact[]>([]);
  const [roleSearch, setRoleSearch] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [pictureTarget, setPictureTarget] = useState<
    'group' | 'broadcast' | null
  >(null);
  const [memberRoles, setMemberRoles] = useState<Record<string, GroupRole>>({});
  const [roleMenuUserId, setRoleMenuUserId] = useState('');
  const [permissions, setPermissions] =
    useState<Record<PermissionKey, boolean>>(DEFAULT_PERMISSIONS);
  const [broadcastName, setBroadcastName] = useState('');
  const [broadcastSearchResults, setBroadcastSearchResults] = useState<
    BroadcastParticipant[]
  >([]);
  const [creatingBroadcast, setCreatingBroadcast] = useState(false);
  // Every number already in the address book (not only each contact's first),
  // so New Contact can tell that a number is taken.
  const [knownPhones, setKnownPhones] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const savingRef = useRef(false);
  const refreshVersion = useRef(0);

  const buildList = useCallback(
    async (
      deviceContacts: DeviceContact[],
      localItems: DeviceContact[],
      recentIds: Set<string>,
      version: number,
    ) => {
      const merged = [...localItems, ...deviceContacts];
      const phoneNumbers = merged
        .map(contact => contact.phones?.[0]?.number || '')
        .filter(Boolean);
      const registeredByPhone = new Map<string, SyncedContactUser>();

      if (phoneNumbers.length > 0) {
        try {
          const response = await syncContacts(phoneNumbers);
          response.registered?.forEach(user => {
            const phone = user.phone || user.phoneNumber || '';
            const normalized = normalizePhone(phone);
            if (normalized) {
              registeredByPhone.set(normalized, user);
            }
          });
        } catch {
          setMessage(
            'Contacts refreshed. Backend sync is unavailable right now.',
          );
        }
      }

      const seen = new Set<string>();
      const list = merged
        .filter(contact => {
          const key =
            normalizePhone(contact.phones?.[0]?.number || '') || contact.id;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        })
        .map(contact =>
          toContactListItem(contact, registeredByPhone, recentIds),
        );

      const known = new Set<string>();
      merged.forEach(contact =>
        contact.phones?.forEach(entry => {
          const key = normalizePhone(entry.number || '');
          if (key) known.add(key);
        }),
      );

      if (version === refreshVersion.current) {
        setContacts(list);
        setKnownPhones(known);
      }
    },
    [],
  );

  const refreshContacts = useCallback(
    async (
      nextLocalContacts = localContacts,
      nextRecentContactIds = recentContactIds,
    ) => {
      const version = ++refreshVersion.current;
      setRefreshing(true);
      const started = Date.now();
      try {
        const stored = await loadSavedContacts().catch(() => []);
        const byId = new Map(stored.map(contact => [contact.id, contact]));
        nextLocalContacts.forEach(contact => byId.set(contact.id, contact));
        nextLocalContacts = [...byId.values()];
        if (version === refreshVersion.current) setLocalContacts(nextLocalContacts);
        const permission = await Contacts.getPermissionsAsync();
        let allowed = permission.granted;

        if (!allowed && permission.canAskAgain !== false) {
          const requested = await Contacts.requestPermissionsAsync();
          allowed = requested.granted;
        }

        const deviceContacts = allowed
          ? ((await Contacts.Contact.getAllDetails(CONTACT_FIELDS, {
              sortOrder: Contacts.ContactsSortOrder?.GivenName,
            })) as DeviceContact[])
          : [];

        if (!allowed) {
          setMessage(
            'Contact access is off. You can still add contacts inside Chatterly.',
          );
        }

        await buildList(
          deviceContacts,
          nextLocalContacts,
          nextRecentContactIds,
          version,
        );
      } catch {
        await buildList([], nextLocalContacts, nextRecentContactIds, version);
        setMessage('Unable to refresh contacts. Please try again.');
      } finally {
        const elapsed = Date.now() - started;
        if (elapsed < REFRESH_MINIMUM_MS) {
          await delay(REFRESH_MINIMUM_MS - elapsed);
        }
        if (version === refreshVersion.current) setRefreshing(false);
      }
    },
    [buildList, localContacts, recentContactIds],
  );

  useEffect(() => {
    let active = true;
    if (!showContactPermissionPrompt) {
      refreshContacts();
      return () => {
        active = false;
      };
    }
    Contacts.getPermissionsAsync()
      .then(permission => {
        if (!active) {
          return;
        }
        if (permission.granted) {
          setPermissionPrompt(null);
          onContactPermissionPromptHandled?.();
          refreshContacts();
        } else {
          setPermissionPrompt(
            permission.canAskAgain === false ? 'denied' : 'request',
          );
          onContactPermissionPromptHandled?.();
        }
      })
      .catch(() => {
        if (active) {
          setPermissionPrompt('request');
          onContactPermissionPromptHandled?.();
        }
      });
    return () => {
      active = false;
    };
    // Contacts should refresh when this screen opens; later refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (permissionPrompt !== 'denied') {
      return;
    }
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        return;
      }
      Contacts.getPermissionsAsync()
        .then(permission => {
          if (permission.granted) {
            setPermissionPrompt(null);
            onContactPermissionPromptHandled?.();
            refreshContacts();
          }
        })
        .catch(() => undefined);
    });
    return () => subscription.remove();
  }, [onContactPermissionPromptHandled, permissionPrompt, refreshContacts]);

  const allowContactAccess = useCallback(async () => {
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.granted) {
        setPermissionPrompt(null);
        onContactPermissionPromptHandled?.();
        await refreshContacts();
      } else {
        setPermissionPrompt('denied');
        onContactPermissionPromptHandled?.();
      }
    } catch {
      setPermissionPrompt('denied');
      onContactPermissionPromptHandled?.();
    }
  }, [onContactPermissionPromptHandled, refreshContacts]);

  const openContactSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      setMessage('Unable to open device settings.');
    }
  }, []);

  const deferContactAccess = useCallback(() => {
    setPermissionPrompt('denied');
    onContactPermissionPromptHandled?.();
  }, [onContactPermissionPromptHandled]);

  const dismissContactPrompt = useCallback(() => {
    setPermissionPrompt(null);
    onContactPermissionPromptHandled?.();
  }, [onContactPermissionPromptHandled]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) {
      return contacts;
    }
    const phoneQuery = /^[+\d\s().-]+$/.test(query) ? phoneDigits(query) : '';
    const localPhoneQuery = phoneQuery ? splitPhoneNumber(query)?.local : undefined;
    return contacts.filter(
      contact =>
        contact.name.toLocaleLowerCase().includes(query) ||
        contact.phone.toLocaleLowerCase().includes(query) ||
        Boolean(phoneQuery && (
          phoneDigits(contact.phone).includes(phoneQuery) ||
          (localPhoneQuery && phoneDigits(contact.phone) === localPhoneQuery)
        )) ||
        contact.email.toLocaleLowerCase().includes(query),
    );
  }, [contacts, search]);

  const openCreate = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setCountryOpen(false);
    setMode('create');
  }, []);

  const openCreateGroup = useCallback(() => {
    setGroupName('');
    setGroupNameError('');
    setGroupDescription('');
    setGroupPhoto(null);
    setSelectedMemberIds(new Set());
    setMemberSearch('');
    setRoleSearch('');
    setSeededGroupMembers([]);
    setMemberRoles({});
    setPermissions(DEFAULT_PERMISSIONS);
    setMode('createGroup');
  }, []);

  const openCreateBroadcast = useCallback(() => {
    setBroadcastName('');
    setBroadcastPhoto(null);
    setBroadcastPhotoCandidate(null);
    setSelectedMemberIds(new Set());
    setMemberSearch('');
    setBroadcastSearchResults([]);
    setMode('createBroadcast');
  }, []);

  const chooseGroupPhoto = useCallback(() => setPictureTarget('group'), []);
  const chooseBroadcastPhoto = useCallback(
    () => setPictureTarget('broadcast'),
    [],
  );

  const pickPicture = useCallback(
    async (source: 'camera' | 'gallery') => {
      const target = pictureTarget;
      setPictureTarget(null);
      if (!target) return;
      try {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          const subject = target === 'group' ? 'group' : 'broadcast';
          setMessage(
            source === 'camera'
              ? `Camera access is required to take a ${subject} picture.`
              : `Photo library access is required to add a ${subject} picture.`,
          );
          return;
        }
        const options = {
          mediaTypes: ['images'] as ImagePicker.MediaType[],
          // Broadcast pictures use the in-app editor below so cropping is
          // consistently available on Android system photo pickers too.
          allowsEditing: target === 'group',
          aspect: [1, 1] as [number, number],
          quality: 0.8,
        };
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync(options)
            : await ImagePicker.launchImageLibraryAsync(options);
        if (!result.canceled && result.assets[0]) {
          if (target === 'group') setGroupPhoto(result.assets[0]);
          else setBroadcastPhotoCandidate(result.assets[0]);
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : `Unable to select the ${target} picture.`,
        );
      }
    },
    [pictureTarget],
  );

  // A similar group is seeded from another group's roster, and those members
  // may not be in this device's address book. They still need a row, or they
  // would be submitted without ever being visible or deselectable.
  const groupParticipantPool = useMemo(() => {
    const byId = new Map<string, ContactListItem>();
    contacts
      .filter(contact => contact.registered && contact.userId)
      .forEach(contact => {
        if (!byId.has(contact.userId)) byId.set(contact.userId, contact);
      });
    groupChatContacts.forEach(contact => byId.set(contact.userId, contact));
    groupSearchResults.forEach(contact =>
      byId.set(contact.userId, {
        id: `search-${contact.userId}`,
        name: contact.name,
        phone: contact.phone || '',
        email: '',
        thumbnail: contact.thumbnail,
        status: 'Chatterly contact',
        registered: true,
        recentlyAdded: false,
        userId: contact.userId,
      }),
    );
    seededGroupMembers.forEach(member => {
      if (!byId.has(member.userId))
        byId.set(member.userId, {
          id: `group-${member.userId}`,
          name: member.name,
          phone: member.phone || '',
          email: '',
          thumbnail: member.profilePic || null,
          status: 'Group member',
          registered: true,
          recentlyAdded: false,
          userId: member.userId,
        });
    });
    return [...byId.values()];
  }, [contacts, groupChatContacts, groupSearchResults, seededGroupMembers]);
  const groupCandidates = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return groupParticipantPool.filter(
      contact =>
        !query ||
        contact.name.toLowerCase().includes(query) ||
        contact.phone.includes(query),
    );
  }, [groupParticipantPool, memberSearch]);
  useEffect(() => {
    if (mode !== 'groupMembers') return;
    let active = true;
    getForwardDestinations()
      .then(destinations => {
        if (!active) return;
        setGroupChatContacts(destinations
          .filter(destination => destination.kind === 'contact')
          .map(destination => ({
            id: `chat-${destination.id}`,
            name: destination.name,
            phone: '',
            email: '',
            thumbnail: destination.thumbnail,
            status: destination.subtitle || 'Recent chat',
            registered: true,
            recentlyAdded: false,
            userId: destination.id,
          })));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [mode]);
  useEffect(() => {
    if (mode !== 'broadcastMembers' && mode !== 'groupMembers') {
      setBroadcastSearchResults([]);
      setGroupSearchResults([]);
      return;
    }
    if (!memberSearch.trim()) {
      if (mode === 'groupMembers') setGroupSearchResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const found = await searchChatContacts(memberSearch);
        if (active) {
          if (mode === 'groupMembers') {
            setGroupSearchResults(found);
          } else setBroadcastSearchResults(current => {
            const byId = new Map(
              current.map(contact => [contact._id, contact]),
            );
            found.forEach(contact =>
              byId.set(contact.userId, {
                _id: contact.userId,
                name: contact.name,
                profilePic: contact.thumbnail,
              }),
            );
            return [...byId.values()];
          });
        }
      } catch (error) {
        if (active)
          setMessage(
            error instanceof Error
              ? error.message
              : 'Unable to search contacts.',
          );
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [memberSearch, mode]);
  const broadcastParticipantPool = useMemo(() => {
    const byId = new Map<string, ContactListItem>();
    contacts
      .filter(contact => contact.registered && contact.userId)
      .forEach(contact => byId.set(contact.userId, contact));
    broadcastSearchResults.forEach(contact =>
      byId.set(contact._id, {
        id: `search-${contact._id}`,
        name: contact.name,
        phone: '',
        email: '',
        thumbnail: contact.profilePic,
        status: 'Chatterly contact',
        registered: true,
        recentlyAdded: false,
        userId: contact._id,
      }),
    );
    return [...byId.values()];
  }, [broadcastSearchResults, contacts]);
  const broadcastCandidates = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return broadcastParticipantPool.filter(
      contact =>
        !query ||
        contact.name.toLowerCase().includes(query) ||
        contact.phone.includes(query),
    );
  }, [broadcastParticipantPool, memberSearch]);
  const selectedContacts = useMemo(
    () =>
      (mode === 'broadcastMembers'
        ? broadcastParticipantPool
        : groupParticipantPool
      ).filter(contact => selectedMemberIds.has(contact.userId)),
    [broadcastParticipantPool, groupParticipantPool, mode, selectedMemberIds],
  );
  const filteredSelectedContacts = useMemo(() => {
    const query = roleSearch.trim().toLowerCase();
    return query
      ? selectedContacts.filter(
          contact =>
            contact.name.toLowerCase().includes(query) ||
            contact.phone.includes(query),
        )
      : selectedContacts;
  }, [roleSearch, selectedContacts]);

  const setMemberRole = useCallback((userId: string, role: GroupRole) => {
    setMemberRoles(current => ({ ...current, [userId]: role }));
    setRoleMenuUserId('');
  }, []);

  const togglePermission = useCallback((key: PermissionKey) => {
    setPermissions(current => ({ ...current, [key]: !current[key] }));
  }, []);

  const toggleMember = useCallback((userId: string) => {
    setSelectedMemberIds(current => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      if (next.has(userId) === false)
        setMemberRoles(roles => {
          const updated = { ...roles };
          delete updated[userId];
          return updated;
        });
      return next;
    });
  }, []);

  const submitGroup = useCallback(async () => {
    if (!groupName.trim() || selectedMemberIds.size < 2 || creatingGroup)
      return;
    setCreatingGroup(true);
    try {
      let matchingGroups: Awaited<ReturnType<typeof searchGroups>>;
      try {
        matchingGroups = await searchGroups(groupName.trim());
      } catch {
        setGroupNameError('Unable to check this group name. Please try again.');
        setMode('createGroup');
        return;
      }
      const normalizedName = groupName
        .trim()
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase();
      const duplicate = matchingGroups.some(
        group =>
          String(group.groupName || '')
            .trim()
            .normalize('NFKC')
            .replace(/\s+/g, ' ')
            .toLocaleLowerCase() === normalizedName,
      );
      if (duplicate) {
        setGroupNameError(
          'Group name already exists. Choose an alternate group name.',
        );
        setMode('createGroup');
        return;
      }
      setGroupNameError('');
      const group = await createGroup({
        groupName,
        description: groupDescription,
        participantIds: [...selectedMemberIds],
        photo: groupPhoto,
      });
      // The group endpoint may succeed even if a follow-up role/settings call
      // fails. Leave the creation form as soon as we have a group ID so a retry
      // cannot create a second group with the same name.
      setMode('list');
      // Every setup endpoint saves the same group document. Apply them in
      // order so concurrent saves cannot overwrite roles or permissions.
      const setupResults: boolean[] = [];
      const runSetup = async (action: () => Promise<unknown>) => {
        try {
          await action();
          setupResults.push(true);
        } catch {
          setupResults.push(false);
        }
      };
      for (const userId of selectedMemberIds) {
        const role = memberRoles[userId] || 'Member';
        if (role === 'Admin') await runSetup(() => assignGroupAdmin(group._id, userId));
        else if (role === 'Moderator') await runSetup(() => assignGroupModerator(group._id, userId));
      }
      await runSetup(() =>
        updateGroupMessagePermissions(group._id, {
          membersCanSendMessages: permissions.memberSend,
          membersCanShareMedia: permissions.memberMedia,
        }),
      );
      await runSetup(() =>
        updateGroupPermissions(group._id, {
          member: { addMembers: permissions.memberAdd },
          moderator: {
            addMembers: permissions.moderatorAdd,
            assignRoles: permissions.moderatorRoles,
            pinMessages: permissions.moderatorPin,
            editGroupInfo: permissions.moderatorEdit,
          },
          admin: { approveJoinRequests: permissions.adminApprovals },
        }),
      );
      await runSetup(() =>
        setGroupManageReportsPermission(group._id, permissions.moderatorReports),
      );
      if (permissions.memberInvite) {
        await runSetup(() => enableGroupInviteLink(group._id));
      }
      setMessage(
        setupResults.some(result => !result)
          ? 'Group created, but some group settings could not be applied.'
          : 'Group created successfully.',
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unable to create the group.';
      if (/already exists|duplicate group/i.test(errorMessage)) {
        setGroupNameError(
          'Group name already exists. Choose an alternate group name.',
        );
        setMode('createGroup');
      } else {
        setMessage(errorMessage);
      }
    } finally {
      setCreatingGroup(false);
    }
  }, [
    creatingGroup,
    groupDescription,
    groupName,
    groupPhoto,
    memberRoles,
    permissions.adminApprovals,
    permissions.memberAdd,
    permissions.memberInvite,
    permissions.memberMedia,
    permissions.memberSend,
    permissions.moderatorAdd,
    permissions.moderatorEdit,
    permissions.moderatorPin,
    permissions.moderatorReports,
    permissions.moderatorRoles,
    selectedMemberIds,
  ]);

  const submitBroadcast = useCallback(async () => {
    if (
      !broadcastName.trim() ||
      selectedMemberIds.size < 2 ||
      creatingBroadcast
    )
      return;
    setCreatingBroadcast(true);
    try {
      const created = await createBroadcast(broadcastName, [
        ...selectedMemberIds,
      ]);
      if (broadcastPhoto)
        await saveBroadcastImage(created._id, broadcastPhoto.uri).catch(
          () => undefined,
        );
      const selectedParticipants = broadcastParticipantPool
        .filter(contact => selectedMemberIds.has(contact.userId))
        .map(contact => ({
          _id: contact.userId,
          name: contact.name,
          profilePic: contact.thumbnail,
        }));
      const selectedById = new Map(
        selectedParticipants.map(participant => [participant._id, participant]),
      );
      const complete = {
        ...created,
        imageUri: broadcastPhoto?.uri || null,
        participants: created.participants.length
          ? created.participants.map(
              participant => selectedById.get(participant._id) || participant,
            )
          : selectedParticipants,
      };
      setMessage('Broadcast created successfully.');
      if (onBroadcastCreated) onBroadcastCreated(complete);
      else setMode('list');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to create the broadcast.',
      );
    } finally {
      setCreatingBroadcast(false);
    }
  }, [
    broadcastName,
    broadcastParticipantPool,
    broadcastPhoto,
    creatingBroadcast,
    onBroadcastCreated,
    selectedMemberIds,
  ]);

  const openContactsTab = useCallback(() => {
    setMode('list');
    refreshContacts();
  }, [refreshContacts]);

  const inviteFriends = useCallback(async () => {
    try {
      await Share.share({
        message: withAppInviteLink(
          'Join me on Chatterly so we can chat and call easily.',
        ),
      });
    } catch {
      setMessage('Unable to open invite options.');
    }
  }, []);

  const openInvite = useCallback((contact: ContactListItem) => {
    setInvitationMessage(DEFAULT_INVITATION_MESSAGE);
    setInviteContact(contact);
  }, []);

  const closeInvite = useCallback(() => {
    setInviteContact(null);
  }, []);

  const sendInviteBySms = useCallback(async () => {
    if (!inviteContact) {
      return;
    }
    const recipient = inviteContact.phone.trim().replace(/[^\d+]/g, '');
    const body = invitationMessage.trim();
    if (!recipient || !body) {
      return;
    }

    const separator = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${recipient}${separator}body=${encodeURIComponent(withAppInviteLink(body))}`;
    try {
      await Linking.openURL(url);
      setInviteContact(null);
      setMessage(`SMS invite opened for ${inviteContact.name}.`);
    } catch {
      setInviteContact(null);
      setMessage('Unable to open your SMS app. Please try again.');
    }
  }, [invitationMessage, inviteContact]);

  const openConversation = useCallback(
    (contact: ContactListItem, chatId: string) => {
      if (!onOpenConversation || !contact.userId || !chatId) {
        return;
      }
      onOpenConversation(
        {
          userId: contact.userId,
          name: contact.name,
          thumbnail: contact.thumbnail,
          status: contact.status,
          phone: contact.phone,
        },
        chatId,
      );
    },
    [onOpenConversation],
  );

  const createConversation = useCallback(
    async (contact: ContactListItem) => {
      setOpeningContactId(contact.id);
      try {
        const created = await startChat(contact.userId);
        openConversation(contact, created.chatId);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Unable to create the conversation.',
        );
      } finally {
        setOpeningContactId('');
      }
    },
    [openConversation],
  );

  const confirmNewConversation = useCallback(
    (contact: ContactListItem) => {
      const android = Platform.OS === 'android';
      Alert.alert(
        android ? 'Start New Chat' : 'Create Conversation?',
        android
          ? `Start chatting with\n\n${contact.name}?`
          : `Start a conversation with\n\n${contact.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: android ? 'Start Chat' : 'Start',
            onPress: () => {
              createConversation(contact);
            },
          },
        ],
        { cancelable: true },
      );
    },
    [createConversation],
  );

  const selectContact = useCallback(
    async (contact: ContactListItem) => {
      if (!contact.registered || !contact.userId || openingContactId) {
        return;
      }
      setOpeningContactId(contact.id);
      try {
        const chats = await getChatList();
        const existing = findDirectChatForUser(chats, contact.userId);
        const existingChatId = chatIdOf(existing);
        if (existingChatId) {
          openConversation(contact, existingChatId);
          return;
        }
        confirmNewConversation(contact);
      } catch {
        // Starting a chat is idempotent on the backend, so confirmation remains
        // safe even when the list endpoint is temporarily unavailable.
        confirmNewConversation(contact);
      } finally {
        setOpeningContactId('');
      }
    },
    [confirmNewConversation, openConversation, openingContactId],
  );

  const updateDraft = <Key extends keyof ContactDraft>(
    key: Key,
    value: ContactDraft[Key],
  ) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  const emailLooksValid =
    !draft.email.trim() ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim());
  const draftPhoneKey = normalizePhone(draft.phone);
  const phoneLooksValid = draftPhoneKey.length >= 7;
  // The same number cannot be added twice: it would show up as a second copy of
  // the contact and, with phone sync on, add another copy to the address book.
  // Numbers are compared the way the list merges them (last ten digits).
  const duplicatePhone =
    phoneLooksValid &&
    (knownPhones.has(draftPhoneKey) ||
      localContacts.some(local =>
        local.phones?.some(
          entry => normalizePhone(entry.number || '') === draftPhoneKey,
        ),
      ));
  const canSave = Boolean(
    draft.firstName.trim() &&
      draft.lastName.trim() &&
      phoneLooksValid &&
      !duplicatePhone &&
      emailLooksValid &&
      !saving,
  );
  const pageInsetsStyle = useMemo(
    () => ({
      paddingTop: Math.max(insets.top + 18, 36),
      paddingBottom:
        mode === 'list'
          ? 90 + insets.bottom
          : Math.max(insets.bottom + 22, 34),
    }),
    [insets.bottom, insets.top, mode],
  );

  const saveContact = useCallback(async () => {
    // A second tap before the button has re-rendered as busy must not save (and,
    // with sync on, create in the address book) the same contact again.
    if (!canSave || savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaving(true);

    const phone = asDialedPhone(draft.countryCode, draft.phone);
    const contact: DeviceContact = {
      id: `local-${Date.now()}`,
      givenName: draft.firstName.trim(),
      familyName: draft.lastName.trim(),
      fullName: `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim(),
      phones: [{ number: phone }],
      emails: draft.email.trim() ? [{ address: draft.email.trim() }] : [],
      thumbnail: null,
    };

    try {
      let savedContact = contact;

      if (draft.syncToPhone) {
        const permission = await Contacts.requestPermissionsAsync();
        if (!permission.granted) {
          throw new Error('Contact access is required to sync to your phone.');
        }

        const created = await Contacts.Contact.create({
          givenName: contact.givenName || '',
          familyName: contact.familyName || '',
          phones: [{ label: 'mobile', number: phone }],
          emails: draft.email.trim()
            ? [{ label: 'home', address: draft.email.trim() }]
            : [],
        });

        savedContact = { ...contact, id: created.id };
      }

      await saveLocalContact(savedContact);
      const nextLocalContacts = [savedContact, ...localContacts];
      const nextRecentContactIds = new Set([
        savedContact.id,
        ...recentContactIds,
      ]);
      setLocalContacts(nextLocalContacts);
      setRecentContactIds(nextRecentContactIds);
      setMode('list');
      await refreshContacts(nextLocalContacts, nextRecentContactIds);
      setMessage('Contact saved.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to save contact. Please try again.',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [canSave, draft, localContacts, recentContactIds, refreshContacts]);

  const listContent = (
    <>
      <View style={styles.searchBox}>
        <SearchIcon />
        <TextInput
          accessibilityLabel="Search contacts"
          onChangeText={setSearch}
          placeholder="Search Contacts"
          placeholderTextColor="#344256"
          style={styles.searchInput}
          value={search}
        />
      </View>

      <View style={styles.contactActions}>
        <ContactAction
          kind="contact"
          label="New Contact"
          onPress={openCreate}
        />
        <ContactAction
          kind="group"
          label="New Group"
          onPress={openCreateGroup}
        />
        <ContactAction
          kind="broadcast"
          label="New Broadcast"
          onPress={openCreateBroadcast}
        />
      </View>

      {permissionPrompt ? (
        <LoadingContacts showBanner={false} />
      ) : refreshing && contacts.length === 0 ? (
        <LoadingContacts />
      ) : filteredContacts.length > 0 ? (
        <ContactsList
          contacts={filteredContacts}
          openingContactId={openingContactId}
          onRefresh={() => {
            refreshContacts();
          }}
          onInvite={openInvite}
          onOpen={selectContact}
          refreshing={refreshing}
        />
      ) : search.trim() ? (
        <View accessibilityLiveRegion="polite" style={styles.searchEmptyState}>
          <Text style={styles.emptyTitle}>No contacts found</Text>
          <Text style={styles.emptyCopy}>
            Try a different name, phone number, or email.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.emptyContactViewport}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                refreshContacts();
              }}
              tintColor="#7442E8"
              colors={['#7442E8']}
            />
          }
          style={styles.emptyContactScroll}
        >
          <EmptyContacts onAdd={openCreate} onInvite={inviteFriends} />
        </ScrollView>
      )}
    </>
  );

  if (qrOpen) {
    return <QrCodeScreen user={getSession()?.user || {}} backLabel="Back to contacts" onBack={() => setQrOpen(false)} />;
  }

  return (
    <View style={styles.root}>
      <View style={[styles.page, pageInsetsStyle]}>
        {mode === 'list' || mode === 'create' ? (
          <Header
            onOpenQr={() => setQrOpen(true)}
            onBack={
              mode === 'create'
                ? () => {
                    Keyboard.dismiss();
                    setMode('list');
                  }
                : undefined
            }
          />
        ) : (
          <View
            style={[
              styles.groupHeader,
              mode === 'createGroup' && styles.createGroupHeader,
            ]}
          >
            <Pressable
              accessibilityLabel="Back"
              hitSlop={12}
              onPress={() =>
                setMode(
                  mode === 'managePermissions'
                    ? 'manageRoles'
                    : mode === 'manageRoles'
                    ? 'groupMembers'
                    : mode === 'groupMembers'
                    ? 'createGroup'
                    : mode === 'broadcastMembers'
                    ? 'createBroadcast'
                    : 'list',
                )
              }
            >
              <BackIcon />
            </Pressable>
            <Text allowFontScaling={false} style={styles.groupHeaderTitle}>
              {mode === 'managePermissions'
                ? 'Manage Permissions'
                : mode === 'manageRoles'
                ? 'Manage Member Role'
                : mode === 'broadcastMembers'
                ? 'Add members'
                : mode === 'groupMembers'
                ? 'Add Members'
                : mode === 'createBroadcast'
                ? 'Create Broadcast'
                : 'Create Group'}
            </Text>
          </View>
        )}
        {mode === 'list' ? (
          listContent
        ) : mode === 'create' ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.formKeyboard}
          >
            <ScrollView
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.fieldLabel}>First Name <Text style={styles.requiredMark}>*</Text></Text>
              <TextInput
                accessibilityLabel="First Name"
                onChangeText={value => updateDraft('firstName', value)}
                placeholder="Full Name"
                placeholderTextColor="#8792A4"
                style={styles.fieldInput}
                value={draft.firstName}
              />

              <Text style={styles.fieldLabel}>Last Name <Text style={styles.requiredMark}>*</Text></Text>
              <TextInput
                accessibilityLabel="Last Name"
                onChangeText={value => updateDraft('lastName', value)}
                placeholder="Full Name"
                placeholderTextColor="#8792A4"
                style={styles.fieldInput}
                value={draft.lastName}
              />

              <Text style={styles.fieldLabel}>Country</Text>
              <Pressable
                accessibilityLabel="Country"
                accessibilityRole="button"
                onPress={() => setCountryOpen(open => !open)}
                style={styles.countryField}
              >
                <View style={styles.countryValue}>
                  <CountryFlag />
                  <Text style={styles.countryText}>India (+91)</Text>
                </View>
                <ChevronDownIcon />
              </Pressable>
              {countryOpen && (
                <Pressable
                  accessibilityLabel="Select India"
                  accessibilityRole="button"
                  onPress={() => setCountryOpen(false)}
                  style={styles.countryOption}
                >
                  <CountryFlag />
                  <Text style={styles.countryText}>India (+91)</Text>
                </Pressable>
              )}

              <Text style={styles.fieldLabel}>Phone Number <Text style={styles.requiredMark}>*</Text></Text>
              <View style={styles.iconField}>
                <PhoneInputIcon />
                <TextInput
                  accessibilityLabel="Phone Number"
                  keyboardType="phone-pad"
                  onChangeText={value => updateDraft('phone', value)}
                  placeholder="Enter your phone number"
                  placeholderTextColor="#8792A4"
                  style={styles.iconInput}
                  value={draft.phone}
                />
              </View>
              {duplicatePhone && (
                <Text
                  accessibilityLiveRegion="polite"
                  style={styles.validationText}
                >
                  This phone number is already in your contacts.
                </Text>
              )}

              <Text style={styles.fieldLabel}>Email ID</Text>
              <View style={styles.iconField}>
                <EmailInputIcon />
                <TextInput
                  accessibilityLabel="Email ID"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={value => updateDraft('email', value)}
                  placeholder="yash@example.com"
                  placeholderTextColor="#8792A4"
                  style={styles.iconInput}
                  value={draft.email}
                />
              </View>
              {!emailLooksValid && (
                <Text style={styles.validationText}>
                  Enter a valid email address
                </Text>
              )}

              <Pressable
                accessibilityLabel="Sync contact to your phone's contact"
                accessibilityRole="switch"
                accessibilityState={{ checked: draft.syncToPhone }}
                onPress={() => updateDraft('syncToPhone', !draft.syncToPhone)}
                style={styles.syncRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    draft.syncToPhone && styles.checkboxActive,
                  ]}
                >
                  {draft.syncToPhone && <View style={styles.checkboxDot} />}
                </View>
                <Text style={styles.syncLabel}>
                  Sync contact to your phone's contact
                </Text>
              </Pressable>
            </ScrollView>

            <Pressable
              accessibilityLabel="Save"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave, busy: saving }}
              disabled={!canSave}
              onPress={saveContact}
              style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text
                  style={[
                    styles.saveLabel,
                    !canSave && styles.saveLabelDisabled,
                  ]}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        ) : mode === 'createGroup' ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.groupScreen}
          >
            <ScrollView
              contentContainerStyle={styles.createGroupContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pressable
                accessibilityLabel="Add group picture"
                accessibilityRole="button"
                onPress={chooseGroupPhoto}
                style={styles.groupPhotoButton}
              >
                {groupPhoto ? (
                  <Image
                    source={{ uri: groupPhoto.uri }}
                    style={styles.groupPhoto}
                  />
                ) : (
                  <TinyPlusIcon color="#738096" />
                )}
              </Pressable>
              <Text allowFontScaling={false} style={styles.groupFieldLabel}>
                Group Name
              </Text>
              {groupNameError ? (
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  style={styles.groupNameError}
                >
                  {groupNameError}
                </Text>
              ) : null}
              <TextInput
                accessibilityLabel="Group Name"
                allowFontScaling={false}
                maxLength={100}
                onChangeText={value => {
                  setGroupName(value);
                  if (groupNameError) setGroupNameError('');
                }}
                placeholder="Enter group name"
                placeholderTextColor="#8792A4"
                style={[
                  styles.groupFieldInput,
                  groupNameError ? styles.groupFieldInputError : null,
                ]}
                value={groupName}
              />
              <Text allowFontScaling={false} style={styles.groupFieldLabel}>
                Description
              </Text>
              <View style={styles.descriptionWrap}>
                <TextInput
                  accessibilityLabel="Group Description"
                  allowFontScaling={false}
                  maxLength={256}
                  multiline
                  onChangeText={setGroupDescription}
                  placeholder="Enter group description"
                  placeholderTextColor="#8792A4"
                  style={styles.descriptionInput}
                  textAlignVertical="top"
                  value={groupDescription}
                />
                <Text allowFontScaling={false} style={styles.descriptionCount}>
                  {groupDescription.length}/256
                </Text>
              </View>
            </ScrollView>
            <View style={styles.groupFooter}>
              <Text allowFontScaling={false} style={styles.groupHint}>
                ⓘ Add members in the next screen
              </Text>
              <Pressable
                accessibilityLabel="Add Members"
                accessibilityRole="button"
                accessibilityState={{ disabled: !groupName.trim() }}
                disabled={!groupName.trim()}
                onPress={() => setMode('groupMembers')}
                style={[
                  styles.groupPrimaryButton,
                  !groupName.trim() && styles.groupPrimaryDisabled,
                ]}
              >
                <TinyPlusIcon
                  color={groupName.trim() ? '#FFFFFF' : '#8792A4'}
                />
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.groupPrimaryText,
                    !groupName.trim() && styles.groupPrimaryTextDisabled,
                  ]}
                >
                  Add Members
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        ) : mode === 'createBroadcast' ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.groupScreen}
          >
            <ScrollView
              contentContainerStyle={styles.createGroupContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pressable
                accessibilityLabel="Add broadcast picture"
                accessibilityRole="button"
                onPress={chooseBroadcastPhoto}
                style={styles.groupPhotoButton}
              >
                {broadcastPhoto ? (
                  <Image
                    source={{ uri: broadcastPhoto.uri }}
                    style={styles.groupPhoto}
                  />
                ) : (
                  <PictureSourceIcon camera />
                )}
              </Pressable>
              <Text allowFontScaling={false} style={styles.groupFieldLabel}>
                Broadcast Name
              </Text>
              <TextInput
                accessibilityLabel="Broadcast Name"
                allowFontScaling={false}
                maxLength={100}
                onChangeText={setBroadcastName}
                placeholder="Enter group name"
                placeholderTextColor="#8792A4"
                style={styles.groupFieldInput}
                value={broadcastName}
              />
            </ScrollView>
            <View style={styles.groupFooter}>
              <Text allowFontScaling={false} style={styles.groupHint}>
                ⓘ Add members in the next screen
              </Text>
              <Pressable
                accessibilityLabel="Add Broadcast Members"
                accessibilityRole="button"
                accessibilityState={{ disabled: !broadcastName.trim() }}
                disabled={!broadcastName.trim()}
                onPress={() => setMode('broadcastMembers')}
                style={[
                  styles.groupPrimaryButton,
                  !broadcastName.trim() && styles.groupPrimaryDisabled,
                ]}
              >
                <TinyPlusIcon
                  color={broadcastName.trim() ? '#FFFFFF' : '#8792A4'}
                />
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.groupPrimaryText,
                    !broadcastName.trim() && styles.groupPrimaryTextDisabled,
                  ]}
                >
                  Add Members
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        ) : mode === 'groupMembers' || mode === 'broadcastMembers' ? (
          <View style={styles.memberScreen}>
            <View style={[styles.searchBox, styles.memberSearch]}>
              <SearchIcon />
              <TextInput
                accessibilityLabel={
                  mode === 'broadcastMembers'
                    ? 'Search broadcast contacts'
                    : 'Search group contacts'
                }
                allowFontScaling={false}
                onChangeText={setMemberSearch}
                placeholder="Search Contacts"
                placeholderTextColor="#344256"
                style={styles.searchInput}
                value={memberSearch}
              />
              <SearchContactsGridIcon />
            </View>
            {selectedContacts.length > 0 && (
              <View style={styles.selectedBlock}>
                <View style={styles.selectedHeading}>
                  <Text allowFontScaling={false} style={styles.selectedTitle}>
                    Selected Participants
                  </Text>
                  <View style={styles.selectedCount}>
                    <Text
                      allowFontScaling={false}
                      style={styles.selectedCountText}
                    >
                      {selectedContacts.length}
                    </Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {selectedContacts.map(contact => (
                    <Pressable
                      accessibilityLabel={`Remove ${contact.name}`}
                      key={contact.userId}
                      onPress={() => toggleMember(contact.userId)}
                      style={styles.selectedChip}
                    >
                      <ContactAvatar
                        compact={mode === 'broadcastMembers'}
                        contact={contact}
                      />
                      <Text
                        allowFontScaling={false}
                        numberOfLines={1}
                        style={styles.selectedChipText}
                      >
                        {contact.name}
                      </Text>
                      <View style={styles.chipRemove}>
                        <Text
                          allowFontScaling={false}
                          style={styles.chipRemoveText}
                        >
                          ×
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            <ScrollView
              contentContainerStyle={styles.memberList}
              keyboardShouldPersistTaps="handled"
            >
              {mode === 'broadcastMembers' ? (
                <>
                  <Text
                    allowFontScaling={false}
                    style={styles.memberSectionLabel}
                  >
                    Recently Contacted
                  </Text>
                  {broadcastCandidates.slice(0, 3).map(contact => {
                    const selected = selectedMemberIds.has(contact.userId);
                    return (
                      <Pressable
                        accessibilityLabel={`Select recent ${contact.name}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        key={`recent-${contact.id}`}
                        onPress={() => toggleMember(contact.userId)}
                        style={styles.memberRow}
                      >
                        <View
                          style={[
                            styles.memberCheckbox,
                            selected && styles.memberCheckboxSelected,
                          ]}
                        >
                          {selected && (
                            <Text
                              allowFontScaling={false}
                              style={styles.memberCheck}
                            >
                              ✓
                            </Text>
                          )}
                        </View>
                        <ContactAvatar contact={contact} />
                        <View style={styles.contactCopy}>
                          <Text
                            allowFontScaling={false}
                            style={styles.contactName}
                          >
                            {contact.name}
                          </Text>
                          <Text
                            allowFontScaling={false}
                            style={styles.contactStatus}
                          >
                            {contact.status}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                  <Text
                    allowFontScaling={false}
                    style={[styles.memberSectionLabel, styles.allChatsLabel]}
                  >
                    All Chats
                  </Text>
                  {broadcastCandidates.map(contact => {
                    const selected = selectedMemberIds.has(contact.userId);
                    return (
                      <Pressable
                        accessibilityLabel={`Select ${contact.name}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        key={`all-${contact.id}`}
                        onPress={() => toggleMember(contact.userId)}
                        style={styles.memberRow}
                      >
                        <View
                          style={[
                            styles.memberCheckbox,
                            selected && styles.memberCheckboxSelected,
                          ]}
                        >
                          {selected && (
                            <Text
                              allowFontScaling={false}
                              style={styles.memberCheck}
                            >
                              ✓
                            </Text>
                          )}
                        </View>
                        <ContactAvatar contact={contact} />
                        <View style={styles.contactCopy}>
                          <Text
                            allowFontScaling={false}
                            style={styles.contactName}
                          >
                            {contact.name}
                          </Text>
                          <Text
                            allowFontScaling={false}
                            style={styles.contactStatus}
                          >
                            {contact.status}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              ) : (
                <>
                  <Text
                    allowFontScaling={false}
                    style={styles.memberSectionLabel}
                  >
                    All Chats
                  </Text>
                  {groupCandidates.map(contact => {
                    const selected = selectedMemberIds.has(contact.userId);
                    return (
                      <Pressable
                        accessibilityLabel={`Select ${contact.name}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        key={contact.id}
                        onPress={() => toggleMember(contact.userId)}
                        style={styles.memberRow}
                      >
                        <View
                          style={[
                            styles.memberCheckbox,
                            selected && styles.memberCheckboxSelected,
                          ]}
                        >
                          {selected && (
                            <Text
                              allowFontScaling={false}
                              style={styles.memberCheck}
                            >
                              ✓
                            </Text>
                          )}
                        </View>
                        <ContactAvatar contact={contact} />
                        <View style={styles.contactCopy}>
                          <Text
                            allowFontScaling={false}
                            style={styles.contactName}
                          >
                            {contact.name}
                          </Text>
                          <Text
                            allowFontScaling={false}
                            style={styles.contactStatus}
                          >
                            {contact.status}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              )}
              {(mode === 'broadcastMembers'
                ? broadcastCandidates
                : groupCandidates
              ).length === 0 && (
                <Text allowFontScaling={false} style={styles.noMembers}>
                  No registered contacts found
                </Text>
              )}
            </ScrollView>
            <View style={styles.membersFooter}>
              <Text allowFontScaling={false} style={styles.minimumHint}>
                ⓘ Minimum 2 participants required.
              </Text>
              <View style={styles.memberFooterActions}>
                {mode === 'groupMembers' && (
                  <Pressable
                    accessibilityLabel="Manage Roles"
                    disabled={selectedMemberIds.size === 0}
                    onPress={() => setMode('manageRoles')}
                    style={styles.manageRolesButton}
                  >
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={styles.manageRolesText}
                    >
                      Manage Roles
                    </Text>
                  </Pressable>
                )}
                {mode === 'broadcastMembers' ? (
                  <Pressable
                    accessibilityLabel="Create Broadcast"
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: selectedMemberIds.size < 2,
                      busy: creatingBroadcast,
                    }}
                    disabled={selectedMemberIds.size < 2 || creatingBroadcast}
                    onPress={submitBroadcast}
                    style={[
                      styles.groupPrimaryButton,
                      styles.createGroupButton,
                      selectedMemberIds.size < 2 && styles.groupPrimaryDisabled,
                    ]}
                  >
                    {creatingBroadcast ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.groupPrimaryText,
                          selectedMemberIds.size < 2 &&
                            styles.groupPrimaryTextDisabled,
                        ]}
                      >
                        Create Broadcast
                      </Text>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityLabel="Create Group"
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: selectedMemberIds.size < 2,
                      busy: creatingGroup,
                    }}
                    disabled={selectedMemberIds.size < 2 || creatingGroup}
                    onPress={submitGroup}
                    style={[
                      styles.groupPrimaryButton,
                      styles.createGroupButton,
                      selectedMemberIds.size < 2 && styles.groupPrimaryDisabled,
                    ]}
                  >
                    {creatingGroup ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.groupPrimaryText,
                          selectedMemberIds.size < 2 &&
                            styles.groupPrimaryTextDisabled,
                        ]}
                      >
                        Create Group
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        ) : mode === 'manageRoles' ? (
          <View style={styles.rolesScreen}>
            <View style={[styles.searchBox, styles.memberSearch]}>
              <SearchIcon />
              <TextInput
                accessibilityLabel="Search selected participants"
                allowFontScaling={false}
                onChangeText={setRoleSearch}
                placeholder="Search Contacts"
                placeholderTextColor="#344256"
                style={styles.searchInput}
                value={roleSearch}
              />
              <SearchContactsGridIcon />
            </View>
            <View style={styles.selectedHeading}>
              <Text allowFontScaling={false} style={styles.selectedTitle}>
                Selected Participants
              </Text>
              <View style={styles.selectedCount}>
                <Text allowFontScaling={false} style={styles.selectedCountText}>
                  {selectedContacts.length}
                </Text>
              </View>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.roleList}
            >
              {filteredSelectedContacts.map(contact => {
                const role = memberRoles[contact.userId] || 'Member';
                const open = roleMenuUserId === contact.userId;
                return (
                  <View key={contact.userId}>
                    <View style={styles.roleMemberRow}>
                      <ContactAvatar contact={contact} />
                      <View style={styles.roleMemberCopy}>
                        <Text
                          allowFontScaling={false}
                          style={styles.contactName}
                        >
                          {contact.name}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          numberOfLines={1}
                          style={styles.contactStatus}
                        >
                          {contact.status}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel={`Role for ${contact.name}`}
                        onPress={() =>
                          setRoleMenuUserId(open ? '' : contact.userId)
                        }
                        style={styles.roleSelector}
                      >
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.roleSelectorText,
                            role === 'Admin' && styles.adminRole,
                            role === 'Moderator' && styles.moderatorRole,
                          ]}
                        >
                          {role}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={styles.roleChevron}
                        >
                          ⌄
                        </Text>
                      </Pressable>
                    </View>
                    {open && (
                      <View style={styles.roleMenu}>
                        {(['Admin', 'Moderator', 'Member'] as GroupRole[]).map(
                          option => (
                            <Pressable
                              accessibilityLabel={`Set ${contact.name} as ${option}`}
                              key={option}
                              onPress={() =>
                                setMemberRole(contact.userId, option)
                              }
                              style={styles.roleOption}
                            >
                              <Text
                                allowFontScaling={false}
                                style={styles.roleOptionText}
                              >
                                {option}
                              </Text>
                              {role === option && (
                                <Text style={styles.roleOptionCheck}>✓</Text>
                              )}
                            </Pressable>
                          ),
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.roleFooter}>
              <Pressable
                accessibilityLabel="Manage Permissions"
                onPress={() => setMode('managePermissions')}
                style={styles.permissionButton}
              >
                <Text allowFontScaling={false} style={styles.manageRolesText}>
                  Manage Permissions
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Save Changes"
                onPress={() => setMode('groupMembers')}
                style={[styles.groupPrimaryButton, styles.saveRolesButton]}
              >
                <Text allowFontScaling={false} style={styles.groupPrimaryText}>
                  Save Changes
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.permissionsScreen}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.permissionsContent}
            >
              {PERMISSION_SECTIONS.map(section => (
                <View key={section.title}>
                  <Text
                    allowFontScaling={false}
                    style={styles.permissionSection}
                  >
                    {section.title}
                  </Text>
                  {section.items.map(item => (
                    <View key={item.key} style={styles.permissionRow}>
                      <View
                        style={[
                          styles.permissionIcon,
                          item.key.startsWith('moderator') &&
                            styles.moderatorPermissionIcon,
                          item.key === 'adminApprovals' &&
                            styles.adminPermissionIcon,
                        ]}
                      >
                        <GroupPermissionIcon permission={item.key} size={34} />
                      </View>
                      <View style={styles.permissionCopy}>
                        <Text
                          allowFontScaling={false}
                          style={styles.permissionTitle}
                        >
                          {item.title}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={styles.permissionSubtitle}
                        >
                          {item.subtitle}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel={`${item.title} permission`}
                        accessibilityRole="switch"
                         accessibilityState={{ checked: permissions[item.key] }}
                        onPress={() => togglePermission(item.key)}
                        style={[
                          styles.permissionToggle,
                          permissions[item.key] && styles.permissionToggleOn,
                        ]}
                      >
                        <View
                          style={[
                            styles.permissionKnob,
                            permissions[item.key] && styles.permissionKnobOn,
                          ]}
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
            <View style={styles.permissionsFooter}>
              <Pressable
                accessibilityLabel="Save Permissions"
                onPress={() => setMode('manageRoles')}
                style={styles.groupPrimaryButton}
              >
                <Text allowFontScaling={false} style={styles.groupPrimaryText}>
                  Save Changes
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {mode === 'list' && (
        <BottomNavigation
          onChats={onOpenChats}
          onContacts={openContactsTab}
          onCalls={onOpenCalls}
          onSettings={onOpenSettings}
        />
      )}
      {inviteContact !== null && (
        <InviteBottomSheet
          contact={inviteContact}
          invitationMessage={invitationMessage}
          onChangeMessage={setInvitationMessage}
          onClose={closeInvite}
          onSend={sendInviteBySms}
        />
      )}
      <GroupPictureSheet
        visible={pictureTarget !== null}
        bottomInset={insets.bottom}
        title={
          pictureTarget === 'broadcast' ? 'Broadcast Picture' : 'Group Picture'
        }
        onCamera={() => pickPicture('camera')}
        onGallery={() => pickPicture('gallery')}
        onClose={() => setPictureTarget(null)}
      />
      <BroadcastPhotoEditor
        asset={broadcastPhotoCandidate}
        onCancel={() => setBroadcastPhotoCandidate(null)}
        onUse={photo => {
          setBroadcastPhoto(photo);
          setBroadcastPhotoCandidate(null);
          setMessage('Broadcast picture ready.');
        }}
      />
      <Modal
        animationType="slide"
        navigationBarTranslucent
        statusBarTranslucent
        transparent
        visible={permissionPrompt !== null}
        onRequestClose={
          permissionPrompt === 'request'
            ? deferContactAccess
            : dismissContactPrompt
        }
      >
        <View style={styles.contactPermissionOverlay}>
          <View
            style={[
              styles.contactPermissionSheet,
              { paddingBottom: Math.max(insets.bottom, 18) },
            ]}
          >
            <View style={styles.permissionHandle} />
            <View style={styles.permissionIconTile}>
              <ContactPermissionIcon />
            </View>
            <Text style={styles.contactPermissionTitle}>
              {permissionPrompt === 'request'
                ? 'Connect with People'
                : 'Couldn’t Access Contacts'}
            </Text>
            <Text style={styles.permissionDescription}>
              {permissionPrompt === 'request'
                ? 'Find friends already using Chatterly\nby allowing access to your contacts.'
                : 'Contact access is disabled. Enable it in\nsettings to find friends using Chatterly.'}
            </Text>
            <View style={styles.privacyCard}>
              <View style={styles.privacyIcon}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M12 3 19 6v5c0 4.5-3 7.7-7 10-4-2.3-7-5.5-7-10V6l7-3Z"
                    stroke={themeInk('#7442E8')}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                  <Path
                    d="M9.5 12 11 13.5l3.5-3.5"
                    stroke={themeInk('#7442E8')}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
              <View style={styles.privacyCopy}>
                <Text style={styles.privacyTitle}>
                  Your Privacy is important
                </Text>
                <Text style={styles.privacyDescription}>
                  We’ll never share your contacts with anyone. Learn more in our{' '}
                  <Text style={styles.privacyLink}>Privacy Policy</Text>.
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                permissionPrompt === 'request'
                  ? 'Allow Access'
                  : 'Open Settings'
              }
              onPress={
                permissionPrompt === 'request'
                  ? allowContactAccess
                  : openContactSettings
              }
              style={styles.permissionPrimaryButton}
            >
              <Text style={styles.permissionPrimaryText}>
                {permissionPrompt === 'request'
                  ? 'Allow Access'
                  : 'Open Settings'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                permissionPrompt === 'request' ? 'Not Now' : 'Maybe Later'
              }
              onPress={
                permissionPrompt === 'request'
                  ? deferContactAccess
                  : dismissContactPrompt
              }
              style={styles.permissionSecondaryButton}
            >
              <Text style={styles.permissionSecondaryText}>
                {permissionPrompt === 'request' ? 'Not Now' : 'Maybe Later'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Snackbar message={message} onHide={() => setMessage('')} />
    </View>
  );
}

const styles = createThemedStyles({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  contactPermissionOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  contactPermissionSheet: {
    paddingHorizontal: 14,
    paddingTop: 8,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'stretch',
  },
  permissionHandle: {
    width: 32,
    height: 3,
    marginBottom: 14,
    borderRadius: 2,
    backgroundColor: '#DCE2EA',
    alignSelf: 'center',
  },
  permissionIconTile: {
    width: 48,
    height: 48,
    borderRadius: 7,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  contactPermissionTitle: {
    marginTop: 17,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  permissionDescription: {
    marginTop: 7,
    color: '#667085',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  privacyCard: {
    minHeight: 57,
    marginTop: 22,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#EEF0F4',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  privacyIcon: {
    width: 27,
    height: 27,
    marginRight: 8,
    borderRadius: 7,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyCopy: { flex: 1 },
  privacyTitle: {
    color: '#344054',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '600',
  },
  privacyDescription: {
    marginTop: 3,
    color: '#7B8798',
    fontFamily: FONT_FAMILY,
    fontSize: 8,
    lineHeight: 11,
  },
  privacyLink: { color: '#7137DD', textDecorationLine: 'underline' },
  permissionPrimaryButton: {
    height: 43,
    marginTop: 20,
    borderRadius: 5,
    backgroundColor: '#8757F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionPrimaryText: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '500',
  },
  permissionSecondaryButton: {
    height: 41,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E7EAF0',
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionSecondaryText: {
    color: '#344054',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '500',
  },
  page: { flex: 1, paddingHorizontal: 12 },
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  contactBackButton: { width: 32, height: 44, justifyContent: 'center' },
  title: {
    color: '#0D1422',
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: '700',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconButton: {
    width: 24,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    height: 37,
    marginTop: 18,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#E9EDF4',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 9,
    paddingVertical: 0,
    color: '#152033',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  contactActions: { paddingTop: 10, paddingBottom: 2 },
  contactAction: { height: 52, flexDirection: 'row', alignItems: 'center' },
  contactActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: '#FAFAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactActionLabel: {
    marginLeft: 10,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '500',
  },
  loadingContent: { flex: 1 },
  refreshBanner: {
    height: 31,
    marginTop: 11,
    borderWidth: 1,
    borderColor: '#EDEFF3',
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  refreshBannerText: {
    color: '#344256',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
  },
  skeletonTopRow: {
    height: 12,
    marginTop: 17,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  skeletonShort: {
    width: 34,
    height: 7,
    borderRadius: 5,
    backgroundColor: '#DCE3EC',
  },
  skeletonTiny: {
    width: 35,
    height: 7,
    borderRadius: 5,
    backgroundColor: '#DCE3EC',
  },
  skeletonRow: { height: 50, flexDirection: 'row', alignItems: 'center' },
  skeletonRowGap: { marginTop: 36 },
  skeletonAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E6ECF4',
  },
  skeletonCopy: { flex: 1, marginLeft: 10 },
  skeletonLine: {
    width: '61%',
    height: 7,
    borderRadius: 5,
    backgroundColor: '#E6ECF4',
  },
  skeletonLineBottom: {
    width: '61%',
    height: 7,
    marginTop: 8,
    borderRadius: 5,
    backgroundColor: '#E6ECF4',
  },
  skeletonLineSmall: { width: '20%' },
  skeletonBottomSmall: { width: '18%' },
  floatingRefreshPill: {
    position: 'absolute',
    right: 6,
    bottom: 18,
    width: 56,
    height: 24,
    borderWidth: 1,
    borderColor: '#DCE3EC',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  floatingRefreshBar: {
    width: 23,
    height: 6,
    borderRadius: 4,
    backgroundColor: '#E6ECF4',
  },
  searchEmptyState: { flex: 1, paddingTop: 32, alignItems: 'center' },
  emptyState: { flex: 1, paddingTop: 91, alignItems: 'center' },
  emptyTitle: {
    marginTop: 14,
    color: '#0D1422',
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyCopy: {
    marginTop: 8,
    color: '#66758C',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    height: 38,
    marginTop: 20,
    borderRadius: 4,
    backgroundColor: '#8750F4',
    shadowColor: '#6C2EEB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.23,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '500',
  },
  secondaryButton: {
    width: '100%',
    height: 37,
    marginTop: 11,
    borderWidth: 1,
    borderColor: '#E1E6ED',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '500',
  },
  contactList: { flex: 1 },
  contactListContent: { paddingTop: 13, paddingRight: 18, paddingBottom: 28 },
  emptyContactScroll: { flex: 1 },
  emptyContactViewport: { flexGrow: 1 },
  contactListViewport: { flex: 1 },
  contactScrollTrack: {position: 'absolute', top: 0, bottom: 0, right: 16, width: 2, borderRadius: 1, backgroundColor: '#E7ECF3'},
  contactScrollThumb: {width: 2, borderRadius: 1, backgroundColor: '#641CFF'},
  alphabetIndex: {
    position: 'absolute',
    top: 4,
    right: 0,
    bottom: 4,
    width: 18,
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  alphabetIndexLetter: {
    includeFontPadding: false,
    color: '#641CFF',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 11,
  },
  alphabetIndexLetterDisabled: {color: '#C7CED8'},
  sectionLabel: {
    marginTop: 14,
    marginBottom: 7,
    color: '#61708A',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  contactRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center' },
  contactRowPressed: { opacity: 0.65 },
  avatar: { width: 38, height: 38, borderRadius: 6 },
  avatarFallback: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#8792A4', fontFamily: FONT_FAMILY, fontSize: 12 },
  registeredBadge: { position: 'absolute', right: -2, bottom: -2 },
  compactAvatar: { width: 26, height: 26, borderRadius: 13 },
  compactAvatarInitial: { fontSize: 8 },
  compactRegisteredBadge: {
    right: -1,
    bottom: -1,
    transform: [{ scale: 0.72 }],
  },
  contactCopy: { flex: 1, marginLeft: 10, paddingRight: 8 },
  contactName: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
  },
  contactStatus: {
    marginTop: 4,
    color: '#526176',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  inviteButton: {
    height: 25,
    paddingHorizontal: 9,
    borderRadius: 4,
    backgroundColor: '#F0E6FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inviteLabel: {
    color: '#641CFF',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '500',
  },
  bottomNav: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 91,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EBEEF3',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-around',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 7,
    elevation: 5,
  },
  tabItem: { width: 64, alignItems: 'center' },
  tabIconWrap: {
    width: 54,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: { backgroundColor: '#F0E6FF' },
  tabLabel: {
    marginTop: 3,
    color: '#526176',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  tabLabelActive: { color: '#641CFF' },
  formKeyboard: { flex: 1 },
  form: { paddingTop: 14, paddingBottom: 26 },
  fieldLabel: {
    marginTop: 15,
    marginBottom: 8,
    color: '#0D1422',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '500',
  },
  requiredMark: { color: '#DC2626' },
  fieldInput: {
    height: 38,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: '#E1E6ED',
    borderRadius: 5,
    color: '#152033',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  countryField: {
    height: 38,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E1E6ED',
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countryValue: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  countryText: { color: '#344256', fontFamily: FONT_FAMILY, fontSize: 11 },
  countryOption: {
    height: 36,
    marginTop: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E1E6ED',
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  flag: {
    width: 14,
    height: 10,
    borderWidth: 0.4,
    borderColor: '#D4DAE4',
    borderRadius: 1,
    overflow: 'hidden',
  },
  flagStripe: { height: 3.2 },
  flagSaffron: { backgroundColor: '#F28C28' },
  flagWhite: { backgroundColor: '#FFFFFF' },
  flagGreen: { backgroundColor: '#1FA463' },
  iconField: {
    height: 38,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#E1E6ED',
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconInput: {
    flex: 1,
    height: '100%',
    marginLeft: 9,
    paddingVertical: 0,
    color: '#152033',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  validationText: {
    marginTop: 6,
    color: '#C0392B',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
  },
  syncRow: { marginTop: 69, flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 34,
    height: 18,
    borderWidth: 1,
    borderColor: '#DDE4EE',
    borderRadius: 2,
    backgroundColor: '#E7ECF3',
    justifyContent: 'center',
  },
  checkboxActive: { borderColor: '#8750F4', backgroundColor: '#8750F4' },
  checkboxDot: {
    width: 15,
    height: 15,
    marginLeft: 17,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  syncLabel: {
    marginLeft: 8,
    color: '#0D1422',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  saveButton: {
    height: 38,
    borderRadius: 4,
    backgroundColor: '#8750F4',
    shadowColor: '#6C2EEB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#DFE5EE',
    shadowOpacity: 0,
    elevation: 0,
  },
  saveLabel: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '500',
  },
  saveLabelDisabled: { color: '#66758C' },
  groupHeader: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createGroupHeader: { paddingHorizontal: 8 },
  groupHeaderTitle: {
    color: '#0D1422',
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '700',
  },
  groupScreen: { flex: 1 },
  createGroupContent: { paddingHorizontal: 8 },
  groupPhotoButton: {
    width: 68,
    height: 68,
    marginTop: 28,
    marginBottom: 6,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#DDE3EB',
    borderRadius: 9,
    backgroundColor: '#F7F8FA',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  groupPhoto: { width: '100%', height: '100%' },
  groupFieldLabel: {
    marginTop: 13,
    marginBottom: 7,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '500',
  },
  groupFieldInput: {
    height: 38,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#DDE3EB',
    borderRadius: 5,
    color: '#152033',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  groupFieldInputError: { borderColor: '#DC2626' },
  groupNameError: {
    marginTop: -2,
    marginBottom: 6,
    color: '#DC2626',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    lineHeight: 14,
  },
  descriptionWrap: {
    height: 84,
    borderWidth: 1,
    borderColor: '#DDE3EB',
    borderRadius: 5,
  },
  descriptionInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
    color: '#152033',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  descriptionCount: {
    position: 'absolute',
    right: 0,
    bottom: -18,
    color: '#526176',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
  },
  groupFooter: {
    marginHorizontal: -12,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EDF0F4',
  },
  groupHint: {
    marginBottom: 13,
    textAlign: 'center',
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
  },
  groupPrimaryButton: {
    height: 38,
    borderRadius: 5,
    backgroundColor: '#8750F4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  groupPrimaryDisabled: { backgroundColor: '#E1E7F0' },
  groupPrimaryText: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '500',
  },
  groupPrimaryTextDisabled: { color: '#718096' },
  memberScreen: { flex: 1 },
  memberSearch: { marginTop: 14 },
  memberList: { paddingTop: 13, paddingBottom: 15 },
  memberSectionLabel: {
    marginBottom: 10,
    color: '#61708A',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
  },
  allChatsLabel: { marginTop: 16 },
  memberRow: { height: 58, flexDirection: 'row', alignItems: 'center' },
  memberCheckbox: {
    width: 18,
    height: 18,
    marginRight: 10,
    borderWidth: 1.2,
    borderColor: '#6E86A8',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCheckboxSelected: {
    borderColor: '#7B2AE8',
    backgroundColor: '#7B2AE8',
  },
  memberCheck: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  noMembers: {
    marginTop: 50,
    color: '#66758C',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    textAlign: 'center',
  },
  selectedBlock: { marginTop: 14 },
  selectedHeading: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  selectedTitle: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '500',
  },
  selectedCount: {
    minWidth: 23,
    height: 17,
    paddingHorizontal: 7,
    borderRadius: 9,
    backgroundColor: '#F0E6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCountText: {
    color: '#7B2AE8',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '600',
  },
  selectedChip: {
    height: 34,
    marginRight: 8,
    paddingRight: 6,
    borderWidth: 1,
    borderColor: '#DCEAF4',
    borderRadius: 18,
    backgroundColor: '#F4F9FF',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  selectedChipText: {
    maxWidth: 82,
    marginHorizontal: 5,
    color: '#2454A6',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
  },
  chipRemove: {
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#B8C9E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRemoveText: {
    marginTop: -1,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 16,
  },
  membersFooter: {
    marginHorizontal: -12,
    paddingHorizontal: 5,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EDF0F4',
    backgroundColor: '#FFFFFF',
  },
  minimumHint: {
    marginBottom: 11,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    textAlign: 'center',
  },
  memberFooterActions: { flexDirection: 'row', gap: 8 },
  manageRolesButton: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: '#E1E6ED',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageRolesText: { color: '#111827', fontFamily: FONT_FAMILY, fontSize: 11 },
  createGroupButton: { flex: 2 },
  rolesScreen: { flex: 1 },
  roleList: { flex: 1, marginTop: 5 },
  roleMemberRow: { height: 60, flexDirection: 'row', alignItems: 'center' },
  roleMemberCopy: { flex: 1, marginLeft: 9, paddingRight: 6 },
  roleSelector: {
    minWidth: 80,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  roleSelectorText: { color: '#111827', fontFamily: FONT_FAMILY, fontSize: 11 },
  adminRole: { color: '#4F46E5' },
  moderatorRole: { color: '#078768' },
  roleChevron: { color: '#526176', fontSize: 14 },
  roleMenu: {
    marginLeft: 48,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: '#E5E9F0',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    elevation: 3,
  },
  roleOption: {
    height: 36,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleOptionText: { color: '#111827', fontFamily: FONT_FAMILY, fontSize: 11 },
  roleOptionCheck: { color: '#7B2AE8', fontSize: 12 },
  roleFooter: {
    marginHorizontal: -12,
    paddingHorizontal: 5,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: '#EDF0F4',
    flexDirection: 'row',
    gap: 8,
  },
  permissionButton: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: '#E1E6ED',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveRolesButton: { flex: 1 },
  permissionsScreen: { flex: 1, marginHorizontal: -4 },
  permissionsContent: { paddingTop: 6, paddingBottom: 18 },
  permissionSection: {
    marginTop: 12,
    marginBottom: 7,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '600',
  },
  permissionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  permissionIcon: {
    width: 34,
    height: 34,
    marginRight: 9,
    borderRadius: 17,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moderatorPermissionIcon: { backgroundColor: '#E9FAF3' },
  adminPermissionIcon: { backgroundColor: '#EEF5FF' },
  permissionCopy: { flex: 1, paddingRight: 8 },
  permissionTitle: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '500',
  },
  permissionSubtitle: {
    marginTop: 2,
    color: '#718096',
    fontFamily: FONT_FAMILY,
    fontSize: 8,
    lineHeight: 11,
  },
  permissionToggle: {
    width: 31,
    height: 17,
    padding: 2,
    borderRadius: 3,
    backgroundColor: '#D9E0EA',
    justifyContent: 'center',
  },
  permissionToggleOn: { backgroundColor: '#8750F4' },
  permissionKnob: {
    width: 13,
    height: 13,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  permissionKnobOn: { alignSelf: 'flex-end' },
  permissionsFooter: {
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EDF0F4',
    backgroundColor: '#FFFFFF',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  pictureSheet: {
    paddingHorizontal: 20,
    paddingTop: 8,
    overflow: 'hidden',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 24,
  },
  pictureSheetSurface: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#FFFFFF',
  },
  pictureSheetContent: { zIndex: 1 },
  sheetHandle: {
    width: 36,
    height: 3,
    marginBottom: 12,
    alignSelf: 'center',
    borderRadius: 2,
    backgroundColor: '#E5EAF1',
  },
  sheetHeader: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
  },
  pictureChoices: { marginTop: 10, flexDirection: 'row', gap: 10 },
  pictureChoice: {
    flex: 1,
    height: 67,
    borderWidth: 1,
    borderColor: '#E8EBF0',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pictureChoiceText: {
    marginTop: 6,
    color: '#111827',
    fontFamily: FONT_FAMILY,
    fontSize: 9,
  },
});
