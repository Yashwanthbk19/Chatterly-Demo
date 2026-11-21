import {createThemedStyles} from '../theme/themedStyles';
import {CameraView, useCameraPermissions, type CameraType, type FlashMode} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as DeviceMediaLibrary from 'expo-media-library';
import * as LegacyMediaLibrary from 'expo-media-library/legacy';
import {useVideoPlayer, VideoView} from 'expo-video';
import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Animated, Dimensions, Image, KeyboardAvoidingView, Modal, PanResponder, PermissionsAndroid, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {AttachmentMedia, MediaTransferState} from '../types/media';
import {isGifMedia} from '../utils/gifMedia';
import {AddGalleryMediaIcon, AddTextMediaIcon, CameraAttachmentIcon, CloseCameraIcon, ContactAttachmentIcon, CropMediaIcon, DeleteGalleryMediaIcon, DocumentAttachmentIcon, EditSelectedMediaIcon, EffectsMediaIcon, FlashCameraIcon, GalleryAttachmentIcon, HdMediaIcon, LocationAttachmentIcon, MediaPreviewBackIcon, RotateMediaIcon, SaveMediaIcon, SwitchCameraIcon} from './AttachmentIcons';
import {EmojiIcon, SendIcon} from './ChatIcons';
import {ImageCropEditor, ImageEffectsEditor, ImageTextEditor, ZoomableImage, cropImage, loadEditableImage, rotateImage, type EditableImage} from './MediaImageEditor';
import {Snackbar} from './Snackbar';

type Props = {
  visible: boolean; transfer: MediaTransferState;
  recipientName: string;
  initialScreen?: 'tray' | 'camera' | 'gallery';
  initialMedia?: AttachmentMedia[];
  requestRecentsPermissionOnOpen?: boolean;
  onClose: () => void; onDocument: () => void; onLocation: () => void; onContact: () => void;
  onSend: (media: AttachmentMedia[], caption: string, hdEnabled: boolean) => Promise<boolean>;
  onNotice: (message: string) => void;
};
type FlowScreen = 'tray' | 'camera' | 'gallery' | 'preview';
type RecentsAccess = 'loading' | 'ready' | 'denied' | 'unavailable';
type GalleryAsset = LegacyMediaLibrary.Asset & {
  fromSystemPicker?: boolean;
  pickerMimeType?: string;
  resolvedUri?: boolean;
};
const PURPLE = '#8B27E9';
const GALLERY_PAGE_SIZE = 60;

type GalleryAssetPage = {assets: GalleryAsset[]; nextCursor?: string; nextOffset: number; hasMore: boolean};

async function requestRecentMediaAccess(requestIfNeeded = true): Promise<boolean> {
  // Use the SDK's permission API first. It understands Android 14's selected
  // photos access and iOS limited-library access, which the raw Android
  // permission result cannot represent reliably.
  try {
    const permission = requestIfNeeded
      ? await DeviceMediaLibrary.requestPermissionsAsync(false, ['photo', 'video'])
      : await DeviceMediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
    return permission.granted || permission.accessPrivileges === 'limited';
  } catch {
    if (Platform.OS !== 'android') return false;
  }

  // Expo Go and some older Android development runtimes reject the SDK call
  // before checking permissions. The native fallback keeps Recents available
  // there without weakening the production permission flow above.
  const androidVersion = Number(Platform.Version);
  const permissions = androidVersion >= 33
    ? [
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
      ]
    : [
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      ];
  const alreadyGranted = await Promise.all(permissions.map(permission =>
    PermissionsAndroid.check(permission),
  ));
  if (alreadyGranted.some(Boolean)) return true;
  if (androidVersion >= 34 && await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.READ_MEDIA_VISUAL_USER_SELECTED,
  )) return true;
  if (!requestIfNeeded) return false;
  const result = await PermissionsAndroid.requestMultiple(permissions);
  if (permissions.some(permission => result[permission] === PermissionsAndroid.RESULTS.GRANTED)) {
    return true;
  }
  return androidVersion >= 34 && PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.READ_MEDIA_VISUAL_USER_SELECTED,
  );
}

async function loadRecentDeviceAssets(cursor?: string, offset = 0): Promise<GalleryAssetPage> {
  let nextPage: GalleryAssetPage | undefined;
  try {
    // Prefer the current SDK media library API. Some SDK 57 native builds no
    // longer expose the legacy asset query, even though the compatibility
    // package remains importable.
    let query = new DeviceMediaLibrary.Query()
      .within(DeviceMediaLibrary.AssetField.MEDIA_TYPE, [
        DeviceMediaLibrary.MediaType.IMAGE,
        DeviceMediaLibrary.MediaType.VIDEO,
      ])
      .orderBy({key: DeviceMediaLibrary.AssetField.CREATION_TIME, ascending: false})
      .limit(GALLERY_PAGE_SIZE);
    const supportsOffset = typeof query.offset === 'function';
    if (offset > 0 && supportsOffset) query = query.offset(offset);
    const records = await query.exe();
    const resolved = await Promise.allSettled(records.map(asset => asset.getInfo()));
    const assets = resolved.flatMap(result => {
      if (result.status !== 'fulfilled') return [];
      const info = result.value;
      if (info.mediaType !== DeviceMediaLibrary.MediaType.IMAGE &&
          info.mediaType !== DeviceMediaLibrary.MediaType.VIDEO) return [];
      return [{
        id: info.id,
        filename: info.filename || `${info.mediaType}-${info.creationTime || Date.now()}`,
        uri: info.uri,
        mediaType: info.mediaType === DeviceMediaLibrary.MediaType.VIDEO ? 'video' as const : 'photo' as const,
        width: info.width || 0,
        height: info.height || 0,
        creationTime: info.creationTime || 0,
        modificationTime: info.modificationTime || info.creationTime || 0,
        duration: info.mediaType === DeviceMediaLibrary.MediaType.VIDEO ? Number(info.duration || 0) / 1000 : 0,
        fromSystemPicker: false,
        resolvedUri: true,
      }];
    });
    nextPage = {assets, nextOffset: offset + records.length, hasMore: supportsOffset && records.length === GALLERY_PAGE_SIZE};
    if (assets.length) return nextPage;
  } catch { /* Try the compatibility API below. */ }

  // The compatibility query is still useful on older native builds. Full
  // metadata resolution is unnecessary for thumbnail URIs and can fail for
  // assets with restricted metadata, so use the lightweight query result.
  try {
    const result = await LegacyMediaLibrary.getAssetsAsync({
      first: GALLERY_PAGE_SIZE,
      after: cursor,
      mediaType: ['photo', 'video'],
      sortBy: [['creationTime', false]],
    });
    if (result.assets.length || !nextPage) {
      return {
        assets: result.assets.map(asset => ({...asset, fromSystemPicker: false})),
        nextCursor: result.endCursor,
        nextOffset: offset + result.assets.length,
        hasMore: result.hasNextPage && Boolean(result.endCursor),
      };
    }
  } catch (error) {
    if (!nextPage) throw error;
  }
  return nextPage!;
}

function PreviewVideo({uri}: {uri: string}) {
  const player = useVideoPlayer(uri);
  return <VideoView contentFit={'contain'} nativeControls player={player} style={styles.previewMedia} />;
}

