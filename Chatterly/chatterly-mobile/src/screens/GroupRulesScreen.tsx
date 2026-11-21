import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GroupProfileIcon } from '../components/GroupProfileIcon';
import type {ChatMessage} from '../types/chat';
import { sendGroupTimelineNotice, updateGroupRules } from '../services/groupApi';
import { createThemedStyles } from '../theme/themedStyles';

type Props = {
  groupId: string;
  rules: string[];
  onBack: () => void;
  onSaved: (rules: string[]) => void;
  onTimelineMessage?: (message: ChatMessage) => void;
};
// Keep the mobile editor aligned with the existing web group-rules limit.
const GROUP_RULES_MAX_LENGTH = 150;
const GROUP_RULES_WARNING_LENGTH = Math.ceil(GROUP_RULES_MAX_LENGTH * 0.9);
const limitRuleText = (text: string) =>
  Array.from(text).slice(0, GROUP_RULES_MAX_LENGTH).join('');

export function GroupRulesScreen({ groupId, rules, onBack, onSaved, onTimelineMessage }: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(
    rules.map((text, id) => ({ id, text: limitRuleText(text) })),
  );
  const [nextId, setNextId] = useState(rules.length);
  const [saving, setSaving] = useState(false);
  const [persistedRules, setPersistedRules] = useState(rules);
  const [noticePending, setNoticePending] = useState(false);
  const values = draft.map(rule => rule.text.trim()).filter(Boolean);
  const changed = noticePending || JSON.stringify(values) !== JSON.stringify(rules);
  const save = async () => {
    if (saving) return;
    if (!changed) {
      onBack();
      return;
    }
    setSaving(true);
    let rulesCommitted = noticePending;
    try {
      // Retry a failed notice without repeating an already committed rules update.
      if (JSON.stringify(values) !== JSON.stringify(persistedRules)) {
        await updateGroupRules(groupId, values);
        rulesCommitted = true;
        setPersistedRules(values);
        setNoticePending(true);
      }
      const notice = await sendGroupTimelineNotice(groupId, 'Group rules updated.');
      onTimelineMessage?.(notice);
      setNoticePending(false);
      onSaved(values);
      onBack();
    } catch (error) {
      Alert.alert(
        rulesCommitted ? 'Rules saved, notification failed' : 'Unable to save rules',
        rulesCommitted ? 'Your rules were saved. Tap Save to retry the notification.' : error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };
  const back = () => {
    if (saving) return;
    if (!changed) onBack();
    else
      Alert.alert(
        noticePending ? 'Retry rules notification?' : 'Save rule changes?',
        noticePending ? 'Your rules are saved, but the group notification has not been sent.' : 'Your changes have not been saved.', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: noticePending ? 'Close' : 'Discard', style: 'destructive', onPress: () => {
          if (noticePending) onSaved(persistedRules);
          onBack();
        } },
        { text: noticePending ? 'Retry' : 'Save', onPress: save },
      ]);
  };
  const move = (index: number) => {
    if (index === 0 || saving) return;
    setDraft(current => {
      const next = [...current];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };
  return (
    <Modal
      visible
      statusBarTranslucent
      animationType="slide"
      onRequestClose={back}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          s.screen,
          {
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={s.header}>
          <Pressable
            accessibilityLabel="Back from rules"
            onPress={back}
            style={s.back}
          >
            <GroupProfileIcon name="back" size={22} />
          </Pressable>
          <Text style={s.title}>Rules</Text>
          {changed && (
            <Pressable
              accessibilityLabel="Save Group Rules"
              disabled={saving}
              onPress={save}
              style={s.save}
            >
              <Text style={s.purple}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          )}
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.content}
        >
          {draft.map((rule, index) => {
            const ruleLength = Array.from(rule.text).length;
            const atLimit = ruleLength === GROUP_RULES_MAX_LENGTH;
            const nearLimit = ruleLength >= GROUP_RULES_WARNING_LENGTH;
            return (
              <View key={rule.id} style={s.row}>
                <Pressable
                  accessibilityLabel={`Move rule ${index + 1} up`}
                  accessibilityHint="Moves this rule one position earlier"
                  disabled={saving || index === 0}
                  onPress={() => move(index)}
                  style={s.number}
                >
                  <Text style={s.numberText}>⠿ {index + 1}</Text>
                </Pressable>
                <View style={s.ruleContent}>
                  <TextInput
                    accessibilityLabel={`Rule ${index + 1}`}
                    editable={!saving}
                    multiline
                    placeholder="Enter a rule"
                    autoFocus={rule.id >= rules.length}
                    maxLength={GROUP_RULES_MAX_LENGTH}
                    value={rule.text}
                    onChangeText={text =>
                      setDraft(current =>
                        current.map(item =>
                          item.id === rule.id
                            ? { ...item, text: limitRuleText(text) }
                            : item,
                        ),
                      )
                    }
                    style={s.input}
                  />
                  <View style={s.counterRow}>
                    <Text
                      testID={`rule-${rule.id}-character-count`}
                      accessibilityLabel={`Rule ${index + 1} character count`}
                      style={[s.counter, nearLimit && s.counterWarning]}
                    >
                      {ruleLength}/{GROUP_RULES_MAX_LENGTH}
                    </Text>
                    {nearLimit && (
                      <Text
                        testID={`rule-${rule.id}-character-limit-warning`}
                        accessibilityLabel={`Rule ${
                          index + 1
                        } character limit warning`}
                        style={s.counterWarning}
                      >
                        {atLimit
                          ? 'Character limit reached'
                          : 'Approaching character limit'}
                      </Text>
                    )}
                  </View>
                </View>
                <Pressable
                  accessibilityLabel={`Remove rule ${index + 1}`}
                  disabled={saving}
                  onPress={() =>
                    setDraft(current =>
                      current.filter(item => item.id !== rule.id),
                    )
                  }
                  style={s.back}
                >
                  <Text style={s.close}>×</Text>
                </Pressable>
              </View>
            );
          })}
          {!draft.length && (
            <Text style={s.empty}>Add your first group rule.</Text>
          )}
        </ScrollView>
        <Pressable
          accessibilityLabel="Add new rule"
          disabled={saving}
          onPress={() => {
            setDraft(current => [...current, { id: nextId, text: '' }]);
            setNextId(nextId + 1);
          }}
          style={s.add}
        >
          <Text style={s.purple}>＋ Add new</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const s = createThemedStyles({
  screen: { flex: 1, backgroundColor: 'white' },
  header: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  back: { padding: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#0B1220' },
  save: { marginLeft: 'auto', padding: 8 },
  purple: { color: '#6125DC', fontSize: 16 },
  content: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    minHeight: 40,
    gap: 8,
  },
  number: { padding: 8, borderRadius: 5, backgroundColor: '#F5F5F5' },
  numberText: { color: '#64748B', fontSize: 14 },
  ruleContent: { flex: 1 },
  input: { fontSize: 15, color: '#0B1220', padding: 4 },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 2,
    gap: 8,
  },
  counter: { color: '#64748B', fontSize: 12 },
  counterWarning: { color: '#D97706', fontSize: 12, fontWeight: '600' },
  close: { fontSize: 26, color: '#64748B' },
  empty: { color: '#64748B', paddingVertical: 20 },
  add: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#F1EBFE',
    alignItems: 'center',
  },
});
