import React from 'react';
import VideoMessageBubble from './VideoMessageBubble';
import { resolveMessageMediaUrl } from '../utils/message';
import { buildUniqueMediaSources, isLikelyVideoSource } from '../utils/video';

const VideoMessageAdapter = ({
  msg,
  isSentGroup,
  bubbleShapeClass,
  formatTime,
  captionContent = null,
  replyPreview = null,
  senderLabel = null,
  footerContent = null,
  isForwarded = false,
  onPreview,
}) => {
  const safeContentVideoSrc = isLikelyVideoSource(msg?.content, msg?.mimeType)
    ? String(msg.content).trim()
    : '';
  const sourceCandidates = buildUniqueMediaSources([
    resolveMessageMediaUrl(msg, {}, 'video'),
    msg?.mediaUrl,
    msg?.videoUrl,
    msg?.previewUrl,
    msg?.url,
    msg?.fileUrl,
    safeContentVideoSrc,
  ]);
  const videoSrc = sourceCandidates[0] || '';
  const caption = msg.caption || '';

  return (
    <VideoMessageBubble
      key={sourceCandidates.join('|') || videoSrc || msg?.id || msg?.messageId || msg?.localId || 'video-message'}
      src={videoSrc}
      sourceCandidates={sourceCandidates}
      mimeType={msg?.mimeType || ''}
      fileName={msg?.fileName || msg?.name || ''}
      caption={caption}
      captionContent={captionContent}
      replyPreview={replyPreview}
      senderLabel={senderLabel}
      footerContent={footerContent}
      hideTimestamp
      isForwarded={isForwarded}
      isSent={isSentGroup}
      bubbleShapeClass={bubbleShapeClass}
      timestamp={msg.timestamp || msg.createdAt}
      status={msg.status || 'sent'}
      formatTime={formatTime}
      onPreview={onPreview}
    />
  );
};

export default React.memo(VideoMessageAdapter);
