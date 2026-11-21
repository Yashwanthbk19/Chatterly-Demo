import {ImageManipulator, SaveFormat} from 'expo-image-manipulator';
import type {ImagePickerAsset} from 'expo-image-picker';
import {validateProfileImage} from '../utils/profileValidation';

const PROFILE_IMAGE_MAX_EDGE = 1200;
const PROFILE_IMAGE_JPEG_QUALITY = 0.72;

/**
 * Gallery providers on Android can return content URIs that React Native's
 * multipart implementation cannot reliably stream. Rendering the selection
 * into the app cache gives the upload a stable file URI and also keeps it
 * comfortably below the server/proxy upload limits.
 */
export async function prepareProfileImage(asset: ImagePickerAsset): Promise<ImagePickerAsset> {
  const formatError = validateProfileImage({...asset, fileSize: undefined});
  if (formatError) { throw new Error(formatError); }

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > PROFILE_IMAGE_MAX_EDGE || asset.height > PROFILE_IMAGE_MAX_EDGE) {
    context.resize(asset.width >= asset.height
      ? {width: PROFILE_IMAGE_MAX_EDGE, height: null}
      : {width: null, height: PROFILE_IMAGE_MAX_EDGE});
  }

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: PROFILE_IMAGE_JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });

  return {
    ...asset,
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    fileName: `profile-${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: undefined,
  };
}
