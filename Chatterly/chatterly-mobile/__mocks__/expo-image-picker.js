module.exports = {
  CameraType: {front: 'front'},
  requestCameraPermissionsAsync: jest.fn(async () => ({granted: true})),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({granted: true})),
  launchCameraAsync: jest.fn(async () => ({canceled: true, assets: []})),
  launchImageLibraryAsync: jest.fn(async () => ({canceled: true, assets: []})),
};
