import React, {useEffect, useRef, useState} from 'react';
import {Animated, Platform, Text, TextInput, View} from 'react-native';
import type {TextInputProps} from 'react-native';
import {OTP_LENGTH} from '../constants/otp';
import {sanitizeOtpInput} from '../utils/otpValidation';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {
  value: string;
  onChange: (code: string) => void;
  onSubmit?: () => void;
  editable?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
};

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

// Android reads the code through the SMS Retriever hint, iOS through the
// one-time-code content type. Both only fill the field - submitting stays
// manual because the backend allows just three attempts.
const AUTO_COMPLETE = Platform.select<TextInputProps['autoComplete']>({
  android: 'sms-otp',
  ios: 'one-time-code',
});

/**
 * The design draws a caret in the box waiting for the next digit. The real one
 * belongs to the overlay input and would sit at the wrong x, so it stays hidden
 * and this blinking bar stands in for it.
 */
function BoxCaret(): React.JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blink = Animated.loop(Animated.sequence([
      Animated.timing(opacity, {toValue: 0, duration: 520, delay: 380, useNativeDriver: true}),
      Animated.timing(opacity, {toValue: 1, duration: 520, delay: 120, useNativeDriver: true}),
    ]));
    blink.start();
    return () => blink.stop();
  }, [opacity]);

  return <Animated.View pointerEvents="none" style={[styles.caret, {opacity}]} />;
}

// One transparent input sits over the six boxes: it keeps a single caret
// position, so autofill and a pasted code arrive as one change event instead
// of racing six separate fields.
export function OtpCodeInput({
  value,
  onChange,
  onSubmit,
  editable = true,
  hasError = false,
  autoFocus = false,
}: Props): React.JSX.Element {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = Array.from({length: OTP_LENGTH}, (_, index) => value[index] ?? '');
  const activeIndex = Math.min(value.length, OTP_LENGTH - 1);

  // iOS can ignore autoFocus while this screen is being presented. Focusing on
  // the next frame keeps the native one-time-code field ready for typing and
  // autofill without splitting the code across six competing inputs.
  useEffect(() => {
    if (!autoFocus || !editable) { return; }
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, editable]);

  return (
    <View style={styles.wrapper}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.row}>
        {digits.map((digit, index) => {
          const active = focused && editable && index === activeIndex;
          return (
            <View
              key={index}
              style={[
                styles.box,
                digit !== '' && styles.boxFilled,
                active && styles.boxActive,
                hasError && styles.boxError,
                !editable && styles.boxDisabled,
              ]}>
              {active && digit === '' ? <BoxCaret /> : <Text style={styles.digit}>{digit}</Text>}
            </View>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        accessibilityLabel="6 digit verification code"
        autoComplete={AUTO_COMPLETE}
        autoFocus={autoFocus}
        caretHidden
        editable={editable}
        importantForAutofill="yes"
        keyboardType="number-pad"
        // Deliberately larger than OTP_LENGTH. maxLength is applied natively to
        // the RAW text, before `sanitizeOtpInput` strips separators, so capping
        // it at six silently swallows the last digit of a code pasted as
        // "482 913" or "482-913". Truncation to six digits happens below.
        maxLength={OTP_LENGTH * 4}
        blurOnSubmit={false}
        onBlur={() => setFocused(false)}
        onChangeText={next => onChange(sanitizeOtpInput(next))}
        onFocus={() => setFocused(true)}
        onSubmitEditing={onSubmit}
        returnKeyType="done"
        selectionColor="transparent"
        style={styles.hiddenInput}
        textContentType="oneTimeCode"
        underlineColorAndroid="transparent"
        value={value}
      />
    </View>
  );
}

const styles = createThemedStyles({
  wrapper: {width: '100%'},
  row: {flexDirection: 'row', justifyContent: 'space-between'},
  box: {flex: 1, maxWidth: 52, height: 56, marginHorizontal: 4, borderWidth: 1, borderColor: '#DCE2EA', borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF'},
  boxFilled: {borderColor: '#B9C3D0'},
  boxActive: {borderColor: '#8B4CF6'},
  boxError: {borderColor: '#D7443E', backgroundColor: '#FDF4F3'},
  boxDisabled: {borderColor: '#E3E8EE', backgroundColor: '#F7F9FB'},
  digit: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 20, fontWeight: '600'},
  caret: {width: 1.5, height: 22, borderRadius: 1, backgroundColor: '#0B1220'},
  // Transparent but still the touch target, so tapping a box focuses the field.
  // A zero-opacity TextInput is not consistently focusable on iOS, so the
  // native view keeps a tiny alpha while receiving the complete code.
  hiddenInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 20,
    // Some Android keyboards/autofill services paint composed text despite a
    // transparent text color. A tiny non-zero native-view alpha keeps the
    // TextInput focusable while preventing the complete code from appearing
    // over the first visual box.
    opacity: 0.01,
  },
});
