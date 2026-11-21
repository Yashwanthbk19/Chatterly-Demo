/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import {keepCallRuntimeAlive} from './src/services/callBackground';
import {keepCallAvailabilityAlive} from './src/services/callAvailability';

AppRegistry.registerHeadlessTask('ChatterlyActiveCall', () => keepCallRuntimeAlive);
AppRegistry.registerHeadlessTask('ChatterlyCallAvailability', () => keepCallAvailabilityAlive);

// This must match MainActivity.getMainComponentName() in the checked-in native
// projects. Expo Go additionally launches the same component through `main`.
const appName = 'ChatterlyMobile';

AppRegistry.registerComponent(appName, () => App);

// Expo Go launches JavaScript bundles with the component key `main`, while the
// native React Native Android/iOS projects use the name from app.json. Register
// both entry points so either development workflow starts the same app.
if (appName !== 'main') {
  AppRegistry.registerComponent('main', () => App);
}
