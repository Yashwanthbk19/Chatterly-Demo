import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { BlockConfirmation, BlockIcon } from '../components/BlockConfirmation';
import { BackIcon } from '../components/ChatIcons';
import { SearchIcon } from '../components/ContactsIcons';
import { getChatList, getChatProfile, normalizeChatList } from '../services/chatApi';
import { syncContacts } from '../services/contactsApi';
import { getSession } from '../services/sessionStore';
import { type BlockedUser } from '../services/privacyApi';
import {
  changeContactBlock,
  refreshBlockedContacts,
  useBlockedContacts,
} from '../services/blockStore';
import {createThemedStyles} from '../theme/themedStyles';

type Contact = BlockedUser & { status?: string };

function stableContactId(value: unknown): string {
  if (value && typeof value === 'object') {
    const record = value as {_id?: unknown; id?: unknown; userId?: unknown};
    return stableContactId(record._id ?? record.id ?? record.userId);
  }
  return String(value || '').trim();
}

function contactAliases(contact: Contact): string[] {
  const id = stableContactId(contact.id).toLowerCase();
  const phone = String(contact.phone || '').replace(/\D/g, '');
  const email = String(contact.email || '').trim().toLowerCase();
  return [id ? `id:${id}` : '', phone ? `phone:${phone}` : '', email ? `email:${email}` : ''].filter(Boolean);
}

/** Collapse repeated API/device records before they reach FlatList. */
export function uniqueContacts(values: Contact[]): Contact[] {
  const contactsByKey = new Map<string, Contact>();
  const aliasToKey = new Map<string, string>();
  values.forEach(value => {
    const id = stableContactId(value.id);
    if (!id) { return; }
    const contact = {...value, id};
    const aliases = contactAliases(contact);
    const existingKey = aliases.map(alias => aliasToKey.get(alias)).find(Boolean);
    if (existingKey) {
      const existing = contactsByKey.get(existingKey)!;
      const merged = {
        ...existing,
        profilePic: existing.profilePic || contact.profilePic,
        phone: existing.phone || contact.phone,
        email: existing.email || contact.email,
        status: existing.status || contact.status,
        name: existing.name === 'Chatterly user' && contact.name !== 'Chatterly user' ? contact.name : existing.name,
      };
      contactsByKey.set(existingKey, merged);
      contactAliases(merged).forEach(alias => aliasToKey.set(alias, existingKey));
      aliases.forEach(alias => aliasToKey.set(alias, existingKey));
      return;
    }
    const key = aliases[0]!;
    contactsByKey.set(key, contact);
    aliases.forEach(alias => aliasToKey.set(alias, key));
  });
  return [...contactsByKey.values()];
}

async function resolveContactNames(values: Contact[]): Promise<Contact[]> {
  return Promise.all(values.map(async contact => {
    const currentName = String(contact.name || '').trim();
    if (currentName && currentName.toLowerCase() !== 'chatterly user') {
      return contact;
    }
    // Chat-list records can contain only participant ObjectIds. The documented
    // profile endpoint is the authoritative source for the user's display name.
    const profile = await getChatProfile(stableContactId(contact.id)).catch(() => null);
    if (!profile) { return contact; }
    return {
      ...contact,
      name: profile.name || currentName || 'Chatterly user',
      phone: contact.phone || profile.phone,
      profilePic: contact.profilePic || profile.profilePic || undefined,
      status: contact.status || profile.status,
    };
  }));
}

