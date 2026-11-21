import {Platform, Vibration} from 'react-native';
import {androidNotificationVibration, cancelNotificationVibration, vibrateNotification} from '../src/services/notificationVibration';
beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => { cancelNotificationVibration(); jest.restoreAllMocks(); jest.useRealTimers(); });
test.each([
  ['Short', [0, 150]],
  ['Medium', [0, 250, 120, 250]],
  ['Long', [0, 500, 180, 500]],
] as const)('Android plays the %s pattern used by notification channels', (mode, pattern) => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const cancel = jest.spyOn(Vibration, 'cancel');
  const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
  vibrateNotification(mode);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(vibrate).toHaveBeenCalledWith(pattern, false);
  expect(androidNotificationVibration(mode)).toEqual(pattern);
});
test.each([['Short', 1], ['Medium', 2], ['Long', 3]] as const)('iOS schedules %s pulses and cancels the previous preview', (mode, pulses) => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const cancel = jest.spyOn(Vibration, 'cancel');
  const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
  vibrateNotification('Long');
  vibrate.mockClear();
  vibrateNotification(mode);
  expect(cancel).toHaveBeenCalledTimes(2);
  jest.runAllTimers();
  expect(vibrate).toHaveBeenCalledTimes(pulses);
  expect(vibrate).toHaveBeenLastCalledWith();
});
test('Off cancels pending iOS pulses so none play after switching it off', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
  vibrateNotification('Long');
  vibrate.mockClear();
  vibrateNotification('Turned Off');
  jest.runAllTimers();
  expect(vibrate).not.toHaveBeenCalled();
});
test('Off stops the previous preview and never starts another vibration', () => {
  const cancel = jest.spyOn(Vibration, 'cancel');
  const vibrate = jest.spyOn(Vibration, 'vibrate');
  vibrateNotification('Turned Off');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(vibrate).not.toHaveBeenCalled();
  expect(androidNotificationVibration('Turned Off')).toBeUndefined();
});