type GallerySheetProps = {
  assets: GalleryAsset[]; loading: boolean; selectedIds: string[];
  hasMore: boolean; loadingMore: boolean; onLoadMore: () => void;
  caption: string; onCaptionChange: (value: string) => void;
  onClose: () => void; onNext: () => void; onToggle: (id: string) => void;
};

function GallerySheet(props: GallerySheetProps) {
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;
  const collapsedHeight = Math.max(235, windowHeight * 0.39);
  const expandedHeight = windowHeight - Math.max(insets.top + 54, 70);
  const sheetHeight = useRef(new Animated.Value(collapsedHeight)).current;
  const dragStartHeight = useRef(collapsedHeight);
  const hasSelection = props.selectedIds.length > 0;
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (hasSelection) setExpanded(true);
  }, [hasSelection]);

  useEffect(() => {
    const animation = Animated.spring(sheetHeight, {
      toValue: expanded ? expandedHeight : collapsedHeight,
      damping: 24,
      stiffness: 230,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [collapsedHeight, expanded, expandedHeight, sheetHeight]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => sheetHeight.stopAnimation(value => { dragStartHeight.current = value; }),
    onPanResponderMove: (_event, gesture) => sheetHeight.setValue(Math.max(collapsedHeight, Math.min(expandedHeight, dragStartHeight.current - gesture.dy))),
    onPanResponderRelease: (_event, gesture) => {
      const projectedHeight = dragStartHeight.current - gesture.dy;
      setExpanded(gesture.vy < -0.35 || projectedHeight > (collapsedHeight + expandedHeight) / 2);
    },
    onPanResponderTerminate: () => setExpanded(false),
  })).current;
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.dimBackdrop}>
    <Pressable onPress={props.onClose} style={styles.dimDismiss} />
    <Animated.View accessibilityLabel={expanded ? 'Expanded Recent Images gallery' : 'Collapsed Recent Images gallery'} style={[styles.gallerySheet, {height: sheetHeight, paddingBottom: Math.max(insets.bottom, 8)}]}>
      <View accessibilityLabel={'Drag gallery sheet'} style={styles.dragHandleArea} {...panResponder.panHandlers}><View style={styles.sheetHandle} /></View>
      <View style={styles.galleryHeader}><Pressable accessibilityLabel={expanded ? 'Collapse Recent Images gallery' : 'Expand Recent Images gallery'} accessibilityRole={'button'} accessibilityState={{expanded}} hitSlop={8} onPress={() => setExpanded(value => !value)} style={styles.recentsButton}><Text style={styles.recentsText}>Recent Images</Text><Svg width={12} height={12} viewBox={'0 0 12 12'} fill={'none'} style={expanded ? styles.recentsChevronExpanded : undefined}><Path d={'M3 4.5 6 7.5l3-3'} stroke={'#101827'} strokeWidth={1.25} strokeLinecap={'round'} strokeLinejoin={'round'} /></Svg></Pressable><View style={styles.galleryHeaderRight}>
        <Pressable accessibilityLabel={'Close gallery'} onPress={props.onClose} style={styles.closeButton}><Text style={styles.closeText}>x</Text></Pressable>
      </View></View>
      <GalleryGrid assets={props.assets} loading={props.loading} loadingMore={props.loadingMore} hasMore={props.hasMore} onLoadMore={props.onLoadMore} onToggle={props.onToggle} selectedIds={props.selectedIds} />
      {hasSelection ? <View accessibilityLabel={`${props.selectedIds.length} media selected`} style={styles.galleryComposer}>
        <Pressable accessibilityLabel={'Edit selected media'} accessibilityRole={'button'} onPress={props.onNext} style={styles.galleryEdit}><EditSelectedMediaIcon /></Pressable>
        <View style={styles.galleryCaptionBox}><TextInput accessibilityLabel={'Add gallery caption'} onChangeText={props.onCaptionChange} placeholder={'Add Caption'} placeholderTextColor={'#8792A4'} style={styles.galleryCaptionInput} value={props.caption} /><EmojiIcon /></View>
        <Pressable accessibilityLabel={'Preview selected media'} onPress={props.onNext} style={styles.gallerySend}><SendIcon /><View style={styles.sendBadge}><Text style={styles.sendBadgeText}>{props.selectedIds.length}</Text></View></Pressable>
      </View> : null}
    </Animated.View>
  </KeyboardAvoidingView>;
}

