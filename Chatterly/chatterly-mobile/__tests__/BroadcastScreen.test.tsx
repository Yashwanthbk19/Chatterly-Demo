import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import * as Contacts from 'expo-contacts';
import * as DocumentPicker from 'expo-document-picker';
import {Image, KeyboardAvoidingView, Modal, Platform, Text} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {BroadcastScreen} from '../src/screens/BroadcastScreen';
import {MediaAttachmentFlow} from '../src/components/MediaAttachmentFlow';
import {SingleCheckIcon} from '../src/components/ChatIcons';
import {
  addBroadcastMember,
  deleteBroadcast,
  getBroadcastDetails,
  getBroadcastMessages,
  removeBroadcastMember,
  saveBroadcastMessage,
  sendBroadcastMessage,
  type BroadcastList,
} from '../src/services/broadcastApi';
import {searchChatContacts, sendChatFile, sendChatMedia} from '../src/services/chatApi';
import {openDownloadedDocument} from '../src/services/documentViewer';

jest.mock('../src/services/broadcastApi', () => ({
  addBroadcastMember: jest.fn(),
  deleteBroadcast: jest.fn(),
  getBroadcastDetails: jest.fn(),
  getBroadcastMessages: jest.fn(),
  removeBroadcastMember: jest.fn(),
  saveBroadcastMessage: jest.fn(),
  sendBroadcastMessage: jest.fn(),
}));
jest.mock('../src/services/chatApi', () => ({
  locationMessage: jest.fn(),
  searchChatContacts: jest.fn(),
  sendChatFile: jest.fn(),
  sendChatMedia: jest.fn(),
}));
jest.mock('../src/services/mediaCompression', () => ({compressChatMedia: jest.fn(async media => media)}));
jest.mock('../src/services/documentViewer', () => ({openDownloadedDocument: jest.fn()}));

const original = {_id: 'broadcast-1', name: 'Team Updates', participants: [
  {_id: 'user-rahul', name: 'Rahul', profilePic: null},
  {_id: 'user-meena', name: 'Meena', profilePic: null},
]};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(getBroadcastDetails).mockResolvedValue(original);
  jest.mocked(searchChatContacts).mockResolvedValue([]);
  jest.mocked(sendChatFile).mockResolvedValue({} as never);
  jest.mocked(sendChatMedia).mockResolvedValue({} as never);
  jest.mocked(openDownloadedDocument).mockResolvedValue(undefined);
  jest.mocked(addBroadcastMember).mockResolvedValue(undefined);
  jest.mocked(deleteBroadcast).mockResolvedValue(undefined);
  jest.mocked(getBroadcastMessages).mockResolvedValue([]);
  jest.mocked(removeBroadcastMember).mockResolvedValue(undefined);
  jest.mocked(saveBroadcastMessage).mockResolvedValue(undefined);
  jest.mocked(sendBroadcastMessage).mockResolvedValue({totalRecipients: 2, messagesCreated: 2});
});

afterEach(() => jest.useRealTimers());

async function renderScreen(onUpdated = jest.fn(), onBack = jest.fn(), broadcast: BroadcastList = original) {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}}}>
        <BroadcastScreen broadcast={broadcast} onBack={onBack} onUpdated={onUpdated}/>
      </SafeAreaProvider>,
    );
  });
  return renderer!;
}

test.each(['android', 'ios'] as const)('uses the default broadcast icon instead of a member photo in the header and info on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  const broadcast = {...original, imageUri: null, participants: original.participants.map(member => ({...member, profilePic: `https://cdn.test/${member._id}.jpg`}))};
  jest.mocked(getBroadcastDetails).mockResolvedValue(broadcast);
  const renderer = await renderScreen(jest.fn(), jest.fn(), broadcast);
  try {
    expect(renderer.root.findByProps({accessibilityLabel: 'Default broadcast icon'})).toBeDefined();
    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast options'}).props.onPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast Info'}).props.onPress());
    expect(renderer.root.findByProps({accessibilityLabel: 'Default broadcast icon'})).toBeDefined();
    // Member photos still belong to their individual participant rows.
    expect(renderer.root.findAllByType(Image).map(node => node.props.source.uri)).toEqual(broadcast.participants.map(member => member.profilePic));
  } finally {
    ReactTestRenderer.act(() => renderer.unmount());
    os.restore();
  }
});

