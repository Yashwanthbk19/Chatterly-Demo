import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, Path} from 'react-native-svg';
import {getForwardDestinations, searchChatContacts} from '../services/chatApi';
import type {ForwardDestination} from '../types/chat';
import {createThemedStyles, themeInk} from '../theme/themedStyles';

type Props = {messageCount: number; onBack: () => void; onForward: (destinations: ForwardDestination[], message: string) => Promise<void>};
const PURPLE = '#8B32F2';
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

function BackIcon() { return <Svg width={25} height={25} viewBox="0 0 24 24" fill="none"><Path d="m15 18-6-6 6-6" stroke={themeInk('#111827')} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function SearchIcon() { return <Svg width={27} height={27} viewBox="0 0 24 24" fill="none"><Circle cx={11} cy={11} r={7} stroke={themeInk('#526176')} strokeWidth={1.7}/><Path d="m16.2 16.2 4 4" stroke={themeInk('#526176')} strokeWidth={1.7} strokeLinecap="round"/></Svg>; }
function ForwardIcon({color = '#FFF'}: {color?: string}) { return <Svg width={27} height={27} viewBox="0 0 28 28" fill="none"><Path d="m17 7 6 5-6 5M22 12h-7c-4 0-7 2.5-8 7 2.2-2.3 4.7-3 8-3h2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }

function Choice({selected}: {selected: boolean}) {
  return <View style={[styles.choice, selected && styles.choiceSelected]}>{selected ? <Text style={styles.tick}>✓</Text> : null}</View>;
}

function Avatar({item}: {item: ForwardDestination}) {
  if (item.thumbnail) { return <Image source={{uri: item.thumbnail}} style={styles.avatar}/>; }
  return <View style={[styles.avatar, item.kind === 'group' && styles.groupAvatar]}><Text style={styles.initials}>{item.kind === 'group' ? '👥' : initials(item.name)}</Text></View>;
}

export function ForwardMessageScreen({messageCount, onBack, onForward}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [destinations, setDestinations] = useState<ForwardDestination[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    getForwardDestinations().then(records => { if (active) { setDestinations(records); } }).catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : 'Unable to load chats.'); } }).finally(() => { if (active) { setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) { return; }
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      searchChatContacts(normalized).then(contacts => {
        if (!active) { return; }
        setDestinations(current => {
          const byId = new Map(current.map(item => [item.id, item]));
          contacts.forEach(contact => byId.set(contact.userId, {id: contact.userId, name: contact.name, thumbnail: contact.thumbnail, subtitle: contact.phone || 'Contact', kind: 'contact'}));
          return [...byId.values()];
        });
      }).catch(() => undefined).finally(() => { if (active) { setSearching(false); } });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? destinations.filter(item => `${item.name} ${item.subtitle || ''}`.toLowerCase().includes(needle)) : destinations;
  }, [destinations, query]);
  const recent = useMemo(() => filtered.filter(item => item.recent).slice(0, 5), [filtered]);
  const selectedDestinations = [...selected].map(id => destinations.find(item => item.id === id)).filter((item): item is ForwardDestination => Boolean(item));
  const toggle = useCallback((id: string) => setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }), []);
  const submit = async () => {
    if (!selected.size || sending) { return; }
    setSending(true); setError('');
    const targets = destinations.filter(destination => selected.has(destination.id));
    try { await onForward(targets, message.trim()); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to forward messages.'); setSending(false); }
  };
  const row = (item: ForwardDestination, prefix: string) => <Pressable accessibilityLabel={`${selected.has(item.id) ? 'Deselect' : 'Select'} ${item.kind === 'group' ? 'group' : 'chat'} ${item.name}`} accessibilityRole="checkbox" accessibilityState={{checked: selected.has(item.id)}} key={`${prefix}-${item.id}`} onPress={() => toggle(item.id)} style={styles.row}><Choice selected={selected.has(item.id)}/><Avatar item={item}/><View style={styles.rowCopy}><Text numberOfLines={1} style={styles.name}>{item.name}</Text><Text numberOfLines={1} style={styles.subtitle}>{item.subtitle || (item.kind === 'group' ? 'Group chat' : 'Chat')}</Text></View></Pressable>;

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
    <View style={[styles.header, {paddingTop: insets.top}]}><Pressable accessibilityLabel="Close forward screen" onPress={onBack} style={styles.back}><BackIcon/></Pressable><Text style={styles.title}>Forward to</Text><View style={styles.headerSpacer}/></View>
    <View style={styles.searchBox}><SearchIcon/><TextInput accessibilityLabel="Search contacts or chats" autoCapitalize="none" onChangeText={setQuery} placeholder="Search Contacts or Chats" placeholderTextColor="#526176" style={styles.searchInput} value={query}/>{searching ? <ActivityIndicator color={PURPLE} size="small"/> : null}</View>
    {/* Android hides a scroll bar until the list is dragged; keep it on screen so a long list of chats and groups visibly scrolls. */}
    {loading ? <View style={styles.center}><ActivityIndicator color={PURPLE}/></View> : <ScrollView style={styles.destinationList} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" persistentScrollbar showsVerticalScrollIndicator>
      {recent.length ? <><Text style={styles.section}>Recently Contacted</Text>{recent.map(item => row(item, 'recent'))}</> : null}
      <Text style={styles.section}>{query.trim() ? 'Search Results' : 'All Chats'}</Text>
      {filtered.map(item => row(item, 'all'))}
      {!filtered.length ? <Text style={styles.empty}>No contacts, chats, or groups found.</Text> : null}
      <View style={selected.size ? styles.selectedSpacer : styles.listSpacer}/>
    </ScrollView>}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    {selected.size ? <View style={[styles.bottom, {paddingBottom: Math.max(insets.bottom, 12)}]}>
      <TextInput accessibilityLabel="Add a message when forwarding" editable={!sending} onChangeText={setMessage} placeholder="Type a message" placeholderTextColor="#65748C" style={styles.messageInput} value={message}/>
      <View style={styles.bottomActions}><ScrollView accessibilityLabel="Selected recipients" contentContainerStyle={styles.selectedRecipientsContent} horizontal persistentScrollbar showsHorizontalScrollIndicator style={styles.selectedRecipientsScroll}>{selectedDestinations.map((item, index) => <React.Fragment key={item.id}><Pressable accessibilityLabel={`Remove ${item.name}`} onPress={() => toggle(item.id)}><Text style={styles.selectedRecipients}>{item.name}</Text></Pressable>{index < selectedDestinations.length - 1 ? <Text style={styles.selectedRecipients}>, </Text> : null}</React.Fragment>)}</ScrollView><Pressable accessibilityLabel={`Forward ${messageCount} messages to ${selected.size} chats`} accessibilityState={{busy: sending}} disabled={sending} onPress={submit} style={[styles.forwardButton, sending && styles.disabled]}>{sending ? <ActivityIndicator color="#FFF"/> : <><ForwardIcon/><Text style={styles.forwardText}>Forward</Text></>}</Pressable></View>
    </View> : null}
  </KeyboardAvoidingView>;
}

