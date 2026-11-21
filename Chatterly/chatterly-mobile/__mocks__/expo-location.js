module.exports = {
  Accuracy: {Balanced: 3},
  requestForegroundPermissionsAsync: jest.fn(async () => ({granted: true})),
  getCurrentPositionAsync: jest.fn(async () => ({coords: {latitude: 9.9252, longitude: 78.1198}})),
  reverseGeocodeAsync: jest.fn(async () => [{name: 'Madurai', city: 'Madurai'}]),
};
