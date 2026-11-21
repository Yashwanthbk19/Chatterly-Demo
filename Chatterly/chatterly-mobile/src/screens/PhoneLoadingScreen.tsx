import React, {useEffect} from 'react';
import {WelcomeScreen} from './WelcomeScreen';

type Props = {onBack: () => void; onReady: () => void};
const MINIMUM_LOADING_TIME_MS = 1800;

export function PhoneLoadingScreen({onReady}: Props): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onReady, MINIMUM_LOADING_TIME_MS);
    return () => clearTimeout(timer);
  }, [onReady]);
  return <WelcomeScreen loadingMethod="phone" onContinue={() => undefined} onGoogle={() => undefined} />;
}
