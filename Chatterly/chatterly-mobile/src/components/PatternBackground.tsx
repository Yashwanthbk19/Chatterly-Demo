import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {isDarkTheme} from '../theme/themedStyles';

const MARKS = ['○', '·', '◇', '⌁', '◌', '□'];

export function PatternBackground() {
  // The watermark is a pale tint on a light thread. On a dark thread the same
  // pale would be a field of bright specks, so it inverts into a tone just above
  // the surface behind it - and it is written out rather than derived, because a
  // light ink is exactly what the theme's ink rule leaves alone.
  const dark = isDarkTheme();

  return (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={styles.background}>
      {Array.from({length: 120}, (_, index) => (
        <View key={index} style={styles.cell}>
          <Text style={[styles.mark, dark && styles.markDark, index % 5 === 0 && styles.rotated]}>{MARKS[index % MARKS.length]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  background: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden', opacity: 0.72},
  cell: {width: 44, height: 42, alignItems: 'center', justifyContent: 'center'},
  mark: {fontSize: 18, color: '#F0EDF8', fontWeight: '300'},
  markDark: {color: '#233046'},
  rotated: {transform: [{rotate: '25deg'}]},
});
