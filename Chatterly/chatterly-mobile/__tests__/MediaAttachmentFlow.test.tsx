import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import * as ImageManipulatorModule from 'expo-image-manipulator';
import {Image, KeyboardAvoidingView, PermissionsAndroid, Platform} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DeviceMediaLibrary from 'expo-media-library';
import * as MediaLibrary from 'expo-media-library/legacy';
import {HdMediaIcon} from '../src/components/AttachmentIcons';
import {MediaAttachmentFlow} from '../src/components/MediaAttachmentFlow';
import type {AttachmentMedia} from '../src/types/media';

const assets = [
  {id: 'photo-1', filename: 'Vacation.jpg', uri: 'file:///Vacation.jpg', mediaType: 'photo', width: 1200, height: 800, creationTime: 2, modificationTime: 2, duration: 0},
  {id: 'video-1', filename: 'Office.mp4', uri: 'file:///Office.mp4', mediaType: 'video', width: 1280, height: 720, creationTime: 1, modificationTime: 1, duration: 12},
] as MediaLibrary.Asset[];
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderFlow(onSend = jest.fn(async () => true), initialMedia?: AttachmentMedia[], requestRecentsPermissionOnOpen = true) {
  const onNotice = jest.fn();
  const renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:307,height:641},insets:{top:24,right:0,bottom:18,left:0}}}>
    <MediaAttachmentFlow initialMedia={initialMedia} onClose={jest.fn()} onContact={jest.fn()} onDocument={jest.fn()} onLocation={jest.fn()} onNotice={onNotice} onSend={onSend} recipientName={'Ananya'} requestRecentsPermissionOnOpen={requestRecentsPermissionOnOpen} transfer={{phase:'idle',progress:0,current:0,total:0}} visible />
  </SafeAreaProvider>);
  mountedRenderers.push(renderer);
  return {renderer, onNotice, onSend};
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(MediaLibrary.getPermissionsAsync).mockResolvedValue({granted:true, accessPrivileges: 'all'} as never);
  jest.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValue({granted:true} as never);
  (DeviceMediaLibrary as unknown as {__queryExecute: jest.Mock}).__queryExecute.mockResolvedValue([]);
  jest.mocked(MediaLibrary.getAssetsAsync).mockResolvedValue({assets,endCursor:'',hasNextPage:false,totalCount:2});
  jest.mocked(MediaLibrary.getAssetInfoAsync).mockImplementation(async assetRef => {
    const asset = assetRef as MediaLibrary.Asset;
    return {...asset, localUri: asset.uri} as never;
  });
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
    [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE]: PermissionsAndroid.RESULTS.GRANTED,
    [PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE]: PermissionsAndroid.RESULTS.GRANTED,
    [PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES]: PermissionsAndroid.RESULTS.GRANTED,
    [PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO]: PermissionsAndroid.RESULTS.GRANTED,
  } as never);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({canceled:true,assets:[]} as never);
});

afterEach(() => {
  ReactTestRenderer.act(() => mountedRenderers.splice(0).forEach(renderer => renderer.unmount()));
});

test('previews incoming gallery media and sends only after the user taps Send', async () => {
  const media: AttachmentMedia[] = [{id: 'shared-gif', uri: 'file:///cache/dance.gif', fileName: 'dance.gif', mimeType: 'image/gif', type: 'image'}];
  let flow!: ReturnType<typeof renderFlow>;
  await ReactTestRenderer.act(async () => { flow = renderFlow(jest.fn(async () => true), media); });
  expect(flow.renderer.root.findByProps({accessibilityLabel: 'Selected image preview'}).props.source.uri).toBe(media[0].uri);
  expect(flow.onSend).not.toHaveBeenCalled();
  expect(MediaLibrary.requestPermissionsAsync).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    await flow.renderer.root.findByProps({accessibilityLabel: 'Send selected media'}).props.onPress();
  });
  expect(flow.onSend).toHaveBeenCalledWith(media, '', false);
});

