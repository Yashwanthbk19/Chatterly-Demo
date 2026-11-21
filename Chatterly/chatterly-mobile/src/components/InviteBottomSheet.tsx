import React, {useMemo} from 'react';
import {
  Image,
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
import {CloseIcon} from './ContactsIcons';
import {InviteActionsSvg, InviteMessageFrameSvg} from './InviteSectionSvgs';
import {BalashriSvg, InviteToChatterlySvg} from './InviteTextSvgs';
import {createThemedStyles} from '../theme/themedStyles';

export type InviteContact = {
  name: string;
  phone: string;
  thumbnail?: string | null;
};

type Props = {
  contact: InviteContact;
  invitationMessage: string;
  onChangeMessage: (message: string) => void;
  onClose: () => void;
  onSend: () => void;
};

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export function InviteBottomSheet({
  contact,
  invitationMessage,
  onChangeMessage,
  onClose,
  onSend,
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const sheetBottom = useMemo(() => Math.max(insets.bottom, 10), [insets.bottom]);
  const canSend = Boolean(contact.phone.trim() && invitationMessage.trim());

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <Pressable accessibilityLabel="Dismiss invite" onPress={onClose} style={StyleSheet.absoluteFill} />

        <View
          accessibilityLabel="Invite to Chatterly"
          accessibilityViewIsModal
          style={[styles.sheet, {paddingBottom: sheetBottom}]}>
          <View style={styles.dragHandle} />

          <View style={styles.titleRow}>
            <View accessibilityLabel="Invite to Chatterly" accessible>
              <InviteToChatterlySvg />
            </View>
            <Pressable
              accessibilityLabel="Close invite"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={styles.closeButton}>
              <CloseIcon />
            </Pressable>
          </View>

          <Text style={styles.description}>
            {contact.name} isn’t on Chatterly yet.{`\n`}Would you like to invite them to join?
          </Text>

          <View style={styles.contactRow}>
            {contact.thumbnail ? (
              <Image source={{uri: contact.thumbnail}} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initialOf(contact.name)}</Text>
              </View>
            )}
            {contact.name.trim().toLocaleLowerCase() === 'balashri' ? (
              <View accessibilityLabel={contact.name} accessible style={styles.contactNameGraphic}>
                <BalashriSvg />
                <Text accessible={false} style={styles.visuallyHidden}>{contact.name}</Text>
              </View>
            ) : (
              <Text numberOfLines={1} style={styles.contactName}>{contact.name}</Text>
            )}
          </View>

          <View style={styles.messageSection}>
            <InviteMessageFrameSvg />
            <TextInput
              accessibilityLabel="Invitation message"
              maxLength={320}
              multiline
              onChangeText={onChangeMessage}
              style={styles.messageInputOverlay}
              textAlignVertical="top"
              value={invitationMessage}
            />
          </View>

          <View style={styles.actionsGraphic}>
            <InviteActionsSvg />
            <Pressable
              accessibilityLabel="Send Invite via SMS"
              accessibilityRole="button"
              accessibilityState={{disabled: !canSend}}
              disabled={!canSend}
              onPress={onSend}
              style={({pressed}) => [styles.svgActionHit, styles.sendActionHit, !canSend && styles.svgActionDisabled, pressed && styles.svgActionPressed]}
            />
            <Pressable
              accessibilityLabel="Not Now"
              accessibilityRole="button"
              onPress={onClose}
              style={({pressed}) => [styles.svgActionHit, styles.notNowActionHit, pressed && styles.svgActionPressed]}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = createThemedStyles({
  overlay: {flex: 1, paddingHorizontal: 4, backgroundColor: 'rgba(13, 20, 34, 0.39)', justifyContent: 'flex-end'},
  sheet: {minHeight: 374, paddingHorizontal: 12, borderTopLeftRadius: 13, borderTopRightRadius: 13, backgroundColor: '#FFFFFF'},
  dragHandle: {alignSelf: 'center', width: 33, height: 3, marginTop: 6, borderRadius: 2, backgroundColor: '#D8DEE8'},
  titleRow: {height: 34, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  closeButton: {width: 26, height: 34, alignItems: 'center', justifyContent: 'center'},
  description: {color: '#526176', fontFamily: FONT_FAMILY, fontSize: 10, lineHeight: 15},
  contactRow: {height: 50, marginTop: 14, flexDirection: 'row', alignItems: 'center'},
  avatar: {width: 36, height: 36, borderRadius: 6},
  avatarFallback: {width: 36, height: 36, borderWidth: 1, borderColor: '#E7ECF3', borderRadius: 6, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center'},
  avatarInitial: {color: '#8792A4', fontFamily: FONT_FAMILY, fontSize: 11},
  contactName: {flex: 1, marginLeft: 10, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '500'},
  contactNameGraphic: {flex: 1, height: 48, marginLeft: 10, justifyContent: 'center'},
  visuallyHidden: {position: 'absolute', width: 1, height: 1, opacity: 0},
  messageSection: {position: 'relative', width: '100%', height: 100, marginTop: 5},
  messageInputOverlay: {position: 'absolute', left: 0, right: 0, top: 23, height: 76, zIndex: 2, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 7, borderWidth: 0, backgroundColor: 'transparent', color: '#0B1220', fontFamily: FONT_FAMILY, fontSize: 10, lineHeight: 14},
  actionsGraphic: {position: 'relative', width: '100%', height: 128, marginTop: 18},
  svgActionHit: {position: 'absolute', left: 0, right: 0, height: 56, borderRadius: 6},
  sendActionHit: {top: 0},
  notNowActionHit: {top: 72},
  svgActionDisabled: {backgroundColor: 'rgba(255,255,255,.55)'},
  svgActionPressed: {backgroundColor: 'rgba(255,255,255,.25)'},
});