test.each(['android', 'ios'] as const)('preserves an explicitly selected broadcast photo in the header and info on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  const broadcast = {...original, imageUri: 'file:///broadcast-photo.jpg'};
  jest.mocked(getBroadcastDetails).mockResolvedValue(broadcast);
  const renderer = await renderScreen(jest.fn(), jest.fn(), broadcast);
  try {
    const label = `${broadcast.name} broadcast picture`;
    expect(renderer.root.findByProps({accessibilityLabel: label}).props.source.uri).toBe(broadcast.imageUri);
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast options'}).props.onPress());
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast Info'}).props.onPress());
    expect(renderer.root.findByProps({accessibilityLabel: label}).props.source.uri).toBe(broadcast.imageUri);
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Default broadcast icon'})).toHaveLength(0);
  } finally {
    ReactTestRenderer.act(() => renderer.unmount());
    os.restore();
  }
});

test('sends one-way messages and explains that replies are private', async () => {
  const renderer = await renderScreen();
  expect(renderer.root.findByType(KeyboardAvoidingView).props).toEqual(expect.objectContaining({behavior: 'padding', enabled: true}));
  expect(JSON.stringify(renderer.toJSON())).toContain('Your conversation is private');
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast message'}).props.onChangeText('Daily update'));
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Send Broadcast'}).props.onPress());
  expect(sendBroadcastMessage).toHaveBeenCalledWith('broadcast-1', 'Daily update');
  expect(saveBroadcastMessage).toHaveBeenCalledWith('broadcast-1', expect.objectContaining({text: 'Daily update', recipients: 2}));
  const bubble = renderer.root.findByProps({accessibilityLabel: 'Broadcast sent to 2 contacts'});
  expect(bubble.findAllByType(SingleCheckIcon)).toHaveLength(1);
  expect(bubble.findAllByType(Text).map(node => node.props.children)).toEqual([
    'Daily update', expect.any(String),
  ]);
  expect(bubble.findAllByType(Text).some(node => /sent to/i.test(String(node.props.children)))).toBe(false);
  const conversation = JSON.stringify(renderer.toJSON());
  expect(conversation.indexOf('Your conversation is private')).toBeLessThan(conversation.indexOf('Daily update'));
});

test.each(['android', 'ios'] as const)('opens the full emoji picker and attachment tray from the broadcast composer on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Add emoji'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Emoji picker'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Add emoji'}).props.accessibilityState).toEqual({expanded: true});
  expect(renderer.root.findByProps({accessibilityLabel: 'Broadcast message'}).props.value).toBe('');

  await ReactTestRenderer.act(async () => renderer.root.findAllByProps({accessibilityLabel: 'Add 💡'})[0].props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Broadcast message'}).props.value).toBe('💡');
  expect(renderer.root.findByProps({accessibilityLabel: 'Emoji picker'})).toBeDefined();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Attach broadcast media'}).props.onPress());
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Emoji picker'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Attachment options'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Attach broadcast media'}).props.accessibilityState).toEqual({expanded: true});
  expect(renderer.root.findByType(MediaAttachmentFlow).props.requestRecentsPermissionOnOpen).toBe(false);
  } finally { os.restore(); }
});

test.each(['android', 'ios'] as const)('toggles the broadcast emoji picker without inserting text and closes it on composer focus on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  try {
    const renderer = await renderScreen();
    const input = () => renderer.root.findByProps({accessibilityLabel: 'Broadcast message'});
    const toggle = () => renderer.root.findByProps({accessibilityLabel: 'Add emoji'}).props.onPress();
    await ReactTestRenderer.act(async () => input().props.onChangeText('Hello there'));
    await ReactTestRenderer.act(async () => toggle());
    expect(renderer.root.findByProps({accessibilityLabel: 'Emoji picker'})).toBeDefined();
    expect(input().props.value).toBe('Hello there');
    await ReactTestRenderer.act(async () => input().props.onSelectionChange({nativeEvent: {selection: {start: 5, end: 5}}}));
    await ReactTestRenderer.act(async () => renderer.root.findAllByProps({accessibilityLabel: 'Add 💡'})[0].props.onPress());
    expect(input().props.value).toBe('Hello💡 there');
    expect(renderer.root.findByProps({accessibilityLabel: 'Emoji picker'})).toBeDefined();
    await ReactTestRenderer.act(async () => toggle());
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Emoji picker'})).toHaveLength(0);
    await ReactTestRenderer.act(async () => toggle());
    expect(input().props.value).toBe('Hello💡 there');
    await ReactTestRenderer.act(async () => input().props.onFocus());
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Emoji picker'})).toHaveLength(0);
  } finally { os.restore(); }
});

