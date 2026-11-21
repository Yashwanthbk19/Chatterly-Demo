import * as ImagePicker from 'expo-image-picker';
import React, {useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView, Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CalendarIcon, CameraIcon, CloseIcon, EditIcon, GalleryIcon, PlusIcon, TrashIcon} from '../components/ProfileIcons';
import {ChatLogo} from '../components/ChatLogo';
import {DateOfBirthPicker} from '../components/DateOfBirthPicker';
import {EmojiKeyboardToggle, useEmojiKeyboardToggle} from '../components/EmojiKeyboardToggle';
import {EmojiPicker} from '../components/EmojiPicker';
import {PatternBackground} from '../components/PatternBackground';
import {Snackbar} from '../components/Snackbar';
import {createProfile} from '../services/profileApi';
import {prepareProfileImage} from '../services/profileImage';
import {normalizeAccountDate} from '../services/accountProfile';
import type {AuthUser} from '../types/auth';
import type {ProfileDraft} from '../types/profile';
import {normalizeAuthUser} from '../utils/authResponse';
import {
  formatDateOfBirth,
  validateProfile,
  type ProfileErrors,
} from '../utils/profileValidation';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {
  token: string;
  userId?: string;
  initialName?: string;
  onComplete: (user: AuthUser) => void | Promise<void>;
};
const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});
const BIO_MAX_LENGTH = 250;
const FULL_NAME_MAX_LENGTH = 25;

