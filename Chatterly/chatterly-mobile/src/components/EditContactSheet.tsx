import * as Contacts from 'expo-contacts';
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BackIcon} from './ChatIcons';
import {EmailInputIcon, PhoneInputIcon} from './ContactsIcons';
import {getContactAlias, setContactAlias} from '../services/contactAliases';
import {createThemedStyles} from '../theme/themedStyles';
import {formatPhoneNumber, phoneDigits} from '../utils/phoneNumber';

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type DeviceRecord = {id?: string; givenName?: string; familyName?: string; phones?: Array<{number?: string}>; emails?: Array<{address?: string}>};

type Props = {
  visible: boolean;
  userId: string;
  /** The name the chat shows now (a saved name, else the account's). */
  name: string;
  /** The contact's number on Chatterly, when known. */
  phone?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

/** Same line, whatever formatting - compared on the last ten digits like contact sync. */
function sameLine(first: unknown, second: unknown): boolean {
  const a = phoneDigits(first).slice(-10);
  const b = phoneDigits(second).slice(-10);
  return a.length >= 7 && a === b;
}

function splitName(name: string): {first: string; last: string} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) { return {first: parts[0] || '', last: ''}; }
  return {first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1]};
}

async function findDeviceContact(phone: string): Promise<DeviceRecord | null> {
  if (!phoneDigits(phone)) { return null; }
  const permission = await Contacts.getPermissionsAsync();
  if (!permission.granted) { return null; }
  const records = await Contacts.Contact.getAllDetails([
    Contacts.ContactField.GIVEN_NAME,
    Contacts.ContactField.FAMILY_NAME,
    Contacts.ContactField.PHONES,
    Contacts.ContactField.EMAILS,
  ]) as DeviceRecord[];
  return records.find(record => record.phones?.some(entry => sameLine(entry.number, phone))) || null;
}

/**
 * Edit Contact for a one-to-one chat (Sprint 2 Story 7's contact details).
 *
 * The number is the contact's Chatterly account and is what the chat is with,
 * so it is shown but not editable; the name and email are the user's own
 * record of the person. Saving keeps the name for Chatterly's screens and, with
 * the sync option on, writes it to the phone's address book - updating the
 * entry that already has this number, or adding one.
 */
