import {createThemedStyles} from '../theme/themedStyles';
import React, {useMemo} from 'react';
import {ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import type {EdgeInsets} from 'react-native-safe-area-context';
import {GroupCallCheck, GroupCallIcon, GroupCallToggle} from './GroupCallIcons';
import {
  GROUP_CALL_DEFAULT_VIEWS,
  GROUP_CALL_GRID_SIZES,
  GROUP_CALL_NOTIFICATION_SOUNDS,
  GROUP_CALL_VIDEO_QUALITIES,
  type GroupCallSettings,
} from '../services/groupCallSettings';
import {
  isConnectedParticipant,
  participantStatusLabel,
  type GroupCallParticipant,
} from '../utils/groupCallModel';
import {formatPhoneNumber} from '../utils/phoneNumber';

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});
const PURPLE = '#7442E8';

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

const matches = (participant: {name: string; phone?: string}, needle: string) =>
  !needle || `${participant.name} ${participant.phone || ''}`.toLowerCase().includes(needle);

/** The design's rounded-square avatar; `online` adds its green presence badge. */
function Avatar({name, online = false, size = 40, uri}: {name: string; online?: boolean; size?: number; uri?: string | null}) {
  const style = {width: size, height: size, borderRadius: Math.round(size * 0.2)};
  return (
    <View>
      {uri
        ? <Image source={{uri}} style={style} />
        : <View style={[style, styles.avatarFallback]}><Text style={[styles.avatarInitials, {fontSize: size * .3}]}>{initialsOf(name)}</Text></View>}
      {online ? <View style={styles.onlineBadge}><GroupCallIcon color="#FFFFFF" name="check" size={8} /></View> : null}
    </View>
  );
}

/** "+91 98765 43210" when the member has a number, else what is known of them. */
const memberDetail = (phone: string | undefined, fallback: string) => (phone ? formatPhoneNumber(phone) : fallback);