function GalleryTile({asset, selected, onPress, compact = false}: {asset: GalleryAsset; selected: boolean; onPress: () => void; compact?: boolean}) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  return <Pressable accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${asset.filename}`} accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={[styles.galleryTile, compact && styles.recentTile]}>
    {asset.mediaType === 'photo' || !thumbnailFailed ? <Image source={{uri: asset.uri}} onError={() => setThumbnailFailed(true)} style={styles.galleryImage} /> : <View style={styles.videoTile}><Text style={styles.videoGlyph}>▶</Text></View>}
    {compact && asset.mediaType === 'video' && !thumbnailFailed ? <Text style={styles.recentVideoGlyph}>▶</Text> : null}
    <View style={[styles.selectionCircle, selected && styles.selectionCircleSelected]}>{selected ? <Text style={styles.selectionNumber}>{'✓'}</Text> : null}</View>
    {asset.mediaType === 'video' ? <Text style={styles.videoDuration}>{Math.floor(asset.duration / 60)}:{String(Math.round(asset.duration % 60)).padStart(2, '0')}</Text> : null}
  </Pressable>;
}

function TrayButton({icon, label, onPress, tone}: {icon: React.ReactNode; label: string; onPress: () => void; tone: string}) {
  const toneStyle = tone === 'gallery' ? styles.galleryBox : tone === 'location' ? styles.locationBox : tone === 'contact' ? styles.contactBox : tone === 'document' ? styles.documentBox : styles.cameraBox;
  return <Pressable accessibilityLabel={label} onPress={onPress} style={styles.trayItem}>
    <View style={[styles.trayIconBox, toneStyle]}>{icon}</View>
    <Text style={styles.trayLabel}>{label}</Text>
  </Pressable>;
}

function AttachmentTray(props: {onCamera: () => void; onGallery: () => void; onLocation: () => void; onContact: () => void; onDocument: () => void; onClose: () => void;
  onViewAll: () => void; assets: GalleryAsset[]; access: RecentsAccess; selectedIds: string[]; onToggle: (id: string) => void; onPreview: () => void;
}) {
  const insets = useSafeAreaInsets();
  return <View accessibilityLabel={'Attachment options'} style={[styles.attachmentSheet, {paddingBottom: Math.max(insets.bottom, 14)}]}>
      <View style={styles.sheetHandle} />

      <View style={styles.trayRow}>
        <TrayButton icon={<CameraAttachmentIcon />} label={'Camera'} onPress={props.onCamera} tone={'camera'} />
        <TrayButton icon={<GalleryAttachmentIcon />} label={'Gallery'} onPress={props.onGallery} tone={'gallery'} />
        <TrayButton icon={<LocationAttachmentIcon />} label={'Location'} onPress={props.onLocation} tone={'location'} />
        <TrayButton icon={<ContactAttachmentIcon />} label={'Contact'} onPress={props.onContact} tone={'contact'} />
      </View>
      <View style={styles.documentRow}><TrayButton icon={<DocumentAttachmentIcon />} label={'Document'} onPress={props.onDocument} tone={'document'} /></View>
      <View accessibilityLabel="Recent media" style={styles.trayRecents}>
        <View style={styles.trayHeading}>
          <Text style={styles.trayTitle}>Recents</Text>
          <Pressable accessibilityLabel="View all device media" onPress={props.onViewAll}><Text style={styles.trayCancel}>View all</Text></Pressable>
        </View>
        {props.access === 'loading' ? <View accessibilityLabel="Loading recent media" style={styles.recentStatus}><ActivityIndicator color={PURPLE} /></View> :
          props.access !== 'ready' ? <Pressable accessibilityLabel="Choose photos and videos" onPress={props.onGallery} style={styles.recentStatus}>
            <Text style={styles.emptyGallery}>{props.access === 'denied' ? 'Allow photo access or choose media from Gallery.' : 'Choose photos and videos from Gallery.'}</Text>
          </Pressable> : props.assets.length ?
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentStrip}>
            {props.assets.slice(0, 12).map(asset => <GalleryTile key={asset.id} asset={asset} compact selected={props.selectedIds.includes(asset.id)} onPress={() => props.onToggle(asset.id)} />)}
          </ScrollView> : <View style={styles.recentStatus}><Text style={styles.emptyGallery}>No photos or videos in Recents.</Text></View>}
        {props.selectedIds.length ? <Pressable accessibilityLabel="Preview selected media" onPress={props.onPreview} style={styles.trayPreview}><Text style={styles.nextText}>{`Preview (${props.selectedIds.length})`}</Text></Pressable> : null}
      </View>
  </View>;
}

function galleryDateGroup(asset: GalleryAsset): string {
  const date = new Date(asset.creationTime || 0);
  const today = new Date();
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDifference = Math.floor((startOfDay(today) - startOfDay(date)) / 86400000);
  if (dayDifference === 0) return 'Today';
  if (dayDifference === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {month: 'long', day: 'numeric', year: 'numeric'});
}

async function attachmentFromGalleryAsset(asset: GalleryAsset): Promise<AttachmentMedia> {
  const info = asset.fromSystemPicker || asset.resolvedUri
    ? {uri: asset.uri, localUri: asset.uri}
    : await LegacyMediaLibrary.getAssetInfoAsync(asset, {shouldDownloadFromNetwork: true});
  const media: AttachmentMedia = {
    id: asset.id,
    uri: info.localUri || info.uri,
    fileName: asset.filename || `${asset.mediaType}-${Date.now()}`,
    mimeType: asset.pickerMimeType || (asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
    type: asset.mediaType === 'video' ? 'video' : 'image',
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
  };
  return isGifMedia(media) ? {...media, mimeType: 'image/gif'} : media;
}

function GalleryGrid({assets, loading, loadingMore, hasMore, onLoadMore, selectedIds, onToggle}: {assets: GalleryAsset[]; loading: boolean; loadingMore: boolean; hasMore: boolean; onLoadMore: () => void; selectedIds: string[]; onToggle: (id: string) => void}) {
  if (loading) return <View style={styles.galleryLoading}><ActivityIndicator color={PURPLE} /></View>;
  if (!assets.length) return <View style={styles.galleryLoading}><Text style={styles.emptyGallery}>No photos or videos in Recent Images.</Text></View>;
  const groups = new Map<string, GalleryAsset[]>();
  assets.forEach(asset => {
    const label = galleryDateGroup(asset);
    const group = groups.get(label) || [];
    group.push(asset);
    groups.set(label, group);
  });
  return <ScrollView
    contentContainerStyle={styles.galleryGrid}
    onScroll={({nativeEvent}) => {
      if (hasMore && !loadingMore && nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >= nativeEvent.contentSize.height - 240) onLoadMore();
    }}
    scrollEventThrottle={300}
    showsVerticalScrollIndicator={false}
    style={styles.galleryScroller}
  >{Array.from(groups.entries()).map(([label, group]) => <View key={label} style={styles.galleryDateSection}>
    <Text style={styles.galleryDateHeading}>{label}</Text>
    <View style={styles.galleryDateGrid}>{group.map(asset => {
      const selected = selectedIds.includes(asset.id);
      return <GalleryTile asset={asset} key={asset.id} onPress={() => onToggle(asset.id)} selected={selected} />;
    })}</View>
  </View>)}{loadingMore ? <ActivityIndicator color={PURPLE} style={styles.galleryPaginationSpinner} /> : null}</ScrollView>;
}

export function MediaAttachmentFlow({visible, transfer, recipientName, initialScreen = 'tray', initialMedia, requestRecentsPermissionOnOpen = true, onClose, onDocument, onLocation, onContact, onSend, onNotice}: Props) {
  const incomingAssets = useMemo<GalleryAsset[]>(() => (initialMedia || []).map(item => ({
    id: item.id, uri: item.uri, filename: item.fileName,
    mediaType: item.type === 'video' ? 'video' : 'photo',
    width: item.width || 0, height: item.height || 0, duration: item.duration || 0,
    creationTime: Date.now(), modificationTime: Date.now(),
    fromSystemPicker: true, pickerMimeType: item.mimeType,
  })), [initialMedia]);
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const captionRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const initialScreenOpened = useRef(false);
  const recentsVersion = useRef(0);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [screen, setScreen] = useState<FlowScreen>('tray');
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [hasMoreGalleryAssets, setHasMoreGalleryAssets] = useState(false);
  const [loadingMoreGalleryAssets, setLoadingMoreGalleryAssets] = useState(false);
  const [galleryCursor, setGalleryCursor] = useState<string | undefined>();
  const galleryOffset = useRef(0);
  const galleryPageInFlight = useRef(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<AttachmentMedia[]>([]);
  const [caption, setCaption] = useState('');
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [recentsAccess, setRecentsAccess] = useState<RecentsAccess>('loading');
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoom, setZoom] = useState(0);
  const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
  const [recording, setRecording] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [hdEnabled, setHdEnabled] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [editingMedia, setEditingMedia] = useState(false);
  const [editor, setEditor] = useState<null | {mode: 'crop' | 'effects' | 'text'; image: EditableImage}>(null);
  // Earlier versions of each edited item, newest last, for Undo.
  const [editHistory, setEditHistory] = useState<Record<string, AttachmentMedia[]>>({});
  const [flowNotice, setFlowNotice] = useState('');
  // Past the tray this flow is a full-screen modal that covers the chat's own
  // notice bar, so its messages are shown inside the modal.
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const notify = useCallback((message: string) => {
    if (screenRef.current === 'tray') onNotice(message);
    else setFlowNotice(message);
  }, [onNotice]);

  useLayoutEffect(() => {
    recentsVersion.current += 1;
    if (!visible) { initialScreenOpened.current = false; return; }
    initialScreenOpened.current = false;
    setRecentsAccess('loading'); setLoadingGallery(false);
    setHasMoreGalleryAssets(false); setLoadingMoreGalleryAssets(false); setGalleryCursor(undefined); galleryOffset.current = 0;
    setScreen(initialMedia?.length ? 'preview' : 'tray'); setSelectedIds(incomingAssets.map(item => item.id)); setAssets(incomingAssets); setSelectedMedia(initialMedia || []); setCaption(''); setCameraReady(false); setPreviewIndex(0); setHdEnabled(false); setPreviewZoom(1); setEditingMedia(false); setEditor(null); setEditHistory({}); setFlowNotice('');
    return () => { recentsVersion.current += 1; };
  }, [incomingAssets, initialMedia, visible]);

  const loadRecents = useCallback(async (requestPermission = true) => {
    const version = ++recentsVersion.current;
    setLoadingGallery(true);
    setRecentsAccess('loading');
    try {
      const permissionGranted = await requestRecentMediaAccess(requestPermission);
      if (version !== recentsVersion.current) return false;
      if (!permissionGranted) {
        setRecentsAccess('denied'); return false;
      }
      galleryOffset.current = 0;
      const page = await loadRecentDeviceAssets();
      if (version !== recentsVersion.current) return false;
      galleryOffset.current = page.nextOffset;
      setGalleryCursor(page.nextCursor);
      setHasMoreGalleryAssets(page.hasMore);
      const unique = new Map<string, GalleryAsset>();
      [...incomingAssets, ...page.assets].forEach(asset => unique.set(asset.id, asset));
      setAssets([...unique.values()].sort((a, b) => (b.creationTime || 0) - (a.creationTime || 0)));
      setRecentsAccess('ready'); return true;
    } catch {
      // Some development clients cannot expose Media Library. Gallery taps can
      // still fall back to the permissionless system photo picker.
      if (version === recentsVersion.current) setRecentsAccess('unavailable');
      return false;
    } finally { if (version === recentsVersion.current) setLoadingGallery(false); }
  }, [incomingAssets]);

  const loadMoreGalleryAssets = useCallback(async () => {
    if (!hasMoreGalleryAssets || loadingMoreGalleryAssets || galleryPageInFlight.current) return;
    galleryPageInFlight.current = true;
    setLoadingMoreGalleryAssets(true);
    try {
      const page = await loadRecentDeviceAssets(galleryCursor, galleryOffset.current);
      galleryOffset.current = page.nextOffset;
      setGalleryCursor(page.nextCursor);
      setHasMoreGalleryAssets(page.hasMore);
      setAssets(current => {
        const unique = new Map<string, GalleryAsset>();
        [...current, ...page.assets].forEach(asset => unique.set(asset.id, asset));
        return [...unique.values()].sort((a, b) => (b.creationTime || 0) - (a.creationTime || 0));
      });
    } catch {
      setHasMoreGalleryAssets(false);
    } finally {
      galleryPageInFlight.current = false;
      setLoadingMoreGalleryAssets(false);
    }
  }, [galleryCursor, hasMoreGalleryAssets, loadingMoreGalleryAssets]);

  useEffect(() => {
    if (visible && !initialMedia?.length && initialScreen === 'tray') {
      loadRecents(requestRecentsPermissionOnOpen).catch(() => undefined);
    }
  }, [initialMedia, initialScreen, loadRecents, requestRecentsPermissionOnOpen, visible]);

  const openSystemGallery = useCallback(async () => {
    const retained = selectedIds;
    if (retained.length >= 10) { notify('Remove an item before adding more media.'); return false; }
    setLoadingGallery(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: 10 - retained.length,
        orderedSelection: true,
        defaultTab: 'photos',
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets.length) return false;
      const now = Date.now();
      const picked: GalleryAsset[] = result.assets.map((asset, index) => ({
        id: `system-picker-${asset.assetId || now}-${index}`,
        filename: asset.fileName || `${asset.type === 'video' ? 'video' : 'photo'}-${now}-${index + 1}`,
        uri: asset.uri,
        mediaType: asset.type === 'video' ? 'video' : 'photo',
        width: asset.width,
        height: asset.height,
        creationTime: now - index,
        modificationTime: now - index,
        duration: asset.type === 'video' ? (asset.duration || 0) / 1000 : 0,
        fromSystemPicker: true,
        pickerMimeType: asset.mimeType || undefined,
      }));
      setHasMoreGalleryAssets(false); setGalleryCursor(undefined); galleryOffset.current = 0;
      const selectedAssets = retained.map(id => assets.find(asset => asset.id === id)).filter((asset): asset is GalleryAsset => Boolean(asset));
      const mediaById = new Map(selectedMedia.map(media => [media.id, media]));
      const retainedMedia = await Promise.all(selectedAssets
        .filter(asset => !mediaById.has(asset.id))
        .map(attachmentFromGalleryAsset));
      const selectedUris = new Set([
        ...selectedMedia.map(media => media.uri),
        ...selectedAssets.map(asset => asset.uri),
      ]);
      const newPicked = picked.filter(asset => !retained.includes(asset.id) && !selectedUris.has(asset.uri));
      const mediaFromPicked = await Promise.all(newPicked.map(attachmentFromGalleryAsset));
      setAssets(current => {
        const combinedAssets = new Map<string, GalleryAsset>();
        [...current, ...newPicked].forEach(asset => combinedAssets.set(asset.id, asset));
        return [...combinedAssets.values()].sort((a, b) => (b.creationTime || 0) - (a.creationTime || 0));
      });
      setSelectedIds([...retained, ...newPicked.map(asset => asset.id)]);
      setSelectedMedia([...selectedMedia, ...retainedMedia, ...mediaFromPicked]);
      setPreviewIndex(0);
      setScreen('preview');
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to open device photos.');
      return false;
    } finally { setLoadingGallery(false); }
  }, [assets, notify, selectedIds, selectedMedia]);

  const openGallery = useCallback(async () => {
    if (recentsAccess === 'ready' || (recentsAccess === 'loading' && await loadRecents())) {
      setScreen('gallery');
      return;
    }
    await openSystemGallery();
  }, [loadRecents, openSystemGallery, recentsAccess]);
  const openFullGallery = useCallback(() => openSystemGallery(), [openSystemGallery]);
  const openCamera = useCallback(async () => {
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!permission.granted) { notify('Camera access is required to take a photo or video.'); return; }
    setScreen('camera'); loadRecents().catch(() => undefined);
  }, [cameraPermission, loadRecents, notify, requestCameraPermission]);

  useEffect(() => {
    if (!visible || initialMedia?.length || initialScreen === 'tray' || initialScreenOpened.current) return;
    initialScreenOpened.current = true;
    if (initialScreen === 'gallery') openGallery().catch(() => undefined);
    else openCamera().catch(() => undefined);
  }, [initialMedia, initialScreen, openCamera, openGallery, visible]);
  const close = useCallback(() => {
    if (recording) cameraRef.current?.stopRecording();
    onClose();
  }, [onClose, recording]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(current => current.includes(id)
      ? current.filter(item => item !== id)
      : current.length < 10 ? [...current, id] : current);
  }, []);

  const continueFromGallery = useCallback(async () => {
    if (!selectedIds.length) return;
    setLoadingGallery(true);
    try {
      const chosen = await Promise.all(selectedIds.map(id => {
        const asset = assets.find(item => item.id === id);
        if (!asset) throw new Error('A selected media item is no longer available.');
        return attachmentFromGalleryAsset(asset);
      }));
      setSelectedMedia(chosen); setPreviewIndex(0); setScreen('preview');
    } catch (error) { notify(error instanceof Error ? error.message : 'Unable to prepare selected media.'); }
    finally { setLoadingGallery(false); }
  }, [assets, notify, selectedIds]);

  const capture = useCallback(async () => {
    if (!cameraReady || capturing) return;
    if (cameraMode === 'video') {
      if (recording) { cameraRef.current?.stopRecording(); return; }
      setRecording(true);
      try {
        const result = await cameraRef.current?.recordAsync({maxDuration: 60, maxFileSize: 100 * 1024 * 1024});
        if (result?.uri) {
          setSelectedMedia([{id: `camera-${Date.now()}`, uri: result.uri, fileName: `chatterly-video-${Date.now()}.mp4`, mimeType: 'video/mp4', type: 'video'}]);
          setScreen('preview');
        }
      } catch (error) { notify(error instanceof Error ? error.message : 'Unable to record video.'); }
      finally { setRecording(false); }
      return;
    }
    setCapturing(true);
    try {
      const result = await cameraRef.current?.takePictureAsync({quality: 0.82, shutterSound: true});
      if (result?.uri) {
        setSelectedMedia([{id: `camera-${Date.now()}`, uri: result.uri, fileName: `chatterly-photo-${Date.now()}.jpg`, mimeType: 'image/jpeg', type: 'image', width: result.width, height: result.height}]);
        setScreen('preview');
      }
    } catch (error) { notify(error instanceof Error ? error.message : 'Unable to take photo.'); }
    finally { setCapturing(false); }
  }, [cameraMode, cameraReady, capturing, notify, recording]);

  const send = useCallback(async () => {
    if (!selectedMedia.length || transfer.phase !== 'idle') return;
    if (await onSend(selectedMedia, caption.trim(), hdEnabled)) onClose();
  }, [caption, hdEnabled, onClose, onSend, selectedMedia, transfer.phase]);
  const removePreview = useCallback(() => {
    const removed = selectedMedia[previewIndex];
    const remaining = selectedMedia.filter((_item, index) => index !== previewIndex);
    setSelectedMedia(remaining);
    if (removed) setSelectedIds(current => current.filter(id => id !== removed.id));
    if (!remaining.length) setScreen(selectedIds.length ? 'gallery' : 'camera');
    setPreviewIndex(index => Math.max(0, Math.min(index, remaining.length - 1)));
  }, [previewIndex, selectedIds.length, selectedMedia]);
  const activeTransfer = transfer.phase !== 'idle';
  const transferPercent = Math.round(transfer.progress * 100);
  const transferLabel = transfer.phase === 'compressing' ? 'Compressing media' : transfer.phase === 'uploading' ? 'Uploading' : 'Securing & delivering';
  const currentPreview = selectedMedia[previewIndex] || selectedMedia[0];

  const saveCurrentMedia = useCallback(async () => {
    if (!currentPreview || editingMedia) return;
    setEditingMedia(true);
    try {
      const permission = await LegacyMediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) { notify('Photo access is required to save this media.'); return; }
      await LegacyMediaLibrary.saveToLibraryAsync(currentPreview.uri);
      notify('Media saved to your gallery.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save this media.');
    } finally { setEditingMedia(false); }
  }, [currentPreview, editingMedia, notify]);

  // Edits are saved at full quality; the HD choice is applied once, when the media is sent.
  const replaceCurrentImage = useCallback((edited: EditableImage) => {
    const item = selectedMedia[previewIndex];
    if (!item) return;
    setEditHistory(current => ({...current, [item.id]: [...(current[item.id] || []), item]}));
    setSelectedMedia(current => current.map((entry, index) => index === previewIndex ? {
      ...entry, uri: edited.uri, width: edited.width, height: edited.height,
      fileName: entry.fileName.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg',
    } : entry));
  }, [previewIndex, selectedMedia]);
  const undoEdit = useCallback(() => {
    const item = selectedMedia[previewIndex];
    const versions = item ? editHistory[item.id] : undefined;
    if (!item || !versions?.length) return;
    setEditHistory(current => ({...current, [item.id]: versions.slice(0, -1)}));
    setSelectedMedia(current => current.map((entry, index) => index === previewIndex ? versions[versions.length - 1] : entry));
  }, [editHistory, previewIndex, selectedMedia]);
  const openEditor = useCallback(async (mode: 'crop' | 'effects' | 'text') => {
    if (!currentPreview || editingMedia) return;
    if (currentPreview.type !== 'image') { notify('This edit is available for photos only.'); return; }
    setEditingMedia(true);
    try { setEditor({mode, image: await loadEditableImage(currentPreview.uri)}); }
    catch (error) { notify(error instanceof Error ? error.message : 'Unable to open this photo for editing.'); }
    finally { setEditingMedia(false); }
  }, [currentPreview, editingMedia, notify]);
  const rotateCurrentImage = useCallback(async () => {
    if (!currentPreview || editingMedia) return;
    if (currentPreview.type !== 'image') { notify('This edit is available for photos only.'); return; }
    setEditingMedia(true);
    try { replaceCurrentImage(await rotateImage(currentPreview.uri)); }
    catch (error) { notify(error instanceof Error ? error.message : 'Unable to edit this photo.'); }
    finally { setEditingMedia(false); }
  }, [currentPreview, editingMedia, notify, replaceCurrentImage]);
  const applyCrop = useCallback(async (crop: Parameters<typeof cropImage>[1]) => {
    if (!editor) return;
    setEditingMedia(true);
    try { replaceCurrentImage(await cropImage(editor.image.uri, crop)); setEditor(null); }
    catch (error) { notify(error instanceof Error ? error.message : 'Unable to crop this photo.'); }
    finally { setEditingMedia(false); }
  }, [editor, notify, replaceCurrentImage]);
  const finishEdit = useCallback((edited: EditableImage) => { replaceCurrentImage(edited); setEditor(null); }, [replaceCurrentImage]);
  const toggleHd = useCallback(() => {
    const next = !hdEnabled;
    setHdEnabled(next);
    notify(next ? 'HD on: photos are sent in high quality.' : 'HD off: photos are sent in standard quality.');
  }, [hdEnabled, notify]);
  const canUndo = Boolean(currentPreview && editHistory[currentPreview.id]?.length);
  const toolsLocked = activeTransfer || editingMedia || Boolean(editor);

  useEffect(() => { setPreviewZoom(1); }, [previewIndex, currentPreview?.uri]);

  if (!visible) return null;

  // The design keeps the composer visible immediately above these actions.
  // Rendering the first step inline lets the conversation resize instead of
  // placing a transparent full-screen modal over the input and microphone.
  if (screen === 'tray') {
    return <AttachmentTray assets={assets} access={recentsAccess} selectedIds={selectedIds} onToggle={toggleSelected} onPreview={continueFromGallery} onCamera={openCamera} onClose={close} onContact={onContact} onDocument={onDocument} onGallery={openGallery} onViewAll={openFullGallery} onLocation={onLocation} />;
  }

  return <Modal animationType={'slide'} onRequestClose={editor ? () => setEditor(null) : close} statusBarTranslucent transparent visible>
    {screen === 'gallery' ? <GallerySheet assets={assets} caption={caption} loading={loadingGallery} loadingMore={loadingMoreGalleryAssets} hasMore={hasMoreGalleryAssets} onLoadMore={loadMoreGalleryAssets} onCaptionChange={setCaption} onClose={close} onNext={continueFromGallery} onToggle={toggleSelected} selectedIds={selectedIds} /> : null}
    {screen === 'camera' ? <View style={styles.cameraScreen}>
      <CameraView active facing={facing} flash={flash} mode={cameraMode} onCameraReady={() => setCameraReady(true)} ratio={'16:9'} ref={cameraRef} style={StyleSheet.absoluteFill} videoBitrate={2500000} videoQuality={'720p'} zoom={zoom} />
      <StatusBar animated backgroundColor={'transparent'} barStyle={'light-content'} hidden={false} translucent />
      <View style={[styles.cameraTop, {paddingTop: Math.max(insets.top, 20)}]}>
        <Pressable accessibilityLabel={'Close camera'} onPress={close} style={styles.cameraClose}><CloseCameraIcon /></Pressable>
      </View>
      <View style={[styles.cameraControls, {paddingBottom: Math.max(insets.bottom, 12)}]}>
        <View style={styles.cameraButtons}>
          <Pressable accessibilityLabel={'Open gallery'} onPress={openGallery} style={styles.cameraSquare}>{assets[0]?.mediaType === 'photo' ? <Image source={{uri: assets[0].uri}} style={styles.lastPhoto} /> : <GalleryAttachmentIcon color={'#CBD5E1'} />}</Pressable>
          <Pressable accessibilityLabel={'Toggle zoom'} onPress={() => setZoom(value => value ? 0 : 0.22)} style={styles.cameraSquare}><Text style={styles.zoomText}>{zoom ? '2x' : '1x'}</Text></Pressable>
          <Pressable accessibilityLabel={recording ? 'Stop recording' : cameraMode === 'video' ? 'Record video' : 'Take photo'} onPress={capture} style={[styles.shutterOuter, recording && styles.recordingOuter]}><View style={[styles.shutterInner, cameraMode === 'video' && styles.videoShutter, recording && styles.recordingShutter]} /></Pressable>
          <Pressable accessibilityLabel={'Toggle flash'} onPress={() => setFlash(value => value === 'off' ? 'on' : 'off')} style={styles.cameraSquare}><FlashCameraIcon active={flash !== 'off'} /></Pressable>
          <Pressable accessibilityLabel={'Switch camera'} onPress={() => setFacing(value => value === 'back' ? 'front' : 'back')} style={styles.cameraSquare}><SwitchCameraIcon /></Pressable>
        </View>
        <View style={styles.modeTabs}><Pressable onPress={() => setCameraMode('video')}><Text style={[styles.modeText, cameraMode === 'video' && styles.modeTextActive]}>Video</Text></Pressable><Pressable onPress={() => setCameraMode('picture')} style={cameraMode === 'picture' && styles.modePill}><Text style={[styles.modeText, cameraMode === 'picture' && styles.modeTextActive]}>Photo</Text></Pressable></View>
      </View>
    </View> : null}
    {screen === 'preview' ? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.previewKeyboardAvoider}><View accessibilityLabel={'Media preview editor'} style={styles.previewScreen}>
      <View style={[styles.previewSafeArea, {height: insets.top}]} />
      <View style={styles.previewToolbar}>
        <Pressable accessibilityLabel={editor ? 'Cancel edit' : 'Back to media selection'} disabled={activeTransfer || (editingMedia && Boolean(editor))} onPress={() => editor ? setEditor(null) : initialMedia?.length ? close() : setScreen(selectedIds.length ? 'gallery' : 'camera')} style={styles.toolbarButton}><MediaPreviewBackIcon /></Pressable>
        <View style={styles.toolbarActions}>
          <Pressable accessibilityLabel={'Save media'} disabled={toolsLocked} onPress={saveCurrentMedia} style={[styles.toolbarButton, toolsLocked && styles.toolInactive]}><SaveMediaIcon /></Pressable>
          <Pressable accessibilityLabel={'Crop media'} disabled={toolsLocked} onPress={() => openEditor('crop')} style={[styles.toolbarButton, toolsLocked && styles.toolInactive]}><CropMediaIcon /></Pressable>
          <Pressable accessibilityLabel={'Media effects'} disabled={toolsLocked} onPress={() => openEditor('effects')} style={[styles.toolbarButton, toolsLocked && styles.toolInactive]}><EffectsMediaIcon /></Pressable>
          <Pressable accessibilityLabel={'Rotate media'} disabled={toolsLocked} onPress={rotateCurrentImage} style={[styles.toolbarButton, toolsLocked && styles.toolInactive]}><RotateMediaIcon /></Pressable>
          {/* Text goes on a photo; a video keeps the caption field as its text. */}
          <Pressable accessibilityLabel={'Add text'} disabled={toolsLocked} onPress={() => currentPreview?.type === 'video' ? captionRef.current?.focus() : openEditor('text')} style={[styles.toolbarButton, toolsLocked && styles.toolInactive]}><AddTextMediaIcon /></Pressable>
          <Pressable accessibilityLabel={hdEnabled ? 'Turn HD off' : 'Turn HD on'} accessibilityRole="button" accessibilityState={{selected: hdEnabled}} disabled={Boolean(editor)} onPress={toggleHd} style={[styles.toolbarButton, Boolean(editor) && styles.toolInactive]}><HdMediaIcon active={hdEnabled} /></Pressable>
        </View>
      </View>
      {editor ? editor.mode === 'crop'
        ? <ImageCropEditor busy={editingMedia} image={editor.image} onApply={applyCrop} onCancel={() => setEditor(null)} />
        : editor.mode === 'effects'
          ? <ImageEffectsEditor image={editor.image} onApply={finishEdit} onCancel={() => setEditor(null)} />
          : <ImageTextEditor image={editor.image} onApply={finishEdit} onCancel={() => setEditor(null)} /> : null}
      {editor ? null : <>
      <View style={styles.previewStage}>{currentPreview?.type === 'video' ? <PreviewVideo uri={currentPreview.uri} /> : currentPreview ? <ZoomableImage key={currentPreview.uri} onZoomChange={setPreviewZoom} uri={currentPreview.uri} zoom={previewZoom} /> : null}
        {editingMedia ? <View style={styles.editBusy}><ActivityIndicator color={'#FFF'} /></View> : null}
        {canUndo ? <Pressable accessibilityLabel={'Undo last edit'} accessibilityRole="button" disabled={toolsLocked} onPress={undoEdit} style={styles.undoButton}><Text style={styles.undoText}>↶ Undo</Text></Pressable> : null}
        {currentPreview?.type === 'image' ? <View accessibilityLabel={`Image zoom ${Math.round(previewZoom * 100)} percent`} style={styles.zoomControls}>
          <Pressable accessibilityLabel="Zoom out" accessibilityRole="button" disabled={previewZoom <= 1} onPress={() => setPreviewZoom(value => Math.max(1, Number((value - 0.25).toFixed(2))))} style={styles.zoomButton}><Text style={styles.zoomButtonText}>−</Text></Pressable>
          <Text style={styles.zoomLevel}>{Math.round(previewZoom * 100)}%</Text>
          <Pressable accessibilityLabel="Zoom in" accessibilityRole="button" disabled={previewZoom >= 3} onPress={() => setPreviewZoom(value => Math.min(3, Number((value + 0.25).toFixed(2))))} style={styles.zoomButton}><Text style={styles.zoomButtonText}>+</Text></Pressable>
        </View> : null}
      </View>
      <View style={styles.previewSelectionRow}>
        <Pressable accessibilityLabel={'Add more media'} onPress={() => initialMedia?.length ? openGallery() : setScreen('gallery')} style={styles.addMoreButton}><AddGalleryMediaIcon/></Pressable>
        <ScrollView contentContainerStyle={styles.previewStrip} horizontal showsHorizontalScrollIndicator={false}>{selectedMedia.map((item, index) => <View key={item.id} style={styles.previewThumbContainer}><Pressable accessibilityLabel={`Preview item ${index + 1}`} onPress={() => setPreviewIndex(index)} style={[styles.previewThumbWrap, index === previewIndex && styles.previewThumbActive]}>{item.type === 'image' ? <Image source={{uri: item.uri}} style={styles.previewThumb} /> : <View style={[styles.previewThumb, styles.videoThumb]}><Text style={styles.videoGlyph}>V</Text></View>}<View style={styles.previewNumber}><Text style={styles.previewNumberText}>{index + 1}</Text></View></Pressable>{index === previewIndex ? <Pressable accessibilityLabel={'Remove current media'} onPress={removePreview} style={styles.deleteOverlay}><DeleteGalleryMediaIcon/></Pressable> : null}</View>)}</ScrollView>
      </View>
      <View style={[styles.captionBar, {paddingBottom: Math.max(insets.bottom, 8)}]}>
        {activeTransfer ? <View accessibilityLabel={`${transferLabel} ${transferPercent}%`} accessibilityLiveRegion={'polite'} style={styles.progressArea}><View style={styles.progressCopy}><Text style={styles.progressLabel}>{transferLabel} {transfer.current}/{transfer.total}</Text><Text style={styles.progressPercent}>{transferPercent}%</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${transferPercent}%`}]} /></View></View> : null}
        <View style={styles.captionRow}><TextInput accessibilityLabel={'Add a caption'} editable={!activeTransfer} onChangeText={setCaption} placeholder={'Add Caption'} placeholderTextColor={'#8792A4'} ref={captionRef} style={styles.captionInput} value={caption} /><Pressable accessibilityLabel={'Send selected media'} disabled={activeTransfer} onPress={send} style={styles.sendButton}>{activeTransfer ? <ActivityIndicator color={'#FFF'} size={'small'} /> : <SendIcon />}</Pressable></View>
        <Text style={styles.sharingLabel}>Sharing with</Text><View style={styles.recipientPill}><Text style={styles.recipientText}>{recipientName}</Text></View>
      </View>
      </>}
    </View></KeyboardAvoidingView> : null}
    <Snackbar bottomInset={insets.bottom + 150} message={flowNotice} onHide={() => setFlowNotice('')} />
  </Modal>;
}

