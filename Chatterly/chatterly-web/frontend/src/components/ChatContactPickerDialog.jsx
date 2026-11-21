import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import defaultProfilePic from '../assets/image.png';
import { getUserProfileView } from '../api/chat';
import { getRegisteredUserById } from '../api/contactapi';

const getContactDisplayName = (contact = {}) =>
  String(contact?.name || contact?.fullName || contact?.phone || 'Unknown contact').trim();

const getContactPhone = (contact = {}) =>
  String(
    contact?.phone ||
      contact?.mobile ||
      contact?.phoneNumber ||
      contact?.contactNumber ||
      contact?.mobileNumber ||
      contact?.user?.phone ||
      contact?.user?.mobile ||
      contact?.profile?.phone ||
      contact?.profile?.mobile ||
      ''
  ).trim();

const getContactEmail = (contact = {}) =>
  String(contact?.email || contact?.mail || contact?.user?.email || contact?.profile?.email || '').trim();

const getContactBio = (contact = {}) =>
  String(contact?.status || contact?.bio || contact?.about || contact?.description || '').trim();

// The backend's `status` doubles as presence ("online"/"offline"), which is not
// a bio - a list row shows only a real one, and nothing when there is none.
const PRESENCE_ONLY_STATUS_TEXTS = new Set(['online', 'offline', 'unavailable']);
const getContactRowBio = (contact = {}) => {
  const bio = getContactBio(contact);
  return PRESENCE_ONLY_STATUS_TEXTS.has(bio.toLowerCase()) ? '' : bio;
};

const getContactShareKey = (contact = {}) =>
  String(contact?._id || contact?.userId || contact?.id || contact?.phone || contact?.chatId || '').trim();

const getContactUserId = (contact = {}) => {
  const chatId = String(contact?.chatId || '').trim();
  const candidateIds = [
    contact?.userId,
    contact?.receiverId,
    contact?.contactId,
    contact?.participantId,
    contact?.user?._id,
    contact?.user?.id,
    contact?.profile?._id,
    contact?.profile?.id,
    contact?.id,
    contact?._id,
  ];

  return String(candidateIds.find((candidateId) => candidateId && String(candidateId) !== chatId) || '').trim();
};

const getContactAvatarSource = (contact = {}) =>
  String(
    contact?.profilePic ||
      contact?.profilePicture ||
      contact?.photo ||
      contact?.photoURL ||
      contact?.avatar ||
      contact?.avatarUrl ||
      contact?.image ||
      ''
  ).trim();

const isGroupContact = (contact = {}) =>
  Boolean(contact?.isGroup || contact?.type === 'group' || contact?.chatType === 'group');

const getGroupMemberCount = (contact = {}) => {
  const candidateCounts = [
    contact?.memberCount,
    contact?.membersCount,
    contact?.participantCount,
    Array.isArray(contact?.participants) ? contact.participants.length : 0,
    Array.isArray(contact?.members) ? contact.members.length : 0,
  ];

  const resolvedCount = candidateCounts.find((value) => Number(value) > 0);
  return Number(resolvedCount) > 0 ? Number(resolvedCount) : 0;
};

const resolveContactSubtitle = (contact = {}) => {
  if (!isGroupContact(contact)) {
    return '';
  }

  const memberCount = getGroupMemberCount(contact);
  if (!memberCount) {
    return '';
  }

  return `${memberCount} ${memberCount === 1 ? 'Member' : 'Members'}`;
};

const normalizePresenceValue = (value) => {
  if (value && typeof value === 'object') {
    return normalizePresenceValue(
      value.kind ??
        value.status ??
        value.presence ??
        value.userStatus ??
        value.isOnline ??
        value.online
    );
  }

  if (typeof value === 'boolean') {
    return value ? 'online' : 'offline';
  }

  if (typeof value === 'number') {
    return value > 0 ? 'online' : 'offline';
  }

  const normalizedValue = String(value || '').trim().toLowerCase();
  if (['online', 'active', 'available', 'connected', 'true', '1'].includes(normalizedValue)) {
    return 'online';
  }

  if (['offline', 'inactive', 'away', 'disconnected', 'false', '0'].includes(normalizedValue)) {
    return 'offline';
  }

  return '';
};

const getPresenceKind = (contact = {}) => {
  const candidates = [contact?.presence, contact?.userStatus, contact?.isOnline, contact?.online];

  for (const candidate of candidates) {
    const normalizedPresence = normalizePresenceValue(candidate);
    if (normalizedPresence) {
      return normalizedPresence;
    }
  }

  return '';
};

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="6.75" stroke="currentColor" strokeWidth="1.9" />
    <path d="m16 16 4.15 4.15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M18 6 6 18" strokeLinecap="round" />
    <path d="m6 6 12 12" strokeLinecap="round" />
  </svg>
);

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <path d="M15 18 9 12l6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

const ForwardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      fill="currentColor"
      d="M13.22 6.22a.75.75 0 0 1 1.06 0l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06l3.97-3.97h-6.44a4.5 4.5 0 0 0-4.5 4.5v.25a.75.75 0 0 1-1.5 0v-.25a6 6 0 0 1 6-6h6.44l-3.97-3.97a.75.75 0 0 1 0-1.06Z"
    />
  </svg>
);

const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 11v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path
      d="M2.35 6.15 4.75 8.55 9.65 3.65"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PresenceBadge = ({ kind = 'offline', className = '' }) => (
  <span
    className={`absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white shadow-sm ${className} ${
      kind === 'online' ? 'bg-[#10B981] text-white' : 'bg-[#94A3B8] text-white'
    }`}
    aria-hidden="true"
  >
    {kind === 'online' ? (
      <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
        <path d="M1.25 4.1 3.1 5.95 6.75 2.25" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) : (
      <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
        <path d="M2.1 2.1 5.9 5.9" stroke="white" strokeWidth="1.35" strokeLinecap="round" />
        <path d="M5.9 2.1 2.1 5.9" stroke="white" strokeWidth="1.35" strokeLinecap="round" />
      </svg>
    )}
  </span>
);

