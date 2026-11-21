import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {EmailIcon, GoogleIcon} from '../components/AuthIcons';
import {ChatLogo} from '../components/ChatLogo';
import {PatternBackground} from '../components/PatternBackground';
import type {AuthMethod} from '../types/auth';
import type {RegistrationMethod} from '../types/registration';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {
  loadingMethod?: AuthMethod;
  onContinue: (method: RegistrationMethod) => void;
  onGoogle: () => void;
};
const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

function PhoneIcon({loading}: {loading: boolean}) {
  return (
    <View style={[styles.phoneIcon, loading && styles.phoneIconLoading]}>
      <View style={[styles.phoneSpeaker, loading && styles.phoneDetailLoading]} />
      <View style={[styles.phoneHome, loading && styles.phoneDetailLoading]} />
    </View>
  );
}

export function WelcomeScreen({loadingMethod, onContinue, onGoogle}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const isLoading = Boolean(loadingMethod);
  const phoneLoading = loadingMethod === 'phone';
  const emailLoading = loadingMethod === 'email';
  const googleLoading = loadingMethod === 'google';
  const topSpace = Math.max(72, Math.min(116, height * 0.13));

  return (
    <View style={styles.root}>
      <PatternBackground />
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, {paddingTop: insets.top + topSpace, paddingBottom: Math.max(insets.bottom + 24, 32)}]}>
        <View style={styles.content}>
          <ChatLogo />

          <Text style={styles.title}>Start chatting in seconds</Text>
          <Text style={styles.subtitle}>
            Select a sign-in method to continue. You’ll be ready to{`\n`}create and explore in just a few seconds.
          </Text>

          <Pressable accessibilityRole="button" accessibilityLabel="Continue with phone number"
            accessibilityState={{busy: phoneLoading, disabled: isLoading}}
            disabled={isLoading} onPress={() => onContinue('phone')}
            style={({pressed}) => [styles.primaryButton,
              isLoading && styles.primaryLoading, (pressed || phoneLoading) && styles.activeButton]}>
            <View style={styles.buttonIcon}><PhoneIcon loading={isLoading && !phoneLoading} /></View>
            <Text style={[styles.primaryLabel, isLoading && !phoneLoading && styles.primaryLabelLoading]}>
              Continue with phone number
            </Text>
            <View style={styles.buttonIcon}>
              {phoneLoading && <ActivityIndicator size="small" color="#FFFFFF" />}
            </View>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.divider} />
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Continue with email"
            accessibilityState={{busy: emailLoading, disabled: isLoading}}
            disabled={isLoading} onPress={() => onContinue('email')}
            style={({pressed}) => [styles.secondaryButton,
              isLoading && styles.secondaryDisabled, (pressed || emailLoading) && styles.activeButton]}>
            {({pressed}) => <>
            <View style={styles.buttonIcon}><EmailIcon color={pressed || emailLoading ? '#FFFFFF' : undefined} /></View>
            <Text style={[styles.secondaryLabel, isLoading && styles.secondaryLabelDisabled,
              (pressed || emailLoading) && styles.primaryLabel]}>Email</Text>
            <View style={styles.buttonIcon}>
              {emailLoading && <ActivityIndicator size="small" color="#FFFFFF" />}
            </View>
            </>}
          </Pressable>

          <Pressable accessibilityRole="button" accessibilityLabel="Continue with Google"
            accessibilityState={{busy: googleLoading, disabled: isLoading}}
            disabled={isLoading}
            onPress={onGoogle}
            style={({pressed}) => [styles.secondaryButton, styles.googleButton,
              isLoading && styles.secondaryDisabled, (pressed || googleLoading) && styles.activeButton]}>
            {({pressed}) => <>
            <View style={styles.buttonIcon}><GoogleIcon /></View>
            <Text style={[styles.secondaryLabel, isLoading && styles.secondaryLabelDisabled,
              (pressed || googleLoading) && styles.primaryLabel]}>Google</Text>
            <View style={styles.buttonIcon}>
              {googleLoading && <ActivityIndicator size="small" color="#FFFFFF" />}
            </View>
            </>}
          </Pressable>

          <Text style={[styles.termsText, styles.termsIntro]}>By continuing, you agree to Chatterly’s </Text>
          <View style={styles.termsLinks}>
            <Pressable accessibilityRole="link" onPress={() => Alert.alert('Terms of Service')}>
              <Text style={styles.link}>Terms of Service</Text>
            </Pressable>
            <Text style={styles.termsText}> and </Text>
            <Pressable accessibilityRole="link" onPress={() => Alert.alert('Privacy Policy')}>
              <Text style={styles.link}>Privacy Policy.</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#FFFFFF'},
  scrollContent: {flexGrow: 1, paddingHorizontal: 18},
  content: {width: '100%', maxWidth: 430, alignSelf: 'center', alignItems: 'center'},
  title: {fontFamily: FONT_FAMILY, marginTop: 55, color: '#171717', fontSize: 17, lineHeight: 22, fontWeight: '800', textAlign: 'center'},
  subtitle: {fontFamily: FONT_FAMILY, marginTop: 8, marginBottom: 32, color: '#596275', fontSize: 12, lineHeight: 18, textAlign: 'center'},
  primaryButton: {width: '100%', height: 50, borderRadius: 5, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#8B4CF6', shadowColor: '#7C3AED', shadowOpacity: 0.28, shadowRadius: 7, shadowOffset: {width: 0, height: 4}, elevation: 5},
  activeButton: {backgroundColor: '#8B4CF6', borderColor: '#8B4CF6', height: 50, borderRadius: 5, shadowOpacity: 0, elevation: 0},
  primaryLoading: {backgroundColor: '#E8EEF5', shadowOpacity: 0, elevation: 0},
  primaryLabel: {fontFamily: FONT_FAMILY, color: '#FFFFFF', fontSize: 13, fontWeight: '600'},
  primaryLabelLoading: {color: '#5F6C7B'},
  buttonIcon: {width: 22, alignItems: 'center', justifyContent: 'center'},
  phoneIcon: {width: 11, height: 19, borderWidth: 1.5, borderColor: '#FFFFFF', borderRadius: 2.5, alignItems: 'center'},
  phoneIconLoading: {borderColor: '#5F6C7B'},
  phoneSpeaker: {width: 4, height: 1, marginTop: 2, backgroundColor: '#FFFFFF'},
  phoneHome: {position: 'absolute', bottom: 1.5, width: 2, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF'},
  phoneDetailLoading: {backgroundColor: '#5F6C7B'},
  dividerRow: {width: '100%', marginVertical: 31, flexDirection: 'row', alignItems: 'center'},
  divider: {flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#C9CDD6'},
  dividerText: {fontFamily: FONT_FAMILY, marginHorizontal: 12, color: '#7B8495', fontSize: 10},
  secondaryButton: {width: '100%', height: 46, borderWidth: 1, borderColor: '#D9DDE5', borderRadius: 6, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.92)'},
  googleButton: {marginTop: 14},
  secondaryDisabled: {borderColor: '#E1E7EE', backgroundColor: '#E8EEF5'},
  secondaryLabel: {fontFamily: FONT_FAMILY, color: '#252A35', fontSize: 12, fontWeight: '600'},
  secondaryLabelDisabled: {color: '#667587'},
  termsText: {fontFamily: FONT_FAMILY, color: '#697386', fontSize: 9.5, textAlign: 'center'},
  termsIntro: {marginTop: 54},
  termsLinks: {flexDirection: 'row', alignItems: 'center'},
  link: {fontFamily: FONT_FAMILY, color: '#202532', fontSize: 9.5, fontWeight: '600', textDecorationLine: 'underline'},
});