test('delivers selected broadcast media privately to every recipient', async () => {
  const renderer = await renderScreen();
  const flow = renderer.root.findByType(MediaAttachmentFlow);
  const media = {id: 'photo-1', uri: 'file:///photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg', type: 'image' as const};

  let sent = false;
  await ReactTestRenderer.act(async () => { sent = await flow.props.onSend([media], 'Launch update', false); });

  expect(sent).toBe(true);
  expect(sendChatMedia).toHaveBeenCalledTimes(2);
  expect(sendChatMedia).toHaveBeenNthCalledWith(1, 'user-rahul', expect.objectContaining({name: 'photo.jpg'}), expect.objectContaining({caption: 'Launch update'}));
  expect(sendChatMedia).toHaveBeenNthCalledWith(2, 'user-meena', expect.objectContaining({name: 'photo.jpg'}), expect.objectContaining({caption: 'Launch update'}));
});

test('sends a selected broadcast document through the file endpoint for every recipient', async () => {
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{uri: 'file:///cache/quarterly-report.pdf', name: 'quarterly-report.pdf', mimeType: 'application/pdf', size: 2400000}],
  } as never);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(MediaAttachmentFlow).props.onDocument();
  });

  expect(sendChatFile).toHaveBeenCalledTimes(2);
  expect(sendChatFile).toHaveBeenNthCalledWith(1, 'user-rahul', expect.objectContaining({
    name: 'quarterly-report.pdf', type: 'application/pdf',
  }), expect.objectContaining({onUploadProgress: expect.any(Function)}));
  expect(sendChatFile).toHaveBeenNthCalledWith(2, 'user-meena', expect.objectContaining({
    name: 'quarterly-report.pdf', type: 'application/pdf',
  }), expect.objectContaining({onUploadProgress: expect.any(Function)}));
  expect(sendChatMedia).not.toHaveBeenCalled();
  expect(saveBroadcastMessage).toHaveBeenCalledWith('broadcast-1', expect.objectContaining({
    text: 'Sent quarterly-report.pdf',
    recipients: 2,
    fileName: 'quarterly-report.pdf',
    fileType: 'application/pdf',
    fileSize: 2400000,
    fileUri: expect.stringMatching(/^file:\/\/\/documents\/broadcast-.*quarterly-report\.pdf$/),
  }));
  const document = renderer.root.findByProps({accessibilityLabel: 'Broadcast document quarterly-report.pdf'});
  await ReactTestRenderer.act(async () => document.props.onPress());
  expect(openDownloadedDocument).toHaveBeenCalledWith(
    expect.stringMatching(/^file:\/\/\/documents\/broadcast-.*quarterly-report\.pdf$/),
    'application/pdf',
    'quarterly-report.pdf',
  );
  expect(renderer.root.findByProps({children: 'PDF document'})).toBeDefined();
  expect(renderer.root.findAllByProps({children: 'Sent quarterly-report.pdf'})).toHaveLength(0);
});

test('records and sends a broadcast voice message privately to every recipient', async () => {
  const audio = require('expo-audio');
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Record broadcast voice message'}).props.onPress());
  expect(audio.requestRecordingPermissionsAsync).toHaveBeenCalled();
  expect(audio.__recorder.record).toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Stop and send broadcast voice message'})).toBeDefined();

  await ReactTestRenderer.act(async () => { await jest.advanceTimersByTimeAsync(1200); });
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Stop and send broadcast voice message'}).props.onPress());

  expect(audio.__recorder.stop).toHaveBeenCalled();
  expect(sendChatMedia).toHaveBeenCalledTimes(2);
  expect(sendChatMedia).toHaveBeenNthCalledWith(1, 'user-rahul', expect.objectContaining({uri: 'file:///voice.m4a', type: expect.stringMatching(/^audio\/(aac|wav)$/)}), expect.objectContaining({duration: expect.any(Number), waveform: expect.any(Array)}));
  expect(sendChatMedia).toHaveBeenNthCalledWith(2, 'user-meena', expect.any(Object), expect.objectContaining({duration: expect.any(Number)}));
  expect(saveBroadcastMessage).toHaveBeenCalledWith('broadcast-1', expect.objectContaining({text: expect.stringContaining('Voice message'), recipients: 2}));
});

