import {Platform, Vibration} from 'react-native';
import type {VibrationPattern} from './notificationPreferencesApi';

const PATTERNS: Record<Exclude<VibrationPattern, 'Turned Off'>, number[]> = {
  Short: [0, 150],
  Medium: [0, 250, 120, 250],
  Long: [0, 500, 180, 500],
};

const pendingPulses = new Set<ReturnType<typeof setTimeout>>();

export function cancelNotificationVibration(): void {
  pendingPulses.forEach(timer => clearTimeout(timer));
  pendingPulses.clear();
  Vibration.cancel();
}

export function vibrateNotification(pattern: VibrationPattern): void {
  // iOS ignores a new pattern while its previous pattern is still scheduled.
  // Cancelling also makes selecting Off stop an in-progress preview.
  cancelNotificationVibration();
  if (pattern === 'Turned Off') { return; }
  if (Platform.OS === 'ios') {
    // iOS has fixed-duration pulses; array entries are delays, not durations.
    // Space pulses far enough apart to keep the three modes distinguishable.
    Vibration.vibrate();
    const delays = pattern === 'Short' ? [] : pattern === 'Medium' ? [500] : [700, 1400];
    delays.forEach(delay => {
      const timer = setTimeout(() => {
        pendingPulses.delete(timer);
        Vibration.vibrate();
      }, delay);
      pendingPulses.add(timer);
    });
  } else {
    Vibration.vibrate(PATTERNS[pattern], false);
  }
}

export function androidNotificationVibration(pattern: VibrationPattern): number[] | undefined {
  return pattern === 'Turned Off' ? undefined : [...PATTERNS[pattern]];
}
