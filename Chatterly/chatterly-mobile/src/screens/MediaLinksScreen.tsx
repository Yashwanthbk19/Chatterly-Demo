import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {Snackbar} from '../components/Snackbar';
import {
  DEFAULT_AUTO_DOWNLOAD_SETTINGS,
  DEFAULT_DATA_USAGE_SETTINGS,
  getAutoDownloadSettings,
  getDataUsageSettings,
  loadStoredAutoDownloadSettings,
  loadStoredDataUsageSettings,
  updateAutoDownloadSettings,
  updateDataUsageSettings,
  type AutoDownloadSettings,
  type DataUsageSettings,
  type DownloadMediaType,
  type DownloadNetwork,
  type MediaUploadQuality,
} from '../services/mediaPreferencesApi';
import {clearTemporaryMediaCache, formatStorage, getDeviceStorageStatistics, type DeviceStorageStatistics} from '../services/mediaStorage';
import {createThemedStyles, themeInk} from '../theme/themedStyles';
import {useDataUsage} from '../hooks/useDataUsage';
import {resetDataUsage, type DataUsage, type UsageBytes} from '../services/dataUsage';
import * as MediaLibrary from 'expo-media-library/legacy';
import {clearDownloadedMedia, useAutoDownloadSnapshot, type DownloadedMediaSummary} from '../services/autoDownload';

const FONT = Platform.select({android: 'sans-serif', ios: 'System'});
const EMPTY_DEVICE_STORAGE: DeviceStorageStatistics = {capacity: 0, free: 0, used: 0, cache: 0};
const QUALITIES: MediaUploadQuality[] = ['low', 'medium', 'high'];
const MEDIA_TYPES: {key: DownloadMediaType; label: string}[] = [
  {key: 'photos', label: 'Photos'},
  {key: 'videos', label: 'Videos'},
  {key: 'audio', label: 'Audio'},
  {key: 'documents', label: 'Documents'},
];

function selectedMediaLabel(settings: Record<DownloadMediaType, boolean>): string {
  const selected = MEDIA_TYPES.filter(media => settings[media.key]).map(media => media.label);
  return selected.length ? selected.join(', ') : 'No media selected';
}

