import {BlockedContactsScreen} from './BlockedContactsScreen';
import {refreshBlockedContacts, useBlockedContacts} from '../services/blockStore';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import {File, Paths} from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {SearchIcon} from '../components/ContactsIcons';
import {OtpCodeInput} from '../components/OtpCodeInput';
import {SecurityCodeSheet, type SecurityCodeStatus} from '../components/SecurityCodeSheet';
import {Snackbar} from '../components/Snackbar';
import {COUNTRIES, DEFAULT_COUNTRY} from '../constants/countries';
import {RESEND_COOLDOWN_SECONDS} from '../constants/otp';
import {getChatList, normalizeChatList} from '../services/chatApi';
import {DISAPPEARING_TIMER_OPTIONS, timerLabel} from '../services/disappearingMessages';
import {resendEmailOtp, sendEmailOtp, verifyEmailOtp} from '../services/authApi';
import {formatSecurityCode} from '../utils/securityCode';
import {formatResendCountdown, isCompleteOtp, OTP_ERROR_MESSAGES, resolveOtpError} from '../utils/otpValidation';
import {validateRegistration} from '../utils/registrationValidation';
import type {ChatListItem, ConversationContact} from '../types/chat';
import type {OtpErrorKind} from '../types/otp';
import {
  type DisappearingMessageDuration,
  type EncryptionDetails,
  type TrustedDevice,
  disableTwoFactor,
  enableTwoFactor,
  enableTwoFactorSetup,
  getEncryptionDetails,
  getEncryptionInfo,
  getPrivacySettings,
  getTrustedDevices,
  registerTrustedDevice,
  removeTrustedDevice,
  getSecurityCode,
  setupAuthenticator,
  updateDisappearingMessages,
  verifyAuthenticator,
} from '../services/privacyApi';
import {confirmPhoneCode, startPhoneVerification, type PhoneVerification} from '../services/firebaseAuth';
import {getRegisteredUser} from '../services/contactsApi';
import {updateProfile} from '../services/profileApi';
import {getSession, getToken, updateSessionUser} from '../services/sessionStore';
import {formatPhoneNumber, isValidPhoneLength, splitPhoneNumber, toE164} from '../utils/phoneNumber';
import type {Country} from '../types/registration';
import {getDeviceIdentity} from '../utils/deviceIdentity';
import {ReportContactScreen} from './ReportContactScreen';
import {createThemedStyles, themeInk} from '../theme/themedStyles';

type Props = {onBack: () => void; onReportSubmitted?: (message: string) => void};
type Page = 'main' | 'encryption' | 'twoFactor' | 'blocked' | 'disappearing' | 'report';
type PrivacyItemKey = 'encryption' | 'twoFactor' | 'blocked' | 'disappearing' | 'report';
const FONT = Platform.select({android: 'sans-serif', ios: 'System'});
const PURPLE = '#6F28F5';
const LOCAL_TWO_FACTOR_ENABLED_KEY = 'privacy.localTwoFactorEnabled';
const LOCAL_TWO_FACTOR_METHOD_KEY = 'privacy.twoFactorMethod';
const LOCAL_RECOVERY_CODES_KEY = 'privacy.recoveryCodes';
const LOCAL_LAST_VERIFIED_KEY = 'privacy.lastTwoFactorVerifiedAt';
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Email verification has no recovery-code response in the documented API. */
export function createLocalRecoveryCodes(count = 12): string[] {
  const bytes = Crypto.getRandomBytes(count * 8);
  return Array.from({length: count}, (_, codeIndex) => {
    const start = codeIndex * 8;
    const characters = Array.from(bytes.slice(start, start + 8), (value, characterIndex) => RECOVERY_CODE_ALPHABET[(value + codeIndex * 7 + characterIndex * 3) % RECOVERY_CODE_ALPHABET.length]);
    return `${characters.slice(0, 4).join('')}-${characters.slice(4).join('')}`;
  });
}

function BackIcon() { return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="m15 5-7 7 7 7" stroke={themeInk('#0B1220')} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function PrivacyIcon({name}: {name: PrivacyItemKey}) {
  const common = {stroke: themeInk('#0B1220'), strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  if (name === 'encryption') return <Svg width={32} height={32} viewBox="0 0 32 32" fill="none"><Path d="M12 15V11C12 9.93913 12.4214 8.92172 13.1716 8.17157C13.9217 7.42143 14.9391 7 16 7C17.0609 7 18.0783 7.42143 18.8284 8.17157C19.5786 8.92172 20 9.93913 20 11V15M9 17C9 16.4696 9.21071 15.9609 9.58579 15.5858C9.96086 15.2107 10.4696 15 11 15H21C21.5304 15 22.0391 15.2107 22.4142 15.5858C22.7893 15.9609 23 16.4696 23 17V23C23 23.5304 22.7893 24.0391 22.4142 24.4142C22.0391 24.7893 21.5304 25 21 25H11C10.4696 25 9.96086 24.7893 9.58579 24.4142C9.21071 24.0391 9 23.5304 9 23V17ZM15 20C15 20.2652 15.1054 20.5196 15.2929 20.7071C15.4804 20.8946 15.7348 21 16 21C16.2652 21 16.5196 20.8946 16.7071 20.7071C16.8946 20.5196 17 20.2652 17 20C17 19.7348 16.8946 19.4804 16.7071 19.2929C16.5196 19.1054 16.2652 19 16 19C15.7348 19 15.4804 19.1054 15.2929 19.2929C15.1054 19.4804 15 19.7348 15 20Z" {...common}/></Svg>;
  if (name === 'twoFactor') return <Svg width={32} height={32} viewBox="0 0 32 32" fill="none"><Path d="M16 25V21V21.01M14 24L18 22M14 22L18 24M9 21V25M7 24L11 22M7 22L11 24M23 21V25M21 24L25 22M21 22L25 24M11 18V10C11 9.46957 11.2107 8.96086 11.5858 8.58579C11.9609 8.21071 12.4696 8 13 8H19C19.5304 8 20.0391 8.21071 20.4142 8.58579C20.7893 8.96086 21 9.46957 21 10V18M15 9H17" {...common}/></Svg>;
  if (name === 'blocked') return <Svg width={32} height={32} viewBox="0 0 32 32" fill="none"><Path d="M9.63604 22.364C8.80031 21.5282 8.13738 20.5361 7.68508 19.4442C7.23279 18.3522 7 17.1819 7 16C7 14.8181 7.23279 13.6478 7.68508 12.5558C8.13738 11.4639 8.80031 10.4718 9.63604 9.63604C10.4718 8.80031 11.4639 8.13738 12.5558 7.68508C13.6478 7.23279 14.8181 7 16 7C17.1819 7 18.3522 7.23279 19.4442 7.68508C20.5361 8.13738 21.5282 8.80031 22.364 9.63604M9.63604 22.364C10.4718 23.1997 11.4639 23.8626 12.5558 24.3149C13.6478 24.7672 14.8181 25 16 25C17.1819 25 18.3522 24.7672 19.4442 24.3149C20.5361 23.8626 21.5282 23.1997 22.364 22.364C23.1997 21.5282 23.8626 20.5361 24.3149 19.4442C24.7672 18.3522 25 17.1819 25 16C25 14.8181 24.7672 13.6478 24.3149 12.5558C23.8626 11.4639 23.1997 10.4718 22.364 9.63604M9.63604 22.364L22.364 9.63604" {...common}/></Svg>;
  if (name === 'disappearing') return <Svg width={32} height={32} viewBox="0 0 32 32" fill="none"><Path d="M16 11V16L19 19M7 16C7 17.1819 7.23279 18.3522 7.68508 19.4442C8.13738 20.5361 8.80031 21.5282 9.63604 22.364C10.4718 23.1997 11.4639 23.8626 12.5558 24.3149C13.6478 24.7672 14.8181 25 16 25C17.1819 25 18.3522 24.7672 19.4442 24.3149C20.5361 23.8626 21.5282 23.1997 22.364 22.364C23.1997 21.5282 23.8626 20.5361 24.3149 19.4442C24.7672 18.3522 25 17.1819 25 16C25 13.6131 24.0518 11.3239 22.364 9.63604C20.6761 7.94821 18.3869 7 16 7C13.6131 7 11.3239 7.94821 9.63604 9.63604C7.94821 11.3239 7 13.6131 7 16Z" {...common}/></Svg>;
  return <Svg width={32} height={32} viewBox="0 0 32 32" fill="none"><Path d="M16 12V15M16 18V18.01M22 8C22.7956 8 23.5587 8.31607 24.1213 8.87868C24.6839 9.44129 25 10.2044 25 11V19C25 19.7956 24.6839 20.5587 24.1213 21.1213C23.5587 21.6839 22.7956 22 22 22H17L12 25V22H10C9.20435 22 8.44129 21.6839 7.87868 21.1213C7.31607 20.5587 7 19.7956 7 19V11C7 10.2044 7.31607 9.44129 7.87868 8.87868C8.44129 8.31607 9.20435 8 10 8H22Z" {...common}/></Svg>;
}

function Header({title, subtitle, onBack}: {title: string; subtitle?: string; onBack: () => void}) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.header, {paddingTop: insets.top + 6}]}><Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={12} onPress={onBack} style={styles.backButton}><BackIcon/></Pressable><View style={styles.headerHeading}><Text style={styles.headerTitle}>{title}</Text>{subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}</View><View style={styles.headerSpacer}/></View>;
}

function StatusPill({enabled, label, neutral = false}: {enabled: boolean; label?: string; neutral?: boolean}) {
  return <View style={[styles.statusPill, neutral ? styles.statusPillNeutral : enabled ? styles.statusPillEnabled : styles.statusPillDisabled]}><Text style={[styles.statusPillText, neutral ? styles.statusTextNeutral : enabled ? styles.statusTextEnabled : styles.statusTextDisabled]}>{label || (enabled ? 'Enabled' : 'Disabled')}</Text></View>;
}

function ErrorState({message, onRetry}: {message: string; onRetry: () => void}) {
  return <View style={styles.centerState}><Text style={styles.errorTitle}>Unable to load privacy settings</Text><Text style={styles.errorText}>{message}</Text><Pressable accessibilityLabel="Retry" onPress={onRetry} style={styles.primarySmall}><Text style={styles.primarySmallText}>Try Again</Text></Pressable></View>;
}

