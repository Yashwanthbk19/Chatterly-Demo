export const PERMISSION_FIELDS = Object.freeze([
  'canSendMessages',
  'canShareMedia',
  'canAddMembers',
  'canRemoveMembers',
  'isMuted',
]);

export const PERMISSION_ROLES = Object.freeze(['member', 'moderator', 'admin', 'superadmin']);

export const DEFAULT_PERMISSIONS = Object.freeze({
  canSendMessages: true,
  canShareMedia: true,
  canAddMembers: false,
  canRemoveMembers: false,
  isMuted: false,
});

export const RESTRICTED_PERMISSIONS = Object.freeze({
  canSendMessages: false,
  canShareMedia: false,
  canAddMembers: false,
  canRemoveMembers: false,
  isMuted: true,
});

export const DEFAULT_PERMISSIONS_BY_ROLE = Object.freeze({
  superadmin: Object.freeze({
    canSendMessages: true,
    canShareMedia: true,
    canAddMembers: true,
    canRemoveMembers: true,
    isMuted: false,
  }),
  member: Object.freeze({
    canSendMessages: true,
    canShareMedia: true,
    canAddMembers: false,
    canRemoveMembers: false,
    isMuted: false,
  }),
  moderator: Object.freeze({
    canSendMessages: true,
    canShareMedia: true,
    canAddMembers: true,
    canRemoveMembers: true,
    isMuted: false,
  }),
  admin: Object.freeze({
    canSendMessages: true,
    canShareMedia: true,
    canAddMembers: true,
    canRemoveMembers: true,
    isMuted: false,
  }),
});

export const PERMISSION_SCHEMA = Object.freeze({
  fields: PERMISSION_FIELDS,
  roles: PERMISSION_ROLES,
  defaults: DEFAULT_PERMISSIONS,
  defaultsByRole: DEFAULT_PERMISSIONS_BY_ROLE,
});

const isObjectRecord = (value) =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return Boolean(fallback);

  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return Boolean(fallback);
  if (['true', '1', 'yes', 'on', 'allow', 'allowed', 'enable', 'enabled'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off', 'deny', 'denied', 'disable', 'disabled'].includes(normalized)) {
    return false;
  }
  return Boolean(fallback);
};

export const normalizePermissionRole = (role, fallbackRole = 'member') => {
  const normalized = String(role || fallbackRole || 'member').trim().toLowerCase();
  return PERMISSION_ROLES.includes(normalized) ? normalized : 'member';
};

export const getDefaultPermissionsForRole = (role) => {
  const normalized = normalizePermissionRole(role);
  return { ...DEFAULT_PERMISSIONS_BY_ROLE[normalized] };
};

const readPermissionInput = (source = {}, field) => {
  if (!isObjectRecord(source)) return undefined;

  switch (field) {
    case 'canSendMessages':
      return source.canSendMessages ?? source.canSend ?? source.sendMessages;
    case 'canShareMedia':
      return source.canShareMedia ?? source.canShare ?? source.shareMedia ?? source.canSendMedia;
    case 'canAddMembers':
      return source.canAddMembers ?? source.canAdd ?? source.addMembers ?? source.canAddParticipants;
    case 'canRemoveMembers':
      return (
        source.canRemoveMembers ??
        source.canRemove ??
        source.removeMembers ??
        source.canRemoveParticipants
      );
    case 'isMuted':
      return source.isMuted ?? source.muted;
    default:
      return undefined;
  }
};

export const createPermissionsModel = (permissions = {}, options = {}) => {
  const role = options?.role !== undefined ? normalizePermissionRole(options.role) : null;
  const baseline = role ? DEFAULT_PERMISSIONS_BY_ROLE[role] : DEFAULT_PERMISSIONS;

  return PERMISSION_FIELDS.reduce((model, field) => {
    const incoming = readPermissionInput(permissions, field);
    model[field] = toBoolean(incoming, baseline[field]);
    return model;
  }, {});
};

export const mergePermissions = (current, updates) => {
  const base = createPermissionsModel(current);
  if (!isObjectRecord(updates)) return base;

  return PERMISSION_FIELDS.reduce((model, field) => {
    const incoming = readPermissionInput(updates, field);
    model[field] = incoming === undefined ? base[field] : toBoolean(incoming, base[field]);
    return model;
  }, {});
};

export const applyRolePermissions = (current, role) => {
  const normalizedRole = normalizePermissionRole(role);
  const baseline = DEFAULT_PERMISSIONS_BY_ROLE[normalizedRole];
  const preservedMuted = createPermissionsModel(current).isMuted;

  return { ...baseline, isMuted: preservedMuted };
};

export const restrictMemberPermissions = (current) => ({
  ...createPermissionsModel(current),
  ...RESTRICTED_PERMISSIONS,
});

export const liftMemberRestrictions = (current, role = 'member') => {
  const normalizedRole = normalizePermissionRole(role);
  return { ...DEFAULT_PERMISSIONS_BY_ROLE[normalizedRole], isMuted: false };
};

export const setMuted = (current, muted) => ({
  ...createPermissionsModel(current),
  isMuted: toBoolean(muted, false),
});

export const canPerform = (permissions, action) => {
  const model = createPermissionsModel(permissions);
  if (!PERMISSION_FIELDS.includes(action)) return false;
  if (action === 'isMuted') return model.isMuted;
  if (model.isMuted && (action === 'canSendMessages' || action === 'canShareMedia')) {
    return false;
  }
  return model[action];
};

export const toPermissionsData = (permissions = {}) => {
  const model = createPermissionsModel(permissions);
  return PERMISSION_SCHEMA.fields.reduce((data, field) => {
    data[field] = model[field];
    return data;
  }, {});
};
