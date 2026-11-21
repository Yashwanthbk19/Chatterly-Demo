import {callHistoryCategory, isMissedCallStatus, normalizeCallStatus} from '../src/utils/callStatus';
import {callLogDisplayKind, callLogDisplayLabel} from '../src/utils/callLog';

test.each(['missed', ' MISSED ', 'Missed Call', 'not_answered', 'Not Answered', 'not-answered', 'unanswered', 'no_answer', 'timeout', 'timed-out'])(
  '%s is a missed outcome rather than an answered incoming call', status => {
    expect(normalizeCallStatus(status)).toBe('missed');
    expect(isMissedCallStatus(status)).toBe(true);
    expect(callHistoryCategory({direction: 'incoming', status})).toBe('missed');
    expect(callLogDisplayKind({isOwn: false, callStatus: status, text: 'Incoming video call'})).toBe('missed');
    expect(callLogDisplayLabel({isOwn: false, callStatus: status, text: 'Incoming video call'})).toEqual({title: 'Missed video call', detail: ''});
  },
);

test.each(['completed', 'connected', 'rejected', 'declined', 'cancelled'])(
  'does not turn an explicit %s outcome into a missed call', status => {
    expect(isMissedCallStatus(status)).toBe(false);
  },
);

test('keeps completed incoming and outgoing calls in their original categories', () => {
  expect(callHistoryCategory({direction: 'incoming', status: 'completed'})).toBe('incoming');
  expect(callHistoryCategory({direction: 'outgoing', status: 'completed'})).toBe('outgoing');
});
