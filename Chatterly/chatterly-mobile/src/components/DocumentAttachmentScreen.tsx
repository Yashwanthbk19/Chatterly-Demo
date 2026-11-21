import {createThemedStyles} from '../theme/themedStyles';
import * as DocumentPicker from 'expo-document-picker';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {getChatFiles, type MediaUpload} from '../services/chatApi';
import type {ChatMessage} from '../types/chat';

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});
const PURPLE = '#8B27E9';

export const SUPPORTED_DOCUMENT_FORMATS = ['PDF', 'DOCX', 'XLSX', 'PPTX', 'ZIP', 'TXT'] as const;
export const SUPPORTED_AUDIO_FORMATS = ['MP3', 'M4A', 'WAV'] as const;

const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  txt: 'text/plain',
};

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
};

const MIME_BY_EXTENSION = {...DOCUMENT_MIME_BY_EXTENSION, ...AUDIO_MIME_BY_EXTENSION};
const SUPPORTED_FILE_FORMATS = [...SUPPORTED_DOCUMENT_FORMATS, ...SUPPORTED_AUDIO_FORMATS];

export const SUPPORTED_DOCUMENT_MIME_TYPES = [
  ...Object.values(DOCUMENT_MIME_BY_EXTENSION),
  'application/x-zip-compressed',
];

export const SUPPORTED_AUDIO_MIME_TYPES = [
  ...Object.values(AUDIO_MIME_BY_EXTENSION),
  'audio/mp3', 'audio/wave', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a',
];

export const SUPPORTED_PICKER_MIME_TYPES = [
  ...SUPPORTED_DOCUMENT_MIME_TYPES,
  ...SUPPORTED_AUDIO_MIME_TYPES,
];

type PickedDocument = MediaUpload & {size?: number};
type UploadState = {file: PickedDocument; phase: 'uploading' | 'sent' | 'error'; progress: number};

type Props = {
  visible: boolean;
  chatId: string;
  onBack: () => void;
  onChooseGallery: () => void;
  onScanDocument: () => void;
  onOpenRecent: (message: ChatMessage) => void;
  onSend: (file: MediaUpload, onProgress: (progress: number) => void) => Promise<ChatMessage>;
  onNotice: (message: string) => void;
};

export function normalizePickedDocument(asset: DocumentPicker.DocumentPickerAsset): PickedDocument | null {
  const name = asset.name || '';
  const extension = name.split('.').pop()?.toLowerCase() || '';
  const type = MIME_BY_EXTENSION[extension];
  if (!type) return null;
  return {uri: asset.uri, name, type, size: asset.size};
}

export function isAudioUpload(file: MediaUpload): boolean {
  return file.type.startsWith('audio/');
}

function BackArrow() {
  return <Svg width={20} height={20} viewBox={'0 0 24 24'} fill={'none'}><Path d={'m15 18-6-6 6-6'} stroke={'#172033'} strokeWidth={1.65} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg>;
}

function SearchIcon() {
  return <Svg width={18} height={18} viewBox={'0 0 24 24'} fill={'none'}><Circle cx={10.8} cy={10.8} r={6.4} stroke={'#526176'} strokeWidth={1.45} /><Path d={'m15.5 15.5 4.2 4.2'} stroke={'#526176'} strokeWidth={1.45} strokeLinecap={'round'} /></Svg>;
}

function BrowseIcon() {
  return <Svg width={23} height={23} viewBox={'0 0 24 24'} fill={'none'}><Path d={'M6 3h8l4 4v14H6V3Zm8 0v5h4'} stroke={'#172033'} strokeWidth={1.4} strokeLinejoin={'round'} /></Svg>;
}

function GalleryIcon() {
  return <Svg width={23} height={23} viewBox={'0 0 24 24'} fill={'none'}><Rect x={3.5} y={4} width={17} height={16} rx={1.8} stroke={'#172033'} strokeWidth={1.35} /><Circle cx={9} cy={9} r={1.45} stroke={'#172033'} strokeWidth={1.2} /><Path d={'m5.5 17 4.3-4 2.8 2.4 2.3-2 3.6 3.6'} stroke={'#172033'} strokeWidth={1.35} strokeLinejoin={'round'} /></Svg>;
}

function ScanIcon() {
  return <Svg width={23} height={23} viewBox={'0 0 24 24'} fill={'none'}><Path d={'M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3M8 9h8M8 12h8M8 15h5'} stroke={'#172033'} strokeWidth={1.35} strokeLinecap={'round'} /></Svg>;
}

function FileGlyph({name}: {name: string}) {
  const extension = name.split('.').pop()?.toUpperCase() || 'FILE';
  const color = extension === 'PDF' ? '#E85252' : extension === 'XLSX' ? '#2A9C68' : extension === 'PPTX' ? '#E8783D' : extension === 'ZIP' ? '#D29A22' : extension === 'TXT' ? '#68758A' : '#477CF1';
  return <View style={[styles.fileGlyph, {backgroundColor: color}]}><View style={styles.fileFold} /><Text numberOfLines={1} style={styles.fileGlyphText}>{extension.slice(0, 4)}</Text></View>;
}

