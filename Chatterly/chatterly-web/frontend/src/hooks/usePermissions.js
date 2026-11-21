import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_PERMISSIONS,
  DEFAULT_PERMISSIONS_BY_ROLE,
  PERMISSION_FIELDS,
  applyRolePermissions,
  canPerform,
  createPermissionsModel,
  getDefaultPermissionsForRole,
  liftMemberRestrictions,
  mergePermissions,
  normalizePermissionRole,
  restrictMemberPermissions,
  setMuted,
} from '../utils/permissions';

const toMemberId = (value) => String(value ?? '').trim();

const buildMemberEntry = (entry = {}) => ({
  role: normalizePermissionRole(entry?.role),
  permissions: createPermissionsModel(entry?.permissions, { role: entry?.role }),
});

const buildInitialState = (initial = {}) => {
  if (!initial || typeof initial !== 'object') return {};
  return Object.entries(initial).reduce((state, [memberId, entry]) => {
    const key = toMemberId(memberId);
    if (!key) return state;
    state[key] = buildMemberEntry(entry);
    return state;
  }, {});
};

/**
 * usePermissions — per-member permission state.
 *
 * Permission shape:
 *   { canSendMessages, canShareMedia, canAddMembers, canRemoveMembers, isMuted }
 *
 * Operations:
 *   - updatePermissions(memberId, updates) — patch one or more permission flags
 *   - setRole(memberId, role) — apply role-based default permissions
 *   - restrictMember(memberId) / liftRestrictions(memberId) — toggle full restriction
 *   - muteMember(memberId) / unmuteMember(memberId) — toggle isMuted
 *   - removeMember(memberId) — drop entry entirely
 *   - can(memberId, action) — check whether a member may perform an action
 */
export const usePermissions = (initialState = {}) => {
  const [memberPermissions, setMemberPermissions] = useState(() => buildInitialState(initialState));

  const ensureMemberEntry = useCallback((memberId, role) => {
    const key = toMemberId(memberId);
    if (!key) return null;

    let created = null;
    setMemberPermissions((current) => {
      if (current[key]) return current;
      const entry = buildMemberEntry({ role: role || 'member' });
      created = entry;
      return { ...current, [key]: entry };
    });
    return created;
  }, []);

  const updatePermissions = useCallback((memberId, updates) => {
    const key = toMemberId(memberId);
    if (!key) return;

    setMemberPermissions((current) => {
      const existing = current[key] || buildMemberEntry();
      const nextPermissions = mergePermissions(existing.permissions, updates);
      return { ...current, [key]: { ...existing, permissions: nextPermissions } };
    });
  }, []);

  const setPermission = useCallback((memberId, field, value) => {
    if (!PERMISSION_FIELDS.includes(field)) return;
    updatePermissions(memberId, { [field]: value });
  }, [updatePermissions]);

  const setRole = useCallback((memberId, role) => {
    const key = toMemberId(memberId);
    if (!key) return;

    setMemberPermissions((current) => {
      const existing = current[key] || buildMemberEntry();
      const nextRole = normalizePermissionRole(role);
      const nextPermissions = applyRolePermissions(existing.permissions, nextRole);
      return { ...current, [key]: { role: nextRole, permissions: nextPermissions } };
    });
  }, []);

  const restrictMember = useCallback((memberId) => {
    const key = toMemberId(memberId);
    if (!key) return;

    setMemberPermissions((current) => {
      const existing = current[key] || buildMemberEntry();
      return {
        ...current,
        [key]: { ...existing, permissions: restrictMemberPermissions(existing.permissions) },
      };
    });
  }, []);

  const liftRestrictions = useCallback((memberId) => {
    const key = toMemberId(memberId);
    if (!key) return;

    setMemberPermissions((current) => {
      const existing = current[key] || buildMemberEntry();
      return {
        ...current,
        [key]: {
          ...existing,
          permissions: liftMemberRestrictions(existing.permissions, existing.role),
        },
      };
    });
  }, []);

  const muteMember = useCallback((memberId) => {
    const key = toMemberId(memberId);
    if (!key) return;

    setMemberPermissions((current) => {
      const existing = current[key] || buildMemberEntry();
      return {
        ...current,
        [key]: { ...existing, permissions: setMuted(existing.permissions, true) },
      };
    });
  }, []);

  const unmuteMember = useCallback((memberId) => {
    const key = toMemberId(memberId);
    if (!key) return;

    setMemberPermissions((current) => {
      const existing = current[key] || buildMemberEntry();
      return {
        ...current,
        [key]: { ...existing, permissions: setMuted(existing.permissions, false) },
      };
    });
  }, []);

  const removeMember = useCallback((memberId) => {
    const key = toMemberId(memberId);
    if (!key) return;

    setMemberPermissions((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const getPermissions = useCallback(
    (memberId) => {
      const key = toMemberId(memberId);
      if (!key) return { ...DEFAULT_PERMISSIONS };
      const entry = memberPermissions[key];
      if (!entry) return { ...DEFAULT_PERMISSIONS };
      return { ...entry.permissions };
    },
    [memberPermissions]
  );

  const getRole = useCallback(
    (memberId) => {
      const key = toMemberId(memberId);
      if (!key) return 'member';
      return memberPermissions[key]?.role || 'member';
    },
    [memberPermissions]
  );

  const can = useCallback(
    (memberId, action) => canPerform(getPermissions(memberId), action),
    [getPermissions]
  );

  const permissionsByMember = useMemo(
    () =>
      Object.entries(memberPermissions).reduce((map, [memberId, entry]) => {
        map[memberId] = { ...entry.permissions };
        return map;
      }, {}),
    [memberPermissions]
  );

  const rolesByMember = useMemo(
    () =>
      Object.entries(memberPermissions).reduce((map, [memberId, entry]) => {
        map[memberId] = entry.role;
        return map;
      }, {}),
    [memberPermissions]
  );

  const resetPermissions = useCallback(
    (nextState = {}) => setMemberPermissions(buildInitialState(nextState)),
    []
  );

  return {
    permissionsByMember,
    rolesByMember,
    ensureMemberEntry,
    updatePermissions,
    setPermission,
    setRole,
    restrictMember,
    liftRestrictions,
    muteMember,
    unmuteMember,
    removeMember,
    getPermissions,
    getRole,
    can,
    resetPermissions,
    defaultsByRole: DEFAULT_PERMISSIONS_BY_ROLE,
    getDefaultsForRole: getDefaultPermissionsForRole,
  };
};

export default usePermissions;
