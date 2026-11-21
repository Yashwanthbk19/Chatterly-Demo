import type {ConfirmationResult} from '@react-native-firebase/auth';

const GOOGLE_WEB_CLIENT_ID =
  '899974576436-s8rckvq9a8dcd2n30u2q7k3oo9cb253v.apps.googleusercontent.com';

let lastGoogleEmail = '';
let googleConfigured = false;
let nativeConfirmation: ConfirmationResult | null = null;

export class FirebaseNotConfiguredError extends Error {
  constructor(feature: string) {
    super(
      `${feature} needs the Chatterly Android development build. Rebuild the app after installing the native Firebase modules; this feature is not available in Expo Go.`,
    );
    this.name = 'FirebaseNotConfiguredError';
  }
}

export class GoogleSignInCancelledError extends Error {
  constructor() {
    super('Google sign-in was cancelled.');
    this.name = 'GoogleSignInCancelledError';
  }
}

export class FirebaseAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FirebaseAuthError';
    this.code = code;
  }
}

function readableFirebaseError(code: string, fallback = 'Firebase authentication failed.'): string {
  const normalized = code.replace(/^auth\//, '').replace(/-/g, '_').toUpperCase();
  const messages: Record<string, string> = {
    INVALID_PHONE_NUMBER: 'Enter a valid phone number including its country code.',
    INVALID_CODE: 'That verification code is incorrect. Please try again.',
    INVALID_VERIFICATION_CODE: 'That verification code is incorrect. Please try again.',
    INVALID_VERIFICATION_ID: 'This verification session is no longer valid. Request a new code.',
    SESSION_EXPIRED: 'This verification session has expired. Request a new code.',
    CODE_EXPIRED: 'This verification code has expired. Request a new code.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Please wait before trying again.',
    TOO_MANY_REQUESTS: 'Too many attempts. Please wait before trying again.',
    QUOTA_EXCEEDED: 'The SMS quota has been exceeded. Please try again later.',
    BILLING_NOT_ENABLED: 'Phone verification is unavailable because billing is not enabled for the Firebase project. Enable the Blaze plan in Firebase, then try again.',
    NETWORK_REQUEST_FAILED: 'Unable to reach Firebase. Check your internet connection and try again.',
    OPERATION_NOT_ALLOWED: 'This sign-in method is not enabled in Firebase Authentication.',
    CAPTCHA_CHECK_FAILED: 'The app verification check failed. Please try again.',
    APP_NOT_AUTHORIZED: 'This Android app is not authorized in Firebase. Check its package name and SHA fingerprints.',
    '10': 'Google Sign-In is not configured for this Android signing certificate. Add its SHA-1 and SHA-256 fingerprints in Firebase, then download a new google-services.json and rebuild.',
    DEVELOPER_ERROR: 'Google Sign-In is not configured for this Android signing certificate. Add its SHA-1 and SHA-256 fingerprints in Firebase, then download a new google-services.json and rebuild.',
    PLAY_SERVICES_NOT_AVAILABLE: 'Google Play services is unavailable or needs to be updated.',
  };
  return messages[normalized] || fallback;
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as {code?: unknown}).code || 'auth/unknown');
  }
  return 'auth/unknown';
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) { return error.message; }
  return fallback;
}

function nativeAuthModule(): typeof import('@react-native-firebase/auth') {
  try {
    return require('@react-native-firebase/auth') as typeof import('@react-native-firebase/auth');
  } catch {
    throw new FirebaseNotConfiguredError('Phone and Google authentication');
  }
}

function googleSignInModule(): typeof import('@react-native-google-signin/google-signin') {
  try {
    const google = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
    if (!googleConfigured) {
      google.GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        offlineAccess: false,
      });
      googleConfigured = true;
    }
    return google;
  } catch {
    throw new FirebaseNotConfiguredError('Google sign-in');
  }
}

