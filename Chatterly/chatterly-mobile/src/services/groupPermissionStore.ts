import AsyncStorage from '@react-native-async-storage/async-storage';

const MANAGE_REPORTS_KEY_PREFIX = '@chatterly:group-manage-reports:v1:';

const keyFor = (groupId: string) =>
  `${MANAGE_REPORTS_KEY_PREFIX}${encodeURIComponent(groupId.trim())}`;

/**
 * Chatterly Web keeps Manage Reports as a frontend-only permission because the
 * documented role-permissions API does not accept it. Persist the same switch
 * locally so it remains stable when the mobile panel is reopened.
 */
export async function getGroupManageReportsPermission(groupId: string): Promise<boolean> {
  if (!groupId.trim()) return false;
  return (await AsyncStorage.getItem(keyFor(groupId))) === 'true';
}

export async function setGroupManageReportsPermission(groupId: string, enabled: boolean): Promise<void> {
  if (!groupId.trim()) return;
  await AsyncStorage.setItem(keyFor(groupId), String(enabled));
}
