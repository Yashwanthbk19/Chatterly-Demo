import {getContentUriAsync} from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import {Linking, Platform} from 'react-native';

const ANDROID_VIEW_ACTION = 'android.intent.action.VIEW';
const ANDROID_GRANT_READ_URI_PERMISSION = 1;

const DOCUMENT_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  rtf: 'application/rtf',
  csv: 'text/csv',
};

function documentMimeType(mimeType: string | undefined, fileName: string): string {
  if (mimeType?.trim()) { return mimeType; }
  const extension = fileName.split('.').pop()?.trim().toLowerCase() || '';
  return DOCUMENT_MIME_TYPES[extension] || '*/*';
}

/** Opens a downloaded document with an installed reader application. */
export async function openDownloadedDocument(
  uri: string,
  mimeType?: string,
  fileName = 'document',
  platform: typeof Platform.OS = Platform.OS,
): Promise<void> {
  const resolvedMimeType = documentMimeType(mimeType, fileName);
  if (platform === 'android') {
    try {
      // Android readers cannot access the app's private file:// URI directly.
      const contentUri = uri.startsWith('content://')
        ? uri
        : await getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync(ANDROID_VIEW_ACTION, {
        data: contentUri,
        flags: ANDROID_GRANT_READ_URI_PERMISSION,
        type: resolvedMimeType,
      });
      return;
    } catch (viewerError) {
      // A share sheet still lets the user choose an app when no default reader
      // is registered. Keep the original error when sharing is unavailable.
      if (!(await Sharing.isAvailableAsync())) {
        throw viewerError;
      }
    }
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: resolvedMimeType,
      dialogTitle: `Open ${fileName}`,
    });
    return;
  }

  await Linking.openURL(uri);
}
