import React from 'react';
import {ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import type {GroupMember} from '../services/groupApi';
import type {MemberAction} from '../utils/groupAdmin';
import {AdminIcon, type AdminIconName} from './GroupAdminIcons';
import {createThemedStyles} from '../theme/themedStyles';

const FONT = Platform.select({android: 'sans-serif', ios: 'System'});
const PURPLE = '#7442E8';
const RED = '#E53935';
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

/**
 * Sheets and dialogs render inside the owning screen's Modal instead of as
 * nested Modals. iOS cannot present a modal while another one is dismissing,
 * which is exactly what happens when a sheet row opens a confirmation.
 */
export function AdminSheet({visible, label, bottomInset = 0, onClose, children}: {visible: boolean; label: string; bottomInset?: number; onClose: () => void; children: React.ReactNode}) {
  if (!visible) return null;
  return <View style={styles.overlay}>
    <Pressable accessibilityLabel={`Dismiss ${label.toLowerCase()}`} onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]}/>
    <View accessibilityLabel={label} style={[styles.sheet, {paddingBottom: Math.max(bottomInset, 10) + 10}]}>
      <View style={styles.handle}/>
      <Pressable accessibilityLabel={`Close ${label.toLowerCase()}`} hitSlop={10} onPress={onClose} style={styles.close}><AdminIcon color="#1E293B" name="close" size={18}/></Pressable>
      {children}
    </View>
  </View>;
}

/**
 * `accessibilityLabel` is separate from the visible label because the design
 * quotes the member's name ("Restrict \"Aarav Sharma\""), and quote marks read
 * out as punctuation rather than as emphasis on a screen reader.
 */
export function AdminSheetRow({icon, label, accessibilityLabel, onPress}: {icon: AdminIconName; label: string; accessibilityLabel?: string; onPress: () => void}) {
  return <Pressable accessibilityLabel={accessibilityLabel || label} onPress={onPress} style={styles.row}><AdminIcon name={icon} size={20}/><Text numberOfLines={1} style={styles.rowText}>{label}</Text></Pressable>;
}

type GroupActionsProps = {visible: boolean; bottomInset?: number; onClose: () => void; onAddMembers?: () => void; onGroupSettings?: () => void; onGroupPermissions?: () => void; onCreateSimilarGroup?: () => void};

/** Callers leave out an action the viewer is not allowed to take. */
export function GroupActionsSheet({visible, bottomInset, onClose, onAddMembers, onGroupSettings, onGroupPermissions, onCreateSimilarGroup}: GroupActionsProps) {
  const rows: Array<[AdminIconName, string, (() => void) | undefined]> = [
    ['add-member', 'Add Members', onAddMembers],
    ['settings', 'Group Settings', onGroupSettings],
    ['permissions', 'Group Permissions', onGroupPermissions],
    ['similar-group', 'Create a Similar Group', onCreateSimilarGroup],
  ];
  return <AdminSheet bottomInset={bottomInset} label="Group actions" onClose={onClose} visible={visible}>
    {rows.map(([icon, label, action]) => action ? <AdminSheetRow icon={icon} key={label} label={label} onPress={() => {onClose(); action();}}/> : null)}
  </AdminSheet>;
}

const MEMBER_ACTIONS: Record<MemberAction, {icon: AdminIconName; label: (name: string) => string; spoken?: (name: string) => string}> = {
  'view-profile': {icon: 'view', label: () => 'View Profile'},
  'send-message': {icon: 'message', label: () => 'Send Message'},
  'make-admin': {icon: 'crown', label: () => 'Make Admin'},
  'remove-admin': {icon: 'crown', label: () => 'Remove Admin'},
  'make-moderator': {icon: 'shield', label: () => 'Make Moderator'},
  'remove-moderator': {icon: 'shield', label: () => 'Remove Moderator'},
  restrict: {icon: 'restrict', label: name => `Restrict “${name}”`, spoken: name => `Restrict ${name}`},
  unrestrict: {icon: 'restrict', label: name => `Remove Restriction for “${name}”`, spoken: name => `Remove Restriction for ${name}`},
  remove: {icon: 'remove-member', label: name => `Remove “${name}”`, spoken: name => `Remove ${name}`},
};

