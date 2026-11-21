module.exports = {
  preset: '@react-native/jest-preset',
  // Rendering a whole screen through react-test-renderer takes several seconds
  // on its own, and Jest runs the suites in parallel, so the 5s default made
  // whichever screen suites happened to share a worker fail at random.
  testTimeout: 30000,
  transform: {
    '^.+\\.(js|ts|tsx)$': 'babel-jest',
    '^.+\\.(bmp|gif|jpg|jpeg|mp3|mp4|png|psd|svg|wav|webp)$': require.resolve('@react-native/jest-preset/jest/assetFileTransformer.js'),
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|react-native-qrcode-svg|@react-native|@react-native-community|expo(?:-[^/]+)?|@expo(?:/[^/]+)?)/)',
  ],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/async-storage.js',
    '^@react-native-community/netinfo$': '<rootDir>/__mocks__/netinfo.js',
    '^expo-image-picker$': '<rootDir>/__mocks__/expo-image-picker.js',
    '^expo-camera$': '<rootDir>/__mocks__/expo-camera.js',
    '^expo-media-library$': '<rootDir>/__mocks__/expo-media-library.js',
    '^expo-media-library/legacy$': '<rootDir>/__mocks__/expo-media-library.js',
    '^expo-image-manipulator$': '<rootDir>/__mocks__/expo-image-manipulator.js',
    '^expo-intent-launcher$': '<rootDir>/__mocks__/expo-intent-launcher.js',
    '^expo-keep-awake$': '<rootDir>/__mocks__/expo-keep-awake.js',
    '^expo-contacts$': '<rootDir>/__mocks__/expo-contacts.js',
    '^expo-audio$': '<rootDir>/__mocks__/expo-audio.js',
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/expo-file-system-legacy.js',
    '^expo-file-system$': '<rootDir>/__mocks__/expo-file-system.js',
    '^expo-document-picker$': '<rootDir>/__mocks__/expo-document-picker.js',
    '^expo-location$': '<rootDir>/__mocks__/expo-location.js',
    '^expo-sharing$': '<rootDir>/__mocks__/expo-sharing.js',
    '^expo-video$': '<rootDir>/__mocks__/expo-video.js',
    '^expo-blur$': '<rootDir>/__mocks__/expo-blur.js',
    '^expo-haptics$': '<rootDir>/__mocks__/expo-haptics.js',
    '^expo-clipboard$': '<rootDir>/__mocks__/expo-clipboard.js',
    '^expo-notifications$': '<rootDir>/__mocks__/expo-notifications.js',
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.js',
    '^expo-crypto$': '<rootDir>/__mocks__/expo-crypto.js',
    '^expo-linking$': '<rootDir>/__mocks__/expo-linking.js',
    '^expo-web-browser$': '<rootDir>/__mocks__/expo-web-browser.js',
    '^react-native-compressor$': '<rootDir>/__mocks__/react-native-compressor.js',
    '^react-native-webrtc$': '<rootDir>/__mocks__/react-native-webrtc.js',
  },
};
