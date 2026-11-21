import * as Contacts from 'expo-contacts';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, Image, Platform, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {ReportFlowSheet} from '../components/ReportFlowSheet';
import {SearchContactsGridIcon, SearchIcon} from '../components/ContactsIcons';
import {enrichChatList, getChatList, normalizeChatList} from '../services/chatApi';
import {syncContacts} from '../services/contactsApi';
import {subscribeToOnlineUsers} from '../services/chatRealtime';
import {createThemedStyles, themeInk} from '../theme/themedStyles';

type ReportContact = {id: string; name: string; status: string; thumbnail?: string | null};
type Props = {onBack: () => void; onSubmitted: (message: string) => void};

const CONTACT_FIELDS = [Contacts.ContactField.FULL_NAME, Contacts.ContactField.GIVEN_NAME, Contacts.ContactField.FAMILY_NAME, Contacts.ContactField.PHONES, Contacts.ContactField.THUMBNAIL] as const;
const PURPLE = '#6F28F5';

function BackIcon() {
  return <Svg width={21} height={21} viewBox="0 0 24 24" fill="none"><Path d="m15 5-7 7 7 7" stroke={themeInk('#0B1220')} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
}

function phoneKey(value: string): string {
  return value.replace(/\D/g, '').slice(-10);
}

export function ReportContactScreen({onBack, onSubmitted}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<ReportContact[]>([]);
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [selected, setSelected] = useState<ReportContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => subscribeToOnlineUsers(setOnlineIds), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const byId = new Map<string, ReportContact>();
      const records = await getChatList();
      const chatContacts = await enrichChatList(normalizeChatList(records.filter(record => record.type !== 'group')));
      chatContacts.forEach(chat => byId.set(chat.contact.userId, {
        id: chat.contact.userId,
        name: chat.contact.name,
        status: chat.contact.status || 'Live, laugh, love',
        thumbnail: chat.contact.thumbnail,
      }));

      const permission = await Contacts.getPermissionsAsync();
      let allowed = permission.granted;
      if (!allowed && permission.canAskAgain !== false) allowed = (await Contacts.requestPermissionsAsync()).granted;
      if (allowed) {
        try {
          const deviceContacts = await Contacts.Contact.getAllDetails(CONTACT_FIELDS, {sortOrder: Contacts.ContactsSortOrder?.GivenName}) as Array<{fullName?: string | null; givenName?: string | null; familyName?: string | null; phones?: Array<{number?: string | null}>; thumbnail?: string | null}>;
          const phoneNumbers = deviceContacts.flatMap(contact => contact.phones?.map(phone => phone.number || '') || []).filter(Boolean);
          if (phoneNumbers.length) {
            const synced = await syncContacts(phoneNumbers);
            const deviceByPhone = new Map<string, typeof deviceContacts[number]>();
            deviceContacts.forEach(contact => contact.phones?.forEach(phone => {const key = phoneKey(phone.number || ''); if (key) deviceByPhone.set(key, contact);}));
            synced.registered?.forEach(user => {
              const id = String(user._id || user.id || '');
              if (!id) return;
              const local = deviceByPhone.get(phoneKey(user.phone || user.phoneNumber || ''));
              const localName = local?.fullName || `${local?.givenName || ''} ${local?.familyName || ''}`.trim();
              byId.set(id, {
                id,
                name: user.name || user.fullName || localName || 'Chatterly contact',
                status: user.status || 'Live, laugh, love',
                thumbnail: user.profilePic || local?.thumbnail || null,
              });
            });
          }
        } catch {
          // Recent conversations are still valid report targets when contact sync is unavailable.
        }
      }
      setContacts([...byId.values()].sort((first, second) => first.name.localeCompare(second.name)));
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Unable to load contacts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {load();}, [load]);

  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return contacts.filter(contact => (!onlineOnly || onlineIds.has(contact.id)) && (!needle || `${contact.name} ${contact.status}`.toLowerCase().includes(needle)));
  }, [contacts, onlineIds, onlineOnly, query]);

  return <View style={styles.root}>
    <View style={[styles.header, {paddingTop: insets.top + 6}]}>
      <Pressable accessibilityLabel="Back to Privacy" hitSlop={12} onPress={onBack} style={styles.back}><BackIcon/></Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle}>Report Contact</Text>
      <View style={styles.headerSpacer}/>
    </View>
    <View style={styles.search}>
      <SearchIcon/>
      <TextInput accessibilityLabel="Search Contacts" autoCapitalize="none" onChangeText={setQuery} placeholder="Search Contacts" placeholderTextColor="#8791A2" returnKeyType="search" style={styles.searchInput} value={query}/>
      <Pressable accessibilityLabel={onlineOnly ? 'Show all contacts' : 'Filter online contacts'} accessibilityState={{selected: onlineOnly}} hitSlop={10} onPress={() => setOnlineOnly(value => !value)} style={onlineOnly ? styles.filterActive : undefined}><SearchContactsGridIcon/></Pressable>
    </View>
    <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{onlineOnly ? 'Online Contacts' : 'All Contacts'}</Text><View style={styles.countPill}><Text style={styles.countText}>{onlineOnly ? visibleContacts.length : contacts.length}</Text></View></View>
    {loading ? <View style={styles.center}><ActivityIndicator color={PURPLE}/></View> : error ? <View style={styles.center}><Text style={styles.errorTitle}>Unable to load contacts</Text><Text style={styles.errorText}>{error}</Text><Pressable accessibilityLabel="Retry contacts" onPress={load} style={styles.retry}><Text style={styles.retryText}>Try Again</Text></Pressable></View> : <FlatList
      contentContainerStyle={styles.list}
      data={visibleContacts}
      keyExtractor={item => item.id}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<View style={styles.center}><Text style={styles.emptyTitle}>{query || onlineOnly ? 'No matching contacts' : 'No contacts available'}</Text><Text style={styles.emptyText}>{query || onlineOnly ? 'Try another search or filter.' : 'Registered contacts will appear here.'}</Text></View>}
      renderItem={({item}) => <Pressable accessibilityLabel={`Report ${item.name}`} onPress={() => setSelected(item)} style={({pressed}) => [styles.contactRow, pressed && styles.contactPressed]}>
        <View style={styles.avatarWrap}>{item.thumbnail ? <Image source={{uri: item.thumbnail}} style={styles.avatar}/> : <View style={styles.avatarFallback}><Text style={styles.initials}>{initials(item.name)}</Text></View>}{onlineIds.has(item.id) ? <View accessibilityLabel="Online" style={styles.onlineDot}/> : null}</View>
        <View style={styles.contactCopy}><Text numberOfLines={1} style={styles.contactName}>{item.name}</Text><Text numberOfLines={1} style={styles.contactStatus}>{item.status}</Text></View>
      </Pressable>}
      showsVerticalScrollIndicator={false}
    />}
    <ReportFlowSheet reportedUserId={selected?.id || ''} visible={Boolean(selected)} onClose={() => setSelected(null)} onSuccess={message => {setSelected(null); onSubmitted(message);}}/>
  </View>;
}

