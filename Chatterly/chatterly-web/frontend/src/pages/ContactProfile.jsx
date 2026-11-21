import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import MediaViewerOverlay from '../components/MediaViewerOverlay';
import ProfilePhotoPreviewDialog from '../components/ProfilePhotoPreviewDialog';
import Loader from '../components/loader';
import { getMessages, pinMessage, unpinMessage } from '../api/chat';
import { useNetworkStatus } from '../context/NetworkStatusContext';
import {
  buildProfileTabContent,
  normalizeStoredMessageListData,
  normalizeStoredMessagesByChatData,
} from '../utils/message';
import { getContactPresence, normalizePresenceValue } from '../utils/presence';
import { getInitials, getStoredUser, isCustomProfilePictureValue, normalizeProfilePictureValue } from '../utils/profile';
import {
  applyContactPrivacyRedaction,
  isContactPrivacyRestricted,
} from '../utils/blockPrivacy';
import socketService from '../utils/socketService';

const SYNCED_CONTACTS_STORAGE_KEY = 'chatterly_synced';
const CHAT_MESSAGES_STORAGE_KEY = 'chatterly_chat_messages';

const readStoredContacts = () => {
  try {
    const parsedValue = JSON.parse(localStorage.getItem(SYNCED_CONTACTS_STORAGE_KEY) || '[]');
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.error('Unable to parse stored contacts:', error);
    return [];
  }
};

const readStoredChatMessages = () => {
  try {
    const parsedValue = JSON.parse(localStorage.getItem(CHAT_MESSAGES_STORAGE_KEY) || '{}');
    return normalizeStoredMessagesByChatData(parsedValue);
  } catch (error) {
    console.error('Unable to parse stored chat messages:', error);
    return {};
  }
};

