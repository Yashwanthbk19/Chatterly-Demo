import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ReportFlowSheet} from '../src/components/ReportFlowSheet';
import {reportUser} from '../src/services/privacyApi';

jest.mock('../src/services/privacyApi', () => ({reportUser: jest.fn()}));

const metrics = {frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}};

test('defaults to Spam and requires details when Other is selected', async () => {
  jest.mocked(reportUser).mockResolvedValue('Report submitted successfully');
  const onSuccess = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ReportFlowSheet onClose={jest.fn()} onSuccess={onSuccess} reportedUserId="user-1" visible/>
      </SafeAreaProvider>,
    );
  });

  expect(renderer!.root.findByProps({accessibilityLabel: 'Spam'}).props.accessibilityState.checked).toBe(true);
  expect(renderer!.root.findByProps({accessibilityLabel: 'Submit Report'}).props.accessibilityState.disabled).toBe(false);

  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({accessibilityLabel: 'Other'}).props.onPress();
  });
  expect(renderer!.root.findByProps({children: 'Provide a Reason'})).toBeTruthy();
  expect(renderer!.root.findByProps({accessibilityLabel: 'Submit Report'}).props.accessibilityState.disabled).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({accessibilityLabel: 'Report reason message'}).props.onChangeText('Repeated abusive messages');
  });
  expect(renderer!.root.findByProps({accessibilityLabel: 'Report reason message'}).props.maxLength).toBe(255);
  expect(renderer!.root.findByProps({accessibilityLabel: 'Submit Report'}).props.accessibilityState.disabled).toBe(false);

  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({accessibilityLabel: 'Submit Report'}).props.onPress();
  });
  expect(reportUser).toHaveBeenCalledWith('user-1', 'Other', 'Repeated abusive messages');
  expect(onSuccess).toHaveBeenCalledWith('Report Submitted Successfully!');
  await ReactTestRenderer.act(async () => renderer!.unmount());
});
