import { useCallback } from 'react';

const VIDEO_UPLOAD_MAX_SIZE_BYTES = 512 * 1024 * 1024;

const formatVideoUploadSize = (size = 0) => {
  const normalizedSize = Number(size || 0);
  if (normalizedSize >= 1024 * 1024) return `${Math.round(normalizedSize / (1024 * 1024))}MB`;
  if (normalizedSize >= 1024) return `${Math.round(normalizedSize / 1024)}KB`;
  return `${normalizedSize}B`;
};

const simulateVideoCompression = async (file, onStageChange) => {
  onStageChange?.('compressing');

  // Simulate compression delay (1-2 seconds)
  await new Promise((resolve) => {
    setTimeout(resolve, Math.random() * 1000 + 1000);
  });

  // Return compressed file object
  return {
    compressionRatio: Math.random() * 30 + 5, // 5-35% compression
    compressedSize: Math.round(file.size * (1 - (Math.random() * 0.3 + 0.05))),
    originalSize: file.size,
  };
};

export const useVideoUploader = () => {
  /**
   * Process video file - creates blob URL for preview
   * NEVER converts to base64 (too big for localStorage)
   */
  const processVideoFile = useCallback((file) => {
    if (!file) return null;

    const mimeType = String(file.type || '').toLowerCase();
    if (!mimeType.startsWith('video/')) {
      return { error: 'Please select a valid video file.' };
    }

    if (file.size > VIDEO_UPLOAD_MAX_SIZE_BYTES) {
      return { error: `Video must be under ${formatVideoUploadSize(VIDEO_UPLOAD_MAX_SIZE_BYTES)}.` };
    }

    // Create blob URL for preview (lightweight, ~100 bytes)
    const previewUrl = URL.createObjectURL(file);

    return {
      file,              // Actual File object for upload
      previewUrl,        // Blob URL for instant display
      mediaUrl: previewUrl,
      name: file.name,
      mimeType: file.type,
      type: 'video',
      kind: 'Video',
      size: file.size,
    };
  }, []);

  /**
   * Cleanup blob URL to prevent memory leaks
   */
  const revokeVideoUrl = useCallback((url) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }, []);

  /**
   * Simulate video compression
   */
  const compressVideo = useCallback(async (file, onStageChange) => {
    return simulateVideoCompression(file, onStageChange);
  }, []);

  return {
    processVideoFile,
    revokeVideoUrl,
    compressVideo,
  };
};

export default useVideoUploader;
