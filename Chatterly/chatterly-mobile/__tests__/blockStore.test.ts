import {
  blockedSnapshot,
  changeContactBlock,
  isUserBlocked,
  refreshBlockedContacts,
} from '../src/services/blockStore';
import { getToken } from '../src/services/sessionStore';
import { getBlockedUsers, unblockUser } from '../src/services/privacyApi';
import { blockChatUser } from '../src/services/chatApi';
jest.mock('../src/services/sessionStore', () => ({ getToken: jest.fn() }));
jest.mock('../src/services/privacyApi', () => ({
  getBlockedUsers: jest.fn(),
  unblockUser: jest.fn(),
}));
jest.mock('../src/services/chatApi', () => ({ blockChatUser: jest.fn() }));
const user = { id: 'john', name: 'John' };
let token = 0;
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getToken).mockReturnValue(`session-${++token}`);
  jest.mocked(getBlockedUsers).mockResolvedValue([]);
});
it('updates the shared list only after a successful request, then removes unblocked contacts', async () => {
  await changeContactBlock(user, true);
  expect(blockChatUser).toHaveBeenCalledWith('john');
  expect(isUserBlocked('john')).toBe(true);
  jest.mocked(unblockUser).mockRejectedValueOnce(new Error('Offline'));
  await expect(changeContactBlock(user, false)).rejects.toThrow('Offline');
  expect(isUserBlocked('john')).toBe(true);
  await changeContactBlock(user, false);
  expect(blockedSnapshot()).toEqual([]);
});
it('preserves successful blocks when another contact fails', async () => {
  await changeContactBlock(user, true);
  jest.mocked(blockChatUser).mockRejectedValueOnce(new Error('Offline'));
  await expect(
    changeContactBlock({ id: 'jane', name: 'Jane' }, true),
  ).rejects.toThrow();
  expect(blockedSnapshot()).toEqual([user]);
});
it('does not let an older refresh overwrite a completed block', async () => {
  let resolve!: (users: (typeof user)[]) => void;
  jest.mocked(getBlockedUsers).mockReturnValue(
    new Promise(done => {
      resolve = done;
    }),
  );
  const refresh = refreshBlockedContacts();
  await changeContactBlock(user, true);
  resolve([]);
  await refresh;
  expect(isUserBlocked('john')).toBe(true);
});
it('does not leak a previous account’s contacts or in-flight results', async () => {
  let resolve!: (users: (typeof user)[]) => void;
  jest.mocked(getBlockedUsers).mockReturnValue(
    new Promise(done => {
      resolve = done;
    }),
  );
  const refresh = refreshBlockedContacts();
  jest.mocked(getToken).mockReturnValue('another-account');
  resolve([user]);
  await refresh;
  expect(blockedSnapshot()).toEqual([]);
});