export function MemberActionsSheet({member, actions, bottomInset, onAction, onClose}: {member: GroupMember | null; actions: MemberAction[]; bottomInset?: number; onAction: (member: GroupMember, action: MemberAction) => void; onClose: () => void}) {
  return <AdminSheet bottomInset={bottomInset} label="Member options" onClose={onClose} visible={Boolean(member)}>
    {member ? actions.map(action => <AdminSheetRow accessibilityLabel={(MEMBER_ACTIONS[action].spoken || MEMBER_ACTIONS[action].label)(member.name)} icon={MEMBER_ACTIONS[action].icon} key={action} label={MEMBER_ACTIONS[action].label(member.name)} onPress={() => onAction(member, action)}/>) : null}
  </AdminSheet>;
}

export function RoleBadge({role}: {role: GroupMember['role']}) {
  if (role === 'member') return null;
  const moderator = role === 'moderator';
  const label = role === 'superadmin' ? '♛  Super Admin' : moderator ? '⬟  Moderator' : '♛  Admin';
  return <View style={[styles.badge, moderator && styles.moderatorBadge]}><Text style={[styles.badgeText, moderator && styles.moderatorBadgeText]}>{label}</Text></View>;
}

export function RestrictedBadge() {
  return <View style={[styles.badge, styles.restrictedBadge]}><Text style={[styles.badgeText, styles.restrictedBadgeText]}>Restricted</Text></View>;
}

export function MemberProfileSheet({member, presence, bottomInset, busy, onClose, onSendMessage}: {member: GroupMember | null; presence?: string; bottomInset?: number; busy?: boolean; onClose: () => void; onSendMessage?: () => void}) {
  return <AdminSheet bottomInset={bottomInset} label="Member profile" onClose={onClose} visible={Boolean(member)}>
    {member ? <View style={styles.profile}>
      {member.profilePic ? <Image source={{uri: member.profilePic}} style={styles.profileAvatar}/> : <View style={[styles.profileAvatar, styles.avatarFallback]}><Text style={styles.avatarText}>{initials(member.name)}</Text></View>}
      <Text style={styles.profileName}>{member.name}</Text>
      <View style={styles.profileBadges}><RoleBadge role={member.role}/>{member.isMuted ? <RestrictedBadge/> : null}</View>
      {member.phone ? <Text style={styles.profileMeta}>{member.phone}</Text> : null}
      {presence ? <Text style={styles.profileMeta}>{presence}</Text> : null}
      {onSendMessage ? <Pressable accessibilityLabel={`Send message to ${member.name}`} accessibilityState={{busy: Boolean(busy)}} disabled={busy} onPress={onSendMessage} style={styles.primary}>
        {busy ? <ActivityIndicator color="#FFF"/> : <><AdminIcon color="#FFF" name="message" size={18}/><Text style={styles.primaryText}>Send Message</Text></>}
      </Pressable> : null}
    </View> : null}
  </AdminSheet>;
}

type ConfirmProps = {visible: boolean; icon?: AdminIconName; title: string; body: string; badge?: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void};

export function AdminConfirmDialog({visible, icon = 'restrict', title, body, badge, confirmLabel, busy, onConfirm, onCancel}: ConfirmProps) {
  if (!visible) return null;
  return <View style={[styles.overlay, styles.centered]}>
    <Pressable accessibilityLabel="Dismiss dialog" disabled={busy} onPress={onCancel} style={[StyleSheet.absoluteFill, styles.backdrop]}/>
    <View accessibilityLabel={`${title} confirmation`} style={styles.dialog}>
      <View style={styles.dialogIcon}><AdminIcon color={RED} name={icon} size={24}/></View>
      <Text style={styles.dialogTitle}>{title}</Text>
      <Text style={styles.dialogBody}>{body}</Text>
      {badge ? <View style={styles.dialogBadge}><Text style={styles.dialogBadgeText}>{badge}</Text></View> : null}
      <Pressable accessibilityLabel={confirmLabel} accessibilityState={{busy: Boolean(busy)}} disabled={busy} onPress={onConfirm} style={styles.dialogConfirm}>{busy ? <ActivityIndicator color={RED}/> : <Text style={styles.dialogConfirmText}>{confirmLabel}</Text>}</Pressable>
      <Pressable accessibilityLabel="Cancel" disabled={busy} onPress={onCancel} style={styles.dialogCancel}><Text style={styles.dialogCancelText}>Cancel</Text></Pressable>
    </View>
  </View>;
}