function PanelShell({children, insets, onBack, subtitle, title, visible}: {children: React.ReactNode; insets: EdgeInsets; onBack: () => void; subtitle?: string; title: string; visible: boolean}) {
  return (
    <Modal animationType="slide" onRequestClose={onBack} statusBarTranslucent visible={visible}>
      <View style={[styles.panel, {paddingTop: Math.max(insets.top, 14)}]}>
        <View style={styles.panelHeader}>
          <Pressable accessibilityLabel={`Back from ${title}`} hitSlop={12} onPress={onBack} style={styles.panelBack}>
            <GroupCallIcon color="#111827" name="back" size={18} />
          </Pressable>
          <View style={styles.panelHeading}>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.panelTitle}>{title}</Text>
            {subtitle ? <Text style={styles.panelSubtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        {children}
      </View>
    </Modal>
  );
}

function SearchField({accessibilityLabel, onChange, placeholder, value}: {accessibilityLabel: string; onChange: (value: string) => void; placeholder: string; value: string}) {
  return (
    <View style={styles.search}>
      <GroupCallIcon color="#42516A" name="search" size={17} />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#8C97A9"
        style={styles.searchInput}
        value={value}
      />
    </View>
  );
}

// --- Participants -------------------------------------------------------------

type ParticipantsPanelProps = {
  busyParticipantId: string;
  canManage: boolean;
  groupMemberCount: number;
  insets: EdgeInsets;
  offCall: GroupCallParticipant[];
  onAddPeople: () => void;
  onBack: () => void;
  onInvite: (participant: GroupCallParticipant) => void;
  onOpenActions: (participant: GroupCallParticipant) => void;
  onToggleMute: (participant: GroupCallParticipant) => void;
  onSearchChange: (value: string) => void;
  inCall: GroupCallParticipant[];
  search: string;
  visible: boolean;
};

export function GroupCallParticipantsPanel({
  busyParticipantId,
  canManage,
  groupMemberCount,
  insets,
  offCall,
  onAddPeople,
  onBack,
  onInvite,
  onOpenActions,
  onToggleMute,
  onSearchChange,
  inCall,
  search,
  visible,
}: ParticipantsPanelProps) {
  const needle = search.trim().toLowerCase();
  const visibleInCall = useMemo(() => inCall.filter(participant => matches(participant, needle)), [inCall, needle]);
  const visibleOffCall = useMemo(() => offCall.filter(participant => matches(participant, needle)), [offCall, needle]);

  const row = (participant: GroupCallParticipant) => {
    const connected = isConnectedParticipant(participant);
    const statusLabel = participantStatusLabel(participant.status);
    const busy = busyParticipantId === participant.id;
    return (
      <View key={participant.id} style={styles.memberRow}>
        <Avatar name={participant.name} online={connected} uri={participant.profilePic || null} />
        <View style={styles.memberCopy}>
          <Text numberOfLines={1} style={styles.memberName}>
            {participant.name}{participant.isCurrentUser ? ' (You)' : ''}
            {participant.isOrganizer ? <Text style={styles.organizerTag}>  Organizer</Text> : null}
          </Text>
          <Text numberOfLines={1} style={styles.memberMeta}>
            {connected ? memberDetail(participant.phone, statusLabel || 'Group member') : statusLabel || memberDetail(participant.phone, 'Group member')}
          </Text>
        </View>
        {busy ? <ActivityIndicator color={PURPLE} size="small" style={styles.rowBusy} /> : connected ? (
          <>
            <Pressable
              accessibilityLabel={`${participant.isMuted ? 'Unmute' : 'Mute'} ${participant.name}`}
              accessibilityState={{disabled: !canManage && !participant.isCurrentUser, selected: participant.isMuted}}
              disabled={!canManage && !participant.isCurrentUser}
              hitSlop={8}
              onPress={() => onToggleMute(participant)}
              style={styles.rowAction}>
              <GroupCallIcon color={participant.isMuted ? '#E11D48' : '#42516A'} crossed={participant.isMuted} name="microphone" size={17} />
            </Pressable>
            <Pressable accessibilityLabel={`Options for ${participant.name}`} hitSlop={8} onPress={() => onOpenActions(participant)} style={styles.rowAction}>
              <GroupCallIcon color="#1E293B" name="more" size={16} />
            </Pressable>
          </>
        ) : canManage ? (
          <Pressable accessibilityLabel={`Invite ${participant.name} to the call`} hitSlop={8} onPress={() => onInvite(participant)} style={styles.rowAction}>
            <GroupCallIcon color="#1E293B" name="call" size={18} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <PanelShell
      insets={insets}
      onBack={onBack}
      subtitle={`${groupMemberCount} ${groupMemberCount === 1 ? 'Member' : 'Members'}`}
      title="Participants"
      visible={visible}>
      <SearchField accessibilityLabel="Search call participants" onChange={onSearchChange} placeholder="Search Contacts" value={search} />
      <ScrollView contentContainerStyle={styles.panelList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>In Call ({inCall.length})</Text>
        {visibleInCall.length ? visibleInCall.map(row) : <Text style={styles.empty}>No one matches your search.</Text>}
        {offCall.length ? <Text style={styles.sectionLabel}>Not In Call ({offCall.length})</Text> : null}
        {offCall.length ? (visibleOffCall.length ? visibleOffCall.map(row) : <Text style={styles.empty}>No one matches your search.</Text>) : null}
      </ScrollView>
      {canManage ? (
        <View style={[styles.panelFooter, {paddingBottom: Math.max(insets.bottom, 14)}]}>
          <Pressable accessibilityLabel="Add People to Call" onPress={onAddPeople} style={styles.primaryButton}>
            <GroupCallIcon color="#FFFFFF" name="add" size={18} />
            <Text style={styles.primaryButtonText}>Add People to Call</Text>
          </Pressable>
        </View>
      ) : null}
    </PanelShell>
  );
}

// --- Add people ---------------------------------------------------------------

export type AddableParticipant = {userId: string; name: string; phone?: string; profilePic?: string | null; status?: string};

type AddPeoplePanelProps = {
  candidates: AddableParticipant[];
  insets: EdgeInsets;
  loading: boolean;
  onAdd: () => void;
  onBack: () => void;
  onSearchChange: (value: string) => void;
  onToggle: (userId: string) => void;
  recentIds: string[];
  search: string;
  selectedIds: Set<string>;
  submitting: boolean;
  visible: boolean;
};

export function GroupCallAddPeoplePanel({
  candidates,
  insets,
  loading,
  onAdd,
  onBack,
  onSearchChange,
  onToggle,
  recentIds,
  search,
  selectedIds,
  submitting,
  visible,
}: AddPeoplePanelProps) {
  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => candidates.filter(candidate => matches(candidate, needle)), [candidates, needle]);
  const recent = useMemo(() => filtered.filter(candidate => recentIds.includes(candidate.userId)), [filtered, recentIds]);
  const others = useMemo(() => filtered.filter(candidate => !recentIds.includes(candidate.userId)), [filtered, recentIds]);
  const selected = useMemo(() => candidates.filter(candidate => selectedIds.has(candidate.userId)), [candidates, selectedIds]);

  const row = (candidate: AddableParticipant) => {
    const checked = selectedIds.has(candidate.userId);
    return (
      <Pressable
        accessibilityLabel={`${checked ? 'Deselect' : 'Select'} ${candidate.name}`}
        accessibilityRole="checkbox"
        accessibilityState={{checked}}
        key={candidate.userId}
        onPress={() => onToggle(candidate.userId)}
        style={styles.memberRow}>
        <View style={styles.checkSlot}><GroupCallCheck checked={checked} /></View>
        <Avatar name={candidate.name} uri={candidate.profilePic || null} />
        <View style={styles.memberCopy}>
          <Text numberOfLines={1} style={styles.memberName}>{candidate.name}</Text>
          <Text numberOfLines={1} style={styles.memberMeta}>{candidate.status || memberDetail(candidate.phone, 'Group member')}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <PanelShell insets={insets} onBack={onBack} title="Add People" visible={visible}>
      <SearchField accessibilityLabel="Search contacts to add to the call" onChange={onSearchChange} placeholder="Search Contacts" value={search} />
      {selected.length ? (
        <View style={styles.selectedBlock}>
          <View style={styles.selectedHeading}>
            <Text style={styles.selectedLabel}>Selected Participants</Text>
            <View style={styles.selectedCountPill}><Text style={styles.selectedCount}>{selected.length}</Text></View>
          </View>
          <ScrollView contentContainerStyle={styles.chipRow} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
            {selected.map(candidate => (
              <Pressable accessibilityLabel={`Remove ${candidate.name} from the selection`} key={candidate.userId} onPress={() => onToggle(candidate.userId)} style={styles.chip}>
                <Avatar name={candidate.name} size={24} uri={candidate.profilePic || null} />
                <Text numberOfLines={1} style={styles.chipText}>{candidate.name}</Text>
                <View style={styles.chipClose}><GroupCallIcon color="#475569" name="close" size={10} /></View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {loading ? <ActivityIndicator color={PURPLE} style={styles.panelLoading} /> : (
        <ScrollView contentContainerStyle={styles.panelList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {recent.length ? <Text style={styles.sectionLabel}>Recently Contacted</Text> : null}
          {recent.map(row)}
          {others.length ? <Text style={styles.sectionLabel}>{recent.length ? 'All Members' : 'Group Members'}</Text> : null}
          {others.map(row)}
          {!filtered.length ? (
            <Text style={styles.empty}>
              {search ? 'No members match your search.' : 'Everyone in this group is already on the call. Add them to the group first to invite them.'}
            </Text>
          ) : null}
        </ScrollView>
      )}
      <View style={[styles.panelFooter, {paddingBottom: Math.max(insets.bottom, 14)}]}>
        <Pressable
          accessibilityLabel="Add selected people to the call"
          accessibilityState={{busy: submitting, disabled: !selectedIds.size || submitting}}
          disabled={!selectedIds.size || submitting}
          onPress={onAdd}
          style={[styles.primaryButton, (!selectedIds.size || submitting) && styles.primaryButtonDisabled]}>
          {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : <>
            <GroupCallIcon color="#FFFFFF" name="call" size={17} />
            <Text style={styles.primaryButtonText}>Add to Call</Text>
          </>}
        </Pressable>
      </View>
    </PanelShell>
  );
}

// --- Settings -----------------------------------------------------------------

type SettingsPanelProps = {
  insets: EdgeInsets;
  onBack: () => void;
  onChange: <TKey extends keyof GroupCallSettings>(key: TKey, value: GroupCallSettings[TKey]) => void;
  openPicker: keyof GroupCallSettings | '';
  onOpenPicker: (key: keyof GroupCallSettings | '') => void;
  settings: GroupCallSettings;
  visible: boolean;
};

const CHOICES: Partial<Record<keyof GroupCallSettings, readonly string[]>> = {
  defaultView: GROUP_CALL_DEFAULT_VIEWS,
  gridSize: GROUP_CALL_GRID_SIZES,
  notificationSound: GROUP_CALL_NOTIFICATION_SOUNDS,
  videoQuality: GROUP_CALL_VIDEO_QUALITIES,
  screenShareQuality: GROUP_CALL_VIDEO_QUALITIES,
};

export function GroupCallSettingsPanel({insets, onBack, onChange, openPicker, onOpenPicker, settings, visible}: SettingsPanelProps) {
  const toggleRow = (key: keyof GroupCallSettings, title: string, subtitle: string) => (
    <Pressable
      accessibilityLabel={title}
      key={title}
      onPress={() => onChange(key, !settings[key] as never)}
      style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <GroupCallToggle enabled={Boolean(settings[key])} label={title} />
    </Pressable>
  );

  const selectRow = (key: keyof GroupCallSettings, title: string, subtitle: string) => {
    const options = CHOICES[key] || [];
    const open = openPicker === key;
    return (
      <View key={title} style={styles.settingBlock}>
        <View style={styles.settingCopy}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
        <Pressable
          accessibilityLabel={`${title}: ${String(settings[key])}`}
          accessibilityRole="button"
          accessibilityState={{expanded: open}}
          onPress={() => onOpenPicker(open ? '' : key)}
          style={styles.select}>
          <Text style={styles.selectValue}>{String(settings[key])}</Text>
          <View style={open ? styles.selectChevronOpen : undefined}>
            <GroupCallIcon color="#475569" name="minimize" size={16} />
          </View>
        </Pressable>
        {open ? (
          <View accessibilityLabel={`${title} options`} style={styles.selectMenu}>
            {options.map(option => (
              <Pressable
                accessibilityLabel={`Set ${title} to ${option}`}
                accessibilityRole="radio"
                accessibilityState={{selected: settings[key] === option}}
                key={option}
                onPress={() => { onChange(key, option as never); onOpenPicker(''); }}
                style={styles.selectOption}>
                <Text style={[styles.selectOptionText, settings[key] === option && styles.selectOptionTextSelected]}>{option}</Text>
                {settings[key] === option ? <GroupCallIcon color={PURPLE} name="check" size={14} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <PanelShell insets={insets} onBack={onBack} title="Settings" visible={visible}>
      <ScrollView contentContainerStyle={[styles.settingsList, {paddingBottom: Math.max(insets.bottom, 18) + 12}]} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeader}><GroupCallIcon color="#64748B" name="settings" size={13} /><Text style={styles.sectionHeaderText}>GENERAL</Text></View>
        {toggleRow('showReactions', 'Show reactions', 'Show reactions when user interacts with it.')}
        {toggleRow('showParticipantNames', 'Show Participants Name', 'Display names on video tiles.')}
        {toggleRow('playJoinLeaveSounds', 'Play Join/leave Sounds', 'Play a tone when a participant joins or leaves the call.')}
        {toggleRow('focusOnSpeaker', 'Focus on Speaker', 'Highlight the active speaker.')}

        <View style={styles.sectionHeader}><GroupCallIcon color="#64748B" name="grid" size={13} /><Text style={styles.sectionHeaderText}>LAYOUT</Text></View>
        {selectRow('defaultView', 'Default View', 'Select the default view while joining the call.')}
        {selectRow('gridSize', 'Grid Size', 'Select the no. of participants to show per page.')}

        <View style={styles.sectionHeader}><GroupCallIcon color="#64748B" name="bell" size={13} /><Text style={styles.sectionHeaderText}>NOTIFICATIONS</Text></View>
        {toggleRow('notifyWhenSomeoneSpeaks', 'Notify when Someone Speaks', 'Show a notification banner when someone speaks after being muted for a long time.')}
        {selectRow('notificationSound', 'Notification Sound', 'Set the desired sound for the notification for calls.')}

        <View style={styles.sectionHeader}><GroupCallIcon color="#64748B" name="network" size={13} /><Text style={styles.sectionHeaderText}>NETWORK</Text></View>
        {toggleRow('lowBandwidthMode', 'Low Bandwidth Mode', 'Optimize video quality and disable background effects.')}
        {toggleRow('networkQualityIndicator', 'Network Quality Indicator', 'Show connection quality in call.')}
        {toggleRow('adaptiveBitrate', 'Adaptive Bitrate', 'Adjust the sending quality automatically as the network changes.')}
        {selectRow('videoQuality', 'Video Quality', 'Choose the quality for your camera video.')}
        {selectRow('screenShareQuality', 'Screen Share Quality', 'Choose the quality for shared screens.')}
      </ScrollView>
    </PanelShell>
  );
}

const styles = createThemedStyles({
  panel: {flex: 1, backgroundColor: '#FFFFFF'},
  panelHeader: {minHeight: 52, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center'},
  panelBack: {width: 40, height: 44, alignItems: 'center', justifyContent: 'center'},
  panelHeading: {flex: 1, minWidth: 0},
  panelTitle: {color: '#111827', fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: '700'},
  panelSubtitle: {marginTop: 2, color: '#8792A4', fontFamily: FONT_FAMILY, fontSize: 10},
  search: {height: 44, marginHorizontal: 14, marginTop: 4, marginBottom: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#F7F8FA', flexDirection: 'row', alignItems: 'center', gap: 10},
  searchInput: {flex: 1, paddingVertical: 0, color: '#152033', fontFamily: FONT_FAMILY, fontSize: 12},
  panelList: {paddingHorizontal: 14, paddingBottom: 18},
  panelLoading: {marginTop: 40},
  sectionLabel: {marginTop: 16, marginBottom: 4, color: '#8792A4', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '500'},
  selectedHeading: {marginTop: 10, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8},
  selectedLabel: {color: '#475569', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '500'},
  selectedCountPill: {minWidth: 22, height: 18, paddingHorizontal: 6, borderRadius: 9, backgroundColor: '#EFE8FE', alignItems: 'center', justifyContent: 'center'},
  selectedCount: {color: PURPLE, fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: '700'},
  empty: {marginTop: 18, color: '#8792A4', fontFamily: FONT_FAMILY, fontSize: 10, lineHeight: 15, textAlign: 'center'},
  memberRow: {minHeight: 62, flexDirection: 'row', alignItems: 'center'},
  memberCopy: {flex: 1, minWidth: 0, marginLeft: 12},
  memberName: {color: '#172033', fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '500'},
  organizerTag: {color: PURPLE, fontSize: 9, fontWeight: '700'},
  memberMeta: {marginTop: 3, color: '#758196', fontFamily: FONT_FAMILY, fontSize: 10},
  rowAction: {width: 34, height: 38, alignItems: 'center', justifyContent: 'center'},
  rowBusy: {width: 34},
  checkSlot: {width: 30, alignItems: 'flex-start', justifyContent: 'center'},
  avatarFallback: {backgroundColor: '#EDE5FC', alignItems: 'center', justifyContent: 'center'},
  onlineBadge: {position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderWidth: 1.5, borderColor: '#FFFFFF', borderRadius: 4, backgroundColor: '#22B573', alignItems: 'center', justifyContent: 'center'},
  avatarInitials: {color: '#7137DD', fontFamily: FONT_FAMILY, fontWeight: '700'},
  selectedBlock: {paddingHorizontal: 14},
  chipRow: {paddingVertical: 4, gap: 7},
  chip: {height: 36, paddingLeft: 5, paddingRight: 6, borderWidth: 1, borderColor: '#EEF1F5', borderRadius: 18, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6},
  chipText: {maxWidth: 104, color: '#1F2937', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '500'},
  chipClose: {width: 18, height: 18, borderRadius: 9, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center'},
  panelFooter: {paddingHorizontal: 14, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EEF1F5', backgroundColor: '#FFFFFF'},
  primaryButton: {height: 48, borderRadius: 8, backgroundColor: '#8B5CF6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8},
  primaryButtonDisabled: {opacity: .45},
  primaryButtonText: {color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '700'},
  settingsList: {paddingHorizontal: 14},
  sectionHeader: {marginTop: 16, marginBottom: 2, flexDirection: 'row', alignItems: 'center', gap: 6},
  sectionHeaderText: {color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 9, fontWeight: '700', letterSpacing: .6},
  settingRow: {minHeight: 58, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F1F3F7', flexDirection: 'row', alignItems: 'center', gap: 10},
  settingBlock: {paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F1F3F7'},
  settingCopy: {flex: 1, minWidth: 0},
  settingTitle: {color: '#172033', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '600'},
  settingSubtitle: {marginTop: 3, color: '#8792A4', fontFamily: FONT_FAMILY, fontSize: 9, lineHeight: 13},
  select: {height: 40, marginTop: 8, paddingHorizontal: 11, borderWidth: 1, borderColor: '#E5E9F0', borderRadius: 8, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  selectValue: {color: '#334155', fontFamily: FONT_FAMILY, fontSize: 11},
  selectChevronOpen: {transform: [{rotate: '180deg'}]},
  selectMenu: {marginTop: 5, borderWidth: 1, borderColor: '#EDF0F5', borderRadius: 8, backgroundColor: '#FBFBFD', overflow: 'hidden'},
  selectOption: {height: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  selectOptionText: {color: '#475569', fontFamily: FONT_FAMILY, fontSize: 11},
  selectOptionTextSelected: {color: PURPLE, fontWeight: '700'},
});
