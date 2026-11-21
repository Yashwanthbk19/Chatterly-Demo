import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Keyboard, Modal, Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PhoneNumberLoginScreen} from '../src/screens/PhoneNumberLoginScreen';
import {COUNTRIES} from '../src/constants/countries';
import {
  FirebaseNotConfiguredError,
  setPendingPhoneVerification,
  startPhoneVerification,
} from '../src/services/firebaseAuth';

jest.mock('../src/services/firebaseAuth', () => {
  class MockFirebaseNotConfiguredError extends Error {}
  return {
    FirebaseNotConfiguredError: MockFirebaseNotConfiguredError,
    startPhoneVerification: jest.fn(),
    setPendingPhoneVerification: jest.fn(),
  };
});

const METRICS = {
  frame: {x: 0, y: 0, width: 390, height: 844},
  insets: {top: 24, right: 0, bottom: 20, left: 0},
};

function renderScreen(onOtpSent = jest.fn()) {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <PhoneNumberLoginScreen onBack={jest.fn()} onOtpSent={onOtpSent} />
      </SafeAreaProvider>,
    );
  });
  return renderer!;
}

const findSendButton = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByProps({accessibilityLabel: 'Send OTP'})[0];

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

test('validates the phone number and enables Send OTP', async () => {
  const renderer = renderScreen();

  expect(findSendButton(renderer).props.accessibilityState.disabled).toBe(true);

  const phoneInput = renderer.root.findAllByProps({accessibilityLabel: 'Phone number'})[0];
  await ReactTestRenderer.act(() => {
    // Letters are stripped, leaving a full 10-digit Indian number.
    phoneInput.props.onChangeText('98765abc43210');
  });

  expect(findSendButton(renderer).props.accessibilityState.disabled).toBe(false);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('starts Firebase verification and hands the number to the OTP screen', async () => {
  jest.useFakeTimers();
  jest.mocked(startPhoneVerification).mockResolvedValue({verificationId: 'verify-1'});
  const onOtpSent = jest.fn();
  const renderer = renderScreen(onOtpSent);

  const phoneInput = renderer.root.findAllByProps({accessibilityLabel: 'Phone number'})[0];
  await ReactTestRenderer.act(() => {
    phoneInput.props.onChangeText('9876543210');
  });

  await ReactTestRenderer.act(() => {
    findSendButton(renderer).props.onPress();
  });

  // The number is sent in E.164 form, matching the web LoginPage.
  expect(startPhoneVerification).toHaveBeenCalledWith('+919876543210');
  expect(findSendButton(renderer).props.accessibilityState).toEqual({disabled: true, busy: true});

  // The handle is parked for the OTP screen before navigating, the way the web
  // stores confirmationResult. No artificial timer needs to elapse.
  expect(setPendingPhoneVerification).toHaveBeenCalledWith({verificationId: 'verify-1'});
  expect(onOtpSent).toHaveBeenCalledWith('+91', '9876543210');

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('reports an unconfigured Firebase build instead of navigating', async () => {
  jest.useFakeTimers();
  jest.mocked(startPhoneVerification).mockRejectedValue(
    new FirebaseNotConfiguredError('Phone verification needs Firebase, which is not set up in this build yet.'),
  );
  const onOtpSent = jest.fn();
  const renderer = renderScreen(onOtpSent);

  const phoneInput = renderer.root.findAllByProps({accessibilityLabel: 'Phone number'})[0];
  await ReactTestRenderer.act(() => {
    phoneInput.props.onChangeText('9876543210');
  });

  await ReactTestRenderer.act(async () => {
    findSendButton(renderer).props.onPress();
    await Promise.resolve();
  });

  expect(onOtpSent).not.toHaveBeenCalled();
  expect(findSendButton(renderer).props.accessibilityState.disabled).toBe(false);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('compacts and keeps the form scrollable when the phone keyboard opens', async () => {
  const keyboardListeners = new Map<string, Parameters<typeof Keyboard.addListener>[1]>();
  const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
    keyboardListeners.set(event, listener);
    return {remove: jest.fn()} as never;
  });
  const renderer = renderScreen();

  await ReactTestRenderer.act(async () => {
    keyboardListeners.get(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow')?.({} as never);
  });

  const scroll = renderer.root.findByType(ScrollView);
  expect(scroll.props.keyboardDismissMode).toBe('interactive');
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop).toBe(52);
  const viewStyles = renderer.root.findAllByType(View).map(node => StyleSheet.flatten(node.props.style));
  expect(viewStyles.some(style => style?.maxWidth === 430 && style?.marginTop === 28)).toBe(true);
  expect(viewStyles.some(style => style?.marginTop === 34 && style?.paddingTop === 0)).toBe(true);
  expect(findSendButton(renderer)).toBeDefined();

  await ReactTestRenderer.act(() => renderer.unmount());
  keyboardSpy.mockRestore();
});

test('keeps every country reachable in a bounded scrolling country sheet', async () => {
  const renderer = renderScreen();
  await ReactTestRenderer.act(() => {
    renderer.root.findAllByProps({accessibilityLabel: 'Select country'})[0].props.onPress();
  });
  const modal = renderer.root.findByType(Modal);
  expect(modal.props.visible).toBe(true);
  expect(modal.findByType(ScrollView).findAll(node => typeof node.props.onPress === 'function')).toHaveLength(COUNTRIES.length);
  expect(modal.findAllByType(View).some(view => StyleSheet.flatten(view.props.style)?.maxHeight === '85%')).toBe(true);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('selects a new region and sends a shorter supported national number without truncation', async () => {
  jest.useFakeTimers();
  jest.mocked(startPhoneVerification).mockResolvedValue({verificationId: 'verify-niue'});
  const onOtpSent = jest.fn();
  const renderer = renderScreen(onOtpSent);
  await ReactTestRenderer.act(() => {
    renderer.root.findAllByProps({accessibilityLabel: 'Select country'})[0].props.onPress();
  });
  const niueOption = renderer.root.findByType(Modal).findByType(ScrollView).findAll(node => typeof node.props.onPress === 'function')
    .find(option => option.findAllByType(Text).some(text => text.props.children === 'Niue'))!;
  await ReactTestRenderer.act(() => niueOption.props.onPress());
  expect(renderer.root.findByType(Modal).props.visible).toBe(false);
  const input = renderer.root.findAllByProps({accessibilityLabel: 'Phone number'})[0];
  expect(input.props.maxLength).toBe(7);
  await ReactTestRenderer.act(() => input.props.onChangeText('4012'));
  expect(findSendButton(renderer).props.disabled).toBe(false);
  await ReactTestRenderer.act(() => { findSendButton(renderer).props.onPress(); });
  expect(startPhoneVerification).toHaveBeenCalledWith('+6834012');
  expect(onOtpSent).toHaveBeenCalledWith('+683', '4012');
  await ReactTestRenderer.act(() => renderer.unmount());
});
