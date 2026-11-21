import {useVideoPlayer, VideoView} from 'expo-video';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Image, Linking, Modal, Platform, Pressable, ScrollView, Text, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {getChatFiles, getChatMessages, getGroupMessages, getMediaDownloadUrl, getSharedLinks, getSharedMedia} from '../services/chatApi';
import {getSession} from '../services/sessionStore';
import type {ChatMessage, ConversationContact, SharedLink} from '../types/chat';
import {messagePreview} from '../utils/messagePreview';
import {createThemedStyles} from '../theme/themedStyles';
import {themeInk} from '../theme/themedStyles';

export type SharedContentTab = 'media' | 'files' | 'links' | 'history';

type Props = {
  visible: boolean;
  chatId: string;
  contact: ConversationContact;
  initialTab?: SharedContentTab;
  onBack: () => void;
  onNotice: (message: string) => void;
};

const PURPLE = '#6F28F5';
const FONT = Platform.select({android: 'sans-serif', ios: 'System'});

function BackArrow() {
  return <Svg width={18} height={18} viewBox={'0 0 24 24'} fill={'none'}><Path d={'m15 18-6-6 6-6'} stroke={themeInk('#223047')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
}

function CloseIcon() {
  return <Svg width={18} height={18} viewBox={'0 0 24 24'}><Path d={'m7 7 10 10M17 7 7 17'} stroke={themeInk('#526176')} strokeWidth={1.45} strokeLinecap={'round'} /></Svg>;
}

function TabIcon({tab, active}: {tab: SharedContentTab; active: boolean}) {
  const color = active ? PURPLE : '#263448';
  if (tab === 'media') return <Svg width={25} height={24} viewBox={'0 0 25 24'} fill={'none'}><Path d={'M15.625 8H15.6354M3.125 16L8.33333 11C9.3 10.107 10.4917 10.107 11.4583 11L16.6667 16M14.5833 14L15.625 13C16.5917 12.107 17.7833 12.107 18.75 13L21.875 16M3.125 6C3.125 5.20435 3.45424 4.44129 4.04029 3.87868C4.62634 3.31607 5.4212 3 6.25 3H18.75C19.5788 3 20.3737 3.31607 20.9597 3.87868C21.5458 4.44129 21.875 5.20435 21.875 6V18C21.875 18.7956 21.5458 19.5587 20.9597 20.1213C20.3737 20.6839 19.5788 21 18.75 21H6.25C5.4212 21 4.62634 20.6839 4.04029 20.1213C3.45424 19.5587 3.125 18.7956 3.125 18V6Z'} stroke={themeInk('#5121BF')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
  if (tab === 'files') return <Svg width={25} height={24} viewBox={'0 0 25 24'} fill={'none'}><Path d={'M14.5834 3V7C14.5834 7.26522 14.6931 7.51957 14.8885 7.70711C15.0838 7.89464 15.3488 8 15.625 8H19.7917M19.7917 8L14.5834 3H7.29171C6.73917 3 6.20927 3.21071 5.81857 3.58579C5.42787 3.96086 5.20837 4.46957 5.20837 5V19C5.20837 19.5304 5.42787 20.0391 5.81857 20.4142C6.20927 20.7893 6.73917 21 7.29171 21H17.7084C18.2609 21 18.7908 20.7893 19.1815 20.4142C19.5722 20.0391 19.7917 19.5304 19.7917 19V8Z'} stroke={themeInk('#1E293B')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
  if (tab === 'links') return <Svg width={25} height={24} viewBox={'0 0 25 24'} fill={'none'}><Path d={'M9.37501 15.0003L15.625 9.00031M11.4583 6.00031L11.9406 5.46431C12.9175 4.52663 14.2424 3.99991 15.6238 4C17.0052 4.00009 18.33 4.527 19.3068 5.46481C20.2835 6.40261 20.8322 7.6745 20.8321 9.00066C20.832 10.3268 20.2831 11.5986 19.3063 12.5363L18.75 13.0003M13.5417 18.0003L13.1281 18.5343C12.1396 19.472 10.8059 19.9979 9.41616 19.9979C8.02644 19.9979 6.69272 19.472 5.70418 18.5343C5.2168 18.072 4.82984 17.5215 4.56574 16.9146C4.30164 16.3077 4.16565 15.6565 4.16565 14.9988C4.16565 14.3411 4.30164 13.6899 4.56574 13.083C4.82984 12.4761 5.2168 11.9256 5.70418 11.4633L6.25001 11.0003'} stroke={themeInk('#1E293B')} strokeWidth={1.5} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
  return <Svg width={17} height={17} viewBox={'0 0 24 24'} fill={'none'}><Path d={'M5 5.5h14v11H9l-4 3v-14Z'} stroke={color} strokeWidth={1.35} strokeLinejoin={'round'} /><Path d={'M8 9h8M8 12h6'} stroke={color} strokeWidth={1.2} strokeLinecap={'round'} /></Svg>;
}

function PlayIcon() {
  return <View style={styles.playCircle}><Svg width={15} height={15} viewBox={'0 0 24 24'}><Path d={'m9 6 9 6-9 6V6Z'} fill={themeInk('#FFF')} /></Svg></View>;
}

function FileGlyph({name}: {name: string}) {
  const extension = (name.split('.').pop() || 'FILE').toUpperCase();
  const color = extension === 'PDF' ? '#F34D55' : extension === 'XLSX' || extension === 'XLS' ? '#23A668' : extension === 'PPTX' || extension === 'PPT' ? '#EF7542' : '#3978ED';
  return <View style={[styles.fileGlyph, {backgroundColor: color}]}><View style={styles.fileFold} /><Text style={styles.fileGlyphText}>{extension.slice(0, 3)}</Text></View>;
}

function formatSize(bytes?: number) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: true});
}

