module.exports = {
  getRandomBytes: jest.fn(byteCount => Uint8Array.from({length: byteCount}, (_, index) => (index * 17 + 11) % 256)),
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
};
