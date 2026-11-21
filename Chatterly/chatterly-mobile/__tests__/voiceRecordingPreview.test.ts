import { finalizeWavePreview } from '../src/services/voiceRecordingPreview';

function pausedWave() {
  // An open recorder file with placeholder RIFF/data sizes and a JUNK chunk.
  const bytes = new Uint8Array(64);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, value: string) => {
    bytes.set(
      Array.from(value, char => char.charCodeAt(0)),
      offset,
    );
  };
  tag(0, 'RIFF');
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, 44100, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  tag(36, 'JUNK');
  view.setUint32(40, 4, true);
  tag(48, 'data');
  bytes.set([1, 2, 3, 4, 5, 6, 7, 8], 56);
  return bytes;
}

test('finalizes a playable WAV snapshot without changing the resumable source', () => {
  const source = pausedWave();
  const result = finalizeWavePreview(source);
  const header = new DataView(result.buffer);
  expect(header.getUint32(4, true)).toBe(result.length - 8);
  expect(header.getUint32(52, true)).toBe(8);
  expect(result.slice(56)).toEqual(source.slice(56));
  expect(new DataView(source.buffer).getUint32(52, true)).toBe(0);
});

test('excludes an incomplete PCM frame from a snapshot', () => {
  const result = finalizeWavePreview(pausedWave().slice(0, 63));
  expect(result.length).toBe(60);
  expect(new DataView(result.buffer).getUint32(52, true)).toBe(4);
});

test('rejects empty or malformed audio instead of exposing an unplayable preview', () => {
  expect(() => finalizeWavePreview(new Uint8Array(0))).toThrow('valid WAV');
  expect(() => finalizeWavePreview(pausedWave().slice(0, 56))).toThrow(
    'Record a little longer',
  );
  expect(() => finalizeWavePreview(pausedWave().slice(0, 48))).toThrow(
    'no audio data',
  );
});
