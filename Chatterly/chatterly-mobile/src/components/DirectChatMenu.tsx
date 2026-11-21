import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { apiRequest } from '../api/client';
import { API_BASE_URL } from '../config/api';
import { getSession, getToken } from '../services/sessionStore';
import {ReportFlowSheet} from './ReportFlowSheet';
import {BackIcon} from './ChatIcons';
import {DISAPPEARING_TIMER_OPTIONS, getStoredChatDisappearingTimer, timerLabel} from '../services/disappearingMessages';
import {getPrivacySettings, type DisappearingMessageDuration} from '../services/privacyApi';
import {
  getConversationMuted,
  setConversationMuted,
} from '../services/conversationPreferences';
import {createThemedStyles, themeInk} from '../theme/themedStyles';

export function DirectChatMenu({
  visible,
  blocked,
  chatId,
  userId,
  onClose,
  onProfile,
  onEditContact,
  onBlock,
  onSelect,
  onClear,
  onDelete,
  onNotice,
  onReportSubmitted,
  onDisappearingTimerChange,
  timerRequestKey = 0,
  currentTimer,
}: {
  visible: boolean;
  blocked: boolean;
  chatId: string;
  userId: string;
  onClose: () => void;
  onProfile: () => void;
  /** Edit Contact: the name (and phone address book entry) for this person. */
  onEditContact?: () => void;
  onBlock: () => void;
  onSelect: () => void;
  onClear: () => void;
  onDelete: () => void;
  onNotice: (message: string) => void;
  onReportSubmitted?: (message: string) => void;
  onDisappearingTimerChange?: (timer: DisappearingMessageDuration) => Promise<void>;
  timerRequestKey?: number;
  currentTimer?: DisappearingMessageDuration;
}) {
  const insets = useSafeAreaInsets();
  const [pinned, setPinned] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [selectedTimer, setSelectedTimer] = useState<DisappearingMessageDuration>('off');
  const [defaultTimer, setDefaultTimer] = useState<DisappearingMessageDuration>('off');
  const [savingTimer, setSavingTimer] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  useEffect(() => {
    if (timerRequestKey > 0) { setTimerOpen(true); }
  }, [timerRequestKey]);
  useEffect(() => {
    if (!timerOpen) { return; }
    let active = true;
    Promise.all([
      getStoredChatDisappearingTimer(chatId),
      getPrivacySettings().then(settings => settings.disappearingMessages).catch(() => 'off' as DisappearingMessageDuration),
    ]).then(([chatTimer, globalTimer]) => {
      if (active) {
        setSelectedTimer(currentTimer ?? chatTimer);
        setDefaultTimer(globalTimer);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [chatId, currentTimer, timerOpen]);
  const request = async (path: string, body: object) => {
    await apiRequest(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(body),
    });
  };
  const run = (action: () => Promise<void>) => {
    action().catch(error =>
      onNotice(
        error instanceof Error
          ? error.message
          : 'Unable to update chat. Please try again.',
      ),
    );
  };
  const rows: [string, string, () => void][] = [
    [
      'Contact Info',
      'M12 10v7m0-10v.1 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
      onProfile,
    ],
    ...(onEditContact ? [[
      'Edit Contact',
      'M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4M13.5 6.5l4 4',
      onEditContact,
    ] as [string, string, () => void]] : []),
    [
      'Mute Notification',
      'm3 3 18 18M18 13V9a6 6 0 0 0-10-4M6 9v5l-2 4h12m-6 3h4',
      () =>
        run(async () => {
          const muted = !(await getConversationMuted(chatId));
          await setConversationMuted(chatId, muted);
          onNotice(muted ? 'Notifications muted.' : 'Notifications unmuted.');
        }),
    ],
    [
      'Disappearing Messages',
      'M6 7h12M6 11h8M4 3h16v14h-8l-5 4v-4H4z',
      () => setTimerOpen(true),
    ],
    [
      pinned ? 'Unpin Chat' : 'Pin Chat',
      'M8 3h8m-7 0v6l-3 5h12l-3-5V3M12 14v8',
      () =>
        run(async () => {
          await request(pinned ? '/chats/unpin-chat' : '/chats/pin-chat', {
            chatId,
          });
          setPinned(!pinned);
          onNotice(pinned ? 'Chat unpinned.' : 'Chat pinned.');
        }),
    ],
    [
      'Select Chats',
      'm7 12 3 3 7-7M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
      onSelect,
    ],
    [
      'Report',
      'M12 7v5m0 3v.1M4 3h16v14h-8l-5 4v-4H4z',
      () => setReportOpen(true),
    ],
    [
      blocked ? 'Unblock' : 'Block',
      'm5 19 14-14M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
      onBlock,
    ],
    [
      'Clear Chat',
      'm3 14 11-11 7 7-11 11H7zM11 6l7 7M10 21h12',
      () =>
        Alert.alert(
          'Clear Chat?',
          'This removes the messages from your chat history.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear',
              style: 'destructive',
              onPress: () =>
                run(async () => {
                  await request('/chats/clear', { chatId });
                  onClear();
                }),
            },
          ],
        ),
    ],
    [
      'Delete Chat',
      'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
      () =>
        Alert.alert(
          'Delete Chat?',
          'This removes this conversation from your chat list.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () =>
                run(async () => {
                  await request('/chats/delete', { chatId });
                  onDelete();
                }),
            },
          ],
        ),
    ],
  ];
  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={s.overlay}>
          <Pressable
            accessibilityLabel="Close user options"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <View style={s.handle} />
            <Pressable
              accessibilityLabel="Close user options"
              onPress={onClose}
              style={s.close}
            >
              <Text style={s.closeText}>×</Text>
            </Pressable>
            <ScrollView>
              {rows.map(([label, path, action]) => (
                <Pressable
                  accessibilityLabel={label}
                  accessibilityRole="button"
                  key={label}
                  onPress={() => {
                    onClose();
                    setTimeout(action, 350);
                  }}
                  style={[
                    s.row,
                    label === 'Report' && s.divider,
                    (label === 'Block' || label === 'Unblock') && s.standardRow,
                  ]}
                >
                  <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
                    <Path
                      d={path}
                      stroke={label === 'Block' || label === 'Unblock' ? themeInk('#EF2027') : themeInk('#0B1220')}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                  <Text style={[s.label, (label === 'Block' || label === 'Unblock') && s.red]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={timerOpen}
        animationType="slide"
        onRequestClose={() => setTimerOpen(false)}
      >
        <View style={s.timerScreen}>
          <View style={[s.timerHeader, {paddingTop: insets.top + 6}]}>
            <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={12} onPress={() => setTimerOpen(false)} style={s.timerBack}><BackIcon/></Pressable>
            <Text style={s.timerTitle}>Disappearing Messages</Text>
            <View style={s.timerHeaderSpacer}/>
          </View>
          <ScrollView contentContainerStyle={s.timerContent}>
            <Text style={s.timerHeading}>Automatically delete messages in new chats</Text>
            <Text style={s.timerIntro}>Choose how long messages stay in new conversations before they're automatically deleted. This won't affect your existing chats.</Text>
            <View style={s.timerChoices}>
              {DISAPPEARING_TIMER_OPTIONS.map(option => {
                const selected = selectedTimer === option;
                const isDefault = defaultTimer === option && option !== 'off';
                return <Pressable accessibilityLabel={timerLabel(option).toLowerCase()} accessibilityRole="radio" accessibilityState={{checked: selected}} disabled={savingTimer} key={option} onPress={() => setSelectedTimer(option)} style={s.timerChoiceRow}>
                  <View style={[s.timerRadio, selected && s.timerRadioSelected]}>{selected ? <Svg width={13} height={13} viewBox="0 0 16 16" fill="none"><Path d="m4 8.2 2.4 2.4L12 5" stroke={themeInk('#FFFFFF')} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></Svg> : null}</View>
                  <Text style={s.timerChoiceLabel}>{timerLabel(option)}</Text>
                  {isDefault ? <View style={s.defaultPill}><Text style={s.defaultPillText}>Default</Text></View> : null}
                </Pressable>;
              })}
            </View>
          </ScrollView>
          <View style={[s.timerBottom, {paddingBottom: Math.max(insets.bottom + 8, 16)}]}>
            <Pressable accessibilityLabel="Update Timer" accessibilityRole="button" accessibilityState={{busy: savingTimer, disabled: savingTimer}} disabled={savingTimer} onPress={() => {
              setSavingTimer(true);
              (onDisappearingTimerChange ? onDisappearingTimerChange(selectedTimer) : request('/chats/set-disappearing-timer', {sender: getSession()?.user?.id, receiver: userId, timer: selectedTimer}))
                .then(() => setTimerOpen(false))
                .catch(error => onNotice(error instanceof Error ? error.message : 'Unable to update disappearing messages.'))
                .finally(() => setSavingTimer(false));
            }} style={({pressed}) => [s.timerUpdateButton, pressed && s.timerUpdatePressed]}>
              {savingTimer ? <ActivityIndicator color="#FFFFFF" size="small"/> : <Text style={s.timerUpdateText}>Update Timer</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
      <ReportFlowSheet
        reportedUserId={userId}
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onSuccess={message => {
          setReportOpen(false);
          if (onReportSubmitted) onReportSubmitted(message);
          else onNotice(message);
        }}
      />
    </>
  );
}
const s = createThemedStyles({
  choiceTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0B1220',
    paddingHorizontal: 32,
    paddingBottom: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.38)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    paddingTop: 64,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#FFF',
  },
  handle: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
  },
  close: {
    position: 'absolute',
    top: 20,
    right: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 30, color: '#0B1220' },
  row: {
    minHeight: 60,
    backgroundColor: 'transparent',
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  standardRow: {backgroundColor: '#FFFFFF'},
  label: { fontFamily: Platform.select({android: 'sans-serif', ios: 'System'}), fontSize: 12, fontWeight: '500', color: '#0B1220' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#E1E6EF' },
  red: { color: '#EF2027' },
  timerScreen: {flex: 1, backgroundColor: '#FFFFFF'},
  timerHeader: {
    minHeight: 76,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerBack: {width: 36, height: 44, alignItems: 'center', justifyContent: 'center'},
  timerTitle: {flex: 1, marginLeft: 2, color: '#111827', fontSize: 14, fontWeight: '700'},
  timerHeaderSpacer: {width: 36},
  timerContent: {paddingHorizontal: 24, paddingTop: 23, paddingBottom: 140},
  timerHeading: {color: '#111827', fontSize: 13, fontWeight: '600', lineHeight: 18},
  timerIntro: {marginTop: 8, maxWidth: 314, color: '#64748B', fontSize: 10, lineHeight: 15},
  timerChoices: {marginTop: 27},
  timerChoiceRow: {height: 51, flexDirection: 'row', alignItems: 'center'},
  timerRadio: {width: 20, height: 20, borderRadius: 10, borderWidth: 1.4, borderColor: '#7D8CA3', alignItems: 'center', justifyContent: 'center'},
  timerRadioSelected: {borderColor: '#8B5CF6', backgroundColor: '#8B5CF6'},
  timerChoiceLabel: {marginLeft: 12, color: '#111827', fontSize: 13, fontWeight: '600'},
  defaultPill: {height: 22, marginLeft: 11, paddingHorizontal: 12, borderRadius: 11, backgroundColor: '#EEE6FF', alignItems: 'center', justifyContent: 'center'},
  defaultPillText: {color: '#6F28F5', fontSize: 10, fontWeight: '700'},
  timerBottom: {paddingHorizontal: 16, paddingTop: 13, backgroundColor: '#FFFFFF'},
  timerUpdateButton: {height: 44, borderRadius: 5, backgroundColor: '#8752F5', alignItems: 'center', justifyContent: 'center', shadowColor: '#6031C5', shadowOffset: {width: 0, height: 2}, shadowOpacity: .22, shadowRadius: 3, elevation: 3},
  timerUpdatePressed: {opacity: .9},
  timerUpdateText: {color: '#FFFFFF', fontSize: 11, fontWeight: '600'},
});
