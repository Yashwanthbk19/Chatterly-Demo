import React from 'react';
import renderer, {act} from 'react-test-renderer';
import * as ImagePicker from 'expo-image-picker';
import {Modal, Platform} from 'react-native';
import {GroupProfileScreen} from '../src/screens/GroupProfileScreen';
import {changeGroupPhoto, sendGroupTimelineNotice, updateGroupInfo, type GroupDetails} from '../src/services/groupApi';
jest.mock('react-native-safe-area-context', () => ({...jest.requireActual('react-native-safe-area-context'),useSafeAreaInsets: () => ({top:0,bottom:0})}));
jest.mock('../src/services/groupApi', () => ({changeGroupPhoto: jest.fn(),removeGroupPhoto:jest.fn(),sendGroupTimelineNotice:jest.fn(),updateGroupInfo:jest.fn()}));
const details: GroupDetails = {id:'g1',name:'Team',description:'Sprint',photo:'https://example.com/old.jpg',rules:[],participants:[],settings:{onlyAdminsCanMessage:false,onlyAdminsCanShareMedia:false}};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(sendGroupTimelineNotice).mockResolvedValue({id:'photo-notice',text:'',createdAt:'2026-10-16T10:00:00.000Z',isOwn:true,systemEvent:true});
});

async function cropAndUseGroupPicture(tree: renderer.ReactTestRenderer) {
  expect(tree.root.findByProps({accessibilityLabel:'Crop group picture'})).toBeDefined();
  expect(tree.root.findByProps({accessibilityLabel:'Group picture crop area'})).toBeDefined();
  expect(tree.root.findAllByProps({accessibilityLabel:'Use cropped group picture'})).toHaveLength(0);
  await act(async () => tree.root.findByProps({accessibilityLabel:'Done cropping group picture'}).props.onPress());
}

test.each(['android', 'ios'] as const)('opens the direct photo chooser and saves without entering Group Settings on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({canceled:false,assets:[{uri:'file:///photo.jpg',width:800,height:600,mimeType:'image/jpeg'}]});
  jest.mocked(changeGroupPhoto).mockResolvedValueOnce('https://example.com/new.jpg');
  const onBack = jest.fn(); const onUpdated = jest.fn(); let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<GroupProfileScreen details={details} canEdit canEditDescription={false} canRemovePhoto={false} photoOnly onBack={onBack} onUpdated={onUpdated}/>);});
  try {
    await act(async () => tree!.root.findAllByType(Modal)[0].props.onShow());
    expect(tree!.root.findAllByProps({accessibilityLabel:'Group Name'})).toHaveLength(0);
    expect(tree!.root.findAllByProps({children:'Group Settings'})).toHaveLength(0);
    expect(tree!.root.findAllByProps({accessibilityLabel:'Remove Profile Picture'})).toHaveLength(0);
    await act(async () => tree!.root.findAllByProps({accessibilityLabel:'Gallery'})[0].props.onPress());
    await cropAndUseGroupPicture(tree!);
    await act(async () => tree!.root.findAllByProps({accessibilityLabel:'Save Changes'})[0].props.onPress());
    expect(changeGroupPhoto).toHaveBeenCalledWith('g1',expect.objectContaining({mimeType:'image/jpeg'}));
    expect(updateGroupInfo).not.toHaveBeenCalled();
    expect(onUpdated).toHaveBeenCalledWith({...details,photo:'https://example.com/new.jpg'});
    expect(onBack).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => tree!.unmount());
    os.restore();
  }
});

