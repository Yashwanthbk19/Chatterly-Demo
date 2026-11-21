import React from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useMemo, useState} from 'react';
import {COUNTRIES} from '../constants/countries';
import type {Country} from '../types/registration';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {
  value: Country;
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (country: Country) => void;
};

export function CountryPicker({value, visible, onOpen, onClose, onSelect}: Props) {
  const [query, setQuery] = useState('');
  const closePicker = () => {setQuery(''); onClose();};
  const countries = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return COUNTRIES.filter(country => !term || `${country.name} ${country.dialCode}`.toLocaleLowerCase().includes(term))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [query]);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Select country code"
        onPress={onOpen} style={styles.trigger}>
        <Text style={styles.triggerText}>{value.flag} {value.dialCode}</Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={visible} onRequestClose={closePicker}>
        <Pressable style={styles.backdrop} onPress={closePicker}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.title}>Select country</Text>
            <TextInput accessibilityLabel="Search countries" autoCorrect={false} onChangeText={setQuery} placeholder="Search country or code" style={styles.search} value={query}/>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
            {countries.map(country => (
              <Pressable key={country.code} accessibilityRole="button"
                onPress={() => {setQuery(''); onSelect(country);}} style={styles.option}>
                <Text style={styles.flag}>{country.flag}</Text>
                <Text style={styles.country}>{country.name}</Text>
                <Text style={styles.code}>{country.dialCode}</Text>
                {value.code === country.code && <Text style={styles.check}>✓</Text>}
              </Pressable>
            ))}
            {countries.length === 0 ? <Text style={styles.empty}>No countries found</Text> : null}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = createThemedStyles({
  trigger: {height: 56, minWidth: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 12, backgroundColor: '#FFF'},
  triggerText: {fontSize: 15, color: '#101828'},
  chevron: {fontSize: 17, color: '#667085', marginTop: -4},
  backdrop: {flex: 1, backgroundColor: 'rgba(16,24,40,0.45)', justifyContent: 'flex-end'},
  sheet: {backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34},
  title: {fontSize: 19, fontWeight: '700', color: '#101828', marginBottom: 12},
  search: {height: 44, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 10, paddingHorizontal: 12, marginBottom: 8, color: '#101828'},
  list: {maxHeight: '74%'},
  empty: {paddingVertical: 18, color: '#667085', textAlign: 'center'},
  option: {height: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0'},
  flag: {fontSize: 21, marginRight: 12},
  country: {flex: 1, fontSize: 16, color: '#344054'},
  code: {fontSize: 15, color: '#667085'},
  check: {marginLeft: 12, color: '#6C5CE7', fontSize: 18, fontWeight: '700'},
});
