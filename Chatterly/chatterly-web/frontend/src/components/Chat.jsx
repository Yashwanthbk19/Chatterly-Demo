import React, { useEffect, useRef, useState } from 'react';
import { getMessages } from '../api/contactapi';
import EmojiPicker from './EmojiPicker';
import MessageBubble from './MessageBubble';
import { getStoredUser, normalizeProfile } from '../utils/profile';
import socketService from '../utils/socketService';
import { getMessageIdentityKeys, normalizeMessageData } from '../utils/message';

const EmojiIcon = ({ size = 20, stroke = '#64748B' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.7 14.4c.74 1.1 1.98 1.75 3.3 1.75 1.33 0 2.56-.65 3.3-1.75" />
    <path d="M9 10h.01" />
    <path d="M15 10h.01" />
  </svg>
);

export default function Chat({ contact, onBack, onMessageSent }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [selectedReplyMessage, setSelectedReplyMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const previousChatIdRef = useRef(null);
  const messageInputRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const inputSelectionRef = useRef({ start: null, end: null });
  const storedUser = getStoredUser() || {};
  const currentUserProfile = normalizeProfile({}, storedUser);
  const currentSender = {
    id: storedUser?.userId || storedUser?.id || storedUser?._id || 'me',
    name: currentUserProfile.fullName || storedUser?.name || storedUser?.phone || 'You',
  };
  const currentSenderId = currentSender.id;
  const receiverId = contact?.userId || contact?.receiverId || contact?.id || contact?._id || null;
  const getComparableMessageIds = (messageRecord = {}) =>
    getMessageIdentityKeys(messageRecord).filter(Boolean);
  const resolveReplyMessageId = (messageRecord = {}) =>
    String(
      messageRecord?.id ||
      messageRecord?.messageId ||
      messageRecord?.clientMessageId ||
      messageRecord?.localId ||
      messageRecord?.tempId ||
      ''
    ).trim();
  const resolveReplyPreviewText = (messageRecord = {}) => {
    const previewText = String(
      messageRecord?.text ||
      messageRecord?.message ||
      (typeof messageRecord?.content === 'string' ? messageRecord.content : '') ||
      ''
    ).trim();

    if (previewText) {
      return previewText;
    }

    const messageType = String(messageRecord?.type || '').trim().toLowerCase();
    if (messageType === 'image') return 'Photo';
    if (messageType === 'video') return 'Video';
    if (messageType === 'audio') return 'Voice message';
    if (messageType === 'file') return String(messageRecord?.fileName || 'Document').trim() || 'Document';
    return 'Message';
  };
  const resolveReplySenderLabel = (messageRecord = {}) => {
    const isCurrentUserMessage =
      String(messageRecord?.senderId || '') === String(currentSenderId || '') ||
      messageRecord?.direction === 'sent';

    if (isCurrentUserMessage) {
      return 'You';
    }

    return String(
      (typeof messageRecord?.sender === 'string' ? messageRecord.sender : messageRecord?.sender?.name) ||
      messageRecord?.senderName ||
      contact?.name ||
      'Contact'
    ).trim() || 'Contact';
  };
  const buildReplyToPayload = (messageRecord = {}) => {
    const replyMessageId = resolveReplyMessageId(messageRecord);

    if (!replyMessageId) {
      return null;
    }

    return {
      messageId: replyMessageId,
      content: resolveReplyPreviewText(messageRecord),
      sender: resolveReplySenderLabel(messageRecord),
    };
  };
  const focusMessageInput = () => {
    const focusInput = () => {
      messageInputRef.current?.focus();
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(focusInput);
      return;
    }

    focusInput();
  };
  const clearSelectedReplyMessage = () => {
    setSelectedReplyMessage(null);
  };
  const handleReplySelection = (messageRecord) => {
    if (!messageRecord) {
      return;
    }

    setSelectedReplyMessage(messageRecord);
    focusMessageInput();
  };
  const handleCancelReply = () => {
    clearSelectedReplyMessage();
    focusMessageInput();
  };

  const upsertMessageRecord = (targetId, nextMessage) => {
    const comparableIds = new Set([
      ...getMessageIdentityKeys({ id: targetId }),
      ...getMessageIdentityKeys(nextMessage),
      ...(nextMessage?.tempId ? [String(nextMessage.tempId)] : []),
    ]);

    setMessages((currentMessages) => {
      const targetIndex = currentMessages.findIndex((message) =>
        getMessageIdentityKeys(message).some((messageId) => comparableIds.has(messageId))
      );

      if (targetIndex === -1) {
        return [...currentMessages, nextMessage];
      }

      return currentMessages.map((message, index) =>
        index === targetIndex ? { ...message, ...nextMessage } : message
      );
    });
  };

  const updateMessageStatus = (messageRecord, status) => {
    setMessages((currentMessages) =>
      currentMessages.map((currentMessage) =>
        String(currentMessage.id) === String(messageRecord.id)
          ? normalizeMessageData(
              {
                ...currentMessage,
                status,
              },
              {
                currentUserId: currentSenderId,
                fallback: currentMessage,
              }
            )
          : currentMessage
      )
    );
  };

  const replaceMessageRecord = (messageId, nextMessage) => {
    setMessages((currentMessages) =>
      currentMessages.map((currentMessage) =>
        String(currentMessage.id) === String(messageId) ? nextMessage : currentMessage
      )
    );
  };

  useEffect(() => {
    let isMounted = true;

    if (!contact?.chatId) {
      setMessage('');
      setIsEmojiPickerOpen(false);
      setMessages([]);
      setIsLoadingMessages(false);
      clearSelectedReplyMessage();
      return () => {
        isMounted = false;
      };
    }

    const loadMessages = async () => {
      setIsLoadingMessages(true);

      try {
        const chatMessages = await getMessages(contact.chatId, { skipGlobalLoading: true });

        if (isMounted) {
          setMessages(
            chatMessages.map((chatMessage) =>
              normalizeMessageData(chatMessage, {
                currentUserId: currentSenderId,
              })
            )
          );
        }
      } catch (error) {
        console.error('Error fetching messages:', error);

        if (isMounted) {
          setMessages([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingMessages(false);
        }
      }
    };

    setMessage('');
    setIsEmojiPickerOpen(false);
    clearSelectedReplyMessage();
    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [contact?.chatId, currentSenderId]);

  useEffect(() => {
    if (currentSenderId && currentSenderId !== 'me') {
      socketService.connect({
        userId: currentSenderId,
        token: localStorage.getItem('token') || localStorage.getItem('userToken') || '',
      });
    }
  }, [currentSenderId]);

  useEffect(() => {
    if (contact?.chatId && currentSenderId && receiverId) {
      socketService.joinChat({
        user1: currentSenderId,
        user2: receiverId,
      });
    }
  }, [contact?.chatId, currentSenderId, receiverId]);

  useEffect(() => {
    if (!contact?.chatId) {
      return undefined;
    }

    const matchesMessageId = (messageRecord, targetMessageId) => {
      const comparableTargetId = String(targetMessageId || '').trim();
      if (!comparableTargetId) return false;

      return [
        messageRecord?.id,
        messageRecord?.messageId,
        messageRecord?.clientMessageId,
        messageRecord?.tempId,
        messageRecord?.localId,
      ].some((value) => String(value || '').trim() === comparableTargetId);
    };

    const unsubscribeMessage = socketService.onMessage((incomingMessage) => {
      if (String(incomingMessage?.chatId || '') !== String(contact.chatId)) {
        return;
      }

      const normalizedIncomingMessage = normalizeMessageData(incomingMessage, {
        currentUserId: currentSenderId,
        fallback: {
          chatId: contact.chatId,
          direction:
            String(incomingMessage?.senderId || '') === String(currentSenderId) ? 'sent' : 'received',
          status: 'delivered',
        },
      });

      upsertMessageRecord(
        incomingMessage?.tempId || normalizedIncomingMessage.clientMessageId || normalizedIncomingMessage.id,
        normalizedIncomingMessage
      );

      if (String(normalizedIncomingMessage.senderId || '') !== String(currentSenderId)) {
        socketService.markAsRead({
          chatId: contact.chatId,
          userId: currentSenderId,
        });
      }
    });

    const unsubscribeDelivered = socketService.onMessageDelivered(({ messageId }) => {
      if (!messageId) return;

      setMessages((currentMessages) =>
        currentMessages.map((currentMessage) =>
          matchesMessageId(currentMessage, messageId)
            ? normalizeMessageData(
                {
                  ...currentMessage,
                  status: 'delivered',
                },
                {
                  currentUserId: currentSenderId,
                  fallback: currentMessage,
                }
              )
            : currentMessage
        )
      );
    });

    const unsubscribeRead = socketService.onMessagesRead(({ chatId: readChatId, messageIds }) => {
      if (String(readChatId || '') !== String(contact.chatId)) {
        return;
      }

      const readMessageIds = new Set(
        Array.isArray(messageIds) ? messageIds.map((messageId) => String(messageId)) : []
      );
      setMessages((currentMessages) =>
        currentMessages.map((currentMessage) =>
          String(currentMessage?.senderId || '') === String(currentSenderId) &&
          (
            !readMessageIds.size ||
            [
              currentMessage?.id,
              currentMessage?.messageId,
              currentMessage?.clientMessageId,
              currentMessage?.tempId,
              currentMessage?.localId,
            ]
              .map((value) => String(value || ''))
              .some((value) => readMessageIds.has(value))
          )
            ? normalizeMessageData(
                {
                  ...currentMessage,
                  status: 'read',
                },
                {
                  currentUserId: currentSenderId,
                  fallback: currentMessage,
                }
              )
            : currentMessage
        )
      );
    });

    return () => {
      unsubscribeMessage();
      unsubscribeDelivered();
      unsubscribeRead();
    };
  }, [contact?.chatId, currentSenderId]);

  useEffect(() => {
    const nextChatId = contact?.chatId || null;
    const isNewChat = previousChatIdRef.current !== nextChatId;

    previousChatIdRef.current = nextChatId;

    if (!nextChatId) {
      return;
    }

    const scrollBehavior =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : isNewChat
          ? 'auto'
          : 'smooth';

    const scrollToLatestMessage = () => {
      messagesEndRef.current?.scrollIntoView({
        behavior: scrollBehavior,
        block: 'end',
      });
    };

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(scrollToLatestMessage);
      return;
    }

    scrollToLatestMessage();
  }, [contact?.chatId, messages]);

  useEffect(() => {
    if (!isEmojiPickerOpen || typeof document === 'undefined') {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const target = event.target;
      if (emojiPickerRef.current?.contains(target) || emojiButtonRef.current?.contains(target)) {
        return;
      }
      setIsEmojiPickerOpen(false);
    };

    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        setIsEmojiPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isEmojiPickerOpen]);

  useEffect(() => {
    if (!selectedReplyMessage) {
      return;
    }

    const selectedReplyIds = new Set(getComparableMessageIds(selectedReplyMessage));
    const latestReplyMessage = messages.find((messageRecord) =>
      getComparableMessageIds(messageRecord).some((messageId) => selectedReplyIds.has(messageId))
    );

    if (latestReplyMessage) {
      if (latestReplyMessage !== selectedReplyMessage) {
        setSelectedReplyMessage(latestReplyMessage);
      }
      return;
    }

    clearSelectedReplyMessage();
  }, [messages, selectedReplyMessage]);

  const handleEmojiButtonClick = () => {
    setIsEmojiPickerOpen((currentState) => !currentState);
  };

  const syncInputSelection = (target) => {
    if (!target) {
      return;
    }

    const fallbackPosition = String(target.value || '').length;
    inputSelectionRef.current = {
      start:
        typeof target.selectionStart === 'number'
          ? target.selectionStart
          : fallbackPosition,
      end:
        typeof target.selectionEnd === 'number'
          ? target.selectionEnd
          : fallbackPosition,
    };
  };

  const handleInsertEmoji = (emoji) => {
    if (!emoji) {
      return;
    }

    const input = messageInputRef.current;
    const currentText = String(input?.value ?? message ?? '');
    const fallbackSelectionStart =
      typeof inputSelectionRef.current.start === 'number'
        ? inputSelectionRef.current.start
        : currentText.length;
    const fallbackSelectionEnd =
      typeof inputSelectionRef.current.end === 'number'
        ? inputSelectionRef.current.end
        : fallbackSelectionStart;
    const selectionStart =
      typeof input?.selectionStart === 'number'
        ? input.selectionStart
        : fallbackSelectionStart;
    const selectionEnd =
      typeof input?.selectionEnd === 'number'
        ? input.selectionEnd
        : fallbackSelectionEnd;
    const nextText = `${currentText.slice(0, selectionStart)}${emoji}${currentText.slice(selectionEnd)}`;
    const nextCursorPosition = selectionStart + emoji.length;
    inputSelectionRef.current = {
      start: nextCursorPosition,
      end: nextCursorPosition,
    };

    setMessage(nextText);
    setIsEmojiPickerOpen(false);

    const focusInput = () => {
      const nextInput = messageInputRef.current;
      if (!nextInput) {
        return;
      }

      nextInput.focus();
      nextInput.setSelectionRange(nextCursorPosition, nextCursorPosition);
      syncInputSelection(nextInput);
    };

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(focusInput);
      return;
    }

    focusInput();
  };

  const activeReplyMessage = selectedReplyMessage;
  const replyPreviewAuthorLabel = activeReplyMessage ? resolveReplySenderLabel(activeReplyMessage) : '';
  const replyPreviewText = activeReplyMessage ? resolveReplyPreviewText(activeReplyMessage) : '';

  if (!contact) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-gray-100 bg-white shadow-xl sm:rounded-[24px]">
        <div className="flex-1 flex flex-col items-center justify-center opacity-40">
          <h2 className="text-[32px] font-bold text-gray-800 leading-tight text-center px-10">
            Select a contact to start chatting
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-gray-100 bg-white shadow-xl sm:rounded-[24px]">
      <div className="flex-1 flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex h-16 flex-shrink-0 items-center justify-between gap-3 border-b border-gray-50 bg-white px-3 sm:h-20 sm:px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => onBack?.()}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E7ECF5] text-gray-500 transition-colors hover:bg-[#F8FAFC] hover:text-gray-700"
              aria-label="Back to chats"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"></path>
              </svg>
            </button>

            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-600 sm:h-11 sm:w-11">
              {contact.initials}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-gray-900 sm:text-base">{contact.name}</h3>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                <p className="text-[11px] text-green-500 font-medium">Online</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-gray-400">
            <button className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-gray-100 hover:text-gray-600" aria-label="More actions">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.8"></circle>
                <circle cx="12" cy="12" r="1.8"></circle>
                <circle cx="12" cy="19" r="1.8"></circle>
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-x-hidden overflow-y-auto bg-[#FBFDFF] px-3 py-4 scroll-smooth sm:px-4 sm:py-6 md:px-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <div className="self-center rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold text-gray-400 shadow-sm border border-gray-100">
              Today
            </div>

            {isLoadingMessages ? (
              <div className="rounded-[22px] border border-dashed border-[#DCE4FF] bg-white px-5 py-8 text-center text-sm text-gray-400">
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#DCE4FF] bg-white px-5 py-8 text-center text-sm text-gray-400">
                No messages yet. Start the conversation.
              </div>
            ) : (
              messages.map((chatMessage) => (
                <div key={chatMessage.id} onDoubleClick={() => handleReplySelection(chatMessage)}>
                  <MessageBubble
                    message={chatMessage}
                    direction={chatMessage.direction}
                  />
                </div>
              ))
            )}

            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
        </div>

        <div className="border-t border-gray-100 bg-white p-3 sm:p-5 md:p-6">
          <div className="relative mx-auto w-full max-w-4xl">
            {activeReplyMessage ? (
              <div className="mb-3 flex items-start gap-3 rounded-[18px] border border-[#E7ECF5] bg-[#F8FAFC] px-4 py-3">
                <span aria-hidden="true" className="mt-0.5 h-10 w-1 flex-shrink-0 rounded-full bg-[#2557FF]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2557FF]">
                        Replying to {replyPreviewAuthorLabel}
                      </p>
                      <p className="chatterly-emoji-text mt-1 break-words text-[13px] leading-5 text-[#475569]">
                        {replyPreviewText}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCancelReply}
                      aria-label="Cancel reply"
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-white hover:text-[#475569]"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const trimmedMessage = message.trim();
                const replyToPayload = buildReplyToPayload(activeReplyMessage);

                if (!trimmedMessage || isSending) {
                  return;
                }

                setIsSending(true);
                const timestamp = new Date().toISOString();
                const optimisticMessageId = `temp-${Date.now()}`;
                const optimisticMessage = normalizeMessageData(
                  {
                    id: optimisticMessageId,
                    clientMessageId: optimisticMessageId,
                    localId: optimisticMessageId,
                    chatId: contact.chatId,
                    sender: currentSender,
                    senderId: currentSender.id,
                    receiverId,
                    type: 'text',
                    direction: 'sent',
                    content: trimmedMessage,
                    replyTo: replyToPayload,
                    timestamp,
                    status: 'sending',
                  },
                  {
                    currentUserId: currentSenderId,
                  }
                );
                const socketPayload = {
                  chatId: contact.chatId,
                  type: 'text',
                  content: trimmedMessage,
                  sender: currentSender,
                  senderId: currentSender.id,
                  receiverId,
                  replyTo: replyToPayload,
                  timestamp,
                  status: 'sent',
                };

                setMessages((currentMessages) => [...currentMessages, optimisticMessage]);
                setMessage('');
                clearSelectedReplyMessage();

                try {
                  const ack = await socketService.sendMessage({
                    ...socketPayload,
                    clientMessageId: optimisticMessageId,
                    localId: optimisticMessageId,
                  });

                  const normalizedMessage = normalizeMessageData({
                    ...optimisticMessage,
                    id: ack?.messageId || optimisticMessage.id,
                    messageId: ack?.messageId || optimisticMessage.id,
                    tempId: optimisticMessageId,
                    clientMessageId: optimisticMessageId,
                    localId: optimisticMessageId,
                    type: optimisticMessage.type,
                    direction: optimisticMessage.direction,
                    content: optimisticMessage.content,
                    status: ack?.status || 'sent',
                  }, {
                    currentUserId: currentSenderId,
                    fallback: optimisticMessage,
                  });

                  replaceMessageRecord(optimisticMessageId, normalizedMessage);
                  onMessageSent?.(contact.chatId, normalizedMessage);
                } catch (error) {
                  console.error('Error sending message:', error);
                  updateMessageStatus(optimisticMessage, 'failed');
                } finally {
                  setIsSending(false);
                }
              }}
              className="flex w-full items-center gap-2 rounded-[18px] border border-[#E7ECF5] bg-[#F8FAFC] px-3 py-2 sm:gap-4 sm:rounded-[20px] sm:px-4"
            >
              <button type="button" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:text-gray-600" aria-label="Attach file">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21.44 11.05l-8.49 8.49a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 115.66 5.66l-9.2 9.19a2 2 0 11-2.82-2.83l8.49-8.48"></path>
                </svg>
              </button>

              <input
                ref={messageInputRef}
                type="text"
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  syncInputSelection(event.target);
                }}
                onSelect={(event) => syncInputSelection(event.currentTarget)}
                onClick={(event) => syncInputSelection(event.currentTarget)}
                onKeyUp={(event) => syncInputSelection(event.currentTarget)}
                onFocus={(event) => syncInputSelection(event.currentTarget)}
                placeholder={`Message ${contact.name}...`}
                className="chatterly-emoji-text min-w-0 flex-1 bg-transparent py-2 text-sm text-gray-700 outline-none placeholder:text-gray-400"
              />

              <button
                ref={emojiButtonRef}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleEmojiButtonClick}
                aria-label="Emoji"
                aria-pressed={isEmojiPickerOpen}
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${isEmojiPickerOpen ? 'bg-[#E8EEF9] text-[#2557FF]' : 'text-gray-400 hover:bg-[#EEF2F7] hover:text-gray-600'}`}
              >
                <EmojiIcon stroke={isEmojiPickerOpen ? '#2557FF' : '#64748B'} />
              </button>

              <button
                type="submit"
                disabled={!message.trim() || isSending}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#2557FF] text-white shadow-md transition-all hover:bg-[#1E4DFF] active:scale-95 disabled:cursor-not-allowed disabled:bg-[#AFC2FF]"
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </form>

            <EmojiPicker
              isOpen={isEmojiPickerOpen}
              pickerRef={emojiPickerRef}
              placement="inline-below"
              onEmojiSelect={handleInsertEmoji}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
