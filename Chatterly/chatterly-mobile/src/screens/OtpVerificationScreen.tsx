import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView, Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {EditDestinationIcon, SupportIcon} from '../components/AuthIcons';
import {ChatLogo} from '../components/ChatLogo';
import {OtpCodeInput} from '../components/OtpCodeInput';
import {PatternBackground} from '../components/PatternBackground';
import {Snackbar} from '../components/Snackbar';
import {RESEND_COOLDOWN_SECONDS} from '../constants/otp';
import {
  completeLoginTwoFactor,
  phoneLogin,
  resendEmailOtp,
  verifyEmailOtp,
} from '../services/authApi';
import {
  FirebaseNotConfiguredError,
  confirmPhoneCode,
  getPendingPhoneVerification,
  setPendingPhoneVerification,
  startPhoneVerification,
} from '../services/firebaseAuth';
import type {AuthOutcome} from '../types/auth';
import type {OtpDestination, OtpErrorKind} from '../types/otp';
import {
  OTP_ERROR_MESSAGES,
  describeDestination,
  destinationPrompt,
  formatResendCountdown,
  isCompleteOtp,
  resolveOtpError,
} from '../utils/otpValidation';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {
  destination: OtpDestination;
  onBack: () => void;
  onVerified: (outcome: AuthOutcome) => void;
};

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

// A wrong code costs one of three server-side attempts, so these two states
// only clear once a fresh code has been requested.
const NEEDS_NEW_CODE: OtpErrorKind[] = ['attempts', 'expired'];

// Retyping is pointless when the code itself was rejected, so the boxes are
// emptied; a network or server fault leaves the digits in place to retry.
const CLEARS_CODE: OtpErrorKind[] = ['invalid', 'expired', 'attempts'];

