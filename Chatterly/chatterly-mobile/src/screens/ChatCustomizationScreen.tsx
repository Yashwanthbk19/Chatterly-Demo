import * as ImagePicker from 'expo-image-picker';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, Path} from 'react-native-svg';
import {Snackbar} from '../components/Snackbar';
import {normalizeChatWallpaper, type ChatWallpaperPreference} from '../services/preferencesApi';
import {createThemedStyles, themeInk} from '../theme/themedStyles';
import {useChatWallpaper} from '../wallpaper/ChatWallpaperProvider';
import {SOLID_WALLPAPER_COLORS, WALLPAPER_PRESETS, WallpaperBackground} from '../wallpaper/WallpaperBackground';

const FONT = Platform.select({android: 'sans-serif', ios: 'System'});
const MAX_WALLPAPER_BYTES = 10 * 1024 * 1024;

const BUBBLE_COLORS = [
  ['Purple (Default)', '#8B27E9'], ['Indigo', '#6864F0'], ['Ocean Blue', '#5C7BEE'],
  ['Sky Blue', '#4C8BCC'], ['Teal', '#386879'], ['Emerald', '#478571'],
  ['Rose', '#C92F82'], ['Coral', '#CB5B55'], ['Amber', '#A35A20'],
  ['Slate', '#50596D'], ['Graphite', '#383E4D'],
] as const;

