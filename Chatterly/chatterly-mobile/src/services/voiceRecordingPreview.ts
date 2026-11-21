import { File, Paths } from 'expo-file-system';

/** Finalize only the preview copy; the recorder must keep its file open to resume. */
export function finalizeWavePreview(bytes: Uint8Array): Uint8Array {
  const result = bytes.slice();
  const view = new DataView(
    result.buffer,
    result.byteOffset,
    result.byteLength,
  );
  const tag = (offset: number) =>
    String.fromCharCode(...result.subarray(offset, offset + 4));
  if (result.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new Error('The recording preview is not a valid WAV file.');
  }
  let blockAlign = 1;
  for (let offset = 12; offset + 8 <= result.length; ) {
    const size = view.getUint32(offset + 4, true);
    if (tag(offset) === 'fmt ' && size >= 16 && offset + 24 <= result.length) {
      blockAlign = view.getUint16(offset + 20, true) || 1;
    }
    if (tag(offset) === 'data') {
      const available = result.length - offset - 8;
      const dataSize = available - (available % blockAlign);
      if (!dataSize) {
        throw new Error('Record a little longer before playing the preview.');
      }
      view.setUint32(offset + 4, dataSize, true);
      view.setUint32(4, offset + dataSize, true);
      return result.slice(0, offset + 8 + dataSize);
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('The recording preview has no audio data.');
}

export async function createVoiceRecordingPreview(
  uri: string,
): Promise<string> {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase() || 'aac';
  const preview = new File(
    Paths.cache,
    `voice-preview-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`,
  );
  const source = new File(uri);
  if (extension === 'wav') {
    preview.write(finalizeWavePreview(await source.bytes()));
  } else {
    source.copy(preview);
  }
  return preview.uri;
}

export function deleteVoiceRecordingPreview(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A preview is disposable cache data; cleanup must not block the composer.
  }
}
