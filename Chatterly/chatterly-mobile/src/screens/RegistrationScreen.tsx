import React, {useCallback, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CountryPicker} from '../components/CountryPicker';
import {ChatLogo} from '../components/ChatLogo';
import {RegistrationMethodControl} from '../components/RegistrationMethodControl';
import {Snackbar} from '../components/Snackbar';
import {DEFAULT_COUNTRY} from '../constants/countries';
import {isDuplicateAccount} from '../services/registrationService';
import type {Country, RegistrationErrors, RegistrationMethod} from '../types/registration';
import {validateRegistration} from '../utils/registrationValidation';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {
  initialMethod?: RegistrationMethod;
  onBack?: () => void;
};

export function RegistrationScreen({initialMethod = 'phone', onBack}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const [method, setMethod] = useState<RegistrationMethod>(initialMethod);
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [pickerVisible, setPickerVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState('');

  const selectMethod = (next: RegistrationMethod) => {
    setMethod(next);
    setErrors({});
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const selectCountry = (next: Country) => {
    setCountry(next);
    setPhone('');
    setErrors({});
    setPickerVisible(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = async () => {
    const rawValue = method === 'phone' ? phone : email;
    const nextErrors = validateRegistration(method, rawValue, country);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    const accountValue = method === 'phone' ? `${country.dialCode}${phone}` : email;
    try {
      if (await isDuplicateAccount(method, accountValue)) {
        const target = method === 'phone' ? 'phone number' : 'email address';
        const message = `An account already exists for this ${target}.`;
        setErrors(method === 'phone' ? {phone: message} : {email: message});
        setSnackbar(message);
        return;
      }
      setSnackbar('Looks good! Your verification step is ready.');
    } catch {
      setSnackbar('Unable to check your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const clearSnackbar = useCallback(() => setSnackbar(''), []);
  const activeError = method === 'phone' ? errors.phone : errors.email;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scrollContent, {
          paddingTop: Math.max(insets.top, 18),
          paddingBottom: Math.max(insets.bottom, 24),
        }]}>
        <View style={styles.card}>
          <View style={styles.brandRow}>
            {(Platform.OS === 'ios' || onBack) && (
              <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}
                onPress={onBack || (() => Alert.alert('Back', 'This is the first screen.'))} style={styles.backButton}>
                <Text style={styles.backIcon}>‹</Text>
              </Pressable>
            )}
            <ChatLogo />
          </View>

          <Text style={styles.title}>{Platform.OS === 'ios' ? 'Create Account' : 'Create your account'}</Text>
          <Text style={styles.subtitle}>Welcome to Chatterly. Choose how you’d like to register.</Text>

          <Text style={styles.label}>Registration method</Text>
          <RegistrationMethodControl value={method} onChange={selectMethod} />

          <Text style={[styles.label, styles.inputLabel]}>
            {method === 'phone' ? 'Phone number' : 'Email address'}
          </Text>
          <View style={styles.inputRow}>
            {method === 'phone' && (
              <CountryPicker value={country} visible={pickerVisible}
                onOpen={() => setPickerVisible(true)} onClose={() => setPickerVisible(false)}
                onSelect={selectCountry} />
            )}
            <TextInput
              ref={inputRef}
              accessibilityLabel={method === 'phone' ? 'Phone number' : 'Email address'}
              autoCapitalize="none"
              autoComplete={method === 'phone' ? 'tel' : 'email'}
              autoCorrect={false}
              keyboardType={method === 'phone' ? 'number-pad' : 'email-address'}
              maxLength={method === 'phone' ? country.phoneLength : 254}
              onChangeText={text => {
                if (method === 'phone') {
                  setPhone(text.replace(/\D/g, ''));
                  if (activeError) { setErrors({}); }
                  return;
                }
                setEmail(text);
                const emailError = validateRegistration('email', text, country).email;
                setErrors(emailError ? {email: emailError} : {});
              }}
              onSubmitEditing={submit}
              placeholder={method === 'phone' ? 'Enter phone number' : 'name@example.com'}
              placeholderTextColor="#98A2B3"
              returnKeyType="done"
              style={[styles.input, activeError && styles.inputError]}
              value={method === 'phone' ? phone : email}
            />
          </View>
          <View style={styles.helperRow}>
            <Text accessibilityLiveRegion="polite" style={[styles.helper, activeError && styles.error]}>
              {activeError || (method === 'phone'
                ? `${country.phoneLengths?.join(' or ') ?? country.phoneLength} digits for ${country.name}`
                : 'We’ll send a verification link to this address')}
            </Text>
            {method === 'phone' && <Text style={styles.counter}>{phone.length}/{country.phoneLength}</Text>}
          </View>

          <Pressable accessibilityRole="button" accessibilityState={{disabled: submitting}}
            disabled={submitting} onPress={submit}
            style={({pressed}) => [styles.continueButton, pressed && styles.buttonPressed,
              submitting && styles.buttonDisabled]}>
            {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.continueText}>Continue</Text>}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} /><Text style={styles.or}>OR</Text><View style={styles.divider} />
          </View>
          <Text style={styles.accountPrompt}>Already have an account?</Text>
          <Pressable accessibilityRole="link" hitSlop={8}
            onPress={() => Alert.alert('Sign in', 'Sign-in navigation will open here.')}>
            <Text style={styles.signIn}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
      <Snackbar message={snackbar} onHide={clearSnackbar} />
    </KeyboardAvoidingView>
  );
}

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#F8FAFC'},
  scrollContent: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20},
  card: {width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: 24, paddingHorizontal: 24, paddingVertical: 28, backgroundColor: '#FFF', shadowColor: '#101828', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: {width: 0, height: 8}, elevation: 3},
  brandRow: {minHeight: 38, flexDirection: 'row', alignItems: 'center'},
  backButton: {width: 32, height: 38, justifyContent: 'center', marginRight: 2},
  backIcon: {fontSize: 34, lineHeight: 36, color: '#101828'},
  title: {fontSize: 28, lineHeight: 34, fontWeight: '800', color: '#101828', marginTop: 30},
  subtitle: {fontSize: 15, lineHeight: 22, color: '#667085', marginTop: 8, marginBottom: 26},
  label: {fontSize: 14, fontWeight: '600', color: '#344054', marginBottom: 9},
  inputLabel: {marginTop: 22},
  inputRow: {flexDirection: 'row', gap: 10},
  input: {flex: 1, height: 56, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: Platform.OS === 'ios' ? 12 : 8, paddingHorizontal: 15, backgroundColor: '#FFF', color: '#101828', fontSize: 16},
  inputError: {borderColor: '#D92D20', borderWidth: 1.5},
  helperRow: {minHeight: 32, paddingTop: 6, flexDirection: 'row'},
  helper: {flex: 1, fontSize: 12, lineHeight: 18, color: '#667085'},
  error: {color: '#D92D20'},
  counter: {fontSize: 12, color: '#98A2B3', marginLeft: 8},
  continueButton: {height: 54, marginTop: 10, borderRadius: Platform.OS === 'ios' ? 13 : 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6C5CE7', elevation: 2},
  buttonPressed: {backgroundColor: '#5948D8', transform: [{scale: 0.995}]},
  buttonDisabled: {opacity: 0.65},
  continueText: {fontSize: 16, fontWeight: '700', color: '#FFF'},
  dividerRow: {flexDirection: 'row', alignItems: 'center', marginVertical: 25},
  divider: {flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#D0D5DD'},
  or: {marginHorizontal: 12, fontSize: 12, fontWeight: '600', color: '#98A2B3'},
  accountPrompt: {textAlign: 'center', fontSize: 14, color: '#667085'},
  signIn: {textAlign: 'center', marginTop: 8, fontSize: 15, fontWeight: '700', color: '#6C5CE7'},
});
