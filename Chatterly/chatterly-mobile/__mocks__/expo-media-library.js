const queryExecute = jest.fn(async () => []);

class Query {
  within() { return this; }
  orderBy() { return this; }
  limit() { return this; }
  exe() { return queryExecute(); }
}

module.exports = {
  AssetField: {
    CREATION_TIME: 'creationTime',
    MEDIA_TYPE: 'mediaType',
  },
  MediaType: {
    IMAGE: 'image',
    VIDEO: 'video',
  },
  Query,
  __queryExecute: queryExecute,
  getPermissionsAsync: jest.fn(async () => ({granted: true, accessPrivileges: 'all'})),
  requestPermissionsAsync: jest.fn(async () => ({granted: true})),
  saveToLibraryAsync: jest.fn(async () => undefined),
  getAssetsAsync: jest.fn(async () => ({assets: [], endCursor: '', hasNextPage: false, totalCount: 0})),
  getAssetInfoAsync: jest.fn(async asset => ({...asset, localUri: asset.uri})),
};