function dateSection(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const item = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((start - item) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return 'Earlier this month';
  return date.toLocaleDateString([], {month: 'long', year: 'numeric'});
}

function grouped<T extends {createdAt: string}>(items: T[]): Array<{title: string; items: T[]}> {
  const sections: Array<{title: string; items: T[]}> = [];
  items.forEach(item => {
    const title = dateSection(item.createdAt);
    const section = sections.find(candidate => candidate.title === title);
    if (section) section.items.push(item); else sections.push({title, items: [item]});
  });
  return sections;
}

function PreviewVideo({uri}: {uri: string}) {
  const player = useVideoPlayer(uri);
  return <VideoView contentFit={'contain'} nativeControls player={player} style={styles.previewMedia} />;
}

function senderLabel(message: ChatMessage, contact: ConversationContact) {
  return message.isOwn ? 'You' : contact.name;
}

function linkTitle(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.split('/').filter(Boolean).pop();
    return path ? decodeURIComponent(path).replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : parsed.hostname.replace(/^www\./, '');
  } catch { return url; }
}

function LinkGlyph({url}: {url: string}) {
  let host = '';
  try { host = new URL(url).hostname; } catch { /* Fallback to a chain icon. */ }
  const letter = host.includes('youtube') ? '▶' : host.includes('drive.google') ? '▲' : host.includes('figma') ? 'F' : host.includes('miro') ? 'M' : '↗';
  const color = host.includes('youtube') ? '#FF1E2D' : host.includes('drive.google') ? '#2DA45C' : host.includes('figma') ? '#8B27E9' : host.includes('miro') ? '#FFD231' : '#4B78EA';
  return <View style={[styles.linkGlyph, {backgroundColor: color}]}><Text style={[styles.linkGlyphText, color === '#FFD231' && styles.darkLinkGlyphText]}>{letter}</Text></View>;
}

