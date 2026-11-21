import * as Clipboard from 'expo-clipboard';
import React, {useState} from 'react';
import {ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path, Rect} from 'react-native-svg';
import {
  SECURITY_CODE_LENGTH,
  formatSecurityCodeUpdatedAt,
  securityCodeForClipboard,
  securityCodeRows,
} from '../utils/securityCode';
import type {ConversationContact} from '../types/chat';
import {createThemedStyles, themeInk} from '../theme/themedStyles';

// Sprint 10 Story 2 - the "Your Security Code" sheet.
//
// A security code belongs to a *pair* of people, so the sheet always names the
// contact it was computed with; comparing a code without knowing whose it is
// would verify nothing. Everything else follows the approved design: the "How
// it works" callout, the digit block, when this device last computed it, and
// the copy action.

const FONT = Platform.select({android: 'sans-serif', ios: 'System'});
const PURPLE = '#7C3AED';

export type SecurityCodeStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

type Props = {
  code: string;
  contact: ConversationContact | null;
  /** Shown only when more than one conversation can be verified. */
  canChangeContact: boolean;
  errorMessage: string;
  onChangeContact: () => void;
  onClose: () => void;
  onRetry: () => void;
  status: SecurityCodeStatus;
  updatedAt: Date | null;
  visible: boolean;
};

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