test('restores sent messages when the same broadcast is reopened', async () => {
  jest.mocked(getBroadcastMessages).mockResolvedValueOnce([{
    id: 'broadcast-1-message-1',
    text: 'Sent roadmap.pdf',
    createdAt: '2026-09-24T06:30:00.000Z',
    recipients: 2,
    fileName: 'roadmap.pdf',
    fileType: 'application/pdf',
    fileSize: 1024,
    fileUri: 'file:///documents/roadmap.pdf',
  }]);

  const renderer = await renderScreen();

  expect(renderer.root.findByProps({accessibilityLabel: 'Broadcast document roadmap.pdf'})).toBeDefined();
  expect(renderer.root.findByProps({children: 'PDF document'})).toBeDefined();
  expect(renderer.root.findAllByProps({children: 'Sent roadmap.pdf'})).toHaveLength(0);
  const bubble = renderer.root.findByProps({accessibilityLabel: 'Broadcast sent to 2 contacts'});
  expect(bubble.findAllByType(SingleCheckIcon)).toHaveLength(1);
  expect(bubble.findAllByType(Text).some(node => /sent to/i.test(String(node.props.children)))).toBe(false);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast document roadmap.pdf'}).props.onPress());
  expect(openDownloadedDocument).toHaveBeenCalledWith('file:///documents/roadmap.pdf', 'application/pdf', 'roadmap.pdf');
});

test('searches, multi-selects and saves edits to a broadcast list', async () => {
  const updated = {...original, participants: [...original.participants, {_id: 'user-priya', name: 'Priya', profilePic: null}]};
  jest.mocked(getBroadcastDetails).mockResolvedValueOnce(original).mockResolvedValueOnce(updated);
  jest.mocked(searchChatContacts).mockResolvedValue([{userId: 'user-priya', name: 'Priya', thumbnail: null}]);
  const onUpdated = jest.fn();
  const renderer = await renderScreen(onUpdated);
  expect(renderer.root.findAllByProps({children: '2 Members'}).length).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast options'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Broadcast options menu'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Broadcast Info'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Broadcast Media'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Delete Broadcast'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Add Members'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Search broadcast contacts'}).props.onChangeText('Priya'));
  await ReactTestRenderer.act(async () => { await jest.advanceTimersByTimeAsync(251); });
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Select Priya'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Save Broadcast Members'}).props.onPress());
  expect(addBroadcastMember).toHaveBeenCalledWith('broadcast-1', 'user-priya');
  expect(removeBroadcastMember).not.toHaveBeenCalled();
  expect(onUpdated).toHaveBeenCalledWith(updated);
  expect(renderer.root.findAllByProps({children: '3 Members'}).length).toBeGreaterThan(0);
});

test('removes a member directly from broadcast info through the documented endpoint', async () => {
  const broadcast = {...original, participants: [...original.participants, {_id: 'user-priya', name: 'Priya', profilePic: null}]};
  const updated = {...broadcast, participants: broadcast.participants.filter(member => member._id !== 'user-priya')};
  jest.mocked(getBroadcastDetails).mockResolvedValueOnce(broadcast).mockResolvedValueOnce(updated);
  const onUpdated = jest.fn();
  const renderer = await renderScreen(onUpdated, jest.fn(), broadcast);

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast options'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast Info'}).props.onPress());
  expect(renderer.root.findByProps({accessibilityLabel: 'Remove Priya from broadcast'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Remove Priya from broadcast'}).props.onPress());

  expect(removeBroadcastMember).toHaveBeenCalledWith('broadcast-1', 'user-priya');
  expect(onUpdated).toHaveBeenLastCalledWith(updated);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Remove Priya from broadcast'})).toHaveLength(0);
  expect(renderer.root.findByProps({children: '2 Members'})).toBeDefined();
});

test('shares a selected contact privately with every broadcast recipient', async () => {
  jest.mocked(Contacts.getPermissionsAsync).mockResolvedValue({granted: true} as never);
  jest.mocked(Contacts.Contact.getAllDetails).mockResolvedValue([{
    id: 'local-ada',
    fullName: 'Ada Lovelace',
    phones: [{number: '+44 20 1234 5678'}],
    emails: [{address: 'ada@example.test'}],
  }] as never);
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => renderer.root.findByType(MediaAttachmentFlow).props.onContact());
  expect(renderer.root.findByProps({accessibilityLabel: 'Share Ada Lovelace'})).toBeDefined();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Share Ada Lovelace'}).props.onPress());

  expect(sendChatFile).toHaveBeenCalledTimes(2);
  expect(sendChatFile).toHaveBeenNthCalledWith(1, 'user-rahul', expect.objectContaining({name: 'Ada_Lovelace.vcf', type: 'text/vcard'}));
  expect(sendChatFile).toHaveBeenNthCalledWith(2, 'user-meena', expect.objectContaining({name: 'Ada_Lovelace.vcf', type: 'text/vcard'}));
  expect(saveBroadcastMessage).toHaveBeenCalledWith('broadcast-1', expect.objectContaining({
    text: "Shared Ada Lovelace's contact",
    recipients: 2,
    fileName: 'Ada_Lovelace.vcf',
    fileType: 'text/vcard',
    fileSize: expect.any(Number),
    fileUri: expect.stringMatching(/^file:\/\/\/documents\/broadcast-.*Ada_Lovelace\.vcf$/),
  }));
  const contact = renderer.root.findByProps({accessibilityLabel: 'VCF contact Ada_Lovelace.vcf'});
  await ReactTestRenderer.act(async () => contact.props.onPress());
  expect(openDownloadedDocument).toHaveBeenCalledWith(
    expect.stringMatching(/^file:\/\/\/documents\/broadcast-.*Ada_Lovelace\.vcf$/),
    'text/vcard',
    'Ada_Lovelace.vcf',
  );
  expect(renderer.root.findByProps({children: 'VCF contact'})).toBeDefined();
  expect(renderer.root.findAllByProps({children: "Shared Ada Lovelace's contact"})).toHaveLength(0);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Share Ada Lovelace'})).toHaveLength(0);
});

