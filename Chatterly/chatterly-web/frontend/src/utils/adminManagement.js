import {
  DEFAULT_PERMISSIONS_BY_ROLE,
  PERMISSION_FIELDS,
  PERMISSION_ROLES,
  createPermissionsModel,
  normalizePermissionRole,
} from './permissions';

export const ADMIN_MANAGEMENT_FIELDS = Object.freeze([
  'userId',
  'role',
  'permissions',
  'activityLogs',
  'isMuted',
  'isRestricted',
]);

export const ADMIN_MANAGEMENT_REQUIRED_FIELDS = Object.freeze([
  'userId',
  'role',
  'permissions',
]);

export const ADMIN_MANAGEMENT_ROLES = PERMISSION_ROLES;

export const ADMIN_PERMISSION_FIELDS = Object.freeze(
  PERMISSION_FIELDS.filter((field) => field !== 'isMuted')
);

export const ADMIN_ACTIVITY_LOG_FIELDS = Object.freeze([
  'id',
  'action',
  'actorId',
  'targetUserId',
  'createdAt',
  'metadata',
]);

export const ADMIN_MANAGEMENT_SCHEMA = Object.freeze({
  fields: ADMIN_MANAGEMENT_FIELDS,
  required: ADMIN_MANAGEMENT_REQUIRED_FIELDS,
  roles: ADMIN_MANAGEMENT_ROLES,
  permissionFields: ADMIN_PERMISSION_FIELDS,
  activityLogFields: ADMIN_ACTIVITY_LOG_FIELDS,
});

const PERMISSION_ALIASES = Object.freeze({
  addMembers: 'canAddMembers',
  addParticipants: 'canAddMembers',
  canAdd: 'canAddMembers',
  canAddParticipants: 'canAddMembers',
  canRemove: 'canRemoveMembers',
  canRemoveParticipants: 'canRemoveMembers',
  canSend: 'canSendMessages',
  canSendMedia: 'canShareMedia',
  canShare: 'canShareMedia',
  removeMembers: 'canRemoveMembers',
  removeParticipants: 'canRemoveMembers',
  sendMessages: 'canSendMessages',
  shareMedia: 'canShareMedia',
});

const MUTED_PERMISSION_FIELDS = Object.freeze(['canSendMessages', 'canShareMedia']);

const isObjectRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toTrimmedString = (value) => String(value ?? '').trim();

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return Boolean(fallback);
  if (typeof value === 'number') return value !== 0;

  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) return Boolean(fallback);
  if (['true', '1', 'yes', 'on', 'muted', 'restricted', 'blocked'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off', 'unmuted', 'allowed', 'active'].includes(normalized)) {
    return false;
  }

  return Boolean(fallback);
};

const normalizeAdminTimestamp = (value, fallbackValue = Date.now()) => {
  const parsedTimestamp = new Date(value || fallbackValue);
  const parsedFallbackTimestamp = new Date(fallbackValue || Date.now());
  const safeFallbackTimestamp = Number.isNaN(parsedFallbackTimestamp.getTime())
    ? new Date()
    : parsedFallbackTimestamp;

  return Number.isNaN(parsedTimestamp.getTime())
    ? safeFallbackTimestamp.toISOString()
    : parsedTimestamp.toISOString();
};

const normalizePermissionName = (permission) => {
  const permissionName = toTrimmedString(permission);
  if (!permissionName) return '';

  const aliasedPermission = PERMISSION_ALIASES[permissionName] || permissionName;
  return ADMIN_PERMISSION_FIELDS.includes(aliasedPermission) ? aliasedPermission : '';
};

const uniquePermissions = (permissions = []) => {
  const seen = new Set();

  return permissions.reduce((result, permission) => {
    const normalizedPermission = normalizePermissionName(permission);
    if (!normalizedPermission || seen.has(normalizedPermission)) return result;

    seen.add(normalizedPermission);
    result.push(normalizedPermission);
    return result;
  }, []);
};

const getDefaultPermissionListForRole = (role) => {
  const normalizedRole = normalizePermissionRole(role);
  const defaults = DEFAULT_PERMISSIONS_BY_ROLE[normalizedRole] || {};

  return ADMIN_PERMISSION_FIELDS.filter((field) => defaults[field]);
};

const getPermissionListFromObject = (permissions = {}, role = 'member') => {
  const permissionModel = createPermissionsModel(permissions, { role });

  return ADMIN_PERMISSION_FIELDS.filter((field) => permissionModel[field]);
};

export const isValidAdminRole = (role) => {
  const normalizedRole = toTrimmedString(role).toLowerCase();
  return ADMIN_MANAGEMENT_ROLES.includes(normalizedRole);
};

export const normalizeAdminRole = (role, fallbackRole = 'member') =>
  normalizePermissionRole(role, fallbackRole);