function BackIcon() {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="m15 6-6 6 6 6" stroke={themeInk('#0B1220')} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function CheckIcon({color = '#FFFFFF'}: {color?: string}) {
  return <Svg width={13} height={13} viewBox="0 0 24 24" fill="none"><Path d="m5 12 4 4L19 7" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function WallpaperIcon() {
  return <Svg width={20} height={20} viewBox="0 0 32 32" fill="none"><Path d="M12 10H22C22.5304 10 23.0391 10.2107 23.4142 10.5858C23.7893 10.9609 24 11.4696 24 12V22C24 22.5304 23.7893 23.0391 23.4142 23.4142C23.0391 23.7893 22.5304 24 22 24H10M12 10V22M12 10C12 9.46957 11.7893 8.96086 11.4142 8.58579C11.0391 8.21071 10.5304 8 10 8C9.46957 8 8.96086 8.21071 8.58579 8.58579C8.21071 8.96086 8 9.46957 8 10V22M10 24C9.46957 24 8.96086 23.7893 8.58579 23.4142C8.21071 23.0391 8 22.5304 8 22M10 24C10.5304 24 11.0391 23.7893 11.4142 23.4142C11.7893 23.0391 12 22.5304 12 22M8 22C8 21.4696 8.21071 20.9609 8.58579 20.5858C8.96086 20.2107 9.46957 20 10 20C10.5304 20 11.0391 20.2107 11.4142 20.5858 11.7893 20.9609 12 21.4696 12 22" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function BubbleIcon() {
  return <Svg width={20} height={20} viewBox="0 0 32 32" fill="none"><Path d="M16 15V15.01M12 15V15.01M20 15V15.01M22 8C22.7956 8 23.5587 8.31607 24.1213 8.87868C24.6839 9.44129 25 10.2044 25 11V19C25 19.7956 24.6839 20.5587 24.1213 21.1213C23.5587 21.6839 22.7956 22 22 22H17L12 25V22H10C9.20435 22 8.44129 21.6839 7.87868 21.1213C7.31607 20.5587 7 19.7956 7 19V11C7 10.2044 7.31607 9.44129 7.87868 8.87868C8.44129 8.31607 9.20435 8 10 8H22Z" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function GalleryIcon() {
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M15 8H15.01M3 16L8 11C8.928 10.107 10.072 10.107 11 11L16 16M14 14L15 13C15.928 12.107 17.072 12.107 18 13L21 16M3 6C3 5.20435 3.31607 4.44129 3.87868 3.87868C4.44129 3.31607 5.20435 3 6 3H18C18.7956 3 19.5587 3.31607 20.1213 3.87868C20.6839 4.44129 21 5.20435 21 6V18C21 18.7956 20.6839 19.5587 20.1213 20.1213C19.5587 20.6839 18.7956 21 18 21H6C5.20435 21 4.44129 20.6839 3.87868 20.1213C3.31607 19.5587 3 18.7956 3 18V6Z" stroke="#0B1220" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function CameraIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="M4 8h3l1.4-2h7.2L17 8h3v10H4V8Z" stroke={themeInk('#172033')} strokeWidth={1.4} strokeLinejoin="round"/><Circle cx={12} cy={13} r={3} stroke={themeInk('#172033')} strokeWidth={1.4}/></Svg>;
}

function SunIcon() {
  return <Svg width={18} height={18} viewBox="0 0 32 32" fill="none"><Path d="M7 16H8M16 7V8M24 16H25M16 24V25M9.6 9.6L10.3 10.3M22.4 9.6L21.7 10.3M21.7 21.7L22.4 22.4M10.3 21.7L9.6 22.4M12 16C12 17.0609 12.4214 18.0783 13.1716 18.8284C13.9217 19.5786 14.9391 20 16 20C17.0609 20 18.0783 19.5786 18.8284 18.8284C19.5786 18.0783 20 17.0609 20 16C20 14.9391 19.5786 13.9217 18.8284 13.1716C18.0783 12.4214 17.0609 12 16 12C14.9391 12 13.9217 12.4214 13.1716 13.1716C12.4214 13.9217 12 14.9391 12 16Z" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function BrightnessSunIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={3.5} stroke="#FFFFFF" strokeWidth={1.5}/><Path d="M12 2.5v2M12 19.5v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2.5 12h2m15 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round"/></Svg>;
}

function Header({title, onBack}: {title: string; onBack: () => void}) {
  return <View style={styles.header}><Pressable accessibilityLabel="Back" hitSlop={12} onPress={onBack} style={styles.headerBack}><BackIcon/></Pressable><Text style={styles.headerTitle}>{title}</Text></View>;
}

function ChatCustomizationMenu({onBack, onOpenBubble, onOpenWallpaper}: {onBack: () => void; onOpenBubble: () => void; onOpenWallpaper: () => void}) {
  const insets = useSafeAreaInsets();
  const {wallpaper} = useChatWallpaper();
  return <View style={[styles.root, {paddingTop: insets.top}]}><Header title="Chat Customization" onBack={onBack}/><View style={styles.menuRows}>
    <Pressable accessibilityLabel="Wallpaper" onPress={onOpenWallpaper} style={({pressed}) => [styles.menuRow, pressed && styles.rowPressed]}><WallpaperIcon/><View style={styles.menuCopy}><Text style={styles.menuTitle}>Wallpaper</Text><Text style={styles.menuDescription}>Choose a background for your chats.</Text></View><View style={styles.wallpaperMini}><WallpaperBackground wallpaper={wallpaper}/></View></Pressable>
    <Pressable accessibilityLabel="Chat Bubble" onPress={onOpenBubble} style={({pressed}) => [styles.menuRow, pressed && styles.rowPressed]}><BubbleIcon/><View style={styles.menuCopy}><Text style={styles.menuTitle}>Chat Bubble</Text><Text style={styles.menuDescription}>Choose the color of your message bubbles.</Text></View><View style={[styles.colorDot, {backgroundColor: wallpaper.messageColor}]}/></Pressable>
  </View></View>;
}

function ChatBubbleSheet({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const insets = useSafeAreaInsets();
  const {wallpaper, applyWallpaper} = useChatWallpaper();
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}><View style={styles.bubbleSheetBackdrop}><Pressable accessibilityLabel="Close chat bubble colors" onPress={onClose} style={StyleSheet.absoluteFill}/><View style={[styles.bubbleSheet, {paddingBottom: Math.max(insets.bottom, 8)}]}><View style={styles.bubbleSheetHandle}/><View style={styles.bubbleSheetHeader}><Text style={styles.bubbleSheetTitle}>Chat Bubble</Text><Pressable accessibilityLabel="Close" hitSlop={12} onPress={onClose} style={styles.bubbleSheetClose}><Text style={styles.closeText}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.bubbleList}>{BUBBLE_COLORS.map(([label, color]) => {
    const selected = wallpaper.messageColor.toUpperCase() === color.toUpperCase();
    return <Pressable accessibilityLabel={label} accessibilityRole="radio" accessibilityState={{checked: selected}} key={color} onPress={() => applyWallpaper({...wallpaper, messageColor: color})} style={styles.bubbleRow}><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.bubbleSelectedCheck}><CheckIcon/></View> : null}</View><Text style={styles.bubbleLabel}>{label}</Text><View style={[styles.bubbleSwatch, {backgroundColor: color}]}/></Pressable>;
  })}</ScrollView></View></View></Modal>;
}

function BrightnessSlider({value, onChange}: {value: number; onChange: (value: number) => void}) {
  const sliderRef = useRef<View>(null);
  const heightRef = useRef(1);
  const topRef = useRef(0);
  const responder = useMemo(() => {
    const setFromPageY = (pageY: number) => onChange(Math.max(0, Math.min(80, Math.round(((pageY - topRef.current) / heightRef.current) * 80))));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: event => setFromPageY(event.nativeEvent.pageY),
      onPanResponderMove: event => setFromPageY(event.nativeEvent.pageY),
    });
  }, [onChange]);
  const brightness = 1 - value / 100;
  return <View ref={sliderRef} accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]} accessibilityLabel={`Wallpaper brightness ${Math.round(brightness * 100)}%`} accessibilityRole="adjustable" accessibilityValue={{min: 20, max: 100, now: Math.round(brightness * 100), text: `${Math.round(brightness * 100)}%`}} onAccessibilityAction={event => onChange(Math.max(0, Math.min(80, value + (event.nativeEvent.actionName === 'increment' ? -5 : 5))))} onLayout={event => {heightRef.current = event.nativeEvent.layout.height; sliderRef.current?.measureInWindow((_x, y) => {topRef.current = y;});}} style={styles.brightnessSlider} {...responder.panHandlers}><View style={styles.brightnessTrack}/><View style={[styles.brightnessFill, {height: `${brightness * 100}%`}]}><View style={styles.brightnessThumb}><BrightnessSunIcon/></View></View></View>;
}

