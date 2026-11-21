import {vibrateMessageOnce} from '../src/services/messageVibrationDelivery';
import {vibrateNotification} from '../src/services/notificationVibration';
jest.mock('../src/services/notificationVibration', () => ({vibrateNotification: jest.fn()}));
let sequence = 0;
beforeEach(() => { jest.clearAllMocks(); sequence++; });
test.each(['push', 'socket'] as const)('pairs legacy pushes without message ids when %s arrives first', first => {
  const body = 'legacy-' + sequence;
  const socket = {id: 'message-' + sequence, chatId: 'chat', body};
  const push = {body};
  vibrateMessageOnce(first, first === 'push' ? push : socket, 'Short');
  vibrateMessageOnce(first === 'push' ? 'socket' : 'push', first === 'push' ? socket : push, 'Short');
  expect(vibrateNotification).toHaveBeenCalledTimes(1);
});
test('different messages with identical text still vibrate independently', () => {
  const body = 'same-text-' + sequence;
  vibrateMessageOnce('socket', {id: 'one-' + sequence, body, chatId: 'one'}, 'Short');
  vibrateMessageOnce('socket', {id: 'two-' + sequence, body, chatId: 'one'}, 'Long');
  vibrateMessageOnce('push', {id: 'three-' + sequence, body, chatId: 'other'}, 'Medium');
  expect(vibrateNotification).toHaveBeenCalledTimes(3);
});
test('Off does not vibrate or swallow a later enabled notification', () => {
  const receipt = {id: 'off-' + sequence, body: 'off'};
  vibrateMessageOnce('socket', receipt, 'Turned Off');
  expect(vibrateNotification).not.toHaveBeenCalled();
  vibrateMessageOnce('push', receipt, 'Short');
  expect(vibrateNotification).toHaveBeenCalledTimes(1);
});
