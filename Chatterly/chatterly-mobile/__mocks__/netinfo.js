const NetInfo = {
  addEventListener: jest.fn(listener => {
    listener({isConnected: true, isInternetReachable: true});
    return jest.fn();
  }),
  fetch: jest.fn(async () => ({isConnected: true, isInternetReachable: true})),
};
module.exports = NetInfo;