export function PrivacySecurityScreen({onBack, onReportSubmitted}: Props): React.JSX.Element {
  const [page, setPage] = useState<Page>('main');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [encryptionEnabled, setEncryptionEnabled] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabledState] = useState(false);
  const [blockedUsersCount, setBlockedUsersCount] = useState(0);
  // Blocking or unblocking anywhere in the app (a chat's menu, the Blocked Users
  // screen) updates this shared list, so once it has loaded the count on the row
  // follows it. Until then the total the server reports stands in.
  const blockedList = useBlockedContacts();
  const [blockedListLoaded, setBlockedListLoaded] = useState(false);
  const blockedTotal = blockedListLoaded && Array.isArray(blockedList) ? blockedList.length : blockedUsersCount;
  const [disappearingMessages, setDisappearingMessages] = useState<DisappearingMessageDuration>('off');
  const [saving, setSaving] = useState<PrivacyItemKey | ''>('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [settings, encryption] = await Promise.all([getPrivacySettings(), getEncryptionInfo()]);
      setEncryptionEnabled(encryption.enabled);
      setTwoFactorEnabledState(settings.twoFactorEnabled);
      await AsyncStorage.setItem(LOCAL_TWO_FACTOR_ENABLED_KEY, String(settings.twoFactorEnabled));
      setBlockedUsersCount(settings.blockedUsersCount);
      refreshBlockedContacts().then(() => setBlockedListLoaded(true)).catch(() => undefined);
      setDisappearingMessages(settings.disappearingMessages);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const enableLocalTwoFactor = useCallback(() => {
    setTwoFactorEnabledState(true);
    AsyncStorage.setItem(LOCAL_TWO_FACTOR_ENABLED_KEY, 'true').catch(() => undefined);
  }, []);

  const disableLocalTwoFactor = useCallback(() => {
    setTwoFactorEnabledState(false);
    AsyncStorage.multiRemove([LOCAL_TWO_FACTOR_ENABLED_KEY, LOCAL_TWO_FACTOR_METHOD_KEY, LOCAL_RECOVERY_CODES_KEY, LOCAL_LAST_VERIFIED_KEY]).catch(() => undefined);
    SecureStore.deleteItemAsync(LOCAL_RECOVERY_CODES_KEY).catch(() => undefined);
  }, []);

  const changeDisappearing = async (duration: DisappearingMessageDuration) => {
    if (saving) { return; }
    const previous = disappearingMessages;
    setDisappearingMessages(duration);
    setSaving('disappearing');
    try {
      await updateDisappearingMessages(duration);
      setPage('main');
      setNotice('Default Timer Updated.');
    } catch (value) {
      setDisappearingMessages(previous);
      setNotice(value instanceof Error ? value.message : 'Unable to update disappearing messages.');
    } finally { setSaving(''); }
  };

  if (page === 'encryption') return <EncryptionScreen enabled={encryptionEnabled} onBack={() => setPage('main')} onNotice={setNotice} notice={notice}/>;
  if (page === 'twoFactor') return <TwoFactorScreen enabled={twoFactorEnabled} onBack={() => setPage('main')} onComplete={() => {setPage('main'); setNotice('2FA Added Successfully');}} onDisabled={disableLocalTwoFactor} onEnabled={enableLocalTwoFactor} notice={notice} onHideNotice={() => setNotice('')}/>;
  if (page === 'blocked') return <BlockedContactsScreen onBack={() => {setPage('main'); load(true);}} onCountChange={setBlockedUsersCount}/>;
  if (page === 'disappearing') return <DisappearingMessagesScreen duration={disappearingMessages} saving={saving === 'disappearing'} onBack={() => setPage('main')} onChange={changeDisappearing} notice={notice} onHideNotice={() => setNotice('')}/>;
  if (page === 'report') return <ReportContactScreen onBack={() => setPage('main')} onSubmitted={message => {
    if (onReportSubmitted) onReportSubmitted(message);
    else { setPage('main'); setNotice(message); }
  }}/>;

  const items: Array<{key: PrivacyItemKey; title: string; subtitle: string}> = [
    {key: 'encryption', title: 'End-to-End Encryption', subtitle: 'Protect your chats and calls.'},
    {key: 'twoFactor', title: '2-Step Verification', subtitle: 'Add extra security to your account.'},
    {key: 'blocked', title: 'Blocked Users', subtitle: `Manage people you've blocked.`},
    {key: 'disappearing', title: 'Disappearing Messages', subtitle: 'Choose when new messages disappear.'},
    {key: 'report', title: 'Report a User', subtitle: 'Report spam or abusive behavior.'},
  ];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = items.filter(item => !normalizedQuery || `${item.title} ${item.subtitle}`.toLowerCase().includes(normalizedQuery));
  const renderItem = (item: typeof items[number]) => {
    const onPress = item.key === 'encryption' ? () => setPage('encryption') : item.key === 'twoFactor' ? () => setPage('twoFactor') : item.key === 'blocked' ? () => setPage('blocked') : item.key === 'disappearing' ? () => setPage('disappearing') : () => setPage('report');
    const status = item.key === 'encryption' ? <StatusPill enabled={encryptionEnabled}/>
      : item.key === 'twoFactor' ? <StatusPill enabled={twoFactorEnabled}/>
      : item.key === 'disappearing' ? <StatusPill enabled={disappearingMessages !== 'off'} label={durationStatus(disappearingMessages)} neutral={disappearingMessages === 'off'}/>
      : item.key === 'blocked' ? <StatusPill enabled={false} label={`${blockedTotal} blocked`} neutral/>
      : null;
    return <Pressable accessibilityLabel={item.title} accessibilityHint={item.key === 'blocked' && blockedTotal ? `${blockedTotal} blocked users` : undefined} accessibilityRole="button" key={item.key} onPress={onPress} style={({pressed}) => [styles.privacyRow, pressed && styles.rowPressed]}><View style={styles.mainIcon}><PrivacyIcon name={item.key}/></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowSubtitle}>{item.subtitle}</Text>{status ? <View style={styles.inlineStatus}>{status}</View> : null}</View></Pressable>;
  };

  return <View style={styles.root}><Header title="Privacy" onBack={onBack}/><View style={styles.search}><SearchIcon/><TextInput accessibilityLabel="Search Privacy" autoCapitalize="none" onChangeText={setQuery} placeholder="Search Privacy" placeholderTextColor="#8791A2" returnKeyType="search" style={styles.searchInput} value={query}/>{query ? <Pressable accessibilityLabel="Clear privacy search" hitSlop={8} onPress={() => setQuery('')}><Text style={styles.clearSearch}>×</Text></Pressable> : null}</View>
    {loading ? <View style={styles.centerState}><ActivityIndicator color={PURPLE}/></View> : error ? <ErrorState message={error} onRetry={() => load()}/> : <ScrollView contentContainerStyle={styles.mainContent} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={PURPLE}/>}>
      {visibleItems.map(renderItem)}
      {!visibleItems.length ? <View style={styles.emptySearch}><Text style={styles.emptyTitle}>No privacy settings found</Text><Text style={styles.emptyText}>Try a different search term.</Text></View> : null}
    </ScrollView>}
    {notice === '2FA Added Successfully' ? <TwoFactorSuccessToast onHide={() => setNotice('')}/> : <Snackbar message={notice} onHide={() => setNotice('')}/>}
  </View>;
}

function EncryptionScreen({enabled, onBack, notice, onNotice}: {enabled: boolean; onBack: () => void; notice: string; onNotice: (message: string) => void}) {
  const [details, setDetails] = useState<EncryptionDetails | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // A security code is derived from two people's keys, so the screen has to
  // know which conversation it is verifying before it can ask for one.
  const [contacts, setContacts] = useState<ConversationContact[]>([]);
  const [contactIndex, setContactIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<SecurityCodeStatus>('idle');
  const [codeError, setCodeError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    getEncryptionDetails()
      .then(setDetails)
      .catch(value => onNotice(value instanceof Error ? value.message : 'Unable to load encryption details.'));
  }, [onNotice]);

  useEffect(() => {
    let active = true;
    getChatList()
      .then(normalizeChatList)
      .then(items => { if (active) { setContacts(verifiableContacts(items)); } })
      .catch(() => { if (active) { setContacts([]); } });
    return () => { active = false; };
  }, []);

  const contact = contacts[contactIndex] || null;

  const loadCode = useCallback(async (target: ConversationContact | null) => {
    if (!target) {
      setCode('');
      setCodeStatus('unavailable');
      return;
    }
    setCode('');
    setCodeError('');
    setCodeStatus('loading');
    try {
      const digits = formatSecurityCode(await getSecurityCode(target.userId));
      if (!digits) { throw new Error('The security code could not be loaded. Please try again.'); }
      setCode(digits);
      setUpdatedAt(new Date());
      setCodeStatus('ready');
    } catch (value) {
      setCodeError(value instanceof Error ? value.message : '');
      setCodeStatus('error');
    }
  }, []);

  const openSecurityCode = () => {
    setCodeOpen(true);
    loadCode(contact).catch(() => undefined);
  };

  const chooseContact = (index: number) => {
    setPickerOpen(false);
    setContactIndex(index);
    loadCode(contacts[index] || null).catch(() => undefined);
  };

  const rows: Array<{key: 'securityCode' | 'details'; title: string; subtitle: string; onPress: () => void}> = [
    {
      key: 'securityCode',
      title: 'View Security Code',
      subtitle: 'Verify that your conversation is secure by comparing security codes with your contact.',
      onPress: openSecurityCode,
    },
    {
      key: 'details',
      title: 'Encryption Details',
      subtitle: 'See the algorithm and key exchange protecting your messages, calls, media and files.',
      onPress: () => setDetailsOpen(open => !open),
    },
  ];

  const indicators = details ? ([
    ['Messages', details.messagesEncrypted], ['Calls', details.callsEncrypted],
    ['Media', details.mediaEncrypted], ['Files', details.filesEncrypted],
  ] as const) : [];

  return <View style={styles.root}>
    <Header title="End to End Encryption" subtitle={enabled ? 'Enabled by default' : 'Unavailable'} onBack={onBack}/>
    <ScrollView contentContainerStyle={styles.mainContent}>
      {rows.map(row => <Pressable accessibilityLabel={row.title} accessibilityRole="button" key={row.key} onPress={row.onPress} style={({pressed}) => [styles.privacyRow, pressed && styles.rowPressed]}>
        <View style={styles.mainIcon}>{row.key === 'securityCode' ? <SecurityCodeGlyph/> : <PrivacyIcon name="encryption"/>}</View>
        <View style={styles.rowCopy}><Text style={styles.rowTitle}>{row.title}</Text><Text style={styles.rowSubtitle}>{row.subtitle}</Text></View>
      </Pressable>)}

      {detailsOpen ? <View style={styles.card}>
        {indicators.map(([label, value]) => <View key={label} style={[styles.detailRow, styles.rowDivider]}><Text style={styles.detailRowText}>{label}</Text><StatusPill enabled={value} label={value ? 'Protected' : 'Unavailable'}/></View>)}
        <View style={[styles.detailRow, styles.rowDivider]}><Text style={styles.detailRowText}>Encryption</Text><Text style={styles.detailValue}>{details?.encryptionAlgorithm || 'AES-256'}</Text></View>
        <View style={[styles.detailRow, styles.rowDivider]}><Text style={styles.detailRowText}>Key exchange</Text><Text style={styles.detailValue}>{details?.keyExchange || 'ECDH'}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailRowText}>Server access</Text><StatusPill enabled={!details?.serverCanReadMessages} label={details?.serverCanReadMessages ? 'Readable' : 'No access'}/></View>
      </View> : null}
    </ScrollView>

    <SecurityCodeSheet
      canChangeContact={contacts.length > 1}
      code={code}
      contact={contact}
      errorMessage={codeError}
      onChangeContact={() => setPickerOpen(true)}
      onClose={() => setCodeOpen(false)}
      onRetry={() => { loadCode(contact).catch(() => undefined); }}
      status={codeStatus}
      updatedAt={updatedAt}
      visible={codeOpen}
    />

    <Modal animationType="fade" onRequestClose={() => setPickerOpen(false)} statusBarTranslucent transparent visible={pickerOpen}>
      <View style={styles.pickerBackdrop}>
        <Pressable accessibilityLabel="Close conversation picker" onPress={() => setPickerOpen(false)} style={StyleSheet.absoluteFill}/>
        <View accessibilityLabel="Choose a conversation to verify" style={styles.pickerSheet}>
          <Text accessibilityRole="header" style={styles.pickerTitle}>Verify a conversation</Text>
          <ScrollView contentContainerStyle={styles.pickerList}>
            {contacts.map((item, index) => <Pressable accessibilityLabel={`Verify with ${item.name}`} accessibilityRole="radio" accessibilityState={{checked: index === contactIndex}} key={item.userId} onPress={() => chooseContact(index)} style={styles.pickerRow}>
              <Text numberOfLines={1} style={styles.pickerName}>{item.name}</Text>
              {index === contactIndex ? <Text style={styles.pickerCheck}>OK</Text> : null}
            </Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>

    <Snackbar message={notice} onHide={() => onNotice('')}/>
  </View>;
}

/**
 * One-to-one conversations whose security code the backend can actually
 * compute: it hashes two users' public keys, so groups, broadcasts and rows
 * without a real user id on the other side are excluded. Most recent first,
 * matching which conversation the web client offers to verify first.
 */
export function verifiableContacts(items: ChatListItem[]): ConversationContact[] {
  const seen = new Set<string>();
  const at = (value: string) => { const time = Date.parse(value || ''); return Number.isFinite(time) ? time : 0; };
  return items
    .filter(item => item.contact.kind !== 'group' && item.contact.kind !== 'broadcast')
    .filter(item => /^[a-f\d]{24}$/i.test(item.contact.userId))
    .sort((first, second) => at(second.lastMessageAt) - at(first.lastMessageAt))
    .map(item => item.contact)
    .filter(item => { if (seen.has(item.userId)) { return false; } seen.add(item.userId); return true; });
}

/** The passcode-style glyph the design uses beside the security code row. */
function SecurityCodeGlyph() {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Circle cx={5} cy={12} r={1.7} fill={themeInk('#344054')}/>
    <Circle cx={12} cy={12} r={1.7} fill={themeInk('#344054')}/>
    <Circle cx={19} cy={12} r={1.7} fill={themeInk('#344054')}/>
  </Svg>;
}

type TwoFactorMethod = 'authenticator' | 'sms' | 'email';

function twoFactorMethodLabel(method: TwoFactorMethod): string {
  return method === 'sms' ? 'SMS Verification' : method === 'email' ? 'Email Verification' : 'Authenticator App';
}

function formatTwoFactorDate(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) { return 'Not verified'; }
  const today = new Date();
  const time = date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  return date.toDateString() === today.toDateString()
    ? `Today, ${time}`
    : `${date.toLocaleDateString([], {day: 'numeric', month: 'short', year: 'numeric'})}, ${time}`;
}