function formatBytes(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatRecentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: true});
}

function ActionRow({icon, title, subtitle, onPress}: {icon: React.ReactNode; title: string; subtitle: string; onPress: () => void}) {
  return <Pressable accessibilityLabel={title} onPress={onPress} style={styles.actionRow}>
    <View style={styles.actionIcon}>{icon}</View>
    <View style={styles.actionCopy}><Text style={styles.actionTitle}>{title}</Text><Text numberOfLines={1} style={styles.actionSubtitle}>{subtitle}</Text></View>
  </Pressable>;
}

function UploadCard({state}: {state: UploadState}) {
  const percent = Math.round(state.progress * 100);
  return <View accessibilityLabel={`${state.file.name} ${state.phase}`} accessibilityLiveRegion={'polite'} style={styles.uploadCard}>
    <FileGlyph name={state.file.name} />
    <View style={styles.uploadCopy}>
      <View style={styles.uploadHeading}><Text numberOfLines={1} style={styles.uploadName}>{state.file.name}</Text><Text style={[styles.uploadState, state.phase === 'error' && styles.uploadError]}>{state.phase === 'sent' ? 'Sent ✓' : state.phase === 'error' ? 'Try again' : `${percent}%`}</Text></View>
      <Text style={styles.uploadMeta}>{formatBytes(state.file.size) || SUPPORTED_FILE_FORMATS.join(', ')}</Text>
      <View style={styles.progressTrack}><View style={[styles.progressFill, state.phase === 'error' && styles.progressError, {width: `${state.phase === 'sent' ? 100 : percent}%`}]} /></View>
    </View>
  </View>;
}

export function DocumentAttachmentScreen({visible, chatId, onBack, onChooseGallery, onScanDocument, onOpenRecent, onSend, onNotice}: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<ChatMessage[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [upload, setUpload] = useState<UploadState | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setQuery(''); setUpload(null); setLoadingRecent(true);
    getChatFiles(chatId)
      .then(files => { if (active) setRecent(files); })
      .catch(() => { if (active) setRecent([]); })
      .finally(() => { if (active) setLoadingRecent(false); });
    return () => { active = false; };
  }, [chatId, visible]);

  const browse = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_PICKER_MIME_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const file = normalizePickedDocument(result.assets[0]);
      if (!file) {
        onNotice(`Unsupported file. Choose ${SUPPORTED_FILE_FORMATS.join(', ')}.`);
        return;
      }
      setUpload({file, phase: 'uploading', progress: 0});
      try {
        const sent = await onSend(file, progress => setUpload(current => current?.file.uri === file.uri ? {...current, progress} : current));
        setUpload({file, phase: 'sent', progress: 1});
        setRecent(current => [sent, ...current.filter(item => item.id !== sent.id)]);
      } catch (error) {
        setUpload({file, phase: 'error', progress: 0});
        onNotice(error instanceof Error ? error.message : 'Unable to send file.');
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Unable to open device files.');
    }
  }, [onNotice, onSend]);

  const filteredRecent = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return recent;
    return recent.filter(item => (item.fileName || '').toLowerCase().includes(needle));
  }, [query, recent]);

  return <Modal animationType={'slide'} onRequestClose={onBack} statusBarTranslucent visible={visible}>
    <View accessibilityLabel={'Files screen'} style={[styles.screen, {paddingTop: insets.top, paddingBottom: insets.bottom}]}>
      <View style={styles.header}><Pressable accessibilityLabel={'Back to conversation'} hitSlop={10} onPress={onBack} style={styles.backButton}><BackArrow /></Pressable><Text accessibilityRole={'header'} style={styles.headerTitle}>Files</Text></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={'handled'} showsVerticalScrollIndicator={false}>
        <View style={styles.searchBox}><SearchIcon /><TextInput accessibilityLabel={'Search Files'} autoCapitalize={'none'} onChangeText={setQuery} placeholder={'Search Files'} placeholderTextColor={'#526176'} style={styles.searchInput} value={query} /></View>

        <View style={styles.actions}>
          <ActionRow icon={<BrowseIcon />} onPress={browse} subtitle={'Share files up to 1 GB in size'} title={'Browse Documents'} />
          <ActionRow icon={<GalleryIcon />} onPress={onChooseGallery} subtitle={'Share original quality photo or video'} title={'Choose from Gallery'} />
          <ActionRow icon={<ScanIcon />} onPress={onScanDocument} subtitle={'Take photos of a document'} title={'Scan Documents'} />
        </View>

        {upload ? <UploadCard state={upload} /> : null}

        <Text style={styles.recentTitle}>Recent</Text>
        {loadingRecent ? <ActivityIndicator color={PURPLE} style={styles.recentLoading} /> : null}
        {!loadingRecent && filteredRecent.map(item => <Pressable accessibilityLabel={`Open recent file ${item.fileName || 'Document'}`} key={item.id} onPress={() => onOpenRecent(item)} style={styles.recentRow}>
          <FileGlyph name={item.fileName || 'Document'} />
          <View style={styles.recentCopy}><Text numberOfLines={1} style={styles.recentName}>{item.fileName || 'Document'}</Text><Text numberOfLines={1} style={styles.recentMeta}>{[formatBytes(item.mediaSize), item.fileType].filter(Boolean).join(' · ') || 'Shared document'}</Text></View>
          <Text style={styles.recentTime}>{formatRecentTime(item.createdAt)}</Text>
        </Pressable>)}
        {!loadingRecent && !filteredRecent.length ? <Text style={styles.emptyText}>{query.trim() ? 'No matching files.' : 'No shared files yet.'}</Text> : null}
      </ScrollView>
    </View>
  </Modal>;
}

