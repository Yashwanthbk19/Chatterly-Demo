module.exports = {
  isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined),
  getSharedPayloads: jest.fn(() => []), getResolvedSharedPayloadsAsync: jest.fn(async () => []),
  clearSharedPayloads: jest.fn(),
};
