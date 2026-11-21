import {CallEndedScreen} from './src/components/CallEndedScreen';
import {subscribeToCallHold} from './src/services/callAudio';
import {joinConferenceOverSocket} from './src/services/chatRealtime';
import {callDuration} from './src/utils/callSummary';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Pressable, StatusBar, Text, View } from 'react-native';
import {getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync} from 'expo-audio';
import {Camera} from 'expo-camera';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmailLoadingScreen } from './src/screens/EmailLoadingScreen';
import { EmailLoginScreen } from './src/screens/EmailLoginScreen';
import { OtpVerificationScreen } from './src/screens/OtpVerificationScreen';
import { PhoneLoadingScreen } from './src/screens/PhoneLoadingScreen';
import { PhoneNumberLoginScreen } from './src/screens/PhoneNumberLoginScreen';
import { ProfileSetupScreen } from './src/screens/ProfileSetupScreen';
import { ContactsScreen } from './src/screens/ContactsScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { ChatListScreen } from './src/screens/ChatListScreen';
import {startIncomingShareLifecycle, type IncomingMediaShare} from './src/services/incomingShare';
import { CallsScreen } from './src/screens/CallsScreen';
import { BroadcastScreen } from './src/screens/BroadcastScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { SettingsScreen } from './src/screens/ProfileSettingsScreen';
import {IncomingCallExperience, type IncomingCallPresentation} from './src/components/IncomingCallExperience';
import {IncomingGroupCall} from './src/components/IncomingGroupCall';
import {GroupCallScreen} from './src/screens/GroupCallScreen';
import type {CallAudioRoute} from './src/services/callAudioRoutes';
import {getCallStatus} from './src/services/chatApi';
import { googleLogin, logoutSession } from './src/services/authApi';
import { GoogleSignInCancelledError, setPendingPhoneVerification, signInWithGoogle, signOutOfFirebase, startPhoneVerification } from './src/services/firebaseAuth';
import {getRegisteredUser} from './src/services/contactsApi';
import {splitPhoneNumber} from './src/utils/phoneNumber';
import { clearLocalCache } from './src/services/localCache';
import {acceptCallOverSocket, connectRealtime, disconnectRealtime, endCallOverSocket, joinCallRoom, rejectCallOverSocket, setCallMutedOverSocket, setCallSpeakerOverSocket, subscribeToCall, subscribeToIncomingCalls} from './src/services/chatRealtime';
import {handleCallAudioSignal, setCallAudioHeld, setCallAudioMuted, setCallVideoEnabled, startCallAudio, stopCallAudio} from './src/services/callAudio';
import { clearSession, getToken, markSessionProfileComplete, restoreSession, saveSession, type Session } from './src/services/sessionStore';
import * as notificationService from './src/services/notificationService';
import {publishCallActivity} from './src/services/callActivity';
import {subscribeToBackgroundCallEnd} from './src/services/callBackground';
import {startCallAvailabilityLifecycle} from './src/services/callAvailability';
import type { NotificationTarget } from './src/services/notificationService';
import type { AuthOutcome, AuthUser } from './src/types/auth';
import type { OtpDestination } from './src/types/otp';
import type { RegistrationMethod } from './src/types/registration';
import type { ConversationContact } from './src/types/chat';
import type { BroadcastList } from './src/services/broadcastApi';
import type { SimilarGroupDraft } from './src/utils/groupAdmin';
import type {IncomingCall} from './src/types/call';
import type {GroupCallInvite, GroupCallOutcome, GroupCallSession} from './src/types/groupCall';
import {findActiveGroupCall, findAnnouncedGroupCallId, getGroupCallDetails} from './src/services/groupCallApi';
import {getGroupDetails} from './src/services/groupApi';
import {joinGroupCall, startGroupCall, subscribeToGroupCallInvitations} from './src/services/groupCallRealtime';
import type {CallType} from './src/services/chatRealtime';
import {GroupCallIcon} from './src/components/GroupCallIcons';
import {formatGroupCallDuration} from './src/utils/groupCallModel';
import {ThemeProvider, useTheme} from './src/theme/ThemeProvider';
import {createThemedStyles} from './src/theme/themedStyles';
import {ChatWallpaperProvider} from './src/wallpaper/ChatWallpaperProvider';
import {subscribeToSessionExpiration} from './src/api/client';
import {Snackbar} from './src/components/Snackbar';
import {markCallsSeen, refreshMissedCallBadge, resetMissedCallBadge} from './src/services/missedCallBadge';
import {resetUnreadChatCount} from './src/services/unreadBadge';
import {startAutoDownloadReceiving} from './src/services/autoDownload';
import {getAutoDownloadSettings} from './src/services/mediaPreferencesApi';
import {flushDataUsage} from './src/services/dataUsage';


export type Route =
  | 'welcome'
  | 'phone-loading'
  | 'email-loading'
  | 'otp'
  | 'profile-setup'
  | 'contacts'
  | 'chats'
  | 'calls'
  | 'settings'
  | 'conversation'
  | 'broadcast'
  | RegistrationMethod;

export function resolveAuthenticatedRoute(outcome: AuthOutcome): Extract<Route, 'welcome' | 'profile-setup' | 'chats'> {
  if (outcome.requires2FA || !outcome.token) { return 'welcome'; }
  return outcome.isProfileComplete ? 'chats' : 'profile-setup';
}

export function resolveLaunchRoute(session: Session | null): Extract<Route, 'welcome' | 'profile-setup' | 'chats'> {
  if (!session?.token) { return 'welcome'; }
  return session.isProfileComplete ? 'chats' : 'profile-setup';
}

/**
 * The ongoing-call bar shown once a conference is minimized. It stays fixed at
 * the top while the active route reserves the same row beneath it, so the call
 * remains reachable without covering chat or group details.
 */
function GroupCallBanner({onReturn, session}: {onReturn: () => void; session: GroupCallSession}) {
  const insets = useSafeAreaInsets();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.parse(session.startedAt);
    const tick = () => setElapsed(Number.isFinite(startedAt) ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [session.startedAt]);

  return (
    <Pressable
      accessibilityLabel={`Return to the ${session.groupName} call`}
      accessibilityRole="button"
      onPress={onReturn}
      style={[styles.groupCallBanner, {paddingTop: insets.top}]}>
      <View style={styles.groupCallBannerRow}>
        <GroupCallIcon color="#FFFFFF" name="participants" size={15} />
        <Text numberOfLines={1} style={styles.groupCallBannerText}>{session.groupName}</Text>
        <Text style={styles.groupCallBannerTimer}>{formatGroupCallDuration(elapsed)}</Text>
        <Text style={styles.groupCallBannerAction}>Tap to return</Text>
      </View>
    </Pressable>
  );
}

