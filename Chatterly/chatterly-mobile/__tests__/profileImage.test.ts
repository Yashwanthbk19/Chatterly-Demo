import {ImageManipulator, SaveFormat} from 'expo-image-manipulator';
import {prepareProfileImage} from '../src/services/profileImage';

function mockManipulator() {
  const resize = jest.fn();
  const saveAsync = jest.fn(async () => ({
    uri: 'file:///cache/profile-normalized.jpg',
    width: 1200,
    height: 800,
  }));
  const renderAsync = jest.fn(async () => ({saveAsync}));
  jest.mocked(ImageManipulator.manipulate).mockReturnValue({resize, renderAsync} as never);
  return {resize, renderAsync, saveAsync};
}

beforeEach(() => jest.clearAllMocks());

test('turns a large Android gallery image into an upload-safe cached JPEG', async () => {
  const context = mockManipulator();
  const prepared = await prepareProfileImage({
    assetId: null,
    uri: 'content://media/external/images/42',
    width: 4032,
    height: 3024,
    fileName: 'camera-image.png',
    fileSize: 8 * 1024 * 1024,
    mimeType: 'image/png',
    type: 'image',
  });

  expect(ImageManipulator.manipulate).toHaveBeenCalledWith('content://media/external/images/42');
  expect(context.resize).toHaveBeenCalledWith({width: 1200, height: null});
  expect(context.saveAsync).toHaveBeenCalledWith({compress: 0.72, format: SaveFormat.JPEG});
  expect(prepared).toEqual(expect.objectContaining({
    uri: 'file:///cache/profile-normalized.jpg',
    fileName: expect.stringMatching(/^profile-\d+\.jpg$/),
    mimeType: 'image/jpeg',
    width: 1200,
    height: 800,
  }));
});

test('rejects unsupported images before trying to process them', async () => {
  await expect(prepareProfileImage({
    assetId: null,
    uri: 'content://media/external/images/43',
    width: 400,
    height: 400,
    fileName: 'avatar.gif',
    mimeType: 'image/gif',
    type: 'image',
  })).rejects.toThrow('Only JPG and PNG images are supported.');
  expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
});