export function BlockedContactsScreen({
  onBack,
  onCountChange,
}: {
  onBack: () => void;
  onCountChange: (count: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const blocked = useBlockedContacts();
  const [adding, setAdding] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Picking several blocked contacts to unblock together; `adding` is the same
  // picking for the contacts to block.
  const [selecting, setSelecting] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<Contact[] | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dialogError, setDialogError] = useState('');
  const back = useCallback(() => {
    if (busyRef.current) return;
    if (adding) {
      setAdding(false);
      setSelected(new Set());
      setQuery('');
      setError('');
    } else if (selecting) {
      setSelecting(false);
      setSelected(new Set());
    } else onBack();
  }, [adding, onBack, selecting]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  }, [back]);
  useEffect(() => {
    onCountChange(blocked.length);
  }, [blocked, onCountChange]);
  useEffect(() => {
    if (selecting && !blocked.length) {
      setSelecting(false);
      setSelected(new Set());
    }
  }, [blocked.length, selecting]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await refreshBlockedContacts();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to load blocked contacts.',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const loadContacts = async () => {
    setAdding(true);
    setLoading(true);
    setError('');
    const found: Contact[] = [];
    const results = await Promise.allSettled([
      getChatList().then(records =>
        normalizeChatList(records)
          .filter(row => !row.contact.kind || row.contact.kind === 'contact')
          .forEach(({ contact }) => {
            const id = stableContactId(contact.userId);
            if (!id) { return; }
            found.push({
              id,
              name: contact.name,
              profilePic: contact.thumbnail || undefined,
              status: contact.status,
            });
          }),
      ),
      (async () => {
        const permission = await Contacts.requestPermissionsAsync();
        if (!permission.granted) return;
        const device = await Contacts.Contact.getAllDetails([
          Contacts.ContactField.PHONES,
          Contacts.ContactField.FULL_NAME,
        ]);
        const phones = device.flatMap(contact =>
          (contact.phones || [])
            .map(phone => phone.number || '')
            .filter(Boolean),
        );
        if (!phones.length) return;
        const response = await syncContacts(phones);
        (response.registered || []).forEach(user => {
          const id = stableContactId(user._id || user.id);
          if (id)
            found.push({
              id,
              name:
                user.name || user.fullName || user.phone || 'Chatterly user',
              profilePic: user.profilePic,
              phone: user.phone,
              status: user.status,
            });
        });
      })(),
    ]);
    const namedContacts = await resolveContactNames(uniqueContacts(found));
    setContacts(
      uniqueContacts(namedContacts)
        .filter(user => stableContactId(user.id).toLowerCase() !== stableContactId(getSession()?.user?.id).toLowerCase())
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    if (results.some(result => result.status === 'rejected'))
      setError(
        'Some contacts could not be loaded. Try again to refresh the list.',
      );
    setLoading(false);
  };
  const candidates = contacts.filter(
    user => !blocked.some(item => stableContactId(item.id).toLowerCase() === stableContactId(user.id).toLowerCase()),
  );
  const visible = adding
    ? candidates.filter(user =>
        `${user.name} ${user.phone || ''}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : blocked;
  const confirm = async () => {
    if (!dialog || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setDialogError('');
    const failed: Contact[] = [];
    let count = 0;
    for (const user of dialog) {
      try {
        await changeContactBlock(user, adding);
        count++;
      } catch {
        failed.push(user);
      }
    }
    busyRef.current = false;
    setBusy(false);
    if (failed.length) {
      setDialog(failed);
      setSelected(new Set(failed.map(user => user.id)));
      setDialogError(
        `${
          count ? `${count} ${adding ? 'blocked' : 'unblocked'} successfully. ` : ''
        }Unable to ${adding ? 'block' : 'unblock'} ${failed.length} contact${
          failed.length > 1 ? 's' : ''
        }. Please try again.`,
      );
    } else {
      setNotice(
        adding
          ? `${count} contact${count === 1 ? '' : 's'} blocked successfully.`
          : count === 1
          ? `${dialog[0].name} has been unblocked.`
          : `${count} contacts unblocked successfully.`,
      );
      setDialog(null);
      setSelected(new Set());
      setSelecting(false);
      setAdding(false);
      setQuery('');
    }
  };
  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityLabel="Back" onPress={back} style={s.back}>
          <BackIcon />
        </Pressable>
        <View style={s.copy}>
          <Text style={s.heading}>
            {adding ? 'Add Blocked Contacts' : 'Blocked Contacts'}
          </Text>
          {adding || selecting ? (
            <Text style={s.subtitle}>{selected.size} Selected</Text>
          ) : null}
        </View>
        {!adding && !loading && blocked.length ? (
          <Pressable
            accessibilityLabel={
              selecting ? 'Cancel selection' : 'Select blocked contacts'
            }
            accessibilityRole="button"
            disabled={busy}
            hitSlop={8}
            onPress={() => {
              setSelecting(on => !on);
              setSelected(new Set());
            }}
            style={s.headerAction}
          >
            <Text style={s.headerActionText}>
              {selecting ? 'Cancel' : 'Select'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {adding ? (
        <View style={s.search}>
          <SearchIcon />
          <TextInput
            accessibilityLabel="Search Contacts"
            placeholder="Search Contacts"
            placeholderTextColor="#526179"
            value={query}
            onChangeText={setQuery}
            style={s.input}
          />
        </View>
      ) : null}
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={adding ? loadContacts : load}
          style={s.error}
        >
          <Text style={s.errorText}>{error} Tap to retry.</Text>
        </Pressable>
      ) : null}
      {loading ? (
        <View style={s.empty}>
          <ActivityIndicator color="#8956FF" />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={item => item.id}
          contentContainerStyle={visible.length ? s.list : s.empty}
          keyboardShouldPersistTaps="handled"
          refreshing={false}
          onRefresh={adding ? loadContacts : load}
          ListHeaderComponent={
            visible.length || adding ? (
              <Text style={s.intro}>
                {adding
                  ? `All Contacts   ${candidates.length}`
                  : selecting
                  ? 'Select the contacts you want to unblock, then tap Unblock Selected Contacts.'
                  : 'Blocked contacts can’t call or message you, or add you to groups. They won’t be notified when you block them. Tap on the contact to unblock them.'}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.emptyContent}>
              {!adding ? (
                <View style={s.sticker}>
                  <BlockIcon size={54} />
                </View>
              ) : null}
              <Text style={s.emptyTitle}>
                {adding ? 'No contacts found' : 'No blocked contacts yet'}
              </Text>
              <Text style={s.emptyBody}>
                {adding
                  ? 'Your registered contacts and conversations appear here. Pull to refresh.'
                  : 'When you block someone, they won’t be able to call you or send you messages.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole={adding || selecting ? 'checkbox' : 'button'}
              accessibilityState={
                adding || selecting
                  ? { checked: selected.has(item.id) }
                  : undefined
              }
              accessibilityLabel={
                adding || selecting
                  ? `Select ${item.name}`
                  : `Unblock ${item.name}`
              }
              onLongPress={
                adding || selecting
                  ? undefined
                  : () => {
                      setSelecting(true);
                      setSelected(new Set([item.id]));
                    }
              }
              onPress={() => {
                if (adding || selecting)
                  setSelected(current => {
                    const next = new Set(current);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  });
                else {
                  setDialogError('');
                  setDialog([item]);
                }
              }}
              style={s.row}
            >
              {adding || selecting ? (
                <View style={[s.check, selected.has(item.id) && s.checked]}>
                  {selected.has(item.id) ? <Text style={s.tick}>✓</Text> : null}
                </View>
              ) : null}
              <View style={s.avatarWrap}>
                {item.profilePic ? (
                  <Image source={{ uri: item.profilePic }} style={s.avatar} />
                ) : (
                  <View style={[s.avatar, s.fallback]}>
                    <Text style={s.initial}>
                      {item.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map(part => part[0])
                        .join('')}
                    </Text>
                  </View>
                )}
              </View>
              <View style={s.copy}>
                <Text numberOfLines={1} style={s.name}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={s.status}>
                  {(item as Contact).status ||
                    item.phone ||
                    item.email ||
                    'Chatterly contact'}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
      {notice ? (
        <View accessibilityLiveRegion="polite" style={s.toast}>
          <Text style={s.toastText}>{notice}</Text>
        </View>
      ) : null}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          accessibilityRole="button"
          disabled={loading || ((adding || selecting) && !selected.size)}
          onPress={() => {
            if (adding) {
              setDialogError('');
              setDialog(candidates.filter(user => selected.has(user.id)));
            } else if (selecting) {
              setDialogError('');
              setDialog(blocked.filter(user => selected.has(user.id)));
            } else loadContacts();
          }}
          style={[
            s.button,
            (loading || ((adding || selecting) && !selected.size)) &&
              s.disabled,
          ]}
        >
          <View style={s.buttonIcon}>
            {adding || selecting ? (
              <BlockIcon color={selected.size ? '#FFF' : '#64748B'} size={22} />
            ) : (
              <Text style={s.plus}>＋</Text>
            )}
          </View>
          <Text
            style={[
              s.buttonText,
              (adding || selecting) && !selected.size && s.disabledText,
            ]}
          >
            {adding
              ? 'Block Selected Contact'
              : selecting
              ? 'Unblock Selected Contacts'
              : 'Add Blocked Contact'}
          </Text>
        </Pressable>
      </View>
      <BlockConfirmation
        visible={!!dialog}
        name={!adding && dialog?.length === 1 ? dialog[0].name : undefined}
        unblock={!adding}
        busy={busy}
        error={dialogError}
        onConfirm={confirm}
        onCancel={() => setDialog(null)}
      />
    </View>
  );
}
const s = createThemedStyles({
  root: { flex: 1, backgroundColor: '#FFF' },
  header: {
    paddingBottom: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#EEF0F4',
    minHeight: 84,
  },
  back: { width: 32, minHeight: 44, justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  heading: { fontSize: 20, fontWeight: '700', color: '#0B1220' },
  subtitle: { fontSize: 13, color: '#526179', marginTop: 3 },
  headerAction: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  headerActionText: { fontSize: 15, fontWeight: '600', color: '#8956FF' },
  search: {
    margin: 16,
    height: 49,
    borderWidth: 1,
    borderColor: '#E1E6EF',
    borderRadius: 9,
    backgroundColor: '#FAFAFA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
  },
  input: { flex: 1, marginLeft: 12, fontSize: 16, color: '#0B1220' },
  list: { paddingHorizontal: 24, paddingBottom: 24 },
  intro: {
    fontSize: 14,
    lineHeight: 21,
    color: '#526179',
    marginTop: 24,
    marginBottom: 22,
  },
  row: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: { width: 48, height: 48 },
  avatar: { width: 48, height: 48, borderRadius: 9 },
  fallback: {
    borderWidth: 1,
    borderColor: '#E1E6EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 16, color: '#94A3B8' },
  name: { fontSize: 17, color: '#0B1220' },
  status: { fontSize: 14, color: '#526179', marginTop: 4 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#64748B',
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checked: { backgroundColor: '#8956FF', borderColor: '#8956FF' },
  tick: { fontSize: 18, color: '#FFF' },
  empty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  emptyContent: { alignItems: 'center' },
  sticker: {
    width: 104,
    height: 104,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 34,
  },
  emptyTitle: {
    fontSize: 17,
    color: '#0B1220',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 21,
    color: '#526179',
    textAlign: 'center',
    maxWidth: 310,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#E1E6EF',
    padding: 16,
  },
  button: {
    minHeight: 49,
    borderRadius: 7,
    backgroundColor: '#8956FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 40,
    paddingRight: 12,
  },
  buttonIcon: { position: 'absolute', left: 20 },
  plus: { fontSize: 25, color: '#FFF' },
  buttonText: { fontSize: 15, color: '#FFF' },
  disabled: { backgroundColor: '#E2E8F0' },
  disabledText: { color: '#64748B' },
  toast: {
    marginHorizontal: 30,
    marginBottom: 24,
    padding: 17,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#E1E6EF',
    backgroundColor: '#F7F8FA',
  },
  toastText: { fontSize: 14, color: '#0B1220', textAlign: 'center' },
  error: { padding: 12, backgroundColor: '#FFF2F3' },
  errorText: { color: '#B42318', fontSize: 13 },
});
