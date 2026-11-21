import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView, Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {EmailIcon, SupportIcon} from '../components/AuthIcons';
import {ChatLogo} from '../components/ChatLogo';
import {PatternBackground} from '../components/PatternBackground';
import {Snackbar} from '../components/Snackbar';
import {DEFAULT_COUNTRY} from '../constants/countries';
import {sendEmailOtp} from '../services/authApi';
import {validateRegistration} from '../utils/registrationValidation';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {onBack: () => void; onOtpSent: (email: string) => void};
const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

export function EmailLoginScreen({onBack, onOtpSent}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const scrollRef = useRef<ScrollView>(null);
  const requestInFlight = useRef(false);
  const mounted = useRef(true);
  const [email, setEmail] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const emailIsValid = !validateRegistration('email', email, DEFAULT_COUNTRY).email;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

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

  const revealSendButton = () => {
    if (keyboardVisible) scrollRef.current?.scrollToEnd({animated: false});
  };

  const submitEmail = async () => {
    if (!emailIsValid || requestInFlight.current) { return; }
    const normalizedEmail = email.trim().toLowerCase();
    requestInFlight.current = true;
    setSubmitting(true);
    setMessage('');
    try {
      await sendEmailOtp(normalizedEmail);
      if (!mounted.current) { return; }
      // The verification screen confirms delivery, so no snackbar here.
      // Keep the button busy until navigation unmounts this screen.
      onOtpSent(normalizedEmail);
    } catch (error) {
      if (!mounted.current) { return; }
      requestInFlight.current = false;
      setSubmitting(false);
      setMessage(error instanceof Error ? error.message : 'Unable to send the email OTP.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PatternBackground />
      <ScrollView ref={scrollRef} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled"
        onLayout={revealSendButton} onContentSizeChange={revealSendButton} contentContainerStyle={[
        styles.content,
        {paddingTop: keyboardVisible ? Math.max(insets.top + 28, 52) : Math.max(insets.top + 68, height * 0.2), paddingBottom: Math.max(insets.bottom + 18, 28)},
      ]}>
        <ChatLogo />

        <View style={[styles.form, keyboardVisible && styles.formKeyboardVisible]}>
          <Text style={styles.title}>Enter your email address</Text>
          <Text style={styles.subtitle}>We’ll send a verification code to your{`\n`}email to verify your identity</Text>

          <Text style={styles.label}>Email</Text>
          <View style={[styles.emailField, inputFocused && !submitting && styles.emailFieldFocused,
            submitting && styles.fieldDisabled]}>
            <EmailIcon />
            <TextInput ref={inputRef} accessibilityLabel="Email address"
              autoCapitalize="none" autoComplete="email" autoCorrect={false} editable={!submitting}
              keyboardType="email-address" maxLength={254} onBlur={() => setInputFocused(false)}
              onChangeText={setEmail} onFocus={() => setInputFocused(true)}
              onSubmitEditing={submitEmail} placeholder="example@gmail.com"
              placeholderTextColor="#97A3B3" returnKeyType="done" style={styles.input} value={email} />
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Send email OTP"
            accessibilityState={{disabled: !emailIsValid || submitting, busy: submitting}}
            disabled={!emailIsValid || submitting} onPress={submitEmail}
            style={({pressed}) => [styles.sendButton,
              emailIsValid && styles.sendButtonEnabled,
              pressed && emailIsValid && styles.sendButtonPressed,
              submitting && styles.sendButtonSending]}>
            {submitting ? (
              <View style={styles.sendingRow}>
                <View style={styles.loadingSlot} />
                <Text style={styles.sendingLabel}>Sending OTP</Text>
                <View style={styles.loadingSlot}>
                  <ActivityIndicator size="small" color="#273448" />
                </View>
              </View>
            ) : (
              <Text style={[styles.sendLabel, emailIsValid && styles.sendLabelEnabled]}>Send OTP</Text>
            )}
          </Pressable>
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
  subtitle: {fontFamily: FONT_FAMILY, color: '#596579', fontSize: 12, lineHeight: 18, marginTop: 9, marginBottom: 25, textAlign: 'center'},
  label: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 12, lineHeight: 16, fontWeight: '600', marginBottom: 8},
  emailField: {width: '100%', height: 48, borderWidth: 1, borderColor: '#DCE2EA', borderRadius: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FFFFFF'},
  emailFieldFocused: {borderColor: '#637083'},
  fieldDisabled: {borderColor: '#E3E8EE', backgroundColor: '#F7F9FB'},
  input: {fontFamily: FONT_FAMILY, flex: 1, height: '100%', padding: 0, color: '#0B1220', fontSize: 12},
  sendButton: {width: '100%', height: 48, marginTop: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DFE5ED'},
  sendButtonEnabled: {backgroundColor: '#8B4CF6'},
  sendButtonPressed: {backgroundColor: '#7C3FE1'},
  sendButtonSending: {backgroundColor: '#DFE5ED'},
  sendLabel: {fontFamily: FONT_FAMILY, color: '#6F7C8F', fontSize: 12, fontWeight: '500'},
  sendLabelEnabled: {color: '#FFFFFF', fontWeight: '600'},
  sendingRow: {width: '100%', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  loadingSlot: {width: 22, alignItems: 'center', justifyContent: 'center'},
  sendingLabel: {fontFamily: FONT_FAMILY, color: '#667587', fontSize: 12, fontWeight: '500'},
  supportArea: {marginTop: 'auto', alignItems: 'center', paddingTop: 60},
  supportAreaKeyboardVisible: {marginTop: 34, paddingTop: 0},
  supportPrompt: {fontFamily: FONT_FAMILY, color: '#536074', fontSize: 10, marginBottom: 12},
  supportButton: {height: 34, paddingHorizontal: 15, borderWidth: 1, borderColor: '#D7DEE7', borderRadius: 5, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF'},
  supportLabel: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 11, fontWeight: '500', marginLeft: 8},
});
