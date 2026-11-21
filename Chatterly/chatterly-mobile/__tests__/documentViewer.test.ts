import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import {openDownloadedDocument} from '../src/services/documentViewer';

test('opens a downloaded Android document in a reader with read access', async () => {
  await openDownloadedDocument(
    'file:///documents/chatterly-message-report.pdf',
    'application/pdf',
    'report.pdf',
    'android',
  );

  expect(FileSystem.getContentUriAsync).toHaveBeenCalledWith(
    'file:///documents/chatterly-message-report.pdf',
  );
  expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith(
    'android.intent.action.VIEW',
    {
      data: expect.stringMatching(/^content:\/\/chatterly\//),
      flags: 1,
      type: 'application/pdf',
    },
  );
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('infers the MIME type of a group document when its payload omits one', async () => {
  await openDownloadedDocument(
    'file:///documents/chatterly-group-agenda.docx',
    '',
    'agenda.docx',
    'android',
  );

  expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith(
    'android.intent.action.VIEW',
    expect.objectContaining({
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  );
});

test('offers the document share sheet when Android has no reader', async () => {
  jest.mocked(IntentLauncher.startActivityAsync).mockRejectedValueOnce(
    new Error('No activity found'),
  );

  await openDownloadedDocument(
    'file:///documents/chatterly-message-notes.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'notes.docx',
    'android',
  );

  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    'file:///documents/chatterly-message-notes.docx',
    {
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      dialogTitle: 'Open notes.docx',
    },
  );
});
