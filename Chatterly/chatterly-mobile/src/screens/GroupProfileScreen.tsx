import React, {useState} from 'react';
import {ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {GroupProfileIcon, GroupPictureEditIcon} from '../components/GroupProfileIcon';
import {BroadcastPhotoEditor} from '../components/BroadcastPhotoEditor';
import * as ImagePicker from 'expo-image-picker';
import {prepareProfileImage} from '../services/profileImage';
import {Snackbar} from '../components/Snackbar';
import {changeGroupPhoto, removeGroupPhoto, sendGroupTimelineNotice, updateGroupInfo, type GroupDetails} from '../services/groupApi';
import {getSession} from '../services/sessionStore';
import {createThemedStyles} from '../theme/themedStyles';
import type {ChatMessage} from '../types/chat';

type Props = {details: GroupDetails; canEdit: boolean; canEditDescription?: boolean; canRemovePhoto?: boolean; photoOnly?: boolean; onBack: () => void; onUpdated: (details: GroupDetails) => void; onTimelineMessage?: (message: ChatMessage) => void};
export function GroupProfileScreen({details, canEdit, canEditDescription = canEdit, canRemovePhoto = canEdit, photoOnly = false, onBack, onUpdated, onTimelineMessage}: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(details.name);
  const [description, setDescription] = useState(details.description || '');
  const [picture, setPicture] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedDetails, setSavedDetails] = useState(details);
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [cropCandidate, setCropCandidate] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [notice, setNotice] = useState('');
  const textChanged = !photoOnly && (name.trim() !== savedDetails.name || (canEditDescription && description.trim() !== (savedDetails.description || '')));
  const changed = textChanged || Boolean(image) || (removePhoto && Boolean(savedDetails.photo));
  const visiblePhoto = image?.uri || (removePhoto ? null : savedDetails.photo);
  const currentUser = getSession()?.user;
  const changedBy = details.participants.find(member => member.userId === currentUser?.id)?.name?.trim()
    || currentUser?.name?.trim()
    || 'A group admin';
  const fail = (error: unknown) => setNotice(error instanceof Error ? error.message : 'Unable to save changes. Please try again.');
  const publishPhotoNotice = async (text: string) => {
    const tempId = `group-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: ChatMessage = {
      id: tempId,
      tempId,
      text,
      createdAt: new Date().toISOString(),
      isOwn: true,
      messageType: 'text',
      status: 'pending',
      systemEvent: true,
    };
    onTimelineMessage?.(optimistic);
    try {
      const saved = await sendGroupTimelineNotice(details.id, text);
      onTimelineMessage?.({...saved, tempId, systemEvent: true});
    } catch {
      // The photo endpoint has already committed. Keep the local notice visible
      // and mark only its timeline persistence as failed.
      onTimelineMessage?.({...optimistic, status: 'failed'});
    }
  };
  const save = async () => {
    if (!canEdit || busy || !name.trim()) return;
    if (!photoOnly && canEditDescription && details.description && !description.trim()) { Alert.alert('Description required', 'The server does not support clearing an existing description. Enter a description to save.'); return; }
    setBusy(true);
    let next = savedDetails;
    try {
      // The group API has separate photo and text endpoints. Record each
      // successful operation so retrying a partial save does not repeat it.
      if (image) {
        const photo = await changeGroupPhoto(details.id, image);
        next = {...next, photo};
        setSavedDetails(next); onUpdated(next); setImage(null); setRemovePhoto(false);
        await publishPhotoNotice(`${changedBy} changed the group photo.`);
      } else if (removePhoto && next.photo) {
        await removeGroupPhoto(details.id);
        next = {...next, photo: null};
        setSavedDetails(next); onUpdated(next); setRemovePhoto(false);
        await publishPhotoNotice(`${changedBy} removed the group photo.`);
      }
      if (textChanged) {
        const updated = await updateGroupInfo(details.id, name.trim(), canEditDescription ? description.trim() : (savedDetails.description || ''));
        next = {...next, ...updated};
        setSavedDetails(next); onUpdated(next);
      }
      onBack();
    } catch (error) { fail(error); } finally { setBusy(false); }
  };
  const back = () => {if (busy) return; if (!changed) onBack(); else Alert.alert('Discard changes?', 'Your group changes have not been saved.', [{text:'Keep Editing', style:'cancel'}, {text:'Discard', style:'destructive', onPress:onBack}]);};
  const photoAction = async (source: 'camera' | 'gallery' | 'remove') => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      if (source === 'remove') { if (!canRemovePhoto) return; setImage(null); setRemovePhoto(true); return; }
      const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('Permission needed', `Allow ${source === 'camera' ? 'camera' : 'photo library'} access in Settings to change the group picture.`); return; }
      // Always use the in-app editor after picking. Several Android camera and
      // gallery providers ignore the picker's native `allowsEditing` flag.
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({mediaTypes: ['images'], quality: 1, cameraType: ImagePicker.CameraType.front})
        : await ImagePicker.launchImageLibraryAsync({mediaTypes: ['images'], quality: 1, selectionLimit: 1});
      if (!result.canceled && result.assets[0]) {
        setCropCandidate(result.assets[0]);
      }
    } catch (error) { fail(error); } finally { setSheet(false); setBusy(false); }
  };
  const useCroppedPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    if (busy) return;
    setBusy(true);
    try {
      const prepared = await prepareProfileImage(asset);
      setImage(prepared); setRemovePhoto(false); setNotice(''); setCropCandidate(null);
    } catch (error) { fail(error); } finally { setBusy(false); }
  };
  const avatar = visiblePhoto ? <Image source={{uri: visiblePhoto}} style={s.avatar}/> : <View style={[s.avatar, s.placeholder]}><Text style={s.title}>{details.name.slice(0, 2).toUpperCase()}</Text></View>;
  return <Modal visible statusBarTranslucent animationType="slide" onShow={photoOnly ? () => setSheet(true) : undefined} onRequestClose={back}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.screen, {paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16)}]}>
    <View style={s.header}><Pressable accessibilityLabel={photoOnly ? "Back from group photo editor" : "Back from group settings"} disabled={busy} onPress={back} style={s.back}><GroupProfileIcon name="back" size={22}/></Pressable><Text style={s.title}>{photoOnly ? "Group Picture" : "Group Settings"}</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.photoWrap}><Pressable accessibilityLabel="View group picture" onPress={() => setPicture(true)}>{avatar}</Pressable>{canEdit && <Pressable accessibilityLabel="Change group picture" disabled={busy} onPress={() => setSheet(true)} style={s.camera}><GroupProfileIcon name="camera"/></Pressable>}</View>
      {!photoOnly && <><Text style={s.label}>Group Name</Text><TextInput accessibilityLabel="Group Name" editable={canEdit && !busy} maxLength={50} value={name} onChangeText={setName} style={s.input}/>
      <Text style={s.label}>Description</Text><TextInput accessibilityLabel="Description" editable={canEdit && canEditDescription && !busy} maxLength={256} multiline value={description} onChangeText={setDescription} style={[s.input, s.description]}/><Text style={s.counter}>{description.length}/256</Text></>}
    </ScrollView>
    {busy && <ActivityIndicator color="#6125DC"/>}{canEdit && <Pressable accessibilityLabel="Save Changes" disabled={busy || !changed || !name.trim()} onPress={save} style={[s.button, (!changed || busy || !name.trim()) && s.disabled]}><Text style={s.buttonText}>{busy ? 'Please wait…' : 'Save Changes'}</Text></Pressable>}
    <Modal visible={picture} statusBarTranslucent animationType="slide" onRequestClose={() => setPicture(false)}><View style={[s.viewer, {paddingTop: insets.top, paddingBottom: insets.bottom}]}><View style={s.header}><Pressable accessibilityLabel="Back from group picture" onPress={() => setPicture(false)} style={s.back}><GroupProfileIcon name="back" size={22} color="white"/></Pressable><Text style={[s.title, s.white, s.grow]}>Group Picture</Text>{canEdit && <Pressable accessibilityLabel="Edit group picture" onPress={() => {setPicture(false); setTimeout(() => setSheet(true), 350);}} style={s.pictureEdit}><GroupPictureEditIcon/></Pressable>}</View>{visiblePhoto ? <Image source={{uri: visiblePhoto}} resizeMode="contain" style={s.fullImage}/> : <View style={s.fullImage}><Text style={s.white}>No group picture</Text></View>}</View></Modal>
    <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}><View style={s.overlay}><Pressable accessibilityLabel="Dismiss picture options" style={s.grow} onPress={() => setSheet(false)}/><View style={[s.sheet, {paddingBottom: Math.max(insets.bottom, 24)}]}><View style={s.handle}/><View style={s.sheetHeader}><Text style={s.title}>Profile Picture</Text><Pressable accessibilityLabel="Close picture options" onPress={() => setSheet(false)}><Text style={s.title}>×</Text></Pressable></View><View style={s.options}>{(['camera', 'gallery'] as const).map(source => <Pressable accessibilityLabel={source === 'camera' ? 'Camera' : 'Gallery'} key={source} disabled={busy} onPress={() => photoAction(source)} style={s.option}><GroupProfileIcon name={source === 'camera' ? 'camera' : 'gallery'} size={28}/><Text style={s.label}>{source === 'camera' ? 'Camera' : 'Gallery'}</Text></Pressable>)}</View>{visiblePhoto && canRemovePhoto && <Pressable accessibilityLabel="Remove Profile Picture" disabled={busy} onPress={() => photoAction('remove')} style={s.remove}><Text style={s.red}>Remove Profile Picture</Text></Pressable>}</View></View></Modal>
    <BroadcastPhotoEditor asset={cropCandidate} onCancel={() => setCropCandidate(null)} onUse={useCroppedPhoto} subject="group"/>
  <Snackbar message={notice} onHide={() => setNotice('')}/>
  </KeyboardAvoidingView></Modal>;
}
const s = createThemedStyles({screen:{flex:1,backgroundColor:'#FFF'},header:{height:52,flexDirection:'row',alignItems:'center',paddingHorizontal:16,gap:12},back:{padding:8},pictureEdit:{width:40,height:40,alignItems:'center',justifyContent:'center'},title:{fontSize:20,fontWeight:'700',color:'#0B1220'},content:{padding:16},photoWrap:{alignSelf:'center',marginTop:16,marginBottom:22},avatar:{width:88,height:88,borderRadius:14},placeholder:{backgroundColor:'#F1EBFE',alignItems:'center',justifyContent:'center'},camera:{position:'absolute',bottom:-4,right:-6,backgroundColor:'white',borderWidth:1,borderColor:'#E2E8F0',borderRadius:10,paddingHorizontal:10,paddingVertical:4},label:{fontSize:14,color:'#0B1220'},input:{borderWidth:1,borderColor:'#CBD5E1',borderRadius:7,padding:12,fontSize:14,color:'#0B1220',marginTop:8,marginBottom:18,minHeight:44},description:{height:104,textAlignVertical:'top',marginBottom:6},counter:{textAlign:'right',color:'#64748B'},button:{marginHorizontal:16,marginTop:12,padding:12,borderRadius:8,backgroundColor:'#6125DC',alignItems:'center'},buttonText:{fontSize:14,color:'white'},disabled:{backgroundColor:'#94A3B8'},viewer:{flex:1,backgroundColor:'#000'},white:{color:'white',fontSize:24},grow:{flex:1},fullImage:{flex:1,width:'100%',alignItems:'center',justifyContent:'center'},overlay:{flex:1,backgroundColor:'rgba(0,0,0,.4)'},sheet:{padding:16,backgroundColor:'white',borderTopLeftRadius:20,borderTopRightRadius:20},handle:{width:48,height:4,borderRadius:2,backgroundColor:'#E2E8F0',alignSelf:'center',marginBottom:20},sheetHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20},options:{flexDirection:'row',gap:16},option:{flex:1,padding:18,gap:10,alignItems:'center',borderWidth:1,borderColor:'#E2E8F0',borderRadius:10,backgroundColor:'#FAFAFA'},remove:{marginTop:16,padding:16,borderRadius:10,backgroundColor:'#FFF2F3',alignItems:'center'},red:{color:'#EF242B',fontSize:14}});
