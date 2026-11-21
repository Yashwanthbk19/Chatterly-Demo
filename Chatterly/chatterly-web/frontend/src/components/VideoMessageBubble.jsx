import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildUniqueMediaSources,
  canBrowserPlayVideoType,
  resolveVideoMimeType,
} from '../utils/video';

const VideoMessageBubble = ({ 
  src, 
  sourceCandidates = [],
  mimeType = '',
  fileName = '',
  caption, 
  captionContent = null,
  isSent, 
  bubbleShapeClass,
  timestamp,
  status,
  formatTime,
  replyPreview = null,
  senderLabel = null,
  footerContent = null,
  hideTimestamp = false,
  isForwarded = false,
  onPreview,
}) => {
  const videoRef = useRef(null);
  const clickTimeoutRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [loadState, setLoadState] = useState(src ? 'loading' : 'idle');

  const isPending = status === 'pending' || status === 'sending';
  const isFailed = status === 'failed';
  const normalizedSourceCandidates = buildUniqueMediaSources([src, ...sourceCandidates]);
  const activeSrc = normalizedSourceCandidates[activeSourceIndex] || '';
  const activeMimeType = resolveVideoMimeType({
    mimeType,
    src: activeSrc,
    fileName,
  });
  const isBrowserSupported = canBrowserPlayVideoType(activeMimeType);

  useEffect(() => () => {
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
    }
  }, []);

  const handlePlayClick = useCallback(() => {
    if (!videoRef.current || loadState !== 'ready') return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  }, [isPlaying, loadState]);

  const clearClickToggleTimeout = useCallback(() => {
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
  }, []);

  const scheduleVideoToggle = useCallback(() => {
    clearClickToggleTimeout();
    clickTimeoutRef.current = window.setTimeout(() => {
      clickTimeoutRef.current = null;
      handlePlayClick();
    }, 220);
  }, [clearClickToggleTimeout, handlePlayClick]);

  const handlePlayButtonClick = useCallback((event) => {
    event.stopPropagation();
    if (isPending || isFailed || loadState !== 'ready') return;
    scheduleVideoToggle();
  }, [isFailed, isPending, loadState, scheduleVideoToggle]);

  const handleVideoSurfaceClick = useCallback((event) => {
    event.stopPropagation();
    if (isPending || isFailed || loadState !== 'ready') return;
    scheduleVideoToggle();
  }, [isFailed, isPending, loadState, scheduleVideoToggle]);

  const handleVideoSurfaceDoubleClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    clearClickToggleTimeout();
    if (typeof onPreview === 'function') {
      onPreview();
    }
  }, [clearClickToggleTimeout, onPreview]);

  const handleVideoSurfaceKeyDown = useCallback((event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (isPending || isFailed || loadState !== 'ready') return;
    handlePlayClick();
  }, [handlePlayClick, isFailed, isPending, loadState]);

  const fallbackMessage = !activeSrc
    ? 'Video unavailable'
    : !isBrowserSupported
      ? 'This video format is not supported in this browser.'
      : 'Unable to load this video.';

  if (!activeSrc || loadState === 'error') {
    return (
      <div className={`relative w-fit max-w-[80vw] overflow-hidden border px-[18px] py-[11px] sm:max-w-[72%] lg:max-w-[460px] ${isSent ? 'border-[#AA73FF] bg-[linear-gradient(90deg,#8D44F7_0%,#B534F6_100%)] text-white' : 'border-[#D7E2EE] bg-white text-[#45546B]'} ${bubbleShapeClass}`}>
        {senderLabel}
        {isForwarded ? (
          <div className="mb-1 text-[11px] font-semibold leading-none opacity-70">
            Forwarded
          </div>
        ) : null}
        {replyPreview}
        <div className="flex items-center gap-2 py-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M10 8l6 4-6 4V8z" />
          </svg>
          <span className="text-sm">{fallbackMessage}</span>
        </div>
        {caption && <p className="mt-3 break-words text-sm [overflow-wrap:anywhere]">{caption}</p>}
        {footerContent}
        {!hideTimestamp ? (
          <div className={`flex items-center gap-1 mt-2 text-[12px] font-medium ${isSent ? 'text-white/70' : 'text-[#93A4C0]'}`}>
            <span>{formatTime(timestamp)}</span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`relative w-fit max-w-[80vw] overflow-hidden sm:max-w-[72%] lg:max-w-[460px] ${isSent ? 'bg-[linear-gradient(90deg,#8D44F7_0%,#B534F6_100%)]' : 'bg-white'} ${bubbleShapeClass}`}>
      {senderLabel ? (
        <div className="px-[18px] pt-[11px]">
          {senderLabel}
        </div>
      ) : null}
      {isForwarded ? (
        <div className={`px-[18px] ${senderLabel ? 'pt-1.5' : 'pt-[11px]'} text-[11px] font-semibold leading-none opacity-70 ${
          isSent ? 'text-white' : 'text-[#45546B]'
        }`}>
          Forwarded
        </div>
      ) : null}
      {replyPreview ? (
        <div className={`px-2 ${isForwarded ? 'pt-1.5' : 'pt-2'}`}>
          {replyPreview}
        </div>
      ) : null}
      {/* Video Container */}
      <div 
        className="relative cursor-pointer overflow-hidden bg-black"
        style={{ borderRadius: 'inherit', minWidth: 'min(240px, 100%)', maxWidth: '100%' }}
        aria-busy={loadState === 'loading'}
        onClick={handleVideoSurfaceClick}
        onDoubleClick={handleVideoSurfaceDoubleClick}
        onKeyDown={handleVideoSurfaceKeyDown}
        role="button"
        tabIndex={0}
        aria-label={onPreview ? `${isPlaying ? 'Pause' : 'Play'} video, double click to open full screen` : isPlaying ? 'Pause video' : 'Play video'}
      >
        {/* Pending/Sending overlay */}
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-sm" style={{ borderRadius: 'inherit' }}>
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span className="text-xs font-medium text-white/90">
                {status === 'sending' ? 'Sending...' : 'Queued...'}
              </span>
            </div>
          </div>
        )}

        {/* Failed overlay */}
        {isFailed && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm" style={{ borderRadius: 'inherit' }}>
            <div className="flex flex-col items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-xs font-medium text-white/90">Failed to send</span>
            </div>
          </div>
        )}

        {loadState === 'loading' && !isPending && !isFailed && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 backdrop-blur-[2px]" style={{ borderRadius: 'inherit' }}>
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span className="text-xs font-medium text-white/90">
                Loading video...
              </span>
            </div>
          </div>
        )}

        <video
          key={activeSrc}
          ref={videoRef}
          preload="metadata"
          playsInline
          autoPlay={false}
          muted={false}
          controls={false}
          onLoadStart={() => setLoadState('loading')}
          onCanPlay={() => setLoadState('ready')}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={() => {
            setIsPlaying(false);
            if (activeSourceIndex < normalizedSourceCandidates.length - 1) {
              setActiveSourceIndex(activeSourceIndex + 1);
              setLoadState('loading');
              return;
            }
            setLoadState('error');
          }}
          className={`block max-h-[400px] w-full object-contain transition-opacity duration-200 ${isPending ? 'opacity-70' : ''} ${loadState === 'ready' ? 'opacity-100' : 'opacity-0'}`}
          style={{ borderRadius: 'inherit', minHeight: '180px', display: 'block' }}
        >
          <source src={activeSrc} type={activeMimeType || undefined} />
        </video>
        
        {/* Play button overlay */}
        {!isPlaying && loadState === 'ready' && !isPending && !isFailed && (
          <button
            type="button"
            onClick={handlePlayButtonClick}
            onDoubleClick={handleVideoSurfaceDoubleClick}
            className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/40"
            style={{ borderRadius: 'inherit' }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm transition-transform hover:scale-105">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#8B5CF6">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}
      </div>

      {/* Caption */}
      {captionContent ? (
        <div className={`px-[18px] pb-[6px] pt-[10px] text-[15px] leading-[1.35] break-words [overflow-wrap:anywhere] ${
          isSent ? 'text-white' : 'text-[#45546B]'
        }`}>
          {captionContent}
        </div>
      ) : caption ? (
        <p className={`px-[18px] pb-[6px] pt-[10px] text-[15px] leading-[1.35] break-words [overflow-wrap:anywhere] ${
          isSent ? 'text-white' : 'text-[#45546B]'
        }`}>
          {caption}
        </p>
      ) : null}

      {/* Timestamp & Status */}
      {footerContent ? (
        <div className="px-[18px] pb-[11px] pt-[6px]">
          {footerContent}
        </div>
      ) : null}
      {!hideTimestamp ? (
      <div className={`flex items-center gap-1 px-[18px] pb-[11px] pt-[6px] text-[12px] font-medium ${
        isSent ? 'text-white/70' : 'text-[#93A4C0]'
      }`}>
        <span>{formatTime(timestamp)}</span>
        {isPending && <span className="ml-1 text-[10px] text-amber-400">(queued)</span>}
        {isFailed && <span className="ml-1 text-[10px] text-red-400">(failed)</span>}
      </div>
      ) : null}
    </div>
  );
};

export default React.memo(VideoMessageBubble);