test('lets a member submit a name change and preserves it when the backend denies permission', async () => {
  jest.mocked(updateGroupInfo).mockRejectedValueOnce(new Error('Only super admin and admin can update group'));
  const onUpdated = jest.fn(); const onBack = jest.fn(); let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<GroupProfileScreen details={details} canEdit canEditDescription={false} canRemovePhoto={false} onBack={onBack} onUpdated={onUpdated}/>);});
  const control = (label: string) => tree!.root.findAllByProps({accessibilityLabel:label})[0];
  expect(control('Group Name').props.editable).toBe(true);
  expect(control('Description').props.editable).toBe(false);
  await act(async () => control('Group Name').props.onChangeText('Members Team'));
  await act(async () => control('Save Changes').props.onPress());
  expect(updateGroupInfo).toHaveBeenCalledWith('g1','Members Team','Sprint');
  expect(onUpdated).not.toHaveBeenCalled();
  expect(onBack).not.toHaveBeenCalled();
  expect(control('Group Name').props.value).toBe('Members Team');
  expect(JSON.stringify(tree!.toJSON())).toContain('Only super admin and admin can update group');
  await act(async () => tree!.unmount());
});
test('saves profile details and publishes the server result', async () => {
  const onUpdated = jest.fn(); const onBack = jest.fn(); let tree: renderer.ReactTestRenderer;
  jest.mocked(updateGroupInfo).mockResolvedValue({name:'New Team',description:'Sprint'});
  await act(async () => {tree = renderer.create(<GroupProfileScreen details={details} canEdit onBack={onBack} onUpdated={onUpdated}/>);});
  await act(async () => tree!.root.findAllByProps({accessibilityLabel:'Group Name'})[0].props.onChangeText('New Team'));
  await act(async () => tree!.root.findAllByProps({accessibilityLabel:'Save Changes'})[0].props.onPress());
  expect(updateGroupInfo).toHaveBeenCalledWith('g1','New Team','Sprint');
  expect(onUpdated).toHaveBeenCalledWith({...details,name:'New Team'}); expect(onBack).toHaveBeenCalled();
  await act(async () => tree!.unmount());
});
test('read-only members can view the photo without editing controls', async () => {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<GroupProfileScreen details={details} canEdit={false} onBack={jest.fn()} onUpdated={jest.fn()}/>);});
  expect(tree!.root.findAllByProps({accessibilityLabel:'Change group picture'})).toHaveLength(0);
  expect(tree!.root.findAllByProps({accessibilityLabel:'Save Changes'})).toHaveLength(0);
  expect(tree!.root.findAllByProps({accessibilityLabel:'Group Name'})[0].props.editable).toBe(false);
  await act(async () => tree!.root.findAllByProps({accessibilityLabel:'View group picture'})[0].props.onPress());
  expect(tree!.root.findAllByProps({accessibilityLabel:'Back from group picture'}).length).toBeGreaterThan(0);
  await act(async () => tree!.unmount());
});
test('camera cancellation does not upload or change the profile', async () => {
  const onUpdated = jest.fn(); let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<GroupProfileScreen details={details} canEdit onBack={jest.fn()} onUpdated={onUpdated}/>);});
  await act(async () => tree!.root.findAllByProps({accessibilityLabel:'Change group picture'})[0].props.onPress());
  await act(async () => tree!.root.findAllByProps({accessibilityLabel:'Camera'})[0].props.onPress());
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
  expect(changeGroupPhoto).not.toHaveBeenCalled(); expect(onUpdated).not.toHaveBeenCalled();
  await act(async () => tree!.unmount());
});

test.each(['Gallery', 'Camera'])('%s previews a prepared photo without uploading until Save Changes', async source => {
  const selection = {uri:'content://photos/selected', width:4000, height:3000, mimeType:'image/jpeg', fileName:'photo.jpg'};
  const picker = source === 'Gallery' ? ImagePicker.launchImageLibraryAsync : ImagePicker.launchCameraAsync;
  jest.mocked(picker).mockResolvedValueOnce({canceled:false, assets:[selection]});
  jest.mocked(changeGroupPhoto).mockResolvedValueOnce('https://example.com/new.jpg');
  const onUpdated = jest.fn(); const onBack = jest.fn(); const onTimelineMessage = jest.fn(); let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<GroupProfileScreen details={details} canEdit onBack={onBack} onTimelineMessage={onTimelineMessage} onUpdated={onUpdated}/>);});
  const control = (label: string) => tree!.root.findAllByProps({accessibilityLabel:label})[0];
  await act(async () => control('Change group picture').props.onPress());
  await act(async () => control(source).props.onPress());
  expect(picker).toHaveBeenCalledWith(expect.objectContaining(source === 'Gallery' ? {mediaTypes:['images'],quality:1,selectionLimit:1} : {mediaTypes:['images'],quality:1,cameraType:ImagePicker.CameraType.front}));
  expect(changeGroupPhoto).not.toHaveBeenCalled(); expect(onUpdated).not.toHaveBeenCalled();
  await cropAndUseGroupPicture(tree!);
  expect(tree!.root.findAll(node => node.props.source?.uri === 'file:///cache/profile-normalized.jpg').length).toBeGreaterThan(0);
  expect(control('Save Changes').props.disabled).toBe(false);
  await act(async () => control('Save Changes').props.onPress());
  expect(changeGroupPhoto).toHaveBeenCalledWith('g1',expect.objectContaining({uri:'file:///cache/profile-normalized.jpg',mimeType:'image/jpeg'}));
  expect(updateGroupInfo).not.toHaveBeenCalled();
  expect(onUpdated).toHaveBeenCalledWith({...details,photo:'https://example.com/new.jpg'});
  expect(sendGroupTimelineNotice).toHaveBeenCalledWith('g1','New group photo added.');
  expect(onTimelineMessage).toHaveBeenCalledWith(expect.objectContaining({text:'New group photo added.',status:'pending',systemEvent:true}));
  expect(onTimelineMessage).toHaveBeenLastCalledWith(expect.objectContaining({id:'photo-notice',systemEvent:true}));
  expect(onBack).toHaveBeenCalled();
  await act(async () => tree!.unmount());
});

