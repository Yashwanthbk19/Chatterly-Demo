import { useCallback, useMemo, useState } from 'react';
import { createGroupRuleModel, normalizeGroupRuleList, toRuleText } from '../utils/groupRules';

const toTrimmedString = (value) => String(value ?? '').trim();

const toMemberIdList = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];

  value.forEach((entry) => {
    if (entry === undefined || entry === null) return;
    const id =
      typeof entry === 'string' || typeof entry === 'number'
        ? toTrimmedString(entry)
        : toTrimmedString(
            entry.memberId ||
              entry.member_id ||
              entry.userId ||
              entry.id ||
              entry._id ||
              entry.participantId
          );

    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });

  return result;
};

const resolveMemberCount = (group) => {
  if (!group) return 0;
  const explicitCount = Number(group.memberCount);
  if (Number.isFinite(explicitCount) && explicitCount > 0) return explicitCount;
  return Array.isArray(group.members) ? group.members.length : 0;
};

const ROLES = Object.freeze({ SUPER_ADMIN: 'superadmin', ADMIN: 'admin', MODERATOR: 'moderator', MEMBER: 'member' });

const EMPTY_OVERRIDES = Object.freeze({
  description: null,
  rules: null,
  admins: null,
  moderators: null,
});

const buildGroupInfoFromSource = (group) => {
  const safeGroup = group || {};
  return {
    groupName: toTrimmedString(safeGroup.groupName || safeGroup.name),
    groupImage: toTrimmedString(
      safeGroup.groupPhoto || safeGroup.profilePic || safeGroup.photo || safeGroup.avatar
    ),
    createdBy: toTrimmedString(safeGroup.createdBy?._id || safeGroup.createdBy?.id || safeGroup.createdBy || safeGroup.creatorId || safeGroup.ownerId),
    memberCount: resolveMemberCount(safeGroup),
    description: toTrimmedString(safeGroup.description),
    rules: normalizeGroupRuleList(safeGroup.groupRules ?? safeGroup.rules, {
      createdBy: safeGroup.createdBy || safeGroup.creatorId || safeGroup.ownerId,
      updatedAt: safeGroup.updatedAt || safeGroup.createdAt,
    }),
    admins: toMemberIdList(safeGroup.admins),
    moderators: toMemberIdList(safeGroup.moderators),
  };
};

/**
 * useGroupInfo — central state for a group's info panel.
 *
 * Returns a normalized `groupInfo` shape plus update handlers for the parts
 * of group info that change at runtime: rules, description, and role
 * hierarchy (admins/moderators). The shape is suitable for driving dynamic
 * group information rendering.
 */
