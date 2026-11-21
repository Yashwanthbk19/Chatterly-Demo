import React from 'react';
import MessageText from './MessageText';
import {
  getMessageStatusLabel,
  isFailedMessageStatus,
  isPendingMessageStatus,
  normalizeMessageStatus,
  resolveMessageMediaUrl,
} from '../utils/message';

const formatAudioDuration = (value) => {
  const normalizedValue = Number(value);
  if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
    return '';
  }

  const totalSeconds = Math.round(normalizedValue);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatFileSize = (value) => {
  const normalizedValue = Number(value || 0);
  if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
    return '';
  }

  if (normalizedValue >= 1024 * 1024) {
    return `${(normalizedValue / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (normalizedValue >= 1024) {
    return `${Math.round(normalizedValue / 1024)} KB`;
  }

  return `${normalizedValue} B`;
};

const getTickStatus = (status) => {
  const normalizedStatus = normalizeMessageStatus(status, 'sent');

  if (normalizedStatus === 'read') {
    return 'read';
  }

  if (normalizedStatus === 'delivered') {
    return 'delivered';
  }

  if (normalizedStatus === 'sent') {
    return 'sent';
  }

  return null;
};

const TickIcon = ({ status }) => {
  const color = status === 'read' ? '#60A5FA' : '#9CA3AF';

  if (status === 'sent') {
    return (
      <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M1 5L4.5 8.5L13 1"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width="22" height="10" viewBox="0 0 22 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1 5L4.5 8.5L13 1" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 5L11.5 8.5L20 1" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const ForwardedMessageLabel = () => (
  <div className="mb-1 text-[11px] font-semibold leading-none opacity-70">
    Forwarded
  </div>
);

export default function MessageBubble({ message, direction, onRetry, isRetrying = false }) {
  const resolvedDirection = direction || message.direction || 'received';
  const isSent = resolvedDirection === 'sent';
  const normalizedStatus = normalizeMessageStatus(message.status, isSent ? 'sent' : 'read');
  const hasFailed = isFailedMessageStatus(normalizedStatus);
  const isRetryState = normalizedStatus === 'retrying' || isRetrying;
  const hasPendingState = isPendingMessageStatus(normalizedStatus);
  const statusLabel = hasPendingState ? getMessageStatusLabel(normalizedStatus) : '';
  const tickStatus = isSent && !hasFailed && !hasPendingState ? getTickStatus(normalizedStatus) : null;
  const isPendingSentMessage = isSent && hasPendingState;
  const mediaUrl = resolveMessageMediaUrl(message, {}, message.type);
  const isImageMessage = message.type === 'image' && Boolean(mediaUrl);
  const isVideoMessage = message.type === 'video' && Boolean(mediaUrl);
  const isAudioMessage = message.type === 'audio';
  const isFileMessage = message.type === 'file';
  const messageText = [message.text, message.message, message.type === 'text' ? message.content : '']
    .find((value) => typeof value === 'string' && value.trim()) || '';
  const renderLinkedText = (text) => (
    <MessageText
      text={text}
      linkClassName={isSent && !isPendingSentMessage
        ? 'font-semibold text-white underline decoration-white/60 underline-offset-2'
        : 'font-semibold text-[#2557FF] underline decoration-[#BFDBFE] underline-offset-2'}
    />
  );
  const mediaCaption = String(message.caption || '').trim();
  const audioDuration = formatAudioDuration(message.duration);
  const fileUrl = String(message.fileUrl || (typeof message.content === 'string' ? message.content : '') || '').trim();
  const fileName = String(message.fileName || 'Document').trim() || 'Document';
  const fileSize = formatFileSize(message.fileSize);
  const isForwardedMessage = Boolean(message.isForwarded);

  return (
    <div className={`flex w-full ${isSent ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex min-w-0 max-w-[90%] flex-col sm:max-w-[80%] ${isSent ? 'items-end' : 'items-start'}`}>
        <div
          className={`w-fit max-w-full rounded-[22px] border px-4 py-3 shadow-sm ${
            isPendingSentMessage
              ? 'border-dashed border-[#B9CCFF] bg-[#EEF4FF] text-[#2142A6] rounded-br-md'
              : isSent
              ? 'bg-[#2557FF] text-white border-[#2557FF] rounded-br-md'
              : 'bg-white text-[#1F2937] border-[#E8EDF5] rounded-bl-md'
          }`}
        >
          {isForwardedMessage ? <ForwardedMessageLabel /> : null}
          {isImageMessage ? (
            <div className="space-y-3">
              <img src={mediaUrl} alt={mediaCaption || 'Shared image'} className="max-h-80 w-full rounded-2xl object-cover" />
              {mediaCaption ? <p className="chatterly-emoji-text text-sm leading-relaxed break-words">{renderLinkedText(mediaCaption)}</p> : null}
            </div>
          ) : isVideoMessage ? (
            <div className="space-y-3">
              <video src={mediaUrl} controls className="max-h-80 w-full rounded-2xl" />
              {mediaCaption ? <p className="chatterly-emoji-text text-sm leading-relaxed break-words">{renderLinkedText(mediaCaption)}</p> : null}
            </div>
          ) : isAudioMessage ? (
            <div className="min-w-[220px] space-y-3">
              <div
                className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2 ${
                  isPendingSentMessage
                    ? 'bg-[#DBE7FF] text-[#2142A6]'
                    : isSent
                    ? 'bg-white/15 text-white'
                    : 'bg-[#F6F8FC] text-[#1F2937]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full ${
                      isPendingSentMessage
                        ? 'bg-[#C4D8FF]'
                        : isSent
                        ? 'bg-white/20'
                        : 'bg-white shadow-sm'
                    }`}
                    aria-hidden="true"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3.5a3.5 3.5 0 0 0-3.5 3.5v5a3.5 3.5 0 1 0 7 0V7A3.5 3.5 0 0 0 12 3.5Z" />
                      <path d="M6.5 10.5a5.5 5.5 0 0 0 11 0" />
                      <path d="M12 16v3.5" />
                      <path d="M9 19.5h6" />
                    </svg>
                  </span>
                  <span className="text-sm font-semibold">Voice message</span>
                </div>
                {audioDuration ? <span className="text-xs font-medium">{audioDuration}</span> : null}
              </div>
              {mediaUrl ? (
                <audio src={mediaUrl} controls preload="metadata" className="h-10 w-full min-w-[220px]" />
              ) : (
                <p className="text-sm leading-relaxed">Voice message unavailable</p>
              )}
              {mediaCaption ? <p className="chatterly-emoji-text text-sm leading-relaxed break-words">{renderLinkedText(mediaCaption)}</p> : null}
            </div>
          ) : isFileMessage ? (
            <div className="min-w-[220px] space-y-3">
              <div
                className={`flex items-start justify-between gap-3 rounded-2xl px-3 py-3 ${
                  isPendingSentMessage
                    ? 'bg-[#DBE7FF] text-[#2142A6]'
                    : isSent
                    ? 'bg-white/15 text-white'
                    : 'bg-[#F6F8FC] text-[#1F2937]'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{fileName}</p>
                  {fileSize ? <p className="mt-1 text-xs opacity-80">{fileSize}</p> : null}
                </div>
                {fileUrl ? (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isPendingSentMessage
                        ? 'bg-[#C4D8FF] text-[#2142A6]'
                        : isSent
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-[#2557FF] shadow-sm'
                    }`}
                  >
                    Open
                  </a>
                ) : null}
              </div>
              {mediaCaption ? <p className="chatterly-emoji-text text-sm leading-relaxed break-words">{renderLinkedText(mediaCaption)}</p> : null}
            </div>
          ) : (
            <p className="chatterly-emoji-text text-sm leading-relaxed break-words">{renderLinkedText(messageText)}</p>
          )}
        </div>

        <div
          className={`mt-2 flex items-center gap-1 text-[11px] font-medium leading-none ${
            isPendingSentMessage
              ? 'justify-end text-[#4C6CB8]'
              : isSent
                ? 'justify-end text-gray-400'
                : 'justify-start text-gray-400'
          }`}
        >
          {statusLabel ? (
            <>
              <span>{message.time}</span>
              <span className="rounded-full bg-[#E0EAFF] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#2557FF]">
                {statusLabel}
              </span>
            </>
          ) : (
            <>
              <span>{message.time}</span>
              {tickStatus ? <TickIcon status={tickStatus} /> : null}
            </>
          )}
        </div>

        {hasFailed ? (
          <div className="mt-2 flex items-center justify-end gap-3">
            <span className="text-[11px] font-semibold text-red-500">Failed to send</span>
            <button
              type="button"
              onClick={onRetry}
              disabled={!onRetry || isRetryState}
              className="rounded-full border border-red-200 px-3 py-1 text-[11px] font-semibold text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-100 disabled:text-red-300"
            >
              {isRetryState ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
