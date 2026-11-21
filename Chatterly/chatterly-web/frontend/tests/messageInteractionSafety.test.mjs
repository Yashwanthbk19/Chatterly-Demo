import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(
  new URL('../src/pages/ChatListPage.jsx', import.meta.url),
  'utf8'
).replaceAll('\r\n', '\n');

const sourceSection = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
};

test('deleted message placeholders cannot keep or reopen More Options', () => {
  const selectedMessageEffect = sourceSection(
    '  useEffect(() => {\n    if (!selectedMessageId) {',
    '  useEffect(() => {\n    if (!selectedMessages.length) {'
  );
  const openActionSheet = sourceSection(
    '  const openMessageActionSheet = useCallback((message) => {',
    '  const closeReactionDetailsPopup = useCallback(() => {'
  );

  assert.match(selectedMessageEffect, /if \(latestSelectedMessage\.isDeleted\)/);
  assert.match(selectedMessageEffect, /clearSelectedMessage\(\)/);
  assert.match(openActionSheet, /if \(message\?\.isDeleted\)/);
  assert.match(source, /\) : !isDeletedMessage \? \(/);
  assert.match(source, /isOpen=\{Boolean\(activeMessageAction && !activeMessageAction\.isDeleted\)\}/);
});

test('clipboard image detection accepts Snipping Tool files without consuming text-only paste', () => {
  const helperSource = sourceSection(
    'const getClipboardImageFile = (clipboardData) => {',
    '\nconst getAudioAttachmentMimeType ='
  );
  const getClipboardImageFile = runInNewContext(
    `${helperSource}\ngetClipboardImageFile;`
  );
  const snippingImage = { name: 'image.png', type: 'image/png', size: 128 };

  assert.equal(getClipboardImageFile({
    items: [{ kind: 'file', type: 'image/png', getAsFile: () => snippingImage }],
  }), snippingImage);
  assert.equal(getClipboardImageFile({
    items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
    files: [],
  }), null);
});

test('the chat composer routes pasted images into the existing media preview flow', () => {
  const pasteHandler = sourceSection(
    '  const handleMessageInputPaste = useCallback((event) => {',
    '  const openCameraCapture = useCallback('
  );

  assert.match(pasteHandler, /getClipboardImageFile\(event\.clipboardData\)/);
  assert.match(pasteHandler, /event\.preventDefault\(\)/);
  assert.match(pasteHandler, /CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES/);
  assert.match(pasteHandler, /buildAttachmentDraft\(uploadFile, 'image', 'photos'\)/);
  assert.match(pasteHandler, /setSelectedMediaDraft\(createSelectedMediaDraftState/);
  assert.match(source, /onPaste=\{handleMessageInputPaste\}/);
});
