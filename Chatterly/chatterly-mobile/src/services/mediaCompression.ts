import {ImageManipulator, SaveFormat} from 'expo-image-manipulator';
import {NativeModules, TurboModuleRegistry} from 'react-native';
import type {AttachmentMedia} from '../types/media';
import {isGifMedia} from '../utils/gifMedia';
import {loadStoredDataUsageSettings, type MediaUploadQuality} from './mediaPreferencesApi';

function hasNativeVideoCompressor(): boolean {
  try {
    return Boolean(NativeModules.Compressor || TurboModuleRegistry.get('Compressor'));
  } catch {
    return false;
  }
}

/**
 * Prepares chat media before it enters the multipart upload.
 *
 * Photos use Expo's image pipeline. Videos use the native encoders provided by
 * Android and iOS through react-native-compressor. The import remains lazy so
 * opening Chatterly in Expo Go still supports photos; production/dev-client
 * builds include the linked video compressor.
 */
export async function compressChatMedia(
  media: AttachmentMedia,
  onProgress?: (progress: number) => void,
  hdEnabled: boolean = false,
): Promise<AttachmentMedia> {
  onProgress?.(0);
  // The photo encoder saves only a still JPEG. Upload GIF bytes unchanged so
  // animation survives and devices do not need to decode GIFs for compression.
  if (isGifMedia(media)) {
    onProgress?.(1);
    return {
      ...media,
      mimeType: 'image/gif',
      fileName: /\.gif$/i.test(media.fileName) ? media.fileName : `${media.fileName}.gif`,
    };
  }
  // The per-send choice must always change the encoded upload. Keep the
  // standard preset compact and the HD preset visibly higher resolution.
  let quality: MediaUploadQuality = 'low';
  if (hdEnabled) {
    try {
      const preferredQuality = (await loadStoredDataUsageSettings()).mediaUploadQuality;
      // HD must remain a real upgrade even when the global upload preference
      // is set to low; standard sends continue to use the low preset.
      quality = preferredQuality === 'low' ? 'medium' : preferredQuality;
    } catch {
      quality = 'medium';
    }
  }
  const videoSize = quality === 'high' ? 1280 : quality === 'medium' ? 960 : 720;
  // The server re-encodes every chat photo to at most 1280px wide. The HD
  // presets reach that ceiling; standard has to stay clearly below it, or both
  // choices would arrive as the same picture.
  const imageSize = quality === 'high' ? 2400 : quality === 'medium' ? 1920 : 960;
  const imageCompression = quality === 'high' ? 0.9 : quality === 'medium' ? 0.84 : 0.68;

  if (media.type === 'video') {
    // Expo Go cannot contain third-party native modules. Do not even evaluate
    // react-native-compressor there: its module initializer throws before its
    // compress function can be called. The original video remains compatible
    // with the backend's documented video upload/compression pipeline.
    if (!hasNativeVideoCompressor()) {
      onProgress?.(1);
      return media;
    }
    try {
      const {Video} = require('react-native-compressor') as typeof import('react-native-compressor');
      const uri = await Video.compress(media.uri, {
        compressionMethod: 'auto',
        maxSize: videoSize,
        minimumFileSizeForCompress: 1,
        progressDivider: 2,
      }, progress => onProgress?.(Math.max(0, Math.min(1, progress))));
      onProgress?.(1);
      return {
        ...media,
        uri,
        fileName: media.fileName.replace(/\.[^.]+$/, '') + '.mp4',
        mimeType: 'video/mp4',
      };
    } catch {
      // Compression is an optimization, never a delivery requirement. If a
      // device codec rejects a downloaded file, upload the original instead.
      onProgress?.(1);
      return media;
    }
  }

  const context = ImageManipulator.manipulate(media.uri);
  const longestSide = Math.max(media.width || 0, media.height || 0);
  const maxDimension = imageSize;
  if (longestSide > maxDimension) {
    if ((media.width || 0) >= (media.height || 0)) context.resize({width: maxDimension});
    else context.resize({height: maxDimension});
  }
  onProgress?.(0.35);
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: imageCompression,
    format: SaveFormat.JPEG,
  });
  onProgress?.(1);
  return {
    ...media,
    uri: result.uri,
    width: result.width,
    height: result.height,
    fileName: media.fileName.replace(/\.[^.]+$/, '') + '.jpg',
    mimeType: 'image/jpeg',
  };
}
