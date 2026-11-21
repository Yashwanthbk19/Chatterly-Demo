import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {reportUser} from '../services/privacyApi';
import {createThemedStyles, themeInk} from '../theme/themedStyles';

export type ReportReason = 'Spam' | 'Harassment' | 'Fake Profile' | 'Other';

type Props = {
  visible: boolean;
  reportedUserId: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
};

const REASONS: ReportReason[] = ['Spam', 'Harassment', 'Fake Profile', 'Other'];
const PURPLE = '#8752F5';

function CloseIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="m6 6 12 12M18 6 6 18" stroke={themeInk('#344054')} strokeWidth={1.5} strokeLinecap="round"/></Svg>;
}

function BackIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="m15 5-7 7 7 7" stroke={themeInk('#344054')} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function SubmitIcon() {
  return <Svg width={17} height={17} viewBox="0 0 24 24" fill="none"><Rect x={3.5} y={4.5} width={17} height={13} rx={2} stroke={themeInk('#FFF')} strokeWidth={1.5}/><Path d="m8 18-2.5 2.5V18M8 9h8M8 13h5" stroke={themeInk('#FFF')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function Radio({selected}: {selected: boolean}) {
  return <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <CircleCheck/> : null}</View>;
}

function CircleCheck() {
  return <Svg width={17} height={17} viewBox="0 0 18 18" fill="none"><Circle cx={9} cy={9} r={8.5} fill={PURPLE}/><Path d="m5.5 9 2.2 2.2 4.8-4.8" stroke={themeInk('#FFF')} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

export function ReportFlowSheet({visible, reportedUserId, onClose, onSuccess}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'reason' | 'details'>('reason');
  const [reason, setReason] = useState<ReportReason>('Spam');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      setStep('reason');
      setReason('Spam');
      setDescription('');
      setError('');
      setSubmitting(false);
    }
  }, [visible]);

  const close = () => {
    if (!submitting) onClose();
  };

  const submit = async () => {
    if (submitting || !reportedUserId || !reason || (reason === 'Other' && !description.trim())) return;
    setSubmitting(true);
    setError('');
    try {
      await reportUser(reportedUserId, reason, reason === 'Other' ? description.trim() : '');
      setSubmitting(false);
      onSuccess('Report Submitted Successfully!');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Unable to submit your report.');
      setSubmitting(false);
    }
  };

  const chooseReason = (next: ReportReason) => {
    setReason(next);
    setError('');
    if (next === 'Other') setStep('details');
  };

  const canSubmit = Boolean(reason) && (reason !== 'Other' || Boolean(description.trim())) && !submitting;

  return <Modal animationType="slide" navigationBarTranslucent onRequestClose={close} statusBarTranslucent transparent visible={visible}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <Pressable accessibilityLabel="Close report flow" onPress={close} style={StyleSheet.absoluteFill}/>
      <View accessibilityViewIsModal style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, 14)}]}>
        <View style={styles.handle}/>
        {step === 'reason' ? <>
          <View style={styles.reasonHeader}>
            <View style={styles.headerSide}/>
            <Text accessibilityRole="header" style={styles.title}>Select Reason</Text>
            <Pressable accessibilityLabel="Close report reasons" hitSlop={10} onPress={close} style={styles.headerSide}><CloseIcon/></Pressable>
          </View>
          <View style={styles.reasonList}>
            {REASONS.map(item => <Pressable accessibilityLabel={item} accessibilityRole="radio" accessibilityState={{checked: reason === item}} key={item} onPress={() => chooseReason(item)} style={styles.reasonRow}>
              <Radio selected={reason === item}/><Text style={styles.reasonLabel}>{item}</Text>
            </Pressable>)}
          </View>
        </> : <>
          <View style={styles.detailsHeader}>
            <Pressable accessibilityLabel="Back to report reasons" hitSlop={10} onPress={() => {setStep('reason'); setError('');}} style={styles.headerSide}><BackIcon/></Pressable>
            <Text accessibilityRole="header" style={styles.title}>Provide a Reason</Text>
            <Pressable accessibilityLabel="Close report reason" hitSlop={10} onPress={close} style={styles.headerSide}><CloseIcon/></Pressable>
          </View>
          <View style={styles.inputWrap}>
            <TextInput
              accessibilityLabel="Report reason message"
              autoFocus
              maxLength={255}
              multiline
              onChangeText={value => {setDescription(value); setError('');}}
              placeholder="Type a message"
              placeholderTextColor="#98A2B3"
              style={styles.input}
              textAlignVertical="top"
              value={description}
            />
            <Text style={styles.characterCount}>{description.length}/255 characters</Text>
          </View>
        </>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.actionBar}>
          <Pressable accessibilityLabel="Submit Report" accessibilityRole="button" accessibilityState={{busy: submitting, disabled: !canSubmit}} disabled={!canSubmit} onPress={submit} style={[styles.submit, !canSubmit && styles.submitDisabled]}>
            {submitting ? <ActivityIndicator color="#FFF" size="small"/> : <><SubmitIcon/><Text style={styles.submitText}>Submit Report</Text></>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = createThemedStyles({
  overlay: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,.42)'},
  sheet: {maxHeight: '76%', borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#FFF', overflow: 'hidden'},
  handle: {width: 38, height: 4, marginTop: 7, marginBottom: 5, alignSelf: 'center', borderRadius: 2, backgroundColor: '#E1E6EF'},
  reasonHeader: {height: 49, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  detailsHeader: {height: 49, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  headerSide: {width: 32, height: 38, alignItems: 'center', justifyContent: 'center'},
  title: {color: '#111827', fontSize: 14, fontWeight: '600', textAlign: 'center'},
  reasonList: {paddingHorizontal: 20, paddingBottom: 12},
  reasonRow: {height: 53, flexDirection: 'row', alignItems: 'center'},
  radio: {width: 18, height: 18, borderRadius: 9, borderWidth: 1.4, borderColor: '#6F829C', alignItems: 'center', justifyContent: 'center'},
  radioSelected: {borderWidth: 0},
  reasonLabel: {marginLeft: 16, color: '#172033', fontSize: 13},
  inputWrap: {height: 186, marginHorizontal: 20, marginBottom: 18, borderWidth: 1, borderColor: '#D8DEE8', borderRadius: 6, backgroundColor: '#FFF'},
  input: {flex: 1, minHeight: 140, paddingHorizontal: 13, paddingTop: 13, color: '#101828', fontSize: 12, lineHeight: 18},
  characterCount: {paddingHorizontal: 8, paddingBottom: 7, color: '#7A8799', fontSize: 9, textAlign: 'right'},
  error: {paddingHorizontal: 20, paddingBottom: 8, color: '#D92D20', fontSize: 10, lineHeight: 14},
  actionBar: {paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0'},
  submit: {height: 44, borderRadius: 5, backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, shadowColor: '#6031C5', shadowOffset: {width: 0, height: 2}, shadowOpacity: .2, shadowRadius: 3, elevation: 3},
  submitDisabled: {backgroundColor: '#D3D8E1', shadowOpacity: 0, elevation: 0},
  submitText: {color: '#FFF', fontSize: 11, fontWeight: '500'},
});
