import {canDeleteForEveryone, DELETE_FOR_EVERYONE_LIMIT_MS} from '../src/utils/messageDeletion';

const now = Date.parse('2026-11-12T12:00:00Z');
const message = {id: 'message', text: 'Hello', createdAt: new Date(now).toISOString(), isOwn: true};

test.each([
  [0, true],
  [DELETE_FOR_EVERYONE_LIMIT_MS, true],
  [DELETE_FOR_EVERYONE_LIMIT_MS + 1, false],
  [-1, false],
])('checks deletion eligibility at age %s ms', (age, expected) => {
  expect(canDeleteForEveryone({...message, createdAt: new Date(now - Number(age)).toISOString()}, now)).toBe(expected);
});

test('rejects received messages and invalid timestamps', () => {
  expect(canDeleteForEveryone({...message, isOwn: false}, now)).toBe(false);
  expect(canDeleteForEveryone({...message, createdAt: 'invalid'}, now)).toBe(false);
});
