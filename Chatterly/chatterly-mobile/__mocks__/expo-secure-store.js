const values = new Map();

module.exports = {
  setItemAsync: jest.fn(async (key, value) => { values.set(key, value); }),
  getItemAsync: jest.fn(async key => values.get(key) || null),
  deleteItemAsync: jest.fn(async key => { values.delete(key); }),
};