function LockIcon({color = PURPLE, size = 20}: {color?: string; size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5.5} y={10} width={13} height={10} rx={2.2} stroke={color} strokeWidth={1.7} />
      <Path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10M12 14v2" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CopyIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Rect x={8} y={8} width={11} height={11} rx={2} stroke={themeInk('#FFFFFF')} strokeWidth={1.7} />
      <Path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke={themeInk('#FFFFFF')} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="m6 6 12 12M18 6 6 18" stroke={themeInk('#344256')} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

/** The digit block, or its skeleton while the server is still answering. */
function CodeBlock({code, loading}: {code: string; loading: boolean}) {
  if (loading) {
    const placeholder = '0'.repeat(SECURITY_CODE_LENGTH);
    return (
      <View accessibilityLabel="Loading security code" style={styles.codeBlock}>
        {securityCodeRows(placeholder).map((row, rowIndex) => (
          <View key={rowIndex} style={styles.codeRow}>
            {row.map((group, groupIndex) => (
              <View key={groupIndex} style={styles.codeGroup}>
                {Array.from(group).map((_, digitIndex) => <View key={digitIndex} style={[styles.codeTile, styles.codeTileLoading]} />)}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View accessibilityLabel={`Security code ${securityCodeForClipboard(code)}`} style={styles.codeBlock}>
      {securityCodeRows(code).map((row, rowIndex) => (
        <View key={rowIndex} style={styles.codeRow}>
          {row.map((group, groupIndex) => (
            <View key={groupIndex} style={styles.codeGroup}>
              {Array.from(group).map((digit, digitIndex) => (
                <View key={digitIndex} style={styles.codeTile}>
                  <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.codeDigit}>{digit}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function SecurityCodeSheet({
  code,
  contact,
  canChangeContact,
  errorMessage,
  onChangeContact,
  onClose,
  onRetry,
  status,
  updatedAt,
  visible,
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const ready = status === 'ready' && Boolean(code);

  const copy = async () => {
    if (!ready) { return; }
    await Clipboard.setStringAsync(securityCodeForClipboard(code));
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const share = async () => {
    if (!ready) { return; }
    await Share.share({
      message: `Chatterly security code${contact ? ` with ${contact.name}` : ''}: ${securityCodeForClipboard(code)}`,
    }).catch(() => undefined);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close security code backdrop" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityLabel="Your Security Code" style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, 14)}]}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>Your Security Code</Text>
            <Pressable accessibilityLabel="Close security code" hitSlop={10} onPress={onClose} style={styles.closeButton}><CloseIcon /></Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.callout}>
              <LockIcon />
              <View style={styles.calloutCopy}>
                <Text style={styles.calloutTitle}>How it works</Text>
                <Text style={styles.calloutText}>
                  If the codes match, this conversation is end-to-end encrypted and safe from eavesdropping.
                </Text>
              </View>
            </View>

            {contact ? (
              <Pressable
                accessibilityLabel={canChangeContact ? `Verifying with ${contact.name}. Change conversation` : `Verifying with ${contact.name}`}
                accessibilityRole={canChangeContact ? 'button' : 'text'}
                disabled={!canChangeContact}
                onPress={onChangeContact}
                style={styles.contactRow}>
                {contact.thumbnail
                  ? <Image source={{uri: contact.thumbnail}} style={styles.contactAvatar} />
                  : <View style={[styles.contactAvatar, styles.contactAvatarFallback]}><Text style={styles.contactInitials}>{initialsOf(contact.name)}</Text></View>}
                <View style={styles.contactCopy}>
                  <Text style={styles.contactLabel}>Verifying with</Text>
                  <Text numberOfLines={1} style={styles.contactName}>{contact.name}</Text>
                </View>
                {canChangeContact ? <Text style={styles.contactChange}>Change</Text> : null}
              </Pressable>
            ) : null}

            {ready || status === 'loading' ? (
              <CodeBlock code={code} loading={status === 'loading'} />
            ) : (
              <View accessibilityLabel="Security code unavailable" style={styles.unavailable}>
                <Text style={styles.unavailableText}>
                  {status === 'error'
                    ? errorMessage || 'The security code could not be loaded. Please try again.'
                    : 'Open a one-to-one conversation before viewing its security code.'}
                </Text>
                {status === 'error' ? (
                  <Pressable accessibilityLabel="Try loading the security code again" onPress={onRetry} style={styles.retryButton}>
                    <Text style={styles.retryText}>Try Again</Text>
                  </Pressable>
                ) : null}
              </View>
            )}

            <Text style={styles.updatedAt}>
              {ready && updatedAt ? `Last updated: ${formatSecurityCodeUpdatedAt(updatedAt)}` : ' '}
            </Text>

            <Pressable
              accessibilityLabel={copied ? 'Security code copied' : 'Copy security code'}
              accessibilityState={{disabled: !ready}}
              disabled={!ready}
              onPress={() => { copy().catch(() => undefined); }}
              style={[styles.copyButton, !ready && styles.copyButtonDisabled]}>
              {status === 'loading' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <CopyIcon />}
              <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>

            {ready ? (
              <Pressable accessibilityLabel="Share security code" onPress={() => { share().catch(() => undefined); }} style={styles.shareButton}>
                <Text style={styles.shareText}>Share code</Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <LockIcon color="#475569" size={18} />
            <View style={styles.calloutCopy}>
              <Text style={styles.footerTitle}>Your privacy is protected</Text>
              <Text style={styles.footerText}>
                Security codes are unique to this conversation and are never shared with Chatterly. Only you and your contact can see them.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = createThemedStyles({
  backdrop: {flex: 1, backgroundColor: 'rgba(15,23,42,.45)', justifyContent: 'flex-end'},
  sheet: {maxHeight: '88%', borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#FFFFFF'},
  grabber: {alignSelf: 'center', width: 44, height: 4, marginTop: 9, borderRadius: 2, backgroundColor: '#E2E8F0'},
  header: {minHeight: 50, paddingLeft: 18, paddingRight: 10, flexDirection: 'row', alignItems: 'center'},
  title: {flex: 1, color: '#111827', fontFamily: FONT, fontSize: 14, fontWeight: '700'},
  closeButton: {width: 38, height: 38, alignItems: 'center', justifyContent: 'center'},
  body: {paddingHorizontal: 18, paddingBottom: 12},
  callout: {padding: 12, borderWidth: 1, borderColor: '#CDBBFF', borderRadius: 9, backgroundColor: '#F3EEFF', flexDirection: 'row', gap: 10},
  calloutCopy: {flex: 1, minWidth: 0},
  calloutTitle: {color: '#6D28D9', fontFamily: FONT, fontSize: 11, fontWeight: '700'},
  calloutText: {marginTop: 3, color: '#374151', fontFamily: FONT, fontSize: 10, lineHeight: 15},
  contactRow: {marginTop: 14, padding: 9, borderWidth: 1, borderColor: '#EAECF0', borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 10},
  contactAvatar: {width: 34, height: 34, borderRadius: 17},
  contactAvatarFallback: {backgroundColor: '#EEE5FF', alignItems: 'center', justifyContent: 'center'},
  contactInitials: {color: PURPLE, fontFamily: FONT, fontSize: 11, fontWeight: '700'},
  contactCopy: {flex: 1, minWidth: 0},
  contactLabel: {color: '#8791A2', fontFamily: FONT, fontSize: 8},
  contactName: {marginTop: 2, color: '#172033', fontFamily: FONT, fontSize: 11, fontWeight: '600'},
  contactChange: {color: PURPLE, fontFamily: FONT, fontSize: 10, fontWeight: '700'},
  codeBlock: {marginTop: 18, gap: 8},
  codeRow: {flexDirection: 'row', justifyContent: 'space-between', gap: 10},
  codeGroup: {flex: 1, flexDirection: 'row', gap: 3},
  codeTile: {flex: 1, aspectRatio: 1, borderRadius: 3, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center'},
  codeTileLoading: {backgroundColor: '#F1F5F9'},
  codeDigit: {color: '#111827', fontFamily: FONT, fontSize: 12, fontWeight: '600'},
  unavailable: {marginTop: 18, paddingHorizontal: 16, paddingVertical: 20, borderRadius: 9, backgroundColor: '#F8FAFC', alignItems: 'center'},
  unavailableText: {color: '#64748B', fontFamily: FONT, fontSize: 10, lineHeight: 16, textAlign: 'center'},
  retryButton: {height: 32, marginTop: 12, paddingHorizontal: 16, borderRadius: 6, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center'},
  retryText: {color: '#FFFFFF', fontFamily: FONT, fontSize: 10, fontWeight: '600'},
  updatedAt: {minHeight: 15, marginTop: 11, color: '#64748B', fontFamily: FONT, fontSize: 9},
  copyButton: {height: 46, marginTop: 10, borderRadius: 9, backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9},
  copyButtonDisabled: {opacity: .45},
  copyText: {color: '#FFFFFF', fontFamily: FONT, fontSize: 12, fontWeight: '700'},
  shareButton: {height: 38, alignItems: 'center', justifyContent: 'center'},
  shareText: {color: PURPLE, fontFamily: FONT, fontSize: 11, fontWeight: '600'},
  footer: {paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EDF1F6', backgroundColor: '#F8FAFC', flexDirection: 'row', gap: 10},
  footerTitle: {color: '#111827', fontFamily: FONT, fontSize: 11, fontWeight: '700'},
  footerText: {marginTop: 3, color: '#64748B', fontFamily: FONT, fontSize: 9, lineHeight: 14},
});
