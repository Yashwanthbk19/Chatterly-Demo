import React from 'react';
import {Image, Modal, Pressable, StatusBar, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {GroupProfileIcon} from './GroupProfileIcon';

export function ProfilePictureViewer({uri, name, visible, onClose}: {
  uri?: string | null;
  name: string;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!visible || !uri) return null;
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={[styles.screen, {paddingTop: insets.top, paddingBottom: insets.bottom}]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Close profile picture" accessibilityRole="button" hitSlop={12} onPress={onClose} style={styles.close}>
            <GroupProfileIcon name="back" size={24} color="#FFFFFF" />
          </Pressable>
          <Text numberOfLines={1} style={styles.name}>{name}</Text>
        </View>
        <Image accessibilityLabel={`${name} full profile picture`} source={{uri}} resizeMode="contain" style={styles.image} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#000000'},
  header: {height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12},
  close: {padding: 8},
  name: {flex: 1, marginLeft: 12, color: '#FFFFFF', fontSize: 18, fontWeight: '600'},
  image: {flex: 1, width: '100%'},
});
