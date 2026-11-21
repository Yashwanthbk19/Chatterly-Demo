import {useEffect} from 'react';
import {AppState} from 'react-native';
import {activateKeepAwakeAsync, deactivateKeepAwake} from 'expo-keep-awake';
let nextTag = 0;
export function useCallKeepAwake(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const tag = `video-call-${++nextTag}`;
    let disposed = false;
    let queue = Promise.resolve();
    const update = (awake: boolean) => {
      queue = queue.then(async () => {
        if (awake && !disposed) await activateKeepAwakeAsync(tag);
        else await deactivateKeepAwake(tag);
      }).catch(() => undefined);
    };
    update(AppState.currentState !== 'background');
    const subscription = AppState.addEventListener('change', state => update(state !== 'background'));
    return () => { disposed = true; subscription.remove(); update(false); };
  }, [enabled]);
}
