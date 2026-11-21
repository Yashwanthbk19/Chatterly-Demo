import { useCallback, useSyncExternalStore } from 'react';
import {
  getUiLanguage,
  setUiLanguage,
  subscribeToUiLanguage,
  translateUiText,
} from '../utils/language';

export const useLanguage = () => {
  const language = useSyncExternalStore(subscribeToUiLanguage, getUiLanguage, getUiLanguage);
  const t = useCallback((text) => translateUiText(text, language), [language]);

  return {
    language,
    setLanguage: setUiLanguage,
    t,
  };
};