export const normalizeAdminPermissions = (permissions, options = {}) => {
  const role = normalizeAdminRole(options.role);
  const isMuted = toBoolean(options.isMuted, false);
  const isRestricted = toBoolean(options.isRestricted, false);
  let normalizedPermissions;

  if (Array.isArray(permissions)) {
    normalizedPermissions = uniquePermissions(permissions);
  } else if (isObjectRecord(permissions)) {
    normalizedPermissions = getPermissionListFromObject(permissions, role);
  } else {
    normalizedPermissions = getDefaultPermissionListForRole(role);
  }

  if (isRestricted) return [];

  return normalizedPermissions.filter((permission) => {
    if (!ADMIN_PERMISSION_FIELDS.includes(permission)) return false;
    if (isMuted && MUTED_PERMISSION_FIELDS.includes(permission)) return false;
    return true;
  });
};

const getActivityLogId = (activityLog = {}, action = '', index = 0) =>
  toTrimmedString(
    activityLog.id ||
      activityLog.logId ||
      activityLog.activityId ||
      `${action || 'activity'}-${index + 1}`
  );

export const createAdminActivityLog = (activityLog = {}, options = {}) => {
  const source = isObjectRecord(activityLog) ? activityLog : {};
  const action = toTrimmedString(
    source.action || source.type || source.event || source.activity || options.action
  );

  if (!action) return null;

  const createdAt = normalizeAdminTimestamp(
    source.createdAt || source.created_at || source.timestamp || options.createdAt
  );

  return {
    id: getActivityLogId(source, action, options.index),
    action,
    actorId: toTrimmedString(
      source.actorId || source.actor_id || source.adminId || source.createdBy || options.actorId
    ),
    targetUserId: toTrimmedString(
      source.targetUserId || source.target_user_id || source.userId || options.targetUserId
    ),
    createdAt,
    metadata: isObjectRecord(source.metadata) ? { ...source.metadata } : {},
  };
};

export const normalizeAdminActivityLogs = (activityLogs = [], options = {}) => {
  if (!Array.isArray(activityLogs)) return [];

  return activityLogs.reduce((normalizedLogs, activityLog, index) => {
    const normalizedLog = createAdminActivityLog(activityLog, {
      ...options,
      index,
    });

    if (normalizedLog) {
      normalizedLogs.push(normalizedLog);
    }

    return normalizedLogs;
  }, []);
};

const getAdminUserId = (source = {}, options = {}) =>
  toTrimmedString(
    source.userId ||
      source.user_id ||
      source.memberId ||
      source.member_id ||
      source.id ||
      source._id ||
      options.userId
  );

const getAdminActivityLogDraft = (source = {}, options = {}) => {
  if (Array.isArray(source.activityLogs)) return source.activityLogs;
  if (Array.isArray(source.activity_logs)) return source.activity_logs;
  if (Array.isArray(source.auditLogs)) return source.auditLogs;
  if (Array.isArray(source.logs)) return source.logs;
  if (Array.isArray(options.activityLogs)) return options.activityLogs;

  return [];
};

export const createAdminManagementModel = (admin = {}, options = {}) => {
  const source = isObjectRecord(admin) ? admin : {};
  const role = normalizeAdminRole(source.role || source.adminRole || options.role);
  const isMuted = toBoolean(
    source.isMuted ?? source.muted ?? source.permissions?.isMuted ?? options.isMuted,
    false
  );
  const isRestricted = toBoolean(
    source.isRestricted ?? source.restricted ?? source.permissions?.isRestricted ?? options.isRestricted,
    false
  );
  const permissionDraft =
    source.permissions ??
    source.permissionKeys ??
    source.permissionList ??
    options.permissions;

  return {
    userId: getAdminUserId(source, options),
    role,
    permissions: normalizeAdminPermissions(permissionDraft, {
      role,
      isMuted,
      isRestricted,
    }),
    activityLogs: normalizeAdminActivityLogs(getAdminActivityLogDraft(source, options), {
      targetUserId: getAdminUserId(source, options),
    }),
    isMuted,
    isRestricted,
  };
};

export const addAdminActivityLog = (admin, activityLog = {}, options = {}) => {
  const model = createAdminManagementModel(admin);
  const normalizedLog = createAdminActivityLog(activityLog, {
    ...options,
    index: model.activityLogs.length,
    targetUserId: options.targetUserId || model.userId,
  });

  if (!normalizedLog) return model;

  return {
    ...model,
    activityLogs: [...model.activityLogs, normalizedLog],
  };
};

export const toAdminManagementModelData = (admin = {}, options = {}) => {
  const adminModel = createAdminManagementModel(admin, options);

  return ADMIN_MANAGEMENT_SCHEMA.fields.reduce((modelData, fieldName) => {
    modelData[fieldName] = adminModel[fieldName];
    return modelData;
  }, {});
};
