import * as Clipboard from 'expo-clipboard';
import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {MessageActionIcon} from '../components/MessageActionIcons';
import {getGroupPinnedMessages, unpinGroupMessage, type GroupMember} from '../services/groupApi';
import {deleteMessage, getPinnedMessages, unpinMessage} from '../services/chatApi';
import type {ChatMessage} from '../types/chat';
import {groupRoleLabel} from '../utils/groupAdmin';
import {messagePreview} from '../utils/messagePreview';
import {createThemedStyles, themeInk} from '../theme/themedStyles';

type Props = {
  visible: boolean;
  groupId?: string;
  chatId?: string;
  contactName?: string;
  initialMessages: ChatMessage[];
  members?: GroupMember[];
  onBack: () => void;
  onOpenInChat: (message: ChatMessage) => void;
  onForward: (messages: ChatMessage[]) => void;
  onDelete: (message: ChatMessage) => void;
  onDeletedForMe: (messageIds: string[]) => void;
  onUnpinned: (messageId: string) => void;
  onNotice: (message: string) => void;
};

type PinnedAction = 'open' | 'select' | 'forward' | 'copy' | 'unpin' | 'delete';
const PURPLE = '#6F28F5';
const FONT = Platform.select({android: 'sans-serif', ios: 'System'});

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';
const pinnedTime = (message: ChatMessage) => Date.parse(message.pinnedAt || message.createdAt || '') || 0;

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleDateString('en-US', {month: 'short'});
  const year = date.getFullYear();
  const time = date.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true});
  return `${day}-${month}-${year} at ${time}`;
}

function BackIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="m15 18-6-6 6-6" stroke={themeInk('#1E293B')} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function SearchIcon() {
  return <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"><Circle cx={11} cy={11} r={6.5} stroke={themeInk('#64748B')} strokeWidth={1.5}/><Path d="m16 16 4 4" stroke={themeInk('#64748B')} strokeWidth={1.5} strokeLinecap="round"/></Svg>;
}

function ChevronIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="m9 6 6 6-6 6" stroke={themeInk('#334155')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function OpenInChatIcon() {
  return <Svg width={40} height={40} viewBox="0 0 40 40" fill="none"><Path d="M13 14.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 3v-3h-2a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/><Path d="M17 20.5h6" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round"/></Svg>;
}

function RoleBadge({role}: {role: GroupMember['role']}) {
  const label = groupRoleLabel(role);
  return <View style={[styles.roleBadge, role === 'moderator' && styles.moderatorBadge, role === 'member' && styles.memberBadge]}><Text style={[styles.roleText, role === 'moderator' && styles.moderatorText, role === 'member' && styles.memberText]}>{label}</Text></View>;
}

function SenderAvatar({name, uri}: {name: string; uri?: string | null}) {
  return uri ? <Image source={{uri}} style={styles.avatar}/> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>{initials(name)}</Text></View>;
}

export function PinnedMessagesScreen({visible, groupId, chatId, contactName, initialMessages, members = [], onBack, onOpenInChat, onForward, onDelete, onDeletedForMe, onUnpinned, onNotice}: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setSelectionMode(false);
      setSelectedMessageIds(new Set());
      setQuery('');
      return;
    }
    let active = true;
    setMessages(initialMessages.filter(message => message.isPinned && !message.isDeleted && !message.deletedForMe).sort((a, b) => pinnedTime(b) - pinnedTime(a)));
    setLoading(true);
    const request = groupId ? getGroupPinnedMessages(groupId) : chatId ? getPinnedMessages(chatId) : Promise.resolve([]);
    request
      .then(pinned => { if (active) setMessages(pinned.filter(message => !message.isDeleted && !message.deletedForMe)); })
      .catch(error => { if (active) onNotice(error instanceof Error ? error.message : 'Unable to load pinned messages.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [chatId, groupId, initialMessages, onNotice, visible]);

  const unpin = (messageId: string) => groupId ? unpinGroupMessage(groupId, messageId) : unpinMessage(messageId);

  const memberById = useMemo(() => new Map(members.map(member => [member.userId, member])), [members]);
  const displayed = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return messages;
    return messages.filter(message => {
      const member = memberById.get(String(message.senderId || ''));
      return messagePreview(message).toLowerCase().includes(needle) || (member?.name || message.senderName || '').toLowerCase().includes(needle);
    });
  }, [memberById, messages, query]);

  const leaveFor = (callback: (message: ChatMessage) => void, message: ChatMessage) => {
    setSelected(null);
    onBack();
    callback(message);
  };

  const runAction = async (action: PinnedAction) => {
    const message = selected;
    if (!message || busy) return;
    if (action === 'open') { leaveFor(onOpenInChat, message); return; }
    if (action === 'select') {
      setSelected(null);
      setSelectionMode(true);
      setSelectedMessageIds(new Set([message.id]));
      return;
    }
    if (action === 'forward') {
      setSelected(null);
      onBack();
      onForward([message]);
      return;
    }
    if (action === 'delete') { leaveFor(onDelete, message); return; }
    setBusy(true);
    try {
      if (action === 'copy') {
        await Clipboard.setStringAsync(message.text || message.mediaUrl || message.fileName || '');
        setSelected(null);
        onNotice('Message copied.');
      }
      if (action === 'unpin') {
        await unpin(message.id);
        setMessages(current => current.filter(item => item.id !== message.id));
        setSelected(null);
        onUnpinned(message.id);
        onNotice('Message unpinned.');
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Unable to complete that action.');
    } finally {
      setBusy(false);
    }
  };

  const selectedMessages = useMemo(() => messages.filter(message => selectedMessageIds.has(message.id)), [messages, selectedMessageIds]);
  const clearSelection = () => { setSelectionMode(false); setSelectedMessageIds(new Set()); };
  const toggleSelection = (messageId: string) => {
    setSelectedMessageIds(current => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId); else next.add(messageId);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };
  const copySelected = async () => {
    if (!selectedMessages.length || busy) return;
    setBusy(true);
    try {
      await Clipboard.setStringAsync(selectedMessages.map(message => message.text || message.mediaUrl || message.fileName || '').filter(Boolean).join('\n'));
      onNotice(`${selectedMessages.length} ${selectedMessages.length === 1 ? 'message' : 'messages'} copied.`);
    } finally { setBusy(false); }
  };
  const unpinSelected = async () => {
    if (!selectedMessages.length || busy) return;
    setBusy(true);
    try {
      await Promise.all(selectedMessages.map(message => unpin(message.id)));
      const ids = new Set(selectedMessages.map(message => message.id));
      setMessages(current => current.filter(message => !ids.has(message.id)));
      selectedMessages.forEach(message => onUnpinned(message.id));
      clearSelection();
      onNotice(`${selectedMessages.length} ${selectedMessages.length === 1 ? 'message' : 'messages'} unpinned.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Unable to unpin the selected messages.');
    } finally { setBusy(false); }
  };
  const deleteSelected = () => {
    if (!selectedMessages.length || busy) return;
    const count = selectedMessages.length;
    Alert.alert(`Delete ${count === 1 ? 'message' : `${count} messages`}?`, 'The selected messages will be deleted only for you.', [
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress:async () => {
        setBusy(true);
        try {
          const ids = selectedMessages.map(message => message.id);
          await Promise.all(ids.map(messageId => deleteMessage(messageId, false)));
          const deletedIds = new Set(ids);
          setMessages(current => current.filter(message => !deletedIds.has(message.id)));
          onDeletedForMe(ids);
          clearSelection();
          onNotice(`${count} ${count === 1 ? 'message' : 'messages'} deleted for you.`);
        } catch (error) {
          onNotice(error instanceof Error ? error.message : 'Unable to delete the selected messages.');
        } finally { setBusy(false); }
      }},
    ]);
  };
  const forwardSelected = () => {
    if (!selectedMessages.length || busy) return;
    onBack();
    onForward(selectedMessages);
  };

  const renderMessage = ({item}: {item: ChatMessage}) => {
    const member = memberById.get(String(item.senderId || ''));
    const name = item.isOwn ? 'You' : member?.name || item.senderName || contactName || (groupId ? 'Group member' : 'Contact');
    const role = member?.role || item.senderRole || 'member';
    const checked = selectedMessageIds.has(item.id);
    const openActions = () => selectionMode ? toggleSelection(item.id) : setSelected(item);
    return <Pressable accessibilityHint={selectionMode ? 'Toggles message selection' : 'Shows message actions'} accessibilityLabel={`Pinned message from ${name}: ${messagePreview(item)}`} accessibilityState={selectionMode ? {selected:checked} : undefined} onLongPress={openActions} onPress={openActions} style={[styles.messageRow, checked && styles.selectedRow]}>
      {selectionMode ? <View style={[styles.selectionCircle, checked && styles.selectionCircleChecked]}>{checked ? <Text style={styles.selectionTick}>✓</Text> : null}</View> : null}
      <SenderAvatar name={name} uri={member?.profilePic || item.senderThumbnail}/>
      <View style={styles.messageCopy}>
        <View style={styles.senderLine}><Text numberOfLines={1} style={styles.senderName}>{name}</Text>{groupId ? <RoleBadge role={role}/> : null}</View>
        <Text numberOfLines={1} style={styles.timestamp}>Pinned {formatTimestamp(item.pinnedAt || item.createdAt)} · Until unpinned</Text>
        <Text ellipsizeMode="tail" numberOfLines={2} style={styles.preview}>{messagePreview(item)}</Text>
      </View>
      {!selectionMode ? <View style={styles.chevron}><ChevronIcon/></View> : null}
    </Pressable>;
  };

  const actions: Array<{key: PinnedAction; label: string}> = [
    {key: 'open', label: 'Open in Chat'},
    {key: 'select', label: 'Select'},
    {key: 'forward', label: 'Forward'},
    {key: 'copy', label: 'Copy'},
    {key: 'unpin', label: 'Unpin Message'},
    {key: 'delete', label: 'Delete'},
  ];

  const closeOrBack = () => selectionMode ? clearSelection() : onBack();

  return <Modal animationType="slide" onRequestClose={closeOrBack} statusBarTranslucent visible={visible}>
    <View style={[styles.screen, {paddingTop: insets.top}]}>
      {selectionMode ? <View accessibilityLabel={`${selectedMessageIds.size} selected`} style={styles.selectionHeader}>
        <Pressable accessibilityLabel="Close pinned message selection" onPress={clearSelection} style={styles.back}><Text style={styles.closeSelection}>×</Text></Pressable>
        <Text accessibilityRole="header" style={styles.selectionTitle}>{selectedMessageIds.size} Selected</Text>
        <Pressable accessibilityLabel="Copy selected pinned messages" disabled={!selectedMessageIds.size || busy} onPress={copySelected} style={styles.selectionAction}><MessageActionIcon action="copy"/></Pressable>
        <Pressable accessibilityLabel="Unpin selected messages" disabled={!selectedMessageIds.size || busy} onPress={unpinSelected} style={styles.selectionAction}><MessageActionIcon action="unpin"/></Pressable>
        <Pressable accessibilityLabel="Delete selected pinned messages" disabled={!selectedMessageIds.size || busy} onPress={deleteSelected} style={styles.selectionAction}><MessageActionIcon action="delete"/></Pressable>
        <Pressable accessibilityLabel="Forward selected pinned messages" disabled={!selectedMessageIds.size || busy} onPress={forwardSelected} style={styles.selectionAction}><MessageActionIcon action="forward"/></Pressable>
      </View> : <View style={styles.header}><Pressable accessibilityLabel="Back from pinned messages" onPress={onBack} style={styles.back}><BackIcon/></Pressable><Text accessibilityRole="header" style={styles.title}>Pinned</Text></View>}
      <View style={styles.searchBox}><SearchIcon/><TextInput accessibilityLabel="Search Messages" autoCapitalize="none" onChangeText={setQuery} placeholder="Search Messages" placeholderTextColor="#64748B" returnKeyType="search" style={styles.searchInput} value={query}/></View>
      {loading && messages.length === 0 ? <View style={styles.center}><ActivityIndicator color={PURPLE}/></View> : <FlatList contentContainerStyle={[styles.list, displayed.length === 0 && styles.emptyList]} data={displayed} keyboardShouldPersistTaps="handled" keyExtractor={item => item.id} ListEmptyComponent={<Text style={styles.empty}>{query.trim() ? 'No pinned messages match your search.' : 'No pinned messages yet.'}</Text>} renderItem={renderMessage} showsVerticalScrollIndicator={false}/>} 
    </View>
    <Modal animationType="fade" onRequestClose={() => setSelected(null)} statusBarTranslucent transparent visible={selected !== null}>
      <View style={styles.sheetBackdrop}><Pressable accessibilityLabel="Close pinned message actions" onPress={() => setSelected(null)} style={StyleSheet.absoluteFill}/><View accessibilityLabel="Pinned message actions" style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, 14)}]}><View style={styles.handle}/>{actions.map(action => <Pressable accessibilityLabel={action.label} disabled={busy} key={action.key} onPress={() => runAction(action.key)} style={[styles.action, action.key === 'delete' && styles.deleteAction]}><View style={styles.actionIcon}>{action.key === 'open' ? <OpenInChatIcon/> : <MessageActionIcon action={action.key === 'unpin' ? 'unpin' : action.key}/>}</View><Text style={[styles.actionText, action.key === 'delete' && styles.deleteText]}>{action.label}</Text>{busy && action.key === 'unpin' ? <ActivityIndicator color={PURPLE} size="small"/> : null}</Pressable>)}</View></View>
    </Modal>
  </Modal>;
}

const styles = createThemedStyles({
  screen:{flex:1,backgroundColor:'#FFF'},header:{height:55,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:'#EEF0F4',flexDirection:'row',alignItems:'center'},selectionHeader:{height:55,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:'#EEF0F4',flexDirection:'row',alignItems:'center'},back:{width:38,height:42,alignItems:'center',justifyContent:'center'},title:{color:'#172033',fontFamily:FONT,fontSize:16,fontWeight:'700'},closeSelection:{color:'#172033',fontSize:22,fontWeight:'400'},selectionTitle:{flex:1,color:'#172033',fontFamily:FONT,fontSize:13,fontWeight:'600'},selectionAction:{width:36,height:44,overflow:'hidden',alignItems:'center',justifyContent:'center'},searchBox:{height:42,marginHorizontal:16,marginTop:14,marginBottom:6,paddingHorizontal:13,borderWidth:1,borderColor:'#E6E9EF',borderRadius:7,backgroundColor:'#F8F9FB',flexDirection:'row',alignItems:'center',gap:9},searchInput:{flex:1,height:42,paddingVertical:0,color:'#172033',fontFamily:FONT,fontSize:13},center:{flex:1,alignItems:'center',justifyContent:'center'},list:{paddingHorizontal:16,paddingBottom:30},emptyList:{flexGrow:1,justifyContent:'center'},empty:{color:'#8792A4',fontFamily:FONT,fontSize:13,textAlign:'center'},messageRow:{minHeight:91,borderBottomWidth:1,borderBottomColor:'#EEF0F4',flexDirection:'row',alignItems:'flex-start',paddingVertical:11},selectedRow:{marginHorizontal:-16,paddingHorizontal:16,backgroundColor:'#F2E9FF'},selectionCircle:{width:18,height:18,marginTop:10,marginRight:9,borderRadius:9,borderWidth:1.5,borderColor:'#8792A4',alignItems:'center',justifyContent:'center'},selectionCircleChecked:{borderColor:'#8B5CF6',backgroundColor:'#8B5CF6'},selectionTick:{color:'#FFF',fontSize:11,fontWeight:'800',lineHeight:13},avatar:{width:39,height:39,borderRadius:6},avatarFallback:{borderWidth:1,borderColor:'#E7ECF3',backgroundColor:'#F1ECFC',alignItems:'center',justifyContent:'center'},avatarText:{color:PURPLE,fontSize:11,fontWeight:'700'},messageCopy:{flex:1,minWidth:0,marginLeft:10},senderLine:{height:19,flexDirection:'row',alignItems:'center',gap:7},senderName:{maxWidth:'58%',color:'#172033',fontFamily:FONT,fontSize:13,fontWeight:'700'},roleBadge:{paddingHorizontal:6,paddingVertical:2,borderRadius:4,backgroundColor:'#EEEAFE'},roleText:{color:'#5331C5',fontFamily:FONT,fontSize:9,fontWeight:'700'},moderatorBadge:{backgroundColor:'#E7F7F0'},moderatorText:{color:'#16815F'},memberBadge:{backgroundColor:'#F1F3F6'},memberText:{color:'#64748B'},timestamp:{marginTop:1,color:'#7B8798',fontFamily:FONT,fontSize:9},preview:{marginTop:8,color:'#344256',fontFamily:FONT,fontSize:11,lineHeight:15},chevron:{width:25,height:45,alignItems:'flex-end',justifyContent:'center'},sheetBackdrop:{flex:1,backgroundColor:'rgba(15,23,42,.42)',justifyContent:'flex-end'},sheet:{overflow:'hidden',borderTopLeftRadius:13,borderTopRightRadius:13,backgroundColor:'#FFF'},handle:{width:41,height:4,marginTop:8,marginBottom:5,borderRadius:2,backgroundColor:'#D5DAE2',alignSelf:'center'},action:{height:56,paddingHorizontal:16,flexDirection:'row',alignItems:'center'},deleteAction:{borderTopWidth:1,borderTopColor:'#EEF0F4'},actionIcon:{width:42,alignItems:'center',justifyContent:'center'},actionText:{flex:1,color:'#111827',fontFamily:FONT,fontSize:14,fontWeight:'500'},deleteText:{color:'#DC2626'},
});
