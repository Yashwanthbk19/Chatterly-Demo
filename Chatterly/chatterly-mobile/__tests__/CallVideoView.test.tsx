import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {CallVideoView} from '../src/components/CallVideoView';

jest.mock('../src/services/nativeWebRTC', () => ({canLoadWebRTC: () => true}));
jest.mock('react-native-webrtc', () => ({RTCView: 'NativeRTCView'}));

test('forwards stream and native surface layering without changing the video layout', async () => {
  let tree: renderer.ReactTestRenderer;
  const style = {width: 104, height: 148};
  await act(async () => {tree = renderer.create(<CallVideoView streamURL="camera-stream" mirror objectFit="cover" zOrder={1} style={style}/>);});
  expect(tree!.root.findByType('NativeRTCView' as any).props).toEqual(expect.objectContaining({streamURL: 'camera-stream', mirror: true, objectFit: 'cover', zOrder: 1, style}));
  await act(async () => tree!.unmount());
});