function PreviewMessages({bubbleColor}: {bubbleColor: string}) {
  return <View accessibilityLabel="Wallpaper preview conversation" pointerEvents="none" style={styles.previewMessages}><View style={styles.todayPill}><Text style={styles.todayText}>Today</Text></View><View style={[styles.sampleBubble, styles.sampleOwn, {backgroundColor: bubbleColor}]}><Text style={styles.sampleOwnText}>Swipe left or right to explore{`\n`}different colors.</Text></View><Text style={[styles.sampleTime, styles.sampleOwnTime]}>00:55 AM  ✓✓</Text><View style={[styles.sampleBubble, styles.sampleOther]}><Text style={styles.sampleOtherText}>Add a wallpaper or switch to dark{`\n`}mode to preview your changes.{`\n`}These changes are visible only to{`\n`}you.</Text></View><Text style={[styles.sampleTime, styles.sampleOtherTime]}>00:56 AM</Text></View>;
}

type PickerMode = 'gallery' | 'colors' | null;

function WallpaperPickerSheet({draft, mode, onClose, onPickImage, onSelect}: {draft: ChatWallpaperPreference; mode: PickerMode; onClose: () => void; onPickImage: (source: 'camera' | 'gallery') => void; onSelect: (wallpaper: ChatWallpaperPreference) => void}) {
  const insets = useSafeAreaInsets();
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible={mode !== null}><View style={styles.sheetBackdrop}><Pressable accessibilityLabel="Close wallpaper picker" onPress={onClose} style={StyleSheet.absoluteFill}/><View style={[styles.sheet, {paddingBottom: Math.max(16, insets.bottom + 6)}]}><View style={styles.sheetHandle}/><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{mode === 'colors' ? 'Solid Colors' : 'Wallpaper'}</Text><Pressable accessibilityLabel="Close" hitSlop={12} onPress={onClose} style={styles.sheetClose}><Text style={styles.closeText}>×</Text></Pressable></View>
    <Pressable accessibilityLabel="Default Chat Theme" accessibilityRole="radio" accessibilityState={{checked: draft.type === 'default'}} onPress={() => onSelect(normalizeChatWallpaper({...draft, type: 'default', value: ''}))} style={styles.defaultThemeRow}><View style={[styles.radio, draft.type === 'default' && styles.radioSelected]}>{draft.type === 'default' ? <View style={styles.bubbleSelectedCheck}><CheckIcon/></View> : null}</View><View style={styles.menuCopy}><Text style={styles.menuTitle}>Default Chat Theme</Text><Text style={styles.menuDescription}>Follows your app theme, including System Default.</Text></View><View style={styles.wallpaperMini}><WallpaperBackground wallpaper={{...draft, type: 'default', value: ''}}/></View></Pressable>
    {mode === 'gallery' ? <><View style={styles.sourceRow}><Pressable accessibilityLabel="Take a wallpaper photo" onPress={() => onPickImage('camera')} style={styles.sourceButton}><CameraIcon/><Text style={styles.sourceLabel}>Camera</Text></Pressable><Pressable accessibilityLabel="Choose wallpaper from gallery" onPress={() => onPickImage('gallery')} style={styles.sourceButton}><GalleryIcon/><Text style={styles.sourceLabel}>Gallery</Text></Pressable></View><ScrollView contentContainerStyle={styles.presetGrid}>{WALLPAPER_PRESETS.map(preset => {const selected = draft.type === 'preset' && draft.value === preset.id; return <Pressable accessibilityLabel={preset.label} accessibilityState={{selected}} key={preset.id} onPress={() => onSelect(normalizeChatWallpaper({...draft, type: 'preset', value: preset.id}))} style={[styles.presetTile, selected && styles.selectedTile]}><WallpaperBackground wallpaper={{...draft, type: 'preset', value: preset.id}}/>{selected ? <View style={styles.tileCheck}><CheckIcon/></View> : null}</Pressable>;})}</ScrollView></> : <ScrollView contentContainerStyle={styles.colorGrid}>{SOLID_WALLPAPER_COLORS.map(color => {const selected = draft.type === 'color' && draft.value === color; return <Pressable accessibilityLabel={`Solid color ${color}`} accessibilityState={{selected}} key={color} onPress={() => onSelect(normalizeChatWallpaper({...draft, type: 'color', value: color}))} style={[styles.colorTile, {backgroundColor: color}, selected && styles.selectedTile]}>{selected ? <View style={styles.tileCheck}><CheckIcon/></View> : null}</Pressable>;})}</ScrollView>}
  </View></View></Modal>;
}

