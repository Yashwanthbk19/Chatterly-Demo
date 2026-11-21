import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import {
  DocumentAttachmentScreen,
  normalizePickedDocument,
  SUPPORTED_AUDIO_FORMATS,
  SUPPORTED_DOCUMENT_FORMATS,
  SUPPORTED_PICKER_MIME_TYPES,
} from '../src/components/DocumentAttachmentScreen';
import {getChatFiles} from '../src/services/chatApi';

jest.mock('../src/services/chatApi', () => ({getChatFiles: jest.fn()}));

const mimeByName: Record<string, string> = {
  'report.pdf': 'application/pdf',
  'notes.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'budget.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'slides.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'archive.zip': 'application/zip',
  'readme.txt': 'text/plain',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getChatFiles).mockResolvedValue([]);
});

test('normalizes every requested document format and rejects formats outside the list', () => {
  expect(SUPPORTED_DOCUMENT_FORMATS).toEqual(['PDF', 'DOCX', 'XLSX', 'PPTX', 'ZIP', 'TXT']);
  Object.entries(mimeByName).forEach(([name, type]) => {
    expect(normalizePickedDocument({name, uri: `file:///${name}`, mimeType: 'application/octet-stream'} as never)).toEqual({
      name, uri: `file:///${name}`, type, size: undefined,
    });
  });
  expect(normalizePickedDocument({name: 'legacy.doc', uri: 'file:///legacy.doc'} as never)).toBeNull();
  expect(SUPPORTED_AUDIO_FORMATS).toEqual(['MP3', 'M4A', 'WAV']);
  expect(normalizePickedDocument({name: 'downloaded-song.mp3', uri: 'content://audio/song', mimeType: 'application/octet-stream'} as never)).toEqual({
    name: 'downloaded-song.mp3', uri: 'content://audio/song', type: 'audio/mpeg', size: undefined,
  });
});

test('shows the reference Files layout and uploads a supported document with progress', async () => {
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{name: 'budget.xlsx', uri: 'content://files/budget.xlsx', mimeType: 'application/octet-stream', size: 2400000}],
  } as never);
  const onSend = jest.fn(async (file, onProgress) => {
    onProgress(0.5);
    onProgress(1);
    return {id:'file-1',text:'',createdAt:'2026-08-27T10:17:00.000Z',isOwn:true,messageType:'file' as const,fileName:file.name,fileType:file.type,mediaSize:2400000};
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:307,height:641},insets:{top:24,right:0,bottom:18,left:0}}}>
      <DocumentAttachmentScreen chatId={'chat-1'} onBack={jest.fn()} onChooseGallery={jest.fn()} onNotice={jest.fn()} onOpenRecent={jest.fn()} onScanDocument={jest.fn()} onSend={onSend} visible />
    </SafeAreaProvider>);
    await Promise.resolve();
  });

  expect(renderer.root.findByProps({accessibilityLabel:'Search Files'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Browse Documents'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Choose from Gallery'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Scan Documents'})).toBeDefined();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel:'Browse Documents'}).props.onPress();
  });

  expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({
    copyToCacheDirectory:true,
    multiple:false,
    type:SUPPORTED_PICKER_MIME_TYPES,
  }));
  expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
    name:'budget.xlsx',
    type:mimeByName['budget.xlsx'],
  }), expect.any(Function));
  expect(renderer.root.findByProps({accessibilityLabel:'budget.xlsx sent'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel:'Open recent file budget.xlsx'})).toBeDefined();
});
