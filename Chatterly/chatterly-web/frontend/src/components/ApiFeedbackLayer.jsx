import React, { useEffect, useRef, useState } from 'react';
import { subscribeToApiActivity, subscribeToApiErrors } from '../api/axios';

export default function ApiFeedbackLayer({ children }) {
  const [apiState, setApiState] = useState({ isLoading: false, requestCount: 0 });
  const [apiError, setApiError] = useState(null);
  const [isLoaderVisible, setIsLoaderVisible] = useState(false);
  const loaderDelayTimeoutRef = useRef(null);

  useEffect(() => {
    const unsubscribeActivity = subscribeToApiActivity((nextState) => {
      setApiState(nextState);
    });
    const unsubscribeErrors = subscribeToApiErrors((error) => {
      setApiError(error);
    });
    const clearErrorForLogout = () => {
      setApiError(null);
    };

    window.addEventListener('chatterly:logout-start', clearErrorForLogout);

    return () => {
      unsubscribeActivity();
      unsubscribeErrors();
      window.removeEventListener('chatterly:logout-start', clearErrorForLogout);
    };
  }, []);

  useEffect(() => {
    if (!apiState.isLoading) {
      window.clearTimeout(loaderDelayTimeoutRef.current);
      loaderDelayTimeoutRef.current = null;
      setIsLoaderVisible(false);
      return undefined;
    }

    if (isLoaderVisible || loaderDelayTimeoutRef.current) {
      return undefined;
    }

    loaderDelayTimeoutRef.current = window.setTimeout(() => {
      loaderDelayTimeoutRef.current = null;
      setIsLoaderVisible(true);
    }, 450);

    return () => {
      window.clearTimeout(loaderDelayTimeoutRef.current);
      loaderDelayTimeoutRef.current = null;
    };
  }, [apiState.isLoading, isLoaderVisible]);

  return (
    <>
      {children}
      {apiState.isLoading && isLoaderVisible && (
        <div className="fixed left-1/2 top-4 z-[115] -translate-x-1/2 rounded-full border border-[#DCE4FF] bg-white/95 px-4 py-2 shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="relative h-5 w-5">
              <div className="absolute inset-0 rounded-full border-2 border-[#D4D6D8] opacity-30"></div>
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-[#4C6EF5] border-t-transparent"></div>
            </div>
            <p className="text-sm font-semibold text-[#4C6EF5]">
              Loading data{apiState.requestCount > 1 ? ` (${apiState.requestCount})` : ''}...
            </p>
          </div>
        </div>
      )}
      {apiError && (
        <div className="fixed right-4 top-4 z-[120] w-full max-w-sm rounded-2xl border border-red-200 bg-white p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#212529]">Request failed</p>
              <p className="mt-1 text-sm text-[#71767A]">{apiError.message || 'Something went wrong.'}</p>
            </div>
            <button
              type="button"
              onClick={() => setApiError(null)}
              className="text-gray-400 transition-colors hover:text-gray-600"
              aria-label="Dismiss API error"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