export const useGroupInfo = (group) => {
  const [overrides, setOverrides] = useState(EMPTY_OVERRIDES);

  const baseGroupInfo = buildGroupInfoFromSource(group);

  const groupInfo = useMemo(
    () => ({
      ...baseGroupInfo,
      description: overrides.description ?? baseGroupInfo.description,
      rules: overrides.rules ?? baseGroupInfo.rules,
      admins: overrides.admins ?? baseGroupInfo.admins,
      moderators: overrides.moderators ?? baseGroupInfo.moderators,
    }),
    [baseGroupInfo, overrides]
  );

  const setDescription = useCallback((nextDescription) => {
    const normalized = toTrimmedString(nextDescription);
    setOverrides((current) => ({ ...current, description: normalized }));
  }, []);

  const setRules = useCallback((nextRules) => {
    const updatedAt = new Date().toISOString();
    setOverrides((current) => ({
      ...current,
      rules: normalizeGroupRuleList(nextRules, {
        createdBy: groupInfo.createdBy,
        updatedAt,
      }),
    }));
  }, [groupInfo.createdBy]);

  const addRule = useCallback(
    (rule) => {
      const normalized = toRuleText(rule);
      if (!normalized) return;
      setOverrides((current) => {
        const currentRules = current.rules ?? groupInfo.rules;
        if (currentRules.some((currentRule) => toRuleText(currentRule) === normalized)) return current;
        const nextRule = createGroupRuleModel(rule, {
          index: currentRules.length,
          createdBy: groupInfo.createdBy,
          updatedAt: new Date().toISOString(),
        });
        if (!nextRule) return current;
        return { ...current, rules: [...currentRules, nextRule] };
      });
    },
    [groupInfo.createdBy, groupInfo.rules]
  );

  const updateRule = useCallback(
    (index, rule) => {
      const normalized = toRuleText(rule);
      setOverrides((current) => {
        const currentRules = current.rules ?? groupInfo.rules;
        if (index < 0 || index >= currentRules.length) return current;
        const nextRules = currentRules.slice();
        if (!normalized) {
          nextRules.splice(index, 1);
        } else {
          nextRules[index] = createGroupRuleModel(
            {
              ...nextRules[index],
              ...(typeof rule === 'object' && rule ? rule : {}),
              ruleText: normalized,
              updatedAt: new Date().toISOString(),
            },
            {
              index,
              createdBy: groupInfo.createdBy,
            }
          );
        }
        return { ...current, rules: nextRules };
      });
    },
    [groupInfo.createdBy, groupInfo.rules]
  );

  const removeRule = useCallback(
    (index) => {
      setOverrides((current) => {
        const currentRules = current.rules ?? groupInfo.rules;
        if (index < 0 || index >= currentRules.length) return current;
        const nextRules = currentRules.slice();
        nextRules.splice(index, 1);
        return { ...current, rules: nextRules };
      });
    },
    [groupInfo.rules]
  );

  const promoteToAdmin = useCallback(
    (memberId) => {
      const id = toTrimmedString(memberId);
      if (!id) return;
      setOverrides((current) => {
        const currentAdmins = current.admins ?? groupInfo.admins;
        const currentModerators = current.moderators ?? groupInfo.moderators;
        return {
          ...current,
          admins: currentAdmins.includes(id) ? currentAdmins : [...currentAdmins, id],
          moderators: currentModerators.filter((existingId) => existingId !== id),
        };
      });
    },
    [groupInfo.admins, groupInfo.moderators]
  );

  const promoteToModerator = useCallback(
    (memberId) => {
      const id = toTrimmedString(memberId);
      if (!id) return;
      setOverrides((current) => {
        const currentAdmins = current.admins ?? groupInfo.admins;
        const currentModerators = current.moderators ?? groupInfo.moderators;
        if (currentAdmins.includes(id) || currentModerators.includes(id)) return current;
        return { ...current, moderators: [...currentModerators, id] };
      });
    },
    [groupInfo.admins, groupInfo.moderators]
  );

  const demoteToMember = useCallback(
    (memberId) => {
      const id = toTrimmedString(memberId);
      if (!id || id === groupInfo.createdBy) return;
      setOverrides((current) => {
        const currentAdmins = current.admins ?? groupInfo.admins;
        const currentModerators = current.moderators ?? groupInfo.moderators;
        return {
          ...current,
          admins: currentAdmins.filter((existingId) => existingId !== id),
          moderators: currentModerators.filter((existingId) => existingId !== id),
        };
      });
    },
    [groupInfo.admins, groupInfo.moderators, groupInfo.createdBy]
  );

  const transferAdminRights = useCallback(
    (fromMemberId, toMemberId) => {
      const fromId = toTrimmedString(fromMemberId);
      const toId = toTrimmedString(toMemberId);
      if (!toId) return;
      setOverrides((current) => {
        const currentAdmins = current.admins ?? groupInfo.admins;
        const currentModerators = current.moderators ?? groupInfo.moderators;
        return {
          ...current,
          admins: [
            ...currentAdmins.filter(
              (existingId) => (existingId !== fromId || existingId === groupInfo.createdBy) && existingId !== toId
            ),
            toId,
          ],
          moderators: currentModerators.filter((existingId) => existingId !== toId),
        };
      });
    },
    [groupInfo.admins, groupInfo.moderators, groupInfo.createdBy]
  );

  const getMemberRole = useCallback(
    (memberId) => {
      const id = toTrimmedString(memberId);
      if (!id) return ROLES.MEMBER;
      if (id === groupInfo.createdBy) return ROLES.SUPER_ADMIN;
      if (groupInfo.admins.includes(id)) return ROLES.ADMIN;
      if (groupInfo.moderators.includes(id)) return ROLES.MODERATOR;
      return ROLES.MEMBER;
    },
    [groupInfo.admins, groupInfo.moderators, groupInfo.createdBy]
  );

  const roleHierarchy = useMemo(() => {
    const moderatorIds = groupInfo.moderators.filter((id) => !groupInfo.admins.includes(id));
    return {
      admins: groupInfo.admins,
      moderators: moderatorIds,
      adminCount: groupInfo.admins.length,
      moderatorCount: moderatorIds.length,
    };
  }, [groupInfo.admins, groupInfo.moderators]);

  const memberCountLabel = useMemo(
    () => (groupInfo.memberCount === 1 ? '1 member' : `${groupInfo.memberCount} members`),
    [groupInfo.memberCount]
  );

  const resetGroupInfo = useCallback(() => setOverrides(EMPTY_OVERRIDES), []);

  return {
    groupInfo,
    roleHierarchy,
    memberCountLabel,
    setDescription,
    setRules,
    addRule,
    updateRule,
    removeRule,
    promoteToAdmin,
    promoteToModerator,
    demoteToMember,
    transferAdminRights,
    getMemberRole,
    resetGroupInfo,
  };
};

export const GROUP_INFO_ROLES = ROLES;
