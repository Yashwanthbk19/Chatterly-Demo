const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/**
 * Expo's Metro configuration is required for Expo Go to load this project.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname);

// expo-media-library 57.0.4 publishes its legacy export with a reference to
// src/legacy/index.ts, but that source file is not included in the package.
// Point only that export at the compiled implementation that is included so
// Expo Go can build the Android bundle.
const mediaLibraryLegacy = path.join(
  __dirname,
  'node_modules',
  'expo-media-library',
  'build',
  'legacy',
  'index.js',
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-media-library/legacy') {
    return {filePath: mediaLibraryLegacy, type: 'sourceFile'};
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
