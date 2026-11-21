// babel-preset-expo extends @react-native/babel-preset and additionally
// inlines process.env.EXPO_OS, which expo-modules-core reads at import time.
// The plain React Native preset leaves it undefined and the module warns.
module.exports = {
  presets: ['babel-preset-expo'],
};
