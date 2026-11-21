import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getGroupManageReportsPermission,
  setGroupManageReportsPermission,
} from '../src/services/groupPermissionStore';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('keeps the frontend-only Manage Reports switch per group', async () => {
  await expect(getGroupManageReportsPermission('group/1')).resolves.toBe(false);
  await setGroupManageReportsPermission('group/1', true);
  await setGroupManageReportsPermission('group-2', false);
  await expect(getGroupManageReportsPermission('group/1')).resolves.toBe(true);
  await expect(getGroupManageReportsPermission('group-2')).resolves.toBe(false);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    '@chatterly:group-manage-reports:v1:group%2F1',
    'true',
  );
});