function TwoFactorScreen({enabled, onBack, onComplete, onDisabled, onEnabled, notice, onHideNotice}: {enabled: boolean; onBack: () => void; onComplete: () => void; onDisabled: () => void; onEnabled: () => void; notice: string; onHideNotice: () => void}) {
  const insets = useSafeAreaInsets();
  // New setups open on the method picker shown in the wireframe. Existing
  // setups retain the management page so they can reach recovery and device
  // controls without being forced through setup again.
  const [step, setStep] = useState<'overview' | 'method' | 'emailEntry' | 'emailOtp' | 'smsPhone' | 'smsOtp' | 'setup' | 'verify' | 'success' | 'recovery' | 'trusted'>(enabled ? 'overview' : 'method');
  const [selected, setSelected] = useState<TwoFactorMethod | null>(null);
  const [currentMethod, setCurrentMethod] = useState<TwoFactorMethod>('authenticator');
  const [setup, setSetup] = useState({qrValue: '', manualKey: ''});
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [localNotice, setLocalNotice] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [focusedDigit, setFocusedDigit] = useState(-1);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [lastVerifiedAt, setLastVerifiedAt] = useState('');
  const [trustedDeviceCount, setTrustedDeviceCount] = useState(0);
  const [disabling, setDisabling] = useState(false);
  const [recoveryFromOverview, setRecoveryFromOverview] = useState(false);
  const [authenticatorRollbackRequired, setAuthenticatorRollbackRequired] = useState(false);
  const [successMethod, setSuccessMethod] = useState<TwoFactorMethod>('authenticator');
  const [smsCountry, setSmsCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [smsCountryOpen, setSmsCountryOpen] = useState(false);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsVerification, setSmsVerification] = useState<PhoneVerification | null>(null);
  const [smsCode, setSmsCode] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsVerifying, setSmsVerifying] = useState(false);
  const [smsAttempts, setSmsAttempts] = useState(0);
  const [smsConfirmed, setSmsConfirmed] = useState(false);
  const [smsSecondsLeft, setSmsSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [smsCooldownEndsAt, setSmsCooldownEndsAt] = useState(0);
  // The number SMS sign-in codes go to. The backend always texts the account's
  // own phone (complete-login-2fa compares the Firebase number with user.phone),
  // so setup verifies that same number instead of one typed here.
  const [accountPhone, setAccountPhone] = useState(() => String(getSession()?.user?.phone || '').trim());
  const smsPhoneLocked = Boolean(splitPhoneNumber(accountPhone));
  const [emailSending, setEmailSending] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [emailErrorKind, setEmailErrorKind] = useState<OtpErrorKind | null>(null);
  const [emailSecondsLeft, setEmailSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [emailCooldownEndsAt, setEmailCooldownEndsAt] = useState(0);
  const digitRefs = useRef<Array<TextInput | null>>([]);

  const refreshTrustedDeviceCount = useCallback(() => {
    getTrustedDevices().then(devices => setTrustedDeviceCount(devices.length)).catch(() => setTrustedDeviceCount(0));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(LOCAL_TWO_FACTOR_METHOD_KEY),
      SecureStore.getItemAsync(LOCAL_RECOVERY_CODES_KEY),
      AsyncStorage.getItem(LOCAL_LAST_VERIFIED_KEY),
    ]).then(([storedMethod, storedCodes, storedVerified]) => {
      if (!active) { return; }
      const method: TwoFactorMethod = storedMethod === 'sms' || storedMethod === 'email' ? storedMethod : 'authenticator';
      if (enabled) { setSelected(method); }
      setCurrentMethod(method);
      try {
        const parsed = JSON.parse(storedCodes || '[]');
        setRecoveryCodes(Array.isArray(parsed) ? parsed.map(String) : []);
      } catch { setRecoveryCodes([]); }
      setLastVerifiedAt(storedVerified || '');
    }).catch(() => undefined);
    refreshTrustedDeviceCount();
    return () => { active = false; };
  }, [refreshTrustedDeviceCount]);

  useEffect(() => {
    if (step !== 'smsOtp' || !smsCooldownEndsAt) { return; }
    const tick = () => setSmsSecondsLeft(Math.max(0, Math.ceil((smsCooldownEndsAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [smsCooldownEndsAt, step]);

  useEffect(() => {
    if (step !== 'emailOtp' || !emailCooldownEndsAt) { return; }
    const tick = () => setEmailSecondsLeft(Math.max(0, Math.ceil((emailCooldownEndsAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [emailCooldownEndsAt, step]);

  const continueFromMethod = async () => {
    if (!selected) { return; }
    if (selected === 'email') {
      setLocalNotice('');
      setEmailAddress('');
      setEmailCode('');
      setEmailErrorKind(null);
      setStep('emailEntry');
      return;
    }
    if (loadingSetup) { return; }
    setLoadingSetup(true);
    setLocalNotice('');
    if (selected === 'sms') {
      setSmsCode('');
      setSmsAttempts(0);
      setSmsConfirmed(false);
      // The number may have been added or changed on another device since this
      // session signed in, so read it from the account before showing it.
      const userId = String(getSession()?.user?.id || '');
      const registered = userId ? await getRegisteredUser(userId).catch(() => null) : null;
      const phone = String(registered?.phone || accountPhone || '').trim();
      if (registered?.phone && registered.phone !== accountPhone) { updateSessionUser({phone: registered.phone}); }
      setAccountPhone(phone);
      const split = splitPhoneNumber(phone);
      if (split) {
        setSmsCountry(split.country);
        setSmsPhone(split.local);
      }
      setLoadingSetup(false);
      setStep('smsPhone');
      return;
    }
    setStep('setup');
    try {
      const response = await setupAuthenticator();
      if (!response.qrCode || !response.manualKey) { throw new Error('The authenticator setup details were not returned.'); }
      setSetup({qrValue: response.qrCode, manualKey: response.manualKey});
      setAuthenticatorRollbackRequired(enabled && currentMethod === 'sms');
    } catch (value) {
      setStep('method');
      setLocalNotice(value instanceof Error ? value.message : 'Unable to start authenticator setup.');
    } finally { setLoadingSetup(false); }
  };

  const sendSmsOtp = async () => {
    if (!isValidPhoneLength(smsCountry, smsPhone.length) || smsSending) { return; }
    setSmsSending(true);
    setLocalNotice('');
    try {
      const verification = await startPhoneVerification(`${smsCountry.dialCode}${smsPhone}`);
      setSmsVerification(verification);
      setSmsCode('');
      setSmsAttempts(0);
      setSmsConfirmed(false);
      setSmsCooldownEndsAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setSmsSecondsLeft(RESEND_COOLDOWN_SECONDS);
      setStep('smsOtp');
    } catch (value) {
      setLocalNotice(value instanceof Error ? value.message : 'Unable to send the verification code.');
    } finally { setSmsSending(false); }
  };

  const verifySmsOtp = async () => {
    if (!smsVerification || smsCode.length !== 6 || smsVerifying || smsAttempts >= 3) { return; }
    setSmsVerifying(true);
    setLocalNotice('');
    try {
      if (!smsConfirmed) {
        try {
          await confirmPhoneCode(smsVerification, smsCode);
          setSmsConfirmed(true);
        } catch (value) {
          const nextAttempts = smsAttempts + 1;
          setSmsAttempts(nextAttempts);
          setSmsCode('');
          setLocalNotice(nextAttempts >= 3 ? 'Too many incorrect attempts. Resend the code to try again.' : value instanceof Error ? value.message : 'Unable to verify the code.');
          return;
        }
      }
      const verifiedPhone = toE164(smsCountry, smsPhone);
      if (!smsPhoneLocked) {
        // No number on the account yet: the one just verified becomes it, which
        // is the number the server will text at sign-in. Saving comes first so
        // SMS verification is never switched on for a number it cannot reach.
        const token = getToken();
        if (!token) { throw new Error('Your session has expired. Please sign in again.'); }
        const saved = await updateProfile(token, {phone: verifiedPhone});
        const storedPhone = String(saved?.user?.phone || verifiedPhone);
        updateSessionUser({phone: storedPhone});
        setAccountPhone(storedPhone);
      }
      // The server refuses /2fa/enable while 2FA is on, so moving over from the
      // authenticator app turns that off first. SMS that is already on only
      // needed its number re-verified.
      const alreadySms = enabled && currentMethod === 'sms';
      if (enabled && currentMethod === 'authenticator') { await disableTwoFactor(); }
      const result = alreadySms ? {message: '', backupCodes: []} : await enableTwoFactorSetup('sms');
      const verifiedAt = new Date().toISOString();
      await AsyncStorage.multiSet([
        [LOCAL_TWO_FACTOR_ENABLED_KEY, 'true'],
        [LOCAL_TWO_FACTOR_METHOD_KEY, 'sms'],
        [LOCAL_LAST_VERIFIED_KEY, verifiedAt],
      ]);
      await SecureStore.setItemAsync(LOCAL_RECOVERY_CODES_KEY, JSON.stringify(result.backupCodes));
      setRecoveryCodes(result.backupCodes);
      setLastVerifiedAt(verifiedAt);
      setCurrentMethod('sms');
      setSuccessMethod('sms');
      onEnabled();
      setStep('success');
    } catch (value) {
      setLocalNotice(value instanceof Error ? value.message : 'The code was verified, but SMS verification could not be enabled. Try again.');
    } finally { setSmsVerifying(false); }
  };

  const copyKey = async () => {
    if (!setup.manualKey) { return; }
    await Clipboard.setStringAsync(setup.manualKey);
    setLocalNotice('Authenticator key copied.');
  };

  const updateDigit = (index: number, value: string) => {
    const numeric = value.replace(/\D/g, '').slice(0, 6);
    if (!numeric) { const next = [...digits]; next[index] = ''; setDigits(next); setVerificationError(''); return; }
    const next = [...digits];
    numeric.split('').forEach((digit, offset) => { if (index + offset < 6) { next[index + offset] = digit; } });
    setDigits(next);
    setVerificationError('');
    digitRefs.current[Math.min(index + numeric.length, 5)]?.focus();
  };

  const handleDigitKey = (index: number, key: string) => {
    if (key !== 'Backspace') { return; }
    if (!digits[index] && index > 0) { const next = [...digits]; next[index - 1] = ''; setDigits(next); digitRefs.current[index - 1]?.focus(); }
  };

  const verifyCode = async () => {
    const token = digits.join('');
    if (token.length !== 6) { setVerificationError('Enter the complete 6-digit verification code.'); return; }
    if (verifying) { return; }
    setVerifying(true); setVerificationError('');
    try {
      const codes = await verifyAuthenticator(token);
      if (!enabled) { await enableTwoFactor('authenticator'); }
      const verifiedAt = new Date().toISOString();
      await AsyncStorage.multiSet([
        [LOCAL_TWO_FACTOR_ENABLED_KEY, 'true'],
        [LOCAL_TWO_FACTOR_METHOD_KEY, 'authenticator'],
        [LOCAL_LAST_VERIFIED_KEY, verifiedAt],
      ]);
      await SecureStore.setItemAsync(LOCAL_RECOVERY_CODES_KEY, JSON.stringify(codes));
      setRecoveryCodes(codes);
      setLastVerifiedAt(verifiedAt);
      setCurrentMethod('authenticator');
      setSuccessMethod('authenticator');
      setAuthenticatorRollbackRequired(false);
      setRecoveryFromOverview(false);
      onEnabled();
      setStep('success');
    } catch (value) {
      setVerificationError(value instanceof Error ? value.message : 'Unable to verify the authenticator code.');
    } finally { setVerifying(false); }
  };

  const confirmDisable = () => Alert.alert(
    'Disable two-step verification?',
    'You will no longer be asked for a verification code when signing in on a new device.',
    [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Disable 2FA', style: 'destructive', onPress: async () => {
        if (disabling) { return; }
        setDisabling(true);
        try {
          if (currentMethod !== 'email') { await disableTwoFactor(); }
          await AsyncStorage.multiRemove([LOCAL_TWO_FACTOR_ENABLED_KEY, LOCAL_TWO_FACTOR_METHOD_KEY, LOCAL_RECOVERY_CODES_KEY, LOCAL_LAST_VERIFIED_KEY]);
          await SecureStore.deleteItemAsync(LOCAL_RECOVERY_CODES_KEY);
          setRecoveryCodes([]);
          setLastVerifiedAt('');
          setSelected(null);
          setCurrentMethod('authenticator');
          onDisabled();
          setLocalNotice('Two-step verification disabled.');
        } catch (value) {
          setLocalNotice(value instanceof Error ? value.message : 'Unable to disable two-step verification.');
        } finally { setDisabling(false); }
      }},
    ],
  );

  const cancelAuthenticatorSetup = async () => {
    if (!authenticatorRollbackRequired) { setStep('method'); return; }
    setLoadingSetup(true);
    try {
      await disableTwoFactor();
      await enableTwoFactor('sms');
      setAuthenticatorRollbackRequired(false);
      setStep('method');
    } catch (value) {
      setLocalNotice(value instanceof Error ? value.message : 'Unable to restore SMS verification. Please try again.');
    } finally { setLoadingSetup(false); }
  };

  if (step === 'trusted') {
    return <TrustedDevicesScreen onAllRemoved={() => {setTrustedDeviceCount(0); setLocalNotice('All trusted devices have been removed.'); setStep('overview');}} onBack={() => {refreshTrustedDeviceCount(); setStep('overview');}} onCountChange={setTrustedDeviceCount}/>;
  }

  if (step === 'emailEntry') {
    const emailError = validateRegistration('email', emailAddress, DEFAULT_COUNTRY).email;
    const sendEmailCode = async () => {
      if (emailError || emailSending) { return; }
      setEmailSending(true);
      setLocalNotice('');
      try {
        const normalizedEmail = emailAddress.trim().toLowerCase();
        await sendEmailOtp(normalizedEmail);
        setEmailAddress(normalizedEmail);
        setEmailCode('');
        setEmailErrorKind(null);
        setEmailCooldownEndsAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
        setEmailSecondsLeft(RESEND_COOLDOWN_SECONDS);
        setStep('emailOtp');
      } catch (value) {
        setLocalNotice(value instanceof Error ? value.message : 'Unable to send the verification code.');
      } finally { setEmailSending(false); }
    };
    return <View style={styles.root}>
      <Header title="Email Verification" onBack={() => setStep('method')}/>
      <ScrollView contentContainerStyle={styles.emailEntryContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.emailFieldLabel}>Email</Text>
        <View style={styles.emailField}>
          <EmailGlyph/>
          <TextInput accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email" autoCorrect={false} editable={!emailSending} keyboardType="email-address" onChangeText={value => {setEmailAddress(value); setLocalNotice('');}} onSubmitEditing={sendEmailCode} placeholder="Enter your email address" placeholderTextColor="#98A2B3" returnKeyType="done" style={styles.emailInput} value={emailAddress}/>
        </View>
      </ScrollView>
      <View style={styles.emailBottomNote}><InfoIcon/><Text style={styles.emailBottomNoteText}>A verification code will be sent to this email address.</Text></View>
      <BottomContinue bottom={insets.bottom} disabled={Boolean(emailError) || emailSending} label={emailSending ? 'Sending OTP…' : 'Send OTP'} onPress={sendEmailCode}/>
      <Snackbar message={localNotice} onHide={() => setLocalNotice('')}/>
    </View>;
  }

  if (step === 'emailOtp') {
    const canVerifyEmail = isCompleteOtp(emailCode) && !emailVerifying && emailErrorKind !== 'attempts' && emailErrorKind !== 'expired';
    const resendEmailCode = async () => {
      if (emailSecondsLeft > 0 || emailSending) { return; }
      setEmailSending(true);
      setLocalNotice('');
      try {
        await resendEmailOtp(emailAddress);
        setEmailCode('');
        setEmailErrorKind(null);
        setEmailCooldownEndsAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
        setEmailSecondsLeft(RESEND_COOLDOWN_SECONDS);
        setLocalNotice('A new verification code was sent.');
      } catch (value) {
        setLocalNotice(value instanceof Error ? value.message : 'Unable to resend the verification code.');
      } finally { setEmailSending(false); }
    };
    const verifyEmailCode = async () => {
      if (!canVerifyEmail) { return; }
      setEmailVerifying(true);
      setEmailErrorKind(null);
      setLocalNotice('');
      try {
        await verifyEmailOtp(emailAddress, emailCode);
        const verifiedAt = new Date().toISOString();
        await AsyncStorage.multiSet([
          [LOCAL_TWO_FACTOR_ENABLED_KEY, 'true'],
          [LOCAL_TWO_FACTOR_METHOD_KEY, 'email'],
          [LOCAL_LAST_VERIFIED_KEY, verifiedAt],
        ]);
        setLastVerifiedAt(verifiedAt);
        setCurrentMethod('email');
        setSuccessMethod('email');
        setRecoveryCodes(createLocalRecoveryCodes());
        onEnabled();
        setStep('success');
      } catch (value) {
        const kind = resolveOtpError(value);
        setEmailErrorKind(kind);
        if (kind === 'invalid' || kind === 'expired' || kind === 'attempts') { setEmailCode(''); }
      } finally { setEmailVerifying(false); }
    };
    return <View style={styles.root}>
      <Header title="Verify OTP" onBack={() => setStep('emailEntry')}/>
      <ScrollView contentContainerStyle={styles.emailOtpContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.emailOtpInstruction}>Enter the 6 digit code sent to <Text style={styles.emailOtpDestination}>{emailAddress}</Text></Text>
        <OtpCodeInput autoFocus editable={!emailVerifying} hasError={Boolean(emailErrorKind)} onChange={value => {setEmailCode(value); if (emailErrorKind !== 'attempts' && emailErrorKind !== 'expired') { setEmailErrorKind(null); }}} onSubmit={verifyEmailCode} value={emailCode}/>
        {emailErrorKind ? <Text accessibilityLiveRegion="polite" style={styles.emailOtpError}>{OTP_ERROR_MESSAGES[emailErrorKind]}</Text> : null}
        <View style={styles.emailResendRow}><Text style={styles.emailResendPrompt}>Didn’t get the code? </Text>{emailSecondsLeft > 0 ? <Text accessibilityLabel={`Resend in ${emailSecondsLeft}s`} style={styles.emailResendTimer}>Resend in {formatResendCountdown(emailSecondsLeft)}</Text> : <Pressable accessibilityLabel="Resend Email OTP" disabled={emailSending} hitSlop={8} onPress={resendEmailCode}><Text style={styles.emailResendAction}>{emailSending ? 'Sending…' : 'Resend'}</Text></Pressable>}</View>
      </ScrollView>
      <BottomContinue bottom={insets.bottom} disabled={!canVerifyEmail} label={emailVerifying ? 'Verifying…' : 'Verify'} onPress={verifyEmailCode}/>
      <Snackbar message={localNotice} onHide={() => setLocalNotice('')}/>
    </View>;
  }

  if (step === 'overview') {
    const openMethods = () => { setSelected(enabled ? currentMethod : null); setVerificationError(''); setLocalNotice(''); setStep('method'); };
    const openRecovery = () => {
      if (!recoveryCodes.length) {
        setLocalNotice(currentMethod === 'sms' ? 'Recovery codes are available with an authenticator app.' : 'Recovery codes are not available on this device.');
        return;
      }
      setRecoveryFromOverview(true);
      setStep('recovery');
    };
    return <View style={styles.root}>
      <Header title="Two-Step Verification" onBack={onBack}/>
      <ScrollView contentContainerStyle={styles.manageContent}>
        <TwoFactorManageRow icon="method" onPress={openMethods} subtitle={enabled ? twoFactorMethodLabel(currentMethod) : 'Choose a verification method'} title="Verification Method"/>
        <TwoFactorManageRow icon="recovery" onPress={openRecovery} subtitle={enabled && currentMethod === 'authenticator' ? `${recoveryCodes.length} Codes` : 'Available with an authenticator app'} title="Recovery Codes"/>
        <TwoFactorManageRow icon="device" onPress={() => setStep('trusted')} subtitle={`${trustedDeviceCount} ${trustedDeviceCount === 1 ? 'Device' : 'Devices'}`} title="Trusted Devices"/>
        <TwoFactorManageRow icon="clock" subtitle={formatTwoFactorDate(lastVerifiedAt)} title="Last Verified"/>
        <TwoFactorManageRow danger={enabled} disabled={disabling} icon="disable" onPress={enabled ? confirmDisable : openMethods} subtitle={enabled ? 'Turn off Two-Step Verification' : 'Set up Two-Step Verification'} title={enabled ? 'Disable 2FA' : 'Enable 2FA'}/>
      </ScrollView>
      {localNotice === 'All trusted devices have been removed.' ? <DeviceActionToast message={localNotice} onHide={() => setLocalNotice('')}/> : <Snackbar message={localNotice || notice} onHide={() => {setLocalNotice(''); onHideNotice();}}/>}
    </View>;
  }

  if (step === 'smsPhone') {
    const phoneIsValid = isValidPhoneLength(smsCountry, smsPhone.length);
    return <View style={styles.root}>
      <Header title="SMS Verification" onBack={() => setStep('method')}/>
      <ScrollView contentContainerStyle={styles.smsPhoneContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.smsFieldLabel}>Country</Text>
        <Pressable accessibilityLabel="Select SMS country" accessibilityRole="button" accessibilityState={{disabled: smsPhoneLocked}} disabled={smsPhoneLocked} onPress={() => setSmsCountryOpen(true)} style={[styles.smsCountryField, smsPhoneLocked && styles.smsFieldLocked]}>
          <Text style={styles.smsCountryFlag}>{smsCountry.flag}</Text><Text style={styles.smsCountryText}>{smsCountry.name} ({smsCountry.dialCode})</Text>{smsPhoneLocked ? null : <Text style={styles.smsChevron}>⌄</Text>}
        </Pressable>
        <Text style={[styles.smsFieldLabel, styles.smsPhoneLabel]}>Phone Number</Text>
        <View style={[styles.smsPhoneField, smsPhoneLocked && styles.smsFieldLocked]}><Text style={styles.smsPhoneGlyph}>▯</Text><TextInput accessibilityLabel="SMS phone number" accessibilityState={{disabled: smsPhoneLocked}} autoComplete="tel" editable={!smsPhoneLocked} inputMode="numeric" keyboardType="number-pad" maxLength={smsCountry.phoneLength} onChangeText={value => setSmsPhone(value.replace(/\D/g, ''))} placeholder="Enter your phone number" placeholderTextColor="#98A2B3" returnKeyType="done" style={styles.smsPhoneInput} value={smsPhone}/></View>
        {smsPhoneLocked ? <Text accessibilityLabel={`Codes are sent to ${formatPhoneNumber(accountPhone)}`} style={styles.smsAccountNumberNote}>This is the mobile number on your Chatterly account. Sign-in codes are always sent to it; to use a different number, change it in your profile first.</Text> : null}
      </ScrollView>
      <View style={styles.smsBottomNote}><InfoIcon/><Text style={styles.smsBottomNoteText}>{smsPhoneLocked ? 'A verification code will be sent to your account number.' : 'A verification code will be sent to this number. Once verified, it is saved as your account number and used for sign-in codes.'}</Text></View>
      <BottomContinue bottom={insets.bottom} disabled={!phoneIsValid || smsSending} label={smsSending ? 'Sending OTP…' : 'Send OTP'} onPress={sendSmsOtp}/>
      <Modal animationType="fade" onRequestClose={() => setSmsCountryOpen(false)} transparent visible={smsCountryOpen}><Pressable onPress={() => setSmsCountryOpen(false)} style={styles.countryBackdrop}><View style={styles.countrySheet}><Text style={styles.countrySheetTitle}>Select country</Text><ScrollView keyboardShouldPersistTaps="handled">{COUNTRIES.map(country => <Pressable accessibilityLabel={`${country.name} ${country.dialCode}`} key={country.code} onPress={() => {setSmsCountry(country); setSmsPhone(''); setSmsCountryOpen(false);}} style={styles.countryOption}><Text style={styles.countryOptionFlag}>{country.flag}</Text><Text style={styles.countryOptionName}>{country.name}</Text><Text style={styles.countryOptionCode}>{country.dialCode}</Text>{country.code === smsCountry.code ? <Text style={styles.countryOptionCheck}>✓</Text> : null}</Pressable>)}</ScrollView></View></Pressable></Modal>
      <Snackbar message={localNotice} onHide={() => setLocalNotice('')}/>
    </View>;
  }

  if (step === 'smsOtp') {
    const canVerifySms = smsCode.length === 6 && smsAttempts < 3 && !smsVerifying;
    const resendSms = async () => {
      if (smsSecondsLeft > 0 || smsSending) { return; }
      await sendSmsOtp();
    };
    return <View style={styles.root}>
      <Header title="Verify OTP" onBack={() => setStep('smsPhone')}/>
      <ScrollView contentContainerStyle={styles.smsOtpContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.smsOtpInstruction}>Enter the 6 digit code sent to <Text style={styles.smsOtpDestination}>{formatPhoneNumber(toE164(smsCountry, smsPhone))}</Text></Text>
        <OtpCodeInput autoFocus editable={!smsVerifying && smsAttempts < 3} hasError={Boolean(localNotice)} onChange={value => {setSmsCode(value); setLocalNotice('');}} onSubmit={verifySmsOtp} value={smsCode}/>
        <View style={styles.smsResendRow}><Text style={styles.smsResendPrompt}>Didn’t get the code? </Text>{smsSecondsLeft > 0 ? <Text accessibilityLabel={`Resend in ${smsSecondsLeft}s`} style={styles.smsResendTimer}>Resend in {smsSecondsLeft}s</Text> : <Pressable accessibilityLabel="Resend SMS OTP" hitSlop={8} onPress={resendSms}><Text style={styles.smsResendAction}>{smsSending ? 'Sending…' : 'Resend OTP'}</Text></Pressable>}</View>
      </ScrollView>
      <BottomContinue bottom={insets.bottom} disabled={!canVerifySms} label={smsVerifying ? 'Verifying…' : 'Verify'} onPress={verifySmsOtp}/>
      <Snackbar message={localNotice} onHide={() => setLocalNotice('')}/>
    </View>;
  }

  if (step === 'verify') {
    return <View style={styles.root}><Header title="Setup your Authenticator App" onBack={() => setStep('setup')}/>
      <ScrollView contentContainerStyle={styles.verifyContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.verifyInstruction}>Enter the 6-digit verification codes shown in the app</Text>
        <View style={styles.otpRow}>{digits.map((digit, index) => <TextInput accessibilityLabel={`Verification code digit ${index + 1}`} autoComplete="one-time-code" inputMode="numeric" keyboardType="number-pad" key={index} maxLength={index === 0 ? 6 : 1} onBlur={() => setFocusedDigit(current => current === index ? -1 : current)} onChangeText={value => updateDigit(index, value)} onFocus={() => setFocusedDigit(index)} onKeyPress={({nativeEvent}) => handleDigitKey(index, nativeEvent.key)} ref={element => {digitRefs.current[index] = element;}} selectTextOnFocus style={[styles.otpBox, focusedDigit === index && styles.otpBoxFocused]} value={digit}/>)}</View>
        {verificationError ? <Text accessibilityLiveRegion="polite" style={styles.otpError}>{verificationError}</Text> : null}
      </ScrollView>
      <BottomContinue bottom={insets.bottom} disabled={verifying} label={verifying ? 'Verifying…' : 'Verify'} onPress={verifyCode}/>
    </View>;
  }

  if (step === 'success') {
    return <View style={styles.root}><CloseHeader onClose={onComplete}/><View style={styles.successContent}><View style={styles.successIcon}><SuccessCheck/></View><Text style={styles.successTitle}>Two-Step Verification Enabled!</Text><Text style={styles.successSubtitle}>Your account is now protected with an{`\n`}additional verification step.</Text><View style={styles.verificationCard}><View style={styles.verificationIcon}>{successMethod === 'sms' ? <SmsGlyph/> : successMethod === 'email' ? <EmailGlyph/> : <AuthenticatorGlyph/>}</View><View><Text style={styles.verificationLabel}>Verification Method</Text><Text style={styles.verificationValue}>{twoFactorMethodLabel(successMethod)}</Text></View></View></View><View style={styles.successInfo}><InfoIcon/><Text style={styles.successInfoText}>You’ll be asked for a verification code when signing{`\n`}in on a new device.</Text></View><BottomContinue bottom={insets.bottom} label="View Recovery Codes" onPress={() => setStep('recovery')}/><Snackbar message={localNotice} onHide={() => setLocalNotice('')}/></View>;
  }

  if (step === 'recovery' && recoveryFromOverview) {
    const copyCodes = async () => {
      await Clipboard.setStringAsync(recoveryCodes.join('\n'));
      setLocalNotice('Recovery codes copied.');
    };
    return <View style={styles.root}><RecoveryHeader onClose={() => setStep('overview')}/><ScrollView contentContainerStyle={styles.recoveryContent}><Text style={styles.recoveryDescription}>These one-time codes can help you signing in if you lose{`\n`}access to your authenticator app.</Text><View style={styles.recoveryGrid}>{recoveryCodes.map((code, index) => <Text key={`${code}-${index}`} selectable style={styles.recoveryCode}>{code}</Text>)}</View></ScrollView><RecoveryActions bottom={insets.bottom} onContinue={() => setStep('overview')} onSave={copyCodes}/><Snackbar message={localNotice} onHide={() => setLocalNotice('')}/></View>;
  }

  if (step === 'recovery') {
    const saveCodes = async () => {
      const contents = `${recoveryCodes.join('\n')}\n`;
      try {
        await SecureStore.setItemAsync(LOCAL_RECOVERY_CODES_KEY, JSON.stringify(recoveryCodes));
        const webDocument = (globalThis as unknown as {document?: {createElement: (tag: string) => {href: string; download: string; click: () => void}}}).document;
        if (Platform.OS === 'web' && webDocument) {
          const link = webDocument.createElement('a');
          link.href = `data:text/plain;charset=utf-8,${encodeURIComponent(contents)}`;
          link.download = 'recovery-codes.txt'; link.click();
        } else {
          const file = new File(Paths.document, 'recovery-codes.txt');
          file.write(contents);
          if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(file.uri, {mimeType: 'text/plain', dialogTitle: 'Save Recovery Codes'}); }
        }
        setLocalNotice('Recovery codes saved securely.');
      } catch { setLocalNotice('Unable to save recovery codes.'); }
    };
    return <View style={styles.root}><RecoveryHeader onClose={onComplete}/><ScrollView contentContainerStyle={styles.recoveryContent}><Text style={styles.recoveryDescription}>{successMethod === 'email' ? 'These one-time codes can help you signing in if you lose\naccess to your authenticator app.' : 'These one-time codes can help you signing in if you lose\naccess to your verification method.'}</Text><View style={styles.recoveryGrid}>{recoveryCodes.map((code, index) => <Text key={`${code}-${index}`} selectable style={styles.recoveryCode}>{code}</Text>)}</View></ScrollView><RecoveryActions bottom={insets.bottom} onContinue={onComplete} onSave={saveCodes}/><Snackbar message={localNotice} onHide={() => setLocalNotice('')}/></View>;
  }

  if (step === 'setup') {
    return <View style={styles.root}>
      <Header title="Setup your Authenticator App" onBack={() => {cancelAuthenticatorSetup().catch(() => undefined);}}/>
      <ScrollView contentContainerStyle={styles.authSetupContent}>
        <Text style={styles.authSetupIntro}>Install an Authenticator app if you don’t{`\n`}already have one</Text>
        <Text style={styles.supportedLabel}>Supported apps:</Text>
        <View style={styles.supportedList}><Text style={styles.supportedItem}>•  Google Authenticator</Text><Text style={styles.supportedItem}>•  Microsoft Authenticator</Text><Text style={styles.supportedItem}>•  Authy</Text></View>
        <Text style={styles.scanLabel}>Scan this QR code</Text>
        <View accessibilityLabel="Authenticator QR code" style={styles.qrArea}>{loadingSetup ? <ActivityIndicator color={PURPLE}/> : setup.qrValue ? setup.qrValue.startsWith('data:image') ? <Image source={{uri: setup.qrValue}} style={styles.authQr}/> : <QRCode value={setup.qrValue} size={154} color="#151319" backgroundColor="#FFFFFF"/> : <Pressable accessibilityLabel="Retry authenticator setup" onPress={continueFromMethod}><Text style={styles.retrySetup}>Try again</Text></Pressable>}</View>
        <Text style={styles.manualLabel}>or manually enter this key</Text>
        <View style={styles.manualKeyField}><Text accessibilityLabel="Authenticator secret key" numberOfLines={1} selectable style={styles.manualKeyText}>{setup.manualKey || (loadingSetup ? 'Loading…' : 'Unavailable')}</Text><Pressable accessibilityLabel="Copy authenticator key" disabled={!setup.manualKey} hitSlop={10} onPress={copyKey} style={styles.copyButton}><CopyIcon/></Pressable></View>
      </ScrollView>
      <BottomContinue bottom={insets.bottom} disabled={loadingSetup || !setup.manualKey} onPress={() => setStep('verify')}/>
      <Snackbar message={localNotice || notice} onHide={() => {setLocalNotice(''); onHideNotice();}}/>
    </View>;
  }

  const options: Array<{value: TwoFactorMethod; label: string; description: string}> = [
    {value: 'authenticator', label: 'Authenticator App', description: 'Generate secure verification codes using apps like Google Authenticator, Microsoft Authenticator or Authy.'},
    {value: 'sms', label: 'SMS Verification', description: 'Receive a one-time verification code by text message.'},
    {value: 'email', label: 'Email Verification', description: 'Receive a one-time verification code by email.'},
  ];
  return <View style={styles.root}>
    <Header title="2-Step Verification" onBack={enabled ? () => setStep('overview') : onBack}/>
    <ScrollView contentContainerStyle={styles.twoFactorContent}>
      <Text style={styles.methodHeading}>Choose a verification method</Text>
      <Text style={styles.methodDescription}>Add an extra layer of security to your account. You’ll be asked to verify your identity when signing in from a new device.</Text>
      <View style={styles.methodList}>{options.map(option => <Pressable accessibilityLabel={option.label} accessibilityRole="radio" accessibilityState={{checked: selected === option.value}} key={option.value} onPress={() => setSelected(option.value)} style={styles.methodRow}>
        <View style={[styles.methodRadio, selected === option.value && styles.methodRadioSelected]}>{selected === option.value ? <CheckIcon/> : null}</View>
        <View style={styles.methodCopy}><View style={styles.methodTitleRow}><Text style={styles.methodTitle}>{option.label}</Text>{option.value === 'authenticator' ? <View style={styles.recommended}><Text style={styles.recommendedText}>Recommended</Text></View> : null}</View><Text style={styles.methodBody}>{option.description}</Text></View>
      </Pressable>)}</View>
    </ScrollView>
    <BottomContinue bottom={insets.bottom} disabled={!selected || loadingSetup || emailSending} label={emailSending ? 'Sending…' : 'Continue'} onPress={continueFromMethod}/>
    <Snackbar message={localNotice || notice} onHide={() => {setLocalNotice(''); onHideNotice();}}/>
  </View>;
}

function TwoFactorManageRow({danger = false, disabled = false, icon, onPress, subtitle, title}: {danger?: boolean; disabled?: boolean; icon: 'method' | 'recovery' | 'device' | 'clock' | 'disable'; onPress?: () => void; subtitle: string; title: string}) {
  const content = <><View style={[styles.manageIcon, danger && styles.manageDangerIcon]}><ManageGlyph name={icon} danger={danger}/></View><View style={styles.rowCopy}><Text style={[styles.manageTitle, danger && styles.manageDangerText]}>{title}</Text><Text style={styles.manageSubtitle}>{subtitle}</Text></View>{onPress ? <Text style={styles.manageChevron}>›</Text> : null}</>;
  return onPress
    ? <Pressable accessibilityLabel={title} accessibilityRole="button" disabled={disabled} onPress={onPress} style={({pressed}) => [styles.manageRow, pressed && styles.rowPressed, disabled && styles.manageDisabled]}>{content}</Pressable>
    : <View style={styles.manageRow}>{content}</View>;
}

function ManageGlyph({danger, name}: {danger: boolean; name: 'method' | 'recovery' | 'device' | 'clock' | 'disable'}) {
  const stroke = danger ? '#EF4444' : '#334155';
  const common = {stroke, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  if (name === 'method') return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Rect x={4} y={7} width={16} height={11} rx={2} {...common}/><Path d="M8 12h.01M12 12h.01M16 12h.01" {...common}/></Svg>;
  if (name === 'recovery') return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={9} cy={8.5} r={2.5} {...common}/><Path d="M4.5 18a4.5 4.5 0 0 1 9 0M15.5 8h4M15.5 11h4" {...common}/></Svg>;
  if (name === 'device') return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Rect x={7} y={3} width={10} height={18} rx={2.5} {...common}/><Path d="M11 18h2" {...common}/></Svg>;
  if (name === 'clock') return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={8.5} {...common}/><Path d="M12 7.5V12l3 2" {...common}/></Svg>;
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={8.5} {...common}/><Path d="m6.3 6.3 11.4 11.4" {...common}/></Svg>;
}

function TrustedDevicesScreen({onAllRemoved, onBack, onCountChange}: {onAllRemoved: () => void; onBack: () => void; onCountChange: (count: number) => void}) {
  const insets = useSafeAreaInsets();
  const [identity, setIdentity] = useState<Awaited<ReturnType<typeof getDeviceIdentity>> | null>(null);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<TrustedDevice | null>(null);
  const [deviceToRemove, setDeviceToRemove] = useState<TrustedDevice | null>(null);
  const [removeAllOpen, setRemoveAllOpen] = useState(false);
  const lastLongPressAt = useRef(0);

  const loadDevices = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const list = await getTrustedDevices();
      setDevices(list);
      onCountChange(list.length);
    } catch (value) {
      setNotice(value instanceof Error ? value.message : 'Unable to load trusted devices.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onCountChange]);

  useEffect(() => { loadDevices(); }, [loadDevices]);
  useEffect(() => { getDeviceIdentity().then(setIdentity).catch(() => setNotice('Unable to identify this device.')); }, []);

  const addCurrent = async () => {
    if (busy || !identity) { return; }
    setBusy(true);
    try {
      await registerTrustedDevice(identity);
      await loadDevices(true);
      setNotice('Current device added as trusted.');
    } catch (value) {
      setNotice(value instanceof Error ? value.message : 'Unable to add this device.');
    } finally { setBusy(false); }
  };

  const confirmRemoveOne = async () => {
    if (!deviceToRemove || busy) { return; }
    setBusy(true);
    try {
      await removeTrustedDevice(deviceToRemove.deviceId);
      const next = devices.filter(item => item.deviceId !== deviceToRemove.deviceId);
      setDevices(next);
      onCountChange(next.length);
      setDeviceToRemove(null);
      setNotice('Trusted device removed.');
    } catch (value) {
      setDeviceToRemove(null);
      setNotice(value instanceof Error ? value.message : 'Unable to remove this device.');
    } finally { setBusy(false); }
  };

  const confirmRemoveAll = async () => {
    if (busy || !devices.length) { return; }
    setBusy(true);
    try {
      await Promise.all(devices.map(device => removeTrustedDevice(device.deviceId)));
      setRemoveAllOpen(false);
      onAllRemoved();
    } catch (value) {
      setRemoveAllOpen(false);
      setNotice(value instanceof Error ? value.message : 'Unable to remove all trusted devices.');
      await loadDevices(true);
      setBusy(false);
    }
  };

  const currentRegistered = Boolean(identity && devices.some(device => device.deviceId === identity.deviceId));
  return <View style={styles.root}>
    <Header title="Trusted Devices" onBack={onBack}/>
    {loading ? <View style={styles.centerState}><ActivityIndicator color={PURPLE}/></View> : <ScrollView contentContainerStyle={[styles.trustedContent, {paddingBottom: Math.max(insets.bottom + 24, 42)}]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDevices(true)} tintColor={PURPLE}/>}>
      <View style={styles.trustedHeadingRow}><Text style={styles.trustedHeading}>Your Devices</Text><View style={styles.deviceCount}><Text style={styles.deviceCountText}>{devices.length}</Text></View></View>
      <Text style={styles.trustedIntro}>These devices are trusted and will not be asked for a verification code when you sign in. Tap for information or long press to remove.</Text>
      {devices.map(device => <Pressable accessibilityHint="Tap for device information. Long press to remove this trusted device." accessibilityLabel={`${device.deviceName} device information`} delayLongPress={450} key={device.deviceId} onLongPress={() => {lastLongPressAt.current = Date.now(); setDeviceToRemove(device);}} onPress={() => {if (Date.now() - lastLongPressAt.current > 700) { setSelectedDevice(device); }}} style={({pressed}) => [styles.deviceRow, pressed && styles.rowPressed]}>
        <View style={styles.deviceGlyph}><ManageGlyph name="device" danger={false}/></View>
        <View style={styles.rowCopy}><View style={styles.deviceTitleRow}><Text numberOfLines={1} style={styles.deviceName}>{device.deviceName}</Text>{device.deviceId === identity?.deviceId ? <StatusPill enabled label="This device"/> : null}{device.trusted ? <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>Active</Text></View> : null}</View><Text style={styles.deviceMeta}>{[device.platform.toUpperCase(), device.browser, device.ipAddress].filter(Boolean).join('  •  ')}</Text><Text style={styles.deviceLastLogin}>Last Login: {formatTwoFactorDate(device.lastLoginAt)}</Text></View>
      </Pressable>)}
      {!devices.length ? <View style={styles.trustedEmpty}><Text style={styles.emptyTitle}>No trusted devices</Text><Text style={styles.emptyText}>Add this device to skip verification codes on future sign-ins.</Text></View> : null}
      {!currentRegistered ? <Pressable accessibilityLabel="Add Current Device" disabled={busy || !identity} onPress={addCurrent} style={[styles.addDeviceButton, (busy || !identity) && styles.manageDisabled]}><Text style={styles.addDeviceText}>{busy ? 'Adding...' : 'Add Current Device'}</Text></Pressable> : <View style={styles.currentRegistered}><Text style={styles.currentRegisteredText}>Current device is trusted</Text></View>}
      <View style={styles.trustedSafety}><InfoIcon/><Text style={styles.trustedSafetyText}>Keep your account safe. If you do not recognize a device, remove it.</Text></View>
      <Pressable accessibilityLabel="Remove All Devices" disabled={busy || !devices.length} onPress={() => setRemoveAllOpen(true)} style={[styles.removeAllButton, (busy || !devices.length) && styles.continueDisabled]}><Text style={styles.continueText}>Remove All Devices</Text></Pressable>
    </ScrollView>}
    <RemoveTrustedDeviceModal busy={busy} device={deviceToRemove} onCancel={() => setDeviceToRemove(null)} onConfirm={() => {confirmRemoveOne().catch(() => undefined);}}/>
    <RemoveAllTrustedDevicesModal busy={busy} onCancel={() => setRemoveAllOpen(false)} onConfirm={() => {confirmRemoveAll().catch(() => undefined);}} visible={removeAllOpen}/>
    <Modal animationType="fade" onRequestClose={() => setSelectedDevice(null)} transparent visible={Boolean(selectedDevice)}><View style={styles.deviceModalBackdrop}><Pressable accessibilityLabel="Close device information" onPress={() => setSelectedDevice(null)} style={StyleSheet.absoluteFill}/>{selectedDevice ? <View style={styles.deviceModal}><Text style={styles.deviceModalTitle}>Device Information</Text><Text style={styles.deviceModalName}>{selectedDevice.deviceName}</Text><DeviceInfoLine label="Platform" value={selectedDevice.platform.toUpperCase()}/><DeviceInfoLine label="Browser" value={selectedDevice.browser || 'Chatterly Mobile'}/><DeviceInfoLine label="IP Address" value={selectedDevice.ipAddress || 'Not available'}/><DeviceInfoLine label="Last Login" value={formatTwoFactorDate(selectedDevice.lastLoginAt)}/><Pressable accessibilityLabel="Close" onPress={() => setSelectedDevice(null)} style={styles.modalCloseButton}><Text style={styles.modalCloseText}>Close</Text></Pressable></View> : null}</View></Modal>
    {notice === 'Trusted device removed.' ? <DeviceActionToast message={notice} onHide={() => setNotice('')}/> : <Snackbar message={notice} onHide={() => setNotice('')}/>}
  </View>;
}

function RemoveTrustedDeviceModal({busy, device, onCancel, onConfirm}: {busy: boolean; device: TrustedDevice | null; onCancel: () => void; onConfirm: () => void}) {
  return <Modal animationType="fade" onRequestClose={() => {if (!busy) { onCancel(); }}} statusBarTranslucent transparent visible={Boolean(device)}>
    <View style={styles.removeModalBackdrop}>
      <Pressable accessibilityLabel="Close remove device confirmation" disabled={busy} onPress={onCancel} style={StyleSheet.absoluteFill}/>
      {device ? <View accessibilityLabel="Remove this device confirmation" style={styles.removeModalCard}>
        <View style={styles.removeModalIcon}><ManageGlyph danger name="device"/></View>
        <Text style={styles.removeModalTitle}>Remove this device?</Text>
        <Text style={styles.removeModalBody}>{device.deviceName} will no longer be trusted. You will be asked for a verification code the next time you sign in on this device.</Text>
        <View style={styles.removeDeviceSummary}><View style={styles.removeSummaryIcon}><ManageGlyph danger={false} name="device"/></View><View style={styles.rowCopy}><Text style={styles.removeSummaryName}>{device.deviceName}</Text><Text style={styles.removeSummaryMeta}>{[device.platform.toUpperCase(), device.browser, device.ipAddress].filter(Boolean).join('  •  ')}</Text><Text style={styles.removeSummaryDate}>Trusted on: {formatTwoFactorDate(device.createdAt || device.lastLoginAt)}</Text></View></View>
        <Pressable accessibilityLabel={`Confirm Remove ${device.deviceName}`} disabled={busy} onPress={onConfirm} style={styles.removeModalAction}><Text style={styles.removeModalActionText}>{busy ? 'Removing...' : 'Remove Device'}</Text></Pressable>
        <Pressable accessibilityLabel="Cancel Remove Device" disabled={busy} onPress={onCancel} style={styles.removeModalCancel}><Text style={styles.removeModalCancelText}>Cancel</Text></Pressable>
      </View> : null}
    </View>
  </Modal>;
}

function RemoveAllTrustedDevicesModal({busy, onCancel, onConfirm, visible}: {busy: boolean; onCancel: () => void; onConfirm: () => void; visible: boolean}) {
  return <Modal animationType="fade" onRequestClose={() => {if (!busy) { onCancel(); }}} statusBarTranslucent transparent visible={visible}>
    <View style={styles.removeModalBackdrop}>
      <Pressable accessibilityLabel="Close remove all devices confirmation" disabled={busy} onPress={onCancel} style={StyleSheet.absoluteFill}/>
      <View accessibilityLabel="Remove all trusted devices confirmation" style={styles.removeModalCard}>
        <View style={styles.removeModalIcon}><ManageGlyph danger name="device"/></View>
        <Text style={styles.removeModalTitle}>Remove all trusted devices?</Text>
        <Text style={styles.removeModalBody}>This will remove all trusted devices from your account. You will be asked to enter a verification code the next time you sign in on any device. This will not sign you out immediately, but all devices will need to be trusted again after verification.</Text>
        <Pressable accessibilityLabel="Confirm Remove All Devices" disabled={busy} onPress={onConfirm} style={styles.removeModalAction}><Text style={styles.removeModalActionText}>{busy ? 'Removing...' : 'Remove Device'}</Text></Pressable>
        <Pressable accessibilityLabel="Cancel Remove All Devices" disabled={busy} onPress={onCancel} style={styles.removeModalCancel}><Text style={styles.removeModalCancelText}>Cancel</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

function DeviceActionToast({message, onHide}: {message: string; onHide: () => void}) {
  useEffect(() => { const timer = setTimeout(onHide, 3500); return () => clearTimeout(timer); }, [onHide]);
  return <View accessibilityLiveRegion="polite" style={styles.deviceActionToast}><View style={styles.deviceActionToastIcon}><ManageGlyph danger={false} name="device"/></View><Text style={styles.deviceActionToastText}>{message}</Text></View>;
}

function DeviceInfoLine({label, value}: {label: string; value: string}) {
  return <View style={styles.deviceInfoLine}><Text style={styles.deviceInfoLabel}>{label}</Text><Text numberOfLines={2} style={styles.deviceInfoValue}>{value}</Text></View>;
}

function CheckIcon() { return <Svg width={12} height={12} viewBox="0 0 12 12" fill="none"><Path d="m2.5 6.2 2.1 2.1 4.9-5" stroke={themeInk('#FFF')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function CopyIcon() { return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Rect x={8} y={8} width={10} height={11} rx={1.5} stroke={themeInk('#64748B')} strokeWidth={1.4}/><Path d="M15 8V6.5A1.5 1.5 0 0 0 13.5 5h-7A1.5 1.5 0 0 0 5 6.5v8A1.5 1.5 0 0 0 6.5 16H8" stroke={themeInk('#64748B')} strokeWidth={1.4}/></Svg>; }
function CloseHeader({onClose}: {onClose: () => void}) { const insets = useSafeAreaInsets(); return <View style={[styles.closeHeader, {paddingTop: insets.top + 6}]}><Pressable accessibilityLabel="Close" hitSlop={12} onPress={onClose} style={styles.closeButton}><Text style={styles.closeGlyph}>×</Text></Pressable></View>; }
function RecoveryHeader({onClose}: {onClose: () => void}) { const insets = useSafeAreaInsets(); return <View style={[styles.header, {paddingTop: insets.top + 6}]}><Pressable accessibilityLabel="Close recovery codes" hitSlop={12} onPress={onClose} style={styles.backButton}><Text style={styles.recoveryCloseGlyph}>×</Text></Pressable><View style={styles.headerHeading}><Text style={styles.headerTitle}>Save your recovery codes</Text></View><View style={styles.headerSpacer}/></View>; }
function SuccessCheck() { return <Svg width={64} height={64} viewBox="0 0 64 64"><Path d="M27.2 5.7a7 7 0 0 1 9.6 0l2.5 2.4 3.4-.1a7 7 0 0 1 7 7l-.1 3.4 2.4 2.5a7 7 0 0 1 0 9.6L49.6 33l.1 3.4a7 7 0 0 1-7 7l-3.4-.1-2.5 2.4a7 7 0 0 1-9.6 0l-2.5-2.4-3.4.1a7 7 0 0 1-7-7l.1-3.4-2.4-2.5a7 7 0 0 1 0-9.6l2.4-2.5-.1-3.4a7 7 0 0 1 7-7l3.4.1 2.5-2.4Z" fill={themeInk('#34CC9A')}/><Path d="m21 26.5 7 7L43 18.8" fill="none" stroke={themeInk('#FFF')} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function AuthenticatorGlyph() { return <Svg width={25} height={25} viewBox="0 0 24 24" fill="none"><Path d="M7 10V7.5a5 5 0 0 1 10 0V10M5 10h14v10H5V10Z" stroke={themeInk('#7137DD')} strokeWidth={1.4}/><Circle cx={8} cy={15} r={.8} fill={themeInk('#7137DD')}/><Circle cx={12} cy={15} r={.8} fill={themeInk('#7137DD')}/><Circle cx={16} cy={15} r={.8} fill={themeInk('#7137DD')}/></Svg>; }
function SmsGlyph() { return <Svg width={25} height={25} viewBox="0 0 24 24" fill="none"><Path d="M4.5 5.5h15v10.5h-10L5 19v-3H4.5V5.5Z" stroke={themeInk('#7137DD')} strokeWidth={1.4} strokeLinejoin="round"/><Path d="M8 9.5h8M8 12.5h5" stroke={themeInk('#7137DD')} strokeWidth={1.4} strokeLinecap="round"/></Svg>; }
function EmailGlyph() { return <Svg width={25} height={25} viewBox="0 0 24 24" fill="none"><Rect x={4} y={6.5} width={16} height={11} rx={1.5} stroke={themeInk('#7137DD')} strokeWidth={1.4}/><Path d="m5.5 8 6.5 4.5L18.5 8" stroke={themeInk('#7137DD')} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/></Svg>; }
function InfoIcon() { return <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={8.5} stroke={themeInk('#64748B')} strokeWidth={1.4}/><Path d="M12 11v5M12 8h.01" stroke={themeInk('#64748B')} strokeWidth={1.5} strokeLinecap="round"/></Svg>; }
function BottomContinue({bottom, disabled, label = 'Continue', onPress}: {bottom: number; disabled?: boolean; label?: string; onPress: () => void}) { return <View style={[styles.continueBar, {paddingBottom: Math.max(bottom, 24)}]}><Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{disabled: Boolean(disabled)}} disabled={disabled} onPress={onPress} style={({pressed}) => [styles.continueButton, disabled && styles.continueDisabled, pressed && !disabled && styles.continuePressed]}><Text style={styles.continueText}>{label}</Text></Pressable></View>; }
function RecoveryActions({bottom, onSave, onContinue}: {bottom: number; onSave: () => void; onContinue: () => void}) { return <View style={[styles.recoveryActions, {paddingBottom: Math.max(bottom, 24)}]}><Pressable accessibilityLabel="Save Codes" onPress={onSave} style={styles.saveCodesButton}><Text style={styles.saveCodesText}>Save Codes</Text></Pressable><Pressable accessibilityLabel="Continue" onPress={onContinue} style={styles.recoveryContinueButton}><Text style={styles.continueText}>Continue</Text></Pressable></View>; }
function TwoFactorSuccessToast({onHide}: {onHide: () => void}) { useEffect(() => { const timer = setTimeout(onHide, 3500); return () => clearTimeout(timer); }, [onHide]); return <View accessibilityLiveRegion="polite" style={styles.twoFactorToast}><View style={styles.toastIcon}><Text style={styles.toastIconText}>•••</Text></View><Text style={styles.twoFactorToastText}>2FA Added Successfully</Text></View>; }


function InfoCircleIcon() {
  return <Svg width={15} height={15} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={9} stroke={themeInk('#667085')} strokeWidth={1.8}/><Path d="M12 10.8v5.1M12 7.8h.01" stroke={themeInk('#667085')} strokeWidth={2} strokeLinecap="round"/></Svg>;
}

function TimerRadio({selected}: {selected: boolean}) {
  return <View style={[styles.timerRadio, selected && styles.timerRadioSelected]}>{selected ? <PathCheck/> : null}</View>;
}

function PathCheck() {
  return <Svg width={13} height={13} viewBox="0 0 16 16" fill="none"><Path d="m4 8.2 2.4 2.4L12 5" stroke={themeInk('#FFFFFF')} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function DisappearingMessagesScreen({duration, saving, onBack, onChange, notice, onHideNotice}: {duration: DisappearingMessageDuration; saving: boolean; onBack: () => void; onChange: (duration: DisappearingMessageDuration) => void; notice: string; onHideNotice: () => void}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<DisappearingMessageDuration>(duration);
  useEffect(() => setSelected(duration), [duration]);
  return <View style={styles.root}><Header title="Default Message Timer" onBack={onBack}/><ScrollView contentContainerStyle={styles.timerContent}>
    <Text style={styles.timerHeading}>Automatically delete messages in new chats</Text>
    <Text style={styles.timerIntro}>Choose how long messages stay in new conversations before they're automatically deleted. This won't affect your existing chats.</Text>
    <View style={styles.timerChoices}>{DISAPPEARING_TIMER_OPTIONS.map(option => <Pressable accessibilityLabel={timerLabel(option).toLowerCase()} accessibilityRole="radio" accessibilityState={{checked: selected === option}} disabled={saving} key={option} onPress={() => setSelected(option)} style={styles.timerChoiceRow}><TimerRadio selected={selected === option}/><Text style={styles.timerChoiceLabel}>{timerLabel(option)}</Text></Pressable>)}</View>
  </ScrollView><View style={[styles.timerBottom, {paddingBottom: Math.max(insets.bottom + 8, 16)}]}><View style={styles.timerInfoRow}><InfoCircleIcon/><Text style={styles.timerInfoText}><Text style={styles.timerInfoStrong}>This timer is applied only when you start a new conversation.</Text> Existing chats keep their current message timer unless you update them individually.</Text></View><Pressable accessibilityLabel="Update Default Timer" accessibilityRole="button" accessibilityState={{disabled: saving, busy: saving}} disabled={saving} onPress={() => onChange(selected)} style={({pressed}) => [styles.timerUpdateButton, (pressed || saving) && styles.continuePressed]}>{saving ? <ActivityIndicator color="#FFFFFF" size="small"/> : <Text style={styles.timerUpdateText}>Update Default Timer</Text>}</Pressable></View><Snackbar message={notice} onHide={onHideNotice}/></View>;
}

function durationLabel(duration: DisappearingMessageDuration): string { return timerLabel(duration); }
function durationStatus(duration: DisappearingMessageDuration): string { return duration === 'off' ? 'Turned Off' : durationLabel(duration); }

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#FFF'},
  header: {minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0'}, backButton: {width: 36, height: 42, justifyContent: 'center'}, headerHeading: {flex: 1, minWidth: 0}, headerTitle: {fontFamily: FONT, color: '#121826', fontWeight: '700', fontSize: 14}, headerSubtitle: {marginTop: 2, fontFamily: FONT, color: '#758196', fontSize: 9}, headerSpacer: {width: 36},
  search: {height: 40, marginHorizontal: 16, marginTop: 13, borderRadius: 7, borderWidth: 1, borderColor: '#F0F1F3', backgroundColor: '#F8F9FB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, gap: 8}, searchInput: {flex: 1, height: 40, padding: 0, fontFamily: FONT, fontSize: 10, color: '#101828'}, clearSearch: {fontFamily: FONT, color: '#667085', fontSize: 20, lineHeight: 22},
  mainContent: {paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40}, card: {backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#EAECF0', marginBottom: 14, overflow: 'hidden'}, privacyRow: {minHeight: 70, paddingTop: 13, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 10}, mainIcon: {width: 22, height: 24, alignItems: 'center', justifyContent: 'flex-start'}, rowPressed: {backgroundColor: '#F9F7FF'}, rowDivider: {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0'}, rowCopy: {flex: 1}, rowTitle: {fontFamily: FONT, color: '#172033', fontSize: 11, fontWeight: '600'}, rowSubtitle: {fontFamily: FONT, color: '#758196', fontSize: 9, lineHeight: 13, marginTop: 3}, inlineStatus: {alignSelf: 'flex-start', marginTop: 4}, trailing: {flexDirection: 'row', alignItems: 'center', gap: 6}, trailingValue: {fontFamily: FONT, fontSize: 8, color: '#667085'},
  statusPill: {borderRadius: 7, paddingHorizontal: 6, minHeight: 14, alignItems: 'center', justifyContent: 'center'}, statusPillEnabled: {backgroundColor: '#EAFBF1'}, statusPillDisabled: {backgroundColor: '#FFF0F1'}, statusPillNeutral: {backgroundColor: '#F2F4F7'}, statusPillText: {fontFamily: FONT, fontSize: 7, fontWeight: '600'}, statusTextEnabled: {color: '#16864B'}, statusTextDisabled: {color: '#D92D20'}, statusTextNeutral: {color: '#667085'},
  centerState: {flex: 1, minHeight: 230, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36}, errorTitle: {fontFamily: FONT, color: '#101828', fontSize: 13, fontWeight: '600'}, errorText: {fontFamily: FONT, color: '#667085', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 6}, primarySmall: {height: 34, marginTop: 14, paddingHorizontal: 17, borderRadius: 6, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center'}, primarySmallText: {fontFamily: FONT, color: '#FFF', fontSize: 10, fontWeight: '600'}, emptySearch: {alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24}, emptyTitle: {fontFamily: FONT, color: '#101828', fontSize: 13, fontWeight: '600'}, emptyText: {fontFamily: FONT, color: '#667085', fontSize: 10, marginTop: 5},
  detailContent: {padding: 16, paddingBottom: 42}, heroIcon: {width: 48, height: 48, alignSelf: 'center', marginTop: 8, borderRadius: 24, backgroundColor: '#F1EBFF', alignItems: 'center', justifyContent: 'center'}, detailTitle: {fontFamily: FONT, color: '#101828', fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 12}, detailDescription: {fontFamily: FONT, color: '#667085', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 7, marginHorizontal: 12}, detailStatus: {height: 50, marginTop: 20, marginBottom: 14, borderRadius: 9, paddingHorizontal: 14, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EAECF0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, detailStatusLabel: {fontFamily: FONT, color: '#344054', fontSize: 10, fontWeight: '600'}, detailLoader: {marginTop: 25}, detailRow: {height: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, detailRowText: {fontFamily: FONT, color: '#344054', fontSize: 10}, detailValue: {fontFamily: FONT, color: '#667085', fontSize: 9, fontWeight: '600'}, privacyFootnote: {fontFamily: FONT, color: '#667085', fontSize: 9, lineHeight: 14, textAlign: 'center', marginHorizontal: 20, marginTop: 6},
  blockedRow: {minHeight: 67, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10}, blockedAvatar: {width: 38, height: 38, borderRadius: 19}, blockedAvatarFallback: {width: 38, height: 38, borderRadius: 19, backgroundColor: '#EEE5FF', alignItems: 'center', justifyContent: 'center'}, blockedInitial: {fontFamily: FONT, color: PURPLE, fontWeight: '700', fontSize: 14}, unblockButton: {height: 28, paddingHorizontal: 10, borderRadius: 5, borderWidth: 1, borderColor: '#D6C5FF', backgroundColor: '#F8F5FF', alignItems: 'center', justifyContent: 'center'}, unblockText: {fontFamily: FONT, color: PURPLE, fontSize: 9, fontWeight: '600'},
  toggleDetailRow: {minHeight: 70, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 12}, choiceRow: {minHeight: 63, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center'}, radio: {width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#98A2B3', alignItems: 'center', justifyContent: 'center'}, radioSelected: {borderColor: PURPLE}, radioDot: {width: 9, height: 9, borderRadius: 5, backgroundColor: PURPLE},
  timerContent: {paddingHorizontal: 24, paddingTop: 23, paddingBottom: 140},
  timerHeading: {fontFamily: FONT, color: '#111827', fontSize: 13, fontWeight: '600', lineHeight: 18},
  timerIntro: {marginTop: 8, maxWidth: 314, fontFamily: FONT, color: '#64748B', fontSize: 10, lineHeight: 15},
  timerChoices: {marginTop: 27},
  timerChoiceRow: {height: 51, flexDirection: 'row', alignItems: 'center'},
  timerRadio: {width: 20, height: 20, borderRadius: 10, borderWidth: 1.4, borderColor: '#7D8CA3', alignItems: 'center', justifyContent: 'center'},
  timerRadioSelected: {borderColor: '#8B5CF6', backgroundColor: '#8B5CF6'},
  timerChoiceLabel: {marginLeft: 12, fontFamily: FONT, color: '#344054', fontSize: 13, fontWeight: '600'},
  timerBottom: {paddingHorizontal: 16, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0', backgroundColor: '#FFFFFF'},
  timerInfoRow: {minHeight: 45, marginBottom: 9, flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  timerInfoText: {flex: 1, fontFamily: FONT, color: '#475467', fontSize: 9, lineHeight: 13},
  timerInfoStrong: {fontWeight: '700', color: '#344054'},
  timerUpdateButton: {height: 44, borderRadius: 5, backgroundColor: '#8752F5', alignItems: 'center', justifyContent: 'center', shadowColor: '#6031C5', shadowOffset: {width: 0, height: 2}, shadowOpacity: .22, shadowRadius: 3, elevation: 3},
  timerUpdateText: {fontFamily: FONT, color: '#FFFFFF', fontSize: 11, fontWeight: '600'},
  twoFactorContent: {paddingHorizontal: 24, paddingTop: 24, paddingBottom: 120}, methodHeading: {fontFamily: FONT, color: '#111827', fontSize: 14, fontWeight: '500'}, methodDescription: {marginTop: 9, maxWidth: 330, fontFamily: FONT, color: '#536176', fontSize: 11, lineHeight: 16}, methodList: {marginTop: 26}, methodRow: {flexDirection: 'row', alignItems: 'flex-start', minHeight: 92}, methodRadio: {width: 19, height: 19, marginTop: 1, borderRadius: 10, borderWidth: 1.3, borderColor: '#60738E', alignItems: 'center', justifyContent: 'center'}, methodRadioSelected: {borderColor: '#8952F6', backgroundColor: '#8952F6'}, methodCopy: {flex: 1, minWidth: 0, marginLeft: 11}, methodTitleRow: {minHeight: 20, flexDirection: 'row', alignItems: 'center'}, methodTitle: {fontFamily: FONT, color: '#111827', fontSize: 13, fontWeight: '500'}, recommended: {height: 18, marginLeft: 10, paddingHorizontal: 7, borderRadius: 5, backgroundColor: '#EEE6FF', alignItems: 'center', justifyContent: 'center'}, recommendedText: {fontFamily: FONT, color: '#6F28F5', fontSize: 8}, methodBody: {marginTop: 2, maxWidth: 294, fontFamily: FONT, color: '#657188', fontSize: 10, lineHeight: 15},
  emailEntryContent: {flexGrow: 1, paddingHorizontal: 24, paddingTop: 27, paddingBottom: 120}, emailFieldLabel: {fontFamily: FONT, color: '#111827', fontSize: 10, fontWeight: '500', marginBottom: 9}, emailField: {height: 48, borderWidth: 1, borderColor: '#98A2B3', borderRadius: 5, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF'}, emailInput: {flex: 1, height: '100%', marginLeft: 10, padding: 0, fontFamily: FONT, color: '#111827', fontSize: 10}, emailBottomNote: {paddingHorizontal: 24, paddingBottom: 15, flexDirection: 'row', alignItems: 'center'}, emailBottomNoteText: {marginLeft: 9, fontFamily: FONT, color: '#475467', fontSize: 9},
  emailOtpContent: {flexGrow: 1, paddingHorizontal: 27, paddingTop: 35, paddingBottom: 120}, emailOtpInstruction: {fontFamily: FONT, color: '#667085', fontSize: 9, textAlign: 'center', marginBottom: 25}, emailOtpDestination: {color: '#111827', fontWeight: '600'}, emailOtpError: {marginTop: 10, fontFamily: FONT, color: '#D92D20', fontSize: 9, lineHeight: 13, textAlign: 'center'}, emailResendRow: {marginTop: 36, flexDirection: 'row', justifyContent: 'center', alignItems: 'center'}, emailResendPrompt: {fontFamily: FONT, color: '#667085', fontSize: 9}, emailResendTimer: {fontFamily: FONT, color: '#111827', fontSize: 9, fontWeight: '600'}, emailResendAction: {fontFamily: FONT, color: PURPLE, fontSize: 9, fontWeight: '600'},
  smsPhoneContent: {flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 120}, smsFieldLabel: {fontFamily: FONT, color: '#111827', fontSize: 10, fontWeight: '500', marginBottom: 9}, smsCountryField: {height: 48, borderWidth: 1, borderColor: '#E1E6ED', borderRadius: 5, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF'}, smsCountryFlag: {fontSize: 15, marginRight: 8}, smsCountryText: {flex: 1, fontFamily: FONT, color: '#344054', fontSize: 10}, smsChevron: {fontFamily: FONT, color: '#667085', fontSize: 16}, smsPhoneLabel: {marginTop: 23}, smsPhoneField: {height: 48, borderWidth: 1, borderColor: '#E1E6ED', borderRadius: 5, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF'}, smsPhoneGlyph: {color: '#64748B', fontSize: 15, marginRight: 10}, smsPhoneInput: {flex: 1, height: '100%', padding: 0, fontFamily: FONT, color: '#111827', fontSize: 10}, smsBottomNote: {paddingHorizontal: 24, paddingBottom: 15, flexDirection: 'row', alignItems: 'center'}, smsBottomNoteText: {flex: 1, marginLeft: 9, fontFamily: FONT, color: '#475467', fontSize: 9, lineHeight: 13}, smsFieldLocked: {backgroundColor: '#F6F7F9', borderColor: '#E9ECF1'}, smsAccountNumberNote: {marginTop: 12, fontFamily: FONT, color: '#667085', fontSize: 10, lineHeight: 15},
  smsOtpContent: {flexGrow: 1, paddingHorizontal: 27, paddingTop: 35, paddingBottom: 120}, smsOtpInstruction: {fontFamily: FONT, color: '#667085', fontSize: 9, textAlign: 'center', marginBottom: 25}, smsOtpDestination: {color: '#111827', fontWeight: '600'}, smsResendRow: {marginTop: 36, flexDirection: 'row', justifyContent: 'center', alignItems: 'center'}, smsResendPrompt: {fontFamily: FONT, color: '#667085', fontSize: 9}, smsResendTimer: {fontFamily: FONT, color: '#111827', fontSize: 9, fontWeight: '600'}, smsResendAction: {fontFamily: FONT, color: PURPLE, fontSize: 9, fontWeight: '600'},
  countryBackdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,.4)'}, countrySheet: {maxHeight: '85%', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 34, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#FFF'}, countrySheetTitle: {fontFamily: FONT, color: '#111827', fontSize: 17, fontWeight: '700', marginBottom: 10}, countryOption: {height: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0'}, countryOptionFlag: {fontSize: 19, marginRight: 12}, countryOptionName: {flex: 1, fontFamily: FONT, color: '#344054', fontSize: 13}, countryOptionCode: {fontFamily: FONT, color: '#667085', fontSize: 12}, countryOptionCheck: {marginLeft: 12, color: PURPLE, fontSize: 16, fontWeight: '700'},
  manageContent: {paddingHorizontal: 16, paddingTop: 4, paddingBottom: 42}, manageRow: {minHeight: 72, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F2F5'}, manageIcon: {width: 38, height: 38, marginRight: 11, borderRadius: 10, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center'}, manageDangerIcon: {backgroundColor: '#FFF0F1'}, manageTitle: {fontFamily: FONT, color: '#111827', fontSize: 12, fontWeight: '600'}, manageDangerText: {color: '#E43D48'}, manageSubtitle: {marginTop: 3, fontFamily: FONT, color: '#64748B', fontSize: 9, lineHeight: 13}, manageChevron: {width: 20, fontFamily: FONT, color: '#94A3B8', fontSize: 22, textAlign: 'right'}, manageDisabled: {opacity: .55},
  trustedContent: {paddingHorizontal: 20, paddingTop: 18}, trustedHeadingRow: {flexDirection: 'row', alignItems: 'center', gap: 7}, trustedHeading: {fontFamily: FONT, color: '#111827', fontSize: 13, fontWeight: '700'}, deviceCount: {minWidth: 20, height: 18, paddingHorizontal: 6, borderRadius: 9, backgroundColor: '#F1EBFF', alignItems: 'center', justifyContent: 'center'}, deviceCountText: {fontFamily: FONT, color: PURPLE, fontSize: 9, fontWeight: '700'}, trustedIntro: {marginTop: 5, marginBottom: 13, fontFamily: FONT, color: '#64748B', fontSize: 9, lineHeight: 14}, deviceRow: {minHeight: 82, paddingVertical: 11, flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EDF0F4'}, deviceGlyph: {width: 36, height: 36, marginRight: 10, borderRadius: 9, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center'}, deviceTitleRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6}, deviceName: {maxWidth: 145, fontFamily: FONT, color: '#111827', fontSize: 11, fontWeight: '600'}, activeBadge: {height: 14, paddingHorizontal: 5, borderRadius: 7, backgroundColor: '#EAFBF1', alignItems: 'center', justifyContent: 'center'}, activeBadgeText: {fontFamily: FONT, color: '#16864B', fontSize: 7, fontWeight: '600'}, deviceMeta: {marginTop: 4, fontFamily: FONT, color: '#64748B', fontSize: 8, lineHeight: 12}, deviceLastLogin: {marginTop: 3, fontFamily: FONT, color: '#8792A4', fontSize: 8, lineHeight: 12}, deviceRemove: {width: 34, height: 34, alignItems: 'center', justifyContent: 'center'}, deviceRemoveText: {fontFamily: FONT, color: '#E43D48', fontSize: 20, lineHeight: 22}, trustedEmpty: {paddingVertical: 35, paddingHorizontal: 18, alignItems: 'center'}, addDeviceButton: {height: 42, marginTop: 18, borderWidth: 1, borderColor: '#CDB9FA', borderRadius: 6, backgroundColor: '#F8F5FF', alignItems: 'center', justifyContent: 'center'}, addDeviceText: {fontFamily: FONT, color: PURPLE, fontSize: 10, fontWeight: '600'}, currentRegistered: {height: 38, marginTop: 16, borderRadius: 19, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center'}, currentRegisteredText: {fontFamily: FONT, color: '#475569', fontSize: 9, fontWeight: '600'}, trustedSafety: {marginTop: 15, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'flex-start', gap: 8}, trustedSafetyText: {flex: 1, fontFamily: FONT, color: '#64748B', fontSize: 9, lineHeight: 14}, removeAllButton: {height: 44, marginTop: 14, borderRadius: 5, backgroundColor: '#8752F5', alignItems: 'center', justifyContent: 'center'}, deviceModalBackdrop: {flex: 1, paddingHorizontal: 28, backgroundColor: 'rgba(15,23,42,.45)', alignItems: 'center', justifyContent: 'center'}, deviceModal: {width: '100%', padding: 20, borderRadius: 14, backgroundColor: '#FFF'}, deviceModalTitle: {fontFamily: FONT, color: '#111827', fontSize: 14, fontWeight: '700'}, deviceModalName: {marginTop: 5, marginBottom: 14, fontFamily: FONT, color: '#64748B', fontSize: 11}, deviceInfoLine: {minHeight: 38, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0'}, deviceInfoLabel: {fontFamily: FONT, color: '#64748B', fontSize: 9}, deviceInfoValue: {flex: 1, fontFamily: FONT, color: '#111827', fontSize: 9, fontWeight: '600', textAlign: 'right'}, modalCloseButton: {height: 40, marginTop: 16, borderRadius: 6, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center'}, modalCloseText: {fontFamily: FONT, color: '#FFF', fontSize: 10, fontWeight: '600'},
  removeModalBackdrop: {flex: 1, paddingHorizontal: 24, backgroundColor: 'rgba(15,23,42,.42)', alignItems: 'center', justifyContent: 'center'}, removeModalCard: {width: '100%', maxWidth: 360, paddingHorizontal: 25, paddingTop: 22, paddingBottom: 16, borderRadius: 14, backgroundColor: '#FFF', alignItems: 'center', shadowColor: '#101828', shadowOffset: {width: 0, height: 12}, shadowOpacity: .22, shadowRadius: 24, elevation: 12}, removeModalIcon: {width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF0F1', alignItems: 'center', justifyContent: 'center'}, removeModalTitle: {marginTop: 16, fontFamily: FONT, color: '#111827', fontSize: 13, fontWeight: '700', textAlign: 'center'}, removeModalBody: {marginTop: 8, fontFamily: FONT, color: '#64748B', fontSize: 9, lineHeight: 14, textAlign: 'center'}, removeDeviceSummary: {width: '100%', minHeight: 70, marginTop: 16, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#EAECF0', borderRadius: 9, flexDirection: 'row', alignItems: 'flex-start'}, removeSummaryIcon: {width: 34, height: 34, marginRight: 9, borderRadius: 9, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center'}, removeSummaryName: {fontFamily: FONT, color: '#111827', fontSize: 10, fontWeight: '600'}, removeSummaryMeta: {marginTop: 3, fontFamily: FONT, color: '#64748B', fontSize: 8, lineHeight: 11}, removeSummaryDate: {marginTop: 3, fontFamily: FONT, color: '#8792A4', fontSize: 8, lineHeight: 11}, removeModalAction: {height: 42, marginTop: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center'}, removeModalActionText: {fontFamily: FONT, color: '#EF4444', fontSize: 10, fontWeight: '600'}, removeModalCancel: {height: 38, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center'}, removeModalCancelText: {fontFamily: FONT, color: '#111827', fontSize: 10, fontWeight: '500'}, deviceActionToast: {position: 'absolute', bottom: 17, alignSelf: 'center', minHeight: 42, maxWidth: '88%', paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: '#E4E7EC', borderRadius: 22, backgroundColor: '#F8F9FB', flexDirection: 'row', alignItems: 'center', shadowColor: '#101828', shadowOffset: {width: 0, height: 2}, shadowOpacity: .08, shadowRadius: 5, elevation: 5}, deviceActionToastIcon: {width: 22, height: 22, marginRight: 7, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 11, alignItems: 'center', justifyContent: 'center'}, deviceActionToastText: {flexShrink: 1, fontFamily: FONT, color: '#344054', fontSize: 9, fontWeight: '500'},
  continueBar: {paddingHorizontal: 16, paddingTop: 13, backgroundColor: '#FFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0'}, continueButton: {height: 44, borderRadius: 5, backgroundColor: '#8752F5', alignItems: 'center', justifyContent: 'center', shadowColor: '#6031C5', shadowOffset: {width: 0, height: 2}, shadowOpacity: .22, shadowRadius: 3, elevation: 3}, continuePressed: {opacity: .9}, continueDisabled: {opacity: .55}, continueText: {fontFamily: FONT, color: '#FFF', fontSize: 11, fontWeight: '500'},
  authSetupContent: {paddingHorizontal: 24, paddingTop: 24, paddingBottom: 120}, authSetupIntro: {fontFamily: FONT, color: '#111827', fontSize: 13, fontWeight: '500', lineHeight: 18}, supportedLabel: {marginTop: 7, fontFamily: FONT, color: '#657188', fontSize: 10}, supportedList: {marginTop: 2, marginLeft: 6}, supportedItem: {fontFamily: FONT, color: '#657188', fontSize: 10, lineHeight: 16}, scanLabel: {marginTop: 34, alignSelf: 'center', fontFamily: FONT, color: '#111827', fontSize: 13, fontWeight: '500'}, qrArea: {width: 154, height: 154, marginTop: 18, alignSelf: 'center', alignItems: 'center', justifyContent: 'center'}, authQr: {width: 154, height: 154}, retrySetup: {fontFamily: FONT, color: PURPLE, fontSize: 11, fontWeight: '600'}, manualLabel: {marginTop: 24, alignSelf: 'center', fontFamily: FONT, color: '#657188', fontSize: 10}, manualKeyField: {height: 42, marginTop: 8, borderWidth: 1, borderColor: '#E4E7EC', borderRadius: 7, paddingLeft: 11, flexDirection: 'row', alignItems: 'center'}, manualKeyText: {flex: 1, minWidth: 0, fontFamily: FONT, color: '#111827', fontSize: 12, fontWeight: '500'}, copyButton: {width: 42, height: 40, alignItems: 'center', justifyContent: 'center'},
  verifyContent: {paddingHorizontal: 24, paddingTop: 23, paddingBottom: 120}, verifyInstruction: {fontFamily: FONT, color: '#5F6C80', fontSize: 10, lineHeight: 15}, otpRow: {marginTop: 20, flexDirection: 'row', gap: 8}, otpBox: {width: 39, height: 39, padding: 0, borderWidth: 1, borderColor: '#CAD3E0', borderRadius: 7, backgroundColor: '#FFF', textAlign: 'center', fontFamily: FONT, color: '#111827', fontSize: 14, fontWeight: '500'}, otpBoxFocused: {borderColor: '#506078', borderWidth: 1.4}, otpError: {marginTop: 10, fontFamily: FONT, color: '#D92D20', fontSize: 10, lineHeight: 14},
  closeHeader: {minHeight: 62, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: '#FFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0'}, closeButton: {width: 36, height: 42, justifyContent: 'center'}, closeGlyph: {fontFamily: FONT, color: '#172033', fontSize: 25, fontWeight: '300', lineHeight: 28}, successContent: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 65}, successIcon: {width: 68, height: 68, alignItems: 'center', justifyContent: 'center'}, successTitle: {marginTop: 28, fontFamily: FONT, color: '#111827', fontSize: 16, fontWeight: '700', textAlign: 'center'}, successSubtitle: {marginTop: 7, fontFamily: FONT, color: '#657188', fontSize: 10, lineHeight: 15, textAlign: 'center'}, verificationCard: {width: '100%', height: 58, marginTop: 20, paddingHorizontal: 7, borderWidth: 1, borderColor: '#E4E7EC', borderRadius: 6, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center'}, verificationIcon: {width: 44, height: 44, marginRight: 9, borderWidth: 1, borderColor: '#DCCEFF', borderRadius: 4, backgroundColor: '#F2ECFF', alignItems: 'center', justifyContent: 'center'}, verificationLabel: {fontFamily: FONT, color: '#657188', fontSize: 9}, verificationValue: {marginTop: 3, fontFamily: FONT, color: '#111827', fontSize: 13, fontWeight: '500'}, successInfo: {minHeight: 56, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0', flexDirection: 'row', alignItems: 'flex-start', gap: 10}, successInfoText: {fontFamily: FONT, color: '#344054', fontSize: 10, lineHeight: 15},
  recoveryContent: {paddingHorizontal: 16, paddingTop: 19, paddingBottom: 120}, recoveryCloseGlyph: {fontFamily: FONT, color: '#172033', fontSize: 24, fontWeight: '300', lineHeight: 28}, recoveryDescription: {fontFamily: FONT, color: '#657188', fontSize: 10, lineHeight: 15}, recoveryGrid: {marginTop: 39, paddingHorizontal: 17, flexDirection: 'row', flexWrap: 'wrap', rowGap: 45}, recoveryCode: {width: '50%', fontFamily: FONT, color: '#111827', fontSize: 12, fontWeight: '600', letterSpacing: 4}, recoveryActions: {paddingHorizontal: 16, paddingTop: 13, backgroundColor: '#FFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0', flexDirection: 'row', gap: 7}, saveCodesButton: {flex: 1, height: 44, borderWidth: 1, borderColor: '#D5DCE6', borderRadius: 5, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center'}, saveCodesText: {fontFamily: FONT, color: '#111827', fontSize: 11, fontWeight: '500'}, recoveryContinueButton: {flex: 1, height: 44, borderRadius: 5, backgroundColor: '#8752F5', alignItems: 'center', justifyContent: 'center', shadowColor: '#6031C5', shadowOffset: {width: 0, height: 2}, shadowOpacity: .22, shadowRadius: 3, elevation: 3}, twoFactorToast: {position: 'absolute', bottom: 17, alignSelf: 'center', height: 44, paddingHorizontal: 13, borderWidth: 1, borderColor: '#E4E7EC', borderRadius: 23, backgroundColor: '#F8F9FB', flexDirection: 'row', alignItems: 'center', shadowColor: '#101828', shadowOffset: {width: 0, height: 2}, shadowOpacity: .08, shadowRadius: 5, elevation: 3}, toastIcon: {width: 20, height: 20, marginRight: 8, borderWidth: 1, borderColor: '#344054', borderRadius: 6, alignItems: 'center', justifyContent: 'center'}, toastIconText: {color: '#344054', fontSize: 7, lineHeight: 9, letterSpacing: -1}, twoFactorToastText: {fontFamily: FONT, color: '#111827', fontSize: 10, fontWeight: '500'},
  pickerBackdrop: {flex: 1, padding: 26, backgroundColor: 'rgba(15,23,42,.45)', alignItems: 'center', justifyContent: 'center'}, pickerSheet: {width: '100%', maxHeight: '70%', paddingVertical: 8, borderRadius: 14, backgroundColor: '#FFF'}, pickerTitle: {paddingHorizontal: 16, paddingVertical: 10, fontFamily: FONT, color: '#111827', fontSize: 12, fontWeight: '700'}, pickerList: {paddingBottom: 6}, pickerRow: {minHeight: 46, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10}, pickerName: {flex: 1, minWidth: 0, fontFamily: FONT, color: '#344054', fontSize: 11}, pickerCheck: {fontFamily: FONT, color: PURPLE, fontSize: 10, fontWeight: '700'},
});
