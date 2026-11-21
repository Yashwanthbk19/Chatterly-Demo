const saveAsync = jest.fn(async () => ({
  uri: 'file:///cache/profile-normalized.jpg',
  width: 1200,
  height: 800,
}));
const renderAsync = jest.fn(async () => ({saveAsync}));
const resize = jest.fn();
const crop = jest.fn();
const manipulate = jest.fn(() => ({crop, resize, renderAsync}));

module.exports = {
  ImageManipulator: {manipulate},
  SaveFormat: {JPEG: 'jpeg', PNG: 'png', WEBP: 'webp'},
  __mock: {crop, manipulate, resize, renderAsync, saveAsync},
};
