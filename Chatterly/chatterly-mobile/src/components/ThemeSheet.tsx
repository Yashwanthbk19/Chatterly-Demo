// Sprint 11 Story 2 - the Theme bottom sheet.
//
// The design's sheet is the three radio rows under a "Theme" title with a close
// button. The wireframe adds a chat preview and Save Changes, which sit below
// those rows: tapping a radio repaints the app immediately (Instant Apply), the
// preview is simply the app in that theme, and Save Changes commits it to the
// device and the account. Closing the sheet without saving puts the previous
// theme back, so nothing stays applied that was never saved.

import React from 'react';
import {Modal, Platform, Pressable, ScrollView, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {createThemedStyles, themeInk} from '../theme/themedStyles';
import {THEME_PREFERENCE_LABELS, type ThemePreference} from '../theme/palette';
import {useTheme} from '../theme/ThemeProvider';

const FONT = Platform.select({android: 'sans-serif', ios: 'System'});

/** System Default first, as the design orders them. */
const OPTIONS: {preference: ThemePreference; swatch: {fill: string; border: string} | null}[] = [
  {preference: 'system', swatch: null},
  {preference: 'light', swatch: {fill: '#F2F4F8', border: '#E2E8F0'}},
  {preference: 'dark', swatch: {fill: '#0B1220', border: '#334155'}},
];

function CloseIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="m6 6 12 12M18 6 6 18" stroke={themeInk('#344054')} strokeWidth={1.6} strokeLinecap="round"/></Svg>;
}

function CheckIcon() {
  return <Svg width={11} height={11} viewBox="0 0 24 24" fill="none"><Path d="m5 13 4.5 4.5L19 7" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function Radio({selected}: {selected: boolean}) {
  return <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <CheckIcon/> : null}</View>;
}

export function ThemeSheet({visible, onClose}: {visible: boolean; onClose: () => void}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const {preference, dirty, saving, error, previewPreference, savePreference, cancelPreview} = useTheme();

  const dismiss = () => {
    cancelPreview();
    onClose();
  };

  const save = async () => {
    const saved = await savePreference();
    if (saved) { onClose(); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={dismiss}>
      <Pressable accessibilityLabel="Close theme options" style={styles.scrim} onPress={dismiss}/>
      <View style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, 14)}]}>
        <View style={styles.header}>
          <Text style={styles.title}>Theme</Text>
          <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={dismiss} hitSlop={10}><CloseIcon/></Pressable>
        </View>

        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {/* One radio group, so choosing an option is choosing it instead of the others. */}
          <View accessibilityRole="radiogroup" style={styles.options}>
            {OPTIONS.map(option => {
              const selected = preference === option.preference;
              return (
                <Pressable
                  accessibilityLabel={THEME_PREFERENCE_LABELS[option.preference]}
                  accessibilityRole="radio"
                  accessibilityState={{checked: selected, selected}}
                  key={option.preference}
                  onPress={() => previewPreference(option.preference)}
                  style={({pressed}) => [styles.option, pressed && styles.optionPressed]}>
                  <Radio selected={selected}/>
                  <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                    {THEME_PREFERENCE_LABELS[option.preference]}
                  </Text>
                  {option.swatch ? (
                    <View style={[styles.swatch, {backgroundColor: option.swatch.fill, borderColor: option.swatch.border}]}/>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.previewLabel}>Chat Preview</Text>
          <ChatPreview/>

          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityLabel="Save Changes"
            accessibilityRole="button"
            accessibilityState={{busy: saving, disabled: saving}}
            disabled={saving}
            onPress={save}
            style={[styles.save, saving && styles.saveBusy]}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * The wireframe's live preview. It needs no theme of its own: the app has
 * already repainted in the previewed theme, so these are ordinary themed styles.
 */
function ChatPreview(): React.JSX.Element {
  return (
    <View accessibilityLabel="Sample Conversation preview" style={styles.preview}>
      <Text style={styles.previewTitle}>Sample Conversation</Text>
      <View style={styles.incoming}>
        <Text style={styles.incomingText}>How does this theme look?</Text>
      </View>
      <View style={styles.outgoing}>
        <Text style={styles.outgoingText}>Looks great on my phone.</Text>
      </View>
    </View>
  );
}

const styles = createThemedStyles({
  scrim: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,18,32,.44)'},
  sheet: {position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '82%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingHorizontal: 16, paddingTop: 13},
  header: {height: 34, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between'},
  title: {fontFamily: FONT, fontSize: 13, fontWeight: '600', color: '#101828'},
  options: {marginTop: 2},
  option: {minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 6, paddingHorizontal: 4},
  optionPressed: {backgroundColor: '#F7F8FA'},
  radio: {width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center'},
  radioSelected: {backgroundColor: '#7137DD', borderColor: '#7137DD'},
  optionLabel: {flex: 1, fontFamily: FONT, fontSize: 12, color: '#172033'},
  optionLabelSelected: {fontWeight: '600'},
  swatch: {width: 22, height: 22, borderRadius: 11, borderWidth: 1},
  previewLabel: {fontFamily: FONT, fontSize: 9, fontWeight: '600', color: '#758196', letterSpacing: .4, textTransform: 'uppercase', marginTop: 10, marginBottom: 7},
  preview: {borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 11, backgroundColor: '#F7F8FA'},
  previewTitle: {fontFamily: FONT, fontSize: 10, fontWeight: '600', color: '#172033'},
  incoming: {alignSelf: 'flex-start', maxWidth: '82%', marginTop: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7EAF0', borderRadius: 9, borderBottomLeftRadius: 2, paddingHorizontal: 10, paddingVertical: 7},
  incomingText: {fontFamily: FONT, fontSize: 10, color: '#344054'},
  outgoing: {alignSelf: 'flex-end', maxWidth: '82%', marginTop: 7, backgroundColor: '#6F28F5', borderRadius: 9, borderBottomRightRadius: 2, paddingHorizontal: 10, paddingVertical: 7},
  outgoingText: {fontFamily: FONT, fontSize: 10, color: '#FFFFFF'},
  error: {fontFamily: FONT, fontSize: 10, color: '#DC2626', marginTop: 10},
  save: {height: 43, borderRadius: 4, backgroundColor: '#6F28F5', alignItems: 'center', justifyContent: 'center', marginTop: 13, marginBottom: 6},
  saveBusy: {opacity: .6},
  saveText: {fontFamily: FONT, fontSize: 12, fontWeight: '600', color: '#FFFFFF'},
});