test('shows the Figma delete confirmation over the still-visible options sheet', async () => {
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast options'}).props.onPress());
  const menu = JSON.stringify(renderer.toJSON());
  ['M46 39H52', 'M44 29H44.01', 'M47 28H47.01', 'M53 41L47 35', 'M36 27H52'].forEach(path => expect(menu).toContain(path));
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Delete Broadcast'}).props.onPress());

  expect(renderer.root.findByProps({accessibilityLabel: 'Broadcast options menu'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Delete Broadcast confirmation'})).toBeDefined();
  expect(renderer.root.findByProps({children: 'Delete this Broadcast?'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Confirm Delete Broadcast'})).toBeDefined();
  expect(renderer.root.findByProps({intensity: 24, tint: 'dark'})).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('M12 15H28M18 19V25M22 19V25');

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Cancel Delete Broadcast'}).props.onPress());
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Delete Broadcast confirmation'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Broadcast options menu'})).toBeDefined();
});

test('deletes the broadcast and returns to the broadcast list after confirmation', async () => {
  const onBack = jest.fn();
  const renderer = await renderScreen(jest.fn(), onBack);
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast options'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Delete Broadcast'}).props.onPress());
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Confirm Delete Broadcast'}).props.onPress());

  expect(deleteBroadcast).toHaveBeenCalledWith('broadcast-1');
  expect(onBack).toHaveBeenCalledTimes(1);
});

test.each(['ios', 'android'] as const)('keeps delete confirmation in the options modal on %s', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  const onBack = jest.fn();
  const renderer = await renderScreen(jest.fn(), onBack);
  try {
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Broadcast options'}).props.onPress());
    const modal = renderer.root.findAllByType(Modal).find(node => node.props.visible)!;
    await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Delete Broadcast'}).props.onPress());

    expect(renderer.root.findAllByType(Modal).filter(node => node.props.visible)).toEqual([modal]);
    expect(modal.findByProps({accessibilityLabel: 'Delete Broadcast confirmation'})).toBeDefined();
    expect(modal.findByProps({accessibilityLabel: 'Broadcast options menu'}).props.pointerEvents).toBe('none');

    await ReactTestRenderer.act(async () => modal.props.onRequestClose());
    expect(modal.findAllByProps({accessibilityLabel: 'Delete Broadcast confirmation'})).toHaveLength(0);
    expect(modal.findByProps({accessibilityLabel: 'Broadcast options menu'}).props.pointerEvents).toBe('auto');
    expect(deleteBroadcast).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => modal.findByProps({accessibilityLabel: 'Delete Broadcast'}).props.onPress());
    await ReactTestRenderer.act(async () => modal.findByProps({accessibilityLabel: 'Confirm Delete Broadcast'}).props.onPress());
    expect(deleteBroadcast).toHaveBeenCalledWith('broadcast-1');
    expect(onBack).toHaveBeenCalledTimes(1);
  } finally {
    ReactTestRenderer.act(() => renderer.unmount());
    os.restore();
  }
});