const styles = createThemedStyles({
  screen:{flex:1,backgroundColor:'#FFF'},
  header:{height:54,paddingHorizontal:8,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#F3F4F7'},
  backButton:{width:40,height:44,alignItems:'center',justifyContent:'center'},
  headerTitle:{marginLeft:1,color:'#111827',fontFamily:FONT_FAMILY,fontSize:16,fontWeight:'600'},
  content:{paddingHorizontal:16,paddingBottom:28},
  searchBox:{height:43,marginTop:15,paddingHorizontal:12,borderWidth:1,borderColor:'#E6E9EF',borderRadius:9,backgroundColor:'#FAFAFB',flexDirection:'row',alignItems:'center'},
  searchInput:{flex:1,height:43,marginLeft:9,paddingVertical:0,color:'#172033',fontFamily:FONT_FAMILY,fontSize:11},
  actions:{marginTop:6},
  actionRow:{height:70,flexDirection:'row',alignItems:'center'},
  actionIcon:{width:32,alignItems:'flex-start',justifyContent:'center'},
  actionCopy:{flex:1},
  actionTitle:{color:'#111827',fontFamily:FONT_FAMILY,fontSize:13,fontWeight:'500'},
  actionSubtitle:{marginTop:4,color:'#758196',fontFamily:FONT_FAMILY,fontSize:10},
  uploadCard:{minHeight:67,marginTop:4,padding:10,borderWidth:1,borderColor:'#E7EAF0',borderRadius:9,backgroundColor:'#FCFCFD',flexDirection:'row',alignItems:'center'},
  uploadCopy:{flex:1,marginLeft:10},
  uploadHeading:{flexDirection:'row',alignItems:'center'},
  uploadName:{flex:1,color:'#172033',fontFamily:FONT_FAMILY,fontSize:11,fontWeight:'600'},
  uploadState:{marginLeft:8,color:'#2C8B64',fontFamily:FONT_FAMILY,fontSize:9,fontWeight:'700'},
  uploadError:{color:'#C74A4A'},
  uploadMeta:{marginTop:3,color:'#758196',fontFamily:FONT_FAMILY,fontSize:8},
  progressTrack:{height:4,marginTop:7,overflow:'hidden',borderRadius:3,backgroundColor:'#E8EAF0'},
  progressFill:{height:'100%',borderRadius:3,backgroundColor:PURPLE},
  progressError:{backgroundColor:'#D85A5A'},
  recentTitle:{marginTop:18,marginBottom:5,color:'#111827',fontFamily:FONT_FAMILY,fontSize:11,fontWeight:'600'},
  recentLoading:{marginTop:22},
  recentRow:{height:58,flexDirection:'row',alignItems:'center'},
  recentCopy:{flex:1,minWidth:0,marginLeft:10},
  recentName:{color:'#172033',fontFamily:FONT_FAMILY,fontSize:12,fontWeight:'600'},
  recentMeta:{marginTop:4,color:'#758196',fontFamily:FONT_FAMILY,fontSize:8},
  recentTime:{alignSelf:'flex-start',marginTop:13,marginLeft:8,color:'#526176',fontFamily:FONT_FAMILY,fontSize:8},
  emptyText:{marginTop:20,color:'#8792A4',fontFamily:FONT_FAMILY,fontSize:11,textAlign:'center'},
  fileGlyph:{position:'relative',width:24,height:30,overflow:'hidden',borderRadius:3,alignItems:'center',justifyContent:'flex-end'},
  fileFold:{position:'absolute',right:0,top:0,width:7,height:7,backgroundColor:'rgba(255,255,255,.72)'},
  fileGlyphText:{width:'100%',marginBottom:4,color:'#FFF',fontFamily:FONT_FAMILY,fontSize:6,fontWeight:'800',textAlign:'center'},
});
