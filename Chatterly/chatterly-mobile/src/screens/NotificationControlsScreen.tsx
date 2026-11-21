import {createThemedStyles, themeInk} from '../theme/themedStyles';
import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {Snackbar} from '../components/Snackbar';
import {playNotificationTonePreview as playNotificationTone} from '../services/callRingtone';
import {vibrateNotification} from '../services/notificationVibration';
import {DEFAULT_NOTIFICATION_SETTINGS, getNotificationSettings, loadStoredNotificationSettings, NOTIFICATION_TONES, normalizeNotificationSettings, storeNotificationSettings, updateNotificationSettings, type NotificationSettings, type NotificationTone, type VibrationPattern} from '../services/notificationPreferencesApi';

const FONT = Platform.select({android: 'sans-serif', ios: 'System'});
const PURPLE = '#8752F5';

function BackIcon() { return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="M15 6 9 12l6 6" stroke={themeInk('#182230')} strokeWidth={1.55} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function SearchIcon() { return <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"><Circle cx={10.8} cy={10.8} r={5.7} stroke={themeInk('#526177')} strokeWidth={1.45}/><Path d="m15.1 15.1 4.1 4.1" stroke={themeInk('#526177')} strokeWidth={1.45} strokeLinecap="round"/></Svg>; }
function CloseIcon() { return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="m6 6 12 12M18 6 6 18" stroke={themeInk('#344054')} strokeWidth={1.5} strokeLinecap="round"/></Svg>; }
function CheckIcon() { return <Svg width={10} height={10} viewBox="0 0 24 24" fill="none"><Path d="m5 13 4 4L19 7" stroke={themeInk('#FFF')} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function MessageIcon() { return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Rect x={4} y={5} width={16} height={13} rx={2} stroke={themeInk('#172033')} strokeWidth={1.35}/><Path d="M8 18v2l3-2M8 10h8M8 13h5" stroke={themeInk('#172033')} strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function GroupsIcon() { return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={9} cy={8} r={2.5} stroke={themeInk('#172033')} strokeWidth={1.35}/><Path d="M4 18v-1.2A3.8 3.8 0 0 1 7.8 13h2.4a3.8 3.8 0 0 1 3.8 3.8V18M15 7a2.2 2.2 0 0 1 0 4.4M17 13.5a3.3 3.3 0 0 1 3 3.3V18" stroke={themeInk('#172033')} strokeWidth={1.35} strokeLinecap="round"/></Svg>; }
function PhoneIcon() { return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="M7.2 4.8 10 9.2 8.2 11.3a13.5 13.5 0 0 0 4.5 4.5l2.1-1.8 4.4 2.8-.5 2.3c-.12.55-.63.93-1.2.87C10.4 19.1 4.9 13.6 4.1 6.5c-.07-.57.32-1.08.87-1.2l2.23-.5Z" stroke={themeInk('#172033')} strokeWidth={1.35} strokeLinejoin="round"/></Svg>; }
function PopupIcon() { return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="M6 16.5h12M7 16.5V11a5 5 0 0 1 10 0v5.5M4.7 16.5h14.6M10 20h4" stroke={themeInk('#172033')} strokeWidth={1.35} strokeLinecap="round"/><Path d="M6 16.5 4.7 18M18 16.5l1.3 1.5" stroke={themeInk('#172033')} strokeWidth={1.35} strokeLinecap="round"/></Svg>; }

function Toggle({value, onChange, label, disabled = false}: {value: boolean; onChange: () => void; label: string; disabled?: boolean}) { return <Pressable accessibilityLabel={label} accessibilityRole="switch" accessibilityState={{checked: value, disabled}} disabled={disabled} onPress={onChange} hitSlop={9} style={[styles.toggle, value && styles.toggleOn, disabled && styles.disabledControl]}><View style={[styles.toggleThumb, value && styles.toggleThumbOn]}/></Pressable>; }
function StatusPill({children}: {children: string}) { return <View style={styles.pill}><Text style={styles.pillText}>{children}</Text></View>; }

function Header({title, onBack}: {title: string; onBack: () => void}) { const insets = useSafeAreaInsets(); return <View style={[styles.header, {paddingTop: insets.top, height: insets.top + 56}]}><Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} hitSlop={10} style={styles.back}><BackIcon/></Pressable><Text style={styles.headerTitle}>{title}</Text></View>; }

export function NotificationControlsScreen({onBack}: {onBack: () => void}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [callsOpen, setCallsOpen] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const edited = useRef(false);
  const settingsRef = useRef(DEFAULT_NOTIFICATION_SETTINGS);
  useEffect(() => {
    let active = true;
    loadStoredNotificationSettings().then(local => {
      if (!active) { return; }
      settingsRef.current = local;
      setSettings(local);
      setLoading(false);
      // Do not let a slower account response replace a switch the user has
      // already changed on this screen.
      getNotificationSettings().then(remote => {
        if (active && !edited.current) {
          settingsRef.current = remote;
          setSettings(remote);
        }
      }).catch(() => undefined);
    });
    return () => { active = false; };
  }, []);
  const onChange = (update: Partial<NotificationSettings>) => {
    edited.current = true;
    const next = normalizeNotificationSettings({...settingsRef.current, ...update});
    const vibrationChanged = update.messageVibration !== undefined ||
      update.groupVibration !== undefined || update.callVibration !== undefined;
    if (vibrationChanged) {
      // Turning off one category must not silence the other selected patterns.
      next.vibrationEnabled = [next.messageVibration, next.groupVibration, next.callVibration]
        .some(pattern => pattern !== 'Turned Off');
    }
    settingsRef.current = next;
    setSettings(next);
    // The native background presenter reads the saved preview and vibration
    // choices. Apply them locally now; Save still syncs the account settings.
    if (update.notifications !== undefined || update.callNotifications !== undefined || update.popupPreview !== undefined || vibrationChanged || update.notificationTone !== undefined || update.soundEnabled !== undefined) {
      storeNotificationSettings(next).catch(() => undefined);
    }
  };
  const onSave = async () => {
    if (saving) { return; }
    setSaving(true);
    try {
      const saved = await updateNotificationSettings(settingsRef.current);
      settingsRef.current = saved;
      setSettings(saved);
      setNotice('Notification settings saved.');
    }
    catch { setNotice('Settings were saved on this device and will sync when you reconnect.'); }
    finally { setSaving(false); }
  };
  const childProps: NotificationChildProps = {settings, onChange, onSave, saving, notice, onHideNotice: () => setNotice('')};
  if (messagesOpen) return <MessageNotificationsScreen {...childProps} onBack={() => setMessagesOpen(false)}/>;
  if (groupsOpen) return <GroupNotificationsScreen {...childProps} onBack={() => setGroupsOpen(false)}/>;
  if (callsOpen) return <CallNotificationsScreen {...childProps} onBack={() => setCallsOpen(false)}/>;
  const query = searchQuery.trim().toLowerCase();
  const matchesSearch = (title: string, description: string) =>
    `${title} ${description}`.toLowerCase().includes(query);
  const showAllNotifications = matchesSearch('All Notifications', 'Enable or pause notifications for this account.');
  const showPopupPreview = matchesSearch('Popup preview', 'Show popup preview for incoming notifications.');
  const rows = [
    {title: 'Messages', description: 'Manage notifications for new messages.', icon: <MessageIcon/>, onPress: () => setMessagesOpen(true)},
    {title: 'Groups', description: 'Manage notifications for group messages and activity.', icon: <GroupsIcon/>, onPress: () => setGroupsOpen(true)},
    {title: 'Calls', description: 'Manage notifications for incoming calls.', icon: <PhoneIcon/>, onPress: () => setCallsOpen(true)},
  ].filter(row => matchesSearch(row.title, row.description));
  return <View style={styles.root}><Header title="Notifications" onBack={onBack}/><ScrollView contentContainerStyle={[styles.listContent, {paddingBottom: insets.bottom + 88}]}>
    <View style={styles.search}><SearchIcon/><TextInput value={searchQuery} onChangeText={setSearchQuery} accessibilityLabel="Search Notifications" placeholder="Search Notifications" placeholderTextColor="#61708A" style={styles.searchText}/></View>
    {loading ? <View style={styles.loading}><ActivityIndicator color={PURPLE}/></View> : null}
    <View style={styles.rows}>{rows.map(row => <Pressable key={row.title} accessibilityLabel={row.title} accessibilityRole="button" onPress={row.onPress} style={styles.row}><View style={styles.rowIcon}>{row.icon}</View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{row.title}</Text><Text style={styles.description}>{row.description}</Text></View></Pressable>)}
      {showAllNotifications ? <View style={styles.row}><View style={styles.rowIcon}><PopupIcon/></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>All Notifications</Text><Text style={styles.description}>Enable or pause notifications for this account.</Text></View><Toggle label="All Notifications" disabled={loading || saving} value={settings.notifications} onChange={() => onChange({notifications: !settings.notifications})}/></View> : null}
      {showPopupPreview ? <View style={styles.row}><View style={styles.rowIcon}><PopupIcon/></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>Popup preview</Text><Text style={styles.description}>Show popup preview for incoming notifications.</Text></View><Toggle label="Popup preview" disabled={loading || saving} value={settings.popupPreview} onChange={() => onChange({popupPreview: !settings.popupPreview})}/></View> : null}
      {!loading && rows.length === 0 && !showAllNotifications && !showPopupPreview ? <Text accessibilityRole="text" style={styles.description}>No matching notification settings.</Text> : null}
    </View>
  </ScrollView><SaveSettingsFooter saving={saving} disabled={loading} onSave={onSave}/><Snackbar message={notice} onHide={() => setNotice('')}/></View>;
}

type NotificationChildProps = {settings: NotificationSettings; onChange: (update: Partial<NotificationSettings>) => void; onSave: () => void; saving: boolean; notice: string; onHideNotice: () => void};
function SaveSettingsFooter({saving, disabled, onSave}: {saving: boolean; disabled?: boolean; onSave: () => void}) { const insets = useSafeAreaInsets(); return <View style={[styles.saveBar, {paddingBottom: Math.max(insets.bottom, 12)}]}><Pressable accessibilityLabel="Save Settings" accessibilityState={{busy: saving, disabled: saving || disabled}} disabled={saving || disabled} onPress={onSave} style={[styles.saveButton, (saving || disabled) && styles.disabledControl]}>{saving ? <ActivityIndicator color="#FFF" size="small"/> : <Text style={styles.saveButtonText}>Save Settings</Text>}</Pressable></View>; }

function MessageNotificationsScreen({onBack, settings, onChange, onSave, saving, notice, onHideNotice}: NotificationChildProps & {onBack: () => void}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false); const [soundSheetOpen, setSoundSheetOpen] = useState(false);
  const toggleRows = [
    {title: 'New Messages', description: 'Get notified when you receive a new message.', value: settings.messageNotifications, change: () => onChange({messageNotifications: !settings.messageNotifications})},
    {title: 'Reactions', description: 'Get notified when someone reacts to your messages.', value: settings.messageReactions, change: () => onChange({messageReactions: !settings.messageReactions})},
    {title: 'Message Sounds', description: 'Play a sound when you receive a new message.', value: settings.soundEnabled, change: () => onChange({soundEnabled: !settings.soundEnabled})},
  ];
  return <View style={styles.root}><Header title="Message Notifications" onBack={onBack}/><ScrollView contentContainerStyle={[styles.messageContent, {paddingBottom: insets.bottom + 88}]}>
    {toggleRows.map(row => <View key={row.title} style={styles.messageRow}><View style={styles.messageCopy}><Text style={styles.rowTitle}>{row.title}</Text><Text style={styles.description}>{row.description}</Text></View><Toggle label={row.title} value={row.value} onChange={row.change}/></View>)}
    <Pressable accessibilityLabel="Vibrate" accessibilityRole="button" onPress={() => setSheetOpen(true)} style={styles.detailRow}><Text style={styles.rowTitle}>Vibrate</Text><Text style={styles.description}>Vibrate when you receive a new message.</Text><StatusPill>{settings.messageVibration}</StatusPill></Pressable>
    <Pressable accessibilityLabel="Notification Sound" accessibilityRole="button" onPress={() => setSoundSheetOpen(true)} style={styles.detailRow}><Text style={styles.rowTitle}>Notification Sound</Text><Text style={styles.description}>Choose the sound used for message notifications.</Text><StatusPill>{settings.notificationTone}</StatusPill></Pressable>
    <View style={styles.messageRow}><View style={styles.messageCopy}><Text style={styles.rowTitle}>Sent Message Sound</Text><Text style={styles.description}>Play a sound when you send a message.</Text></View><Toggle label="Sent Message Sound" value={settings.sentMessageSound} onChange={() => onChange({sentMessageSound: !settings.sentMessageSound})}/></View>
  </ScrollView><SaveSettingsFooter saving={saving} onSave={onSave}/><VibrateSheet visible={sheetOpen} selected={settings.messageVibration} onClose={() => setSheetOpen(false)} onSelect={value => {onChange({messageVibration: value}); vibrateNotification(value); setSheetOpen(false);}}/><NotificationSoundSheet visible={soundSheetOpen} selected={settings.notificationTone} onClose={() => setSoundSheetOpen(false)} onSelect={value => {onChange({notificationTone: value}); playNotificationTone(value); setSoundSheetOpen(false);}}/><Snackbar message={notice} onHide={onHideNotice}/></View>;
}

function GroupNotificationsScreen({onBack, settings, onChange, onSave, saving, notice, onHideNotice}: NotificationChildProps & {onBack: () => void}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [vibrateSheetOpen, setVibrateSheetOpen] = useState(false); const [soundSheetOpen, setSoundSheetOpen] = useState(false);
  const toggleRows = [
    {title: 'Group Message Notifications', description: 'Get notified when you receive a new group message.', value: settings.groupNotifications, change: () => onChange({groupNotifications: !settings.groupNotifications})},
    {title: 'Reactions', description: 'Get notified when someone reacts to a group message.', value: settings.groupReactions, change: () => onChange({groupReactions: !settings.groupReactions})},
    {title: 'Group Message Sounds', description: 'Play a sound when you receive a new group message.', value: settings.soundEnabled, change: () => onChange({soundEnabled: !settings.soundEnabled})},
  ];
  return <View style={styles.root}><Header title="Group Notifications" onBack={onBack}/><ScrollView contentContainerStyle={[styles.messageContent, {paddingBottom: insets.bottom + 88}]}>
    {toggleRows.map(row => <View key={row.title} style={styles.messageRow}><View style={styles.messageCopy}><Text style={styles.rowTitle}>{row.title}</Text><Text style={styles.description}>{row.description}</Text></View><Toggle label={row.title} value={row.value} onChange={row.change}/></View>)}
    <Pressable accessibilityLabel="Vibrate" accessibilityRole="button" onPress={() => setVibrateSheetOpen(true)} style={styles.detailRow}><Text style={styles.rowTitle}>Vibrate</Text><Text style={styles.description}>Vibrate when you receive a new group message.</Text><StatusPill>{settings.groupVibration}</StatusPill></Pressable>
    <Pressable accessibilityLabel="Group Notification Sound" accessibilityRole="button" onPress={() => setSoundSheetOpen(true)} style={styles.detailRow}><Text style={styles.rowTitle}>Group Notification Sound</Text><Text style={styles.description}>Choose the sound used for group message notifications.</Text><StatusPill>{settings.notificationTone}</StatusPill></Pressable>
    <View style={styles.messageRow}><View style={styles.messageCopy}><Text style={styles.rowTitle}>Sent Message Sound</Text><Text style={styles.description}>Play a sound when you send a message.</Text></View><Toggle label="Sent Message Sound" value={settings.groupSentMessageSound} onChange={() => onChange({groupSentMessageSound: !settings.groupSentMessageSound})}/></View>
  </ScrollView><SaveSettingsFooter saving={saving} onSave={onSave}/><VibrateSheet visible={vibrateSheetOpen} selected={settings.groupVibration} onClose={() => setVibrateSheetOpen(false)} onSelect={value => {onChange({groupVibration: value}); vibrateNotification(value); setVibrateSheetOpen(false);}}/><NotificationSoundSheet visible={soundSheetOpen} selected={settings.notificationTone} onClose={() => setSoundSheetOpen(false)} onSelect={value => {onChange({notificationTone: value}); playNotificationTone(value); setSoundSheetOpen(false);}}/><Snackbar message={notice} onHide={onHideNotice}/></View>;
}

function CallNotificationsScreen({onBack, settings, onChange, onSave, saving, notice, onHideNotice}: NotificationChildProps & {onBack: () => void}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [vibrateSheetOpen, setVibrateSheetOpen] = useState(false); const [soundSheetOpen, setSoundSheetOpen] = useState(false);
  const disabled = !settings.callNotifications;
  return <View style={styles.root}><Header title="Call Notifications" onBack={onBack}/><ScrollView contentContainerStyle={[styles.messageContent, {paddingBottom: insets.bottom + 88}]}>
    <View style={styles.messageRow}><View style={styles.messageCopy}><Text style={styles.rowTitle}>Incoming Call Notifications</Text><Text style={styles.description}>Get notified when you receive an incoming call.</Text></View><Toggle label="Incoming Call Notifications" value={settings.callNotifications} onChange={() => onChange({callNotifications: !settings.callNotifications})}/></View>
    <View style={[styles.messageRow, disabled && styles.disabledRow]}><View style={styles.messageCopy}><Text style={styles.rowTitle}>Call Ringtone</Text><Text style={styles.description}>Play a ringtone when you receive an incoming call.</Text></View><Toggle label="Call Ringtone" value={settings.callRingtone} disabled={disabled} onChange={() => onChange({callRingtone: !settings.callRingtone})}/></View>
    <Pressable accessibilityLabel="Vibrate" accessibilityRole="button" disabled={disabled} onPress={() => setVibrateSheetOpen(true)} style={[styles.detailRow, disabled && styles.disabledRow]}><Text style={styles.rowTitle}>Vibrate</Text><Text style={styles.description}>Vibrate when you receive an incoming call.</Text><StatusPill>{settings.callVibration}</StatusPill></Pressable>
    <Pressable accessibilityLabel="Call Ringtone Sound" accessibilityRole="button" disabled={disabled} onPress={() => setSoundSheetOpen(true)} style={[styles.detailRow, disabled && styles.disabledRow]}><Text style={styles.rowTitle}>Call Ringtone</Text><Text style={styles.description}>Choose the sound used for incoming calls.</Text><StatusPill>{settings.notificationTone}</StatusPill></Pressable>
  </ScrollView><SaveSettingsFooter saving={saving} onSave={onSave}/><VibrateSheet visible={vibrateSheetOpen} selected={settings.callVibration} onClose={() => setVibrateSheetOpen(false)} onSelect={value => {onChange({callVibration: value}); vibrateNotification(value); setVibrateSheetOpen(false);}}/><NotificationSoundSheet visible={soundSheetOpen} selected={settings.notificationTone} onClose={() => setSoundSheetOpen(false)} onSelect={value => {onChange({notificationTone: value}); playNotificationTone(value); setSoundSheetOpen(false);}}/><Snackbar message={notice} onHide={onHideNotice}/></View>;
}

function VibrateSheet({visible, selected, onClose, onSelect}: {visible: boolean; selected: VibrationPattern; onClose: () => void; onSelect: (value: VibrationPattern) => void}) { const insets = useSafeAreaInsets(); const options: VibrationPattern[] = ['Turned Off', 'Short', 'Medium', 'Long']; return <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}><Pressable accessibilityLabel="Close vibrate options" style={styles.scrim} onPress={onClose}/><View style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, 20)}]}><View style={styles.handle}/><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Vibrate</Text><Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} hitSlop={10}><CloseIcon/></Pressable></View><View accessibilityRole="radiogroup">{options.map(option => {const isSelected = selected === option; return <Pressable key={option} accessibilityLabel={option} accessibilityRole="radio" accessibilityState={{checked: isSelected, selected: isSelected}} onPress={() => onSelect(option)} style={styles.option}><View style={[styles.radio, isSelected && styles.radioSelected]}>{isSelected ? <CheckIcon/> : null}</View><Text style={styles.optionText}>{option}</Text></Pressable>;})}</View></View></Modal>; }

