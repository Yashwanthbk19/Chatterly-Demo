// API_BASE_URL is resolved at import time, so each case re-imports the module
// with different sources. They are set inside isolateModules: resetModules
// hands out a fresh module registry, so a mutation made outside it would land
// on a different copy than api.ts reads.
declare const __dirname: string;

type ExpoConfig = {hostUri?: string} | null;

function loadConfig(
  {useLocal = false, localUrl = '', hostUri = null, scriptUrl = null}: {
    useLocal?: boolean;
    localUrl?: string;
    hostUri?: string | null;
    scriptUrl?: string | null;
  } = {},
) {
  let config: typeof import('../src/config/api') | undefined;

  jest.isolateModules(() => {
    const constants = require('expo-constants').default as {expoConfig: ExpoConfig};
    constants.expoConfig = hostUri === null ? null : {hostUri};

    const {NativeModules} = require('react-native') as {
      NativeModules: {SourceCode?: {scriptURL: string}};
    };
    NativeModules.SourceCode = scriptUrl === null ? undefined : {scriptURL: scriptUrl};

    // The switches are compile-time constants, so they are patched onto the
    // module source the same way a developer would edit them.
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'src', 'config', 'api.ts');
    const source = fs.readFileSync(file, 'utf8');

    // Doubles as a guard: these are personal development settings and must not
    // reach the repository, so a left-on switch fails the suite by name.
    if (!source.includes('const USE_LOCAL_BACKEND = false;')) {
      throw new Error(
        'USE_LOCAL_BACKEND is switched on in src/config/api.ts. That is a local ' +
        'development setting - set it back to false before committing.',
      );
    }
    if (!source.includes("const LOCAL_API_BASE_URL = '';")) {
      throw new Error(
        'LOCAL_API_BASE_URL is set in src/config/api.ts. That is a local ' +
        'development setting - clear it before committing.',
      );
    }

    // Anchored to line starts so an example inside a comment cannot be patched
    // instead of the real declaration.
    const patched = source
      .replace(/^const USE_LOCAL_BACKEND = .*$/m, `const USE_LOCAL_BACKEND = ${useLocal};`)
      .replace(/^const LOCAL_API_BASE_URL = .*$/m, `const LOCAL_API_BASE_URL = '${localUrl}';`);

    jest.doMock('../src/config/api', () => {
      const transpiled = require('@babel/core').transformSync(patched, {
        filename: file,
        presets: ['babel-preset-expo'],
      }).code;
      const module = {exports: {}};
      // eslint-disable-next-line no-new-func
      new Function('module', 'exports', 'require', transpiled)(
        module, module.exports, require,
      );
      return module.exports;
    });

    config = require('../src/config/api');
  });

  return {config: config!};
}

afterEach(() => {
  jest.resetModules();
});

test('defaults to the live backend, unchanged for anyone who does not opt in', () => {
  const {config: {API_BASE_URL}} = loadConfig({hostUri: '192.168.29.165:8081'});
  expect(API_BASE_URL).toBe('https://chatterly.stacklycloud.com/api');
});

test('local mode finds the machine serving the bundle, no IP to type', () => {
  const {config: {API_BASE_URL}} = loadConfig({useLocal: true, hostUri: '192.168.29.165:8081'});
  expect(API_BASE_URL).toBe('http://192.168.29.165:5000/api');
});

test('local mode falls back to SourceCode when Expo reports no host', () => {
  const {config: {API_BASE_URL}} = loadConfig({
    useLocal: true, scriptUrl: 'http://192.168.29.165:8081/index.bundle',
  });
  expect(API_BASE_URL).toBe('http://192.168.29.165:5000/api');
});

test('local mode prefers a routable address over localhost', () => {
  const {config: {API_BASE_URL}} = loadConfig({
    useLocal: true,
    hostUri: 'localhost:8081',
    scriptUrl: 'http://192.168.29.165:8081/index.bundle',
  });
  expect(API_BASE_URL).toBe('http://192.168.29.165:5000/api');
});

test('an explicit local URL wins, for emulators', () => {
  const {config: {API_BASE_URL}} = loadConfig({
    useLocal: true, localUrl: 'http://10.0.2.2:5000/api', hostUri: '192.168.29.165:8081',
  });
  expect(API_BASE_URL).toBe('http://10.0.2.2:5000/api');
});

test('local mode falls back to live when no host is discoverable', () => {
  // Better than guessing an address that is not reachable from this device.
  const {config: {API_BASE_URL}} = loadConfig({useLocal: true});
  expect(API_BASE_URL).toBe('https://chatterly.stacklycloud.com/api');
});

