import React, {useMemo, useState} from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {createThemedStyles} from '../theme/themedStyles';

type DateParts = {day: number; month: number; year: number};
type Props = {
  value: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});
const ITEM_HEIGHT = 42;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseValue(value: string): DateParts | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) { return null; }
  const parts = {day: Number(match[1]), month: Number(match[2]), year: Number(match[3])};
  const today = new Date();
  const selected = new Date(parts.year, parts.month - 1, parts.day);
  if (
    parts.year < 1900 || selected > today ||
    selected.getFullYear() !== parts.year ||
    selected.getMonth() !== parts.month - 1 ||
    selected.getDate() !== parts.day
  ) { return null; }
  return parts;
}

function defaultValue(): DateParts {
  const today = new Date();
  const year = today.getFullYear() - 18;
  const month = today.getMonth() + 1;
  return {day: Math.min(today.getDate(), daysInMonth(year, month)), month, year};
}

export function DateOfBirthPicker({value, onCancel, onConfirm}: Props): React.JSX.Element {
  const today = useMemo(() => new Date(), []);
  const [selected, setSelected] = useState<DateParts>(() => parseValue(value) || defaultValue());
  const years = useMemo(
    () => Array.from({length: today.getFullYear() - 1899}, (_, index) => today.getFullYear() - index),
    [today],
  );
  const months = useMemo(
    () => Array.from({length: selected.year === today.getFullYear() ? today.getMonth() + 1 : 12}, (_, index) => index + 1),
    [selected.year, today],
  );
  const maximumDay = Math.min(
    daysInMonth(selected.year, selected.month),
    selected.year === today.getFullYear() && selected.month === today.getMonth() + 1
      ? today.getDate()
      : 31,
  );
  const days = useMemo(() => Array.from({length: maximumDay}, (_, index) => index + 1), [maximumDay]);

  const chooseYear = (year: number) => {
    const maximumMonth = year === today.getFullYear() ? today.getMonth() + 1 : 12;
    setSelected(current => {
      const month = Math.min(current.month, maximumMonth);
      const maximumDate = Math.min(
        daysInMonth(year, month),
        year === today.getFullYear() && month === today.getMonth() + 1 ? today.getDate() : 31,
      );
      return {year, month, day: Math.min(current.day, maximumDate)};
    });
  };

  const chooseMonth = (month: number) => {
    setSelected(current => {
      const maximumDate = Math.min(
        daysInMonth(current.year, month),
        current.year === today.getFullYear() && month === today.getMonth() + 1 ? today.getDate() : 31,
      );
      return {...current, month, day: Math.min(current.day, maximumDate)};
    });
  };

  const confirm = () => onConfirm(`${pad(selected.day)}/${pad(selected.month)}/${selected.year}`);
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <View accessibilityViewIsModal style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close date of birth picker" onPress={onCancel} style={styles.backdrop} />
        <View style={styles.card}>
          <Text style={styles.title}>Select date of birth</Text>
          <Text style={styles.subtitle}>Choose the day, month and year</Text>

          <View style={styles.columnLabels}>
            <Text style={styles.columnLabel}>Day</Text>
            <Text style={styles.columnLabel}>Month</Text>
            <Text style={styles.columnLabel}>Year</Text>
          </View>
          <View style={styles.columns}>
            <ScrollView
              contentOffset={{x: 0, y: Math.max(0, selected.day - 1) * ITEM_HEIGHT}}
              showsVerticalScrollIndicator={false}
              style={styles.column}>
              {days.map(item => (
                <Pressable accessibilityLabel={`Choose day ${item}`} onPress={() => setSelected(current => ({...current, day: item}))}
                  key={item} style={[styles.option, selected.day === item && styles.optionSelected]}>
                  <Text style={[styles.optionText, selected.day === item && styles.optionTextSelected]}>{pad(item)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView
              contentOffset={{x: 0, y: Math.max(0, selected.month - 1) * ITEM_HEIGHT}}
              showsVerticalScrollIndicator={false}
              style={styles.column}>
              {months.map(item => (
                <Pressable accessibilityLabel={`Choose month ${MONTHS[item - 1]}`} onPress={() => chooseMonth(item)}
                  key={item} style={[styles.option, selected.month === item && styles.optionSelected]}>
                  <Text numberOfLines={1} style={[styles.optionText, selected.month === item && styles.optionTextSelected]}>{MONTHS[item - 1].slice(0, 3)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView
              contentOffset={{x: 0, y: Math.max(0, today.getFullYear() - selected.year) * ITEM_HEIGHT}}
              showsVerticalScrollIndicator={false}
              style={styles.column}>
              {years.map(item => (
                <Pressable accessibilityLabel={`Choose year ${item}`} onPress={() => chooseYear(item)}
                  key={item} style={[styles.option, selected.year === item && styles.optionSelected]}>
                  <Text style={[styles.optionText, selected.year === item && styles.optionTextSelected]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.actions}>
            <Pressable accessibilityLabel="Cancel date selection" onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityLabel="Select date" onPress={confirm} style={styles.confirmButton}>
              <Text style={styles.confirmLabel}>Select Date</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = createThemedStyles({
  modalRoot: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  backdrop: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(16, 23, 34, 0.42)'},
  card: {width: '88%', maxWidth: 380, padding: 18, borderRadius: 14, backgroundColor: '#FFFFFF'},
  title: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center'},
  subtitle: {marginTop: 4, fontFamily: FONT_FAMILY, color: '#596579', fontSize: 11, lineHeight: 16, textAlign: 'center'},
  columnLabels: {marginTop: 18, flexDirection: 'row', gap: 8},
  columnLabel: {flex: 1, fontFamily: FONT_FAMILY, color: '#596579', fontSize: 10, fontWeight: '600', textAlign: 'center'},
  columns: {height: 210, marginTop: 7, flexDirection: 'row', gap: 8},
  column: {flex: 1, borderWidth: 1, borderColor: '#E4E8EF', borderRadius: 7, backgroundColor: '#F8FAFC'},
  option: {height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 5},
  optionSelected: {backgroundColor: '#EEE7FF'},
  optionText: {fontFamily: FONT_FAMILY, color: '#536074', fontSize: 12},
  optionTextSelected: {color: '#7137DD', fontWeight: '700'},
  actions: {marginTop: 18, flexDirection: 'row', gap: 10},
  cancelButton: {flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DCE2EA', borderRadius: 5, backgroundColor: '#FFFFFF'},
  cancelLabel: {fontFamily: FONT_FAMILY, color: '#536074', fontSize: 11, fontWeight: '600'},
  confirmButton: {flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: '#8537F5'},
  confirmLabel: {fontFamily: FONT_FAMILY, color: '#FFFFFF', fontSize: 11, fontWeight: '600'},
});