test('adding more media retains the incoming gallery selection', async () => {
  const media: AttachmentMedia[] = [{id: 'shared-gif', uri: 'file:///cache/dance.gif', fileName: 'dance.gif', mimeType: 'image/gif', type: 'image'}];
  let flow!: ReturnType<typeof renderFlow>;
  await ReactTestRenderer.act(async () => { flow = renderFlow(jest.fn(async () => true), media); });
  const press = async (accessibilityLabel: string) => {
    await ReactTestRenderer.act(async () => {
      await flow.renderer.root.findByProps({accessibilityLabel}).props.onPress();
    });
  };
  await press('Add more media');
  await press('Select Vacation.jpg');
  await press('Preview selected media');
  await press('Send selected media');
  expect(flow.onSend).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({id: 'shared-gif', mimeType: 'image/gif', uri: media[0].uri}),
    expect.objectContaining({id: 'photo-1'}),
  ]), '', false);
});

test('sends a GIF from Recents with its original file and GIF MIME type', async () => {
  const gif = {...assets[0], id: 'gif-1', filename: 'Dancing.GIF', uri: 'file:///Dancing.GIF'};
  jest.mocked(MediaLibrary.getAssetsAsync).mockResolvedValueOnce({
    assets: [gif], endCursor: '', hasNextPage: false, totalCount: 1,
  });
  let flow!: ReturnType<typeof renderFlow>;
  await ReactTestRenderer.act(async () => { flow = renderFlow(); });
  const press = async (accessibilityLabel: string) => {
    await ReactTestRenderer.act(async () => {
      await flow.renderer.root.findByProps({accessibilityLabel}).props.onPress();
    });
  };
  await press('Gallery');
  await press('Select Dancing.GIF');
  await press('Preview selected media');
  await press('Send selected media');

  expect(flow.onSend).toHaveBeenCalledWith([
    expect.objectContaining({uri: gif.uri, fileName: gif.filename, mimeType: 'image/gif', type: 'image'}),
  ], '', false);
  expect(flow.onNotice).not.toHaveBeenCalled();
});

test('shows every attachment action and opens the in-app camera', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = renderFlow().renderer; });
  expect(renderer.root.findByProps({accessibilityLabel:'Camera'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Gallery'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Location'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Contact'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Document'})).toBeDefined();
  expect(renderer.root.findByProps({children:'Document'})).toBeDefined();
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel:'Camera'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel:'Take photo'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Switch camera'})).toBeDefined();
});

test('opens the attachment tray without requesting photo access when eager permission is disabled', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', {configurable: true, value: 'ios'});
  jest.mocked(MediaLibrary.getPermissionsAsync).mockResolvedValueOnce({granted: false, accessPrivileges: 'none'} as never);
  try {
    let flow!: ReturnType<typeof renderFlow>;
    await ReactTestRenderer.act(async () => { flow = renderFlow(jest.fn(async () => true), undefined, false); });

    expect(flow.renderer.root.findByProps({accessibilityLabel: 'Attachment options'})).toBeDefined();
    expect(MediaLibrary.getPermissionsAsync).toHaveBeenCalledWith(false, ['photo', 'video']);
    expect(MediaLibrary.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(MediaLibrary.getAssetsAsync).not.toHaveBeenCalled();
    expect(flow.onNotice).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: original});
  }
});

