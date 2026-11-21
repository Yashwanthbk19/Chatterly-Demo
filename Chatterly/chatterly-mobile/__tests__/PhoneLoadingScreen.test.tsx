import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PhoneLoadingScreen} from '../src/screens/PhoneLoadingScreen';

test('navigates after the minimum Figma loading state without blocking on API health', async () => {
  jest.useFakeTimers();
  const onReady = jest.fn();
  const onBack = jest.fn();

  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 24, right: 0, bottom: 20, left: 0},
      }}>
        <PhoneLoadingScreen onBack={onBack} onReady={onReady} />
      </SafeAreaProvider>,
    );
  });

  expect(onReady).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(1800);
    await Promise.resolve();
  });

  expect(onReady).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
