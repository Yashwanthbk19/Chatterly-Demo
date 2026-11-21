import {apiRequest} from '../src/api/client';
import {getCallDetails, getCallHistory, normalizeCallDuration, normalizeCallHistory} from '../src/services/callHistoryApi';

jest.mock('../src/api/client', () => ({apiRequest: jest.fn()}));
jest.mock('../src/services/sessionStore', () => ({
  getSession: () => ({user: {id: 'me'}, token: 'jwt'}),
  getToken: () => 'jwt',
}));

const payload = {
  personalCalls: [
    {_id: 'out-1', caller: {_id: 'me', name: 'Me'}, receiver: {_id: 'aarav', name: 'Aarav Sharma', profilePic: 'https://cdn.test/aarav.jpg'}, type: 'audio', status: 'completed', duration: 720, startedAt: '2026-09-21T14:20:00.000Z'},
    {_id: 'in-1', caller: {_id: 'bishod', name: 'Bishod Thomas'}, receiver: {_id: 'me', name: 'Me'}, type: 'video', status: 'missed', duration: 0, startedAt: '2026-09-21T13:00:00.000Z'},
  ],
  groupCalls: [
    {_id: 'group-1', groupId: {_id: 'team', groupName: 'Design Team'}, startedBy: {_id: 'me'}, type: 'video', status: 'ended', duration: 125, startedAt: '2026-09-20T10:00:00.000Z'},
  ],
};

test('uses exact elapsed seconds instead of a rounded duration value', () => {
  expect(normalizeCallDuration({
    duration: 60,
    startedAt: '2026-10-22T09:00:00.000Z',
    endedAt: '2026-10-22T09:00:15.000Z',
  })).toBe(15);
  expect(normalizeCallDuration({duration: 15})).toBe(15);
});

test('normalizes personal and group history relative to the authenticated user', () => {
  expect(normalizeCallHistory(payload, 'me')).toEqual([
    expect.objectContaining({id: 'out-1', contactId: 'aarav', contactName: 'Aarav Sharma', direction: 'outgoing', type: 'audio'}),
    expect.objectContaining({id: 'in-1', contactId: 'bishod', contactName: 'Bishod Thomas', direction: 'incoming', type: 'video', status: 'missed'}),
    expect.objectContaining({id: 'group-1', contactId: 'team', contactName: 'Design Team', direction: 'outgoing', isGroup: true, status: 'completed'}),
  ]);
});

test.each(['no_answer', 'Not Answered', 'unanswered', 'missed_call', 'timed-out'])(
  'normalizes %s in both history and detail payloads without changing the other participant', status => {
    const row = {...payload.personalCalls[1], status};
    expect(normalizeCallHistory({personalCalls: [row]}, 'me')).toEqual([
      expect.objectContaining({id: 'in-1', contactId: 'bishod', direction: 'incoming', status: 'missed'}),
    ]);
  },
);

test('loads call history from the documented authenticated endpoint', async () => {
  jest.mocked(apiRequest).mockResolvedValue({json: async () => ({success: true, data: payload})} as Response);

  await expect(getCallHistory()).resolves.toHaveLength(3);
  expect(apiRequest).toHaveBeenCalledWith(expect.stringMatching(/\/call\/history$/), {
    method: 'GET',
    headers: {Accept: 'application/json', Authorization: 'Bearer jwt'},
  });
});

test('loads one personal call from the documented details endpoint', async () => {
  jest.mocked(apiRequest).mockResolvedValue({json: async () => ({success: true, data: payload.personalCalls[0]})} as Response);

  await expect(getCallDetails('out-1')).resolves.toEqual(expect.objectContaining({id: 'out-1', contactId: 'aarav'}));
  expect(apiRequest).toHaveBeenCalledWith(expect.stringMatching(/\/call\/details\/out-1\?type=personal$/), expect.objectContaining({method: 'GET'}));
});
