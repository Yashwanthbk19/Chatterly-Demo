export type IncomingCall = {
  conference?: boolean;
  callId: string;
  chatId: string;
  callerId: string;
  receiverId?: string;
  callerName: string;
  callerProfilePic?: string | null;
  type: 'audio' | 'video';
  status: 'calling' | 'connecting' | 'connected' | 'rejected' | 'missed';
  createdAt?: string;
  connectedAt?: string;
  muted?: boolean;
  held?: boolean;
  heldBySystem?: boolean;
  speaker?: boolean;
  videoEnabled?: boolean;
};
