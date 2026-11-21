import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import {Text} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PrivacySecurityScreen} from '../src/screens/PrivacySecurityScreen';
import {SettingsScreen} from '../src/screens/ProfileSettingsScreen';
import {resendEmailOtp, sendEmailOtp, verifyEmailOtp} from '../src/services/authApi';
import * as chatApi from '../src/services/chatApi';
import {changeContactBlock} from '../src/services/blockStore';
import {enableTwoFactor, enableTwoFactorSetup, getBlockedUsers, getEncryptionInfo, getPrivacySettings, getTrustedDevices, removeTrustedDevice, setupAuthenticator, unblockUser, updateDisappearingMessages, verifyAuthenticator} from '../src/services/privacyApi';
import {confirmPhoneCode, startPhoneVerification} from '../src/services/firebaseAuth';
import {getRegisteredUser} from '../src/services/contactsApi';
import {updateProfile} from '../src/services/profileApi';
import {clearSession, getSession, saveSession} from '../src/services/sessionStore';
import type {AuthUser} from '../src/types/auth';

jest.mock('../src/services/privacyApi', () => ({
  getPrivacySettings: jest.fn(),
  getEncryptionInfo: jest.fn(),
  getEncryptionDetails: jest.fn(),
  getBlockedUsers: jest.fn(),
  getTrustedDevices: jest.fn(),
  registerTrustedDevice: jest.fn(),
  removeTrustedDevice: jest.fn(),
  unblockUser: jest.fn(),
  reportUser: jest.fn(),
  setTwoFactorEnabled: jest.fn(),
  enableTwoFactor: jest.fn(),
  enableTwoFactorSetup: jest.fn(),
  disableTwoFactor: jest.fn(),
  setupAuthenticator: jest.fn(),
  verifyAuthenticator: jest.fn(),
  updateDisappearingMessages: jest.fn(),
}));

jest.mock('../src/services/firebaseAuth', () => ({
  startPhoneVerification: jest.fn(),
  confirmPhoneCode: jest.fn(),
}));

jest.mock('../src/services/authApi', () => ({
  resendEmailOtp: jest.fn(),
  sendEmailOtp: jest.fn(),
  verifyEmailOtp: jest.fn(),
}));

jest.mock('../src/services/contactsApi', () => ({getRegisteredUser: jest.fn(), syncContacts: jest.fn()}));
jest.mock('../src/services/profileApi', () => ({updateProfile: jest.fn()}));

/** A signed-in session; SMS two-step verification reads the account number from it. */
async function signIn(user: AuthUser) {
  await saveSession({token: 'jwt-token', user, isProfileComplete: true, message: '', requires2FA: false, twoFactorUserId: '', twoFactorMethod: ''});
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await clearSession();
  jest.clearAllMocks();
  jest.mocked(getRegisteredUser).mockResolvedValue(null);
  jest.mocked(updateProfile).mockImplementation(async (_token, draft) => ({user: {phone: draft.phone}}));
  jest.mocked(getPrivacySettings).mockResolvedValue({encryptionEnabled: true, twoFactorEnabled: false, blockedUsersCount: 2, disappearingMessages: 'off'});
  jest.mocked(getBlockedUsers).mockResolvedValue([{id: 'user-a', name: 'Anna'}, {id: 'user-b', name: 'Bala'}]);
  jest.mocked(unblockUser).mockResolvedValue('User unblocked successfully.');
  jest.mocked(getEncryptionInfo).mockResolvedValue({enabled: true, title: 'End-to-End Encryption', description: 'Protected'});
  jest.mocked(updateDisappearingMessages).mockResolvedValue(null);
  jest.mocked(getTrustedDevices).mockResolvedValue([]);
  jest.mocked(removeTrustedDevice).mockResolvedValue('Trusted device removed successfully.');
  jest.mocked(setupAuthenticator).mockResolvedValue({qrCode: 'otpauth://totp/Chatterly:test?secret=SERVERKEY', manualKey: 'SERVERKEY'});
  jest.mocked(verifyAuthenticator).mockResolvedValue(['CODE-0001', 'CODE-0002', 'CODE-0003', 'CODE-0004', 'CODE-0005', 'CODE-0006', 'CODE-0007', 'CODE-0008']);
  jest.mocked(enableTwoFactor).mockResolvedValue('2FA enabled successfully');
  jest.mocked(enableTwoFactorSetup).mockResolvedValue({message: '2FA enabled successfully', backupCodes: ['SMS-0001', 'SMS-0002']});
  jest.mocked(startPhoneVerification).mockResolvedValue({verificationId: 'sms-verification-1'});
  jest.mocked(confirmPhoneCode).mockResolvedValue('firebase-id-token');
  jest.mocked(sendEmailOtp).mockResolvedValue('OTP sent to email');
  jest.mocked(resendEmailOtp).mockResolvedValue('Email OTP resent successfully.');
  jest.mocked(verifyEmailOtp).mockResolvedValue({token: 'new-jwt-token', user: {id: 'user-1', email: 'user@gmail.com'}, isProfileComplete: true, message: 'Email verified', requires2FA: false, twoFactorUserId: '', twoFactorMethod: ''});
});

