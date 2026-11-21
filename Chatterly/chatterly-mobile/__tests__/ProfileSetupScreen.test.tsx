import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import * as ImagePicker from 'expo-image-picker';
import {Text} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ProfileSetupScreen} from '../src/screens/ProfileSetupScreen';
import {createProfile} from '../src/services/profileApi';

jest.mock('../src/services/profileApi', () => ({createProfile: jest.fn()}));

const METRICS = {
  frame: {x: 0, y: 0, width: 393, height: 852},
  insets: {top: 24, right: 0, bottom: 24, left: 0},
};

async function renderScreen(onComplete = jest.fn()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ProfileSetupScreen
          token="jwt-token"
          userId="user-1"
          onComplete={onComplete}
        />
      </SafeAreaProvider>,
    );
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(createProfile).mockResolvedValue({
    message: 'Profile created successfully',
    user: {id: 'user-1', name: 'Maya Rao', isProfileComplete: true},
  });
});

test('matches the required profile form states and submits the documented profile request', async () => {
  const onComplete = jest.fn();
  const renderer = await renderScreen(onComplete);
  const createButton = () => renderer.root.findByProps({accessibilityLabel: 'Create profile'});

  expect(renderer.root.findByProps({children: 'Create your profile'})).toBeTruthy();
  expect(createButton().props.disabled).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Full name'}).props.onChangeText('Maya Rao');
    renderer.root.findByProps({accessibilityLabel: 'Date of birth'}).props.onChangeText('12051990');
    renderer.root.findByProps({accessibilityLabel: 'Bio'}).props.onChangeText('Available');
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Date of birth'}).props.value).toBe('12/05/1990');
  expect(createButton().props.disabled).toBe(false);

  await ReactTestRenderer.act(async () => {
    await createButton().props.onPress();
  });

  expect(createProfile).toHaveBeenCalledWith('jwt-token', {
    name: 'Maya Rao',
    dateOfBirth: '12/05/1990',
    bio: 'Available',
    image: undefined,
  }, 'user-1');
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
    id: 'user-1', name: 'Maya Rao', dateOfBirth: '1990-05-12', status: 'Available', isProfileComplete: true,
  }));
  expect(onComplete).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('supports gallery selection, change, and removal through the profile picture sheet', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{
      uri: 'content://media/external/images/42',
      fileName: 'profile.jpg',
      mimeType: 'image/jpeg',
      fileSize: 120000,
      width: 600,
      height: 600,
      type: 'image',
    }],
  });
  const onComplete = jest.fn();
  const renderer = await renderScreen(onComplete);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Choose profile picture'}).props.onPress();
  });
  expect(renderer.root.findByProps({children: 'Profile Picture'})).toBeTruthy();
  expect(renderer.root.findByProps({accessibilityLabel: 'Take profile photo'})).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Choose profile photo from gallery'}).props.onPress();
  });
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
  expect(renderer.root.findByProps({accessibilityLabel: 'Change profile picture'})).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Full name'}).props.onChangeText('Maya Rao');
    renderer.root.findByProps({accessibilityLabel: 'Date of birth'}).props.onChangeText('12051990');
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Create profile'}).props.onPress();
  });
  expect(createProfile).toHaveBeenCalledWith('jwt-token', expect.objectContaining({
    image: expect.objectContaining({uri: 'file:///cache/profile-normalized.jpg', mimeType: 'image/jpeg'}),
  }), 'user-1');
  expect(onComplete).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Change profile picture'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Remove profile picture'}).props.onPress();
  });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Change profile picture'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('unlocks the form after a failed upload and completes on retry', async () => {
  jest.mocked(createProfile).mockRejectedValueOnce(new Error('Profile create took too long.'));
  const onComplete = jest.fn();
  const renderer = await renderScreen(onComplete);
  const button = () => renderer.root.findByProps({accessibilityLabel: 'Create profile'});
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Full name'}).props.onChangeText('Maya Rao');
    renderer.root.findByProps({accessibilityLabel: 'Date of birth'}).props.onChangeText('12051990');
  });
  await ReactTestRenderer.act(async () => { await button().props.onPress(); });
  expect(button().props.disabled).toBe(false);
  expect(onComplete).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { await button().props.onPress(); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('retains the submitted email-user profile when the success response omits the user', async () => {
  jest.mocked(createProfile).mockResolvedValueOnce({message: 'Profile created successfully'});
  const onComplete = jest.fn();
  const renderer = await renderScreen(onComplete);
  await ReactTestRenderer.act(() => {
    renderer.root.findByProps({accessibilityLabel: 'Full name'}).props.onChangeText('  Maya Rao  ');
    renderer.root.findByProps({accessibilityLabel: 'Date of birth'}).props.onChangeText('12051990');
    renderer.root.findByProps({accessibilityLabel: 'Bio'}).props.onChangeText('  Available  ');
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Create profile'}).props.onPress();
  });
  expect(onComplete).toHaveBeenCalledWith({
    id: 'user-1', name: 'Maya Rao', dateOfBirth: '1990-05-12', status: 'Available', isProfileComplete: true,
  });
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('normalizes the saved profile and keeps server values when they are returned', async () => {
  jest.mocked(createProfile).mockResolvedValueOnce({user: {
    _id: 'user-1', name: 'Maya R.', dob: '1990-05-12', email: 'maya@example.com',
    status: 'Server bio', profilePic: 'https://media.example.com/profile.jpg', isProfileComplete: true,
  }} as never);
  const onComplete = jest.fn();
  const renderer = await renderScreen(onComplete);
  await ReactTestRenderer.act(() => {
    renderer.root.findByProps({accessibilityLabel: 'Full name'}).props.onChangeText('Maya Rao');
    renderer.root.findByProps({accessibilityLabel: 'Date of birth'}).props.onChangeText('12051990');
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByProps({accessibilityLabel: 'Create profile'}).props.onPress();
  });
  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
    id: 'user-1', name: 'Maya R.', email: 'maya@example.com', dateOfBirth: '1990-05-12',
    status: 'Server bio', profilePic: 'https://media.example.com/profile.jpg', isProfileComplete: true,
  }));
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('opens the calendar control and applies the selected date of birth', async () => {
  const renderer = await renderScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Open date of birth picker'}).props.onPress();
  });
  expect(renderer.root.findByProps({children: 'Select date of birth'})).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Choose year 2001'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Choose month June'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Choose day 11'}).props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Select date'}).props.onPress();
  });

  expect(renderer.root.findByProps({accessibilityLabel: 'Date of birth'}).props.value).toBe('11/06/2001');
  expect(renderer.root.findAllByProps({children: 'Select date of birth'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});


test('shows the 5 MB profile photo limit directly below Create Profile', async () => {
  const renderer = await renderScreen();
  const texts = renderer.root.findAllByType(Text).map(node => node.props.children).filter(text => typeof text === 'string');

  expect(texts.indexOf('Maximum profile image size: 5 MB')).toBe(texts.indexOf('Create Profile') + 1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('Full Name swaps the keyboard for an emoji panel from its corner', async () => {
  const renderer = await renderScreen();
  const name = () => renderer.root.findByProps({accessibilityLabel: 'Full name'});
  const shown = (accessibilityLabel: string) => renderer.root.findAllByProps({accessibilityLabel}).length > 0;

  await ReactTestRenderer.act(async () => name().props.onChangeText('Maya'));
  await ReactTestRenderer.act(async () => name().props.onSelectionChange({nativeEvent: {selection: {start: 4, end: 4}}}));
  expect(shown('Emoji picker')).toBe(false);
  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({accessibilityLabel: 'Add emoji'})[0].props.onPress();
    await Promise.resolve();
  });
  expect(shown('Emoji picker')).toBe(true);
  expect(shown('Show keyboard')).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Add 📱'}).props.onPress();
    await Promise.resolve();
  });
  expect(name().props.value).toBe('Maya📱');

  // Moving on to Bio gives the space back to the keyboard.
  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Bio'}).props.onFocus());
  expect(shown('Emoji picker')).toBe(false);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