function BackIcon() { return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M15 6 9 12l6 6" stroke={themeInk('#0B1220')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function DataIcon() { return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={8} stroke={themeInk('#263448')} strokeWidth={1.5}/><Path d="M12 7v5l4 2M7.5 5.5 5.8 3.8" stroke={themeInk('#263448')} strokeWidth={1.5} strokeLinecap="round"/></Svg>; }
function UploadIcon() { return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="M12 16V5m0 0L8 9m4-4 4 4M5 16v3h14v-3" stroke={themeInk('#263448')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function DownloadIcon() { return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="M12 5v11m0 0-4-4m4 4 4-4M5 19h14" stroke={themeInk('#263448')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function TrashIcon({large = false}: {large?: boolean}) { const color = large ? '#EF4444' : themeInk('#263448'); return <Svg width={large ? 25 : 22} height={large ? 25 : 22} viewBox="0 0 24 24" fill="none"><Path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function PhoneIcon() { return <Svg width={19} height={19} viewBox="0 0 24 24" fill="none"><Path d="M7 4 4.5 6.5c.7 6.6 6.4 12.3 13 13L20 17l-4-2-1.5 2c-3.5-1.3-6.2-4-7.5-7.5L9 8 7 4Z" stroke={themeInk('#526177')} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function MediaIcon() { return <Svg width={19} height={19} viewBox="0 0 24 24" fill="none"><Rect x={4} y={5} width={16} height={14} rx={2} stroke={themeInk('#526177')} strokeWidth={1.4}/><Circle cx={9} cy={10} r={1.3} stroke={themeInk('#526177')} strokeWidth={1.2}/><Path d="m5 17 4-4 3 3 2-2 5 4" stroke={themeInk('#526177')} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function MessageIcon() { return <Svg width={19} height={19} viewBox="0 0 24 24" fill="none"><Path d="M5 5h14v11H9l-4 3V5Z" stroke={themeInk('#526177')} strokeWidth={1.4} strokeLinejoin="round"/></Svg>; }
function CloseIcon() { return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="m6 6 12 12M18 6 6 18" stroke={themeInk('#344054')} strokeWidth={1.6} strokeLinecap="round"/></Svg>; }

function Header({title, onBack, backLabel}: {title: string; onBack: () => void; backLabel: string}) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.header, {paddingTop: insets.top, height: insets.top + 48}]}><Pressable accessibilityLabel={backLabel} accessibilityRole="button" hitSlop={12} onPress={onBack} style={styles.back}><BackIcon/></Pressable><Text style={styles.headerTitle}>{title}</Text></View>;
}

function SettingRow({icon, title, subtitle, trailing, onPress}: {icon: React.ReactNode; title: string; subtitle: string; trailing?: React.ReactNode; onPress?: () => void}) {
  return <Pressable accessibilityLabel={title} accessibilityRole="button" disabled={!onPress} onPress={onPress} style={({pressed}) => [styles.row, pressed && styles.rowPressed]}><View style={styles.rowIcon}>{icon}</View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View>{trailing}</Pressable>;
}

function QualitySheet({visible, selected, saving, onSelect, onClose}: {visible: boolean; selected: MediaUploadQuality; saving: boolean; onSelect: (quality: MediaUploadQuality) => void; onClose: () => void}) {
  const insets = useSafeAreaInsets();
  return <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}><Pressable accessibilityLabel="Close upload quality options" onPress={onClose} style={styles.modalScrim}/><View accessibilityLabel="Media Upload quality options" style={[styles.bottomSheet, {paddingBottom: Math.max(insets.bottom, 14)}]}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Media Upload quality</Text><Pressable accessibilityLabel="Close" hitSlop={10} onPress={onClose}><CloseIcon/></Pressable></View>{QUALITIES.map(quality => { const active = quality === selected; return <Pressable accessibilityLabel={quality[0].toUpperCase() + quality.slice(1)} accessibilityRole="radio" accessibilityState={{checked: active, disabled: saving}} disabled={saving} key={quality} onPress={() => onSelect(quality)} style={styles.qualityRow}><View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot}/> : null}</View><Text style={styles.qualityLabel}>{quality[0].toUpperCase() + quality.slice(1)}</Text></Pressable>; })}</View></Modal>;
}

function Toggle({label, value, disabled, onPress}: {label: string; value: boolean; disabled?: boolean; onPress: () => void}) {
  return <Pressable accessibilityLabel={label} accessibilityRole="switch" accessibilityState={{checked: value, disabled}} disabled={disabled} onPress={onPress} style={[styles.toggle, value && styles.toggleOn]}><View style={[styles.toggleKnob, value && styles.toggleKnobOn]}/></Pressable>;
}

function AutoDownloadScreen({settings, saving, onChange, onBack, sectionTitle}: {settings: AutoDownloadSettings; saving: boolean; onChange: (settings: AutoDownloadSettings) => void; onBack: () => void; sectionTitle: string}) {
  const insets = useSafeAreaInsets();
  const toggleMedia = (network: DownloadNetwork, media: DownloadMediaType) => onChange({...settings, [network]: {...settings[network], [media]: !settings[network][media]}});
  return <View accessibilityLabel="Media Auto-Download options" style={styles.root}>
    <Header backLabel={`Back to ${sectionTitle}`} onBack={onBack} title="Media Auto-Download"/>
    <ScrollView contentContainerStyle={[styles.autoContent, {paddingBottom: insets.bottom + 24}]}>
      {(['mobileData', 'wifi', 'roaming'] as DownloadNetwork[]).map(network => <View key={network} style={styles.networkSection}>
        <Text style={styles.networkTitle}>{network === 'mobileData' ? 'When using mobile data' : network === 'wifi' ? 'When connected on Wi-Fi' : 'When roaming'}</Text>
        <Text style={styles.networkDescription}>Choose which media types download automatically on this connection.</Text>
        {MEDIA_TYPES.map(media => <View key={media.key} style={styles.autoRow}>
          <View style={styles.autoCopy}><Text style={styles.autoLabel}>{media.label}</Text><Text style={styles.autoHint}>Automatically download {media.key === 'audio' ? 'audio files' : media.key} you receive.</Text></View>
          <Toggle disabled={saving} label={`${media.label} ${network === 'mobileData' ? 'on mobile data' : network === 'wifi' ? 'on Wi-Fi' : 'while roaming'}`} onPress={() => toggleMedia(network, media.key)} value={settings[network][media.key]}/>
        </View>)}
      </View>)}
      <View style={styles.networkSection}><Text style={styles.networkTitle}>Save to device gallery</Text><Text style={styles.networkDescription}>Keep downloaded photos and videos in the device gallery as well as Chatterly.</Text><View style={styles.autoRow}><View style={styles.autoCopy}><Text style={styles.autoLabel}>Photos and videos</Text><Text style={styles.autoHint}>Requires photo and video saving permission.</Text></View><Toggle disabled={saving} label="Save downloaded photos and videos to device gallery" onPress={() => onChange({...settings, saveToGallery: !settings.saveToGallery})} value={settings.saveToGallery}/></View></View>
    </ScrollView>
  </View>;
}

function ClearCacheDialog({visible, clearing, cacheSize, title = 'Clear Cache?', description, confirmLabel = 'Clear Cache', onCancel, onConfirm}: {visible: boolean; clearing: boolean; cacheSize: number; title?: string; description?: string; confirmLabel?: string; onCancel: () => void; onConfirm: () => void}) {
  return <Modal animationType="fade" onRequestClose={onCancel} statusBarTranslucent transparent visible={visible}><View style={styles.dialogScrim}><View accessibilityLabel="Clear cache confirmation" accessibilityRole="alert" style={styles.dialog}><View style={styles.trashCircle}><TrashIcon large/></View><Text style={styles.dialogTitle}>{title}</Text><Text style={styles.dialogText}>{description || `Clearing the cache will remove ${cacheSize ? `${formatStorage(cacheSize)} of ` : ''}temporary files stored by Chatterly. Your chats and account data will not be deleted.`}</Text><Pressable accessibilityLabel={`Confirm ${confirmLabel}`} disabled={clearing} onPress={onConfirm} style={styles.clearConfirm}>{clearing ? <ActivityIndicator color="#EF4444" size="small"/> : <Text style={styles.clearConfirmText}>{confirmLabel}</Text>}</Pressable><Pressable accessibilityLabel="Cancel" disabled={clearing} onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable></View></View></Modal>;
}

function UsageRow({icon, label, usage}: {icon: React.ReactNode; label: string; usage: UsageBytes}) {
  const total = usage.sent + usage.received;
  return <View style={styles.usageRow}><View style={styles.usageHeading}>{icon}<Text style={styles.usageLabel}>{label}</Text><View style={styles.usageAmounts}><Text style={styles.down}>↓</Text><Text accessibilityLabel={`${label} received`} style={styles.amount}> {formatStorage(usage.received)}</Text><Text style={styles.up}>↑</Text><Text accessibilityLabel={`${label} sent`} style={styles.amount}> {formatStorage(usage.sent)}</Text></View></View><View style={styles.usageTrack}><View style={[styles.usageFill, {width: `${total ? (usage.sent / total) * 100 : 0}%`}]}/></View><View style={styles.legend}><View style={styles.legendDot}/><Text style={styles.legendText}>Outgoing</Text><View style={[styles.legendDot, styles.incomingDot]}/><Text style={styles.legendText}>Incoming</Text></View></View>;
}

function DataUsageDetail({storage, usage, onBack, sectionTitle}: {storage: DataUsageSettings; usage: DataUsage; onBack: () => void; sectionTitle: string}) {
  const insets = useSafeAreaInsets();
  const [reset, setReset] = useState(false);
  const sent = usage.calls.sent + usage.media.sent + usage.messages.sent;
  const received = usage.calls.received + usage.media.received + usage.messages.received;
  return <View style={styles.root}><Header backLabel={`Back to ${sectionTitle}`} onBack={onBack} title="Network Usage"/><ScrollView contentContainerStyle={[styles.usageContent, {paddingBottom: insets.bottom + 82}]}><View style={styles.storageSummary}><DataIcon/><View><Text style={styles.storageLabel}>Storage Used</Text><Text style={styles.storageValue}>{formatStorage(storage.storageUsed)}</Text></View></View><View style={styles.sentReceived}><View><Text style={styles.metricLabel}>Sent</Text><Text accessibilityLabel="Data sent" style={styles.metricValue}>{formatStorage(sent)}</Text></View><View><Text style={styles.metricLabel}>Received</Text><Text accessibilityLabel="Data received" style={styles.metricValue}>{formatStorage(received)}</Text></View></View><UsageRow icon={<PhoneIcon/>} label="Calls" usage={usage.calls}/><UsageRow icon={<MediaIcon/>} label="Media" usage={usage.media}/><UsageRow icon={<MessageIcon/>} label="Messages" usage={usage.messages}/><Text style={styles.futureNote}>Usage recorded on this device since {new Date(usage.since).toLocaleDateString()}.</Text></ScrollView><View style={[styles.resetBar, {paddingBottom: Math.max(insets.bottom, 14)}]}><Pressable accessibilityLabel="Reset Statistics" onPress={() => {resetDataUsage().then(() => setReset(true)).catch(() => undefined);}} style={styles.resetButton}><Text style={styles.resetText}>Reset Statistics</Text></Pressable></View><Snackbar message={reset ? 'Usage statistics reset.' : ''} onHide={() => setReset(false)}/></View>;
}

function StorageAmount({label, bytes}: {label: string; bytes: number}) {
  return <View style={styles.storageAmountRow}><Text style={styles.storageAmountLabel}>{label}</Text><Text accessibilityLabel={`${label} storage used`} style={styles.storageAmountValue}>{formatStorage(bytes)}</Text></View>;
}

function StorageManagementDetail({storage, downloaded, onBack, onClear, onConfirmClear, sectionTitle, clearVisible, clearing, onCancelClear, notice, onHideNotice}: {storage: DeviceStorageStatistics; downloaded: DownloadedMediaSummary; onBack: () => void; onClear: () => void; onConfirmClear: () => void; sectionTitle: string; clearVisible: boolean; clearing: boolean; onCancelClear: () => void; notice: string; onHideNotice: () => void}) {
  const insets = useSafeAreaInsets();
  return <View style={styles.root}><Header backLabel={`Back to ${sectionTitle}`} onBack={onBack} title="Manage storage"/><ScrollView contentContainerStyle={[styles.usageContent, {paddingBottom: insets.bottom + 90}]}>
    <View style={styles.downloadedSummary}><Text style={styles.storageLabel}>Total media downloaded</Text><Text accessibilityLabel="Total media downloaded" style={styles.storageValue}>{formatStorage(downloaded.totalBytes)}</Text><Text style={styles.storageDescription}>{downloaded.count} items stored in Chatterly.</Text></View>
    <View style={styles.storageBreakdown}><StorageAmount label="Images" bytes={downloaded.byType.photos}/><StorageAmount label="Videos" bytes={downloaded.byType.videos}/><StorageAmount label="Audio" bytes={downloaded.byType.audio}/><StorageAmount label="Documents" bytes={downloaded.byType.documents}/></View>
    <View style={styles.storageBreakdown}><StorageAmount label="Temporary cache" bytes={storage.cache}/><StorageAmount label="App storage" bytes={storage.app ?? 0}/></View>
  </ScrollView><View style={[styles.resetBar, {paddingBottom: Math.max(insets.bottom, 14)}]}><Pressable accessibilityLabel="Clear downloaded media cache" onPress={onClear} style={styles.resetButton}><Text style={styles.resetText}>Clear downloaded media</Text></Pressable></View><ClearCacheDialog cacheSize={downloaded.totalBytes} clearing={clearing} description={`Remove ${formatStorage(downloaded.totalBytes)} of downloaded media stored by Chatterly? Copies already saved to your device gallery are kept.`} confirmLabel="Clear downloaded media" onCancel={onCancelClear} onConfirm={onConfirmClear} title="Clear downloaded media?" visible={clearVisible}/><Snackbar message={notice} onHide={onHideNotice}/></View>;
}

export function MediaLinksScreen({onBack, title = 'Media & Links'}: {onBack: () => void; title?: string}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [detailOpen, setDetailOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [dataSettings, setDataSettings] = useState<DataUsageSettings>(DEFAULT_DATA_USAGE_SETTINGS);
  const [autoSettings, setAutoSettings] = useState<AutoDownloadSettings>(DEFAULT_AUTO_DOWNLOAD_SETTINGS);
  const [deviceStorage, setDeviceStorage] = useState<DeviceStorageStatistics>(EMPTY_DEVICE_STORAGE);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearDownloadsOpen, setClearDownloadsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState('');
  const usage = useDataUsage();
  const autoDownloadState = useAutoDownloadSnapshot();
  const mounted = useRef(true);
  const dataRequest = useRef(0);
  const storageRequest = useRef(0);
  const syncedStorage = useRef<number | null>(null);
  const savingCurrent = useRef(saving);
  savingCurrent.current = saving;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const refreshStorage = useCallback(async () => {
    const request = ++storageRequest.current;
    const latest = await getDeviceStorageStatistics();
    if (mounted.current && request === storageRequest.current) { setDeviceStorage(latest); }
  }, []);
  const refreshDataUsage = useCallback(async () => {
    const request = ++dataRequest.current;
    const latest = await getDataUsageSettings();
    if (mounted.current && request === dataRequest.current) { setDataSettings(latest); }
    return latest;
  }, []);
  useEffect(() => {
    let active = true;
    const initialDataRequest = ++dataRequest.current;
    const initialStorageRequest = ++storageRequest.current;
    (async () => {
      const [storedData, storedAuto, device] = await Promise.allSettled([
        loadStoredDataUsageSettings(),
        loadStoredAutoDownloadSettings(),
        getDeviceStorageStatistics(),
      ]);
      if (!active) { return; }
      if (storedData.status === 'fulfilled' && initialDataRequest === dataRequest.current) { setDataSettings(storedData.value); }
      if (storedAuto.status === 'fulfilled') { setAutoSettings(storedAuto.value); }
      if (device.status === 'fulfilled' && initialStorageRequest === storageRequest.current) { setDeviceStorage(device.value); }

      // Cached values make the screen useful offline. Fetching after them
      // guarantees that an older AsyncStorage read cannot replace fresh data.
      const request = ++dataRequest.current;
      const [latestData, latestAuto] = await Promise.allSettled([
        getDataUsageSettings(),
        getAutoDownloadSettings(),
      ]);
      if (!active) { return; }
      if (latestData.status === 'fulfilled' && request === dataRequest.current) { setDataSettings(latestData.value); }
      if (latestAuto.status === 'fulfilled') { setAutoSettings(latestAuto.value); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!detailOpen) { return; }
    refreshDataUsage().catch(() => undefined);
    refreshStorage().catch(() => undefined);
  }, [detailOpen, refreshDataUsage, refreshStorage]);

  useEffect(() => {
    let currentState = AppState.currentState;
    const refresh = () => {
      if (!savingCurrent.current) { refreshDataUsage().catch(() => undefined); }
      refreshStorage().catch(() => undefined);
    };
    const subscription = AppState.addEventListener('change', state => {
      currentState = state;
      if (state === 'active') { refresh(); }
    });
    const timer = setInterval(() => { if (currentState === 'active') { refresh(); } }, 15000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [refreshDataUsage, refreshStorage]);

  useEffect(() => {
    // Progress events can be frequent; scan storage once transfers settle.
    const timer = setTimeout(() => { refreshStorage().catch(() => undefined); }, 500);
    return () => clearTimeout(timer);
  }, [usage, refreshStorage]);

  useEffect(() => {
    if (saving || deviceStorage.app === undefined || deviceStorage.app === syncedStorage.current) { return; }
    const measured = deviceStorage.app;
    syncedStorage.current = measured;
    updateDataUsageSettings({storageUsed: measured}).catch(() => {
      if (syncedStorage.current === measured) { syncedStorage.current = null; }
    });
  }, [deviceStorage, saving]);

  const backToMediaLinks = () => {
    setDetailOpen(false); setStorageOpen(false); setAutoOpen(false);
    refreshDataUsage().catch(() => undefined);
    refreshStorage().catch(() => undefined);
  };

  const saveQuality = async (quality: MediaUploadQuality) => {
    dataRequest.current += 1;
    const before = dataSettings; setDataSettings({...before, mediaUploadQuality: quality}); setSaving(true);
    try { setDataSettings(await updateDataUsageSettings({mediaUploadQuality: quality})); setQualityOpen(false); }
    catch { setNotice('Upload quality was saved on this device and will sync when you reconnect.'); setQualityOpen(false); }
    finally { setSaving(false); }
  };
  const saveAuto = async (next: AutoDownloadSettings) => {
    if (next.saveToGallery && !autoSettings.saveToGallery) {
      try {
        const permission = await MediaLibrary.requestPermissionsAsync(true, []);
        if (!permission.granted) { setNotice('Allow photo and video saving to enable device gallery copies.'); return; }
      } catch { setNotice('Unable to check device gallery permission.'); return; }
    }
    setAutoSettings(next); setSaving(true);
    try { setAutoSettings(await updateAutoDownloadSettings(next)); }
    catch { setNotice('Auto-download settings were saved on this device and will sync when you reconnect.'); }
    finally { setSaving(false); }
  };
  const clearCache = async () => {
    dataRequest.current += 1;
    setClearing(true);
    try {
      await clearTemporaryMediaCache();
      const clearedAt = new Date().toISOString();
      setDataSettings(current => ({...current, cacheClearedAt: clearedAt}));
      try { setDataSettings(await updateDataUsageSettings({cacheClearedAt: clearedAt})); } catch { /* Local clear already succeeded. */ }
      await refreshStorage(); setClearOpen(false); setNotice('Cache cleared successfully.');
    } catch { setNotice('Unable to clear the cache. Please try again.'); }
    finally { setClearing(false); }
  };
  const clearDownloadedCache = async () => {
    setClearing(true);
    try {
      await clearDownloadedMedia();
      await refreshStorage();
      setClearDownloadsOpen(false);
      setNotice('Downloaded media cleared from Chatterly.');
    } catch { setNotice('Unable to clear downloaded media. Please try again.'); }
    finally { setClearing(false); }
  };

  const appStorage = deviceStorage.app ?? Math.max(dataSettings.storageUsed, deviceStorage.cache);
  const otherStorage = Math.max(0, deviceStorage.used - appStorage);
  const denominator = deviceStorage.capacity || Math.max(deviceStorage.used, appStorage, 1);
  const appPercent = `${Math.min(100, (appStorage / denominator) * 100)}%` as const;
  const otherPercent = `${Math.min(100, (otherStorage / denominator) * 100)}%` as const;
  const qualityLabel = useMemo(() => dataSettings.mediaUploadQuality[0].toUpperCase() + dataSettings.mediaUploadQuality.slice(1), [dataSettings.mediaUploadQuality]);
  if (detailOpen) { return <DataUsageDetail onBack={backToMediaLinks} sectionTitle={title} storage={{...dataSettings, storageUsed: deviceStorage.app ?? dataSettings.storageUsed}} usage={usage}/>; }
  if (storageOpen) { return <StorageManagementDetail onBack={backToMediaLinks} onClear={() => setClearDownloadsOpen(true)} onConfirmClear={clearDownloadedCache} onCancelClear={() => setClearDownloadsOpen(false)} clearVisible={clearDownloadsOpen} clearing={clearing} storage={deviceStorage} downloaded={autoDownloadState.downloadedMedia} sectionTitle={title} notice={notice} onHideNotice={() => setNotice('')}/>; }
  if (autoOpen) { return <AutoDownloadScreen onBack={backToMediaLinks} onChange={saveAuto} saving={saving} settings={autoSettings} sectionTitle={title}/>; }

  return <View style={styles.root}>
    <Header backLabel="Back to settings" onBack={onBack} title={title}/>
    <ScrollView contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + 24}]}>
      <View style={styles.rows}>
        <SettingRow icon={<DataIcon/>} onPress={() => setDetailOpen(true)} subtitle={`${formatStorage(usage.calls.sent + usage.media.sent + usage.messages.sent)} Sent  ·  ${formatStorage(usage.calls.received + usage.media.received + usage.messages.received)} Received`} title="Network Usage"/>
        <SettingRow icon={<DataIcon/>} onPress={() => setStorageOpen(true)} subtitle={`${autoDownloadState.downloadedMedia.count} downloaded media items · ${formatStorage(autoDownloadState.downloadedMedia.totalBytes)}`} title="Manage storage"/>
        <SettingRow icon={<UploadIcon/>} onPress={() => setQualityOpen(true)} subtitle="Vibrate when you receive a new message." title="Media Upload quality" trailing={<View style={styles.valuePill}><Text style={styles.valuePillText}>{qualityLabel}</Text></View>}/>
        <SettingRow icon={<DownloadIcon/>} onPress={() => setAutoOpen(true)} subtitle="Control when photos, videos, audio, and other media download automatically." title="Media Auto-Download"/>
        <SettingRow icon={<DownloadIcon/>} onPress={() => setAutoOpen(true)} subtitle={selectedMediaLabel(autoSettings.mobileData)} title="Mobile Data"/>
        <SettingRow icon={<DownloadIcon/>} onPress={() => setAutoOpen(true)} subtitle={selectedMediaLabel(autoSettings.wifi)} title="Wi-Fi"/>
        <SettingRow icon={<TrashIcon/>} onPress={() => setClearOpen(true)} subtitle="Remove temporary files to free up space." title="Clear Cache" trailing={<View style={styles.clearPill}><Text style={styles.clearPillText}>Clear</Text></View>}/>
      </View>
      <View style={styles.storageBlock}>
        <View style={styles.storageTitleLine}><Text style={styles.storageBlockTitle}>Storage Used</Text><Text style={styles.storageNumbers}>{formatStorage(deviceStorage.used)} <Text style={styles.storageCapacity}>/ {deviceStorage.capacity ? formatStorage(deviceStorage.capacity) : 'Device'}</Text></Text></View>
        <Text style={styles.storageDescription}>Total storage used on this device.</Text>
        <View style={styles.storageTrack}><View style={[styles.appStorage, {width: appPercent}]}/><View style={[styles.otherStorage, {width: otherPercent}]}/></View>
        <View style={styles.storageLegend}><View style={styles.legendItem}><View style={[styles.storageDot, styles.appDot]}/><Text style={styles.storageLegendText}>Chatterly ({formatStorage(appStorage)})</Text></View><View style={styles.legendItem}><View style={[styles.storageDot, styles.otherDot]}/><Text style={styles.storageLegendText}>Other Apps ({formatStorage(otherStorage)})</Text></View></View>
      </View>
    </ScrollView>
    <QualitySheet onClose={() => setQualityOpen(false)} onSelect={saveQuality} saving={saving} selected={dataSettings.mediaUploadQuality} visible={qualityOpen}/>
    <ClearCacheDialog cacheSize={deviceStorage.cache} clearing={clearing} onCancel={() => setClearOpen(false)} onConfirm={clearCache} visible={clearOpen}/>
    <Snackbar message={notice} onHide={() => setNotice('')}/>
  </View>;
}

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#FFFFFF'}, header: {paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEF0F4'}, back: {width: 28, height: 44, justifyContent: 'center'}, headerTitle: {fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#121826'}, content: {paddingHorizontal: 16}, rows: {paddingTop: 8}, row: {minHeight: 72, paddingHorizontal: 4, borderRadius: 7, flexDirection: 'row', alignItems: 'center'}, rowPressed: {backgroundColor: '#F7F8FA'}, rowIcon: {width: 31, alignItems: 'flex-start'}, rowCopy: {flex: 1, paddingRight: 8}, rowTitle: {fontFamily: FONT, fontSize: 12, fontWeight: '600', color: '#172033'}, rowSubtitle: {fontFamily: FONT, fontSize: 9, lineHeight: 13, color: '#758196', marginTop: 4}, valuePill: {height: 23, minWidth: 48, paddingHorizontal: 9, borderRadius: 5, backgroundColor: '#F1EBFF', alignItems: 'center', justifyContent: 'center'}, valuePillText: {fontFamily: FONT, fontSize: 9, color: '#7137DD', fontWeight: '600'}, clearPill: {height: 30, paddingHorizontal: 13, borderRadius: 5, backgroundColor: '#F1EBFF', alignItems: 'center', justifyContent: 'center'}, clearPillText: {fontFamily: FONT, fontSize: 9, color: '#7137DD', fontWeight: '600'},
  storageBlock: {marginTop: 12, paddingHorizontal: 4}, storageTitleLine: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}, storageBlockTitle: {fontFamily: FONT, fontSize: 11, fontWeight: '600', color: '#172033'}, storageNumbers: {fontFamily: FONT, fontSize: 10, fontWeight: '600', color: '#172033'}, storageCapacity: {fontWeight: '400', color: '#758196'}, storageDescription: {fontFamily: FONT, fontSize: 9, color: '#758196', marginTop: 5}, storageTrack: {height: 8, marginTop: 18, flexDirection: 'row', borderRadius: 5, overflow: 'hidden', backgroundColor: '#EEF1F5'}, appStorage: {height: 8, minWidth: 2, backgroundColor: '#8B5CF6'}, otherStorage: {height: 8, backgroundColor: '#F59E0B'}, storageLegend: {marginTop: 14, flexDirection: 'row', justifyContent: 'space-between'}, legendItem: {flexDirection: 'row', alignItems: 'center'}, storageDot: {width: 5, height: 5, borderRadius: 3, marginRight: 5}, appDot: {backgroundColor: '#8B5CF6'}, otherDot: {backgroundColor: '#F59E0B'}, storageLegendText: {fontFamily: FONT, fontSize: 8, color: '#526177'},
  modalScrim: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,18,32,.42)'}, bottomSheet: {position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#FFF'}, sheetHeader: {height: 38, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between'}, sheetTitle: {fontFamily: FONT, fontSize: 13, fontWeight: '600', color: '#172033'}, qualityRow: {height: 56, flexDirection: 'row', alignItems: 'center', gap: 12}, radio: {width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center'}, radioActive: {borderColor: '#8B5CF6', backgroundColor: '#8B5CF6'}, radioDot: {width: 5, height: 5, borderRadius: 3, backgroundColor: '#FFF'}, qualityLabel: {fontFamily: FONT, fontSize: 12, color: '#172033'}, autoContent: {paddingHorizontal: 24, paddingTop: 18}, networkSection: {marginBottom: 18}, networkTitle: {fontFamily: FONT, fontSize: 12, fontWeight: '600', color: '#172033'}, networkDescription: {fontFamily: FONT, fontSize: 9, lineHeight: 13, color: '#758196', marginTop: 8, marginBottom: 8, maxWidth: 275}, autoRow: {minHeight: 67, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, autoCopy: {flex: 1, paddingRight: 16}, autoLabel: {fontFamily: FONT, fontSize: 11, fontWeight: '500', color: '#172033'}, autoHint: {fontFamily: FONT, fontSize: 8, lineHeight: 12, color: '#758196', marginTop: 5}, toggle: {width: 39, height: 22, borderRadius: 3, padding: 2, borderWidth: 1, borderColor: '#8B5CF6', backgroundColor: '#FFFFFF'}, toggleOn: {backgroundColor: '#8B5CF6'}, toggleKnob: {width: 16, height: 16, borderRadius: 1, backgroundColor: '#8B5CF6'}, toggleKnobOn: {marginLeft: 17, backgroundColor: '#FFF'},
  dialogScrim: {flex: 1, backgroundColor: 'rgba(11,18,32,.43)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32}, dialog: {width: '100%', maxWidth: 340, borderRadius: 13, backgroundColor: '#FFF', paddingHorizontal: 22, paddingTop: 25, paddingBottom: 15, alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: .18, shadowRadius: 16}, trashCircle: {width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF0F1', alignItems: 'center', justifyContent: 'center'}, dialogTitle: {fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#172033', marginTop: 16}, dialogText: {fontFamily: FONT, fontSize: 9, lineHeight: 14, color: '#758196', textAlign: 'center', marginTop: 10}, clearConfirm: {height: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 12}, clearConfirmText: {fontFamily: FONT, fontSize: 11, color: '#EF4444', fontWeight: '600'}, cancelButton: {height: 38, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center'}, cancelText: {fontFamily: FONT, fontSize: 11, color: '#172033', fontWeight: '500'},
  usageContent: {paddingHorizontal: 20, paddingTop: 18}, storageBreakdown: {marginTop: 20, paddingVertical: 5, borderTopWidth: 1, borderColor: "#EEF0F4"}, storageAmountRow: {minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between"}, storageAmountLabel: {fontFamily: FONT, fontSize: 11, color: "#526177"}, storageAmountValue: {fontFamily: FONT, fontSize: 11, fontWeight: "600", color: "#172033"}, downloadedSummary: {paddingBottom: 16, borderBottomWidth: 1, borderColor: "#EEF0F4"}, storageSummary: {flexDirection: 'row', gap: 14, alignItems: 'flex-start'}, storageLabel: {fontFamily: FONT, fontSize: 10, color: '#526177'}, storageValue: {fontFamily: FONT, fontSize: 15, fontWeight: '700', color: '#172033', marginTop: 6}, sentReceived: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 25, paddingHorizontal: 34}, metricLabel: {fontFamily: FONT, fontSize: 9, color: '#758196'}, metricValue: {fontFamily: FONT, fontSize: 11, fontWeight: '600', color: '#172033', marginTop: 7}, usageRow: {marginTop: 29}, usageHeading: {height: 25, flexDirection: 'row', alignItems: 'center'}, usageLabel: {fontFamily: FONT, fontSize: 11, fontWeight: '600', color: '#172033', marginLeft: 12}, usageAmounts: {marginLeft: 'auto', flexDirection: 'row', alignItems: 'center'}, amount: {fontFamily: FONT, fontSize: 8, color: '#758196', marginRight: 10}, down: {fontSize: 10, color: '#64748B'}, up: {fontSize: 10, color: '#64748B'}, usageTrack: {height: 7, borderRadius: 4, marginLeft: 31, marginTop: 9, backgroundColor: '#EEF1F5', overflow: 'hidden'}, usageFill: {width: 2, height: 7, backgroundColor: '#8B5CF6'}, legend: {marginLeft: 31, marginTop: 11, flexDirection: 'row', alignItems: 'center'}, legendDot: {width: 4, height: 4, borderRadius: 2, backgroundColor: '#8B5CF6'}, incomingDot: {marginLeft: 16, backgroundColor: '#CBD5E1'}, legendText: {fontFamily: FONT, fontSize: 7, color: '#758196', marginLeft: 4}, futureNote: {fontFamily: FONT, fontSize: 8, color: '#98A2B3', textAlign: 'center', marginTop: 32}, resetBar: {position: 'absolute', left: 20, right: 20, bottom: 0, paddingTop: 10, backgroundColor: '#FFF'}, resetButton: {height: 42, borderRadius: 5, backgroundColor: '#F1EBFF', alignItems: 'center', justifyContent: 'center'}, resetText: {fontFamily: FONT, fontSize: 10, fontWeight: '600', color: '#7137DD'},
});