const getContactIdentifiers = (contact = {}) =>
  [
    contact?.chatId,
    contact?.userId,
    contact?.receiverId,
    contact?.contactId,
    contact?.participantId,
    contact?._id,
    contact?.id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

const doesContactMatch = (contact = {}, targetId = '') => {
  const normalizedTargetId = String(targetId || '').trim();
  return normalizedTargetId ? getContactIdentifiers(contact).includes(normalizedTargetId) : false;
};

const doContactsShareIdentifier = (leftContact = {}, rightContact = {}) => {
  const leftIdentifiers = getContactIdentifiers(leftContact);
  const rightIdentifiers = getContactIdentifiers(rightContact);
  return leftIdentifiers.some((identifier) => rightIdentifiers.includes(identifier));
};

const resolveContactPhoneNumber = (contact = {}) =>
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

const mergeContactRecords = (primary = {}, fallback = {}) => {
  const name = String(primary?.name || fallback?.name || '').trim() || 'Unknown contact';
  const profilePic = normalizeProfilePictureValue(primary?.profilePic || fallback?.profilePic || '');
  const status = String(primary?.status || fallback?.status || '').trim();
  const phone = resolveContactPhoneNumber(primary) || resolveContactPhoneNumber(fallback);
  const email = String(primary?.email || fallback?.email || '').trim();
  const storedUser = getStoredUser() || {};
  const currentUserId = String(storedUser?._id || storedUser?.userId || storedUser?.id || '').trim();

  const mergedContact = {
    ...fallback,
    ...primary,
    name,
    profilePic,
    status,
    phone,
    email,
    chatId: primary?.chatId || fallback?.chatId || '',
    userId: primary?.userId || fallback?.userId || '',
    _id: primary?._id || fallback?._id || '',
    initials: String(primary?.initials || fallback?.initials || getInitials(name)).trim() || getInitials(name),
  };

  return applyContactPrivacyRedaction(mergedContact, { currentUserId });
};

const persistStoredContact = (contactRecord) => {
  if (!contactRecord) return;

  const contactIdentifiers = getContactIdentifiers(contactRecord);
  if (!contactIdentifiers.length) return;

  try {
    const storedContacts = readStoredContacts();
    const existingIndex = storedContacts.findIndex((storedContact) =>
      doContactsShareIdentifier(storedContact, contactRecord)
    );
    const nextStoredContacts = [...storedContacts];

    if (existingIndex === -1) {
      nextStoredContacts.push(contactRecord);
    } else {
      nextStoredContacts[existingIndex] = mergeContactRecords(
        contactRecord,
        nextStoredContacts[existingIndex]
      );
    }

    localStorage.setItem(SYNCED_CONTACTS_STORAGE_KEY, JSON.stringify(nextStoredContacts));
  } catch (error) {
    console.error('Unable to persist contact profile snapshot:', error);
  }
};

const getPresenceTextClassName = (presenceKind = 'offline') => {
  if (presenceKind === 'online') return 'text-[#22C55E]';
  if (presenceKind === 'no-internet') return 'text-[#F97316]';
  return 'text-[#64748B]';
};

const getPresenceDotClassName = (presenceKind = 'offline') => {
  if (presenceKind === 'online') return 'bg-[#22C55E]';
  if (presenceKind === 'no-internet') return 'bg-[#F97316]';
  return 'bg-[#94A3B8]';
};

const CONTACT_SYNC_FIELDS = [
  'chatId',
  'userId',
  'receiverId',
  'contactId',
  'participantId',
  '_id',
  'id',
  'name',
  'profilePic',
  'status',
  'phone',
  'email',
  'initials',
  'presence',
  'userStatus',
  'isOnline',
  'online',
  'presenceLabel',
  'lastSeen',
  'lastSeenAt',
  'isBlocked',
  'isBlockedByContact',
  'blockedByContact',
  'privacyRestricted',
];

const areContactSnapshotsEqual = (leftContact = {}, rightContact = {}) =>
  CONTACT_SYNC_FIELDS.every(
    (fieldName) => String(leftContact?.[fieldName] ?? '') === String(rightContact?.[fieldName] ?? '')
  );

const resolveProfileContext = ({ contactId, routeContact, routeChatId, routeMessages, currentUserId }) => {
  const storedContacts = readStoredContacts();
  const storedMessagesByChat = readStoredChatMessages();
  const matchedStoredContact =
    storedContacts.find((contact) => doesContactMatch(contact, contactId) || doesContactMatch(contact, routeChatId)) || null;
  const mergedContact =
    routeContact || matchedStoredContact
      ? mergeContactRecords(routeContact || {}, matchedStoredContact || {})
      : null;
  const resolvedChatId =
    String(
      mergedContact?.chatId ||
      routeChatId ||
      (storedMessagesByChat[contactId] ? contactId : '')
    ).trim();
  const seededMessages = Array.isArray(routeMessages)
    ? routeMessages
    : storedMessagesByChat[resolvedChatId] || [];

  return {
    contact: mergedContact,
    chatId: resolvedChatId,
    messages: normalizeStoredMessageListData(seededMessages, {
      currentUserId,
      fallback: { chatId: resolvedChatId },
    }),
  };
};

export default function ContactProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOnline } = useNetworkStatus();
  const { contactId = '' } = useParams();
  const currentUser = getStoredUser() || {};
  const currentUserId = currentUser?._id || currentUser?.userId || currentUser?.id || 'me';
  const routeContact = location.state?.contact || null;
  const routeMessages = location.state?.messages || null;
  const routeChatId = String(location.state?.chatId || routeContact?.chatId || '').trim();

  const initialContext = resolveProfileContext({
    contactId,
    routeContact,
    routeChatId,
    routeMessages,
    currentUserId,
  });

  const [contact, setContact] = useState(initialContext.contact);
  const [chatId, setChatId] = useState(initialContext.chatId);
  const [messages, setMessages] = useState(initialContext.messages);
  const [activeTab, setActiveTab] = useState('media');
  const [activeMediaIndex, setActiveMediaIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(!initialContext.contact && !initialContext.messages.length);
  const [error, setError] = useState('');
  const [isProfilePhotoPreviewOpen, setIsProfilePhotoPreviewOpen] = useState(false);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);

  useEffect(() => {
    const nextContext = resolveProfileContext({
      contactId,
      routeContact,
      routeChatId,
      routeMessages,
      currentUserId,
    });

    setContact(nextContext.contact);
    setChatId(nextContext.chatId);
    setMessages(nextContext.messages);
    setError(nextContext.contact ? '' : 'Unable to find this contact profile right now.');
  }, [contactId, currentUserId, routeChatId, routeContact, routeMessages]);

  useEffect(() => {
    if (!chatId) {
      setIsLoading(false);
      return undefined;
    }

    let isMounted = true;

    const loadLatestMessages = async () => {
      setIsLoading(true);

      try {
        const fetchedMessages = await getMessages(chatId, { skipGlobalLoading: true });
        if (!isMounted) {
          return;
        }

        const normalizedMessages = normalizeStoredMessageListData(fetchedMessages, {
          currentUserId,
          fallback: { chatId },
        });

        if (normalizedMessages.length) {
          setMessages(normalizedMessages);
        }

        const refreshedContext = resolveProfileContext({
          contactId,
          routeContact,
          routeChatId: chatId,
          routeMessages: normalizedMessages,
          currentUserId,
        });

        if (refreshedContext.contact) {
          setContact(refreshedContext.contact);
        }
      } catch (fetchError) {
        console.error('Unable to load chat thread for contact profile:', fetchError);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadLatestMessages();

    return () => {
      isMounted = false;
    };
  }, [chatId, contactId, currentUserId, routeContact]);

  useEffect(() => {
    const syncStoredContactSnapshot = () => {
      const storedContacts = readStoredContacts();
      const matchedStoredContact =
        storedContacts.find(
          (storedContact) =>
            doesContactMatch(storedContact, contactId) ||
            doesContactMatch(storedContact, routeChatId) ||
            doContactsShareIdentifier(storedContact, contact || {})
        ) || null;

      if (!matchedStoredContact) {
        return;
      }

      setContact((currentContact) => {
        const nextContact = mergeContactRecords(currentContact || {}, matchedStoredContact);
        return areContactSnapshotsEqual(currentContact || {}, nextContact)
          ? currentContact
          : nextContact;
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncStoredContactSnapshot();
      }
    };

    syncStoredContactSnapshot();
    window.addEventListener('focus', syncStoredContactSnapshot);
    window.addEventListener('storage', syncStoredContactSnapshot);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', syncStoredContactSnapshot);
      window.removeEventListener('storage', syncStoredContactSnapshot);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [contact, contactId, routeChatId]);

  useEffect(() => {
    const unsubscribePresence = socketService.onPresence(({ userId, status, lastSeen }) => {
      const normalizedUserId = String(userId || '').trim();
      if (!normalizedUserId) {
        return;
      }

      setContact((currentContact) => {
        if (!currentContact || !doesContactMatch(currentContact, normalizedUserId)) {
          return currentContact;
        }
        if (isContactPrivacyRestricted(currentContact, { currentUserId })) {
          return currentContact;
        }

        const normalizedPresence = normalizePresenceValue(status);
        const isMarkedOnline = normalizedPresence === 'online';

        const nextContact = mergeContactRecords(
          {
            ...currentContact,
            presence: normalizedPresence || currentContact.presence || '',
            isOnline: isMarkedOnline,
            online: isMarkedOnline,
            lastSeen: isMarkedOnline ? null : lastSeen || currentContact.lastSeen || null,
            lastSeenAt: isMarkedOnline ? null : lastSeen || currentContact.lastSeenAt || null,
          },
          currentContact
        );

        return areContactSnapshotsEqual(currentContact, nextContact)
          ? currentContact
          : nextContact;
      });
    });

    return () => {
      unsubscribePresence?.();
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!contact) {
      return;
    }

    persistStoredContact(contact);
  }, [contact]);

  const profileTabContent = buildProfileTabContent(messages, {
    currentUserId,
    contactName: contact?.name || 'Contact',
    fallback: { chatId },
  });
  const mediaItems = profileTabContent.media;
  const fileItems = profileTabContent.files;
  const linkItems = profileTabContent.links;
  const chatItems = profileTabContent.chats;
  const isPrivacyRestricted = isContactPrivacyRestricted(contact, { currentUserId });
  const displayContact = isPrivacyRestricted
    ? applyContactPrivacyRedaction(contact, { currentUserId })
    : contact;
  const contactPresence = isPrivacyRestricted
    ? { kind: 'offline', label: '' }
    : getContactPresence(displayContact, { appOnline: isOnline });

  const backTarget = String(location.state?.from || '').trim() || (chatId ? `/chat/${chatId}` : '/chats');

  const openCall = (callType) => {
    if (!chatId) return;

    navigate(`/chat/${encodeURIComponent(chatId)}/call`, {
      state: { callType, autoStartCall: true },
    });
  };

  const openChatSearch = () => {
    if (!chatId) return;

    navigate(`/chat/${encodeURIComponent(chatId)}`, {
      state: { openChatSearch: true },
    });
  };

  const openChat = () => {
    if (!chatId) return;

    navigate(`/chat/${encodeURIComponent(chatId)}`);
  };

  useEffect(() => {
    if (!mediaItems.length && activeMediaIndex !== -1) {
      setActiveMediaIndex(-1);
      return;
    }

    if (activeMediaIndex >= mediaItems.length) {
      setActiveMediaIndex(mediaItems.length - 1);
    }
  }, [activeMediaIndex, mediaItems.length]);

  const handleToggleMediaPin = async (item, nextPinnedState) => {
    const itemMessage = item?.message || item || {};
    const messageId = String(
      itemMessage?._id || itemMessage?.id || itemMessage?.messageId || item?.messageId || ''
    ).trim();

    if (!/^[a-f\d]{24}$/i.test(messageId)) {
      throw new Error('This media is still being prepared and cannot be pinned yet.');
    }

    await (nextPinnedState ? pinMessage(messageId) : unpinMessage(messageId));
    setMessages((currentMessages) => currentMessages.map((message) => {
      const currentMessageId = String(message?._id || message?.id || message?.messageId || '').trim();
      if (currentMessageId !== messageId) return message;

      return {
        ...message,
        isPinned: nextPinnedState,
        pinnedAt: nextPinnedState ? new Date().toISOString() : null,
      };
    }));
  };

  // ── TAB CONTENT RENDERERS (WhatsApp style) ──────────────────────────────

  const renderActiveTab = () => {
    // ── ABOUT tab ──
    if (activeTab === 'about') {
      return (
        <div className="space-y-0 divide-y divide-[#F1F5F9]">
          {[{
              icon: (
                <svg className="h-5 w-5 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              label: 'About',
              value: displayContact?.status || (isPrivacyRestricted ? '—' : 'Hey there! I am using Chatterly.'),
            },
            {
              icon: (
                <svg className="h-5 w-5 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              ),
              label: 'Phone',
              value: resolveContactPhoneNumber(contact) || '—',
            },
            {
              icon: (
                <svg className="h-5 w-5 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              ),
              label: 'Email',
              value: displayContact?.email || '—',
            },
            {
              icon: (
                <svg className="h-5 w-5 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ),
              label: 'Joined',
              value: 'January 2024',
            },
            {
              icon: (
                <svg className="h-5 w-5 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              ),
              label: 'Notifications',
              value: 'Custom notifications',
            },
            {
              icon: (
                <svg className="h-5 w-5 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M17 9l2 2m0 0l2 2m-2-2l-2 2m2-2l2-2" />
                </svg>
              ),
              label: 'Mute',
              value: 'No',
            },
          ].map(({ icon, label, value }) => (
            <div key={label} className="flex items-start gap-4 px-1 py-4">
              <div className="mt-0.5 flex-shrink-0">{icon}</div>
              <div>
                <p className="text-[15px] font-semibold text-[#1A1A2E]">{label}</p>
                <p className="mt-0.5 break-all text-sm text-[#64748B]">{value}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // ── MEDIA tab ──
    if (activeTab === 'media') {
      if (!mediaItems.length) {
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F0FF]">
              <svg className="h-7 w-7 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[#1A1A2E]">No shared media yet</p>
            <p className="mt-1 text-xs text-[#94A3B8]">Photos and videos will appear here</p>
          </div>
        );
      }

      const thisMonth = mediaItems.slice(0, 6);
      const lastMonth = mediaItems.slice(6);

      const MediaGrid = ({ items, startIndex = 0 }) => (
        <div className="grid grid-cols-3 gap-1.5 md:grid-cols-4 md:gap-2 lg:grid-cols-5">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveMediaIndex(startIndex + index)}
              className="group relative aspect-square overflow-hidden rounded-[10px] bg-[#F1F5F9] text-left transition-transform duration-200 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/60 focus:ring-offset-2"
            >
              {item.type === 'image' ? (
                <img src={item.url} alt={item.caption || 'Media'} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
              ) : (
                <video src={item.url} className="h-full w-full object-cover" muted playsInline />
              )}
              {item.type === 'video' ? (
                <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold text-white">
                  <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M3 2.35v7.3a.55.55 0 0 0 .84.47l5.7-3.65a.55.55 0 0 0 0-.94l-5.7-3.65a.55.55 0 0 0-.84.47Z" />
                  </svg>
                  <span>{item.time}</span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      );

      return (
        <div className="space-y-5">
          {thisMonth.length ? (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">This month</p>
              <MediaGrid items={thisMonth} startIndex={0} />
            </div>
          ) : null}
          {lastMonth.length ? (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Last month</p>
              <MediaGrid items={lastMonth} startIndex={thisMonth.length} />
            </div>
          ) : null}
        </div>
      );
    }

    // ── FILES tab ──
    if (activeTab === 'files') {
      if (!fileItems.length) {
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F0FF]">
              <svg className="h-7 w-7 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[#1A1A2E]">No shared files yet</p>
            <p className="mt-1 text-xs text-[#94A3B8]">Documents and files will appear here</p>
          </div>
        );
      }

      return (
        <div className="divide-y divide-[#F1F5F9]">
          {fileItems.map((item) => {
            const FileItemWrapper = item.url ? 'a' : 'div';
            return (
              <FileItemWrapper
                key={item.id}
                {...(item.url ? { href: item.url, target: '_blank', rel: 'noreferrer' } : {})}
                className="flex items-center gap-3 py-3.5 transition-colors hover:bg-[#FAFBFF]"
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[12px] bg-[#F3F0FF]">
                  <svg className="h-5 w-5 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[#1A1A2E]">{item.name}</p>
                  <p className="mt-0.5 text-xs text-[#94A3B8]">
                    {[item.size, item.time].filter(Boolean).join(' · ') || 'Shared file'}
                  </p>
                  {item.caption ? <p className="mt-1 text-xs text-[#64748B]">{item.caption}</p> : null}
                </div>
                <svg className="h-4 w-4 flex-shrink-0 text-[#CBD5E1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </FileItemWrapper>
            );
          })}
        </div>
      );
    }

    // ── LINKS tab ──
    if (activeTab === 'links') {
      if (!linkItems.length) {
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F0FF]">
              <svg className="h-7 w-7 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[#1A1A2E]">No shared links yet</p>
            <p className="mt-1 text-xs text-[#94A3B8]">Links from messages will appear here</p>
          </div>
        );
      }

      const platformColor = (url = '') => {
        if (url.includes('instagram')) return 'bg-[#FDF2F8] text-[#C026D3]';
        if (url.includes('twitter') || url.includes('x.com')) return 'bg-[#EFF6FF] text-[#1D9BF0]';
        if (url.includes('linkedin')) return 'bg-[#EFF6FF] text-[#0A66C2]';
        if (url.includes('youtube')) return 'bg-[#FEF2F2] text-[#EF4444]';
        if (url.includes('github')) return 'bg-[#F8FAFC] text-[#24292E]';
        return 'bg-[#F3F0FF] text-[#7C3AED]';
      };

      return (
        <div className="divide-y divide-[#F1F5F9]">
          {linkItems.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 py-3.5 transition-colors hover:bg-[#FAFBFF]"
            >
              <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[12px] ${platformColor(item.url)}`}>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-[#1A1A2E]">
                  {(() => { try { return new URL(item.url).hostname.replace('www.', ''); } catch { return item.url; } })()}
                </p>
                <p className="mt-0.5 break-all whitespace-normal text-xs text-[#94A3B8]">{item.url}</p>
              </div>
              <svg className="h-4 w-4 flex-shrink-0 text-[#CBD5E1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          ))}
        </div>
      );
    }

    // ── CHATS tab ──
    if (!chatItems.length) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F0FF]">
            <svg className="h-7 w-7 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#1A1A2E]">No chat history yet</p>
          <p className="mt-1 text-xs text-[#94A3B8]">Messages will appear here once synced</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-[#F1F5F9]">
        {chatItems.map((item) => (
          <div
            key={item.id}
            className={`flex gap-3 py-3.5 ${item.isSentByCurrentUser ? 'flex-row-reverse' : ''}`}
          >
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.isSentByCurrentUser ? 'bg-[#7C3AED] text-white' : 'bg-[#F3F0FF] text-[#7C3AED]'}`}>
              {item.isSentByCurrentUser ? 'You' : (displayContact?.initials || getInitials(displayContact?.name || 'C')).slice(0, 1)}
            </div>
            <div className={`max-w-[75%] ${item.isSentByCurrentUser ? 'items-end' : 'items-start'} flex flex-col`}>
              <div className={`rounded-[14px] px-4 py-2.5 text-sm leading-relaxed ${item.isSentByCurrentUser ? 'rounded-tr-[4px] bg-[#7C3AED] text-white' : 'rounded-tl-[4px] bg-[#F8F7FF] text-[#1A1A2E]'}`}>
                {item.text}
              </div>
              <p className="mt-1 text-[11px] text-[#94A3B8]">{item.time}</p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const WHATSAPP_TABS = [
    { id: 'about', label: 'About' },
    { id: 'media', label: 'Media' },
    { id: 'files', label: 'Files' },
    { id: 'links', label: 'Links' },
    { id: 'chats', label: 'Chats' },
  ];

  return (
    <div className="min-h-screen bg-[#F0EDF8] p-4 md:flex md:items-center md:justify-center md:p-8">
      {/* 
        MOBILE VIEW (< md): Phone shell — centered, max-w-[420px], rounded-[40px], shadow
        DESKTOP VIEW (>= md): Full card layout — max-w-[1180px], rounded-[32px], no phone shell
      */}
      <div className="mx-auto flex w-full max-w-[420px] flex-col overflow-hidden rounded-[40px] bg-white shadow-[0_24px_64px_rgba(124,58,237,0.18)] md:h-[calc(100vh-4rem)] md:min-h-[680px] md:max-w-none md:w-[min(1180px,calc(100vw-4rem))] md:rounded-[32px] md:shadow-[0_8px_30px_rgba(0,0,0,0.04)] lg:min-h-[720px]">

        {/* ── STATUS BAR (mobile only) ── */}
        <div className="flex items-center justify-between bg-white px-6 pt-4 pb-1 md:hidden">
          <span className="text-[13px] font-semibold text-[#1A1A2E]">9:41</span>
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-[#1A1A2E]" fill="currentColor" viewBox="0 0 24 24"><path d="M1.5 8.5C5.5 4.5 18.5 4.5 22.5 8.5M4.5 11.5C7.5 8.5 16.5 8.5 19.5 11.5M7.5 14.5C9.5 12.5 14.5 12.5 16.5 14.5M12 18h.01" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
            <svg className="h-3.5 w-3.5 text-[#1A1A2E]" fill="currentColor" viewBox="0 0 24 24"><rect x="2" y="7" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M20 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
        </div>

        {/* ── TOP NAV ── */}
        <div className="flex items-center justify-between bg-white px-5 py-3 md:px-10 md:py-4">
          <button
            onClick={() => navigate(backTarget)}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#F3F0FF]"
            type="button"
          >
            <svg className="h-5 w-5 text-[#1A1A2E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
          <div className="relative">
            <button
              onClick={() => setIsMoreOptionsOpen((isOpen) => !isOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#F3F0FF]"
              type="button"
              aria-label="More options"
              aria-expanded={isMoreOptionsOpen}
              aria-haspopup="menu"
            >
              <svg className="h-5 w-5 text-[#1A1A2E]" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {isMoreOptionsOpen ? (
              <div role="menu" className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsMoreOptionsOpen(false);
                    openChat();
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm font-medium text-[#1A1A2E] hover:bg-[#F8F7FF]"
                >
                  View chat
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsMoreOptionsOpen(false);
                    openChatSearch();
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm font-medium text-[#1A1A2E] hover:bg-[#F8F7FF]"
                >
                  Search in chat
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* ── PROFILE HEADER ── */}
        <div className="flex flex-col items-center bg-white px-6 pb-6 md:flex-row md:items-start md:gap-8 md:px-10 md:pb-8">
          {/* Avatar with presence dot */}
          <div className="relative mb-4 md:mb-0 md:flex-shrink-0">
            {isCustomProfilePictureValue(displayContact?.profilePic) ? (
              <button
                type="button"
                onClick={() => setIsProfilePhotoPreviewOpen(true)}
                className="block h-24 w-24 cursor-zoom-in overflow-hidden rounded-full bg-[#EDE9FE] shadow-[0_4px_20px_rgba(124,58,237,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6] focus-visible:ring-offset-2 md:h-28 md:w-28"
                aria-label={`View ${displayContact?.name || 'contact'}'s photo`}
                title="View photo"
              >
                <img src={displayContact.profilePic} alt={displayContact?.name || 'Contact'} className="h-full w-full object-cover" />
              </button>
            ) : (
              <div className="h-24 w-24 overflow-hidden rounded-full bg-[#EDE9FE] shadow-[0_4px_20px_rgba(124,58,237,0.25)] md:h-28 md:w-28">
                {displayContact?.profilePic ? (
                  <img src={displayContact.profilePic} alt={displayContact?.name || 'Contact'} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-[#7C3AED] md:text-4xl">
                    {displayContact?.initials || getInitials(displayContact?.name || 'Contact')}
                  </div>
                )}
              </div>
            )}
            <ProfilePhotoPreviewDialog
              isOpen={isProfilePhotoPreviewOpen}
              imageUrl={displayContact?.profilePic || ''}
              name={displayContact?.name || ''}
              onClose={() => setIsProfilePhotoPreviewOpen(false)}
            />
            {isPrivacyRestricted ? null : (
              <div className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white ${getPresenceDotClassName(contactPresence.kind)} md:h-5 md:w-5`} />
            )}
          </div>

          {/* Name & status */}
          <div className="flex flex-col items-center md:items-start md:flex-1">
            <h2 className="text-[22px] font-bold text-[#1A1A2E] md:text-[28px]">{displayContact?.name || 'Unknown contact'}</h2>
            {isPrivacyRestricted ? null : (
              <p className={`mt-1 text-sm font-medium ${getPresenceTextClassName(contactPresence.kind)}`}>
                {contactPresence.label}
              </p>
            )}
            {isPrivacyRestricted ? null : (
              <p className="mt-2 max-w-[280px] break-all text-center text-sm leading-relaxed text-[#64748B] md:max-w-none md:text-left md:text-base">
                {displayContact?.status || 'Hey there! I am using Chatterly.'}
              </p>
            )}

            {/* Error banner */}
            {error ? (
              <div className="mt-3 w-full rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-center text-xs font-medium text-amber-700 md:text-left">
                {error}
              </div>
            ) : null}

            {/* Action buttons */}
            <div className="mt-5 flex w-full justify-center gap-4 md:justify-start">
              {[{
                  label: 'Audio',
                  icon: (
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  ),
                },
                {
                  label: 'Video',
                  icon: (
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  ),
                },
                {
                  label: 'Search',
                  icon: (
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  ),
                },
              ].map(({ label, icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={
                    label === 'Audio'
                      ? () => openCall('audio')
                      : label === 'Video'
                        ? () => openCall('video')
                        : openChatSearch
                  }
                  className="flex flex-col items-center gap-1.5 rounded-[18px] bg-[#F8F7FF] px-5 py-3.5 text-[#1A1A2E] transition-colors hover:bg-[#EDE9FE] md:flex-row md:px-6 md:py-3"
                >
                  {icon}
                  <span className="text-[11px] font-medium md:text-sm">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── TABS SECTION ── */}
        <div className="sticky top-0 z-10 border-b border-[#F1F5F9] bg-white">
          <div className="flex overflow-x-auto md:px-10" role="tablist" aria-label="Contact profile sections" style={{ scrollbarWidth: 'none' }}>
            {WHATSAPP_TABS.map((tab) => {
              const resolvedActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={resolvedActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-shrink-0 px-5 py-3.5 text-[13px] font-semibold transition-colors md:px-6 md:text-[14px] ${
                    resolvedActive ? 'text-[#7C3AED]' : 'text-[#94A3B8] hover:text-[#64748B]'
                  }`}
                >
                  {tab.label}
                  {resolvedActive ? (
                    <span className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-t-full bg-[#7C3AED]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CONTENT DISPLAY AREA ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 md:px-10 md:py-6">
          {isLoading && !contact && !messages.length ? (
            <div className="flex items-center justify-center py-16">
              <Loader text="Loading contact profile..." />
            </div>
          ) : (
            <>
              {isLoading && messages.length ? (
                <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[#F8F7FF] px-4 py-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#DDD6FE] border-t-[#7C3AED]" />
                  <p className="text-sm text-[#7C3AED]">Refreshing…</p>
                </div>
              ) : null}
              {renderActiveTab()}
            </>
          )}
        </div>

        {/* ── CHAT BUTTON ── */}
        {chatId ? (
          <div className="bg-white px-5 pb-8 pt-3 md:px-10 md:pb-6 md:pt-4">
            <button
              onClick={() => navigate(`/chat/${chatId}`)}
              type="button"
              className="flex w-full items-center justify-center gap-2.5 rounded-[18px] bg-[#7C3AED] py-4 text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(124,58,237,0.35)] transition-all hover:bg-[#6D28D9] active:scale-[0.98] md:py-3.5 md:text-base"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Chat
            </button>
          </div>
        ) : null}

      </div>

      {activeMediaIndex >= 0 ? (
        <MediaViewerOverlay
          items={mediaItems}
          activeIndex={activeMediaIndex}
          onClose={() => setActiveMediaIndex(-1)}
          onSelect={setActiveMediaIndex}
          contact={contact}
          currentUser={currentUser}
          isItemPinned={(item) => Boolean((item?.message || item)?.isPinned)}
          onTogglePin={handleToggleMediaPin}
        />
      ) : null}
    </div>
  );
}
