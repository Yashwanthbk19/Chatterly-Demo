import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {StyleSheet} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {BroadcastPhotoEditor} from '../src/components/BroadcastPhotoEditor';

const metrics = {
  frame: {x: 0, y: 0, width: 393, height: 852},
  insets: {top: 24, right: 0, bottom: 20, left: 0},
};
const asset = {uri: 'file:///profile.jpg', width: 900, height: 1200};

test.each([
  ['broadcast', 'Cancel broadcast picture crop'],
  ['group', 'Cancel group picture crop'],
] as const)('keeps the %s crop header below the status bar', async (subject, cancelLabel) => {
  let tree: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <BroadcastPhotoEditor asset={asset} onCancel={jest.fn()} onUse={jest.fn()} subject={subject}/>
      </SafeAreaProvider>,
    );
  });

  const cancel = tree!.root.findByProps({accessibilityLabel: cancelLabel});
  const headerStyle = StyleSheet.flatten(cancel.parent!.props.style);
  expect(headerStyle).toEqual(expect.objectContaining({height: 82, paddingTop: 24, alignItems: 'center'}));
  expect(tree!.root.findByProps({children: 'Crop Photo'})).toBeDefined();
  if (subject === 'broadcast') {
    expect(tree!.root.findByProps({accessibilityLabel: 'Use cropped broadcast picture'})).toBeDefined();
  }
});
