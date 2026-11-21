import {AppRegistry} from 'react-native';

jest.mock('expo', () => ({requireOptionalNativeModule: () => null}));

test('registers native and Expo Go application keys', () => {
  const register = jest.spyOn(AppRegistry, 'registerComponent');

  require('../index');

  expect(register).toHaveBeenCalledWith('ChatterlyMobile', expect.any(Function));
  expect(register).toHaveBeenCalledWith('main', expect.any(Function));
  register.mockRestore();
});