test.each(['ios', 'android'] as const)('shows selectable recent media below attachment menus immediately on %s', async platform => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', {configurable: true, value: platform});
  try {
    let flow!: ReturnType<typeof renderFlow>;
    await ReactTestRenderer.act(async () => { flow = renderFlow(); });
    if (platform === 'android') {
      expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(false, ['photo', 'video']);
      expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled();
    }
    const tray = flow.renderer.root.findByProps({accessibilityLabel: 'Attachment options'});
    const recents = tray.findByProps({accessibilityLabel: 'Recent media'});
    expect(recents.findByProps({accessibilityLabel: 'Select Vacation.jpg'}).findByType(Image).props.source.uri).toBe('file:///Vacation.jpg');
    expect(recents.findByProps({accessibilityLabel: 'Select Office.mp4'}).findByType(Image).props.source.uri).toBe('file:///Office.mp4');
    expect(MediaLibrary.getAssetsAsync).toHaveBeenCalledWith(expect.objectContaining({sortBy: [['creationTime', false]], mediaType: ['photo', 'video']}));
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => recents.findByProps({accessibilityLabel: 'Select Vacation.jpg'}).props.onPress());
    await ReactTestRenderer.act(async () => recents.findByProps({accessibilityLabel: 'Select Office.mp4'}).props.onPress());
    expect(recents.findByProps({children: 'Preview (2)'})).toBeDefined();
    expect(flow.onSend).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => { await recents.findByProps({accessibilityLabel: 'Preview selected media'}).props.onPress(); });
    expect(flow.renderer.root.findByProps({accessibilityLabel: 'Media preview editor'})).toBeDefined();
    await ReactTestRenderer.act(async () => { await flow.renderer.root.findByProps({accessibilityLabel: 'Send selected media'}).props.onPress(); });
    expect(flow.onSend).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({id: 'photo-1'}), expect.objectContaining({id: 'video-1'}),
    ]), '', false);
  } finally {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: original});
  }
});

test('loads actual Android Recents when native access is granted in an Expo Go runtime', async () => {
  const originalPlatform = Platform.OS;
  const originalExpo = Object.getOwnPropertyDescriptor(globalThis, 'expo');
  Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'});
  Object.defineProperty(globalThis, 'expo', {
    configurable: true, value: {modules: {ExpoGo: {}}},
  });
  jest.mocked(MediaLibrary.requestPermissionsAsync).mockRejectedValueOnce(new Error('Unavailable in Expo Go'));
  try {
    let flow!: ReturnType<typeof renderFlow>;
    await ReactTestRenderer.act(async () => { flow = renderFlow(); });
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(false, ['photo', 'video']);
    expect(PermissionsAndroid.requestMultiple).toHaveBeenCalled();
    expect(MediaLibrary.getAssetsAsync).toHaveBeenCalled();
    expect(flow.renderer.root.findByProps({accessibilityLabel: 'Select Vacation.jpg'})).toBeDefined();
    expect(flow.renderer.root.findAllByProps({children: 'Choose photos and videos from Gallery.'})).toHaveLength(0);
  } finally {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: originalPlatform});
    if (originalExpo) Object.defineProperty(globalThis, 'expo', originalExpo);
    else Reflect.deleteProperty(globalThis, 'expo');
  }
});

test('uses the supported SDK query when a native build does not expose the legacy Recents bridge', async () => {
  jest.mocked(MediaLibrary.getAssetsAsync).mockRejectedValueOnce(new Error('getAssetsAsync is unavailable'));
  (DeviceMediaLibrary as unknown as {__queryExecute: jest.Mock}).__queryExecute.mockResolvedValueOnce([
    {getInfo: jest.fn(async () => ({
      id: 'content://media/photo-44', filename: 'Device photo.jpg', uri: 'content://media/photo-44',
      mediaType: 'image', width: 1080, height: 1440, duration: null,
      creationTime: 44, modificationTime: 44, isFavorite: false,
    }))},
  ]);

  let flow!: ReturnType<typeof renderFlow>;
  await ReactTestRenderer.act(async () => { flow = renderFlow(); });

  const photo = flow.renderer.root.findByProps({accessibilityLabel: 'Select Device photo.jpg'});
  expect(photo.findByType(Image).props.source.uri).toBe('content://media/photo-44');
  expect(flow.renderer.root.findAllByProps({children: 'Choose photos and videos from Gallery.'})).toHaveLength(0);
});