const SelectionIndicator = ({ isSelected = false }) => (
  <span
    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border transition-all ${
      isSelected
        ? 'border-[#8B5CF6] bg-[#8B5CF6] text-white shadow-[0_6px_14px_rgba(139,92,246,0.28)]'
        : 'border-[#7C90B0] bg-white text-transparent'
    }`}
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
);

const PermissionIcon = ({ type }) => {
  const sharedProps = {
    width: '18',
    height: '18',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.7',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  };

  switch (type) {
    case 'media':
      return (
        <svg {...sharedProps}>
          <rect x="5" y="5" width="14" height="14" rx="3" />
          <circle cx="9" cy="9" r="1.4" />
          <path d="m7.5 17 4.2-4.2 2.1 2.1 1.3-1.3L18 16.5" />
        </svg>
      );
    case 'link':
      return (
        <svg {...sharedProps}>
          <path d="M10.5 13.5 13.5 10.5" />
          <path d="M8.8 11.3 7.7 12.4a3 3 0 0 0 4.2 4.2l1.1-1.1" />
          <path d="M15.2 12.7 16.3 11.6a3 3 0 0 0-4.2-4.2L11 8.5" />
        </svg>
      );
    case 'bell':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12.9236 4.50633V3.86076C12.9236 3.63247 12.8263 3.41353 12.6532 3.25211C12.48 3.09069 12.2452 3 12.0003 3C11.7554 3 11.5206 3.09069 11.3474 3.25211C11.1743 3.41353 11.077 3.63247 11.077 3.86076V4.50633M12.9236 4.50633H13.4379C14.4278 4.50628 15.3806 4.85799 16.1021 5.48983C16.8236 6.12168 17.2596 6.98614 17.3214 7.90719L17.5255 10.9483C17.6043 12.1079 18.022 13.2253 18.7332 14.1795C18.8801 14.3767 18.9698 14.6059 18.9936 14.845C19.0174 15.084 18.9745 15.3247 18.869 15.5437C18.7635 15.7627 18.5991 15.9526 18.3917 16.0948C18.1842 16.2371 17.9409 16.3269 17.6852 16.3555L14.5394 16.7076M12.9236 4.50633H11.077M14.5394 16.7076V17.6329C14.5394 18.2607 14.2719 18.8628 13.7957 19.3067C13.3196 19.7506 12.6737 20 12.0003 20C11.3269 20 10.681 19.7506 10.2049 19.3067C9.72868 18.8628 9.46116 18.2607 9.46116 17.6329V16.7076M14.5394 16.7076H9.46116M9.46116 16.7076L6.31541 16.3564C6.05958 16.3278 5.81605 16.238 5.60848 16.0957C5.40092 15.9534 5.23638 15.7635 5.13089 15.5443C5.02539 15.3252 4.98252 15.0843 5.00645 14.8452C5.03038 14.606 5.12029 14.3767 5.26744 14.1795C5.97862 13.2253 6.39626 12.1079 6.47514 10.9483L6.67919 7.90633C6.7412 6.98543 7.17734 6.12118 7.89883 5.48952C8.62032 4.85786 9.57291 4.50627 10.5627 4.50633H11.077" stroke="#065F46" strokeWidth="1.2" />
        </svg>
      );
    case 'pin':
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M0.600098 16.6016L5.04453 12.1571M9.71918 14.7091C6.39119 13.9536 3.24809 10.8105 2.49254 7.48248C2.37254 6.95626 2.31298 6.69314 2.48631 6.26559C2.65876 5.83892 2.8712 5.70559 3.29431 5.44159C4.25075 4.84426 5.2872 4.65404 6.36186 4.74826C7.8703 4.88248 8.62496 4.94915 9.00185 4.75271C9.37785 4.55715 9.63296 4.09849 10.145 3.18204L10.7921 2.02027C11.2187 1.25583 11.4321 0.872716 11.9343 0.692272C12.4365 0.511829 12.7387 0.621161 13.3432 0.839828C14.0378 1.08926 14.6686 1.48925 15.1905 2.01113C15.7124 2.53301 16.1124 3.16386 16.3618 3.85849C16.5805 4.46293 16.6898 4.76515 16.5094 5.26737C16.3289 5.7687 15.9467 5.98204 15.1814 6.40959L13.9929 7.07181C13.0774 7.58203 12.6205 7.83803 12.4241 8.21758C12.2285 8.59803 12.2996 9.3358 12.4418 10.8114C12.5467 11.8958 12.3663 12.9393 11.761 13.9082C11.4961 14.3313 11.3636 14.5429 10.9361 14.7162C10.5094 14.8887 10.2463 14.8291 9.71918 14.7091Z" stroke="#065F46" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'edit':
      return (
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12.6133 0.600586C13.3036 0.580377 13.9782 0.791028 14.5312 1.19531L14.7598 1.38086L14.7666 1.38672L14.7725 1.39258L14.8799 1.49316L14.8916 1.50488L14.9043 1.5166L15.0049 1.62402L15.0117 1.63086L15.0176 1.6377C15.5417 2.2279 15.8212 2.9962 15.7979 3.78516C15.7775 4.47561 15.5271 5.13663 15.0908 5.66504L14.8926 5.88281C14.3992 6.37571 13.6572 6.4685 13.0703 6.16113C13.3682 6.75978 13.2694 7.50591 12.7705 8.00488L6.54785 14.2285C6.28076 14.4955 5.94839 14.6879 5.58398 14.7871L2.01758 15.7598C1.82666 15.8116 1.62473 15.8127 1.43359 15.7617C1.24252 15.7108 1.06847 15.6096 0.928711 15.4697C0.78894 15.3298 0.688432 15.155 0.637695 14.9639C0.587074 14.7728 0.587687 14.5716 0.639648 14.3809L1.61133 10.8135C1.71071 10.4493 1.90394 10.1174 2.1709 9.85059L8.39258 3.62793C8.89113 3.12932 9.63686 3.02911 10.2354 3.32617C9.929 2.73942 10.0228 1.99771 10.5156 1.50488L10.7334 1.30664C11.2618 0.87071 11.923 0.620839 12.6133 0.600586Z" stroke="#065F46" strokeWidth="1.2" />
        </svg>
      );
    case 'report':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M5.77582 20H19.998M3.99805 7.78947L5.33138 8.21053M7.99805 4L8.44249 5.26316M6.66471 6.52632L5.33138 5.26316M18.2205 17.0545H7.55385V11.1598C7.55385 8.36946 9.94185 6.10714 12.8872 6.10714C15.8325 6.10714 18.2205 8.36946 18.2205 11.1598V17.0545Z" stroke="#065F46" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'approve':
      return (
        <svg {...sharedProps}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'plus':
      return <PlusIcon />;
    default:
      return (
        <svg {...sharedProps}>
          <rect x="5" y="5" width="14" height="14" rx="3" />
          <path d="M8.5 9.5h7" />
          <path d="M8.5 13h5" />
        </svg>
      );
  }
};

const DEFAULT_GROUP_PERMISSION_SETTINGS = Object.freeze({
  memberSendMessages: true,
  memberShareMedia: true,
  memberInviteViaLink: true,
  memberAddMembers: true,
  moderatorAddMembers: true,
  moderatorAssignRoles: true,
  moderatorPinMessages: true,
  moderatorEditGroupInfo: true,
  moderatorManageReports: true,
  adminApproveJoinRequests: true,
});

const GROUP_PERMISSION_SECTIONS = Object.freeze([
  {
    title: 'Members can',
    tone: 'member',
    items: [
      {
        key: 'memberSendMessages',
        icon: 'message',
        title: 'Send Messages',
        description: 'Participate in group conversations.',
      },
      {
        key: 'memberShareMedia',
        icon: 'media',
        title: 'Share Media & Files',
        description: 'Send photos, videos, and documents.',
      },
      {
        key: 'memberInviteViaLink',
        icon: 'link',
        title: 'Invite via Link',
        description: "Invite new people using the group's invite link.",
      },
      {
        key: 'memberAddMembers',
        icon: 'plus',
        title: 'Add Members',
        description: 'Add contacts directly to the group.',
      },
    ],
  },
  {
    title: 'Moderators can',
    tone: 'moderator',
    items: [
      {
        key: 'moderatorAddMembers',
        icon: 'plus',
        title: 'Add Members',
        description: 'Add new people directly to the group.',
      },
      {
        key: 'moderatorAssignRoles',
        icon: 'bell',
        title: 'Assign Roles',
        description: 'Manage moderator access and responsibilities.',
      },
      {
        key: 'moderatorPinMessages',
        icon: 'pin',
        title: 'Pin Messages',
        description: 'Highlight important messages so everyone can find them easily.',
      },
      {
        key: 'moderatorEditGroupInfo',
        icon: 'edit',
        title: 'Edit Group Info',
        description: 'Update the group name, photo, description, and other basic details.',
      },
      {
        key: 'moderatorManageReports',
        icon: 'report',
        title: 'Manage Reports',
        description: 'Review and take action on reported messages or members.',
      },
    ],
  },
  {
    title: 'Admin can',
    tone: 'admin',
    items: [
      {
        key: 'adminApproveJoinRequests',
        icon: 'approve',
        title: 'Approve Join Requests',
        description: 'Review and approve requests from people who want to join the group.',
      },
    ],
  },
]);

const getUniqueContactsByShareKey = (contacts = []) => {
  const uniqueContacts = [];
  const seenContactKeys = new Set();

  contacts.forEach((contact) => {
    if (!contact || contact?.isBlocked) {
      return;
    }

    const contactKey = getContactShareKey(contact);
    if (!contactKey || seenContactKeys.has(contactKey)) {
      return;
    }

    seenContactKeys.add(contactKey);
    uniqueContacts.push(contact);
  });

  return uniqueContacts;
};

const buildSelectedContactsPayload = (selectedContacts = [], rolesByKey = {}, groupPermissions = {}) =>
  selectedContacts.map((contact) => {
    const displayName = getContactDisplayName(contact);
    const phone = getContactPhone(contact);
    const contactKey = getContactShareKey(contact);
    const role = rolesByKey[contactKey] || 'member';

    return {
      ...contact,
      id: contactKey,
      name: displayName,
      phone,
      role,
      memberRole: role,
      groupPermissions,
      initials: String(contact?.initials || displayName.charAt(0) || '?').slice(0, 2).toUpperCase(),
      profilePic: getContactAvatarSource(contact),
    };
  });

export default function ChatContactPickerDialog({
  isOpen,
  contacts = [],
  onClose,
  onSelect,
  title = 'Forward to',
  description = '',
  searchPlaceholder = 'Search contacts or groups',
  emptyStateText = 'No available contacts found for forwarding.',
  isBusy = false,
  submitLabel,
  selectionHintText = 'Select atleast one chat or group',
  busyLabel = 'Forwarding...',
  variant = 'side-panel',
  minSelectionCount = 1,
  enableRoleManagement = false,
  allowedRoles = ['admin', 'moderator', 'member'],
  showPresenceIndicators = true,
  embedded = false,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContactKeys, setSelectedContactKeys] = useState([]);
  const [selectedContactRoles, setSelectedContactRoles] = useState({});
  const [isRoleManagerOpen, setIsRoleManagerOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [permissionSettings, setPermissionSettings] = useState(DEFAULT_GROUP_PERMISSION_SETTINGS);
  const [contactInfoContact, setContactInfoContact] = useState(null);
  const contactInfoRequestRef = useRef(0);

  const resetPickerState = useCallback(() => {
    contactInfoRequestRef.current += 1;
    setSearchQuery('');
    setSelectedContactKeys([]);
    setSelectedContactRoles({});
    setIsRoleManagerOpen(false);
    setIsPermissionsOpen(false);
    setPermissionSettings(DEFAULT_GROUP_PERMISSION_SETTINGS);
    setContactInfoContact(null);
  }, []);

  const handleClose = useCallback(() => {
    if (isBusy) {
      return;
    }

    resetPickerState();
    onClose?.();
  }, [isBusy, onClose, resetPickerState]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        if (contactInfoContact) {
          setContactInfoContact(null);
          return;
        }
        handleClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contactInfoContact, handleClose, isOpen]);

  if (!isOpen) {
    return null;
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const selectableContacts = getUniqueContactsByShareKey(contacts);
  const selectableContactsByKey = new Map(
    selectableContacts
      .map((contact) => [getContactShareKey(contact), contact])
      .filter(([contactKey]) => Boolean(contactKey))
  );
  const shareableContacts = selectableContacts.filter((contact) => {
    const displayName = getContactDisplayName(contact).toLowerCase();
    const phone = getContactPhone(contact).toLowerCase();

    if (!normalizedQuery) {
      return Boolean(displayName || phone);
    }

    return displayName.includes(normalizedQuery) || phone.includes(normalizedQuery);
  });
  const recentContacts = normalizedQuery ? [] : shareableContacts.slice(0, 3);
  const contactDirectory = normalizedQuery ? shareableContacts : shareableContacts.slice(recentContacts.length);
  const groupDirectory = contactDirectory.filter((contact) => isGroupContact(contact));
  const individualContactDirectory = contactDirectory.filter((contact) => !isGroupContact(contact));
  const selectedContacts = selectedContactKeys
    .map((contactKey) => selectableContactsByKey.get(contactKey))
    .filter(Boolean);
  const hasSelectedContacts = selectedContacts.length > 0;
  const hasMinimumSelectedContacts = selectedContacts.length >= minSelectionCount;
  const resolvedSubmitLabel = submitLabel || `Forward (${selectedContacts.length})`;

  const toggleContactSelection = (contact) => {
    if (isBusy) {
      return;
    }

    const contactKey = getContactShareKey(contact);
    if (!contactKey) {
      return;
    }

    setSelectedContactKeys((currentSelectedContactKeys) => {
      if (currentSelectedContactKeys.includes(contactKey)) {
        setSelectedContactRoles((currentRoles) => {
          const nextRoles = { ...currentRoles };
          delete nextRoles[contactKey];
          return nextRoles;
        });
        return currentSelectedContactKeys.filter((selectedContactKey) => selectedContactKey !== contactKey);
      }

      setSelectedContactRoles((currentRoles) => ({ ...currentRoles, [contactKey]: currentRoles[contactKey] || 'member' }));
      return [...currentSelectedContactKeys, contactKey];
    });
  };

  const handleSelectSection = (sectionContacts = []) => {
    if (isBusy || !sectionContacts.length) {
      return;
    }

    setSelectedContactKeys((currentSelectedContactKeys) => {
      const nextSelectedContactKeys = new Set(currentSelectedContactKeys);

      sectionContacts.forEach((contact) => {
        const contactKey = getContactShareKey(contact);
        if (contactKey) {
          nextSelectedContactKeys.add(contactKey);
        }
      });

      return Array.from(nextSelectedContactKeys);
    });
  };

  const handleSubmit = () => {
    if (isBusy || !hasMinimumSelectedContacts) {
      return;
    }

    onSelect?.(buildSelectedContactsPayload(selectedContacts, selectedContactRoles, permissionSettings));
  };

  const removeSelectedContact = (contactKey) => {
    if (isBusy) return;
    setSelectedContactKeys((currentSelectedContactKeys) =>
      currentSelectedContactKeys.filter((selectedContactKey) => selectedContactKey !== contactKey)
    );
    setSelectedContactRoles((currentRoles) => {
      const nextRoles = { ...currentRoles };
      delete nextRoles[contactKey];
      return nextRoles;
    });
  };

  const updateSelectedContactRole = (contactKey, role) => {
    if (!allowedRoles.includes(role)) return;
    setSelectedContactRoles((currentRoles) => ({ ...currentRoles, [contactKey]: role }));
  };

  const openContactInfo = async (contact, event) => {
    event?.stopPropagation();
    if (isBusy) return;

    const requestId = contactInfoRequestRef.current + 1;
    contactInfoRequestRef.current = requestId;
    setContactInfoContact(contact);

    const userId = getContactUserId(contact);
    if (!userId) return;

    const [profileResult, registeredUserResult] = await Promise.allSettled([
      getUserProfileView(userId, { skipGlobalLoading: true, skipGlobalError: true }),
      getRegisteredUserById(userId, { skipGlobalLoading: true }),
    ]);
    if (contactInfoRequestRef.current !== requestId) return;

    const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
    const registeredUser = registeredUserResult.status === 'fulfilled' ? registeredUserResult.value : null;
    const fetchedContact = { ...(profile || {}), ...(registeredUser || {}) };
    setContactInfoContact({
      ...fetchedContact,
      ...contact,
      phone: getContactPhone(contact) || getContactPhone(fetchedContact),
      status: getContactBio(contact) || getContactBio(fetchedContact),
      profilePic: getContactAvatarSource(contact) || getContactAvatarSource(fetchedContact),
    });
  };

  const closeContactInfo = () => {
    contactInfoRequestRef.current += 1;
    setContactInfoContact(null);
  };

  const togglePermissionSetting = (permissionKey) => {
    setPermissionSettings((currentSettings) => ({
      ...currentSettings,
      [permissionKey]: !currentSettings[permissionKey],
    }));
  };

  const renderPermissionToggle = (permissionKey) => {
    const isEnabled = Boolean(permissionSettings[permissionKey]);

    return (
      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        onClick={() => togglePermissionSetting(permissionKey)}
        className="flex h-6 w-11 flex-shrink-0 items-center justify-center"
      >
        <svg width="44" height="24" viewBox="0 0 44 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="0.25" y="0.25" width="43.5" height="23.5" rx="11.75" fill={isEnabled ? '#8B5CF6' : '#CBD5E1'} />
          <rect x="0.25" y="0.25" width="43.5" height="23.5" rx="11.75" stroke="#E2E8F0" strokeWidth="0.5" />
          <rect x={isEnabled ? '22' : '2'} y="2" width="20" height="20" rx="10" fill="white" />
        </svg>
      </button>
    );
  };

  const renderPermissionsView = () => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-col gap-8">
          {GROUP_PERMISSION_SECTIONS.map((section) => (
            <section key={section.title}>
              <h4 className="mb-4 text-[11px] font-semibold text-[#0F172A]">{section.title}</h4>
              <div className="flex flex-col gap-3">
                {section.items.map((item) => {
                  const isModeratorTone = section.tone === 'moderator';
                  const iconClassName = isModeratorTone
                    ? 'bg-[#E7FAF0] text-[#059669]'
                    : 'bg-[#F1F5F9] text-[#475569]';

                  return (
                    <div key={item.key} className="flex min-h-[48px] items-center gap-3">
                      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[12px] ${iconClassName}`}>
                        <PermissionIcon type={item.icon} />
                      </span>
                      <span className="min-w-0 flex-1 pr-2">
                        <span className="block text-[12px] font-semibold leading-4 text-[#0F172A]">{item.title}</span>
                        <span className="mt-0.5 block text-[10px] leading-4 text-[#64748B]">{item.description}</span>
                      </span>
                      {renderPermissionToggle(item.key)}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-[#EEF2F7] bg-white px-3 pb-3 pt-2">
        <div className="flex items-center justify-center gap-2 text-center text-[11px] font-medium text-[#7B8AA3]">
          <InfoIcon />
          <span>{selectedContacts.length >= minSelectionCount ? selectionHintText : `Minimum ${minSelectionCount} participants required.`}</span>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasMinimumSelectedContacts || isBusy}
          className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[6px] text-[12px] font-medium transition-colors disabled:cursor-not-allowed ${
            hasMinimumSelectedContacts
              ? 'bg-[#8B5CF6] text-white shadow-[0_10px_22px_rgba(139,92,246,0.28)] hover:bg-[#7C3AED]'
              : 'bg-[#E2E8F0] text-[#64748B]'
          }`}
        >
          <PlusIcon />
          <span>{resolvedSubmitLabel}</span>
        </button>
      </div>
    </div>
  );

  const formatContactSubtitle = (contact = {}) => {
    return getContactBio(contact);
  };

  const renderAvatar = (contact, sizeClassName = 'h-10 w-10', showPresence = true) => {
    const displayName = getContactDisplayName(contact);
    const avatarSource = getContactAvatarSource(contact);
    const presenceKind = getPresenceKind(contact);

    return (
      <span className={`relative flex ${sizeClassName} flex-shrink-0 items-center justify-center rounded-full bg-[#EEF2FF]`}>
        <img
          src={avatarSource || defaultProfilePic}
          alt={displayName}
          className="h-full w-full rounded-full object-cover"
          onError={(event) => {
            event.currentTarget.src = defaultProfilePic;
          }}
        />
        {showPresence && presenceKind ? <PresenceBadge kind={presenceKind} className="-bottom-0.5 -right-0.5" /> : null}
      </span>
    );
  };

  const renderContactInfoDialog = () => {
    if (!contactInfoContact) {
      return null;
    }

    const displayName = getContactDisplayName(contactInfoContact);
    const phone = getContactPhone(contactInfoContact);
    const email = getContactEmail(contactInfoContact);
    const bio = getContactBio(contactInfoContact);
    const presence = getPresenceKind(contactInfoContact);
    const infoRows = [
      { label: 'Phone', value: phone || 'No number saved' },
      { label: 'Email', value: email || 'No email saved' },
      { label: 'Bio', value: bio },
      { label: 'Presence', value: presence ? presence.charAt(0).toUpperCase() + presence.slice(1) : 'Unavailable' },
    ];

    return (
      <div
        className="fixed inset-0 z-[270] flex items-center justify-center bg-black/35 px-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Contact information for ${displayName}`}
        onClick={closeContactInfo}
      >
        <div
          className="w-full max-w-[340px] overflow-hidden rounded-[14px] bg-white shadow-[0_22px_55px_rgba(15,23,42,0.24)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[#EEF2F7] px-4 py-3">
            <h4 className="truncate text-[14px] font-semibold text-[#0F172A]">Contact Info</h4>
            <button
              type="button"
              onClick={closeContactInfo}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]"
              aria-label="Close contact information"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="px-4 pb-4 pt-5">
            <div className="flex flex-col items-center text-center">
              {renderAvatar(contactInfoContact, 'h-16 w-16', false)}
              <p className="mt-3 max-w-full truncate text-[16px] font-semibold text-[#0F172A]">{displayName}</p>
              <p className="mt-1 max-w-full truncate text-[12px] text-[#64748B]">{phone || email || 'Contact details'}</p>
            </div>

            <div className="mt-5 overflow-hidden rounded-[10px] border border-[#EEF2F7]">
              {infoRows.map((row) => (
                <div key={row.label} className="border-b border-[#EEF2F7] px-3 py-2.5 last:border-b-0">
                  <p className="text-[10px] font-semibold uppercase text-[#94A3B8]">{row.label}</p>
                  <p className="mt-0.5 break-words text-[13px] font-medium text-[#334155]">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderGroupCreateContactRow = (contact) => {
    const displayName = getContactDisplayName(contact);
    const contactKey = getContactShareKey(contact);
    const isSelected = selectedContactKeys.includes(contactKey);

    return (
      <div
        key={contactKey}
        className={`flex w-full items-center gap-2 rounded-[10px] px-1 py-2.5 transition-colors hover:bg-[#F8FAFC] ${
          isBusy ? 'opacity-60' : ''
        }`}
      >
        <button
          type="button"
          disabled={isBusy}
          onClick={() => toggleContactSelection(contact)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
          aria-pressed={isSelected}
        >
          {renderAvatar(contact, 'h-10 w-10')}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-[#0F172A]">{displayName}</span>
            <span className="mt-0.5 block truncate text-[10px] text-[#64748B]">{formatContactSubtitle(contact)}</span>
          </span>
          <SelectionIndicator isSelected={isSelected} />
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={(event) => openContactInfo(contact, event)}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1E8FF] hover:text-[#8B5CF6] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`View contact information for ${displayName}`}
        >
          <InfoIcon />
        </button>
      </div>
    );
  };

  if (variant === 'group-create') {
    const visibleContacts = shareableContacts.filter((contact) => !selectedContactKeys.includes(getContactShareKey(contact)));
    const selectedCountLabel = selectedContacts.length > 9 ? '9+' : String(selectedContacts.length);
    const hintText = selectedContacts.length >= minSelectionCount ? selectionHintText : `Minimum ${minSelectionCount} participants required.`;

    return (
      <div
        className={embedded ? 'flex h-full min-h-0 flex-col' : 'fixed inset-0 z-[230] flex items-start justify-center bg-[rgba(0,0,0,0.38)] px-2 pt-7'}
        role={embedded ? undefined : 'dialog'}
        aria-modal={embedded ? undefined : 'true'}
        aria-label={isPermissionsOpen ? 'Manage Permissions' : isRoleManagerOpen ? 'Manage Member Role' : title}
        onClick={embedded ? undefined : handleClose}
      >
        <div
          className={embedded ? 'flex h-full min-h-0 w-full flex-col overflow-hidden bg-white' : 'flex h-[720px] w-[512px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_22px_55px_rgba(15,23,42,0.24)]'}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex h-10 flex-shrink-0 items-center justify-between px-3">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={
                  isPermissionsOpen
                    ? () => setIsPermissionsOpen(false)
                    : isRoleManagerOpen
                      ? () => setIsRoleManagerOpen(false)
                      : handleClose
                }
                disabled={isBusy}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]"
                aria-label={isPermissionsOpen ? 'Back to member roles' : isRoleManagerOpen ? 'Back to add members' : 'Close add members'}
              >
                <BackIcon />
              </button>
              <h3 className="truncate text-[13px] font-semibold text-[#0F172A]">
                {isPermissionsOpen ? 'Manage Permissions' : isRoleManagerOpen ? 'Manage Member Role' : title}
              </h3>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isBusy}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>

          {isPermissionsOpen ? (
            renderPermissionsView()
          ) : isRoleManagerOpen ? (
            <>
              <div className="flex flex-shrink-0 gap-1 px-3 pb-2">
                <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[4px] border border-[#D8E0EB] px-3 text-[#94A3B8]">
                  <SearchIcon />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search contacts"
                    disabled={isBusy}
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-[#334155] outline-none placeholder:text-[#94A3B8]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setIsPermissionsOpen(true)}
                  className="h-9 rounded-[4px] border border-[#8B5CF6] px-3 text-[11px] font-medium text-[#6D3DF5] transition-colors hover:bg-[#F7F2FF]"
                >
                  Manage Permissions
                </button>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2 border-t border-[#EEF2F7] px-4 py-2">
                <span className="text-[10px] font-medium text-[#334155]">Selected Participants</span>
                <span className="rounded-full bg-[#F3EEFF] px-2 py-0.5 text-[10px] font-semibold text-[#8B5CF6]">{selectedCountLabel}</span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {selectedContacts
                  .filter((contact) => {
                    if (!normalizedQuery) return true;
                    return [getContactDisplayName(contact), getContactPhone(contact)].some((value) =>
                      String(value || '').toLowerCase().includes(normalizedQuery)
                    );
                  })
                  .map((contact) => {
                    const contactKey = getContactShareKey(contact);
                    const role = selectedContactRoles[contactKey] || 'member';
                    return (
                      <div key={`role-${contactKey}`} className="flex items-center gap-3 py-2.5">
                        {renderAvatar(contact, 'h-10 w-10')}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold text-[#0F172A]">{getContactDisplayName(contact)}</span>
                          {getContactRowBio(contact) ? (
                            <span className="mt-0.5 block truncate text-[10px] text-[#64748B]">{getContactRowBio(contact)}</span>
                          ) : null}
                        </span>
                        <select
                          value={role}
                          onChange={(event) => updateSelectedContactRole(contactKey, event.target.value)}
                          className={`h-8 rounded-[6px] border px-2 text-[11px] outline-none ${
                            role === 'admin'
                              ? 'border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]'
                              : role === 'moderator'
                                ? 'border-[#BBF7D0] bg-[#ECFDF5] text-[#059669]'
                                : 'border-[#E2E8F0] bg-white text-[#475569]'
                          }`}
                        >
                          {allowedRoles.map((value) => <option key={value} value={value}>{value === 'admin' ? 'Admin' : value === 'moderator' ? 'Moderator' : 'Member'}</option>)}
                        </select>
                      </div>
                    );
                  })}
                {normalizedQuery && !selectedContacts.some((contact) =>
                  [getContactDisplayName(contact), getContactPhone(contact)].some((value) =>
                    String(value || '').toLowerCase().includes(normalizedQuery)
                  )
                ) ? (
                  <div className="py-8 text-center text-[13px] text-[#64748B]">No contacts available</div>
                ) : null}
              </div>

              <div className="flex flex-shrink-0 items-center gap-3 border-t border-[#EEF2F7] px-4 pb-4 pt-3">
                <button
                  type="button"
                  onClick={() => setIsRoleManagerOpen(false)}
                  className="h-10 px-4 text-[12px] font-medium text-[#64748B]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setIsRoleManagerOpen(false)}
                  className="flex h-10 flex-1 items-center justify-center rounded-[6px] bg-[#8B5CF6] text-[12px] font-medium text-white shadow-[0_8px_18px_rgba(139,92,246,0.22)] transition-colors hover:bg-[#7C3AED]"
                >
                  Save Changes
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex-shrink-0 px-3 pb-3">
                <label className="flex h-9 items-center gap-2 rounded-[4px] border border-[#D8E0EB] px-3 text-[#94A3B8]">
                  <SearchIcon />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={searchPlaceholder}
                    disabled={isBusy}
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-[#334155] outline-none placeholder:text-[#94A3B8]"
                  />
                </label>
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
                {hasSelectedContacts ? (
                  <section className="mb-3 flex-shrink-0">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[10px] font-semibold text-[#334155]">Selected Participants</h4>
                        <span className="rounded-full bg-[#F3EEFF] px-2 py-0.5 text-[10px] font-semibold text-[#8B5CF6]">{selectedCountLabel}</span>
                      </div>
                      {enableRoleManagement ? (
                        <button
                          type="button"
                          onClick={() => setIsRoleManagerOpen(true)}
                          className="text-[10px] font-semibold text-[#6D3DF5] underline underline-offset-2"
                        >
                          Manage Role
                        </button>
                      ) : null}
                    </div>
                    <div className="flex max-h-[86px] flex-wrap gap-2 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {selectedContacts.map((contact) => {
                        const contactKey = getContactShareKey(contact);
                        return (
                          <span
                            key={`chip-${contactKey}`}
                            className="inline-flex h-8 max-w-[152px] items-center gap-1.5 rounded-full bg-[#F8FAFC] px-1.5 text-[10px] font-medium text-[#334155] ring-1 ring-[#E2E8F0]"
                          >
                            {renderAvatar(contact, 'h-5 w-5', false)}
                            <span className="truncate">{getContactDisplayName(contact)}</span>
                            <button
                              type="button"
                              onClick={() => removeSelectedContact(contactKey)}
                              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#D8E0EB] text-[#64748B]"
                              aria-label={`Remove ${getContactDisplayName(contact)}`}
                            >
                              <CloseIcon />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <section className="min-h-0 flex-1 overflow-hidden">
                  <h4 className="mb-2 px-1 text-[11px] font-semibold text-[#0F172A]">Contacts</h4>
                  {visibleContacts.length ? (
                    <div className="flex h-full flex-col overflow-y-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {visibleContacts.map(renderGroupCreateContactRow)}
                    </div>
                  ) : (
                    <div className="flex min-h-[180px] items-center justify-center px-5 text-center text-[13px] leading-5 text-[#64748B]">
                      {emptyStateText}
                    </div>
                  )}
                </section>
              </div>

              <div className="flex-shrink-0 border-t border-[#EEF2F7] bg-white px-3 pb-3 pt-2">
                <div className="flex items-center justify-center gap-2 text-center text-[11px] font-medium text-[#7B8AA3]">
                  <InfoIcon />
                  <span>{hintText}</span>
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!hasMinimumSelectedContacts || isBusy}
                  className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[6px] text-[12px] font-medium transition-colors disabled:cursor-not-allowed ${
                    hasMinimumSelectedContacts
                      ? 'bg-[#8B5CF6] text-white shadow-[0_10px_22px_rgba(139,92,246,0.28)] hover:bg-[#7C3AED]'
                      : 'bg-[#E2E8F0] text-[#64748B]'
                  }`}
                >
                  <PlusIcon />
                  <span>{resolvedSubmitLabel}</span>
                </button>
              </div>
            </>
          )}
        </div>
        {renderContactInfoDialog()}
      </div>
    );
  };

  if (variant === 'add-members-modal') {
    const visibleContacts = shareableContacts.filter((contact) => !selectedContactKeys.includes(getContactShareKey(contact)));
    const selectedCountLabel = selectedContacts.length > 99 ? '99+' : String(selectedContacts.length);
    const resolvedAddMembersLabel = isBusy ? busyLabel : submitLabel || 'Add Selected Members';
    // Keep the existing size/position on large screens, but fit shorter
    // viewports and escape the chat's clipping and stacking containers.
    const overlayClassName = 'fixed inset-0 z-[240] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/35 px-4 pb-4 pt-[clamp(16px,calc(100dvh-676px),152px)] backdrop-blur-[1px]';
    const panelClassName = 'flex h-[660px] max-h-[calc(100dvh-32px)] min-h-0 w-[472px] max-w-[calc(100vw-32px)] flex-shrink-0 flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_22px_55px_rgba(15,23,42,0.24)]';
    const renderModal = (content) => typeof document === 'undefined'
      ? content
      : createPortal(content, document.body);

    if (isRoleManagerOpen) {
      return renderModal(
        <div
          className={overlayClassName}
          role="dialog"
          aria-modal="true"
          aria-label="Manage member roles"
          onClick={handleClose}
        >
          <div
            className={panelClassName}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-[56px] flex-shrink-0 items-center justify-between border-b border-[#EEF2F7] px-4">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsRoleManagerOpen(false)}
                  disabled={isBusy}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                  aria-label="Back to add members"
                >
                  <BackIcon />
                </button>
                <h3 className="truncate text-[16px] font-bold text-[#111827]">Manage Role</h3>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isBusy}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#111827]"
                aria-label="Close"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="chatterly-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                {selectedContacts.length ? selectedContacts.map((contact) => {
                  const contactKey = getContactShareKey(contact);
                  const role = selectedContactRoles[contactKey] || 'member';

                  return (
                    <div key={`add-members-role-${contactKey}`} className="flex items-center gap-3">
                      {renderAvatar(contact, 'h-11 w-11', showPresenceIndicators)}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-[#111827]">{getContactDisplayName(contact)}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-[#64748B]">{getContactPhone(contact) || 'Group participant'}</span>
                      </span>
                      <select
                        value={role}
                        onChange={(event) => updateSelectedContactRole(contactKey, event.target.value)}
                        className={`h-9 w-[116px] rounded-[8px] border px-2 text-[13px] font-medium outline-none ${
                          role === 'admin'
                            ? 'border-[#CFE0FF] bg-[#EEF5FF] text-[#2E5FEA]'
                            : role === 'moderator'
                              ? 'border-[#BFEEDB] bg-[#E7FAF0] text-[#168A68]'
                              : 'border-[#D9E2EE] bg-white text-[#3D4758]'
                        }`}
                      >
                        {allowedRoles.map((value) => <option key={value} value={value}>{value === 'admin' ? 'Admin' : value === 'moderator' ? 'Moderator' : 'Member'}</option>)}
                      </select>
                    </div>
                  );
                }) : (
                  <div className="rounded-[12px] border border-dashed border-[#D8E0EB] bg-[#F8FAFC] px-4 py-8 text-center text-[13px] font-medium text-[#64748B]">
                    Select members before assigning roles.
                  </div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 border-t border-[#EEF2F7] px-4 py-4">
              <button
                type="button"
                onClick={() => setIsRoleManagerOpen(false)}
                className="flex h-12 w-full items-center justify-center rounded-[8px] bg-[#8B5CF6] text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(139,92,246,0.26)] transition-colors hover:bg-[#7C3AED]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      );
    }

    return renderModal(
      <div
        className={overlayClassName}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={handleClose}
      >
        <div
          className={panelClassName}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex h-[56px] flex-shrink-0 items-center justify-between border-b border-[#EEF2F7] px-4">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isBusy}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                aria-label="Back"
              >
                <BackIcon />
              </button>
              <h3 className="truncate text-[16px] font-bold text-[#111827]">{title}</h3>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isBusy}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#111827]"
              aria-label="Close"
            >
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="flex-shrink-0 px-4 pb-4 pt-4">
            <label className="flex h-[48px] items-center gap-2.5 rounded-[8px] border border-[#D8E0EB] bg-white px-4 text-[#52657F] shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
              <SearchIcon size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={searchPlaceholder}
                disabled={isBusy}
                className="min-w-0 flex-1 bg-transparent text-[13px] font-normal text-[#334155] outline-none placeholder:text-[#7B8AA3]"
              />
            </label>
          </div>

          <div className="chatterly-scrollbar min-h-0 flex-1 overflow-y-auto px-4">
            <section className="flex-shrink-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-[12px] font-semibold text-[#111827]">Selected Participants</h4>
                  <span className="rounded-full bg-[#F3EEFF] px-2 py-0.5 text-[11px] font-semibold text-[#8B5CF6]">{selectedCountLabel}</span>
                </div>
                {enableRoleManagement ? (
                  <button
                    type="button"
                    onClick={() => setIsRoleManagerOpen(true)}
                    disabled={!selectedContacts.length}
                    className="text-[12px] font-semibold text-[#6D28D9] underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Manage Role
                  </button>
                ) : null}
              </div>

              <div className="chatterly-scrollbar flex max-h-[118px] min-h-[76px] flex-wrap content-start gap-2 overflow-y-auto pb-1 pr-1">
                {selectedContacts.length ? selectedContacts.map((contact) => {
                  const contactKey = getContactShareKey(contact);
                  const isOnline = showPresenceIndicators && getPresenceKind(contact) === 'online';

                  return (
                    <span
                      key={`add-members-chip-${contactKey}`}
                      className={`inline-flex h-[32px] max-w-[176px] items-center gap-2 rounded-full px-1.5 pr-1.5 text-[11px] font-semibold ring-1 ${
                        isOnline
                          ? 'bg-[#DFF8ED] text-[#147B5F] ring-[#BFEEDB]'
                          : 'bg-[#F5F8FC] text-[#2D3748] ring-[#E2E8F0]'
                      }`}
                    >
                      {renderAvatar(contact, 'h-6 w-6', showPresenceIndicators)}
                      <span className="truncate">{getContactDisplayName(contact)}</span>
                      <button
                        type="button"
                        onClick={() => removeSelectedContact(contactKey)}
                        className="ml-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#64748B] ring-1 ring-[#CBD5E1] transition-colors hover:bg-[#F8FAFC] hover:text-[#334155]"
                        aria-label={`Remove ${getContactDisplayName(contact)}`}
                      >
                        <CloseIcon size={10} />
                      </button>
                    </span>
                  );
                }) : (
                  <span className="flex h-[30px] items-center text-[12px] font-medium text-[#94A3B8]">Select contacts to add them here.</span>
                )}
              </div>
            </section>

            <section className="mt-5 flex min-h-0 flex-1 flex-col">
              <h4 className="mb-3 text-[14px] font-semibold text-[#111827]">Contacts</h4>
              {visibleContacts.length ? (
                <div className="chatterly-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-3 pr-1">
                  {visibleContacts.map((contact) => {
                    const displayName = getContactDisplayName(contact);
                    const contactKey = getContactShareKey(contact);
                    const isSelected = selectedContactKeys.includes(contactKey);
                    const contactPhone = getContactPhone(contact);
                    const contactDetail = resolveContactSubtitle(contact) || getContactRowBio(contact);

                    return (
                      <button
                        key={`add-members-contact-${contactKey}`}
                        type="button"
                        disabled={isBusy}
                        onClick={() => toggleContactSelection(contact)}
                        className="flex w-full items-center gap-3 rounded-[10px] px-1 py-1.5 text-left transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                        aria-pressed={isSelected}
                      >
                        {renderAvatar(contact, 'h-12 w-12', showPresenceIndicators)}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-[#111827]">{displayName}</span>
                          {contactPhone || contactDetail ? (
                            <span className="mt-0.5 block truncate text-[11px] font-normal text-[#64748B]">
                              {contactPhone}
                              {contactPhone && contactDetail ? <span className="px-1.5 text-[#CBD5E1]">&bull;</span> : null}
                              {contactDetail}
                            </span>
                          ) : null}
                        </span>
                        <SelectionIndicator isSelected={isSelected} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-[180px] items-center justify-center px-5 text-center text-[13px] leading-5 text-[#64748B]">
                  {emptyStateText}
                </div>
              )}
            </section>
          </div>

          <div className="flex-shrink-0 bg-white px-4 pb-4 pt-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!hasMinimumSelectedContacts || isBusy}
              className={`flex h-[54px] w-full items-center justify-center gap-2 rounded-[8px] text-[14px] font-semibold text-white transition-colors disabled:cursor-not-allowed ${
                hasMinimumSelectedContacts
                  ? 'bg-[#8B5CF6] shadow-[0_10px_24px_rgba(139,92,246,0.26)] hover:bg-[#7C3AED]'
                  : 'bg-[#D8C5FF]'
              }`}
            >
              <span>{resolvedAddMembersLabel}</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSection = (sectionTitle, sectionContacts = [], showDivider = false) => {
    if (!sectionContacts.length) {
      return null;
    }

    return (
      <section className={showDivider ? 'border-t border-[#E8EEF5] pt-3' : ''}>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h4 className="text-[14px] font-semibold text-[#0F172A]">{sectionTitle}</h4>
          <button
            type="button"
            onClick={() => handleSelectSection(sectionContacts)}
            disabled={isBusy}
            className="text-[13px] font-medium text-[#8B5CF6] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Select all
          </button>
        </div>

        <div className="flex flex-col">
          {sectionContacts.map((contact) => {
            const displayName = getContactDisplayName(contact);
            const subtitle = resolveContactSubtitle(contact);
            const contactKey = getContactShareKey(contact);
            const isSelected = selectedContactKeys.includes(contactKey);
            const avatarSource = getContactAvatarSource(contact);
            const presenceKind = getPresenceKind(contact);

            return (
              <button
                key={contactKey}
                type="button"
                disabled={isBusy}
                onClick={() => toggleContactSelection(contact)}
                className="flex w-full items-center gap-3 rounded-[18px] px-1 py-3 text-left transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                aria-pressed={isSelected}
              >
                <span className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#EEF2FF]">
                  <img
                    src={avatarSource || defaultProfilePic}
                    alt={displayName}
                    className="h-full w-full rounded-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = defaultProfilePic;
                    }}
                  />
                  {presenceKind ? <PresenceBadge kind={presenceKind} className="-bottom-0.5 -right-0.5" /> : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium text-[#0F172A]">{displayName}</span>
                  {subtitle ? (
                    <span className="mt-0.5 block truncate text-[14px] text-[#64748B]">{subtitle}</span>
                  ) : null}
                </span>

                <SelectionIndicator isSelected={isSelected} />
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close forward panel"
        className="fixed inset-0 z-[209] bg-black/25 backdrop-blur-[1px] md:hidden"
        onClick={handleClose}
        disabled={isBusy}
      />

      <aside className="fixed inset-y-0 right-0 z-[210] flex w-full max-w-[366px] flex-col border-l border-[#E8EEF5] bg-white shadow-[-18px_0_48px_rgba(15,23,42,0.16)] md:static md:z-auto md:w-[366px] md:max-w-[366px] md:flex-shrink-0 md:shadow-none">
        <div className="flex h-[78px] items-center justify-between border-b border-[#E8EEF5] px-4">
          <div className="min-w-0">
            <h3 className="truncate text-[18px] font-medium text-[#0F172A]">{title}</h3>
            {description ? (
              <p className="mt-0.5 truncate text-[12px] text-[#94A3B8]">{description}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isBusy}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#334155] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-4 pb-3 pt-4">
          <label className="flex h-[46px] items-center gap-3 rounded-full border border-[#D6E0EC] bg-white px-4 text-[#94A3B8] shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
            <SearchIcon />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={searchPlaceholder}
              disabled={isBusy}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-[#334155] outline-none placeholder:text-[#94A3B8]"
            />
          </label>
        </div>

        <div className="chatterly-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {shareableContacts.length ? (
            <div className="flex flex-col gap-3">
              {normalizedQuery ? renderSection('Results', contactDirectory) : null}
              {!normalizedQuery ? renderSection('Recent', recentContacts) : null}
              {!normalizedQuery ? renderSection('Groups', groupDirectory, recentContacts.length > 0) : null}
              {!normalizedQuery ? renderSection('Contacts', individualContactDirectory, recentContacts.length > 0 || groupDirectory.length > 0) : null}
            </div>
          ) : (
            <div className="flex min-h-[240px] items-center justify-center px-5 text-center text-[14px] leading-6 text-[#64748B]">
              {emptyStateText}
            </div>
          )}
        </div>

        <div className="border-t border-[#E8EEF5] bg-white px-4 pb-5 pt-3">
          <div className="flex items-center justify-center gap-2 text-center text-[13px] font-medium text-[#7B8AA3]">
            <InfoIcon />
            <span>{selectionHintText}</span>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasSelectedContacts || isBusy}
            className={`mt-4 inline-flex h-[56px] w-full items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold transition-all disabled:cursor-not-allowed ${
              hasSelectedContacts
                ? 'bg-[linear-gradient(90deg,#8D44F7_0%,#9E57F8_100%)] text-white shadow-[0_10px_26px_rgba(141,68,247,0.28)] hover:brightness-[1.02]'
                : 'bg-[#E7DBFF] text-white/90 shadow-none'
            } ${isBusy ? 'opacity-90' : ''}`}
          >
            {isBusy ? (
              busyLabel
            ) : (
              <>
                <ForwardIcon />
                <span>{resolvedSubmitLabel}</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