export function isFirebaseConfigured(): boolean {
  try {
    nativeAuthModule();
    return true;
  } catch {
    return false;
  }
}

export async function signInWithGoogle(): Promise<string> {
  lastGoogleEmail = '';
  const google = googleSignInModule();
  const firebase = nativeAuthModule();

  try {
    await google.GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
    const response = await google.GoogleSignin.signIn();
    if (google.isCancelledResponse(response)) {
      throw new GoogleSignInCancelledError();
    }

    const googleIdToken = response.data.idToken;
    if (!googleIdToken) {
      throw new FirebaseAuthError(
        'auth/missing-google-id-token',
        'Google did not return an identity token. Check the web OAuth client configuration.',
      );
    }

    const credential = firebase.GoogleAuthProvider.credential(googleIdToken);
    const result = await firebase.signInWithCredential(firebase.getAuth(), credential);
    lastGoogleEmail = (result.user.email || response.data.user.email || '').trim().toLowerCase();
    return result.user.getIdToken(true);
  } catch (error) {
    if (error instanceof GoogleSignInCancelledError || error instanceof FirebaseAuthError) {
      throw error;
    }

    const code = errorCode(error);
    if (code === 'SIGN_IN_CANCELLED' || code === '12501') {
      throw new GoogleSignInCancelledError();
    }
    throw new FirebaseAuthError(
      code,
      readableFirebaseError(code, errorMessage(error, 'Google sign-in failed. Please try again.')),
    );
  }
}

export function getLastGoogleEmail(): string {
  return lastGoogleEmail;
}

export type PhoneVerification = {verificationId: string};

export async function startPhoneVerification(e164Phone: string): Promise<PhoneVerification> {
  const firebase = nativeAuthModule();
  try {
    const confirmation = await firebase.signInWithPhoneNumber(firebase.getAuth(), e164Phone);
    nativeConfirmation = confirmation;
    return {verificationId: confirmation.verificationId};
  } catch (error) {
    const code = errorCode(error);
    throw new FirebaseAuthError(
      code,
      readableFirebaseError(code, errorMessage(error, 'Unable to send the verification code.')),
    );
  }
}

export async function confirmPhoneCode(
  verification: PhoneVerification,
  code: string,
): Promise<string> {
  const confirmation = nativeConfirmation;
  if (!confirmation || confirmation.verificationId !== verification.verificationId) {
    throw new FirebaseAuthError(
      'auth/session-expired',
      'This verification session has expired. Request a new code.',
    );
  }

  try {
    const credential = await confirmation.confirm(code);
    if (!credential?.user) {
      throw new FirebaseAuthError(
        'auth/missing-user',
        'Firebase verified the code but did not return a signed-in user.',
      );
    }
    return credential.user.getIdToken(true);
  } catch (error) {
    if (error instanceof FirebaseAuthError) { throw error; }
    const codeValue = errorCode(error);
    throw new FirebaseAuthError(
      codeValue,
      readableFirebaseError(codeValue, errorMessage(error, 'The verification code could not be confirmed.')),
    );
  }
}

let pendingVerification: PhoneVerification | null = null;

export function setPendingPhoneVerification(verification: PhoneVerification | null): void {
  pendingVerification = verification;
  if (!verification) { nativeConfirmation = null; }
}

export function getPendingPhoneVerification(): PhoneVerification | null {
  return pendingVerification;
}

/** Clears provider credentials after an explicit Chatterly logout. */
export async function signOutOfFirebase(): Promise<void> {
  lastGoogleEmail = '';
  setPendingPhoneVerification(null);

  try {
    const firebase = nativeAuthModule();
    await firebase.signOut(firebase.getAuth());
  } catch {
    // Expo Go may not contain the native Firebase module. The Chatterly
    // session is still cleared independently by the caller.
  }

  try {
    await googleSignInModule().GoogleSignin.signOut();
  } catch {
    // Phone/email users may have no Google session, which is expected.
  }
}
