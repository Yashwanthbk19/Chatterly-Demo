module.exports = {
  createURL: jest.fn(path => `exp://127.0.0.1:8081/--/${path || ''}`),
};