export function SharedContentScreen({visible, chatId, contact, initialTab = 'media', onBack, onNotice}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<SharedContentTab>(initialTab);
  const [media, setMedia] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<ChatMessage[]>([]);
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ChatMessage | null>(null);

  useEffect(() => { if (visible) setTab(initialTab); }, [initialTab, visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    if (contact.kind === 'group') {
      getGroupMessages(contact.userId || chatId).then(groupHistory => {
        if (!active) return;
        setMedia(groupHistory.filter(item => ['image', 'video', 'audio'].includes(item.messageType || '')));
        setFiles(groupHistory.filter(item => item.messageType === 'file'));
        setLinks(groupHistory.flatMap(message => (message.text.match(/https?:\/\/[^\s]+/gi) || []).map((url, index) => ({id: `${message.id}-link-${index}`, url, senderId: message.senderId || undefined, createdAt: message.createdAt}))));
        setHistory(groupHistory.slice().reverse());
      }).catch(() => { if (active) onNotice('Unable to load shared content.'); }).finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    Promise.allSettled([
      getSharedMedia(contact.userId),
      getChatFiles(chatId),
      getSharedLinks(contact.userId),
      getChatMessages(chatId),
    ]).then(results => {
      if (!active) return;
      const chatHistory = results[3].status === 'fulfilled' ? results[3].value : [];
      const remoteMedia = results[0].status === 'fulfilled' ? results[0].value : [];
      setMedia(remoteMedia.map(item => {
        const fullMessage = chatHistory.find(message => message.id === item.id || Boolean(message.mediaUrl && message.mediaUrl === item.mediaUrl));
        return fullMessage ? {...item, isOwn: fullMessage.isOwn, messageType: fullMessage.messageType || item.messageType} : item;
      }));
      setFiles(results[1].status === 'fulfilled' ? results[1].value : []);
      const remoteLinks = results[2].status === 'fulfilled' ? results[2].value : [];
      const fallbackLinks = chatHistory.flatMap(message => (message.text.match(/https?:\/\/[^\s]+/gi) || []).map((url, index) => ({
        id: `${message.id}-link-${index}`, url, senderId: message.isOwn ? String(getSession()?.user?.id || '') : contact.userId, createdAt: message.createdAt,
      })));
      setLinks(remoteLinks.length ? remoteLinks : fallbackLinks);
      setHistory(chatHistory.slice().reverse());
      if (results.every(result => result.status === 'rejected')) onNotice('Unable to load shared content.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [chatId, contact.kind, contact.userId, onNotice, visible]);

  const openFile = useCallback(async (message: ChatMessage) => {
    try {
      const url = await getMediaDownloadUrl(message.id).catch(() => message.mediaUrl || '');
      if (!url) throw new Error('No file link is available.');
      await Linking.openURL(url);
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Unable to open this file.'); }
  }, [onNotice]);

  const currentCount = tab === 'media' ? media.length : tab === 'files' ? files.length : tab === 'links' ? links.length : history.length;
  const mediaSections = useMemo(() => grouped(media), [media]);
  const fileSections = useMemo(() => grouped(files), [files]);
  const linkSections = useMemo(() => grouped(links), [links]);
  const historySections = useMemo(() => grouped(history), [history]);
  const currentUserId = String(getSession()?.user?.id || '');
  const tabs: Array<{key: SharedContentTab; label: string}> = [
    {key: 'media', label: 'Media'}, {key: 'files', label: 'Files'}, {key: 'links', label: 'Links'},
    ...(initialTab === 'history' ? [{key: 'history' as const, label: 'Chat History'}] : []),
  ];

  return <Modal animationType={'slide'} onRequestClose={onBack} statusBarTranslucent visible={visible}>
    <View accessibilityLabel={'Shared Files'} style={[styles.screen, {paddingTop: insets.top, paddingBottom: insets.bottom}]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={'Back to profile'} hitSlop={9} onPress={onBack} style={styles.headerButton}><BackArrow /></Pressable>
        <Text accessibilityRole={'header'} style={styles.headerTitle}>Shared Files</Text>
        <Pressable accessibilityLabel={'Close shared files'} hitSlop={9} onPress={onBack} style={styles.headerButton}><CloseIcon /></Pressable>
      </View>
      <View style={styles.tabs}>{tabs.map(item => {
        const active = tab === item.key;
        return <Pressable accessibilityLabel={`${item.label} tab`} accessibilityState={{selected: active}} key={item.key} onPress={() => setTab(item.key)} style={[styles.tab, active && styles.activeTab]}><TabIcon active={active} tab={item.key} /><Text style={[styles.tabText, active && styles.activeTabText]}>{item.label}</Text></Pressable>;
      })}</View>
      {loading ? <View style={styles.center}><ActivityIndicator color={PURPLE} /></View> : currentCount === 0 ? <View style={styles.center}><Text style={styles.emptyTitle}>No shared {tab === 'history' ? 'messages' : tab} yet</Text><Text style={styles.emptyCopy}>Items shared in this conversation will appear here.</Text></View> : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {tab === 'media' && mediaSections.map(section => <View key={section.title}><Text style={styles.sectionTitle}>{section.title}</Text><View style={styles.mediaGrid}>{section.items.map(item => <Pressable accessibilityLabel={`Open ${item.messageType || 'media'}`} key={item.id} onPress={() => setPreview(item)} style={styles.mediaTile}>{item.messageType === 'image' ? <Image source={{uri: item.thumbnailUrl || item.mediaUrl}} style={styles.mediaImage} /> : item.thumbnailUrl ? <Image source={{uri: item.thumbnailUrl}} style={styles.mediaImage} /> : <View style={[styles.mediaImage, styles.videoFallback]}><Text style={styles.videoFallbackText}>{item.messageType === 'audio' ? 'AUDIO' : 'VIDEO'}</Text></View>}{item.messageType !== 'image' ? <PlayIcon /> : null}<View style={styles.ownerBadge}><Text style={styles.ownerBadgeText}>{senderLabel(item, contact)}</Text></View>{item.messageType === 'video' && item.audioDuration ? <Text style={styles.duration}>{Math.floor(item.audioDuration / 60)}:{String(Math.round(item.audioDuration % 60)).padStart(2, '0')}</Text> : null}</Pressable>)}</View></View>)}
          {tab === 'files' && fileSections.map(section => <View key={section.title}><Text style={styles.sectionTitle}>{section.title}</Text>{section.items.map(item => <Pressable accessibilityLabel={`Open ${item.fileName || 'file'}`} key={item.id} onPress={() => openFile(item)} style={styles.fileRow}><FileGlyph name={item.fileName || 'file'} /><View style={styles.rowCopy}><Text numberOfLines={1} style={styles.rowTitle}>{item.fileName || 'Shared file'}</Text><Text numberOfLines={1} style={styles.rowMeta}>{formatSize(item.mediaSize)} · {(item.fileType || 'FILE').split('/').pop()?.toUpperCase()} · {senderLabel(item, contact)}</Text></View><Text style={styles.rowTime}>{formatTime(item.createdAt)}</Text></Pressable>)}</View>)}
          {tab === 'links' && linkSections.map(section => <View key={section.title}><Text style={styles.sectionTitle}>{section.title}</Text>{section.items.map(item => <Pressable accessibilityLabel={`Open link ${item.url}`} key={item.id} onPress={() => Linking.openURL(item.url).catch(() => onNotice('Unable to open this link.'))} style={styles.linkRow}><LinkGlyph url={item.url} /><View style={styles.rowCopy}><Text numberOfLines={1} style={styles.rowTitle}>{linkTitle(item.url)}</Text><Text numberOfLines={1} style={styles.linkUrl}>{item.url}</Text></View><Text style={styles.linkSender}>{item.senderId === currentUserId ? 'You' : contact.name}<Text style={styles.rowTime}>{`\n${formatTime(item.createdAt)}`}</Text></Text></Pressable>)}</View>)}
          {tab === 'history' && historySections.map(section => <View key={section.title}><Text style={styles.sectionTitle}>{section.title}</Text>{section.items.map(item => <View accessibilityLabel={`Chat history message from ${senderLabel(item, contact)}`} key={item.id} style={styles.historyRow}><View style={[styles.historyAvatar, item.isOwn && styles.ownHistoryAvatar]}><Text style={styles.historyAvatarText}>{item.isOwn ? 'Y' : contact.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.historyCopy}><View style={styles.historyHeading}><Text style={styles.rowTitle}>{senderLabel(item, contact)}</Text><Text style={styles.rowTime}>{formatTime(item.createdAt)}</Text></View><Text numberOfLines={2} style={styles.historyMessage}>{messagePreview(item)}</Text></View></View>)}</View>)}
        </ScrollView>
      )}
    </View>
    <Modal animationType={'fade'} onRequestClose={() => setPreview(null)} transparent visible={preview !== null}>
      <View style={styles.previewBackdrop}><Pressable accessibilityLabel={'Close preview'} onPress={() => setPreview(null)} style={styles.previewClose}><CloseIcon /></Pressable>{preview?.messageType === 'video' && preview.mediaUrl ? <PreviewVideo uri={preview.mediaUrl} /> : preview?.mediaUrl ? <Image resizeMode={'contain'} source={{uri: preview.mediaUrl}} style={styles.previewMedia} /> : <Text style={styles.previewUnavailable}>Preview unavailable</Text>}</View>
    </Modal>
  </Modal>;
}

const styles = createThemedStyles({
  screen:{flex:1,backgroundColor:'#F7F7F8'},
  header:{height:56,paddingHorizontal:9,backgroundColor:'#FFF',flexDirection:'row',alignItems:'center'},
  headerButton:{width:36,height:44,alignItems:'center',justifyContent:'center'},
  headerTitle:{flex:1,color:'#172033',fontFamily:FONT,fontSize:15,fontWeight:'600'},
  tabs:{height:51,paddingHorizontal:12,backgroundColor:'#FFF',flexDirection:'row',borderBottomWidth:1,borderBottomColor:'#E9EAF0'},
  tab:{flex:1,minWidth:0,gap:4,flexDirection:'row',alignItems:'center',justifyContent:'center',borderBottomWidth:2,borderBottomColor:'transparent'},
  activeTab:{borderBottomColor:PURPLE},
  tabText:{color:'#263448',fontFamily:FONT,fontSize:10},activeTabText:{color:PURPLE,fontWeight:'600'},
  content:{paddingHorizontal:14,paddingTop:8,paddingBottom:30,backgroundColor:'#FFF'},
  center:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:30},
  emptyTitle:{color:'#263448',fontFamily:FONT,fontSize:14,fontWeight:'600'},emptyCopy:{marginTop:6,color:'#8792A4',fontFamily:FONT,fontSize:10,textAlign:'center'},
  sectionTitle:{marginTop:8,marginBottom:9,color:'#263448',fontFamily:FONT,fontSize:10,fontWeight:'600'},
  mediaGrid:{flexDirection:'row',flexWrap:'wrap',gap:5},
  mediaTile:{position:'relative',width:'32.1%',aspectRatio:.96,overflow:'hidden',borderRadius:6,backgroundColor:'#D7DCE5'},
  mediaImage:{width:'100%',height:'100%'},videoFallback:{alignItems:'center',justifyContent:'center',backgroundColor:'#30384A'},videoFallbackText:{color:'#D7DEEA',fontSize:8,fontWeight:'700'},
  playCircle:{position:'absolute',left:'50%',top:'50%',width:35,height:35,marginLeft:-17.5,marginTop:-17.5,borderRadius:18,backgroundColor:'rgba(53,42,83,.7)',alignItems:'center',justifyContent:'center'},
  ownerBadge:{position:'absolute',left:4,top:4,paddingHorizontal:4,paddingVertical:2,borderRadius:3,backgroundColor:'rgba(255,255,255,.88)'},ownerBadgeText:{color:'#263448',fontSize:6,fontWeight:'600'},duration:{position:'absolute',left:4,bottom:4,paddingHorizontal:3,paddingVertical:1,borderRadius:2,backgroundColor:'rgba(255,255,255,.85)',color:'#263448',fontSize:7},
  fileRow:{height:59,flexDirection:'row',alignItems:'center'},fileGlyph:{position:'relative',width:27,height:32,overflow:'hidden',borderRadius:3,alignItems:'center',justifyContent:'flex-end'},fileFold:{position:'absolute',right:0,top:0,width:8,height:8,backgroundColor:'rgba(255,255,255,.75)'},fileGlyphText:{marginBottom:5,color:'#FFF',fontSize:6,fontWeight:'800'},
  rowCopy:{flex:1,minWidth:0,marginLeft:11},rowTitle:{color:'#172033',fontFamily:FONT,fontSize:11,fontWeight:'600'},rowMeta:{marginTop:4,color:'#758196',fontFamily:FONT,fontSize:7.5},rowTime:{color:'#526176',fontFamily:FONT,fontSize:7.5},
  linkRow:{minHeight:61,flexDirection:'row',alignItems:'center'},linkGlyph:{width:26,height:26,borderRadius:5,alignItems:'center',justifyContent:'center'},linkGlyphText:{color:'#FFF',fontSize:10,fontWeight:'800'},darkLinkGlyphText:{color:'#1B2434'},linkUrl:{marginTop:4,color:'#758196',fontFamily:FONT,fontSize:7.5},linkSender:{width:59,color:'#526176',fontFamily:FONT,fontSize:7,textAlign:'right'},
  historyRow:{minHeight:62,paddingVertical:7,flexDirection:'row'},historyAvatar:{width:30,height:30,borderRadius:15,backgroundColor:'#DDE7F7',alignItems:'center',justifyContent:'center'},ownHistoryAvatar:{backgroundColor:'#E9DCFF'},historyAvatarText:{color:PURPLE,fontSize:10,fontWeight:'700'},historyCopy:{flex:1,minWidth:0,marginLeft:9},historyHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},historyMessage:{marginTop:5,color:'#66758A',fontFamily:FONT,fontSize:9,lineHeight:13},
  previewBackdrop:{flex:1,backgroundColor:'rgba(5,8,14,.94)',alignItems:'center',justifyContent:'center'},previewClose:{position:'absolute',right:16,top:45,width:42,height:42,zIndex:3,borderRadius:21,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},previewMedia:{width:'100%',height:'82%'},previewUnavailable:{color:'#FFF',fontSize:13},
});
