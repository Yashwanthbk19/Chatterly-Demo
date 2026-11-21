// expo-constants pulls in expo-modules-core, which needs the native runtime and
// blows up under Jest. Tests only read expoConfig.hostUri, so this stands in for
// the whole module. Jest picks it up automatically for node_modules packages.
module.exports = {
  __esModule: true,
  default: {
    expoConfig: null,
  },
};
