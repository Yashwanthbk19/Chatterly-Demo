export type AttachmentMediaType = 'image' | 'video';
// Upload names preserve the original "base name" before compression.

export type AttachmentMedia = {
  id: string;
  uri: string;
  fileName: string;
  mimeType: string;
  type: AttachmentMediaType;
  width?: number;
  height?: number;
  duration?: number;
};

export type MediaTransferState = {
  phase: 'idle' | 'compressing' | 'uploading' | 'delivering';
  progress: number;
  current: number;
  total: number;
};