test('shows an actionable fallback when photo access is denied', async () => {
  jest.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValue({granted: false} as never);
  let flow!: ReturnType<typeof renderFlow>;
  await ReactTestRenderer.act(async () => { flow = renderFlow(); });
  expect(flow.renderer.root.findByProps({accessibilityLabel: 'Choose photos and videos'})).toBeDefined();
  expect(MediaLibrary.getAssetsAsync).not.toHaveBeenCalled();
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { await flow.renderer.root.findByProps({accessibilityLabel: 'Choose photos and videos'}).props.onPress(); });
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
});

test('shows an empty Recents state when the device library has no media', async () => {
  jest.mocked(MediaLibrary.getAssetsAsync).mockResolvedValueOnce({assets: [], endCursor: '', hasNextPage: false, totalCount: 0});
  let flow!: ReturnType<typeof renderFlow>;
  await ReactTestRenderer.act(async () => { flow = renderFlow(); });
  expect(flow.renderer.root.findByProps({children: 'No photos or videos in Recents.'})).toBeDefined();
  expect(flow.renderer.root.findByProps({accessibilityLabel: 'View all recent media'})).toBeDefined();
});

test.each(['android', 'ios'] as const)('multi-selects Recents, keeps captions in keyboard avoidance, and sends both items on %s', async platform => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', {configurable: true, value: platform});
  try {
  const onSend = jest.fn(async () => true);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = renderFlow(onSend).renderer; });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel:'Gallery'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel:'Collapsed Recents gallery'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Drag gallery sheet'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel:'Add gallery caption'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel:'Select Vacation.jpg'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel:'Expanded Recents gallery'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'1 media selected'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Add gallery caption'})).toBeDefined();
  expect(renderer.root.findByType(KeyboardAvoidingView).findByProps({accessibilityLabel:'Add gallery caption'})).toBeDefined();
  expect(renderer.root.findByType(KeyboardAvoidingView).props.behavior).toBe(platform === 'ios' ? 'padding' : 'height');
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel:'Select Office.mp4'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel:'2 media selected'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Deselect Vacation.jpg'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Deselect Office.mp4'})).toBeDefined();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel:'Add gallery caption'}).props.onChangeText('Trip files'); });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel:'Edit selected media'}).props.onPress(); });
  expect(onSend).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel:'Media preview editor'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Add a caption'}).props.value).toBe('Trip files');
  expect(renderer.root.findByType(KeyboardAvoidingView).findByProps({accessibilityLabel:'Add a caption'})).toBeDefined();
  expect(renderer.root.findByProps({children:'Ananya'})).toBeDefined();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel:'Turn HD on'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel:'Send selected media'}).props.onPress(); });
  expect(onSend).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({id:'photo-1'}), expect.objectContaining({id:'video-1'})]), 'Trip files', true);
  } finally {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: original});
  }
});

test('expands and collapses Recents from its arrow control', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = renderFlow().renderer; });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel:'Gallery'}).props.onPress(); });

  expect(renderer.root.findByProps({accessibilityLabel:'Collapsed Recents gallery'})).toBeDefined();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel:'Expand Recents gallery'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel:'Expanded Recents gallery'})).toBeDefined();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel:'Collapse Recents gallery'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel:'Collapsed Recents gallery'})).toBeDefined();
});

test('falls back to the Android system Recents picker when Media Library access is unavailable', async () => {
  jest.mocked(MediaLibrary.requestPermissionsAsync).mockRejectedValueOnce(new Error(
    'Expo Go can no longer provide full access to the media library.',
  ));
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{
      assetId: 'android-photo-1', uri: 'content://picker/photo-1', fileName: 'Recent.jpg',
      type: 'image', mimeType: 'image/jpeg', width: 1080, height: 1440,
    }],
  } as never);

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  let onNotice!: jest.Mock;
  await ReactTestRenderer.act(async () => {
    const flow = renderFlow(); renderer = flow.renderer; onNotice = flow.onNotice;
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel:'Gallery'}).props.onPress();
  });

  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({
    allowsMultipleSelection: true, selectionLimit: 10, defaultTab: 'photos',
  }));
  expect(renderer.root.findByProps({accessibilityLabel:'Expanded Recents gallery'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Deselect Recent.jpg'})).toBeDefined();
  expect(onNotice).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel:'Edit selected media'}).props.onPress();
  });
  expect(renderer.root.findByProps({accessibilityLabel:'Media preview editor'})).toBeDefined();
});

