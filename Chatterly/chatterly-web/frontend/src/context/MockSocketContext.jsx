import React from 'react';
import { SocketProvider, useSocket } from './SocketContext';

// ✅ 2. Provide actual function wrappers so Vite Fast Refresh doesn't crash!
export function MockSocketProvider({ children }) {
  return <SocketProvider>{children}</SocketProvider>;
}

export function useMockSocket() {
  return useSocket();
}

// Ensure the real ones are still exported if other files need them directly from here
export { SocketProvider, useSocket };