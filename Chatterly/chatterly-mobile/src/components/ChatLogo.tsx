import React from 'react';
import {Image, StyleSheet} from 'react-native';

export function ChatLogo({compact = false}: {compact?: boolean}) {
  return (
    <Image
      accessibilityLabel="Chatterly"
      resizeMode="contain"
      source={require('../assets/chatterly-logo.png')}
      style={compact ? styles.compactLogo : styles.logo}
    />
  );
}

const styles = StyleSheet.create({
  logo: {width: 163, height: 56},
  compactLogo: {width: 124, height: 37},
});