const styles = createThemedStyles({
  overlay: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, justifyContent: 'flex-end'},
  backdrop: {backgroundColor: 'rgba(15,23,42,0.42)'},
  centered: {paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center'},
  sheet: {paddingTop: 10, paddingHorizontal: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#FFF'},
  handle: {width: 38, height: 4, marginBottom: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: '#E2E8F0'},
  close: {width: 32, height: 32, marginBottom: 2, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center'},
  row: {height: 52, flexDirection: 'row', alignItems: 'center', gap: 14},
  rowText: {flex: 1, color: '#111827', fontFamily: FONT, fontSize: 14, fontWeight: '500'},
  badge: {paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, backgroundColor: '#EEF1FF'},
  badgeText: {color: '#4149B9', fontSize: 9, fontWeight: '600'},
  moderatorBadge: {backgroundColor: '#E9F6F0'},
  moderatorBadgeText: {color: '#28775A'},
  restrictedBadge: {backgroundColor: '#FEF2F2'},
  restrictedBadgeText: {color: '#DC2626'},
  profile: {paddingBottom: 6, alignItems: 'center'},
  profileAvatar: {width: 76, height: 76, borderRadius: 12},
  avatarFallback: {backgroundColor: '#EEE8FA', alignItems: 'center', justifyContent: 'center'},
  avatarText: {color: PURPLE, fontSize: 20, fontWeight: '700'},
  profileName: {marginTop: 12, color: '#111827', fontFamily: FONT, fontSize: 17, fontWeight: '700', textAlign: 'center'},
  profileBadges: {minHeight: 8, marginTop: 8, flexDirection: 'row', gap: 6},
  profileMeta: {marginTop: 6, color: '#667387', fontFamily: FONT, fontSize: 13},
  primary: {width: '100%', height: 48, marginTop: 18, borderRadius: 8, backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8},
  primaryText: {color: '#FFF', fontFamily: FONT, fontSize: 14, fontWeight: '700'},
  dialog: {width: '100%', maxWidth: 360, paddingHorizontal: 27, paddingTop: 22, paddingBottom: 10, borderRadius: 14, backgroundColor: '#FFF', alignItems: 'center'},
  dialogIcon: {width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFF0F0', alignItems: 'center', justifyContent: 'center'},
  dialogTitle: {marginTop: 13, color: '#111827', fontFamily: FONT, fontSize: 16, lineHeight: 21, fontWeight: '700', textAlign: 'center'},
  dialogBody: {marginTop: 10, color: '#737E90', fontFamily: FONT, fontSize: 12, lineHeight: 17, textAlign: 'center'},
  dialogBadge: {marginTop: 14, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: '#F2EBFF'},
  dialogBadgeText: {color: '#6C36DE', fontFamily: FONT, fontSize: 11, fontWeight: '600'},
  dialogConfirm: {width: '100%', height: 48, marginTop: 14, alignItems: 'center', justifyContent: 'center'},
  dialogConfirmText: {color: RED, fontFamily: FONT, fontSize: 14, fontWeight: '600'},
  dialogCancel: {width: '100%', height: 45, alignItems: 'center', justifyContent: 'center'},
  dialogCancelText: {color: '#111827', fontFamily: FONT, fontSize: 14, fontWeight: '500'},
});
