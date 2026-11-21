import * as Contacts from 'expo-contacts';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, Modal, Platform, Pressable, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {addCallParticipantOverSocket} from '../services/chatRealtime';
import {syncContacts, type SyncedContactUser} from '../services/contactsApi';
import {createThemedStyles} from '../theme/themedStyles';
import {phoneDigits} from '../utils/phoneNumber';

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

type Person = {userId: string; name: string; phone: string};

type DeviceRecord = {
  id?: string;
  fullName?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  phones?: Array<{number?: string}>;
};

type Props = {
  visible: boolean;
  callId: string;
  /** People who are already in the call (the user and whoever rang them). */
  excludeUserIds: string[];
  onClose: () => void;
  onAdded: (count: number) => void;
};

/** Same number whatever its formatting: contact sync compares the last ten digits. */
const numberKey = (value: unknown) => phoneDigits(value).slice(-10);

/**
 * The people who can be invited into a call: the address-book contacts that are
 * registered on Chatterly, minus anyone already on the call. Unregistered
 * contacts are left out because only an account can be rung.
 */
async function loadPeople(excluded: ReadonlySet<string>): Promise<Person[]> {
  const current = await Contacts.getPermissionsAsync();
  const permission = current.granted ? current : await Contacts.requestPermissionsAsync();
  if (!permission.granted) { throw new Error('Contact access is required to add people to a call.'); }
  const records = (await Contacts.Contact.getAllDetails([
    Contacts.ContactField.FULL_NAME,
    Contacts.ContactField.GIVEN_NAME,
    Contacts.ContactField.FAMILY_NAME,
    Contacts.ContactField.PHONES,
  ])) as DeviceRecord[];
  const numbers = Array.from(new Set(records.flatMap(record =>
    (record.phones || []).map(entry => String(entry.number || '').trim()).filter(Boolean))));
  if (!numbers.length) { return []; }
  const synced = await syncContacts(numbers);
  const registered = new Map<string, SyncedContactUser>();
  (synced.registered || []).forEach(user => {
    const key = numberKey(user.phone || user.phoneNumber);
    if (key) { registered.set(key, user); }
  });
  const people = new Map<string, Person>();
  records.forEach(record => {
    for (const entry of record.phones || []) {
      const user = registered.get(numberKey(entry.number));
      const userId = String(user?._id || user?.id || '').trim();
      if (!user || !userId || excluded.has(userId) || people.has(userId)) { continue; }
      const name = String(
        record.fullName || record.name || [record.givenName, record.familyName].filter(Boolean).join(' ') || user.name || user.fullName || 'Unnamed contact',
      ).trim();
      people.set(userId, {userId, name, phone: String(user.phone || user.phoneNumber || entry.number || '')});
    }
  });
  return [...people.values()].sort((first, second) => first.name.localeCompare(second.name));
}

/**
 * "Add" on a one-to-one call: pick registered contacts and invite them into the
 * call that is in progress. Used by the receiver's call screen, whose Add button
 * had nothing behind it.
 */