function App(): React.JSX.Element {
  // Reading the theme here is what repaints the whole app when it changes: the
  // screens are this component's children, so they re-render with it.
  const {isDark} = useTheme();
  const [route, setRoute] = useState<Route>('welcome');
  const [showPostProfileContactsPrompt, setShowPostProfileContactsPrompt] = useState(false);
  const routeRef = useRef<Route>('welcome');
  const routeHistoryRef = useRef<Route[]>([]);
  const isNavigatingBackRef = useRef(false);
  const [contactsEntryMode, setContactsEntryMode] = useState<'list' | 'create' | 'createGroup' | 'createBroadcast'>('list');
  const [settingsInitialScreen, setSettingsInitialScreen] = useState<'settings' | 'edit'>('settings');
  const [hydrating, setHydrating] = useState(true);
  const [authenticatedUserId, setAuthenticatedUserId] = useState('');
  const [otpDestination, setOtpDestination] = useState<OtpDestination | null>(null);
  const [profileSession, setProfileSession] = useState<{ token: string; userId?: string; name?: string } | null>(null);
  const [conversation, setConversation] = useState<{ chatId: string; contact: ConversationContact } | null>(null);
  const notificationOpenSequence = useRef(0);
  const [incomingMediaShare, setIncomingMediaShare] = useState<IncomingMediaShare | null>(null);
  const [shareNeedsRecipient, setShareNeedsRecipient] = useState(false);
  const [chatListNotice, setChatListNotice] = useState('');
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState('');
  useEffect(() => startIncomingShareLifecycle(share => {
    setIncomingMediaShare(share);
    setShareNeedsRecipient(true);
  }, message => Alert.alert('Share media', message)), []);
  useEffect(() => {
    if (!hydrating && authenticatedUserId && route !== 'profile-setup' && shareNeedsRecipient) {
      setConversation(null);
      setChatListNotice('Select a chat to share your media.');
      setRoute('chats');
      setShareNeedsRecipient(false);
    }
  }, [authenticatedUserId, hydrating, route, shareNeedsRecipient]);
  const [broadcast, setBroadcast] = useState<BroadcastList | null>(null);
  const [groupDraft, setGroupDraft] = useState<SimilarGroupDraft | null>(null);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [endedIncoming, setEndedIncoming] = useState<(IncomingCall & {duration: number}) | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const summaryActionRef = useRef(false);
  const incomingRef = useRef<IncomingCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [notificationCallAction, setNotificationCallAction] = useState<{
    callId: string; action: notificationService.IncomingCallNotificationAction;
  } | null>(null);
  const callActionLock = useRef(false);
  const [callBusy, setCallBusy] = useState(false);
  incomingRef.current = incomingCall;
  useEffect(() => subscribeToCallHold((callId, held) => {
    setIncomingCall(current => current?.callId === callId && current.held !== held ? {...current, held} : current);
  }), []);
  useEffect(() => {
    if (!incomingCall || incomingCall.status !== 'calling') return;
    const notify = () => { notificationService.notifyIncomingCall(incomingCall).catch(() => undefined); };
    notify();
    const subscription = AppState.addEventListener('change', notify);
    return () => subscription.remove();
  }, [incomingCall]);
  const previousIncomingActivity = useRef<IncomingCall | null>(null);
  useEffect(() => {
    const previous = previousIncomingActivity.current;
    const status = incomingCall?.status === 'connected' ? 'answered' : incomingCall?.status === 'missed' ? 'missed' : null;
    if (incomingCall && status && (previous?.callId !== incomingCall.callId || previous.status !== incomingCall.status)) {
      publishCallActivity({callId: incomingCall.callId, chatId: incomingCall.chatId || '', contactId: incomingCall.callerId, contactName: incomingCall.callerName, type: incomingCall.type, direction: 'incoming', status});
    } else if (!incomingCall && previous) {
      publishCallActivity({callId: previous.callId, chatId: previous.chatId || '', contactId: previous.callerId, contactName: previous.callerName, type: previous.type, direction: 'incoming', status: 'ended'});
    }
    previousIncomingActivity.current = incomingCall;
  }, [incomingCall]);
  const [retryCall, setRetryCall] = useState<{id: string; type: 'audio' | 'video'} | null>(null);
  const [incomingCallPresentation, setIncomingCallPresentation] = useState<IncomingCallPresentation>('dismissed');
  const [outgoingCallState, setOutgoingCallState] = useState({active: false, minimized: false});
  useEffect(() => startCallAvailabilityLifecycle(authenticatedUserId), [authenticatedUserId]);
  const [minimizeOutgoingCallRequest, setMinimizeOutgoingCallRequest] = useState(0);
  const [restoreOutgoingCallRequest, setRestoreOutgoingCallRequest] = useState(0);
  useEffect(() => {
    if (outgoingCallState.active && route !== 'conversation' && conversation) {
      setMinimizeOutgoingCallRequest(value => value + 1);
    }
  }, [conversation, outgoingCallState.active, route]);
  const [pendingTwoFactor, setPendingTwoFactor] = useState<{
    userId: string;
    method: string;
  } | null>(null);
  // The number a phone sign-in just verified. When that account also has SMS
  // two-step verification, its second code goes to this same number.
  const lastSignInPhoneRef = useRef<{dialCode: string; phone: string} | null>(null);

  // This app uses local route state instead of a navigation library. Keep the
  // route history here so Android's system Back button has the same stack to
  // return through as the visible in-app navigation.
  useEffect(() => {
    if (routeRef.current === route) { return; }
    if (isNavigatingBackRef.current) {
      isNavigatingBackRef.current = false;
    } else {
      routeHistoryRef.current.push(routeRef.current);
    }
    routeRef.current = route;
  }, [route]);

  // Sprint 9 Story 2. The conference lives at app level rather than inside the
  // conversation, so an invitation can arrive on any screen and a call survives
  // navigating away from the group thread.
  const [groupCall, setGroupCall] = useState<GroupCallSession | null>(null);
  const [groupCallMinimized, setGroupCallMinimized] = useState(false);
  const [groupCallInvite, setGroupCallInvite] = useState<GroupCallInvite | null>(null);
  const [groupCallBusy, setGroupCallBusy] = useState(false);
  const groupCallRef = useRef<GroupCallSession | null>(null);
  const groupCallLock = useRef(false);
  // Calls this device has already answered or dismissed, so a repeated
  // invitation broadcast cannot make the prompt reappear.
  const handledGroupCalls = useRef<Set<string>>(new Set());
  groupCallRef.current = groupCall;

  useEffect(() => {
    let active = true;
    restoreSession().then(restored => {
      if (!active) { return; }
      const nextRoute = resolveLaunchRoute(restored);
      if (!restored) {
        disconnectRealtime();
        setAuthenticatedUserId('');
        setProfileSession(null);
        setRoute('welcome');
        return;
      }

      setAuthenticatedUserId(String(restored.user?.id || ''));
      setContactsEntryMode('list');
      setProfileSession(nextRoute === 'profile-setup'
        ? {token: restored.token, userId: restored.user?.id, name: restored.user?.name}
        : null);
      routeHistoryRef.current = [];
      isNavigatingBackRef.current = true;
      setRoute(nextRoute);
      connectRealtime();
    }).finally(() => {
      if (active) { setHydrating(false); }
    });
    return () => { active = false; };
  }, []);

  const showWelcome = useCallback(() => {
    setPendingTwoFactor(null);
    setOtpDestination(null);
    lastSignInPhoneRef.current = null;
    setRoute('welcome');
  }, []);
  const showPhoneRegistration = useCallback(() => setRoute('phone'), []);
  const showEmailLogin = useCallback(() => {
    lastSignInPhoneRef.current = null;
    setRoute('email');
  }, []);
  const continueWith = useCallback((method: RegistrationMethod) => {
    setRoute(method === 'phone' ? 'phone-loading' : 'email-loading');
  }, []);

  const verifyEmail = useCallback((email: string) => {
    setOtpDestination({ channel: 'email', email });
    setRoute('otp');
  }, []);

  const verifyPhone = useCallback((dialCode: string, phone: string) => {
    if (!pendingTwoFactor) { lastSignInPhoneRef.current = {dialCode, phone}; }
    setOtpDestination(pendingTwoFactor
      ? {channel: 'two-factor-sms', userId: pendingTwoFactor.userId, dialCode, phone}
      : {channel: 'phone', dialCode, phone});
    setRoute('otp');
  }, [pendingTwoFactor]);

  /**
   * Sends the SMS two-step code to the account's own number and opens the code
   * screen. complete-login-2fa signs in whichever account owns the number
   * Firebase verified, so the code must go to the number on this account - not
   * one typed in. A phone sign-in has just proved that number; for email and
   * Google sign-ins it is read from the account. Only when it cannot be found
   * does the user fall back to entering it.
   */
  const sendTwoFactorSmsCode = useCallback(async (userId: string): Promise<boolean> => {
    let target = lastSignInPhoneRef.current;
    if (!target) {
      const registered = await getRegisteredUser(userId).catch(() => null);
      const split = splitPhoneNumber(registered?.phone);
      if (split) { target = {dialCode: split.country.dialCode, phone: split.local}; }
    }
    if (!target) { return false; }
    const verification = await startPhoneVerification(`${target.dialCode}${target.phone}`);
    setPendingPhoneVerification(verification);
    setOtpDestination({channel: 'two-factor-sms', userId, dialCode: target.dialCode, phone: target.phone});
    setRoute('otp');
    return true;
  }, []);

  // The one place every sign-in method lands, matching how the web LoginPage
  // and OtpPage both branch after a successful call.
  const handleAuthenticated = useCallback(async (outcome: AuthOutcome) => {
    // 2FA is on for this account and this device is not trusted: there is no
    // token yet, so the step-up challenge has to run before a session exists.
    if (outcome.requires2FA) {
      clearSession().catch(() => undefined);
      disconnectRealtime();
      setAuthenticatedUserId('');
      const challenge = {
        userId: outcome.twoFactorUserId,
        method: outcome.twoFactorMethod,
      };
      setPendingTwoFactor(challenge);
      if (outcome.twoFactorMethod === 'authenticator') {
        setOtpDestination({channel: 'two-factor-authenticator', userId: challenge.userId});
        setRoute('otp');
      } else {
        const sent = await sendTwoFactorSmsCode(challenge.userId).catch(error => {
          Alert.alert('Two-step verification', error instanceof Error ? error.message : 'We could not send the verification code. Enter your number to try again.');
          return false;
        });
        if (!sent) {
          // The number could not be found or texted: collect it on the phone
          // entry screen, which then sends the code itself.
          setOtpDestination(null);
          setRoute('phone');
        }
      }
      return;
    }

    setPendingTwoFactor(null);
    setOtpDestination(null);
    lastSignInPhoneRef.current = null;

    if (!outcome.token) {
      setRoute('welcome');
      Alert.alert('Sign in failed', outcome.message || 'No session was returned. Please try again.');
      return;
    }

    try {
      await saveSession(outcome);
    } catch {
      await clearSession().catch(() => undefined);
      Alert.alert('Sign in failed', 'Chatterly could not securely save your session. Please try again.');
      return;
    }
    setAuthenticatedUserId(String(outcome.user?.id || ''));

    // Sprint 3 Story 1: the WebSocket comes up as soon as there is a session,
    // not when the first conversation is opened. Registering early is what lets
    // the server mark queued messages delivered, replay anything missed while
    // this device was away, and keep the chat list live from the first screen.
    connectRealtime();

    const nextRoute = resolveAuthenticatedRoute(outcome);
    routeHistoryRef.current = [];
    isNavigatingBackRef.current = true;

    if (nextRoute === 'chats') {
      setProfileSession(null);
      setContactsEntryMode('list');
      setRoute('chats');
      return;
    }

    setProfileSession({token: outcome.token, userId: outcome.user?.id, name: outcome.user?.name});
    setRoute('profile-setup');
  }, [sendTwoFactorSmsCode]);

  const continueWithGoogle = useCallback(async () => {
    if (googleSubmitting) { return; }
    lastSignInPhoneRef.current = null;
    setGoogleSubmitting(true);
    try {
      const idToken = await signInWithGoogle();
      const outcome = await googleLogin(idToken);
      // Google has already verified account ownership. The backend response is
      // the Chatterly session, so continue through the common authenticated
      // route (or its explicit 2FA challenge) without starting email OTP.
      await handleAuthenticated(outcome);
    } catch (error) {
      if (error instanceof GoogleSignInCancelledError) { return; }
      Alert.alert(
        'Google sign-in',
        error instanceof Error ? error.message : 'Google sign-in failed. Please try again.',
      );
    } finally {
      setGoogleSubmitting(false);
    }
  }, [googleSubmitting, handleAuthenticated]);

  const backFromOtp = useCallback(() => {
    if (otpDestination?.channel === 'phone') { showPhoneRegistration(); return; }
    if (otpDestination?.channel === 'two-factor-sms') {
      setOtpDestination(null);
      setRoute('phone');
      return;
    }
    if (otpDestination?.channel === 'email') { showEmailLogin(); return; }
    setOtpDestination(null);
    showWelcome();
  }, [otpDestination, showEmailLogin, showPhoneRegistration, showWelcome]);

  const finishProfileSetup = useCallback(async (user: AuthUser) => {
    await markSessionProfileComplete(user);
    setProfileSession(null);
    setContactsEntryMode('list');
    setShowPostProfileContactsPrompt(true);
    routeHistoryRef.current = [];
    isNavigatingBackRef.current = true;
    setRoute('contacts');
  }, []);

  const openContacts = useCallback((mode: 'list' | 'create' | 'createGroup' | 'createBroadcast' = 'list', draft: SimilarGroupDraft | null = null) => {
    setGroupDraft(draft);
    setContactsEntryMode(mode);
    setRoute('contacts');
  }, []);

  const openSettings = useCallback((initialScreen: 'settings' | 'edit' = 'settings') => {
    setSettingsInitialScreen(initialScreen);
    setRoute('settings');
  }, []);

  const openBroadcast = useCallback((nextBroadcast: BroadcastList) => {
    setBroadcast(nextBroadcast);
    setRoute('broadcast');
  }, []);

  const openConversation = useCallback((contact: ConversationContact, chatId: string) => {
    setRetryCall(null);
    setConversation({ contact, chatId });
    setRoute('conversation');
  }, []);

  const openConversationFromCalls = useCallback((contact: ConversationContact, chatId: string, callType?: CallType) => {
    setRetryCall(callType ? {id: `call-history-${Date.now()}`, type: callType} : null);
    setConversation({contact, chatId});
    setRoute('conversation');
  }, []);

  const openNotification = useCallback(async (target: NotificationTarget) => {
    const sequence = ++notificationOpenSequence.current;
    const resolveConversation = notificationService?.resolveNotificationConversation;
    if (typeof resolveConversation !== 'function') {
      setRoute('chats');
      return;
    }
    const resolved = await resolveConversation(target);
    if (sequence !== notificationOpenSequence.current) { return; }
    if (!resolved) {
      // The notification still brings the user to their inbox when an older
      // backend payload has no usable chat metadata.
      setRoute('chats');
      return;
    }
    if (target.action === 'callback') {
      openConversationFromCalls(resolved.contact, resolved.chatId, target.callType || 'audio');
    } else {
      openConversation(resolved.contact, resolved.chatId);
    }
  }, [openConversation, openConversationFromCalls]);

  const presentIncomingCall = useCallback((nextCall: IncomingCall, opened = false) => {
    // Already in a conference: decline rather than stacking a second call UI
    // over it. The caller is told, which is what `call_reject` is for.
    if (groupCallRef.current) {
      if (!nextCall.conference) rejectCallOverSocket(nextCall.callId).catch(() => undefined);
      return;
    }
    const active = incomingRef.current;
    if (active && active.callId !== nextCall.callId && !['missed', 'rejected'].includes(active.status)) {
      if (!nextCall.conference) rejectCallOverSocket(nextCall.callId).catch(() => undefined);
      return;
    }
    if (active?.callId !== nextCall.callId) { incomingRef.current = nextCall; }
    setIncomingCall(current => {
      if (current?.callId === nextCall.callId) {
        if (opened) { setIncomingCallPresentation('full'); }
        return {
          ...current,
          chatId: nextCall.chatId || current.chatId,
          callerName: nextCall.callerName === 'Unknown caller' ? current.callerName : nextCall.callerName,
          callerProfilePic: nextCall.callerProfilePic || current.callerProfilePic,
        };
      }
      setIncomingCallPresentation('full');
      return {...nextCall, muted: false, speaker: nextCall.type === 'video', videoEnabled: nextCall.type === 'video'};
    });

    if (!nextCall.callerProfilePic || nextCall.callerName === 'Unknown caller') {
      notificationService.resolveNotificationConversation({
        chatId: nextCall.chatId,
        contactId: nextCall.callerId,
        contactName: nextCall.callerName,
      }).then(resolved => {
        if (!resolved) { return; }
        setIncomingCall(current => current?.callId === nextCall.callId ? {
          ...current,
          chatId: current.chatId || resolved.chatId,
          callerName: resolved.contact.name || current.callerName,
          callerProfilePic: resolved.contact.thumbnail || current.callerProfilePic,
        } : current);
      }).catch(() => undefined);
    }
  }, []);

  const clearIncomingCall = useCallback(() => {
    incomingRef.current = null;
    setIncomingCall(null);
    setIncomingCallPresentation('dismissed');
    stopCallAudio().catch(() => undefined);
    setAudioModeAsync({allowsRecording: false, playsInSilentMode: true}).catch(() => undefined);
  }, []);

  const acceptIncomingCall = useCallback(async () => {
    const call = incomingCall;
    if (!call || call.status !== 'calling' || callActionLock.current) { return; }
    callActionLock.current = true;
    setCallBusy(true);
    try {
      if (incomingRef.current?.callId !== call.callId || incomingRef.current.status !== 'calling') { return; }
      setIncomingCallPresentation('full');
      setIncomingCall(current => current?.callId === call.callId ? {...current, status: 'connecting', muted: false} : current);
      const existing = await getRecordingPermissionsAsync();
      const permission = existing.granted ? existing : await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone access needed', 'Allow microphone access to answer voice calls.');
        setIncomingCall(current => current?.callId === call.callId && current.status === 'connecting' ? {...current, status: 'calling'} : current);
        return;
      }
      let videoEnabled = false;
      if (call.type === 'video') {
        const currentCamera = await Camera.getCameraPermissionsAsync();
        const cameraPermission = currentCamera.granted ? currentCamera : await Camera.requestCameraPermissionsAsync();
        videoEnabled = cameraPermission.granted;
      }
      const speaker = call.type === 'video';
      await setAudioModeAsync({allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: !speaker});
      await startCallAudio({callId: call.callId, role: 'receiver', type: call.type, muted: false, speaker, contactName: call.callerName, conferenceOnly: call.conference});
      const accepted = await (call.conference ? joinConferenceOverSocket(call.callId) : acceptCallOverSocket(call.callId));
      if (!accepted.success) { throw new Error(accepted.message || 'Unable to accept this call.'); }
      await joinCallRoom(call.callId).catch(() => undefined);
      setIncomingCall(current => current?.callId === call.callId && current.status === 'connecting' ? {...current, status: 'connected', connectedAt: current.connectedAt || new Date().toISOString(), muted: false, speaker, videoEnabled} : current);
    } catch (error) {
      stopCallAudio(call.callId).catch(() => undefined);
      setIncomingCall(current => current?.callId === call.callId && current.status === 'connecting' ? {...current, status: 'calling'} : current);
      Alert.alert('Call', error instanceof Error ? error.message : 'Unable to accept this call.');
    } finally {
      callActionLock.current = false;
      setCallBusy(false);
    }
  }, [incomingCall]);

  const toggleIncomingMute = useCallback(async () => {
    const call = incomingRef.current;
    if (!call || call.status !== 'connected') { return; }
    const muted = !call.muted;
    setIncomingCall(current => current?.callId === call.callId ? {...current, muted} : current);
    try {
      await setCallAudioMuted(muted);
      const ack = await setCallMutedOverSocket(call.callId, muted);
      if (!ack.success) { throw new Error(ack.message || 'Unable to update microphone.'); }
    } catch (error) {
      setIncomingCall(current => current?.callId === call.callId ? {...current, muted: !muted} : current);
      Alert.alert('Call', error instanceof Error ? error.message : 'Unable to update microphone.');
    }
  }, []);

  const toggleIncomingHold = useCallback(async () => {
    const call = incomingRef.current;
    if (!call || call.status !== 'connected') { return; }
    const held = !call.held;
    setIncomingCall(current => current?.callId === call.callId ? {...current, held} : current);
    try {
      await setCallAudioHeld(held);
    } catch (error) {
      setIncomingCall(current => current?.callId === call.callId ? {...current, held: !held} : current);
      Alert.alert('Call', error instanceof Error ? error.message : 'Unable to update hold.');
    }
  }, []);

  // The call screen has already moved the audio onto the chosen route (see
  // callAudioRoutes); this records the loudspeaker state and tells the other
  // side. "No Audio" silences the other side only, so it changes neither.
  const selectIncomingAudioOutput = useCallback(async (route: CallAudioRoute) => {
    const call = incomingRef.current;
    if (!call || call.status !== 'connected' || route.kind === 'none') { return; }
    const enabled = route.kind === 'speaker';
    if (Boolean(call.speaker) === enabled) { return; }
    setIncomingCall(current => current?.callId === call.callId ? {...current, speaker: enabled} : current);
    setCallSpeakerOverSocket(call.callId, enabled).catch(() => undefined);
  }, []);

  const toggleIncomingVideo = useCallback(async () => {
    const call = incomingRef.current;
    if (!call || call.status !== 'connected' || call.type !== 'video') { return; }
    let videoEnabled = !call.videoEnabled;
    if (videoEnabled) {
      const currentCamera = await Camera.getCameraPermissionsAsync();
      const permission = currentCamera.granted ? currentCamera : await Camera.requestCameraPermissionsAsync();
      videoEnabled = permission.granted;
      if (!permission.granted) { Alert.alert('Camera access needed', 'Allow camera access to turn on video.'); }
    }
    setIncomingCall(current => current?.callId === call.callId ? {...current, videoEnabled} : current);
    setCallVideoEnabled(videoEnabled);
  }, []);

  const finishIncomingCall = useCallback((duration?: number) => {
    const call = incomingRef.current;
    if (!call) { return; }
    if (call.status !== 'connected' && !call.connectedAt) {
      clearIncomingCall();
      return;
    }
    incomingRef.current = null;
    setEndedIncoming({...call, duration: callDuration(call.connectedAt, duration)});
    clearIncomingCall();
  }, [clearIncomingCall]);

  const openSummaryConversation = useCallback(async (redial: boolean) => {
    if (!endedIncoming || summaryActionRef.current) { return; }
    summaryActionRef.current = true;
    setSummaryBusy(true);
    try {
      const resolved = await notificationService.resolveNotificationConversation({chatId: endedIncoming.chatId, contactId: endedIncoming.callerId, contactName: endedIncoming.callerName});
      if (!resolved) { throw new Error('Unable to open this conversation. Please try again.'); }
      openConversation(resolved.contact, resolved.chatId);
      setRetryCall(redial ? {id: endedIncoming.callId, type: endedIncoming.type} : null);
      setEndedIncoming(null);
    } catch (error) { Alert.alert('Call', error instanceof Error ? error.message : 'Unable to open conversation.'); }
    finally { summaryActionRef.current = false; setSummaryBusy(false); }
  }, [endedIncoming, openConversation]);

  const declineIncomingCall = useCallback(async () => {
    const call = incomingCall;
    if (!call || callActionLock.current || !['calling', 'connected'].includes(call.status)) { return; }
    callActionLock.current = true;
    setCallBusy(true);
    try {
      if (call.status === 'connected') {
        const ack = await endCallOverSocket(call.callId);
        if (!ack.success) { throw new Error(ack.message); }
        if (incomingRef.current?.callId === call.callId) { finishIncomingCall(); }
      } else {
        if (call.conference) { clearIncomingCall(); return; }
        const ack = await rejectCallOverSocket(call.callId);
        if (!ack.success) { throw new Error(ack.message); }
        setIncomingCall(current => current?.callId === call.callId ? {...current, status: 'rejected'} : current);
        setIncomingCallPresentation('full');
      }
    } catch (error) {
      Alert.alert('Call', error instanceof Error ? error.message : 'Unable to decline. Please try again.');
    } finally {
      callActionLock.current = false;
      setCallBusy(false);
    }
  }, [clearIncomingCall, finishIncomingCall, incomingCall]);

  useEffect(() => {
    if (!incomingCall?.callId) return;
    return subscribeToBackgroundCallEnd(incomingCall.callId, () => {
      declineIncomingCall().catch(() => undefined);
    });
  }, [incomingCall?.callId, declineIncomingCall]);

  // Wait for the call from a notification to reach React state before using
  // the same permission, media and socket handlers as the on-screen controls.
  useEffect(() => {
    if (!notificationCallAction) { return; }
    setNotificationCallAction(null);
    if (incomingCall?.callId !== notificationCallAction.callId || incomingCall.status !== 'calling') { return; }
    if (notificationCallAction.action === 'accept') { acceptIncomingCall(); }
    else { declineIncomingCall(); }
  }, [notificationCallAction, incomingCall, acceptIncomingCall, declineIncomingCall]);

  const openCallerConversation = useCallback(async (again: boolean) => {
    const call = incomingCall;
    if (!call || callActionLock.current) { return; }
    callActionLock.current = true;
    setCallBusy(true);
    try {
      const resolved = await notificationService.resolveNotificationConversation({chatId: call.chatId, contactId: call.callerId, contactName: call.callerName});
      if (!resolved) { throw new Error('Unable to open this conversation. Please try again.'); }
      if (incomingRef.current?.callId !== call.callId) { return; }
      setConversation(resolved);
      setRetryCall(again ? {id: call.callId, type: call.type} : null);
      setRoute('conversation');
      if (!again && incomingRef.current.status === 'connected') {
        // Chat navigation minimizes the app-owned call without closing its media.
        setIncomingCallPresentation('banner');
      } else {
        clearIncomingCall();
      }
    } catch (error) {
      Alert.alert('Call', error instanceof Error ? error.message : 'Unable to open conversation.');
    } finally {
      callActionLock.current = false;
      setCallBusy(false);
    }
  }, [incomingCall, clearIncomingCall]);

  // --- Sprint 9 Story 2: group conferencing ---------------------------------

  const openGroupCall = useCallback((session: GroupCallSession) => {
    handledGroupCalls.current.add(session.groupCallId);
    setGroupCallInvite(null);
    setGroupCallMinimized(false);
    setGroupCall(session);
  }, []);

  /**
   * Start a conference from the open group thread.
   *
   * The server allows only one live call per group, so "already active" is not
   * an error here - it means somebody beat us to it, and the right behaviour is
   * to join theirs instead of reporting a failure.
   */
  const startGroupCallFromConversation = useCallback(async (type: CallType) => {
    const contact = conversation?.contact;
    if (!contact || contact.kind !== 'group' || groupCallLock.current) { return; }
    if (groupCallRef.current) { setGroupCallMinimized(false); return; }

    const groupId = contact.userId || conversation?.chatId || '';
    if (!groupId) { return; }

    groupCallLock.current = true;
    setGroupCallBusy(true);
    try {
      const ack = await startGroupCall(groupId, type);
      if (!ack.success || !ack.groupCallId) { throw new Error(ack.message || 'Unable to start the group call.'); }
      openGroupCall({
        groupCallId: ack.groupCallId,
        groupId,
        groupName: contact.name,
        groupPhoto: contact.thumbnail || null,
        type,
        startedBy: authenticatedUserId,
        startedAt: new Date().toISOString(),
        isInitiator: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start the group call.';
      if (!/already active/i.test(message)) {
        Alert.alert('Group call', message);
        return;
      }
      try {
        // Two ways to find the live call: the history route knows about it once
        // this user has been a participant, and the thread's "call started"
        // line covers the case where they never joined (or dismissed the ring).
        const active = await findActiveGroupCall(groupId).catch(() => null);
        const groupCallId = active?.groupCallId || (await findAnnouncedGroupCallId(groupId));
        if (!groupCallId) { throw new Error(message); }

        const joined = await joinGroupCall(groupCallId);
        // "User already joined" means this device is in the call on another
        // socket; opening the screen is still the right outcome.
        if (!joined.success && !/already joined/i.test(joined.message)) { throw new Error(joined.message); }
        openGroupCall({
          groupCallId,
          groupId,
          groupName: active?.groupName || contact.name,
          groupPhoto: active?.groupPhoto || contact.thumbnail || null,
          type: active?.type || type,
          startedBy: active?.startedBy || '',
          startedAt: active?.startedAt || new Date().toISOString(),
          isInitiator: false,
        });
      } catch (joinError) {
        Alert.alert('Group call', joinError instanceof Error ? joinError.message : message);
      }
    } finally {
      groupCallLock.current = false;
      setGroupCallBusy(false);
    }
  }, [authenticatedUserId, conversation, openGroupCall]);

  const dismissGroupCallInvite = useCallback(() => {
    const invite = groupCallInvite;
    if (invite) { handledGroupCalls.current.add(invite.groupCallId); }
    setGroupCallInvite(null);
  }, [groupCallInvite]);

  const acceptGroupCallInvite = useCallback(async () => {
    const invite = groupCallInvite;
    if (!invite || groupCallLock.current) { return; }
    groupCallLock.current = true;
    setGroupCallBusy(true);
    try {
      const ack = await joinGroupCall(invite.groupCallId);
      if (!ack.success && !/already joined/i.test(ack.message)) { throw new Error(ack.message); }
      openGroupCall({
        groupCallId: invite.groupCallId,
        groupId: invite.groupId,
        groupName: invite.groupName,
        groupPhoto: invite.groupPhoto,
        type: invite.type,
        startedBy: invite.startedBy,
        startedAt: new Date().toISOString(),
        isInitiator: false,
      });
    } catch (error) {
      setGroupCallInvite(null);
      Alert.alert('Group call', error instanceof Error ? error.message : 'Unable to join this call.');
    } finally {
      groupCallLock.current = false;
      setGroupCallBusy(false);
    }
  }, [groupCallInvite, openGroupCall]);

  const closeGroupCall = useCallback((outcome: GroupCallOutcome) => {
    setGroupCall(null);
    setGroupCallMinimized(false);
    if (outcome.reason) { Alert.alert('Group call', outcome.reason); }
  }, []);

  /**
   * Ring for an inbound invitation, whichever transport it arrived on.
   *
   * The initial socket broadcast carries the group; a mid-call one and every
   * push carry only the call id. By then the invitee is already stored as a
   * participant, so the call record is readable and fills in the rest.
   */
  const presentGroupCallInvitation = useCallback((invitation: {
    groupCallId: string;
    groupId?: string;
    groupName?: string;
    type?: CallType;
    startedBy?: string;
    isMidCallInvite?: boolean;
  }) => {
    if (!invitation.groupCallId || handledGroupCalls.current.has(invitation.groupCallId)) { return; }
    if (groupCallRef.current || incomingRef.current) { return; }

    const resolve = async (): Promise<GroupCallInvite | null> => {
      if (invitation.groupId) {
        const details = await getGroupDetails(invitation.groupId).catch(() => null);
        const starter = details?.participants.find(member => member.userId === invitation.startedBy);
        return {
          groupCallId: invitation.groupCallId,
          groupId: invitation.groupId,
          groupName: details?.name || invitation.groupName || 'Group Call',
          groupPhoto: details?.photo || null,
          type: invitation.type || 'video',
          startedBy: invitation.startedBy || '',
          startedByName: starter?.name || 'A group member',
          isMidCallInvite: Boolean(invitation.isMidCallInvite),
        };
      }

      const call = await getGroupCallDetails(invitation.groupCallId).catch(() => null);
      // A call that already finished must not ring - this is what resolves an
      // invitation that was missed while the app was backgrounded.
      if (!call || call.status === 'ended') { return null; }
      return {
        groupCallId: call.groupCallId,
        groupId: call.groupId,
        groupName: call.groupName,
        groupPhoto: call.groupPhoto,
        type: call.type,
        startedBy: call.startedBy,
        startedByName: call.startedByName,
        isMidCallInvite: Boolean(invitation.isMidCallInvite),
      };
    };

    resolve()
      .then(invite => {
        // Re-check: the user may have started or answered something while the
        // group lookup was in flight.
        if (!invite || groupCallRef.current || handledGroupCalls.current.has(invite.groupCallId)) { return; }
        setGroupCallInvite(invite);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!authenticatedUserId) { return; }
    return subscribeToGroupCallInvitations(presentGroupCallInvitation);
  }, [authenticatedUserId, presentGroupCallInvitation]);

  useEffect(() => {
    if (!authenticatedUserId) { return; }
    return subscribeToIncomingCalls(call => presentIncomingCall(call, false));
  }, [authenticatedUserId, presentIncomingCall]);

  // Sprint 9 Story 4: the Calls tab badge. The server owns the call record, so
  // the count is re-read from the history whenever it may have changed - on
  // sign-in, on returning to the app, and after a call here went unanswered.
  const recountMissedCalls = useCallback(() => {
    if (routeRef.current === 'calls') {
      // Already looking at the call log; nothing is unseen.
      markCallsSeen().catch(() => undefined);
      return;
    }
    // A short wait lets the server finish writing the call it just closed.
    setTimeout(() => { refreshMissedCallBadge().catch(() => undefined); }, 1200);
  }, []);

  useEffect(() => {
    if (!authenticatedUserId) {
      resetMissedCallBadge();
      resetUnreadChatCount();
      return;
    }
    refreshMissedCallBadge().catch(() => undefined);
    // Media Auto-Download applies in every chat, so its choices are loaded for
    // the signed-in account up front - from the account, so a new device
    // inherits them - rather than when Media & Links is first opened.
    const stopAutoDownloads = startAutoDownloadReceiving();
    getAutoDownloadSettings().catch(() => undefined);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { refreshMissedCallBadge().catch(() => undefined); }
      else { flushDataUsage().catch(() => undefined); }
    });
    return () => { subscription.remove(); stopAutoDownloads(); };
  }, [authenticatedUserId]);

  useEffect(() => {
    if (!incomingCall?.callId) { return; }
    const callId = incomingCall.callId;
    return subscribeToCall(callId, {
      onConnected: payload => {
        joinCallRoom(callId).catch(() => undefined);
        setIncomingCall(current => current?.callId === callId && ['calling', 'connecting'].includes(current.status) ? {...current, status: 'connected', connectedAt: payload.startedAt || current.connectedAt || new Date().toISOString()} : current);
      },
      onEnded: payload => {
        if (incomingRef.current?.callId === callId) {
          const answered = incomingRef.current.status === 'connected' || Boolean(incomingRef.current.connectedAt);
          finishIncomingCall(payload.duration);
          if (!answered) { recountMissedCalls(); }
        }
      },
      onMissed: () => {
        if (incomingRef.current?.callId === callId) { clearIncomingCall(); }
        recountMissedCalls();
      },
      onRejected: () => {
        setIncomingCall(current => current?.callId === callId ? {...current, status: 'rejected'} : current);
        setIncomingCallPresentation('full');
      },
      onCancelled: payload => {
        if (incomingRef.current?.callId === callId) {
          const answered = incomingRef.current.status === 'connected' || Boolean(incomingRef.current.connectedAt);
          finishIncomingCall(payload.duration);
          if (!answered) { recountMissedCalls(); }
        }
      },
      onSignal: payload => {
        handleCallAudioSignal(payload).catch(() => undefined);
      },
    });
  }, [clearIncomingCall, finishIncomingCall, incomingCall?.callId, recountMissedCalls]);

  useEffect(() => {
    if (!authenticatedUserId) { return; }
    const startLifecycle = notificationService?.startNotificationLifecycle;
    if (typeof startLifecycle !== 'function') { return; }
    try {
      return startLifecycle(
        target => { openNotification(target).catch(() => undefined); },
        (call, opened, action) => {
          presentIncomingCall(call, opened);
          if (action) { setNotificationCallAction({callId: call.callId, action}); }
        },
        invitation => presentGroupCallInvitation(invitation),
      );
    } catch {
      // Expo Go and an old development client can load JavaScript containing
      // notification code without shipping the matching native module. Push
      // stays disabled in that client, but authentication and chat must work.
      return;
    }
  }, [authenticatedUserId, openNotification, presentGroupCallInvitation, presentIncomingCall]);

  // Reconcile missed socket events after backgrounding or a network interruption.
  // The server owns the timeout and log; never create a second local call log.
  useEffect(() => {
    if (!incomingCall || !['calling', 'connecting'].includes(incomingCall.status)) { return; }
    const callId = incomingCall.callId;
    let cancelled = false;
    let checking = false;
    const reconcile = async () => {
      if (checking) { return; }
      checking = true;
      try {
        const status = await getCallStatus(callId);
        if (cancelled) { return; }
        if (status === 'missed') {
          clearIncomingCall();
          recountMissedCalls();
        } else if (status === 'rejected') {
          setIncomingCall(current => current?.callId === callId ? {...current, status} : current);
          setIncomingCallPresentation('full');
        } else if (status === 'cancelled' || status === 'completed') {
          clearIncomingCall();
        }
      } catch { /* Keep the live socket flow available while offline. */ }
      finally { checking = false; }
    };
    void reconcile();
    const timer = setInterval(() => { void reconcile(); }, 5000);
    return () => { cancelled = true; clearInterval(timer); };
    // The call identity and status are the only values that restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingCall?.callId, incomingCall?.status, clearIncomingCall, recountMissedCalls]);

  const closeConversation = useCallback(() => {
    // Keep the owning ChatScreen mounted behind other app routes for as long
    // as its outgoing call is active; it owns the live WebRTC session.
    if (!outgoingCallState.active) setConversation(null);
    setRoute('chats');
  }, [outgoingCallState.active]);

  const finishUserReport = useCallback((message: string) => {
    setConversation(null);
    setChatListNotice(message);
    setRoute('chats');
  }, []);

  const logout = useCallback(async () => {
    const token = getToken();
    try { await logoutSession(token); } catch { /* Local logout must still complete while offline. */ }
    await signOutOfFirebase().catch(() => undefined);
    await clearSession().catch(async () => { await clearSession().catch(() => undefined); });
    await clearLocalCache().catch(() => undefined);
    disconnectRealtime();
    clearIncomingCall();
    setAuthenticatedUserId('');
    setPendingTwoFactor(null);
    setOtpDestination(null);
    lastSignInPhoneRef.current = null;
    setProfileSession(null);
    setConversation(null);
    setBroadcast(null);
    setGroupDraft(null);
    setGroupCall(null);
    setGroupCallMinimized(false);
    setGroupCallInvite(null);
    setOutgoingCallState({active: false, minimized: false});
    setContactsEntryMode('list');
    routeHistoryRef.current = [];
    isNavigatingBackRef.current = true;
    setRoute('welcome');
  }, [clearIncomingCall]);

  useEffect(() => subscribeToSessionExpiration(message => {
    // A 401 means the persisted token can no longer authorize requests. Clear
    // every authenticated app-level view and return to the existing login UI.
    setSessionExpiredNotice(message);
    disconnectRealtime();
    clearIncomingCall();
    signOutOfFirebase().catch(() => undefined);
    setAuthenticatedUserId('');
    setPendingTwoFactor(null);
    setOtpDestination(null);
    lastSignInPhoneRef.current = null;
    setProfileSession(null);
    setConversation(null);
    setBroadcast(null);
    setGroupDraft(null);
    setGroupCall(null);
    setGroupCallMinimized(false);
    setGroupCallInvite(null);
    setOutgoingCallState({active: false, minimized: false});
    setContactsEntryMode('list');
    routeHistoryRef.current = [];
    isNavigatingBackRef.current = true;
    setRoute('welcome');
  }), [clearIncomingCall]);

  const navigateToPreviousRoute = useCallback(() => {
    const previousRoute = routeHistoryRef.current.pop();
    if (!previousRoute) return false;
    isNavigatingBackRef.current = true;
    setRoute(previousRoute);
    return true;
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (hydrating) { return true; }

      // Full-screen call layers sit above the current route, so Back returns to
      // that route before the route stack itself is changed.
      if (endedIncoming) {
        setEndedIncoming(null);
        return true;
      }
      if (groupCall && !groupCallMinimized) {
        setGroupCallMinimized(true);
        return true;
      }
      if (outgoingCallState.active && outgoingCallState.minimized) {
        setRestoreOutgoingCallRequest(value => value + 1);
        return true;
      }
      if (outgoingCallState.active) {
        setMinimizeOutgoingCallRequest(value => value + 1);
        return true;
      }

      // Authentication screens already define their precise previous step.
      // Reusing those callbacks also preserves the special two-factor flow.
      if (route === 'phone-loading' || route === 'email-loading' || route === 'phone' || route === 'email') {
        showWelcome();
        return true;
      }
      if (route === 'otp') {
        backFromOtp();
        return true;
      }

      if (navigateToPreviousRoute()) return true;

      // Authenticated landing screens have no earlier app screen after a cold
      // start. Consume Back there so Android does not terminate Chatterly.
      return route !== 'welcome';
    });
    return () => subscription.remove();
  }, [backFromOtp, endedIncoming, groupCall, groupCallMinimized, hydrating, navigateToPreviousRoute, outgoingCallState, route, showWelcome]);

  if (hydrating) {
    return <SafeAreaProvider><View style={styles.loading}><ActivityIndicator color="#6F28F5" /></View></SafeAreaProvider>;
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.container}>
        <View
          accessibilityLabel="App route content"
          style={[styles.routeContent, groupCall && groupCallMinimized && styles.routeContentBelowGroupCall]}>
        {route === 'welcome' && (
          <WelcomeScreen loadingMethod={googleSubmitting ? 'google' : undefined} onContinue={continueWith} onGoogle={continueWithGoogle} />
        )}
        {route === 'phone-loading' && (
          <PhoneLoadingScreen onBack={showWelcome} onReady={showPhoneRegistration} />
        )}
        {route === 'email-loading' && (
          <EmailLoadingScreen onBack={showWelcome} onReady={showEmailLogin} />
        )}
        {route === 'phone' && (
          <PhoneNumberLoginScreen onBack={showWelcome} onOtpSent={verifyPhone} purpose={pendingTwoFactor ? 'two-factor' : 'sign-in'} />
        )}
        {route === 'email' && <EmailLoginScreen onBack={showWelcome} onOtpSent={verifyEmail} />}
        {route === 'otp' && otpDestination !== null && (
          <OtpVerificationScreen key={`${otpDestination.channel}:${'userId' in otpDestination ? otpDestination.userId : ''}`}
            destination={otpDestination}
            onBack={backFromOtp}
            onVerified={handleAuthenticated} />
        )}
        {route === 'profile-setup' && profileSession !== null && (
          <ProfileSetupScreen token={profileSession.token} userId={profileSession.userId} initialName={profileSession.name}
            onComplete={finishProfileSetup} />
        )}
        {route === 'contacts' && <ContactsScreen initialGroupDraft={contactsEntryMode === 'createGroup' ? groupDraft : null} initialMode={contactsEntryMode} onBroadcastCreated={openBroadcast} onContactPermissionPromptHandled={() => setShowPostProfileContactsPrompt(false)} onOpenCalls={() => setRoute('calls')} onOpenChats={() => setRoute('chats')} onOpenSettings={() => openSettings()} onOpenConversation={openConversation} showContactPermissionPrompt={showPostProfileContactsPrompt} />}
        {route === 'chats' && <ChatListScreen noticeMessage={chatListNotice} onNoticeConsumed={() => setChatListNotice('')} onCreateContact={() => openContacts('create')} onCreateGroup={() => openContacts('createGroup')} onCreateBroadcast={() => openContacts('createBroadcast')} onOpenCalls={() => setRoute('calls')} onOpenContacts={() => openContacts('list')} onOpenSettings={openSettings} onOpenConversation={openConversation} onOpenBroadcast={openBroadcast} />}
        {route === 'calls' && <CallsScreen onBack={() => { navigateToPreviousRoute(); }} onOpenChats={() => setRoute('chats')} onOpenContacts={() => openContacts('list')} onOpenConversation={openConversationFromCalls} onOpenSettings={() => openSettings()}/>}
        {route === 'settings' && <SettingsScreen initialScreen={settingsInitialScreen} onBack={() => { navigateToPreviousRoute(); }} onLogout={logout} onOpenCalls={() => setRoute('calls')} onOpenChats={() => setRoute('chats')} onOpenContacts={() => openContacts('list')} onReportSubmitted={finishUserReport} />}
        {(route === 'conversation' || outgoingCallState.active) && conversation !== null && (
          // Keyed by chat so "Send Message" from a group member opens a fresh
          // screen instead of reusing the group thread's state.
          <View pointerEvents={route === 'conversation' ? 'auto' : 'none'} style={route === 'conversation' ? styles.activeConversation : styles.hiddenConversation}>
            <ChatScreen incomingMedia={incomingMediaShare} onIncomingMediaHandled={() => setIncomingMediaShare(null)} callRequest={retryCall} onCallRequestHandled={() => setRetryCall(null)} key={conversation.chatId} chatId={conversation.chatId} contact={conversation.contact} minimizeCallRequest={minimizeOutgoingCallRequest} onBack={closeConversation} onCreateSimilarGroup={draft => openContacts('createGroup', draft)} onOpenConversation={openConversation} onOutgoingCallStateChange={(active, minimized) => setOutgoingCallState(current => current.active === active && current.minimized === minimized ? current : {active, minimized})} onReportSubmitted={finishUserReport} onStartGroupCall={type => { startGroupCallFromConversation(type).catch(() => undefined); }} restoreCallRequest={restoreOutgoingCallRequest} />
          </View>
        )}
        {route === 'broadcast' && broadcast !== null && (
          <BroadcastScreen broadcast={broadcast} onBack={() => setRoute('chats')} onUpdated={setBroadcast}/>
        )}
        </View>
        {endedIncoming ? <CallEndedScreen name={endedIncoming.callerName} picture={endedIncoming.callerProfilePic} duration={endedIncoming.duration}
          busy={summaryBusy} onClose={() => setEndedIncoming(null)}
          onMessage={() => { openSummaryConversation(false).catch(() => undefined); }}
          onAudioCallAgain={() => { openSummaryConversation(true).catch(() => undefined); }}/> : null}
        {groupCall && groupCallMinimized ? (
          <GroupCallBanner onReturn={() => setGroupCallMinimized(false)} session={groupCall} />
        ) : null}
        {outgoingCallState.active && route !== 'conversation' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Return to active call" onPress={() => { setRoute('conversation'); setRestoreOutgoingCallRequest(value => value + 1); }} style={styles.outgoingCallBanner}>
            <Text style={styles.outgoingCallBannerText}>Call in progress</Text>
            <Text style={styles.outgoingCallBannerAction}>Return</Text>
          </Pressable>
        ) : null}
        {groupCall ? (
          <GroupCallScreen
            key={groupCall.groupCallId}
            onClose={closeGroupCall}
            onMinimize={() => setGroupCallMinimized(true)}
            session={groupCall}
            visible={!groupCallMinimized}
          />
        ) : null}
        <IncomingGroupCall
          busy={groupCallBusy}
          invite={groupCall ? null : groupCallInvite}
          onDismiss={dismissGroupCallInvite}
          onJoin={() => { acceptGroupCallInvite().catch(() => undefined); }}
        />
        {incomingCall ? <IncomingCallExperience
          call={incomingCall}
          busy={callBusy}
          onClose={clearIncomingCall}
          onMessage={() => { void openCallerConversation(false); }}
          onCallAgain={() => { void openCallerConversation(true); }}
          onAccept={() => { acceptIncomingCall().catch(() => undefined); }}
          onDecline={() => { declineIncomingCall().catch(() => undefined); }}
          onDismissBanner={() => setIncomingCallPresentation('dismissed')}
          onMinimize={() => setIncomingCallPresentation('banner')}
          onOpen={() => setIncomingCallPresentation('full')}
          onSelectAudioOutput={output => { selectIncomingAudioOutput(output).catch(() => undefined); }}
          onToggleMute={() => { toggleIncomingMute().catch(() => undefined); }}
          onToggleHold={() => { toggleIncomingHold().catch(() => undefined); }}
          onToggleVideo={() => { toggleIncomingVideo().catch(() => undefined); }}
          presentation={incomingCallPresentation}
        /> : null}
        <Snackbar message={sessionExpiredNotice} onHide={() => setSessionExpiredNotice('')} />
      </View>
    </SafeAreaProvider>
  );
}

