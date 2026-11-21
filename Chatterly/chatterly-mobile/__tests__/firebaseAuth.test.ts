const mockConfirm = jest.fn();
const mockSignInWithPhoneNumber = jest.fn();
const mockSignInWithCredential = jest.fn();
const mockFirebaseSignOut = jest.fn();
const mockGoogleCredential = jest.fn((_token: unknown) => ({providerId: 'google.com'}));
const mockGoogleConfigure = jest.fn();
const mockGoogleHasPlayServices = jest.fn();
const mockGoogleSignIn = jest.fn();
const mockGoogleSignOut = jest.fn();

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({name: 'native-auth'})),
  signInWithPhoneNumber: (...args: unknown[]) => mockSignInWithPhoneNumber(...args),
  signInWithCredential: (...args: unknown[]) => mockSignInWithCredential(...args),
  signOut: (...args: unknown[]) => mockFirebaseSignOut(...args),
  GoogleAuthProvider: {credential: (token: unknown) => mockGoogleCredential(token)},
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...args: unknown[]) => mockGoogleConfigure(...args),
    hasPlayServices: (...args: unknown[]) => mockGoogleHasPlayServices(...args),
    signIn: (...args: unknown[]) => mockGoogleSignIn(...args),
    signOut: (...args: unknown[]) => mockGoogleSignOut(...args),
  },
  isCancelledResponse: (response: {type?: string}) => response.type === 'cancelled',
}));

import {
  confirmPhoneCode,
  getLastGoogleEmail,
  GoogleSignInCancelledError,
  setPendingPhoneVerification,
  signOutOfFirebase,
  signInWithGoogle,
  startPhoneVerification,
} from '../src/services/firebaseAuth';

beforeEach(() => {
  jest.clearAllMocks();
  setPendingPhoneVerification(null);
  mockGoogleHasPlayServices.mockResolvedValue(true);
});

test('sends a native Firebase phone challenge', async () => {
  mockSignInWithPhoneNumber.mockResolvedValue({
    verificationId: 'verification-1',
    confirm: mockConfirm,
  });

  await expect(startPhoneVerification('+919876543210')).resolves.toEqual({
    verificationId: 'verification-1',
  });
  expect(mockSignInWithPhoneNumber).toHaveBeenCalledWith(
    {name: 'native-auth'},
    '+919876543210',
  );
});

test('confirms the native Firebase code and returns its ID token', async () => {
  const getIdToken = jest.fn().mockResolvedValue('firebase-phone-token');
  mockSignInWithPhoneNumber.mockResolvedValue({
    verificationId: 'verification-1',
    confirm: mockConfirm,
  });
  mockConfirm.mockResolvedValue({user: {getIdToken}});

  const verification = await startPhoneVerification('+919876543210');
  setPendingPhoneVerification(verification);

  await expect(confirmPhoneCode(verification, '123456')).resolves.toBe('firebase-phone-token');
  expect(mockConfirm).toHaveBeenCalledWith('123456');
  expect(getIdToken).toHaveBeenCalledWith(true);
});

test('signs in with Google, converts it to Firebase, and retains the verified email', async () => {
  const getIdToken = jest.fn().mockResolvedValue('firebase-google-token');
  mockGoogleSignIn.mockResolvedValue({
    type: 'success',
    data: {
      idToken: 'google-id-token',
      user: {email: 'person@example.com'},
    },
  });
  mockSignInWithCredential.mockResolvedValue({
    user: {email: 'Person@Example.com', getIdToken},
  });

  await expect(signInWithGoogle()).resolves.toBe('firebase-google-token');
  expect(mockGoogleConfigure).toHaveBeenCalledWith(expect.objectContaining({
    webClientId: expect.stringContaining('.apps.googleusercontent.com'),
  }));
  expect(mockGoogleCredential).toHaveBeenCalledWith('google-id-token');
  expect(mockSignInWithCredential).toHaveBeenCalledWith(
    {name: 'native-auth'},
    {providerId: 'google.com'},
  );
  expect(getLastGoogleEmail()).toBe('person@example.com');
});

test('reports Google account-sheet cancellation without starting Firebase sign-in', async () => {
  mockGoogleSignIn.mockResolvedValue({type: 'cancelled', data: null});

  await expect(signInWithGoogle()).rejects.toBeInstanceOf(GoogleSignInCancelledError);
  expect(mockSignInWithCredential).not.toHaveBeenCalled();
});

test('clears Firebase and Google provider sessions on explicit logout', async () => {
  mockFirebaseSignOut.mockResolvedValue(undefined);
  mockGoogleSignOut.mockResolvedValue(undefined);

  await signOutOfFirebase();

  expect(mockFirebaseSignOut).toHaveBeenCalledWith({name: 'native-auth'});
  expect(mockGoogleSignOut).toHaveBeenCalled();
  expect(getLastGoogleEmail()).toBe('');
});