async function renderScreen(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}}}><PrivacySecurityScreen onBack={jest.fn()}/></SafeAreaProvider>);
  });
  return renderer!;
}

test('opens the verification method picker directly and enables Continue after a choice', async () => {
  const renderer = await renderScreen();
  for (const label of ['End-to-End Encryption', '2-Step Verification', 'Blocked Users', 'Disappearing Messages', 'Report a User']) {
    expect(renderer.root.findByProps({accessibilityLabel: label})).toBeTruthy();
  }
  expect(renderer.root.findByProps({children: 'Enabled'})).toBeTruthy();
  expect(renderer.root.findByProps({children: 'Disabled'})).toBeTruthy();
  expect(renderer.root.findByProps({children: 'Turned Off'})).toBeTruthy();

  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '2-Step Verification'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Authenticator App'}).props.accessibilityState.checked).toBe(false);
  expect(renderer.root.findByProps({accessibilityLabel: 'SMS Verification'}).props.accessibilityState.checked).toBe(false);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Email Verification'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.accessibilityState.disabled).toBe(true);
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Authenticator App'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.accessibilityState.disabled).toBe(false);
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Authenticator QR code'})).toBeTruthy();
  expect(renderer.root.findByProps({accessibilityLabel: 'Authenticator secret key'}).props.children).toBe('SERVERKEY');
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Copy authenticator key'}).props.onPress(); });
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('SERVERKEY');
  expect(setupAuthenticator).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
}, 15000);

const wordsOnScreen = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).filter(part => typeof part === 'string').join('')).join(' | ');

// The count was only a screen-reader hint and was set once from the server, so a
// block or unblock made elsewhere left it wrong.
test('the Blocked Users row shows how many people are blocked and follows blocking and unblocking at once', async () => {
  const block = jest.spyOn(chatApi, 'blockChatUser').mockResolvedValue(undefined as never);
  const renderer = await renderScreen();
  expect(wordsOnScreen(renderer)).toContain('2 blocked');

  await ReactTestRenderer.act(async () => { await changeContactBlock({id: 'user-a', name: 'Anna'}, false); });
  expect(unblockUser).toHaveBeenCalledWith('user-a');
  expect(wordsOnScreen(renderer)).toContain('1 blocked');

  await ReactTestRenderer.act(async () => { await changeContactBlock({id: 'user-c', name: 'Chitra'}, true); });
  expect(block).toHaveBeenCalledWith('user-c');
  expect(wordsOnScreen(renderer)).toContain('2 blocked');

  await ReactTestRenderer.act(async () => { await changeContactBlock({id: 'user-b', name: 'Bala'}, false); });
  await ReactTestRenderer.act(async () => { await changeContactBlock({id: 'user-c', name: 'Chitra'}, false); });
  expect(wordsOnScreen(renderer)).toContain('0 blocked');
  block.mockRestore();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('the Blocked Users row falls back to the total the server reports when the list cannot be loaded', async () => {
  jest.mocked(getBlockedUsers).mockRejectedValue(new Error('offline'));
  const renderer = await renderScreen();

  expect(wordsOnScreen(renderer)).toContain('2 blocked');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('opens the Privacy screen when Privacy is tapped in Settings', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 393, height: 852}, insets: {top: 24, right: 0, bottom: 24, left: 0}}}><SettingsScreen onOpenChats={jest.fn()} onOpenContacts={jest.fn()}/></SafeAreaProvider>);
  });
  await ReactTestRenderer.act(async () => { renderer!.root.findByProps({accessibilityLabel: 'Privacy'}).props.onPress(); });

  expect(renderer!.root.findByProps({accessibilityLabel: 'Search Privacy'})).toBeTruthy();
  expect(renderer!.root.findByProps({accessibilityLabel: 'End-to-End Encryption'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer!.unmount(); });
});

