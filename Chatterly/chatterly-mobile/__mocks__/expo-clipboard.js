module.exports = {
  setStringAsync: jest.fn(async () => undefined),
  setImageAsync: jest.fn(async () => undefined),
  hasImageAsync: jest.fn(async () => false),
  getImageAsync: jest.fn(async () => null),
};
