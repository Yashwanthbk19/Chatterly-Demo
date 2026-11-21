import React from 'react';
import type {StyleProp, ViewStyle} from 'react-native';
import {canLoadWebRTC} from '../services/nativeWebRTC';

type CallVideoViewProps = {
  streamURL: string;
  mirror?: boolean;
  objectFit?: 'contain' | 'cover';
  zOrder?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * `RTCView` only exists in a development build. Importing react-native-webrtc
 * up front throws "WebRTC native module not found" in Expo Go, which took the
 * whole app down at launch. Requiring it on first use keeps every screen
 * working there; only a call's video does not draw, and calls themselves say
 * they need the development build (see callAudio).
 */
let rtcView: React.ComponentType<CallVideoViewProps> | null | undefined;
function loadRTCView(): React.ComponentType<CallVideoViewProps> | null {
  if (rtcView !== undefined) { return rtcView; }
  if (!canLoadWebRTC()) {
    rtcView = null;
    return rtcView;
  }
  try {
    const module = require('react-native-webrtc') as {RTCView?: React.ComponentType<CallVideoViewProps>};
    rtcView = module.RTCView || null;
  } catch {
    rtcView = null;
  }
  return rtcView;
}

export function CallVideoView(props: CallVideoViewProps): React.JSX.Element | null {
  const RTCView = loadRTCView();
  return RTCView ? <RTCView {...props}/> : null;
}
