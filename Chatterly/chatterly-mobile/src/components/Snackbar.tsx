import React, {useEffect, useRef} from 'react';
import {Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {
  message: string;
  onHide: () => void;
  /**
   * Floating (the default) pins the bar near the bottom of the screen. A host
   * with its own bottom chrome - the chat composer - places the bar itself and
   * passes `false`, so the notice sits above that chrome instead of over it.
   */
  floating?: boolean;
  /** Bottom system inset supplied by a screen that positions its own notice. */
  bottomInset?: number;
};

const VISIBLE_MS = 3500;

export function Snackbar({floating = true, bottomInset = 0, message, onHide}: Props) {
  // Hosts usually pass an inline arrow, which is a new function on every render.
  // Keying the timer on it restarted the countdown whenever the host re-rendered
  // (a call timer does so every second), so a notice could stay up for good.
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    if (!message) { return; }
    const timer = setTimeout(() => onHideRef.current(), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) { return null; }
  const text = <Text style={styles.text}>{message}</Text>;
  if (floating) {
    // Measure the native window's safe area, including when hosted in a Modal.
    // Maximum preserves explicit host clearance without adding the inset twice.
    return <SafeAreaView
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      mode="margin"
      edges={{bottom: 'maximum', left: 'additive', right: 'additive'}}
      style={[styles.bar, styles.floating, {marginBottom: Math.max(6, bottomInset)}]}>
      {text}
    </SafeAreaView>;
  }
  return <View accessibilityLiveRegion="polite" pointerEvents="none" style={[styles.bar, styles.inline]}>{text}</View>;
}

const styles = createThemedStyles({
  bar: {borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#242629', elevation: 6},
  floating: {position: 'absolute', left: 20, right: 20, bottom: 12},
  inline: {marginHorizontal: 16},
  text: {fontSize: 14, color: '#FFF'},
});
