const isObjectRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const toRuleText = (value) => {
  if (isObjectRecord(value)) {
    return String(
      value.ruleText ||
        value.text ||
        value.rule ||
        value.content ||
        value.title ||
        value.description ||
        ''
    ).trim();
  }

  return String(value ?? '').trim();
};

const normalizeRuleTimestamp = (value) => {
  const timestamp = String(value || '').trim();
  if (!timestamp) return '';

  const parsedTimestamp = new Date(timestamp);
  return Number.isNaN(parsedTimestamp.getTime()) ? timestamp : parsedTimestamp.toISOString();
};

const buildRuleId = (ruleText, index = 0) => {
  const source = String(ruleText || `rule-${index + 1}`);
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }

  return `rule-${index + 1}-${hash.toString(36)}`;
};

export const createGroupRuleModel = (rule, options = {}) => {
  const ruleText = toRuleText(rule);
  if (!ruleText) return null;

  const ruleId = isObjectRecord(rule)
    ? String(rule.ruleId || rule.id || rule._id || '').trim()
    : '';

  return {
    ruleId: ruleId || buildRuleId(ruleText, options.index),
    ruleText,
    createdBy: String(
      (isObjectRecord(rule) ? rule.createdBy || rule.created_by || rule.creatorId : '') ||
        options.createdBy ||
        ''
    ).trim(),
    updatedAt: normalizeRuleTimestamp(
      (isObjectRecord(rule)
        ? rule.updatedAt || rule.updated_at || rule.modifiedAt || rule.createdAt
        : '') ||
        options.updatedAt ||
        ''
    ),
  };
};

export const normalizeGroupRuleList = (value, options = {}) => {
  const sourceRules = Array.isArray(value)
    ? value
    : String(value || '')
        .replace(/\r\n/g, '\n')
        .split('\n');

  return sourceRules.reduce((rules, rule, index) => {
    const normalizedRule = createGroupRuleModel(rule, {
      ...options,
      index,
    });

    if (normalizedRule) {
      rules.push(normalizedRule);
    }

    return rules;
  }, []);
};

export const serializeGroupRulesText = (rules = []) =>
  normalizeGroupRuleList(rules)
    .map((rule) => rule.ruleText)
    .filter(Boolean)
    .join('\n');
