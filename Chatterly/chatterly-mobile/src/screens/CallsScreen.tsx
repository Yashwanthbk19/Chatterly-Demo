import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Image, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {CallsTabIcon, ChatTabIcon, ContactTabIcon, SearchIcon, SettingsTabIcon} from '../components/ContactsIcons';
import {Snackbar} from '../components/Snackbar';
import {BlockConfirmation} from '../components/BlockConfirmation';
import {ReportFlowSheet} from '../components/ReportFlowSheet';
import {getCallDetails, getCallHistory, type CallHistoryDirection, type CallHistoryItem, type CallHistoryType} from '../services/callHistoryApi';
import {hideCallIds, loadHiddenCallIds} from '../services/callHistoryStore';
import {markCallsSeen} from '../services/missedCallBadge';
import {blockChatUser, getChatProfile, startChat} from '../services/chatApi';
import type {ChatProfile, ConversationContact} from '../types/chat';
import {createThemedStyles, themeInk} from '../theme/themedStyles';
import {callHistoryCategory, normalizeCallStatus} from '../utils/callStatus';

type Props = {onBack: () => void; onOpenChats: () => void; onOpenContacts: () => void; onOpenSettings: () => void; onOpenConversation?: (contact: ConversationContact, chatId: string, callType?: CallHistoryType) => void};
// Sprint 9 Story 4 filters the log by type: Video, Audio and Missed.
type Filter = 'all' | 'video' | 'audio' | 'missed';
const PURPLE = '#8B2CF5';
const FONT = Platform.select({android: 'sans-serif', ios: 'System'});

