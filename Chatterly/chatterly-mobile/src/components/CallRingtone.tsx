import {useEffect, useRef} from 'react';
import {
  setCallRingtoneState,
  stopCallRingtone,
  type CallRingtoneOwner,
  type CallRingtoneState,
} from '../services/callRingtone';
import type {NotificationTone} from '../services/notificationPreferencesApi';

export function CallRingtone({state, tone = 'Default', speaker = false}: {state: CallRingtoneState; tone?: NotificationTone; speaker?: boolean}) {
  const owner = useRef<CallRingtoneOwner>({}).current;

  useEffect(() => {
    setCallRingtoneState(owner, state, tone, speaker).catch(() => undefined);
    return () => stopCallRingtone(owner);
  }, [owner, state, tone, speaker]);

  return null;
}
