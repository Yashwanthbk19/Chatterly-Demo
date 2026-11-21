// Firebase web values are public identifiers, not service-account credentials.
// They must refer to the same project used by the backend Admin SDK.
export const FIREBASE_PROJECT_ID = 'stackly-chatterly';
export const FIREBASE_WEB_API_KEY = 'AIzaSyDJlrzgpLLZ46c_3bcKcsHPw_hfL_e6ivQ';

// This dedicated Hosting site contains only the browser hand-off required by
// Firebase reCAPTCHA and Google OAuth. Override it for another deployed site.
export const FIREBASE_AUTH_BRIDGE_URL = (
  process.env.EXPO_PUBLIC_FIREBASE_AUTH_BRIDGE_URL ||
  'https://stackly-chatterly-mobile-auth.web.app'
).replace(/\/$/, '');
