import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {sendEmailOtp} from '../src/services/authApi';
import {EmailLoginScreen} from '../src/screens/EmailLoginScreen';

jest.mock('../src/services/authApi', () => ({sendEmailOtp: jest.fn()}));

test.each(['android', 'ios'] as const)('keeps Send OTP accessible with the keyboard open and submits email on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  const keyboardListeners = new Map<string, Parameters<typeof Keyboard.addListener>[1]>();
  const remove = jest.fn();
  const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
    keyboardListeners.set(event, listener);
    return {remove} as never;
  });
  jest.useFakeTimers();
  jest.mocked(sendEmailOtp).mockResolvedValue('OTP sent to email');
  const onOtpSent = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 24, right: 0, bottom: 20, left: 0},
      }}>
        <EmailLoginScreen onBack={jest.fn()} onOtpSent={onOtpSent} />
      </SafeAreaProvider>,
    );
  });

  const initialButton = renderer!.root.findAllByProps({accessibilityLabel: 'Send email OTP'})[0];
  expect(initialButton.props.accessibilityState.disabled).toBe(true);
  const scroll = renderer!.root.findByType(ScrollView);
  const initialPadding = StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop;
  await ReactTestRenderer.act(() => {
    keyboardListeners.get(platform === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow')?.({} as never);
  });
  expect(renderer!.root.findByType(KeyboardAvoidingView).props.behavior).toBe(platform === 'ios' ? 'padding' : undefined);
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop).toBe(52);
  const viewStyles = renderer!.root.findAllByType(View).map(node => StyleSheet.flatten(node.props.style));
  expect(viewStyles.some(style => style?.maxWidth === 430 && style?.marginTop === 28)).toBe(true);
  expect(viewStyles.some(style => style?.marginTop === 34 && style?.paddingTop === 0)).toBe(true);

  const input = renderer!.root.findAllByProps({accessibilityLabel: 'Email address'})[0];
  await ReactTestRenderer.act(() => {
    input.props.onFocus();
    input.props.onChangeText(' User@Example.COM ');
  });

  const enabledButton = renderer!.root.findAllByProps({accessibilityLabel: 'Send email OTP'})[0];
  expect(enabledButton.props.accessibilityState.disabled).toBe(false);

  await ReactTestRenderer.act(() => {
    enabledButton.props.onPress();
  });

  const sendingButton = renderer!.root.findAllByProps({accessibilityLabel: 'Send email OTP'})[0];
  expect(sendingButton.props.accessibilityState).toEqual({disabled: true, busy: true});
  expect(sendEmailOtp).toHaveBeenCalledWith('user@example.com');

  // Navigate as soon as delivery succeeds, without advancing any timers.
  expect(onOtpSent).toHaveBeenCalledWith('user@example.com');
  expect(onOtpSent).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(() => {
    keyboardListeners.get(platform === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide')?.({} as never);
  });
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop).toBe(initialPadding);

  jest.useRealTimers();
  await ReactTestRenderer.act(() => {
    renderer!.unmount();
  });
  expect(remove).toHaveBeenCalledTimes(keyboardSpy.mock.calls.length);
  keyboardSpy.mockRestore();
  os.restore();
});