test('keeps the selected photo available for retry after a failed upload', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({canceled:false,assets:[{uri:'file:///photo.jpg',width:800,height:600,mimeType:'image/jpeg'}]});
  jest.mocked(changeGroupPhoto).mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce('https://example.com/retry.jpg');
  const onBack = jest.fn(); const onUpdated = jest.fn(); let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<GroupProfileScreen details={details} canEdit onBack={onBack} onUpdated={onUpdated}/>);});
  const control = (label: string) => tree!.root.findAllByProps({accessibilityLabel:label})[0];
  await act(async () => control('Change group picture').props.onPress());
  await act(async () => control('Gallery').props.onPress());
  await cropAndUseGroupPicture(tree!);
  await act(async () => control('Save Changes').props.onPress());
  expect(onBack).not.toHaveBeenCalled(); expect(onUpdated).not.toHaveBeenCalled();
  expect(control('Save Changes').props.disabled).toBe(false);
  expect(tree!.root.findAll(node => node.props.source?.uri === 'file:///cache/profile-normalized.jpg').length).toBeGreaterThan(0);
  await act(async () => control('Save Changes').props.onPress());
  expect(changeGroupPhoto).toHaveBeenCalledTimes(2);
  expect(onBack).toHaveBeenCalledTimes(1);
  await act(async () => tree!.unmount());
});

test('defers photo removal until Save Changes', async () => {
  const {removeGroupPhoto} = require('../src/services/groupApi');
  const onUpdated = jest.fn(); const onTimelineMessage = jest.fn(); let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<GroupProfileScreen details={details} canEdit onBack={jest.fn()} onTimelineMessage={onTimelineMessage} onUpdated={onUpdated}/>);});
  const control = (label: string) => tree!.root.findAllByProps({accessibilityLabel:label})[0];
  await act(async () => control('Change group picture').props.onPress());
  await act(async () => control('Remove Profile Picture').props.onPress());
  expect(removeGroupPhoto).not.toHaveBeenCalled(); expect(onUpdated).not.toHaveBeenCalled();
  await act(async () => control('Save Changes').props.onPress());
  expect(removeGroupPhoto).toHaveBeenCalledWith('g1');
  expect(onUpdated).toHaveBeenCalledWith({...details,photo:null});
  expect(sendGroupTimelineNotice).toHaveBeenCalledWith('g1','Group photo removed.');
  expect(onTimelineMessage).toHaveBeenCalledWith(expect.objectContaining({text:'Group photo removed.',status:'pending',systemEvent:true}));
  expect(onTimelineMessage).toHaveBeenLastCalledWith(expect.objectContaining({id:'photo-notice',systemEvent:true}));
  await act(async () => tree!.unmount());
});

test('does not reupload a saved photo when retrying failed text changes', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({canceled:false,assets:[{uri:'file:///photo.jpg',width:800,height:600,mimeType:'image/jpeg'}]});
  jest.mocked(changeGroupPhoto).mockResolvedValueOnce('https://example.com/saved.jpg');
  jest.mocked(updateGroupInfo).mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({name:'Updated',description:'Sprint'});
  const onBack = jest.fn(); let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<GroupProfileScreen details={details} canEdit onBack={onBack} onUpdated={jest.fn()}/>);});
  const control = (label: string) => tree!.root.findAllByProps({accessibilityLabel:label})[0];
  await act(async () => control('Group Name').props.onChangeText('Updated'));
  await act(async () => control('Change group picture').props.onPress());
  await act(async () => control('Gallery').props.onPress());
  await cropAndUseGroupPicture(tree!);
  await act(async () => control('Save Changes').props.onPress());
  expect(onBack).not.toHaveBeenCalled();
  await act(async () => control('Save Changes').props.onPress());
  expect(changeGroupPhoto).toHaveBeenCalledTimes(1);
  expect(updateGroupInfo).toHaveBeenCalledTimes(2);
  expect(onBack).toHaveBeenCalledTimes(1);
  await act(async () => tree!.unmount());
});
