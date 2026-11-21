import {useEffect, useState} from 'react';
import {
  loadStoredNotificationSettings,
  subscribeToNotificationSettings,
  type NotificationSettings,
} from '../services/notificationPreferencesApi';

/** Keep incoming alerts hidden until this call's saved preference is known. */
export function useIncomingCallNotificationSettings(callId?: string): NotificationSettings | null {
  const [loaded, setLoaded] = useState<{callId: string; settings: NotificationSettings} | null>(null);

  useEffect(() => {
    if (!callId) { return; }
    let active = true;
    let changed = false;
    const unsubscribe = subscribeToNotificationSettings(settings => {
      changed = true;
      if (active) { setLoaded({callId, settings}); }
    });
    loadStoredNotificationSettings().then(settings => {
      // A settings change during the read must win over the older device copy.
      if (active && !changed) { setLoaded({callId, settings}); }
    }).catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [callId]);

  return loaded && loaded.callId === callId ? loaded.settings : null;
}
