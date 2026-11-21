import React, {useEffect} from 'react';
import {WelcomeScreen} from './WelcomeScreen';

type Props = {onBack: () => void; onReady: () => void};
const MINIMUM_LOADING_TIME_MS = 1800;

export function EmailLoadingScreen({onReady}: Props): React.JSX.Element {
  useEffect(() => {
    // Do not block navigation on a health check. The actual OTP request still
    // reports any backend error where the user can act on it.
    const timer = setTimeout(onReady, MINIMUM_LOADING_TIME_MS);
    return () => clearTimeout(timer);
  }, [onReady]);
  return <WelcomeScreen loadingMethod="email" onContinue={() => undefined} onGoogle={() => undefined} />;
}