const FONT = Platform.select({android: 'sans-serif', ios: 'System'});
const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#FFF'},
  header: {minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0'},
  back: {width: 36, height: 42, justifyContent: 'center'},
  headerTitle: {flex: 1, fontFamily: FONT, color: '#121826', fontSize: 14, fontWeight: '700'},
  headerSpacer: {width: 36},
  search: {height: 40, marginHorizontal: 16, marginTop: 13, borderRadius: 7, borderWidth: 1, borderColor: '#F0F1F3', backgroundColor: '#F8F9FB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, gap: 8},
  searchInput: {flex: 1, height: 40, padding: 0, fontFamily: FONT, fontSize: 10, color: '#101828'},
  filterActive: {width: 26, height: 26, borderRadius: 6, backgroundColor: '#EEE7FF', alignItems: 'center', justifyContent: 'center'},
  sectionRow: {height: 45, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center'},
  sectionTitle: {fontFamily: FONT, color: '#536176', fontSize: 10},
  countPill: {minWidth: 22, height: 16, marginLeft: 7, paddingHorizontal: 5, borderRadius: 8, backgroundColor: '#F0E9FF', alignItems: 'center', justifyContent: 'center'},
  countText: {fontFamily: FONT, color: PURPLE, fontSize: 8, fontWeight: '600'},
  list: {paddingHorizontal: 16, paddingBottom: 30, flexGrow: 1},
  contactRow: {minHeight: 66, paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center', borderRadius: 7},
  contactPressed: {backgroundColor: '#F9F7FF'},
  avatarWrap: {width: 43, height: 43, marginRight: 11},
  avatar: {width: 43, height: 43, borderRadius: 7},
  avatarFallback: {width: 43, height: 43, borderRadius: 7, backgroundColor: '#F3F5F8', alignItems: 'center', justifyContent: 'center'},
  initials: {fontFamily: FONT, color: '#76849A', fontSize: 13, fontWeight: '500'},
  onlineDot: {position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FFF', backgroundColor: '#22C77A'},
  contactCopy: {flex: 1, minWidth: 0},
  contactName: {fontFamily: FONT, color: '#111827', fontSize: 12, fontWeight: '600'},
  contactStatus: {marginTop: 3, fontFamily: FONT, color: '#667085', fontSize: 9},
  center: {flex: 1, minHeight: 220, paddingHorizontal: 36, alignItems: 'center', justifyContent: 'center'},
  errorTitle: {fontFamily: FONT, color: '#101828', fontSize: 13, fontWeight: '600'},
  errorText: {marginTop: 6, fontFamily: FONT, color: '#667085', fontSize: 10, lineHeight: 15, textAlign: 'center'},
  retry: {height: 34, marginTop: 14, paddingHorizontal: 17, borderRadius: 6, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center'},
  retryText: {fontFamily: FONT, color: '#FFF', fontSize: 10, fontWeight: '600'},
  emptyTitle: {fontFamily: FONT, color: '#101828', fontSize: 13, fontWeight: '600'},
  emptyText: {marginTop: 5, fontFamily: FONT, color: '#667085', fontSize: 10, textAlign: 'center'},
});
