import React from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationPreviewCard from '../components/NotificationPreviewCard';
import { SIMULATED_CHAT_NOTIFICATION, normalizeChatNotification } from '../utils/notification';
 
export default function NotificationPreviewPage() {
  const navigate = useNavigate();
  const notification = normalizeChatNotification(SIMULATED_CHAT_NOTIFICATION);
 
  const handleOpenChat = () => {
    const targetChatId = String(notification.chatId || notification.senderId || '').trim();
 
    if (!targetChatId) return;
 
    navigate(`/chat/${targetChatId}`, {
      state: {
        notificationPayload: notification,
      },
    });
  };
 
  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#F6F6F7_0%,#EEF1F4_100%)] px-4 pb-10 pt-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-[760px] justify-center">
        <NotificationPreviewCard
          senderName={notification.senderName}
          messagePreview={notification.text}
          onOpenChat={handleOpenChat}
        />
      </div>
    </main>
  );
}
 