const styles = createThemedStyles({
  dimBackdrop:{flex:1,backgroundColor:'rgba(19,24,31,.48)',justifyContent:'flex-end'},
  dimDismiss:{flex:1},
  sheetHandle:{alignSelf:'center',width:42,height:3,marginTop:7,marginBottom:9,borderRadius:3,backgroundColor:'#DDE3EB'},
  dragHandleArea:{height:20,justifyContent:'center'},
  attachmentSheet:{minHeight:200,borderTopLeftRadius:18,borderTopRightRadius:18,paddingHorizontal:12,borderTopWidth:1,borderTopColor:'#F0F2F6',backgroundColor:'#FFF',shadowColor:'#000',shadowOffset:{width:0,height:-2},shadowOpacity:.08,shadowRadius:8,elevation:10},
  trayHeading:{height:30,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  trayTitle:{color:'#172033',fontSize:13,fontWeight:'700'},
  trayCancel:{color:PURPLE,fontSize:11,fontWeight:'600'},
  trayRecents:{marginTop:8,borderTopWidth:1,borderTopColor:'#EDF0F4',paddingTop:4},
  recentStrip:{gap:7,paddingBottom:6},
  recentTile:{width:78,height:78,aspectRatio:1},
  recentVideoGlyph:{position:'absolute',right:5,top:4,color:'#FFF',fontSize:12},
  recentStatus:{minHeight:78,alignItems:'center',justifyContent:'center'},
  trayPreview:{alignSelf:'flex-end',paddingHorizontal:14,paddingVertical:10,borderRadius:16,backgroundColor:'#F1E7FF'},
  trayRow:{marginTop:6,flexDirection:'row',justifyContent:'space-between'},
  documentRow:{width:'25%',minHeight:61,marginTop:11},
  trayItem:{flex:1,alignItems:'center'},
  trayIconBox:{width:64,height:40,borderRadius:7,alignItems:'center',justifyContent:'center'},
  trayGlyph:{color:'#526176',fontSize:15,fontWeight:'700'},
  cameraBox:{backgroundColor:'#EFF3FA'}, galleryBox:{backgroundColor:'#ECFCFE'},
  locationBox:{backgroundColor:'#FAEFFF'}, contactBox:{backgroundColor:'#FEFCE8'},
  documentBox:{backgroundColor:'#EEF3FA'},
  trayLabel:{marginTop:6,color:'#1B2738',fontSize:10,fontWeight:'500'},
  gallerySheet:{borderTopLeftRadius:18,borderTopRightRadius:18,backgroundColor:'#FFF',overflow:'hidden',flexShrink:1},
  galleryHeader:{height:42,paddingHorizontal:13,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  recentsButton:{height:42,flexDirection:'row',alignItems:'center',gap:4},
  recentsText:{color:'#101827',fontSize:14,fontWeight:'600'},
  recentsChevronExpanded:{transform:[{rotate:'180deg'}]},
  galleryHeaderRight:{flexDirection:'row',alignItems:'center'},
  nextButton:{height:32,paddingHorizontal:11,borderRadius:16,backgroundColor:'#F1E7FF',alignItems:'center',justifyContent:'center'},
  nextText:{color:PURPLE,fontSize:11,fontWeight:'700'},
  closeButton:{width:38,height:38,alignItems:'flex-end',justifyContent:'center'},
  closeText:{color:'#172033',fontSize:22},
  galleryScroller:{flex:1},
  galleryGrid:{paddingHorizontal:10,paddingBottom:10},
  galleryDateSection:{width:'100%',marginBottom:10},
  galleryDateHeading:{paddingTop:8,paddingBottom:9,color:'#172033',fontSize:13,fontWeight:'700'},
  galleryDateGrid:{width:'100%',flexDirection:'row',flexWrap:'wrap',gap:5},
  galleryPaginationSpinner:{marginVertical:12},
  galleryTile:{position:'relative',width:'32.3%',aspectRatio:1,overflow:'hidden',borderRadius:8,backgroundColor:'#DCE3EB'},
  galleryImage:{width:'100%',height:'100%'},
  videoTile:{flex:1,backgroundColor:'#394150',alignItems:'center',justifyContent:'center'},
  videoGlyph:{color:'#FFF',fontSize:19},
  selectionCircle:{position:'absolute',left:4,top:4,width:18,height:18,borderRadius:4,borderWidth:1.5,borderColor:'#FFF',backgroundColor:'rgba(0,0,0,.18)',alignItems:'center',justifyContent:'center'},
  selectionCircleSelected:{borderColor:'#FFF',backgroundColor:'#FFF'},
  selectionNumber:{color:PURPLE,fontSize:10,fontWeight:'800'},
  videoDuration:{position:'absolute',right:4,bottom:3,color:'#FFF',fontSize:8,fontWeight:'600'},
  galleryLoading:{flex:1,alignItems:'center',justifyContent:'center'},
  emptyGallery:{color:'#758196',fontSize:12},
  galleryComposer:{height:58,paddingHorizontal:10,borderTopWidth:1,borderTopColor:'#EDF0F4',backgroundColor:'#FFF',flexDirection:'row',alignItems:'center'},
  galleryEdit:{width:42,height:42,borderRadius:7,backgroundColor:'#F4F6F9',alignItems:'center',justifyContent:'center'},
  galleryCaptionBox:{flex:1,height:42,marginHorizontal:8,paddingHorizontal:11,borderWidth:1,borderColor:'#E2E6EC',borderRadius:7,flexDirection:'row',alignItems:'center'},
  galleryCaptionInput:{flex:1,color:'#172033',fontSize:11},
  gallerySend:{position:'relative',width:42,height:42,borderRadius:7,backgroundColor:PURPLE,alignItems:'center',justifyContent:'center'},
  gallerySendDisabled:{opacity:.4},
  sendBadge:{position:'absolute',right:-3,top:-5,minWidth:17,height:17,paddingHorizontal:4,borderRadius:9,backgroundColor:'#FFF',borderWidth:1,borderColor:PURPLE,alignItems:'center',justifyContent:'center'},
  sendBadgeText:{color:PURPLE,fontSize:9,fontWeight:'800'},
  cameraScreen:{flex:1,backgroundColor:'#0F111D'},
  previewKeyboardAvoider:{flex:1},
  cameraTop:{position:'absolute',left:0,right:0,top:0,alignItems:'flex-end',paddingRight:13},
  cameraClose:{width:38,height:38,borderRadius:19,backgroundColor:'rgba(52,67,86,.75)',alignItems:'center',justifyContent:'center'},
  cameraCloseText:{color:'#FFF',fontSize:20},
  cameraControls:{position:'absolute',left:0,right:0,bottom:0,minHeight:142,paddingTop:18,paddingHorizontal:14,backgroundColor:'#0F111D'},
  cameraButtons:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  cameraSquare:{width:43,height:43,borderRadius:7,backgroundColor:'#232938',overflow:'hidden',alignItems:'center',justifyContent:'center'},
  lastPhoto:{width:'100%',height:'100%'},
  zoomText:{color:'#FFF',fontSize:12,fontWeight:'700'},
  controlGlyph:{color:'#DCE5F2',fontSize:9,fontWeight:'700'},
  flashGlyph:{color:'#F6B800',fontSize:9,fontWeight:'800'},
  shutterOuter:{width:67,height:67,borderRadius:34,borderWidth:3,borderColor:'#FFF',alignItems:'center',justifyContent:'center'},
  shutterInner:{width:55,height:55,borderRadius:28,backgroundColor:'#FFF'},
  videoShutter:{width:49,height:49,backgroundColor:'#EF4444'},
  recordingOuter:{borderColor:'#EF4444'},
  recordingShutter:{width:25,height:25,borderRadius:5},
  modeTabs:{height:42,marginTop:8,flexDirection:'row',gap:12,alignItems:'center',justifyContent:'center'},
  modePill:{paddingHorizontal:12,paddingVertical:6,borderRadius:5,backgroundColor:'#1D2939'},
  modeText:{color:'#D9E1EC',fontSize:11},
  modeTextActive:{color:'#FFF',fontWeight:'700'},
  previewScreen:{flex:1,backgroundColor:'#D7D1C6'},
  previewSafeArea:{backgroundColor:'#FFF'},
  previewToolbar:{height:56,paddingHorizontal:12,backgroundColor:'rgba(104,116,119,.82)',flexDirection:'row',alignItems:'center'},
  toolbarActions:{flex:1,marginLeft:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  toolbarButton:{width:40,height:40,alignItems:'center',justifyContent:'center'},
  toolInactive:{opacity:.5},
  previewHeader:{minHeight:70,paddingHorizontal:10,flexDirection:'row',alignItems:'center'},
  previewClose:{width:40,height:40,alignItems:'center',justifyContent:'center'},
  previewTitle:{flex:1,color:'#FFF',fontSize:15,fontWeight:'700'},
  previewCount:{color:'#CAD4E2',fontSize:11},
  previewStage:{flex:1,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  previewMedia:{width:'100%',height:'100%'},
  editBusy:{position:'absolute',left:0,top:0,right:0,bottom:0,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(0,0,0,.25)'},
  undoButton:{position:'absolute',left:14,top:14,height:36,paddingHorizontal:14,borderRadius:18,backgroundColor:'rgba(20,24,32,.72)',alignItems:'center',justifyContent:'center'},
  undoText:{color:'#FFF',fontSize:13,fontWeight:'600'},
  zoomControls:{position:'absolute',right:14,bottom:14,flexDirection:'row',alignItems:'center',gap:10,padding:5,borderRadius:22,backgroundColor:'rgba(20,24,32,.72)'},
  zoomButton:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.18)'},
  zoomButtonText:{color:'#FFF',fontSize:22,fontWeight:'500',lineHeight:26},
  zoomLevel:{minWidth:42,textAlign:'center',color:'#FFF',fontSize:12,fontWeight:'600'},
  previewSelectionRow:{height:67,paddingHorizontal:8,backgroundColor:'rgba(93,93,79,.26)',flexDirection:'row',alignItems:'center'},
  previewStrip:{height:61,paddingHorizontal:7,gap:5,alignItems:'center'},
  previewThumbContainer:{position:'relative',width:52,height:52},
  previewThumbWrap:{position:'relative',width:52,height:52,padding:2,borderRadius:5},
  previewThumbActive:{borderWidth:2,borderColor:'#F59E0B'},
  previewThumb:{width:'100%',height:'100%',borderRadius:4},
  videoThumb:{backgroundColor:'#394150',alignItems:'center',justifyContent:'center'},
  previewNumber:{position:'absolute',left:1,top:1,width:15,height:15,borderRadius:4,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},
  previewNumberText:{color:PURPLE,fontSize:8,fontWeight:'800'},
  addMoreButton:{width:40,height:40,borderRadius:8,alignItems:'center',justifyContent:'center'},
  deleteOverlay:{position:'absolute',top:6,right:6,width:40,height:40,borderRadius:6,backgroundColor:'rgba(11,18,32,.42)',alignItems:'center',justifyContent:'center'},
  captionBar:{paddingHorizontal:10,paddingTop:8,backgroundColor:'rgba(76,75,66,.38)'},
  captionRow:{flexDirection:'row',alignItems:'center'},
  captionInput:{flex:1,height:44,paddingHorizontal:13,paddingVertical:0,borderWidth:1,borderColor:'#E1E5EA',borderRadius:9,backgroundColor:'#FFF',color:'#172033',fontSize:14,textAlignVertical:'center'},
  sendButton:{width:44,height:44,marginLeft:8,borderRadius:9,backgroundColor:PURPLE,alignItems:'center',justifyContent:'center'},
  sendArrow:{color:'#FFF',fontSize:11,fontWeight:'700'},
  progressArea:{marginBottom:10},
  progressCopy:{marginBottom:5,flexDirection:'row',justifyContent:'space-between'},
  progressLabel:{color:'#E3EAF4',fontSize:10,fontWeight:'600'},
  progressPercent:{color:'#E3EAF4',fontSize:10,fontWeight:'700'},
  progressTrack:{height:4,borderRadius:2,overflow:'hidden',backgroundColor:'#334155'},
  progressFill:{height:'100%',borderRadius:2,backgroundColor:PURPLE},
  sharingLabel:{marginTop:6,color:'#FFF',fontSize:8},
  recipientPill:{alignSelf:'flex-start',marginTop:3,paddingHorizontal:8,paddingVertical:4,borderRadius:8,backgroundColor:'rgba(17,24,39,.8)'},
  recipientText:{color:'#FFF',fontSize:8,fontWeight:'600'},
}, {keep: ['selectionCircle', 'selectionCircleSelected', 'shutterOuter', 'shutterInner']});
