const values = new Map();
const AsyncStorage = {
  getItem: jest.fn(async key => values.has(key) ? values.get(key) : null),
  setItem: jest.fn(async (key, value) => { values.set(key, value); }),
  multiSet: jest.fn(async entries => { entries.forEach(([key, value]) => values.set(key, value)); }),
  getAllKeys: jest.fn(async () => Array.from(values.keys())),
  removeItem: jest.fn(async key => { values.delete(key); }),
  multiRemove: jest.fn(async keys => { keys.forEach(key => values.delete(key)); }),
  clear: jest.fn(async () => { values.clear(); }),
};
module.exports = AsyncStorage;