export function CallAddPeopleSheet({callId, excludeUserIds, onAdded, onClose, visible}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState('');
  const excludedKey = excludeUserIds.join('|');

  useEffect(() => {
    if (!visible) { return; }
    let active = true;
    setSearch('');
    setSelected(new Set());
    setError('');
    setLoading(true);
    loadPeople(new Set(excludedKey.split('|').filter(Boolean)))
      .then(rows => { if (active) { setPeople(rows); } })
      .catch(failure => {
        if (!active) { return; }
        setPeople([]);
        setError(failure instanceof Error ? failure.message : 'Unable to load your contacts.');
      })
      .finally(() => { if (active) { setLoading(false); } });
    return () => { active = false; };
  }, [excludedKey, visible]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const digits = phoneDigits(needle);
    return people.filter(person => !needle ||
      person.name.toLowerCase().includes(needle) ||
      Boolean(digits && phoneDigits(person.phone).includes(digits)));
  }, [people, search]);

  const toggle = useCallback((userId: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(userId)) { next.delete(userId); } else { next.add(userId); }
      return next;
    });
  }, []);

  const addSelected = useCallback(async () => {
    if (!callId || selected.size === 0 || adding) { return; }
    setAdding(true);
    setError('');
    try {
      const acknowledgements = await Promise.all(Array.from(selected).map(userId => addCallParticipantOverSocket(callId, userId)));
      const failed = acknowledgements.find(acknowledgement => !acknowledgement.success);
      if (failed) { throw new Error(failed.message || 'Unable to add people to the call.'); }
      onAdded(selected.size);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to add people to the call.');
    } finally {
      setAdding(false);
    }
  }, [adding, callId, onAdded, onClose, selected]);

  return <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel="Close add people" onPress={onClose} style={styles.scrim} />
      <View accessibilityLabel="Add people to call" style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, 14)}]}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>Add people</Text>
          <Pressable accessibilityLabel="Close" accessibilityRole="button" hitSlop={10} onPress={onClose}><Text style={styles.close}>✕</Text></Pressable>
        </View>
        <TextInput
          accessibilityLabel="Search people"
          autoCorrect={false}
          onChangeText={setSearch}
          placeholder="Search contacts"
          placeholderTextColor="#8792A4"
          style={styles.search}
          value={search}
        />
        {loading
          ? <ActivityIndicator color="#8B27E9" style={styles.loading} />
          : <FlatList
            data={shown}
            keyboardShouldPersistTaps="handled"
            keyExtractor={person => person.userId}
            ListEmptyComponent={<Text style={styles.empty}>{people.length ? 'No contacts match your search.' : 'None of your contacts are on Chatterly yet.'}</Text>}
            renderItem={({item}) => {
              const on = selected.has(item.userId);
              return <Pressable
                accessibilityLabel={`${on ? 'Deselect' : 'Select'} ${item.name}`}
                accessibilityRole="checkbox"
                accessibilityState={{checked: on}}
                onPress={() => toggle(item.userId)}
                style={styles.row}
              >
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.name.trim().charAt(0).toUpperCase() || '?'}</Text></View>
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
                  {item.phone ? <Text numberOfLines={1} style={styles.phone}>{item.phone}</Text> : null}
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              </Pressable>;
            }}
            style={styles.list}
          />}
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityLabel="Add to Call"
          accessibilityRole="button"
          accessibilityState={{disabled: selected.size === 0 || adding, busy: adding}}
          disabled={selected.size === 0 || adding}
          onPress={addSelected}
          style={[styles.add, (selected.size === 0 || adding) && styles.addDisabled]}
        >
          {adding ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.addText}>Add to Call</Text>}
        </Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = createThemedStyles({
  backdrop: {flex: 1, justifyContent: 'flex-end'},
  scrim: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,18,32,.5)'},
  sheet: {maxHeight: '78%', minHeight: 320, paddingHorizontal: 16, paddingTop: 14, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#FFFFFF'},
  header: {height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {color: '#0B1220', fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: '700'},
  close: {color: '#344256', fontSize: 16},
  search: {height: 42, marginTop: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E1E6ED', borderRadius: 8, color: '#152033', fontFamily: FONT_FAMILY, fontSize: 13},
  loading: {marginVertical: 36},
  list: {marginTop: 6},
  empty: {marginTop: 28, marginBottom: 20, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 12, textAlign: 'center'},
  row: {minHeight: 58, flexDirection: 'row', alignItems: 'center'},
  avatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: '#EDE5FC', alignItems: 'center', justifyContent: 'center'},
  avatarText: {color: '#7137DD', fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '700'},
  copy: {flex: 1, minWidth: 0, marginLeft: 11},
  name: {color: '#152033', fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '600'},
  phone: {marginTop: 2, color: '#758196', fontFamily: FONT_FAMILY, fontSize: 11},
  radio: {width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#B8C2D1', alignItems: 'center', justifyContent: 'center'},
  radioOn: {borderColor: '#8B27E9'},
  radioDot: {width: 10, height: 10, borderRadius: 5, backgroundColor: '#8B27E9'},
  error: {marginTop: 8, color: '#C0392B', fontFamily: FONT_FAMILY, fontSize: 11, lineHeight: 16},
  add: {height: 46, marginTop: 12, borderRadius: 10, backgroundColor: '#8B27E9', alignItems: 'center', justifyContent: 'center'},
  addDisabled: {backgroundColor: '#DFE5EE'},
  addText: {color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: '700'},
});