function NotificationSoundSheet({visible, selected, onClose, onSelect}: {visible: boolean; selected: NotificationTone; onClose: () => void; onSelect: (value: NotificationTone) => void}) { const insets = useSafeAreaInsets(); return <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}><Pressable accessibilityLabel="Close notification sound options" style={styles.scrim} onPress={onClose}/><View style={[styles.sheet, styles.soundSheet, {paddingBottom: Math.max(insets.bottom, 20)}]}><View style={styles.handle}/><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Notification Tone</Text><Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} hitSlop={10}><CloseIcon/></Pressable></View><View accessibilityRole="radiogroup">{NOTIFICATION_TONES.map(option => {const isSelected = selected === option; return <Pressable key={option} accessibilityLabel={option} accessibilityRole="radio" accessibilityState={{checked: isSelected, selected: isSelected}} onPress={() => onSelect(option)} style={styles.option}><View style={[styles.radio, isSelected && styles.radioSelected]}>{isSelected ? <CheckIcon/> : null}</View><Text style={styles.optionText}>{option}</Text></Pressable>;})}</View></View></Modal>; }

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#FFFFFF'},
  header: {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E9EDF2', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13},
  back: {width: 28, height: 44, justifyContent: 'center', alignItems: 'flex-start', marginRight: 2}, headerTitle: {fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#111827'},
  listContent: {paddingHorizontal: 12}, search: {height: 32, marginTop: 11, borderWidth: 1, borderColor: '#EDF0F4', borderRadius: 6, backgroundColor: '#FAFAFB', paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8}, searchText: {flex: 1, height: 32, padding: 0, fontFamily: FONT, fontSize: 9, color: '#172033'}, rows: {marginTop: 13},
  row: {minHeight: 60, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8}, rowIcon: {width: 25, paddingTop: 1, alignItems: 'flex-start'}, rowCopy: {flex: 1, minWidth: 0}, rowTitle: {fontFamily: FONT, fontSize: 11, fontWeight: '500', color: '#172033'}, description: {fontFamily: FONT, fontSize: 9, lineHeight: 13, color: '#61708A', marginTop: 3}, loading: {height: 35, justifyContent: 'center', alignItems: 'center'},
  toggle: {width: 29, height: 16, marginTop: 2, borderRadius: 3, backgroundColor: '#DCE4EF', padding: 2, justifyContent: 'center'}, toggleOn: {backgroundColor: PURPLE}, toggleThumb: {width: 12, height: 12, borderRadius: 1.5, backgroundColor: '#FFFFFF', alignSelf: 'flex-start'}, toggleThumbOn: {alignSelf: 'flex-end'}, disabledControl: {opacity: .36}, disabledRow: {opacity: .36},
  messageContent: {paddingHorizontal: 16, paddingTop: 11}, messageRow: {minHeight: 65, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 1}, messageCopy: {flex: 1, minWidth: 0, paddingRight: 9}, detailRow: {minHeight: 79, paddingTop: 2}, pill: {alignSelf: 'flex-start', marginTop: 6, minHeight: 15, paddingHorizontal: 6, borderRadius: 4, backgroundColor: '#F1F3F6', justifyContent: 'center'}, pillText: {fontFamily: FONT, fontSize: 7.5, color: '#344054'},
  saveBar: {position: 'absolute', left: 16, right: 16, bottom: 0, paddingTop: 10, backgroundColor: '#FFF'}, saveButton: {height: 42, borderRadius: 5, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center'}, saveButtonText: {fontFamily: FONT, fontSize: 11, fontWeight: '600', color: '#FFF'},
  scrim: {position: 'absolute', inset: 0, backgroundColor: 'rgba(11,18,32,.43)'}, sheet: {position: 'absolute', bottom: 0, left: 0, right: 0, minHeight: 228, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 5}, soundSheet: {minHeight: 270}, handle: {alignSelf: 'center', width: 31, height: 3, borderRadius: 2, backgroundColor: '#DCE4EF', marginBottom: 7}, sheetHeader: {height: 28, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between'}, sheetTitle: {fontFamily: FONT, fontSize: 12, fontWeight: '600', color: '#172033'}, option: {height: 42, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 3}, radio: {width: 16, height: 16, borderRadius: 8, borderWidth: 1.1, borderColor: '#8492A6', alignItems: 'center', justifyContent: 'center'}, radioSelected: {borderColor: PURPLE, backgroundColor: PURPLE}, optionText: {fontFamily: FONT, fontSize: 11, color: '#172033'},
});
