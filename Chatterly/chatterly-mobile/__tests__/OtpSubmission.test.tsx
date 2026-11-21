import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Platform} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {EmailLoginScreen} from '../src/screens/EmailLoginScreen';
import {PhoneNumberLoginScreen} from '../src/screens/PhoneNumberLoginScreen';
import {sendEmailOtp} from '../src/services/authApi';
import {setPendingPhoneVerification, startPhoneVerification} from '../src/services/firebaseAuth';

jest.mock('../src/services/authApi', () => ({sendEmailOtp: jest.fn()}));
jest.mock('../src/services/firebaseAuth', () => ({
  startPhoneVerification: jest.fn(), setPendingPhoneVerification: jest.fn(),
}));

const METRICS = {
  frame: {x: 0, y: 0, width: 390, height: 844},
  insets: {top: 24, right: 0, bottom: 20, left: 0},
};

function holdRequest() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const request = new Promise<void>((onResolve, onReject) => {resolve = onResolve; reject = onReject;});
  jest.mocked(sendEmailOtp).mockImplementationOnce(() => request.then(() => 'OTP sent'));
  jest.mocked(startPhoneVerification).mockImplementationOnce(() => request.then(() => ({verificationId: 'verification-1'})));
  return {resolve, reject};
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(sendEmailOtp).mockReset().mockResolvedValue('OTP sent');
  jest.mocked(startPhoneVerification).mockReset().mockResolvedValue({verificationId: 'verification-1'});
  jest.mocked(setPendingPhoneVerification).mockReset();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe.each(['email', 'phone'] as const)('%s OTP submission', channel => {
  async function renderSender() {
    const onOtpSent = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(() => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={METRICS}>
          {channel === 'email'
            ? <EmailLoginScreen onBack={jest.fn()} onOtpSent={onOtpSent} />
            : <PhoneNumberLoginScreen onBack={jest.fn()} onOtpSent={onOtpSent} />}
        </SafeAreaProvider>,
      );
    });
    const input = renderer.root.findAllByProps({accessibilityLabel: channel === 'email' ? 'Email address' : 'Phone number'})[0];
    const button = () => renderer.root.findAllByProps({accessibilityLabel: channel === 'email' ? 'Send email OTP' : 'Send OTP'})[0];
    await act(() => input.props.onChangeText(channel === 'email' ? 'Person@Example.com' : '9876543210'));
    return {renderer, input, button, onOtpSent};
  }

  test.each(['ios', 'android'] as const)('prevents repeated taps and keeps the busy state through navigation on %s', async platform => {
    jest.replaceProperty(Platform, 'OS', platform);
    const pending = holdRequest();
    const {renderer, input, button, onOtpSent} = await renderSender();
    try {
      await act(() => {
        button().props.onPress();
        button().props.onPress();
        input.props.onSubmitEditing();
      });
      const send = channel === 'email' ? sendEmailOtp : startPhoneVerification;
      expect(send).toHaveBeenCalledTimes(1);
      expect(button().props.accessibilityState).toEqual({disabled: true, busy: true});
      await act(() => { jest.advanceTimersByTime(5000); });
      expect(onOtpSent).not.toHaveBeenCalled();
      await act(async () => { pending.resolve(); await Promise.resolve(); });
      expect(onOtpSent).toHaveBeenCalledTimes(1);
      expect(onOtpSent.mock.calls[0]).toEqual(channel === 'email' ? ['person@example.com'] : ['+91', '9876543210']);
      // Do not flash the enabled Send OTP button while the parent switches screens.
      expect(button().props.accessibilityState).toEqual({disabled: true, busy: true});
      await act(() => button().props.onPress());
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      await act(() => renderer.unmount());
    }
  });

  test('shows a send failure and permits a successful retry without a delay', async () => {
    const pending = holdRequest();
    const {renderer, button, onOtpSent} = await renderSender();
    try {
      await act(() => { button().props.onPress(); });
      await act(async () => { pending.reject(new Error('Unable to send code.')); });
      expect(onOtpSent).not.toHaveBeenCalled();
      expect(button().props.accessibilityState).toEqual({disabled: false, busy: false});
      expect(renderer.root.findAllByProps({children: 'Unable to send code.'}).length).toBeGreaterThan(0);
      await act(() => { button().props.onPress(); });
      expect(onOtpSent).toHaveBeenCalledTimes(1);
      expect(renderer.root.findAllByProps({children: 'Unable to send code.'})).toHaveLength(0);
    } finally {
      await act(() => renderer.unmount());
    }
  });

  test.each(['success', 'failure'])('ignores a late %s after leaving the login screen', async result => {
    const pending = holdRequest();
    const {renderer, button, onOtpSent} = await renderSender();
    await act(() => { button().props.onPress(); });
    await act(() => renderer.unmount());
    await act(async () => {
      if (result === 'success') { pending.resolve(); }
      else { pending.reject(new Error('Late request failure')); }
      await Promise.resolve();
    });
    expect(onOtpSent).not.toHaveBeenCalled();
    expect(setPendingPhoneVerification).not.toHaveBeenCalled();
  });
});