test('quickly navigates to disappearing-message duration controls', async () => {
  jest.mocked(getPrivacySettings).mockResolvedValue({encryptionEnabled: true, twoFactorEnabled: false, blockedUsersCount: 2, disappearingMessages: '24h'});
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Disappearing Messages'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: '24 hours'})).toBeTruthy();
  expect(renderer.root.findByProps({accessibilityLabel: '7 days'})).toBeTruthy();
  expect(renderer.root.findByProps({accessibilityLabel: '30 days'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('validates an SMS phone, sends and verifies its OTP, then shows the selected method', async () => {
  jest.useFakeTimers();
  // No number on this account yet, so one is entered here.
  await signIn({id: 'user-1', email: 'user@gmail.com'});
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '2-Step Verification'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'SMS Verification'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.onPress(); });

  expect(renderer.root.findByProps({accessibilityLabel: 'Send OTP'}).props.accessibilityState.disabled).toBe(true);
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'SMS phone number'}).props.onChangeText('9999999999'); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Send OTP'}).props.accessibilityState.disabled).toBe(false);
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Send OTP'}).props.onPress(); });
  expect(startPhoneVerification).toHaveBeenCalledWith('+919999999999');
  expect(renderer.root.findByProps({accessibilityLabel: 'Resend in 30s'})).toBeTruthy();

  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '6 digit verification code'}).props.onChangeText('123456'); });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Verify'}).props.onPress(); });
  expect(confirmPhoneCode).toHaveBeenCalledWith({verificationId: 'sms-verification-1'}, '123456');
  // The server texts the account's own number at sign-in, so the number just
  // verified becomes the account number before SMS is switched on.
  expect(updateProfile).toHaveBeenCalledWith('jwt-token', {phone: '+919999999999'});
  expect(getSession()?.user?.phone).toBe('+919999999999');
  expect(enableTwoFactorSetup).toHaveBeenCalledWith('sms');
  expect(jest.mocked(updateProfile).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(enableTwoFactorSetup).mock.invocationCallOrder[0]);
  expect(renderer.root.findByProps({children: 'Two-Step Verification Enabled!'})).toBeTruthy();
  expect(renderer.root.findByProps({children: 'SMS Verification'})).toBeTruthy();
  expect(renderer.root.findByProps({accessibilityLabel: 'View Recovery Codes'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'View Recovery Codes'}).props.onPress(); });
  expect(renderer.root.findByProps({children: 'SMS-0001'})).toBeTruthy();
  expect(renderer.root.findByProps({children: 'SMS-0002'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Save Codes'}).props.onPress(); });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('privacy.recoveryCodes', JSON.stringify(['SMS-0001', 'SMS-0002']));
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Close recovery codes'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Search Privacy'})).toBeTruthy();
  expect(renderer.root.findByProps({children: '2FA Added Successfully'})).toBeTruthy();
  expect(renderer.root.findAllByProps({children: 'Disabled'})).toHaveLength(0);
  await ReactTestRenderer.act(() => renderer.unmount());
  jest.useRealTimers();
}, 15000);

test('SMS verification sends the code to the number on the account, which cannot be changed here', async () => {
  jest.useFakeTimers();
  await signIn({id: 'user-1', email: 'user@gmail.com', phone: '+919876543210'});
  jest.mocked(getRegisteredUser).mockResolvedValue({userId: 'user-1', name: 'User', phone: '+919876543210', email: 'user@gmail.com', profilePic: null});
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '2-Step Verification'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'SMS Verification'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.onPress(); });

  const field = renderer.root.findByProps({accessibilityLabel: 'SMS phone number'});
  expect(field.props.editable).toBe(false);
  expect(field.props.value).toBe('9876543210');
  expect(renderer.root.findByProps({accessibilityLabel: 'Select SMS country'}).props.disabled).toBe(true);
  expect(renderer.root.findByProps({accessibilityLabel: 'Send OTP'}).props.accessibilityState.disabled).toBe(false);

  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Send OTP'}).props.onPress(); });
  expect(startPhoneVerification).toHaveBeenCalledWith('+919876543210');
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '6 digit verification code'}).props.onChangeText('123456'); });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Verify'}).props.onPress(); });

  expect(updateProfile).not.toHaveBeenCalled();
  expect(enableTwoFactorSetup).toHaveBeenCalledWith('sms');
  expect(renderer.root.findByProps({children: 'Two-Step Verification Enabled!'})).toBeTruthy();
  await ReactTestRenderer.act(() => renderer.unmount());
  jest.useRealTimers();
}, 15000);