export function EditContactSheet({name, onClose, onSaved, phone = '', userId, visible}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [syncToPhone, setSyncToPhone] = useState(true);
  const [deviceContact, setDeviceContact] = useState<DeviceRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) { return; }
    let active = true;
    const start = splitName(getContactAlias(userId) || name);
    setFirstName(start.first);
    setLastName(start.last);
    setEmail('');
    setError('');
    setDeviceContact(null);
    // Prefill from the address book when access was already given; asking for
    // it is left to Save, where the user has chosen to sync.
    findDeviceContact(phone).then(record => {
      if (!active || !record) { return; }
      setDeviceContact(record);
      if (record.givenName || record.familyName) {
        setFirstName(record.givenName || '');
        setLastName(record.familyName || '');
      }
      setEmail(record.emails?.[0]?.address || '');
    }).catch(() => undefined);
    return () => { active = false; };
  }, [name, phone, userId, visible]);

  const trimmedEmail = email.trim();
  const emailValid = !trimmedEmail || EMAIL_PATTERN.test(trimmedEmail);
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const canSave = Boolean(firstName.trim()) && emailValid && !saving;

  const save = async () => {
    if (!canSave) { return; }
    setSaving(true);
    setError('');
    try {
      let phoneMessage = '';
      if (syncToPhone && phoneDigits(phone)) {
        const current = await Contacts.getPermissionsAsync();
        const permission = current.granted ? current : await Contacts.requestPermissionsAsync();
        if (!permission.granted) {
          throw new Error('Allow contact access to save this contact to your phone, or turn off phone sync.');
        }
        const existing = deviceContact || await findDeviceContact(phone);
        if (existing?.id) {
          const record = new Contacts.Contact(existing.id);
          await record.patch({givenName: firstName.trim(), familyName: lastName.trim() || null});
          const known = (existing.emails || []).map(entry => String(entry.address || '').toLowerCase());
          if (trimmedEmail && !known.includes(trimmedEmail.toLowerCase())) {
            await record.addEmail({label: 'other', address: trimmedEmail});
          }
          phoneMessage = ' and in your phone contacts';
        } else {
          await Contacts.Contact.create({
            givenName: firstName.trim(),
            familyName: lastName.trim(),
            phones: [{label: 'mobile', number: phone}],
            emails: trimmedEmail ? [{label: 'other', address: trimmedEmail}] : [],
          });
          phoneMessage = ' and added to your phone contacts';
        }
      }
      await setContactAlias(userId, fullName);
      onSaved(`Contact saved${phoneMessage}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save this contact. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent visible={visible}>
    <View accessibilityLabel="Edit Contact" style={[styles.screen, {paddingTop: insets.top}]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back from Edit Contact" accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.back}><BackIcon /></Pressable>
        <Text accessibilityRole="header" style={styles.title}>Edit Contact</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.fieldLabel}>First Name</Text>
          <TextInput accessibilityLabel="First Name" autoCapitalize="words" maxLength={40} onChangeText={setFirstName} placeholder="First name" placeholderTextColor="#8792A4" style={styles.fieldInput} value={firstName} />
          {!firstName.trim() ? <Text style={styles.validationText}>First name is required</Text> : null}

          <Text style={styles.fieldLabel}>Last Name</Text>
          <TextInput accessibilityLabel="Last Name" autoCapitalize="words" maxLength={40} onChangeText={setLastName} placeholder="Last name" placeholderTextColor="#8792A4" style={styles.fieldInput} value={lastName} />

          <Text style={styles.fieldLabel}>Phone Number</Text>
          <View accessibilityLabel={phone ? `Phone number ${formatPhoneNumber(phone)}` : 'Phone number not available'} style={[styles.iconField, styles.fieldLocked]}>
            <PhoneInputIcon />
            <Text numberOfLines={1} style={styles.lockedValue}>{phone ? formatPhoneNumber(phone) : 'Not available'}</Text>
          </View>
          <Text style={styles.helperText}>This is their Chatterly number, so it can't be changed here.</Text>

          <Text style={styles.fieldLabel}>Email ID</Text>
          <View style={styles.iconField}>
            <EmailInputIcon />
            <TextInput accessibilityLabel="Email ID" autoCapitalize="none" keyboardType="email-address" onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor="#8792A4" style={styles.iconInput} value={email} />
          </View>
          {!emailValid ? <Text style={styles.validationText}>Enter a valid email address</Text> : null}

          {phoneDigits(phone) ? <Pressable
            accessibilityLabel="Sync contact to your phone's contact"
            accessibilityRole="switch"
            accessibilityState={{checked: syncToPhone}}
            onPress={() => setSyncToPhone(value => !value)}
            style={styles.syncRow}>
            <View style={[styles.checkbox, syncToPhone && styles.checkboxActive]}>
              {syncToPhone ? <View style={styles.checkboxDot} /> : null}
            </View>
            <Text style={styles.syncLabel}>Sync contact to your phone's contact</Text>
          </Pressable> : null}
          {error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
        <View style={{paddingBottom: Math.max(insets.bottom, 14)}}>
          <Pressable
            accessibilityLabel="Save contact"
            accessibilityRole="button"
            accessibilityState={{disabled: !canSave, busy: saving}}
            disabled={!canSave}
            onPress={() => { save().catch(() => undefined); }}
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}>
            {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={[styles.saveLabel, !canSave && styles.saveLabelDisabled]}>Save</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  </Modal>;
}

const styles = createThemedStyles({
  screen: {flex: 1, backgroundColor: '#FFFFFF'},
  header: {height: 52, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#EEF0F4', flexDirection: 'row', alignItems: 'center'},
  back: {width: 36, height: 44, alignItems: 'center', justifyContent: 'center'},
  title: {marginLeft: 4, color: '#121826', fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: '700'},
  body: {flex: 1, paddingHorizontal: 20},
  form: {paddingTop: 8, paddingBottom: 26},
  fieldLabel: {marginTop: 15, marginBottom: 8, color: '#0D1422', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '500'},
  fieldInput: {height: 40, paddingHorizontal: 10, paddingVertical: 0, borderWidth: 1, borderColor: '#E1E6ED', borderRadius: 5, color: '#152033', fontFamily: FONT_FAMILY, fontSize: 12},
  iconField: {height: 40, paddingHorizontal: 11, borderWidth: 1, borderColor: '#E1E6ED', borderRadius: 5, flexDirection: 'row', alignItems: 'center'},
  iconInput: {flex: 1, height: '100%', marginLeft: 9, paddingVertical: 0, color: '#152033', fontFamily: FONT_FAMILY, fontSize: 12},
  fieldLocked: {backgroundColor: '#F6F7F9', borderColor: '#E9ECF1'},
  lockedValue: {flex: 1, marginLeft: 9, color: '#344256', fontFamily: FONT_FAMILY, fontSize: 12},
  helperText: {marginTop: 6, color: '#758196', fontFamily: FONT_FAMILY, fontSize: 10},
  validationText: {marginTop: 6, color: '#C0392B', fontFamily: FONT_FAMILY, fontSize: 10},
  errorText: {marginTop: 16, color: '#C0392B', fontFamily: FONT_FAMILY, fontSize: 11, lineHeight: 16},
  syncRow: {marginTop: 28, flexDirection: 'row', alignItems: 'center'},
  checkbox: {width: 34, height: 18, borderWidth: 1, borderColor: '#DDE4EE', borderRadius: 2, backgroundColor: '#E7ECF3', justifyContent: 'center'},
  checkboxActive: {borderColor: '#8750F4', backgroundColor: '#8750F4'},
  checkboxDot: {width: 15, height: 15, marginLeft: 17, borderRadius: 2, backgroundColor: '#FFFFFF'},
  syncLabel: {marginLeft: 8, color: '#0D1422', fontFamily: FONT_FAMILY, fontSize: 11},
  saveButton: {height: 42, borderRadius: 5, backgroundColor: '#8750F4', alignItems: 'center', justifyContent: 'center'},
  saveButtonDisabled: {backgroundColor: '#DFE5EE'},
  saveLabel: {color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600'},
  saveLabelDisabled: {color: '#66758C'},
});
