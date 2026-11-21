import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ChatLogo} from '../components/ChatLogo';
import {SupportIcon} from '../components/AuthIcons';
import {PatternBackground} from '../components/PatternBackground';
import {Snackbar} from '../components/Snackbar';
import {COUNTRIES, DEFAULT_COUNTRY} from '../constants/countries';
import {setPendingPhoneVerification, startPhoneVerification} from '../services/firebaseAuth';
import type {Country} from '../types/registration';
import {isValidPhoneLength} from '../utils/phoneNumber';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {
  onBack: () => void;
  onOtpSent: (dialCode: string, phone: string) => void;
  /**
   * 'two-factor' is the SMS step of two-step verification. The server only
   * accepts a code sent to the number on the account, so the copy asks for that
   * number rather than any phone.
   */
  purpose?: 'sign-in' | 'two-factor';
};
const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

function MobileIcon() {
  return (
    <View style={styles.mobileIcon}>
      <View style={styles.mobileSpeaker} />
      <View style={styles.mobileHome} />
    </View>
  );
}

export function PhoneNumberLoginScreen({onBack, onOtpSent, purpose = 'sign-in'}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const requestInFlight = useRef(false);
  const mounted = useRef(true);
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [message, setMessage] = useState('');
  const phoneIsValid = isValidPhoneLength(country, phone.length);

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

  const selectCountry = (nextCountry: Country) => {
    setCountry(nextCountry);
    setPhone('');
    setCountryPickerOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const sendOtp = async () => {
    if (!phoneIsValid || requestInFlight.current) { return; }
    requestInFlight.current = true;
    setSubmitting(true);
    setMessage('');
    try {
      // Firebase sends the SMS and later supplies the ID token that
      // POST /api/auth/phone-login exchanges for a session, exactly as the web
      // LoginPage does with signInWithPhoneNumber.
      const verification = await startPhoneVerification(`${country.dialCode}${phone}`);
      if (!mounted.current) { return; }
      setPendingPhoneVerification(verification);
      // Keep the button busy until navigation unmounts this screen.
      onOtpSent(country.dialCode, phone);
    } catch (error) {
      if (!mounted.current) { return; }
      requestInFlight.current = false;
      setSubmitting(false);
      setMessage(error instanceof Error ? error.message : 'Unable to start verification.');
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
          {purpose === 'two-factor' ? <>
            <Text style={styles.title}>Two-step verification</Text>
            <Text style={styles.subtitle}>Enter the mobile number on your Chatterly{`\n`}account to receive your sign-in code</Text>
          </> : <>
            <Text style={styles.title}>Enter your phone number</Text>
            <Text style={styles.subtitle}>We’ll send a verification code to your{`\n`}phone to verify your number</Text>
          </>}

          <Text style={styles.label}>Country</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Select country"
            disabled={submitting} onPress={() => setCountryPickerOpen(true)}
            style={[styles.countryField, submitting && styles.fieldDisabled]}>
            <Text style={styles.flag}>{country.flag}</Text>
            <Text style={styles.countryText}>{country.name} ({country.dialCode})</Text>
            <Text style={styles.chevron}>⌄</Text>
          </Pressable>

          <Text style={[styles.label, styles.phoneLabel]}>Phone Number</Text>
          <View style={[styles.phoneField, inputFocused && !submitting && styles.phoneFieldFocused,
            submitting && styles.fieldDisabled]}>
            <MobileIcon />
            <TextInput ref={inputRef} accessibilityLabel="Phone number"
              autoComplete="tel" autoFocus editable={!submitting} keyboardType="number-pad"
              maxLength={country.phoneLength} onBlur={() => setInputFocused(false)}
              onChangeText={value => setPhone(value.replace(/\D/g, ''))}
              onFocus={() => setInputFocused(true)}
              onSubmitEditing={sendOtp} placeholder="Enter your phone number"
              placeholderTextColor="#97A3B3" returnKeyType="done" style={styles.input} value={phone} />
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Send OTP"
            accessibilityState={{disabled: !phoneIsValid || submitting, busy: submitting}}
            disabled={!phoneIsValid || submitting} onPress={sendOtp}
            style={({pressed}) => [styles.sendButton,
              phoneIsValid && styles.sendButtonEnabled,
              pressed && phoneIsValid && styles.sendButtonPressed,
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
              <Text style={[styles.sendLabel, phoneIsValid && styles.sendLabelEnabled]}>Send OTP</Text>
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

      <Modal visible={countryPickerOpen} transparent animationType="fade"
        onRequestClose={() => setCountryPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCountryPickerOpen(false)}>
          <View style={styles.countrySheet}>
            <Text style={styles.sheetTitle}>Select country</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
            {COUNTRIES.map(option => (
              <Pressable key={option.code} onPress={() => selectCountry(option)} style={styles.countryOption}>
                <Text style={styles.optionFlag}>{option.flag}</Text>
                <Text style={styles.optionName}>{option.name}</Text>
                <Text style={styles.optionCode}>{option.dialCode}</Text>
                {option.code === country.code && <Text style={styles.selected}>✓</Text>}
              </Pressable>
            ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

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
  countryField: {width: '100%', height: 48, borderWidth: 1, borderColor: '#DCE2EA', borderRadius: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF'},
  fieldDisabled: {borderColor: '#E3E8EE', backgroundColor: '#F7F9FB'},
  flag: {fontSize: 17, marginRight: 9},
  countryText: {fontFamily: FONT_FAMILY, flex: 1, color: '#354052', fontSize: 12},
  chevron: {color: '#778396', fontSize: 17, marginTop: -5},
  phoneLabel: {marginTop: 22},
  phoneField: {width: '100%', height: 48, borderWidth: 1, borderColor: '#DCE2EA', borderRadius: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF'},
  phoneFieldFocused: {borderColor: '#637083'},
  mobileIcon: {width: 10, height: 17, borderWidth: 1, borderColor: '#667587', borderRadius: 2, alignItems: 'center', marginRight: 13},
  mobileSpeaker: {width: 3, height: 1, marginTop: 2, backgroundColor: '#667587'},
  mobileHome: {position: 'absolute', bottom: 1, width: 1.5, height: 1.5, borderRadius: 1, backgroundColor: '#667587'},
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
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,18,32,0.35)'},
  countrySheet: {maxHeight: '85%', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 34, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#FFFFFF'},
  sheetTitle: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 18, fontWeight: '700', marginBottom: 12},
  countryOption: {height: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E3E7ED'},
  optionFlag: {fontSize: 20, marginRight: 12},
  optionName: {fontFamily: FONT_FAMILY, flex: 1, color: '#263244', fontSize: 14},
  optionCode: {fontFamily: FONT_FAMILY, color: '#69768A', fontSize: 13},
  selected: {color: '#8B4CF6', fontSize: 17, fontWeight: '700', marginLeft: 12},
});