export function OtpVerificationScreen({destination, onBack, onVerified}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorKind, setErrorKind] = useState<OtpErrorKind | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [cooldownEndsAt, setCooldownEndsAt] = useState(() => Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
  const [verified, setVerified] = useState<AuthOutcome | null>(null);
  const [message, setMessage] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const needsNewCode = errorKind !== null && NEEDS_NEW_CODE.includes(errorKind);
  const isAuthenticatorChallenge = destination.channel === 'two-factor-authenticator';
  const canVerify = isCompleteOtp(code) && !verifying && !needsNewCode && verified === null;
  const canResend = !isAuthenticatorChallenge && secondsLeft === 0 && !resending && verified === null;
  const sentTo = describeDestination(destination);
  const isPhoneChallenge = destination.channel === 'phone' || destination.channel === 'two-factor-sms';

  // The design's supporting line, which names the channel being verified.
  const subtitle = isAuthenticatorChallenge
    ? 'Enter the current code from your authenticator app to finish signing in'
    : isPhoneChallenge
      ? 'We’ll send a verification code to your phone to verify your number'
      : 'We’ll send a verification code to your email to verify your address';

  const changeLabel = isAuthenticatorChallenge ? 'Cancel sign in' : 'Change';

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Counted from a deadline rather than by subtracting one per tick, so the
  // timer stays correct if the app is backgrounded mid-cooldown.
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      return remaining;
    };

    if (tick() === 0) { return; }
    const timer = setInterval(() => {
      if (tick() === 0) { clearInterval(timer); }
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownEndsAt]);

  // Hold the success state briefly so the confirmation is readable before the
  // parent swaps the screen out.
  useEffect(() => {
    if (!verified) { return; }
    const timer = setTimeout(() => onVerified(verified), 900);
    return () => clearTimeout(timer);
  }, [onVerified, verified]);

  const changeCode = (next: string) => {
    setCode(next);
    if (!needsNewCode) { setErrorKind(null); }
  };

  // Mirrors the web OtpPage: a phone code is confirmed with Firebase first and
  // the resulting ID token is exchanged at /auth/phone-login, while an email
  // code goes straight to /auth/verify-email-otp.
  const verifyCode = async () => {
    if (!canVerify) { return; }

    setVerifying(true);
    setErrorKind(null);
    try {
      let outcome: AuthOutcome;

      if (destination.channel === 'phone' || destination.channel === 'two-factor-sms') {
        const pending = getPendingPhoneVerification();
        if (!pending) {
          // The only way out is a fresh code, so unlock Resend immediately
          // rather than telling the user to use a button still counting down.
          setCooldownEndsAt(Date.now());
          setMessage('That verification session expired. Request a new code.');
          return;
        }
        const idToken = await confirmPhoneCode(pending, code);
        if (destination.channel === 'phone') {
          outcome = await phoneLogin(idToken);

          // The first Firebase code has already proved ownership of this
          // phone. When the account's configured second factor is SMS, the
          // backend accepts that same ID token at /auth/complete-login-2fa.
          // Reusing it avoids asking for an identical second phone code while
          // leaving authenticator challenges to the normal 2FA screen.
          if (
            outcome.requires2FA &&
            outcome.twoFactorMethod.trim().toLowerCase() === 'sms' &&
            outcome.twoFactorUserId
          ) {
            outcome = await completeLoginTwoFactor(outcome.twoFactorUserId, {idToken});
          }
        } else {
          outcome = await completeLoginTwoFactor(destination.userId, {idToken});
        }
        setPendingPhoneVerification(null);
      } else if (destination.channel === 'two-factor-authenticator') {
        outcome = await completeLoginTwoFactor(destination.userId, {authOTP: code});
      } else {
        outcome = await verifyEmailOtp(destination.email, code);
      }

      // Verification is complete, so the numeric keyboard is no longer useful.
      // Closing it restores the full screen before the existing success
      // snackbar appears, keeping that message visible for phone and email.
      Keyboard.dismiss();
      setMessage(outcome.requires2FA
        ? 'Code accepted. Two-factor verification is required to finish.'
        : 'Verification successful');
      setVerified(outcome);
    } catch (error) {
      // An unconfigured Firebase build is not a rejected code, so it must not
      // burn one of the three attempts or paint the boxes red.
      if (error instanceof FirebaseNotConfiguredError) {
        setMessage(error.message);
        return;
      }
      const kind = resolveOtpError(error);
      setErrorKind(kind);
      if (CLEARS_CODE.includes(kind)) { setCode(''); }
    } finally {
      setVerifying(false);
    }
  };

  const requestNewCode = async () => {
    if (!canResend) { return; }

    setResending(true);
    try {
      let apiMessage: string;

      if (destination.channel === 'phone' || destination.channel === 'two-factor-sms') {
        const verification = await startPhoneVerification(
          `${destination.dialCode}${destination.phone}`,
        );
        setPendingPhoneVerification(verification);
        apiMessage = 'A new code is on its way';
      } else {
        apiMessage = await resendEmailOtp(destination.email);
      }

      setCode('');
      setErrorKind(null);
      setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setMessage(apiMessage);
    } catch (error) {
      // The backend runs its own 30 second cooldown and explains the wait.
      setMessage(error instanceof Error ? error.message : 'Unable to send a new code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PatternBackground />
      <ScrollView keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={[
        styles.content,
        {paddingTop: keyboardVisible ? Math.max(insets.top + 28, 52) : Math.max(insets.top + 68, height * 0.2), paddingBottom: Math.max(insets.bottom + 18, 28)},
      ]}>
        <ChatLogo />

        <View style={[styles.form, keyboardVisible && styles.formKeyboardVisible]}>
          <Text accessibilityRole="header" style={styles.title}>Verify OTP</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* An authenticator code has no destination to change, so that slot
              carries the only way out of the challenge instead. */}
          {isAuthenticatorChallenge ? (
            <View style={styles.destinationRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Change destination"
                hitSlop={8} onPress={onBack} style={styles.changeButton}>
                <Text style={styles.changeLabel}>{changeLabel}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.destinationPrompt}>{destinationPrompt(destination)}</Text>
              <View style={styles.destinationRow}>
                <Text style={styles.destination}>{sentTo}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Change destination"
                  hitSlop={8} onPress={onBack} style={styles.changeButton}>
                  <EditDestinationIcon />
                  <Text style={styles.changeLabel}>{changeLabel}</Text>
                </Pressable>
              </View>
            </>
          )}

          <OtpCodeInput autoFocus editable={!verifying && verified === null}
            hasError={errorKind !== null} onChange={changeCode}
            onSubmit={verifyCode} value={code} />

          {errorKind !== null && (
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              {OTP_ERROR_MESSAGES[errorKind]}
            </Text>
          )}

          <Pressable accessibilityRole="button" accessibilityLabel="Verify code"
            accessibilityState={{disabled: !canVerify, busy: verifying}}
            disabled={!canVerify} onPress={verifyCode}
            style={({pressed}) => [styles.verifyButton,
              canVerify && styles.verifyButtonEnabled,
              pressed && canVerify && styles.verifyButtonPressed,
              verifying && styles.verifyButtonBusy]}>
            {verifying ? (
              <View style={styles.verifyingRow}>
                <View style={styles.loadingSlot} />
                <Text style={styles.verifyingLabel}>Verifying OTP</Text>
                <View style={styles.loadingSlot}>
                  <ActivityIndicator size="small" color="#273448" />
                </View>
              </View>
            ) : (
              <Text style={[styles.verifyLabel, canVerify && styles.verifyLabelEnabled]}>Verify OTP</Text>
            )}
          </Pressable>

          {/* The design keeps the prompt and its action on one line. */}
          <View style={styles.resendArea}>
            <Text style={styles.resendPrompt}>
              {isAuthenticatorChallenge
                ? 'Use the current code from your authenticator app.'
                : 'Didn’t get the code? '}
            </Text>
            {!isAuthenticatorChallenge && (canResend ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Resend code"
                hitSlop={8} onPress={requestNewCode}>
                <Text style={styles.resendAction}>Resend OTP</Text>
              </Pressable>
            ) : (
              <Text style={styles.resendCountdown}>
                {resending ? 'Sending…' : `Resend in ${formatResendCountdown(secondsLeft)}`}
              </Text>
            ))}
          </View>
        </View>

        <View style={[styles.supportArea, keyboardVisible && styles.supportAreaKeyboardVisible]}>
          <Text style={styles.supportPrompt}>Experiencing issues? Contact our team:</Text>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL('mailto:support@chatterly.com')}
            style={styles.supportButton}>
            <SupportIcon />
            <Text style={styles.supportLabel}>Support</Text>
          </Pressable>
        </View>
      </ScrollView>
      <Snackbar message={message} onHide={() => setMessage('')} />
    </KeyboardAvoidingView>
  );
}

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#FFFFFF'},
  content: {flexGrow: 1, paddingHorizontal: 20, alignItems: 'center'},
  form: {width: '100%', maxWidth: 430, marginTop: 62},
  formKeyboardVisible: {marginTop: 28},
  title: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 16, lineHeight: 21, fontWeight: '700', textAlign: 'center'},
  // Padded in to the width of the design's text block, so the line breaks fall
  // in roughly the same place instead of leaving one word alone on line two.
  subtitle: {fontFamily: FONT_FAMILY, color: '#596579', fontSize: 12, lineHeight: 18, marginTop: 9, paddingHorizontal: 44, textAlign: 'center'},
  destinationPrompt: {fontFamily: FONT_FAMILY, color: '#8A94A4', fontSize: 11, lineHeight: 16, marginTop: 18, textAlign: 'center'},
  destinationRow: {marginTop: 4, marginBottom: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10},
  destination: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 13, fontWeight: '600'},
  changeButton: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2},
  changeLabel: {fontFamily: FONT_FAMILY, color: '#8B4CF6', fontSize: 12, fontWeight: '600'},
  errorText: {fontFamily: FONT_FAMILY, color: '#C4322C', fontSize: 11, lineHeight: 16, marginTop: 12, textAlign: 'left'},
  verifyButton: {width: '100%', height: 48, marginTop: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DFE5ED'},
  verifyButtonEnabled: {backgroundColor: '#8B4CF6'},
  verifyButtonPressed: {backgroundColor: '#7C3FE1'},
  verifyButtonBusy: {backgroundColor: '#DFE5ED'},
  verifyLabel: {fontFamily: FONT_FAMILY, color: '#6F7C8F', fontSize: 12, fontWeight: '500'},
  verifyLabelEnabled: {color: '#FFFFFF', fontWeight: '600'},
  verifyingRow: {width: '100%', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  loadingSlot: {width: 22, alignItems: 'center', justifyContent: 'center'},
  verifyingLabel: {fontFamily: FONT_FAMILY, color: '#667587', fontSize: 12, fontWeight: '500'},
  resendArea: {marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center'},
  resendPrompt: {fontFamily: FONT_FAMILY, color: '#596579', fontSize: 11},
  resendAction: {fontFamily: FONT_FAMILY, color: '#8B4CF6', fontSize: 12, fontWeight: '600', textDecorationLine: 'underline'},
  resendCountdown: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 12, fontWeight: '600'},
  supportArea: {marginTop: 'auto', alignItems: 'center', paddingTop: 60},
  supportAreaKeyboardVisible: {marginTop: 34, paddingTop: 0},
  supportPrompt: {fontFamily: FONT_FAMILY, color: '#536074', fontSize: 10, marginBottom: 12},
  supportButton: {height: 34, paddingHorizontal: 15, borderWidth: 1, borderColor: '#D7DEE7', borderRadius: 5, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF'},
  supportLabel: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 11, fontWeight: '500', marginLeft: 8},
});
