import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Keyboard} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ApiError} from '../src/api/client';
import {
  completeLoginTwoFactor,
  phoneLogin,
  resendEmailOtp,
  verifyEmailOtp,
} from '../src/services/authApi';
import {OtpVerificationScreen} from '../src/screens/OtpVerificationScreen';
import {confirmPhoneCode, getPendingPhoneVerification} from '../src/services/firebaseAuth';

jest.mock('../src/services/authApi', () => ({
  completeLoginTwoFactor: jest.fn(),
  resendEmailOtp: jest.fn(),
  verifyEmailOtp: jest.fn(),
  phoneLogin: jest.fn(),
}));
jest.mock('../src/services/firebaseAuth', () => ({
  FirebaseNotConfiguredError: class MockFirebaseNotConfiguredError extends Error {},
  confirmPhoneCode: jest.fn(),
  getPendingPhoneVerification: jest.fn(),
  setPendingPhoneVerification: jest.fn(),
  startPhoneVerification: jest.fn(),
}));

const METRICS = {
  frame: {x: 0, y: 0, width: 390, height: 844},
  insets: {top: 24, right: 0, bottom: 20, left: 0},
};

const DESTINATION = {channel: 'email', email: 'person@example.com'} as const;

function renderScreen(onVerified = jest.fn(), onBack = jest.fn()) {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <OtpVerificationScreen destination={DESTINATION} onBack={onBack} onVerified={onVerified} />
      </SafeAreaProvider>,
    );
  });
  return renderer!;
}

const findVerifyButton = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByProps({accessibilityLabel: 'Verify code'})[0];

const findCodeInput = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByProps({accessibilityLabel: '6 digit verification code'})[0];

const enterCode = async (renderer: ReactTestRenderer.ReactTestRenderer, code: string) => {
  await ReactTestRenderer.act(() => {
    findCodeInput(renderer).props.onChangeText(code);
  });
};

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

test('keeps Verify disabled until six digits are entered, then reports the session', async () => {
  jest.useFakeTimers();
  const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss');
  jest.mocked(verifyEmailOtp).mockResolvedValue({
    token: 'jwt-token',
    user: {id: 'user-1', email: 'person@example.com'},
    isProfileComplete: false,
    message: '',
    requires2FA: false,
    twoFactorUserId: '',
    twoFactorMethod: '',
  });
  const onVerified = jest.fn();
  const renderer = renderScreen(onVerified);

  expect(findVerifyButton(renderer).props.accessibilityState.disabled).toBe(true);

  await enterCode(renderer, '48291');
  expect(findVerifyButton(renderer).props.accessibilityState.disabled).toBe(true);

  await enterCode(renderer, '482913');
  expect(findVerifyButton(renderer).props.accessibilityState.disabled).toBe(false);

  await ReactTestRenderer.act(async () => {
    findVerifyButton(renderer).props.onPress();
    await Promise.resolve();
  });

  expect(verifyEmailOtp).toHaveBeenCalledWith('person@example.com', '482913');
  expect(dismissKeyboard).toHaveBeenCalledTimes(1);

  // The confirmation is held briefly before the parent takes over.
  expect(onVerified).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(900);
    await Promise.resolve();
  });
  expect(onVerified).toHaveBeenCalledWith(expect.objectContaining({token: 'jwt-token', isProfileComplete: false}));

  await ReactTestRenderer.act(() => renderer.unmount());
  dismissKeyboard.mockRestore();
}, 15000);

