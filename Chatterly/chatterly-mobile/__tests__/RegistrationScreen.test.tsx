import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RegistrationScreen} from '../src/screens/RegistrationScreen';
import {CountryPicker} from '../src/components/CountryPicker';
import {COUNTRIES} from '../src/constants/countries';
import {isDuplicateAccount} from '../src/services/registrationService';

jest.mock('../src/services/registrationService', () => ({
  isDuplicateAccount: jest.fn(),
}));

test('validates email while editing and when submitting registration', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 24, right: 0, bottom: 20, left: 0},
        }}
      >
        <RegistrationScreen initialMethod="email" />
      </SafeAreaProvider>,
    );
  });

  const input = renderer!.root.findByProps({accessibilityLabel: 'Email address'});
  const continueButton = renderer!.root
    .findAllByProps({accessibilityRole: 'button'})
    .find(button => button.findAllByProps({children: 'Continue'}).length > 0)!;

  await ReactTestRenderer.act(async () => continueButton.props.onPress());
  expect(renderer!.root.findByProps({children: 'Required'})).toBeDefined();

  await ReactTestRenderer.act(async () => input.props.onChangeText('user@'));
  expect(renderer!.root.findByProps({children: 'Please enter a valid email address'})).toBeDefined();

  await ReactTestRenderer.act(async () => continueButton.props.onPress());
  expect(isDuplicateAccount).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => input.props.onChangeText('user@example.com'));
  expect(renderer!.root.findAllByProps({children: 'Please enter a valid email address'})).toHaveLength(0);
  expect(renderer!.root.findAllByProps({children: 'Required'})).toHaveLength(0);
});

test('registers a number from a newly available country with its selected calling code', async () => {
  jest.mocked(isDuplicateAccount).mockReset().mockResolvedValue(false);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 24, right: 0, bottom: 20, left: 0},
      }}>
        <RegistrationScreen />
      </SafeAreaProvider>,
    );
  });
  const niue = COUNTRIES.find(country => country.code === 'NU')!;
  await ReactTestRenderer.act(() => renderer!.root.findByType(CountryPicker).props.onSelect(niue));
  const input = renderer!.root.findByProps({accessibilityLabel: 'Phone number'});
  expect(input.props.maxLength).toBe(7);
  await ReactTestRenderer.act(() => input.props.onChangeText('4012'));
  const continueButton = renderer!.root.findAllByProps({accessibilityRole: 'button'})
    .find(button => button.findAllByProps({children: 'Continue'}).length > 0)!;
  await ReactTestRenderer.act(async () => continueButton.props.onPress());
  expect(isDuplicateAccount).toHaveBeenCalledWith('phone', '+6834012');
  await ReactTestRenderer.act(() => renderer!.unmount());
});
