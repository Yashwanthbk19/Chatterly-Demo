import React, { useState } from 'react';

const NotificationBrandIcon = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M10.412 24.579L10.979 21.677C8.991 20.465 7.702 18.365 7.702 15.897C7.702 11.999 11.305 8.839 15.75 8.839H21.962C26.407 8.839 30.01 11.999 30.01 15.897C30.01 19.794 26.407 22.954 21.962 22.954H14.813L10.412 24.579Z"
      stroke="currentColor"
      strokeWidth="2.45"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="15.257" cy="15.892" r="1.522" fill="currentColor" />
    <circle cx="19.832" cy="15.892" r="1.522" fill="currentColor" />
    <circle cx="24.406" cy="15.892" r="1.522" fill="currentColor" />
  </svg>
);

const CloseIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M7 7L23 23" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    <path d="M23 7L7 23" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
  </svg>
);

const SendIcon = () => (
  <svg width="39" height="39" viewBox="0 0 39 39" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M6.212 33.334C5.154 33.849 3.983 32.871 4.31 31.742L8.467 19.497L4.31 7.251C3.983 6.123 5.154 5.145 6.212 5.66L33.245 18.942C34.392 19.505 34.392 21.14 33.245 21.704L6.212 33.334Z"
      fill="currentColor"
    />
  </svg>
);

export default function NotificationPreviewCard({
  appName = 'Chatterly',
  senderName = 'Ajith',
  messagePreview = 'Hi Bro, Can we connect for a quick call?',
  replyPlaceholder = 'Type a message',
  onOpenChat,
}) {
  const [replyText, setReplyText] = useState('');
  const canSendReply = replyText.trim().length > 0;
  const isInteractive = typeof onOpenChat === 'function';

  const handleOpenChat = () => {
    if (!isInteractive) return;
    onOpenChat();
  };

  const handleCardKeyDown = (event) => {
    if (!isInteractive) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpenChat();
    }
  };

  const stopNotificationOpen = (event) => {
    event.stopPropagation();
  };

  const stopNotificationOpenFromKeyboard = (event) => {
    event.stopPropagation();
  };

  return (
    <section
      className={`w-full max-w-[700px] rounded-[46px] border border-white/80 bg-white px-6 pb-8 pt-7 shadow-[0_18px_55px_rgba(177,190,210,0.42)] transition-transform duration-200 sm:px-[34px] sm:pb-[34px] sm:pt-[38px] ${
        isInteractive ? 'cursor-pointer hover:-translate-y-0.5 active:scale-[0.99]' : ''
      }`}
      onClick={handleOpenChat}
      onKeyDown={handleCardKeyDown}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? `Open chat with ${senderName}` : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-[12px] text-[#181818]">
          <NotificationBrandIcon />
          <span className="text-[24px] font-medium tracking-[-0.04em] text-[#273248] sm:text-[27px]">
            {appName}
          </span>
        </div>

        <button
          type="button"
          className="mt-1 flex h-10 w-10 items-center justify-center rounded-full text-[#A3AFC4] transition-colors hover:text-[#7F8EA8]"
          aria-label="Dismiss notification preview"
          onClick={stopNotificationOpen}
          onKeyDown={stopNotificationOpenFromKeyboard}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="mt-[28px]">
        <h1 className="text-[24px] font-semibold leading-[1.24] tracking-[-0.045em] text-[#273248] sm:text-[31px]">
          {senderName}
        </h1>
        <p className="mt-[18px] text-[18px] font-normal leading-[1.32] tracking-[-0.04em] text-[#5D6C85] sm:text-[26px]">
          {messagePreview}
        </p>
      </div>

      <div
        className="mt-[30px] flex min-h-[72px] items-center rounded-full border border-[#D5E0F0] bg-[#FCFDFF] px-[16px] py-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
        onClick={stopNotificationOpen}
        onKeyDown={stopNotificationOpenFromKeyboard}
      >
        <input
          type="text"
          placeholder={replyPlaceholder}
          value={replyText}
          onChange={(event) => setReplyText(event.target.value)}
          className="h-[50px] flex-1 bg-transparent pr-3 text-[18px] font-normal tracking-[-0.04em] text-[#273248] outline-none placeholder:text-[#9BA9C1] sm:text-[24px]"
        />

        <button
          type="button"
          className={`flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-full transition-all ${
            canSendReply
              ? 'cursor-pointer text-[#4E67FF] hover:scale-[1.03] hover:text-[#3C57FF]'
              : 'cursor-not-allowed text-[#B7C4FF]'
          }`}
          aria-label="Send reply"
          aria-disabled={!canSendReply}
          disabled={!canSendReply}
        >
          <SendIcon />
        </button>
      </div>
    </section>
  );
}