const PHOTO: AttachmentMedia = {id: 'photo-1', uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg', type: 'image', width: 1200, height: 800};

test('HD starts off and looks off, and switching it is announced inside the editor', async () => {
  let flow!: ReturnType<typeof renderFlow>;
  await ReactTestRenderer.act(async () => { flow = renderFlow(jest.fn(async () => true), [PHOTO]); });
  const icon = () => flow.renderer.root.findByType(HdMediaIcon);

  expect(flow.renderer.root.findAllByProps({accessibilityLabel: 'Turn HD on'}).length).toBeGreaterThan(0);
  expect(icon().props.active).toBe(false);
  await ReactTestRenderer.act(async () => { flow.renderer.root.findByProps({accessibilityLabel: 'Turn HD on'}).props.onPress(); });

  expect(icon().props.active).toBe(true);
  expect(flow.renderer.root.findAllByProps({children: 'HD on: photos are sent in high quality.'}).length).toBeGreaterThan(0);
  // The chat's own notice bar is hidden behind this full-screen editor.
  expect(flow.onNotice).not.toHaveBeenCalled();
});

test('Crop opens a crop tool; the cropped photo replaces the preview and Undo brings the original back', async () => {
  const {__mock} = ImageManipulatorModule as unknown as {__mock: Record<string, jest.Mock>};
  let flow!: ReturnType<typeof renderFlow>;
  await ReactTestRenderer.act(async () => { flow = renderFlow(jest.fn(async () => true), [PHOTO]); });
  const root = () => flow.renderer.root;
  const press = (accessibilityLabel: string) => ReactTestRenderer.act(async () => {
    await root().findAllByProps({accessibilityLabel}).find(node => typeof node.props.onPress === 'function')!.props.onPress();
  });
  const previewUri = () => root().findByProps({accessibilityLabel: 'Selected image preview'}).props.source.uri;

  await press('Crop media');
  const editor = root().findByProps({accessibilityLabel: 'Crop editor'});
  const stage = editor.findAll(node => typeof node.props.onLayout === 'function')[0];
  await ReactTestRenderer.act(async () => stage.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 400, height: 344}}}));
  await press('Crop Square');
  await press('Apply crop');

  expect(__mock.crop).toHaveBeenCalledWith({originX: 200, originY: 0, width: 800, height: 800});
  expect(root().findAllByProps({accessibilityLabel: 'Crop editor'})).toHaveLength(0);
  expect(previewUri()).toBe('file:///cache/profile-normalized.jpg');

  await press('Undo last edit');
  expect(previewUri()).toBe(PHOTO.uri);
  expect(root().findAllByProps({accessibilityLabel: 'Undo last edit'})).toHaveLength(0);
});

test('photo-only tools explain themselves inside the editor when a video is selected', async () => {
  const video: AttachmentMedia = {id: 'video-1', uri: 'file:///cache/clip.mp4', fileName: 'clip.mp4', mimeType: 'video/mp4', type: 'video'};
  let flow!: ReturnType<typeof renderFlow>;
  await ReactTestRenderer.act(async () => { flow = renderFlow(jest.fn(async () => true), [video]); });

  await ReactTestRenderer.act(async () => { await flow.renderer.root.findByProps({accessibilityLabel: 'Crop media'}).props.onPress(); });

  expect(flow.renderer.root.findAllByProps({children: 'This edit is available for photos only.'}).length).toBeGreaterThan(0);
  expect(flow.renderer.root.findAllByProps({accessibilityLabel: 'Crop editor'})).toHaveLength(0);
  expect(flow.onNotice).not.toHaveBeenCalled();
});