function BackIcon() { return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="m15 5-7 7 7 7" stroke={themeInk('#111827')} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function DeleteIcon() { return <Svg width={40} height={40} viewBox="0 0 40 40" fill="none"><Path d="M12 15H28M18 19V25M22 19V25M13 15L14 27C14 27.5304 14.2107 28.0391 14.5858 28.4142C14.9609 28.7893 15.4696 29 16 29H24C24.5304 29 25.0391 28.7893 25.4142 28.4142C25.7893 28.0391 26 27.5304 26 27L27 15M17 15V12C17 11.7348 17.1054 11.4804 17.2929 11.2929C17.4804 11.1054 17.7348 11 18 11H22C22.2652 11 22.5196 11.1054 22.7071 11.2929C22.8946 11.4804 23 11.7348 23 12V15" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function ConfirmDeleteIcon() { return <Svg width={32} height={32} viewBox="0 0 32 32" fill="none"><Path d="M17.3333 19.9987V11.9987C17.3333 11.6451 17.4738 11.3059 17.7239 11.0559C17.9739 10.8058 18.313 10.6654 18.6667 10.6654H26.6667C27.0203 10.6654 27.3594 10.8058 27.6095 11.0559C27.8595 11.3059 28 11.6451 28 11.9987V17.332M24 10.6654V6.66536C24 6.31174 23.8595 5.9726 23.6095 5.72256C23.3594 5.47251 23.0203 5.33203 22.6667 5.33203H5.33333C4.97971 5.33203 4.64057 5.47251 4.39052 5.72256C4.14048 5.9726 4 6.31174 4 6.66536V22.6654C4 23.019 4.14048 23.3581 4.39052 23.6082C4.64057 23.8582 4.97971 23.9987 5.33333 23.9987H17.3333M21.3333 29.332L28 22.6654M22 22.6654H28V28.6654M21.3333 11.9987H24" stroke={themeInk('#DC2626')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function AudioCallIcon({color = '#111827'}: {color?: string}) { return <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"><Path d="M7.2 3.8 10 8.4 7.9 10a14.2 14.2 0 0 0 6.1 6.1l1.6-2.1 4.6 2.8-.8 3.1c-.2.8-.9 1.3-1.7 1.3C9.5 20.7 3.3 14.5 2.8 6.3c0-.8.5-1.5 1.3-1.7l3.1-.8Z" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function VideoCallIcon({color = '#111827'}: {color?: string}) { return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Rect x={3.5} y={6} width={12.5} height={12} rx={2.5} stroke={color} strokeWidth={1.6}/><Path d="m16 10 4-2v8l-4-2" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function MoreIcon() { return <Svg width={21} height={21} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={5} r={1.25} fill={themeInk('#111827')}/><Circle cx={12} cy={12} r={1.25} fill={themeInk('#111827')}/><Circle cx={12} cy={19} r={1.25} fill={themeInk('#111827')}/></Svg>; }
function MessageIcon() { return <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"><Path d="M5 5h14v11H9l-4 3V5Z" stroke={themeInk('#111827')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function BlockIcon() { return <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={8} stroke={themeInk('#344054')} strokeWidth={1.5}/><Path d="m6.5 17.5 11-11" stroke={themeInk('#344054')} strokeWidth={1.5} strokeLinecap="round"/></Svg>; }
function ReportIcon() { return <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"><Path d="M5 4.5h14v12H8l-3 3v-15Z" stroke={themeInk('#344054')} strokeWidth={1.5} strokeLinejoin="round"/><Path d="M12 8v4M12 14.3v.2" stroke={themeInk('#344054')} strokeWidth={1.5} strokeLinecap="round"/></Svg>; }
function CloseIcon() { return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="m6 6 12 12M18 6 6 18" stroke={themeInk('#667085')} strokeWidth={1.5} strokeLinecap="round"/></Svg>; }
function DirectionIcon({direction, missed}: {direction: CallHistoryDirection; missed: boolean}) { const color = missed ? '#EF4444' : direction === 'incoming' ? '#20B981' : '#3B82F6'; return <Svg width={12} height={12} viewBox="0 0 12 12" fill="none"><Path d={direction === 'incoming' ? 'M9.5 2.5 2.5 9.5M2.5 4.5v5h5' : 'M2.5 9.5 9.5 2.5M4.5 2.5h5v5'} stroke={color} strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function Check({selected}: {selected: boolean}) { return <View style={[styles.check, selected && styles.checkSelected]}>{selected ? <Svg width={10} height={10} viewBox="0 0 10 10" fill="none"><Path d="m2 5 2 2 4-4" stroke={themeInk('#FFF')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg> : null}</View>; }

function initials(name: string): string { return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '?'; }
function isMissed(call: CallHistoryItem): boolean { return callHistoryCategory(call) === 'missed' || normalizeCallStatus(call.status) === 'rejected'; }
/** "45s", "5m 32s", "1h 04m" - a 45 second call is not "1 min". */
export function durationLabel(seconds: number): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!total) return '';
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
  return `${Math.floor(total / 3600)}h ${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}m`;
}
function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((today - target) / 86400000);
  const day = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  return `${day}, ${date.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})}`;
}

function detailDayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((today - target) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', {day: '2-digit', month: 'long'});
}
function detailTimeLabel(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', hour12: false}); }
const detailDurationLabel = durationLabel;
function callResultLabel(call: CallHistoryItem): string {
  const status = normalizeCallStatus(call.status);
  if (call.direction === 'incoming' && ['reject', 'rejected', 'decline', 'declined'].includes(status)) return 'Rejected';
  if (isMissed(call)) return 'Missed Call';
  return call.direction === 'incoming' ? 'Incoming Call' : 'Outgoing Call';
}

function DeleteCallsDialog({count, visible, onCancel, onConfirm}: {count: number; visible: boolean; onCancel: () => void; onConfirm: () => void}) {
  const label = `${count} ${count === 1 ? 'call' : 'calls'}`;
  return <Modal animationType="fade" navigationBarTranslucent statusBarTranslucent transparent visible={visible} onRequestClose={onCancel}>
    <View accessibilityLabel={count === 1 ? 'Delete this call confirmation' : `Delete ${label} confirmation`} style={styles.modalOverlay}>
      <Pressable accessibilityLabel="Close delete calls confirmation" onPress={onCancel} style={StyleSheet.absoluteFill}/>
      <View accessibilityViewIsModal style={styles.dialog}>
        <View style={styles.dialogIcon}><ConfirmDeleteIcon/></View>
        <Text style={styles.dialogTitle}>{count === 1 ? 'Delete this call?' : `Delete ${label}?`}</Text>
        <Text style={styles.dialogDescription}>{count === 1 ? 'This call will be removed from your call history only. It will remain in the other participant’s call history.' : 'These calls will be removed from your call history only. They will remain in the other people’s call history.'}</Text>
        <Pressable accessibilityLabel={count === 1 ? 'Confirm delete call' : `Confirm delete ${label}`} onPress={onConfirm} style={styles.dialogDelete}><Text style={styles.dialogDeleteText}>{count === 1 ? 'Delete Call' : `Delete ${count} Calls`}</Text></Pressable>
        <Pressable accessibilityLabel="Cancel deleting calls" onPress={onCancel} style={styles.dialogCancel}><Text style={styles.dialogCancelText}>Cancel</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

function MoreOptionsSheet({bottomInset, visible, onClose, onDelete, onBlock, onReport}: {bottomInset: number; visible: boolean; onClose: () => void; onDelete: () => void; onBlock: () => void; onReport: () => void}) {
  return <Modal animationType="slide" navigationBarTranslucent statusBarTranslucent transparent visible={visible} onRequestClose={onClose}>
    <View style={styles.sheetOverlay}>
      <Pressable accessibilityLabel="Close call options" onPress={onClose} style={StyleSheet.absoluteFill}/>
      <View accessibilityLabel="More Options" style={[styles.optionsSheet, {paddingBottom: Math.max(bottomInset, 12)}]}>
        <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>More Options</Text><Pressable accessibilityLabel="Close more options" hitSlop={10} onPress={onClose}><CloseIcon/></Pressable></View>
        <Pressable accessibilityLabel="Delete Call" onPress={onDelete} style={styles.sheetRow}><View style={styles.sheetDeleteIconSlot}><DeleteIcon/></View><Text style={styles.sheetRowText}>Delete Call</Text></Pressable>
        <Pressable accessibilityLabel="Block contact" onPress={onBlock} style={styles.sheetRow}><BlockIcon/><Text style={styles.sheetRowText}>Block</Text></Pressable>
        <Pressable accessibilityLabel="Report contact" onPress={onReport} style={styles.sheetRow}><ReportIcon/><Text style={styles.sheetRowText}>Report</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

function CallDetailsView({call, calls, insets, profile, onAction, onBack, onMore}: {call: CallHistoryItem; calls: CallHistoryItem[]; insets: {top: number; bottom: number}; profile: ChatProfile | null; onAction: (action: 'audio' | 'video' | 'message') => void; onBack: () => void; onMore: () => void}) {
  const grouped = calls.reduce<Array<{label: string; items: CallHistoryItem[]}>>((groups, item) => {
    const label = detailDayLabel(item.occurredAt);
    const existing = groups.find(group => group.label === label);
    if (existing) existing.items.push(item); else groups.push({label, items: [item]});
    return groups;
  }, []);
  const name = profile?.name || call.contactName;
  const avatar = profile?.profilePic || call.avatar;
  return <View accessibilityLabel={`Call details for ${name}`} style={[styles.detailRoot, {paddingTop: insets.top}]}>
    <View style={styles.detailHeader}><Pressable accessibilityLabel="Back to call history" hitSlop={10} onPress={onBack} style={styles.detailHeaderButton}><BackIcon/></Pressable><View style={styles.detailHeaderSpacer}/><Pressable accessibilityLabel="More call options" hitSlop={10} onPress={onMore} style={styles.detailHeaderButton}><MoreIcon/></Pressable></View>
    <View style={styles.detailProfile}>
      {avatar ? <Image accessibilityLabel={`${name} profile picture`} source={{uri: avatar}} style={styles.detailAvatar}/> : <View style={styles.detailAvatarFallback}><Text style={styles.detailAvatarLetters}>{initials(name)}</Text></View>}
      <Text style={styles.detailName}>{name}</Text>
      <Text numberOfLines={1} style={styles.detailStatus}>{profile?.status || 'Hey there! I am using Chatterly'}</Text>
      {profile?.phone ? <Text style={styles.detailPhone}>{profile.phone}</Text> : null}
    </View>
    {!call.isGroup ? <View style={styles.detailActions}>
      <Pressable accessibilityLabel={`Audio call ${name}`} onPress={() => onAction('audio')} style={styles.detailAction}><View style={styles.detailActionIcon}><AudioCallIcon/></View><Text style={styles.detailActionText}>Audio</Text></Pressable>
      <Pressable accessibilityLabel={`Video call ${name}`} onPress={() => onAction('video')} style={styles.detailAction}><View style={styles.detailActionIcon}><VideoCallIcon/></View><Text style={styles.detailActionText}>Video</Text></Pressable>
      <Pressable accessibilityLabel={`Message ${name}`} onPress={() => onAction('message')} style={styles.detailAction}><View style={styles.detailActionIcon}><MessageIcon/></View><Text style={styles.detailActionText}>Message</Text></Pressable>
    </View> : null}
    <ScrollView contentContainerStyle={[styles.detailHistory, {paddingBottom: Math.max(insets.bottom, 18)}]} showsVerticalScrollIndicator={false}>
      {grouped.map(group => <View key={group.label} style={styles.detailGroup}><Text style={styles.detailDay}>{group.label}</Text>{group.items.map(item => { const missed = isMissed(item); return <View accessibilityLabel={`${callResultLabel(item)} at ${detailTimeLabel(item.occurredAt)}`} key={item.id} style={styles.detailRow}><DirectionIcon direction={item.direction} missed={missed}/><View style={styles.detailRowCopy}><Text style={styles.detailResult}>{callResultLabel(item)}</Text><Text style={styles.detailTime}>{detailTimeLabel(item.occurredAt)}</Text></View><Text style={styles.detailDuration}>{detailDurationLabel(item.duration)}</Text></View>; })}</View>)}
    </ScrollView>
  </View>;
}

export function CallsScreen({onBack, onOpenChats, onOpenContacts, onOpenSettings, onOpenConversation}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeCall, setActiveCall] = useState<CallHistoryItem | null>(null);
  const [activeProfile, setActiveProfile] = useState<ChatProfile | null>(null);
  const detailsRequest = useRef(0);
  const callbackInProgress = useRef(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmSingleDelete, setConfirmSingleDelete] = useState(false);
  const [notice, setNotice] = useState('');

  const closeCallDetails = useCallback(() => {
    detailsRequest.current += 1;
    setActiveCall(null);
    setActiveProfile(null);
    setMoreOpen(false);
  }, []);

  useEffect(() => () => { detailsRequest.current += 1; }, []);

  const fetchCalls = useCallback(async () => {
    const [history, hidden] = await Promise.all([getCallHistory(), loadHiddenCallIds()]);
    return history.filter(call => !hidden.has(call.id));
  }, []);

  useEffect(() => {
    let active = true;
    // Looking at the Calls tab is what clears its missed-call badge.
    markCallsSeen().catch(() => undefined);
    fetchCalls()
      .then(history => { if (active) setCalls(history); })
      .catch(error => { if (active) setNotice(error instanceof Error ? error.message : 'Unable to load call history.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchCalls]);

  const refreshCalls = useCallback(async () => {
    setRefreshing(true);
    try { setCalls(await fetchCalls()); markCallsSeen().catch(() => undefined); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to refresh call history.'); }
    finally { setRefreshing(false); }
  }, [fetchCalls]);

  const visibleCalls = useMemo(() => {
    const search = query.trim().toLowerCase();
    return calls.filter(call => {
      if (filter === 'missed' && !isMissed(call)) return false;
      if ((filter === 'video' || filter === 'audio') && call.type !== filter) return false;
      return !search || call.contactName.toLowerCase().includes(search);
    });
  }, [calls, filter, query]);

  const toggle = useCallback((id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const selectFromLongPress = useCallback((id: string) => setSelected(current => {
    if (current.has(id)) return current;
    return new Set([...current, id]);
  }), []);

  const deleteSelected = useCallback(async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      await hideCallIds(ids);
      setCalls(current => current.filter(call => !selected.has(call.id)));
      setSelected(new Set());
      setConfirmDelete(false);
      setNotice(`${ids.length} ${ids.length === 1 ? 'call' : 'calls'} deleted.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to delete the selected calls.');
    }
  }, [selected]);

  const openCallDetails = useCallback((call: CallHistoryItem) => {
    const request = ++detailsRequest.current;
    setActiveCall(call);
    setActiveProfile(null);
    setMoreOpen(false);
    Promise.allSettled([
      getCallDetails(call.id, call.isGroup),
      call.isGroup ? Promise.resolve(null) : getChatProfile(call.contactId),
    ]).then(([details, profile]) => {
      // A previous contact's lookup can finish after navigating to another call.
      if (request !== detailsRequest.current) return;
      if (details.status === 'fulfilled') {
        // The history response is the canonical call log.  Keep its duration
        // when enriching a row with details so both views always show the
        // same completed-call length.
        setActiveCall(current => current?.id === call.id ? {...current, ...details.value, duration: current.duration} : current);
        setCalls(current => current.map(item => item.id === call.id ? {...item, ...details.value, duration: item.duration} : item));
      }
      if (profile.status === 'fulfilled' && profile.value) setActiveProfile(profile.value);
    }).catch(() => undefined);
  }, []);

  const openDetailAction = useCallback(async (action: 'audio' | 'video' | 'message') => {
    const call = activeCall;
    if (!call || call.isGroup || !onOpenConversation) return;
    try {
      const chatId = call.chatId || (await startChat(call.contactId)).chatId;
      onOpenConversation({userId: call.contactId, name: activeProfile?.name || call.contactName, thumbnail: activeProfile?.profilePic || call.avatar || null}, chatId, action === 'message' ? undefined : action);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to open this contact.');
    }
  }, [activeCall, activeProfile, onOpenConversation]);

  // Row actions share the same chat lookup. Only Callback requests a redial;
  // opening a missed row or choosing Message opens the conversation alone.
  const openCallConversation = useCallback(async (call: CallHistoryItem, redial = true) => {
    if (!onOpenConversation || callbackInProgress.current) return;
    if (!call.contactId) { setNotice('This contact is no longer available.'); return; }
    callbackInProgress.current = true;
    try {
      if (call.isGroup) {
        onOpenConversation({userId: call.contactId, name: call.contactName, thumbnail: call.avatar || null, kind: 'group'}, call.contactId, redial ? call.type : undefined);
        callbackInProgress.current = false;
        return;
      }
      const chatId = call.chatId || (await startChat(call.contactId)).chatId;
      onOpenConversation({userId: call.contactId, name: call.contactName, thumbnail: call.avatar || null}, chatId, redial ? call.type : undefined);
      callbackInProgress.current = false;
    } catch (error) {
      callbackInProgress.current = false;
      setNotice(error instanceof Error ? error.message : redial ? 'Unable to call this contact.' : 'Unable to open this conversation.');
    }
  }, [onOpenConversation]);

  const deleteActiveCall = useCallback(async () => {
    if (!activeCall) return;
    try {
      await hideCallIds([activeCall.id]);
      setCalls(current => current.filter(call => call.id !== activeCall.id));
      setConfirmSingleDelete(false);
      setMoreOpen(false);
      closeCallDetails();
      setNotice('Call deleted.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to delete this call.');
    }
  }, [activeCall, closeCallDetails]);

  const blockActiveContact = useCallback(() => {
    if (!activeCall || activeCall.isGroup) return;
    setMoreOpen(false);
    setBlockError('');
    setBlockOpen(true);
  }, [activeCall]);

  const confirmActiveContactBlock = useCallback(async () => {
    if (!activeCall || activeCall.isGroup || blockBusy) return;
    setBlockBusy(true);
    setBlockError('');
    try {
      const message = await blockChatUser(activeCall.contactId);
      setBlockOpen(false);
      setNotice(message);
    } catch (error) {
      setBlockError(error instanceof Error ? error.message : 'Unable to block this contact.');
    } finally {
      setBlockBusy(false);
    }
  }, [activeCall, blockBusy]);

  const reportActiveContact = useCallback(() => {
    if (!activeCall || activeCall.isGroup) return;
    setMoreOpen(false);
    setReportOpen(true);
  }, [activeCall]);

  const selectionMode = selected.size > 0;
  const filters: Array<{id: Filter; label: string}> = [{id: 'all', label: 'All'}, {id: 'video', label: 'Video'}, {id: 'audio', label: 'Audio'}, {id: 'missed', label: 'Missed'}];
  const tabs = [{label: 'Chats', Icon: ChatTabIcon, press: onOpenChats}, {label: 'Contacts', Icon: ContactTabIcon, press: onOpenContacts}, {label: 'Calls', Icon: CallsTabIcon, press: undefined}, {label: 'Settings', Icon: SettingsTabIcon, press: onOpenSettings}];

  if (activeCall) {
    const relatedCalls = calls.filter(call => call.contactId === activeCall.contactId && call.isGroup === activeCall.isGroup);
    return <>
      <CallDetailsView call={activeCall} calls={relatedCalls} insets={insets} onAction={action => { openDetailAction(action).catch(() => undefined); }} onBack={closeCallDetails} onMore={() => setMoreOpen(true)} profile={activeProfile}/>
      <MoreOptionsSheet bottomInset={insets.bottom} onBlock={blockActiveContact} onClose={() => setMoreOpen(false)} onDelete={() => { setMoreOpen(false); setConfirmSingleDelete(true); }} onReport={reportActiveContact} visible={moreOpen}/>
      <BlockConfirmation busy={blockBusy} error={blockError} name={activeProfile?.name || activeCall.contactName} onCancel={() => { if (!blockBusy) setBlockOpen(false); }} onConfirm={() => { confirmActiveContactBlock().catch(() => undefined); }} visible={blockOpen}/>
      <ReportFlowSheet onClose={() => setReportOpen(false)} onSuccess={message => { setReportOpen(false); setNotice(message); }} reportedUserId={activeCall.contactId} visible={reportOpen}/>
      <DeleteCallsDialog count={1} onCancel={() => setConfirmSingleDelete(false)} onConfirm={() => { deleteActiveCall().catch(() => undefined); }} visible={confirmSingleDelete}/>
      <Snackbar message={notice} onHide={() => setNotice('')}/>
    </>;
  }

  return <View style={[styles.root, {paddingTop: insets.top}]}>
    {selectionMode ? <View style={styles.selectionHeader}>
      <Pressable accessibilityLabel="Close call selection" hitSlop={10} onPress={() => setSelected(new Set())} style={styles.backButton}><BackIcon/></Pressable>
      <View style={styles.selectionCopy}><Text style={styles.title}>Calls</Text><Text accessibilityLabel={`${selected.size} selected`} style={styles.selectedCount}>{selected.size} Selected</Text></View>
      <Pressable accessibilityLabel="Delete selected calls" hitSlop={10} onPress={() => setConfirmDelete(true)} style={styles.deleteButton}><DeleteIcon/></Pressable>
    </View> : <View style={styles.header}>
      <Pressable accessibilityLabel="Back from call history" accessibilityRole="button" hitSlop={10} onPress={onBack} style={styles.backButton}><BackIcon/></Pressable>
      <Text style={styles.title}>Calls</Text>
    </View>}

    <View style={styles.search}><SearchIcon/><TextInput accessibilityLabel="Search calls" onChangeText={setQuery} placeholder="Search Contacts" placeholderTextColor="#667085" style={styles.searchInput} value={query}/></View>
    <View style={styles.filters}>{filters.map(item => <Pressable accessibilityLabel={`${item.label} calls`} accessibilityRole="tab" accessibilityState={{selected: filter === item.id}} key={item.id} onPress={() => setFilter(item.id)} style={[styles.filter, filter === item.id && styles.filterActive]}><Text style={[styles.filterText, filter === item.id && styles.filterTextActive]}>{item.label}</Text></Pressable>)}</View>
    <Text style={styles.section}>Recent</Text>

    {loading ? <ActivityIndicator accessibilityLabel="Loading call history" color={PURPLE} style={styles.loading}/> : <ScrollView contentContainerStyle={[visibleCalls.length ? styles.list : styles.emptyList, {paddingBottom: 92 + insets.bottom}]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshCalls} tintColor={PURPLE} colors={[PURPLE]} />} showsVerticalScrollIndicator={false} style={styles.historyViewport}>
      {visibleCalls.length ? visibleCalls.map(call => {
        const chosen = selected.has(call.id);
        const missed = isMissed(call);
        // Use the same classification as the Missed filter and red status.
        const missedActions = missed;
        return <Pressable accessibilityLabel={`Call with ${call.contactName}`} accessibilityState={{selected: chosen}} delayLongPress={350} key={call.id} onLongPress={() => selectFromLongPress(call.id)} onPress={() => { if (selectionMode) toggle(call.id); else if (missedActions) openCallConversation(call, false).catch(() => undefined); else openCallDetails(call); }} style={styles.row}>
          {selectionMode ? <Check selected={chosen}/> : null}
          {call.avatar ? <Image source={{uri: call.avatar}} style={styles.avatar}/> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{initials(call.contactName)}</Text></View>}
          <View style={styles.rowCopy}>
            <Text numberOfLines={1} style={styles.name}>{call.contactName}</Text>
            <View style={styles.meta}><DirectionIcon direction={call.direction} missed={missed}/><Text style={[styles.time, missed && styles.missed]}>{timeLabel(call.occurredAt)}</Text>{durationLabel(call.duration) ? <><Text style={styles.dot}>•</Text><Text style={styles.duration}>{durationLabel(call.duration)}</Text></> : null}</View>
            {missedActions ? <View style={styles.missedActions}>
              <Pressable accessibilityLabel={`Callback ${call.contactName}`} accessibilityRole="button" disabled={selectionMode} hitSlop={4} onPress={event => { event?.stopPropagation?.(); openCallConversation(call).catch(() => undefined); }}>
                <Text style={styles.missedActionText}>Callback</Text>
              </Pressable>
              <Pressable accessibilityLabel={`Message ${call.contactName}`} accessibilityRole="button" disabled={selectionMode} hitSlop={4} onPress={event => { event?.stopPropagation?.(); openCallConversation(call, false).catch(() => undefined); }}>
                <Text style={styles.missedActionText}>Message</Text>
              </Pressable>
            </View> : null}
          </View>
          <Pressable accessibilityLabel={`${call.type === 'video' ? 'Video' : 'Audio'} call ${call.contactName}`} disabled={selectionMode} hitSlop={9} onPress={event => { event?.stopPropagation?.(); openCallConversation(call).catch(() => undefined); }} style={styles.callAction}>{call.type === 'video' ? <VideoCallIcon/> : <AudioCallIcon/>}</Pressable>
        </Pressable>;
      }) : <View style={styles.empty}><Text style={styles.emptyTitle}>{query.trim() ? 'No calls found' : filter === 'all' ? 'No calls yet' : `No ${filter} calls`}</Text><Text style={styles.emptyText}>{query.trim() ? 'Try a different contact name.' : filter === 'all' ? 'Your call history will appear here.' : 'Calls of this type will appear here.'}</Text></View>}
    </ScrollView>}

    <View style={[styles.bottomNav, {minHeight: 69 + insets.bottom, paddingBottom: 7 + insets.bottom}]}>{tabs.map(tab => { const active = tab.label === 'Calls'; return <Pressable accessibilityLabel={tab.label} key={tab.label} onPress={tab.press} style={styles.tab}><View style={[styles.tabIcon, active && styles.tabIconActive]}><tab.Icon active={active}/></View><Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text></Pressable>; })}</View>
    <DeleteCallsDialog count={selected.size} onCancel={() => setConfirmDelete(false)} onConfirm={() => { deleteSelected().catch(() => undefined); }} visible={confirmDelete}/>
    <Snackbar message={notice} onHide={() => setNotice('')}/>
  </View>;
}

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#FFF'},
  header: {height: 52, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 2},
  title: {fontFamily: FONT, fontSize: 18, fontWeight: '700', color: '#121826'},
  selectionHeader: {height: 58, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center'},
  backButton: {width: 28, height: 42, justifyContent: 'center'},
  selectionCopy: {flex: 1, marginLeft: 2},
  selectedCount: {fontFamily: FONT, fontSize: 9, color: '#697586', marginTop: 1},
  deleteButton: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
  search: {height: 38, marginHorizontal: 20, borderRadius: 6, backgroundColor: '#F7F8FA', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7},
  searchInput: {flex: 1, padding: 0, fontFamily: FONT, color: '#172033', fontSize: 11},
  filters: {height: 53, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 9},
  filter: {height: 27, minWidth: 52, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, borderColor: '#DDE3EB', alignItems: 'center', justifyContent: 'center'},
  filterActive: {backgroundColor: '#F0E8FF', borderColor: '#F0E8FF'},
  filterText: {fontFamily: FONT, fontSize: 9, color: '#344054'},
  filterTextActive: {color: '#6F28F5', fontWeight: '600'},
  section: {fontFamily: FONT, marginHorizontal: 20, marginTop: 1, marginBottom: 5, color: '#667085', fontSize: 9},
  loading: {marginTop: 38},
  historyViewport: {flex: 1},
  list: {paddingHorizontal: 20, paddingBottom: 92},
  emptyList: {flexGrow: 1, paddingHorizontal: 20, paddingBottom: 92},
  row: {height: 62, flexDirection: 'row', alignItems: 'center'},
  check: {width: 17, height: 17, borderRadius: 9, borderWidth: 1.3, borderColor: '#9AA8BA', marginRight: 9, alignItems: 'center', justifyContent: 'center'},
  checkSelected: {backgroundColor: '#8B5CF6', borderColor: '#8B5CF6'},
  avatar: {width: 43, height: 43, borderRadius: 5},
  avatarFallback: {width: 43, height: 43, borderRadius: 5, backgroundColor: '#EEE5FF', alignItems: 'center', justifyContent: 'center'},
  avatarText: {fontFamily: FONT, fontSize: 12, fontWeight: '700', color: '#6F28F5'},
  rowCopy: {flex: 1, minWidth: 0, marginLeft: 10},
  name: {fontFamily: FONT, color: '#111827', fontWeight: '600', fontSize: 11},
  meta: {height: 20, flexDirection: 'row', alignItems: 'center', gap: 4},
  time: {fontFamily: FONT, color: '#667085', fontSize: 8.5},
  missed: {color: '#EF4444'},
  missedActions: {flexDirection: 'row', gap: 14},
  missedActionText: {fontFamily: FONT, color: '#6F28F5', fontSize: 9, lineHeight: 13, fontWeight: '600'},
  dot: {fontFamily: FONT, color: '#98A2B3', fontSize: 8},
  duration: {fontFamily: FONT, color: '#667085', fontSize: 8.5},
  callAction: {width: 30, height: 38, justifyContent: 'center', alignItems: 'flex-end'},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80},
  emptyTitle: {fontFamily: FONT, color: '#172033', fontSize: 15, fontWeight: '600'},
  emptyText: {fontFamily: FONT, color: '#667085', fontSize: 11, marginTop: 6},
  bottomNav: {minHeight: 69, position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 6},
  tab: {width: 62, alignItems: 'center'},
  tabIcon: {height: 27, width: 34, justifyContent: 'center', alignItems: 'center', borderRadius: 7},
  tabIconActive: {backgroundColor: '#F1EBFF'},
  tabText: {fontFamily: FONT, marginTop: 2, fontSize: 9, color: '#536178'},
  tabTextActive: {color: '#641CFF', fontWeight: '700'},
  detailRoot: {flex: 1, backgroundColor: '#FFF'},
  detailHeader: {height: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center'},
  detailHeaderButton: {width: 32, height: 42, alignItems: 'center', justifyContent: 'center'},
  detailHeaderSpacer: {flex: 1},
  detailProfile: {alignItems: 'center', paddingTop: 7, paddingBottom: 14},
  detailAvatar: {width: 82, height: 82, borderRadius: 9},
  detailAvatarFallback: {width: 82, height: 82, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEE5FF'},
  detailAvatarLetters: {fontFamily: FONT, fontSize: 23, fontWeight: '700', color: '#6F28F5'},
  detailName: {fontFamily: FONT, marginTop: 10, fontSize: 14, fontWeight: '700', color: '#172033'},
  detailStatus: {fontFamily: FONT, marginTop: 3, maxWidth: 260, fontSize: 9, color: '#667085'},
  detailPhone: {fontFamily: FONT, marginTop: 5, fontSize: 10, color: '#475467'},
  detailActions: {height: 76, marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around'},
  detailAction: {width: 64, alignItems: 'center'},
  detailActionIcon: {width: 42, height: 36, borderRadius: 6, backgroundColor: '#F8F9FB', alignItems: 'center', justifyContent: 'center'},
  detailActionText: {fontFamily: FONT, marginTop: 5, fontSize: 8, color: '#111827'},
  detailHistory: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0', paddingHorizontal: 16, paddingTop: 13},
  detailGroup: {marginBottom: 14},
  detailDay: {fontFamily: FONT, fontSize: 9, color: '#667085', marginBottom: 6},
  detailRow: {height: 58, flexDirection: 'row', alignItems: 'center', gap: 9},
  detailRowCopy: {flex: 1},
  detailResult: {fontFamily: FONT, fontSize: 10, color: '#172033', fontWeight: '500'},
  detailTime: {fontFamily: FONT, fontSize: 8.5, color: '#667085', marginTop: 4},
  detailDuration: {fontFamily: FONT, fontSize: 9, color: '#475467'},
  sheetOverlay: {flex: 1, backgroundColor: 'rgba(15,23,42,.42)', justifyContent: 'flex-end'},
  optionsSheet: {minHeight: 225, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: '#FFF', paddingHorizontal: 22, paddingTop: 8},
  sheetHeader: {height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sheetTitle: {flex: 1, marginLeft: 18, textAlign: 'center', fontFamily: FONT, fontSize: 12, fontWeight: '500', color: '#111827'},
  sheetRow: {height: 55, flexDirection: 'row', alignItems: 'center', gap: 18},
  sheetDeleteIconSlot: {width: 17, height: 40, justifyContent: 'center', alignItems: 'center'},
  sheetRowText: {fontFamily: FONT, fontSize: 11, color: '#172033'},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(15,23,42,.42)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28},
  dialog: {width: '100%', maxWidth: 342, minHeight: 292, borderRadius: 10, backgroundColor: '#FFF', alignItems: 'center', paddingHorizontal: 34, paddingTop: 25, paddingBottom: 13, elevation: 12, shadowColor: '#0F172A', shadowOpacity: .22, shadowRadius: 18, shadowOffset: {width: 0, height: 8}},
  dialogIcon: {width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF0F1', alignItems: 'center', justifyContent: 'center'},
  dialogTitle: {fontFamily: FONT, color: '#172033', fontSize: 14, fontWeight: '700', marginTop: 18},
  dialogDescription: {fontFamily: FONT, color: '#667085', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 11},
  dialogDelete: {height: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 20},
  dialogDeleteText: {fontFamily: FONT, color: '#EF2525', fontSize: 11, fontWeight: '500'},
  dialogCancel: {height: 38, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center'},
  dialogCancelText: {fontFamily: FONT, color: '#111827', fontSize: 10, fontWeight: '500'},
});