test('validates a phone SMS code with Firebase before exchanging it with the backend', async () => {
  jest.useFakeTimers();
  const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss');
  jest.mocked(getPendingPhoneVerification).mockReturnValue({verificationId: 'phone-session'});
  jest.mocked(confirmPhoneCode).mockResolvedValue('firebase-phone-token');
  jest.mocked(phoneLogin).mockResolvedValue({
    token: 'phone-jwt', user: {id: 'phone-user', phone: '+919876543210'},
    isProfileComplete: true, message: '', requires2FA: false,
    twoFactorUserId: '', twoFactorMethod: '',
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <OtpVerificationScreen destination={{channel: 'phone', dialCode: '+91', phone: '9876543210'}} onBack={jest.fn()} onVerified={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  await enterCode(renderer!, '123456');
  await ReactTestRenderer.act(async () => {
    findVerifyButton(renderer!).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(confirmPhoneCode).toHaveBeenCalledWith({verificationId: 'phone-session'}, '123456');
  expect(phoneLogin).toHaveBeenCalledWith('firebase-phone-token');
  expect(dismissKeyboard).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(() => renderer!.unmount());
  dismissKeyboard.mockRestore();
});

test('finishes SMS two-factor login with the phone proof already verified', async () => {
  jest.useFakeTimers();
  jest.mocked(getPendingPhoneVerification).mockReturnValue({verificationId: 'phone-session'});
  jest.mocked(confirmPhoneCode).mockResolvedValue('firebase-phone-token');
  jest.mocked(phoneLogin).mockResolvedValue({
    token: '', user: null, isProfileComplete: true, message: '', requires2FA: true,
    twoFactorUserId: 'phone-user', twoFactorMethod: 'sms',
  });
  jest.mocked(completeLoginTwoFactor).mockResolvedValue({
    token: 'phone-jwt', user: {id: 'phone-user', phone: '+919876543210'},
    isProfileComplete: true, message: 'Login successful', requires2FA: false,
    twoFactorUserId: '', twoFactorMethod: '',
  });
  const onVerified = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <OtpVerificationScreen destination={{channel: 'phone', dialCode: '+91', phone: '9876543210'}} onBack={jest.fn()} onVerified={onVerified} />
      </SafeAreaProvider>,
    );
  });

  await enterCode(renderer!, '123456');
  await ReactTestRenderer.act(async () => {
    findVerifyButton(renderer!).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(phoneLogin).toHaveBeenCalledWith('firebase-phone-token');
  expect(completeLoginTwoFactor).toHaveBeenCalledWith('phone-user', {
    idToken: 'firebase-phone-token',
  });
  expect(renderer!.root.findAllByProps({children: 'Verification successful'}).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(900);
    await Promise.resolve();
  });
  expect(onVerified).toHaveBeenCalledWith(expect.objectContaining({
    token: 'phone-jwt',
    requires2FA: false,
  }));

  await ReactTestRenderer.act(() => renderer!.unmount());
});

test('keeps authenticator two-factor as a separate challenge after phone login', async () => {
  jest.useFakeTimers();
  jest.mocked(getPendingPhoneVerification).mockReturnValue({verificationId: 'phone-session'});
  jest.mocked(confirmPhoneCode).mockResolvedValue('firebase-phone-token');
  jest.mocked(phoneLogin).mockResolvedValue({
    token: '', user: null, isProfileComplete: true, message: '', requires2FA: true,
    twoFactorUserId: 'phone-user', twoFactorMethod: 'authenticator',
  });
  const onVerified = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <OtpVerificationScreen destination={{channel: 'phone', dialCode: '+91', phone: '9876543210'}} onBack={jest.fn()} onVerified={onVerified} />
      </SafeAreaProvider>,
    );
  });

  await enterCode(renderer!, '123456');
  await ReactTestRenderer.act(async () => {
    findVerifyButton(renderer!).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(completeLoginTwoFactor).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(900);
    await Promise.resolve();
  });
  expect(onVerified).toHaveBeenCalledWith(expect.objectContaining({
    requires2FA: true,
    twoFactorMethod: 'authenticator',
  }));

  await ReactTestRenderer.act(() => renderer!.unmount());
});

