import React from 'react';
import {Platform, Pressable, Text, View} from 'react-native';
import type {RegistrationMethod} from '../types/registration';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {value: RegistrationMethod; onChange: (value: RegistrationMethod) => void};
const OPTIONS: {label: string; value: RegistrationMethod}[] = [
  {label: 'Phone', value: 'phone'},
  {label: 'Email', value: 'email'},
];

export function RegistrationMethodControl({value, onChange}: Props) {
  if (Platform.OS === 'ios') {
    return (
      <View style={styles.segmented} accessibilityRole="radiogroup">
        {OPTIONS.map(option => {
          const selected = value === option.value;
          return (
            <Pressable key={option.value} accessibilityRole="radio"
              accessibilityState={{checked: selected}} onPress={() => onChange(option.value)}
              style={[styles.segment, selected && styles.segmentSelected]}>
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.radioGroup} accessibilityRole="radiogroup">
      {OPTIONS.map(option => {
        const selected = value === option.value;
        return (
          <Pressable key={option.value} accessibilityRole="radio"
            accessibilityState={{checked: selected}} hitSlop={8}
            onPress={() => onChange(option.value)} style={styles.radioOption}>
            <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
              {selected && <View style={styles.radioInner} />}
            </View>
            <Text style={styles.radioLabel}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = createThemedStyles({
  segmented: {flexDirection: 'row', padding: 2, borderRadius: 9, backgroundColor: '#E7EAF0'},
  segment: {flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 7},
  segmentSelected: {backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 2, shadowOffset: {width: 0, height: 1}},
  segmentText: {fontSize: 14, fontWeight: '600', color: '#667085'},
  segmentTextSelected: {color: '#101828'},
  radioGroup: {flexDirection: 'row', gap: 28, minHeight: 42, alignItems: 'center'},
  radioOption: {flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 40},
  radioOuter: {width: 20, height: 20, borderWidth: 2, borderColor: '#98A2B3', borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  radioOuterSelected: {borderColor: '#6C5CE7'},
  radioInner: {width: 10, height: 10, borderRadius: 5, backgroundColor: '#6C5CE7'},
  radioLabel: {fontSize: 15, color: '#344054'},
});