const styles = createThemedStyles({
  root:{flex:1,backgroundColor:'#FFF'}, header:{minHeight:72,paddingHorizontal:12,flexDirection:'row',alignItems:'center'},back:{width:40,height:44,alignItems:'center',justifyContent:'center'},title:{flex:1,color:'#111827',fontSize:18,fontWeight:'600'},headerSpacer:{width:40},searchBox:{height:48,marginHorizontal:16,marginTop:6,paddingHorizontal:14,borderWidth:1,borderColor:'#DDE3EC',borderRadius:10,backgroundColor:'#FBFBFC',flexDirection:'row',alignItems:'center',gap:10},searchInput:{flex:1,color:'#111827',fontSize:14},destinationList:{flex:1,minHeight:0},list:{paddingHorizontal:16,paddingTop:14},section:{marginTop:6,marginBottom:7,color:'#65748C',fontSize:14,fontWeight:'500'},row:{height:66,flexDirection:'row',alignItems:'center'},choice:{width:24,height:24,marginRight:13,borderRadius:12,borderWidth:1.7,borderColor:'#65748C',alignItems:'center',justifyContent:'center'},choiceSelected:{borderColor:PURPLE,backgroundColor:PURPLE},tick:{color:'#FFF',fontSize:15,fontWeight:'700'},avatar:{width:46,height:46,borderRadius:10,backgroundColor:'#EEE8FC',alignItems:'center',justifyContent:'center'},groupAvatar:{backgroundColor:'#E6F3FF'},initials:{color:'#6D28D9',fontSize:12,fontWeight:'700'},rowCopy:{flex:1,minWidth:0,marginLeft:12},name:{color:'#111827',fontSize:15,fontWeight:'600'},subtitle:{marginTop:3,color:'#3F4D63',fontSize:12},center:{flex:1,alignItems:'center',justifyContent:'center'},empty:{paddingVertical:24,color:'#6B7280',fontSize:13,textAlign:'center'},listSpacer:{height:24},selectedSpacer:{height:152},error:{paddingHorizontal:16,paddingVertical:7,color:'#DC2626',fontSize:12},bottom:{position:'absolute',left:0,right:0,bottom:0,minHeight:136,paddingTop:10,paddingHorizontal:16,borderTopWidth:1,borderTopColor:'#EAECF0',backgroundColor:'#FFF',shadowColor:'#111827',shadowOpacity:.08,shadowRadius:12,elevation:8},messageInput:{height:44,paddingHorizontal:13,borderWidth:1,borderColor:'#DDE3EC',borderRadius:10,color:'#111827',fontSize:14,backgroundColor:'#FFF'},bottomActions:{marginTop:8,flexDirection:'row',alignItems:'center'},selectedRecipientsScroll:{flex:1,minWidth:0,marginRight:10},selectedRecipientsContent:{alignItems:'center',paddingBottom:7},selectedRecipients:{color:'#111827',fontSize:12,fontWeight:'600'},forwardButton:{height:46,minWidth:116,paddingHorizontal:14,borderRadius:12,backgroundColor:PURPLE,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},forwardText:{color:'#FFF',fontSize:15,fontWeight:'700'},disabled:{opacity:.65},
});