test('uses the same six-digit validation and 30-second timer after Google sign-in', async () => {
  jest.useFakeTimers();
  jest.mocked(verifyEmailOtp).mockResolvedValue({
    token: 'google-jwt', user: {id: 'google-user', email: 'google@example.com'},
    isProfileComplete: true, message: '', requires2FA: false,
    twoFactorUserId: '', twoFactorMethod: '',
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <OtpVerificationScreen destination={{channel: 'google', email: 'google@example.com'}} onBack={jest.fn()} onVerified={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  expect(renderer!.root.findByProps({children: 'Resend in 30s'})).toBeDefined();
  // The design's one change affordance, sitting beside the address it changes.
  expect(renderer!.root.findByProps({children: 'Not your Email?'})).toBeDefined();
  expect(renderer!.root.findByProps({children: 'google@example.com'})).toBeDefined();
  expect(renderer!.root.findAllByProps({accessibilityLabel: 'Change destination'}).length).toBeGreaterThan(0);
  await enterCode(renderer!, '654321');
  await ReactTestRenderer.act(async () => {
    findVerifyButton(renderer!).props.onPress();
    await Promise.resolve();
  });
  expect(verifyEmailOtp).toHaveBeenCalledWith('google@example.com', '654321');
  await ReactTestRenderer.act(() => renderer!.unmount());
});

test('clears the boxes and explains an incorrect code', async () => {
  jest.mocked(verifyEmailOtp).mockRejectedValue(new ApiError('Invalid or expired OTP.', 400));
  const renderer = renderScreen();

  await enterCode(renderer, '000000');
  await ReactTestRenderer.act(async () => {
    findVerifyButton(renderer).props.onPress();
    await Promise.resolve();
  });

  expect(findCodeInput(renderer).props.value).toBe('');
  expect(renderer.root.findAllByProps({
    children: 'That code is incorrect or has expired. Check it and try again.',
  }).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('locks Verify after the attempt limit until a new code is requested', async () => {
  jest.useFakeTimers();
  jest.mocked(verifyEmailOtp).mockRejectedValue(new ApiError('Maximum attempts reached', 500));
  jest.mocked(resendEmailOtp).mockResolvedValue('Email OTP resent successfully.');
  const renderer = renderScreen();

  await enterCode(renderer, '111111');
  await ReactTestRenderer.act(async () => {
    findVerifyButton(renderer).props.onPress();
    await Promise.resolve();
  });

  // A fresh full code must not re-enable Verify while the account is locked.
  await enterCode(renderer, '222222');
  expect(findVerifyButton(renderer).props.accessibilityState.disabled).toBe(true);

  // Resend only appears once the 30 second cooldown has elapsed.
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Resend code'}).length).toBe(0);
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(30000);
    await Promise.resolve();
  });

  const resendButton = renderer.root.findAllByProps({accessibilityLabel: 'Resend code'})[0];
  await ReactTestRenderer.act(async () => {
    resendButton.props.onPress();
    await Promise.resolve();
  });

  expect(resendEmailOtp).toHaveBeenCalledWith('person@example.com');
  expect(findCodeInput(renderer).props.value).toBe('');

  await enterCode(renderer, '333333');
  expect(findVerifyButton(renderer).props.accessibilityState.disabled).toBe(false);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('keeps the code in place when the network drops so it can be retried', async () => {
  jest.mocked(verifyEmailOtp).mockRejectedValue(
    new ApiError('Cannot connect to Chatterly. Check your internet connection.'),
  );
  const renderer = renderScreen();

  await enterCode(renderer, '482913');
  await ReactTestRenderer.act(async () => {
    findVerifyButton(renderer).props.onPress();
    await Promise.resolve();
  });

  expect(findCodeInput(renderer).props.value).toBe('482913');
  expect(findVerifyButton(renderer).props.accessibilityState.disabled).toBe(false);
  expect(renderer.root.findAllByProps({
    children: 'No internet connection. Reconnect and try again.',
  }).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('renders the design header: Verify OTP, the destination in full, and one Change action', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <OtpVerificationScreen destination={{channel: 'phone', dialCode: '+91', phone: '9874838900'}} onBack={jest.fn()} onVerified={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  // The screen title and the button both read "Verify OTP" in the design.
  expect(renderer!.root.findByProps({accessibilityRole: 'header'}).props.children).toBe('Verify OTP');
  expect(renderer!.root.findAllByProps({children: 'Verify OTP'}).length).toBeGreaterThan(1);
  expect(renderer!.root.findByProps({children: 'Not your Number?'})).toBeDefined();
  // Shown in full so it can be checked against what was typed.
  expect(renderer!.root.findByProps({children: '+919874838900'})).toBeDefined();
  expect(renderer!.root.findByProps({children: 'Change'})).toBeDefined();
  expect(renderer!.root.findByProps({children: 'Didn’t get the code? '})).toBeDefined();

  await ReactTestRenderer.act(() => renderer!.unmount());
});

test('an authenticator challenge offers a way out instead of a destination to change', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <OtpVerificationScreen destination={{channel: 'two-factor-authenticator', userId: 'user-1'}} onBack={jest.fn()} onVerified={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  expect(renderer!.root.findByProps({children: 'Cancel sign in'})).toBeDefined();
  // There is no number or address to print, so the prompt above it is not shown.
  expect(renderer!.root.findAllByProps({children: 'Not your Email?'})).toHaveLength(0);
  expect(renderer!.root.findAllByProps({accessibilityLabel: 'Resend code'})).toHaveLength(0);

  await ReactTestRenderer.act(() => renderer!.unmount());
});