function WallpaperPreviewScreen({onBack}: {onBack: () => void}) {
  const insets = useSafeAreaInsets();
  const {wallpaper, saving, applyWallpaper} = useChatWallpaper();
  const [draft, setDraft] = useState(wallpaper);
  const [picker, setPicker] = useState<PickerMode>(null);
  const [showBubbleSheet, setShowBubbleSheet] = useState(false);
  const [showTransparency, setShowTransparency] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => setDraft(wallpaper), [wallpaper]);

  const pickImage = async (source: 'camera' | 'gallery') => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice(source === 'camera' ? 'Allow camera access to take a wallpaper photo.' : 'Allow photo library access to choose a wallpaper.');
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({mediaTypes: ['images'], quality: 0.9})
      : await ImagePicker.launchImageLibraryAsync({mediaTypes: ['images'], quality: 0.9, selectionLimit: 1});
    if (result.canceled || !result.assets[0]) { return; }
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_WALLPAPER_BYTES) { setNotice('Wallpaper images must be 10 MB or smaller.'); return; }
    if (asset.mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType)) { setNotice('Choose a JPG, PNG, or WEBP image.'); return; }
    setDraft(normalizeChatWallpaper({...draft, type: 'image', value: asset.uri}));
    setPicker(null);
  };

  const apply = async () => {
    await applyWallpaper(draft);
    setNotice('Wallpaper applied.');
  };

  return <View style={[styles.previewRoot, {paddingTop: insets.top}]}><View style={styles.previewHeader}><Pressable accessibilityLabel="Back" hitSlop={12} onPress={onBack} style={styles.headerBack}><BackIcon/></Pressable><Text style={styles.headerTitle}>Preview</Text></View><View style={styles.previewCanvas}><WallpaperBackground wallpaper={draft}/><PreviewMessages bubbleColor={draft.messageColor}/><View style={styles.wallpaperPageDots} pointerEvents="none"><View style={styles.pageDotsTrack}><View style={styles.pageDot}/><View style={styles.pageDot}/><View style={[styles.pageDot, styles.pageDotActive]}/><View style={styles.pageDot}/><View style={styles.pageDot}/></View></View>
    {showTransparency ? <View style={styles.brightnessPanel}><BrightnessSlider value={draft.transparency} onChange={value => setDraft(current => ({...current, transparency: value}))}/></View> : null}
    <View style={[styles.toolbar, {paddingBottom: Math.max(12, insets.bottom)}]}><Pressable accessibilityLabel="Adjust brightness" accessibilityState={{expanded: showTransparency}} onPress={() => setShowTransparency(open => !open)} style={[styles.toolButton, showTransparency && styles.toolButtonActive]}><SunIcon/></Pressable><Pressable accessibilityLabel="Open wallpaper gallery" onPress={() => setPicker('gallery')} style={styles.toolButton}><GalleryIcon/></Pressable><Pressable accessibilityLabel="Choose chat bubble color" accessibilityHint="Long press to choose a solid wallpaper color" onPress={() => setShowBubbleSheet(true)} onLongPress={() => setPicker('colors')} style={[styles.colorTool, {backgroundColor: draft.type === 'color' ? draft.value : draft.messageColor}]}/><Pressable accessibilityLabel="Apply wallpaper" accessibilityState={{busy: saving, disabled: saving}} disabled={saving} onPress={apply} style={[styles.applyButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#FFF" size="small"/> : <><CheckIcon/><Text style={styles.applyText}>Apply</Text></>}</Pressable></View>
  </View><WallpaperPickerSheet draft={draft} mode={picker} onClose={() => setPicker(null)} onPickImage={pickImage} onSelect={setDraft}/><ChatBubbleSheet visible={showBubbleSheet} onClose={() => setShowBubbleSheet(false)}/><Snackbar message={notice} onHide={() => setNotice('')}/></View>;
}

export function ChatCustomizationScreen({onBack}: {onBack: () => void}): React.JSX.Element {
  const [screen, setScreen] = useState<'menu' | 'wallpaper'>('menu');
  const [bubbleSheetVisible, setBubbleSheetVisible] = useState(false);
  if (screen === 'wallpaper') { return <WallpaperPreviewScreen onBack={() => setScreen('menu')}/>; }
  return <><ChatCustomizationMenu onBack={onBack} onOpenBubble={() => setBubbleSheetVisible(true)} onOpenWallpaper={() => setScreen('wallpaper')}/><ChatBubbleSheet visible={bubbleSheetVisible} onClose={() => setBubbleSheetVisible(false)}/></>;
}

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#FFFFFF'},
  header: {height: 50, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEF0F4'},
  headerBack: {width: 34, height: 44, alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: FONT, color: '#101828', fontSize: 14, fontWeight: '700'},
  menuRows: {paddingHorizontal: 16, paddingTop: 9},
  menuRow: {minHeight: 63, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 7},
  rowPressed: {backgroundColor: '#F7F8FA'},
  menuCopy: {flex: 1},
  menuTitle: {fontFamily: FONT, color: '#172033', fontSize: 12, fontWeight: '600'},
  menuDescription: {fontFamily: FONT, color: '#758196', fontSize: 9, marginTop: 3},
  wallpaperMini: {width: 24, height: 24, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#EEF0F4'},
  colorDot: {width: 17, height: 17, borderRadius: 9},
  bubbleList: {paddingHorizontal: 0, paddingTop: 2},
  bubbleSheetBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,.38)', justifyContent: 'flex-end'},
  bubbleSheet: {height: '94%', minHeight: 560, paddingHorizontal: 0, borderTopLeftRadius: 13, borderTopRightRadius: 13, backgroundColor: '#FFFFFF', overflow: 'hidden'},
  bubbleSheetHandle: {width: 36, height: 3, marginTop: 7, borderRadius: 2, backgroundColor: '#DDE2EA', alignSelf: 'center'},
  bubbleSheetHeader: {height: 33, flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  bubbleSheetTitle: {fontFamily: FONT, color: '#101828', fontSize: 12, fontWeight: '500'},
  bubbleSheetClose: {position: 'absolute', right: 13, width: 34, height: 38, alignItems: 'center', justifyContent: 'center'},
  bubbleSelectedCheck: {width: 18, height: 18, borderRadius: 9, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center'},
  radioSelected: {borderColor: '#8B5CF6', backgroundColor: '#8B5CF6'},
  bubbleRow: {height: 49, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center'},
  radio: {width: 18, height: 18, borderRadius: 9, borderWidth: 1.2, borderColor: '#9DABC0', alignItems: 'center', justifyContent: 'center'},
  radioInner: {width: 9, height: 9, borderRadius: 5},
  bubbleLabel: {flex: 1, marginLeft: 13, color: '#172033', fontFamily: FONT, fontSize: 12},
  bubbleSwatch: {width: 19, height: 19, borderRadius: 10},
  previewRoot: {flex: 1, backgroundColor: '#FFFFFF'},
  previewHeader: {height: 49, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', zIndex: 3},
  previewCanvas: {flex: 1, overflow: 'hidden', backgroundColor: '#FBFAFE'},
  previewMessages: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 90, paddingHorizontal: 17},
  todayPill: {alignSelf: 'center', marginTop: 15, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.94)'},
  todayText: {fontFamily: FONT, color: '#526176', fontSize: 8},
  sampleBubble: {maxWidth: '82%', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, borderRadius: 10, shadowColor: '#182030', shadowOpacity: .09, shadowRadius: 5, elevation: 2},
  sampleOwn: {alignSelf: 'flex-end', marginTop: 43, borderBottomRightRadius: 3},
  sampleOther: {alignSelf: 'flex-start', marginTop: 20, backgroundColor: '#FFFFFF', borderBottomLeftRadius: 3},
  sampleOwnText: {fontFamily: FONT, color: '#FFFFFF', fontSize: 11, lineHeight: 16},
  sampleOtherText: {fontFamily: FONT, color: '#344256', fontSize: 10, lineHeight: 15},
  sampleTime: {fontFamily: FONT, fontSize: 7},
  sampleOwnTime: {alignSelf: 'flex-end', color: '#526176', marginTop: 4},
  sampleOtherTime: {alignSelf: 'flex-start', color: '#526176', marginTop: 5},
  wallpaperPageDots: {position: 'absolute', left: 0, right: 0, bottom: 101, alignItems: 'center'},
  pageDotsTrack: {height: 13, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.92)'},
  pageDot: {width: 5, height: 5, borderRadius: 3, backgroundColor: '#D3D7DE'},
  pageDotActive: {width: 6, height: 6, backgroundColor: '#263448'},
  brightnessPanel: {position: 'absolute', left: 15, bottom: 88, width: 50, height: 212, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#FFFFFF', shadowColor: '#172033', shadowOpacity: .15, shadowRadius: 8, elevation: 5},
  brightnessSlider: {width: 28, height: '100%', overflow: 'visible'},
  brightnessTrack: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 5, backgroundColor: '#E4E8EF'},
  brightnessFill: {position: 'absolute', right: 0, bottom: 0, left: 0, borderRadius: 5, backgroundColor: '#8B5CF6'},
  brightnessThumb: {position: 'absolute', top: 0, left: -4, width: 36, height: 44, borderRadius: 8, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center'},
  toolbar: {position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 73, paddingHorizontal: 17, paddingTop: 11, backgroundColor: 'rgba(255,255,255,.96)', flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  toolButton: {width: 42, height: 42, borderRadius: 7, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E7EE', color: '#526176', alignItems: 'center', justifyContent: 'center'},
  toolButtonActive: {borderColor: '#A980F0', backgroundColor: '#F6F0FF'},
  colorTool: {width: 42, height: 42, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF', outlineColor: '#8B27E9', outlineWidth: 1},
  applyButton: {height: 42, minWidth: 91, marginLeft: 'auto', paddingHorizontal: 18, borderRadius: 7, backgroundColor: '#8B27E9', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center'},
  applyText: {fontFamily: FONT, color: '#FFFFFF', fontSize: 11, fontWeight: '700'},
  disabled: {opacity: .55},
  sheetBackdrop: {flex: 1, backgroundColor: 'rgba(15,23,42,.32)', justifyContent: 'flex-end'},
  sheet: {maxHeight: '70%', minHeight: 330, paddingHorizontal: 15, borderTopLeftRadius: 15, borderTopRightRadius: 15, backgroundColor: '#FFFFFF'},
  sheetHandle: {width: 39, height: 3, marginTop: 9, borderRadius: 2, backgroundColor: '#DDE2EA', alignSelf: 'center'},
  sheetHeader: {height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  sheetTitle: {fontFamily: FONT, color: '#101828', fontSize: 13, fontWeight: '700'},
  sheetClose: {position: 'absolute', right: 0, width: 38, height: 38, alignItems: 'center', justifyContent: 'center'},
  closeText: {color: '#526176', fontSize: 22},
  sourceRow: {flexDirection: 'row', gap: 10},
  sourceButton: {height: 72, flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#EDF0F4', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#FFFFFF'},
  sourceLabel: {fontFamily: FONT, color: '#172033', fontSize: 9, fontWeight: '600'},
  presetGrid: {paddingTop: 10, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  presetTile: {width: '23.5%', aspectRatio: .72, overflow: 'hidden', borderRadius: 6, borderWidth: 1, borderColor: 'transparent'},
  selectedTile: {borderColor: '#8B27E9', borderWidth: 2},
  tileCheck: {position: 'absolute', left: '50%', top: '50%', width: 24, height: 24, marginLeft: -12, marginTop: -12, borderRadius: 12, backgroundColor: '#9A4BED', alignItems: 'center', justifyContent: 'center'},
  colorGrid: {paddingTop: 10, paddingBottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  colorTile: {width: '21.8%', aspectRatio: 1, borderRadius: 8, borderWidth: 1, borderColor: '#E2E7EE', alignItems: 'center', justifyContent: 'center'},
  defaultThemeRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EDF0F4', marginBottom: 10},
}, {keep: ['sampleOwn', 'sampleOwnText', 'sampleOwnTime', 'tileCheck', 'applyButton', 'applyText']});

