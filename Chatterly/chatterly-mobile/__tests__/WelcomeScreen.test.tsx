import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {WelcomeScreen} from '../src/screens/WelcomeScreen';

test('renders the complete disabled phone loading state', async () => {
  const onContinue = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 24, right: 0, bottom: 20, left: 0},
      }}>
        <WelcomeScreen loadingMethod="phone" onContinue={onContinue} onGoogle={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  const phoneButton = renderer!.root.findAllByProps({accessibilityLabel: 'Continue with phone number'})[0];
  const emailButton = renderer!.root.findAllByProps({accessibilityLabel: 'Continue with email'})[0];
  const googleButton = renderer!.root.findAllByProps({accessibilityLabel: 'Continue with Google'})[0];
  expect(phoneButton.props.accessibilityState).toEqual({busy: true, disabled: true});
  expect(emailButton.props.accessibilityState).toEqual({busy: false, disabled: true});
  expect(googleButton.props.accessibilityState).toEqual({busy: false, disabled: true});
  expect(onContinue).not.toHaveBeenCalled();
});

test('keeps the existing button geometry while Google authentication is running', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 24, right: 0, bottom: 20, left: 0},
      }}>
        <WelcomeScreen loadingMethod="google" onContinue={jest.fn()} onGoogle={jest.fn()} />
      </SafeAreaProvider>,
    );
  });

  const googleButton = renderer!.root.findByProps({accessibilityLabel: 'Continue with Google'});
  expect(googleButton.props.accessibilityState).toEqual({busy: true, disabled: true});
});
