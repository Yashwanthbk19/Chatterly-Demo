const document = {uri: 'file:///documents/'};
class File {
  constructor(directory, name) { this.uri = name === undefined ? String(directory) : `file:///documents/${name}`; }
  base64 = jest.fn(async () => 'dm9pY2U=');
  copy = jest.fn(async () => undefined);
  write = jest.fn(() => undefined);
  static downloadFileAsync = jest.fn(async (_url, destination) => destination);
}
module.exports = {File, Paths: {document}};
