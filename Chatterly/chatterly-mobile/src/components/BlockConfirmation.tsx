import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Path } from 'react-native-svg';
import {createThemedStyles} from '../theme/themedStyles';

export function BlockIcon({
  color = '#64748B',
  size = 28,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Circle cx="16" cy="16" r="13" stroke={color} strokeWidth="1.6" />
      <Path d="M6.8 25.2 25.2 6.8" stroke={color} strokeWidth="1.6" />
    </Svg>
  );
}
export function BlockConfirmation({
  visible,
  name,
  unblock = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  name?: string;
  unblock?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const color = unblock ? '#6D28D9' : '#EF2027';
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <View style={s.overlay}>
        <BlurView intensity={22} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={s.card}>
          <View
            style={[
              s.icon,
              { backgroundColor: unblock ? '#F1EBFF' : '#FFF2F3' },
            ]}
          >
            <BlockIcon color="#EF2027" size={28} />
          </View>
          <Text accessibilityRole="header" style={s.title}>
            {unblock ? 'Unblock' : 'Block'} {name || 'Selected Contacts'}?
          </Text>
          <Text style={s.body}>
            {unblock
              ? `Once unblocked, ${name || 'these contacts'} can message and call you again. They won't know you've unblocked them.`
              : "They won't be able to message or call you and won't be notified that you blocked them."}
          </Text>
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unblock ? 'Unblock' : 'Block'}
            disabled={busy}
            onPress={onConfirm}
            style={s.action}
          >
            {busy ? (
              <ActivityIndicator color={color} />
            ) : (
              <Text style={[s.actionText, { color }]}>
                {unblock ? 'Unblock' : 'Block'}
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onCancel}
            style={s.cancel}
          >
            <Text style={s.actionText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
const s = createThemedStyles({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.38)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFF',
    borderRadius: 17,
    paddingHorizontal: 17,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    marginTop: 26,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: '#526179',
    textAlign: 'center',
    marginTop: 14,
  },
  action: {
    alignSelf: 'stretch',
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  cancel: {
    alignSelf: 'stretch',
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: { fontSize: 17, color: '#0B1220' },
  error: { color: '#DC2626', textAlign: 'center', marginTop: 12 },
});