const styles = createThemedStyles({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  routeContent: {flex: 1},
  // The minimized call banner is intentionally absolute so it stays visible
  // across routes. Reserve its row only while it is present so chat/group
  // headers begin below it instead of being covered by it.
  routeContentBelowGroupCall: {paddingTop: 32},
  groupCallBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 40,
    backgroundColor: '#6D28D9',
  },
  activeConversation: { flex: 1 },
  hiddenConversation: { display: 'none' },
  outgoingCallBanner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 45, height: 42, paddingHorizontal: 16, backgroundColor: '#6D28D9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  outgoingCallBannerText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  outgoingCallBannerAction: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  groupCallBannerRow: {
    height: 32,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupCallBannerText: {
    flex: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  groupCallBannerTimer: {
    color: 'rgba(255,255,255,.88)',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  groupCallBannerAction: {
    color: 'rgba(255,255,255,.88)',
    fontSize: 9,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
}, {
  // The call banner is purple in both themes, so the text knocked out of it has
  // to stay white.
  keep: ['groupCallBanner', 'groupCallBannerText', 'groupCallBannerTimer', 'groupCallBannerAction'],
});

/**
 * Sprint 11 Story 2: the theme has to be resolved above every screen, so the
 * provider wraps the app rather than living inside it.
 */
export default function ChatterlyApp(): React.JSX.Element {
  return <ThemeProvider><ChatWallpaperProvider><App/></ChatWallpaperProvider></ThemeProvider>;
}