export function ProfileSetupScreen({token, userId, initialName = '', onComplete}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialName);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [bio, setBio] = useState('');
  const [image, setImage] = useState<ProfileDraft['image']>();
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [sheetVisible, setSheetVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const draft = (): ProfileDraft => ({name, dateOfBirth, bio, image});
  const canCreate = Object.keys(validateProfile(draft())).length === 0;
  const clearError = (key: keyof ProfileErrors) => setErrors(current => ({...current, [key]: undefined}));
  const changeName = (value: string) => { setName(value); clearError('name'); };
  // Full Name's corner button swaps the keyboard for the emoji panel and back.
  const nameEmoji = useEmojiKeyboardToggle({value: name, onChangeText: changeName, maxLength: FULL_NAME_MAX_LENGTH,
    onLimit: () => setMessage(`Name cannot exceed ${FULL_NAME_MAX_LENGTH} characters.`)});
  const openDatePicker = () => {
    if (saving) { return; }
    Keyboard.dismiss();
    nameEmoji.closeEmoji();
    setDatePickerVisible(true);
  };

  const chooseImage = async (source: 'camera' | 'gallery') => {
    setSheetVisible(false);
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage(`Allow ${source === 'camera' ? 'camera' : 'photo library'} access to choose a profile picture.`);
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({mediaTypes: ['images'], quality: 0.8, cameraType: ImagePicker.CameraType.front})
        : await ImagePicker.launchImageLibraryAsync({mediaTypes: ['images'], quality: 0.8, selectionLimit: 1});
      if (!result.canceled) {
        const asset = await prepareProfileImage(result.assets[0]);
        setImage({
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          fileSize: asset.fileSize,
        });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to open the image picker. Please try again.');
    }
  };

  const saveProfile = async () => {
    const nextErrors = validateProfile(draft());
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || saving) { return; }

    setSaving(true);
    try {
      const submitted = draft();
      const response = await createProfile(token, submitted, userId);
      const user = normalizeAuthUser(response.user);
      // Some responses omit fields from the submitted form. Keep those details
      // and normalize MongoDB's _id before the app persists the completed profile.
      await onComplete({
        ...user,
        id: user?.id || userId,
        name: user?.name || submitted.name.trim(),
        dateOfBirth: normalizeAccountDate(user?.dateOfBirth || submitted.dateOfBirth),
        status: user?.status ?? submitted.bio.trim(),
        ...(user?.profilePic || submitted.image?.uri
          ? {profilePic: user?.profilePic || submitted.image?.uri} : {}),
        isProfileComplete: true,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PatternBackground />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, {paddingTop: Math.max(insets.top + 28, 52), paddingBottom: insets.bottom + 24}]}>
        <ChatLogo />
        <Text style={styles.title}>Create your profile</Text>
        <Text style={styles.subtitle}>Set up your profile to start chatting,{`\n`}you’ll be ready in seconds</Text>

        <View style={styles.photoArea}>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose profile picture" onPress={() => setSheetVisible(true)} style={styles.avatar}>
            {image ? <Image source={{uri: image.uri}} style={styles.avatarImage} /> : <PlusIcon />}
          </Pressable>
          {image && <Pressable accessibilityRole="button" accessibilityLabel="Change profile picture" onPress={() => setSheetVisible(true)} style={styles.changePhotoButton}>
            <EditIcon /><Text style={styles.changePhotoLabel}>Change</Text>
          </Pressable>}
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Full Name <Text style={styles.required}>*</Text></Text>
          <View>
            <TextInput accessibilityLabel="Full name" autoCapitalize="words" editable={!saving} maxLength={FULL_NAME_MAX_LENGTH}
              onChangeText={changeName} placeholder="Full Name" placeholderTextColor="#98A5B6" returnKeyType="next"
              style={[styles.input, styles.inputWithToggle, errors.name && styles.inputError]} value={name} {...nameEmoji.inputProps} />
            <View style={styles.inputToggle}><EmojiKeyboardToggle open={nameEmoji.emojiOpen} onPress={nameEmoji.toggle} /></View>
          </View>
          {errors.name && <Text style={styles.error}>{errors.name}</Text>}

          <Text style={styles.labelDate}>Date of Birth <Text style={styles.required}>*</Text></Text>
          <View style={[styles.dateField, errors.dateOfBirth && styles.inputError]}>
            <TextInput accessibilityLabel="Date of birth" editable={!saving} keyboardType="number-pad" maxLength={10} onFocus={nameEmoji.closeEmoji}
              onChangeText={value => { setDateOfBirth(formatDateOfBirth(value)); clearError('dateOfBirth'); }}
              placeholder="(dd/mm/yyyy)" placeholderTextColor="#98A5B6" style={styles.dateInput} value={dateOfBirth} />
            <Pressable accessibilityRole="button" accessibilityLabel="Open date of birth picker" hitSlop={10} onPress={openDatePicker} style={styles.calendarButton}>
              <CalendarIcon />
            </Pressable>
          </View>
          {errors.dateOfBirth && <Text style={styles.error}>{errors.dateOfBirth}</Text>}

          <Text style={styles.labelDate}>Bio</Text>
          <TextInput accessibilityLabel="Bio" editable={!saving} maxLength={BIO_MAX_LENGTH} multiline onFocus={nameEmoji.closeEmoji}
            onChangeText={setBio} placeholder="Hey There, you can enter about yourself here!"
            placeholderTextColor="#98A5B6" style={styles.bioInput} textAlignVertical="top" value={bio} />
          <Text style={styles.counter}>{bio.length}/{BIO_MAX_LENGTH}</Text>

          <Pressable accessibilityRole="button" accessibilityLabel="Create profile" accessibilityState={{disabled: !canCreate || saving, busy: saving}}
            disabled={!canCreate || saving} onPress={saveProfile} style={({pressed}) => [styles.createButton, canCreate && !saving && styles.createButtonReady, pressed && canCreate && !saving && styles.createPressed]}>
            {saving ? <View style={styles.creatingRow}><View style={styles.spinnerSlot} /><Text style={styles.createLabel}>Creating Profile</Text><View style={styles.spinnerSlot}><ActivityIndicator color="#536074" size="small" /></View></View> : <Text style={[styles.createLabel, canCreate && styles.createLabelReady]}>Create Profile</Text>}
          </Pressable>
          <Text style={styles.imageSizeHint}>Maximum profile image size: 5 MB</Text>
        </View>
      </ScrollView>
      <EmojiPicker bottomInset={insets.bottom} onSelectEmoji={nameEmoji.insertEmoji} showGifTab={false} visible={nameEmoji.emojiOpen} />

      <Modal animationType="slide" transparent visible={sheetVisible} onRequestClose={() => setSheetVisible(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close profile picture menu" onPress={() => setSheetVisible(false)} style={styles.backdrop} />
        <View style={[styles.sheet, {paddingBottom: Math.max(insets.bottom + 18, 28)}]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Profile Picture</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setSheetVisible(false)}><CloseIcon /></Pressable></View>
          <View style={styles.pickerRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Take profile photo" onPress={() => chooseImage('camera')} style={styles.pickerOption}><CameraIcon /><Text style={styles.pickerText}>Camera</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose profile photo from gallery" onPress={() => chooseImage('gallery')} style={styles.pickerOption}><GalleryIcon /><Text style={styles.pickerText}>Gallery</Text></Pressable>
          </View>
          {image && <Pressable accessibilityRole="button" accessibilityLabel="Remove profile picture" onPress={() => { setImage(undefined); setSheetVisible(false); }} style={styles.removePhotoButton}>
            <TrashIcon /><Text style={styles.removePhotoLabel}>Remove Profile Picture</Text>
          </Pressable>}
        </View>
      </Modal>
      {datePickerVisible ? (
        <DateOfBirthPicker
          value={dateOfBirth}
          onCancel={() => setDatePickerVisible(false)}
          onConfirm={value => {
            setDateOfBirth(value);
            clearError('dateOfBirth');
            setDatePickerVisible(false);
          }}
        />
      ) : null}
      <Snackbar message={message} onHide={() => setMessage('')} />
    </KeyboardAvoidingView>
  );
}

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#FFFFFF'},
  content: {flexGrow: 1, paddingHorizontal: 20, alignItems: 'center'},
  title: {fontFamily: FONT_FAMILY, marginTop: 38, color: '#0B1220', fontSize: 16, lineHeight: 21, fontWeight: '700', textAlign: 'center'},
  subtitle: {fontFamily: FONT_FAMILY, marginTop: 8, color: '#596579', fontSize: 12, lineHeight: 18, textAlign: 'center'},
  photoArea: {height: 100, marginTop: 17, alignItems: 'center'},
  avatar: {width: 80, height: 80, borderRadius: 12, borderWidth: 1, borderColor: '#DDE3EA', backgroundColor: '#F6F8FB', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  avatarImage: {width: '100%', height: '100%'},
  changePhotoButton: {height: 17, marginTop: 3, paddingHorizontal: 6, borderRadius: 4, backgroundColor: '#F1EBFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2},
  changePhotoLabel: {fontFamily: FONT_FAMILY, color: '#7137DD', fontSize: 9, fontWeight: '600'},
  imageSizeHint: {fontFamily: FONT_FAMILY, marginTop: 8, color: '#596579', fontSize: 11, lineHeight: 15, textAlign: 'center'},
  form: {width: '100%', maxWidth: 430, marginTop: 14},
  label: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 11, lineHeight: 15, fontWeight: '600', marginBottom: 7},
  labelDate: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 11, lineHeight: 15, fontWeight: '600', marginTop: 15, marginBottom: 7},
  required: {color: '#D73A31'},
  input: {height: 40, paddingHorizontal: 11, borderWidth: 1, borderColor: '#DCE2EA', borderRadius: 5, backgroundColor: '#FFFFFF', fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 11},
  dateField: {height: 40, paddingLeft: 11, paddingRight: 10, borderWidth: 1, borderColor: '#DCE2EA', borderRadius: 5, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center'},
  dateInput: {flex: 1, alignSelf: 'stretch', padding: 0, fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 11},
  calendarButton: {width: 30, height: 40, marginRight: -6, alignItems: 'center', justifyContent: 'center'},
  bioInput: {height: 63, paddingHorizontal: 11, paddingTop: 10, paddingBottom: 7, borderWidth: 1, borderColor: '#DCE2EA', borderRadius: 5, backgroundColor: '#FFFFFF', fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 11, lineHeight: 15},
  inputWithToggle: {paddingRight: 44},
  inputToggle: {position: 'absolute', top: 0, right: 2, bottom: 0, justifyContent: 'center'},
  inputError: {borderColor: '#D73A31'},
  error: {fontFamily: FONT_FAMILY, color: '#C4322C', fontSize: 10, marginTop: 4},
  counter: {fontFamily: FONT_FAMILY, alignSelf: 'flex-end', color: '#758196', fontSize: 9, marginTop: 3},
  createButton: {height: 40, marginTop: 18, borderRadius: 5, backgroundColor: '#DFE5ED', alignItems: 'center', justifyContent: 'center'},
  createButtonReady: {backgroundColor: '#8537F5'},
  createPressed: {backgroundColor: '#7127DC'},
  createLabel: {fontFamily: FONT_FAMILY, color: '#607087', fontSize: 11, fontWeight: '500'},
  createLabelReady: {color: '#FFFFFF', fontWeight: '600'},
  creatingRow: {width: '100%', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  spinnerSlot: {width: 20, alignItems: 'center', justifyContent: 'center'},
  backdrop: {flex: 1, backgroundColor: 'rgba(16, 23, 34, 0.42)'},
  sheet: {backgroundColor: '#FFFFFF', borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 12, paddingTop: 5},
  handle: {width: 31, height: 3, borderRadius: 2, alignSelf: 'center', backgroundColor: '#D8E0EA'},
  sheetHeader: {height: 41, paddingHorizontal: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sheetTitle: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 13, fontWeight: '600'},
  pickerRow: {flexDirection: 'row', gap: 10},
  pickerOption: {flex: 1, height: 61, borderWidth: 1, borderColor: '#ECF0F4', borderRadius: 5, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: '#FFFFFF'},
  pickerText: {fontFamily: FONT_FAMILY, color: '#0B1220', fontSize: 10, fontWeight: '500'},
  removePhotoButton: {height: 33, marginTop: 10, borderRadius: 5, backgroundColor: '#FFF0F1', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5},
  removePhotoLabel: {fontFamily: FONT_FAMILY, color: '#EF3B43', fontSize: 10, fontWeight: '500'},
});
