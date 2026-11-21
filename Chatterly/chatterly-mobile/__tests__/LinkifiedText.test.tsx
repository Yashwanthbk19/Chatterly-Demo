import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Linking} from 'react-native';
import {LinkifiedText} from '../src/components/LinkifiedText';

test('opens an HTTPS message link and excludes trailing punctuation', async () => {
  jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<LinkifiedText>See https://example.com/docs.</LinkifiedText>); });
  await act(async () => tree.root.findByProps({accessibilityRole: 'link'}).props.onPress());
  expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/docs');
});

test('makes a www link navigable with a secure scheme', async () => {
  jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<LinkifiedText>www.example.com</LinkifiedText>); });
  await act(async () => tree.root.findByProps({accessibilityRole: 'link'}).props.onPress());
  expect(Linking.openURL).toHaveBeenCalledWith('https://www.example.com');
});