test.skip('sends, resends and confirms the selected email verification method', async () => {
  jest.useFakeTimers();
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '2-Step Verification'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Email Verification'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.accessibilityState.disabled).toBe(false);
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.onPress(); });

  expect(renderer.root.findByProps({accessibilityLabel: 'Send OTP'}).props.accessibilityState.disabled).toBe(true);
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Email address'}).props.onChangeText('not-an-email'); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Send OTP'}).props.accessibilityState.disabled).toBe(true);
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Email address'}).props.onChangeText('user@gmail.com'); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Send OTP'}).props.accessibilityState.disabled).toBe(false);
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Send OTP'}).props.onPress(); });
  expect(sendEmailOtp).toHaveBeenCalledWith('user@gmail.com');
  expect(renderer.root.findByProps({accessibilityLabel: '6 digit verification code'})).toBeTruthy();
  expect(renderer.root.findByProps({accessibilityLabel: 'Resend in 30s'})).toBeTruthy();
  expect(renderer.root.findByProps({accessibilityLabel: 'Verify'}).props.accessibilityState.disabled).toBe(true);

  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(30000); });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Resend Email OTP'}).props.onPress(); });
  expect(resendEmailOtp).toHaveBeenCalledWith('user@gmail.com');

  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '6 digit verification code'}).props.onChangeText('123456'); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Verify'}).props.accessibilityState.disabled).toBe(false);
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Verify'}).props.onPress(); });
  expect(verifyEmailOtp).toHaveBeenCalledWith('user@gmail.com', '123456');
  expect(renderer.root.findByProps({children: 'Two-Step Verification Enabled!'})).toBeTruthy();
  expect(renderer.root.findByProps({children: 'Email Verification'})).toBeTruthy();
  expect(renderer.root.findByProps({accessibilityLabel: 'View Recovery Codes'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'View Recovery Codes'}).props.onPress(); });
  const codes = renderer.root.findAll(node => typeof node.props.children === 'string' && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(node.props.children));
  const codeValues = [...new Set<string>(codes.map(node => node.props.children))];
  expect(codeValues).toHaveLength(12);
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Save Codes'}).props.onPress(); });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('privacy.recoveryCodes', JSON.stringify(codeValues));
  expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringContaining('recovery-codes.txt'), expect.objectContaining({mimeType: 'text/plain'}));
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Close recovery codes'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Search Privacy'})).toBeTruthy();
  expect(renderer.root.findAllByProps({children: 'Enabled'}).length).toBeGreaterThanOrEqual(2);
  expect(renderer.root.findByProps({children: '2FA Added Successfully'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
  jest.useRealTimers();
});

test.skip('Continue on email recovery codes returns to Privacy with enabled status and success feedback', async () => {
  jest.useFakeTimers();
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '2-Step Verification'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Email Verification'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Email address'}).props.onChangeText('user@gmail.com'); });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Send OTP'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '6 digit verification code'}).props.onChangeText('123456'); });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Verify'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'View Recovery Codes'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Search Privacy'})).toBeTruthy();
  expect(renderer.root.findAllByProps({children: 'Enabled'}).length).toBeGreaterThanOrEqual(2);
  expect(renderer.root.findByProps({children: '2FA Added Successfully'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
  jest.useRealTimers();
});

test('opens trusted devices from the two-step overview and shows device information', async () => {
  jest.mocked(getPrivacySettings).mockResolvedValue({encryptionEnabled: true, twoFactorEnabled: true, blockedUsersCount: 2, disappearingMessages: 'off'});
  jest.mocked(getTrustedDevices).mockResolvedValue([{id: 'record-1', deviceId: 'device-001', deviceName: 'Samsung S24', platform: 'android', browser: 'Chatterly Mobile', ipAddress: '127.0.0.1', trusted: true, lastLoginAt: '2026-07-20T04:08:12.670Z', createdAt: '2026-07-20T03:34:55.705Z'}]);
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '2-Step Verification'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Trusted Devices'}).props.onPress(); });
  expect(renderer.root.findByProps({children: 'Your Devices'})).toBeTruthy();
  expect(renderer.root.findByProps({children: 'Samsung S24'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Samsung S24 device information'}).props.onPress(); });
  expect(renderer.root.findByProps({children: 'Device Information'})).toBeTruthy();
  expect(renderer.root.findByProps({children: 'Last Login'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('long press confirms and removes one trusted device with an in-screen toast', async () => {
  jest.mocked(getPrivacySettings).mockResolvedValue({encryptionEnabled: true, twoFactorEnabled: true, blockedUsersCount: 2, disappearingMessages: 'off'});
  const device = {id: 'record-1', deviceId: 'device-001', deviceName: 'Samsung S24', platform: 'android' as const, browser: 'Chatterly Mobile', ipAddress: '127.0.0.1', trusted: true, lastLoginAt: '2026-07-20T04:08:12.670Z', createdAt: '2026-07-20T03:34:55.705Z'};
  jest.mocked(getTrustedDevices).mockResolvedValue([device]);
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '2-Step Verification'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Trusted Devices'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Samsung S24 device information'}).props.onLongPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Remove this device confirmation'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Confirm Remove Samsung S24'}).props.onPress(); });
  expect(removeTrustedDevice).toHaveBeenCalledWith('device-001');
  expect(renderer.root.findByProps({children: 'Trusted device removed.'})).toBeTruthy();
  expect(renderer.root.findAllByProps({children: 'Samsung S24'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('remove all confirms, returns to two-step overview and shows the completion toast', async () => {
  jest.mocked(getPrivacySettings).mockResolvedValue({encryptionEnabled: true, twoFactorEnabled: true, blockedUsersCount: 2, disappearingMessages: 'off'});
  const devices = [
    {id: 'record-1', deviceId: 'device-001', deviceName: 'Samsung S24', platform: 'android' as const, browser: 'Chatterly Mobile', ipAddress: '', trusted: true, lastLoginAt: '2026-07-20T04:08:12.670Z', createdAt: '2026-07-20T03:34:55.705Z'},
    {id: 'record-2', deviceId: 'device-002', deviceName: 'Surface Pro', platform: 'web' as const, browser: 'Chrome', ipAddress: '', trusted: true, lastLoginAt: '2026-07-19T04:08:12.670Z', createdAt: '2026-07-19T03:34:55.705Z'},
  ];
  jest.mocked(getTrustedDevices).mockResolvedValue(devices);
  const renderer = await renderScreen();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '2-Step Verification'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Trusted Devices'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Remove All Devices'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Remove all trusted devices confirmation'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Confirm Remove All Devices'}).props.onPress(); });
  expect(removeTrustedDevice).toHaveBeenCalledTimes(2);
  expect(renderer.root.findByProps({accessibilityLabel: 'Verification Method'})).toBeTruthy();
  expect(renderer.root.findByProps({children: 'All trusted devices have been removed.'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

async function openVerification(renderer: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: '2-Step Verification'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Authenticator App'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.onPress(); });
}

test('requires a complete numeric code before frontend verification', async () => {
  const renderer = await renderScreen();
  await openVerification(renderer);
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Verify'}).props.onPress(); });
  expect(renderer.root.findByProps({children: 'Enter the complete 6-digit verification code.'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Verification code digit 1'}).props.onChangeText('abc'); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Verification code digit 1'}).props.value).toBe('');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('verifies, enables 2FA, opens recovery codes and closes to Privacy', async () => {
  const renderer = await renderScreen();
  await openVerification(renderer);
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Verification code digit 1'}).props.onChangeText('123456'); });
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Verify'}).props.onPress(); });
  expect(renderer.root.findByProps({children: 'Two-Step Verification Enabled!'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'View Recovery Codes'}).props.onPress(); });
  expect(renderer.root.findByProps({children: 'CODE-0001'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Save Codes'}).props.onPress(); });
  expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringContaining('recovery-codes.txt'), expect.objectContaining({mimeType: 'text/plain'}));
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Continue'}).props.onPress(); });
  expect(renderer.root.findByProps({accessibilityLabel: 'Search Privacy'})).toBeTruthy();
  expect(renderer.root.findAllByProps({children: 'Disabled'})).toHaveLength(0);
  expect(renderer.root.findByProps({children: '2FA Added Successfully'})).toBeTruthy();
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy.localTwoFactorEnabled', 'true');
  expect(verifyAuthenticator).toHaveBeenCalledWith('123456');
  expect(enableTwoFactor).toHaveBeenCalledWith('authenticator');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });

  jest.mocked(getPrivacySettings).mockResolvedValue({encryptionEnabled: true, twoFactorEnabled: true, blockedUsersCount: 2, disappearingMessages: 'off'});
  const refreshed = await renderScreen();
  expect(refreshed.root.findAllByProps({children: 'Disabled'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => { refreshed.unmount(); });
});
