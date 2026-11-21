import {createThemedStyles, themeInk} from '../theme/themedStyles';
import React from 'react';
import {ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import type {ChatProfile} from '../types/chat';
import {formatPhoneNumber} from '../utils/phoneNumber';

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

type Props = {
  visible: boolean;
  bottomInset: number;
  loading: boolean;
  /** What the call screen already knows, shown while the profile loads. */
  name: string;
  picture?: string | null;
  profile: ChatProfile | null;
  onBack: () => void;
  /** Leaves the call screen for the conversation (the call carries on). */
  onMessage?: () => void;
};

/**
 * "View Contact" in a one-to-one call's More options: who the call is with,
 * without leaving the call. Rendered as a sheet over the call screen - not by
 * opening the chat's contact page, which sits underneath the call and so never
 * appeared.
 */
export function CallContactSheet({bottomInset, loading, name, onBack, onMessage, picture, profile, visible}: Props): React.JSX.Element {
  const shownName = profile?.name || name;
  const photo = profile?.profilePic || picture || '';
  const about = profile?.status && !['online', 'offline', 'away', 'unavailable'].includes(profile.status.toLowerCase()) ? profile.status : '';
  const phone = profile?.phone ? formatPhoneNumber(profile.phone) : '';
  return <Modal animationType="slide" onRequestClose={onBack} statusBarTranslucent transparent visible={visible}>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel="Close View Contact backdrop" onPress={onBack} style={StyleSheet.absoluteFill}/>
      <View accessibilityLabel="View Contact details" style={[styles.sheet, {paddingBottom: Math.max(bottomInset, 14)}]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back from View Contact" hitSlop={8} onPress={onBack} style={styles.headerButton}><Svg width={20} height={20} viewBox="0 0 24 24"><Path d="m14 6-6 6 6 6" fill="none" stroke={themeInk('#344256')} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}/></Svg></Pressable>
          <Text accessibilityRole="header" style={styles.title}>View Contact</Text>
          <Pressable accessibilityLabel="Close View Contact" hitSlop={8} onPress={onBack} style={styles.headerButton}><Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6 6 18" fill="none" stroke={themeInk('#344256')} strokeLinecap="round" strokeWidth={1.6}/></Svg></Pressable>
        </View>
        {photo ? <Image source={{uri: photo}} style={styles.avatar}/> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.initials}>{initialsOf(shownName)}</Text></View>}
        <Text style={styles.name}>{shownName}</Text>
        {loading ? <ActivityIndicator color="#8B5CF6" style={styles.loading}/> : <>
          {phone ? <Text accessibilityLabel={`Mobile number ${phone}`} selectable style={styles.phone}>{phone}</Text> : null}
          <Text numberOfLines={2} style={styles.about}>{about || 'Hey there! I am using Chatterly'}</Text>
        </>}
        {onMessage ? <Pressable accessibilityLabel={`Message ${shownName}`} accessibilityRole="button" onPress={onMessage} style={styles.messageButton}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="M4 5.5h16v11H9l-5 3v-14Z" stroke={themeInk('#6D28D9')} strokeWidth={1.5} strokeLinejoin="round"/></Svg>
          <Text style={styles.messageText}>Message</Text>
        </Pressable> : null}
      </View>
    </View>
  </Modal>;
}

// The call screens are dark-on-light in both themes, so this sheet is not themed.
const styles = createThemedStyles({
  backdrop: {flex: 1, backgroundColor: 'rgba(15,23,42,.42)', justifyContent: 'flex-end'},
  sheet: {minHeight: 300, paddingHorizontal: 8, borderTopLeftRadius: 15, borderTopRightRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center'},
  header: {alignSelf: 'stretch', height: 48, flexDirection: 'row', alignItems: 'center'},
  headerButton: {width: 42, height: 42, alignItems: 'center', justifyContent: 'center'},
  title: {flex: 1, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600', textAlign: 'center'},
  avatar: {width: 84, height: 84, marginTop: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  avatarFallback: {backgroundColor: '#F0E7FF'},
  initials: {color: '#7137DD', fontFamily: FONT_FAMILY, fontSize: 26, fontWeight: '800'},
  name: {marginTop: 12, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: '700'},
  loading: {marginTop: 18},
  phone: {marginTop: 6, color: '#344256', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '500'},
  about: {marginTop: 6, maxWidth: 280, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 11, textAlign: 'center'},
  messageButton: {marginTop: 20, marginBottom: 6, minWidth: 150, height: 42, paddingHorizontal: 18, borderRadius: 9, backgroundColor: '#F3EDFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8},
  messageText: {color: '#6D28D9', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600'},
});
