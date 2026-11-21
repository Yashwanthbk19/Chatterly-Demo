import {callDuration, formatEndedDuration} from '../src/utils/callSummary';

test('uses server duration including zero instead of elapsed ringing time', () => {
  expect(callDuration('2020-01-01', 0)).toBe(0);
  expect(callDuration(null, 332)).toBe(332);
  expect(callDuration(null)).toBe(0);
});

test('falls back to connected time and handles invalid timestamps', () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-16T10:05:32Z'));
  expect(callDuration('2026-09-16T10:00:00Z')).toBe(332);
  expect(callDuration('invalid')).toBe(0);
  jest.restoreAllMocks();
});

test('formats a fixed hours, minutes and seconds summary', () => {
  expect(formatEndedDuration(1)).toBe('00:00:01');
  expect(formatEndedDuration(332)).toBe('00:05:32');
  expect(formatEndedDuration(3661)).toBe('01:01:01');
  expect(formatEndedDuration(NaN)).toBe('00:00:00');
});
