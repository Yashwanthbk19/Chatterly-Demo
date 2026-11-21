import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Modal, ScrollView, Text, TextInput} from 'react-native';
import {CountryPicker} from '../src/components/CountryPicker';
import {COUNTRIES, DEFAULT_COUNTRY} from '../src/constants/countries';

function renderPicker() {
  const onClose = jest.fn();
  const onSelect = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <CountryPicker value={DEFAULT_COUNTRY} visible onOpen={jest.fn()} onClose={onClose} onSelect={onSelect} />,
    );
  });
  return {renderer: renderer!, onClose, onSelect};
}

test('offers every region in alphabetical order inside the existing scrollable list', () => {
  const {renderer} = renderPicker();
  const rows = renderer.root.findByType(ScrollView).findAll(node => typeof node.props.onPress === 'function');
  expect(rows).toHaveLength(COUNTRIES.length);
  const names = rows.map(row => row.findAllByType(Text)[1].props.children);
  expect(names).toEqual(COUNTRIES.map(country => country.name).sort((a, b) => a.localeCompare(b)));
  act(() => renderer.unmount());
});

test('finds a previously missing region by name and returns its complete country data', () => {
  const {renderer, onSelect} = renderPicker();
  act(() => renderer.root.findByType(TextInput).props.onChangeText('  kosovo  '));
  const rows = renderer.root.findByType(ScrollView).findAll(node => typeof node.props.onPress === 'function');
  expect(rows).toHaveLength(1);
  act(() => rows[0].props.onPress());
  expect(onSelect).toHaveBeenCalledWith(COUNTRIES.find(country => country.code === 'XK'));
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
  act(() => renderer.unmount());
});

test('finds every country sharing a calling code', () => {
  const {renderer} = renderPicker();
  act(() => renderer.root.findByType(TextInput).props.onChangeText('+590'));
  const rows = renderer.root.findByType(ScrollView).findAll(node => typeof node.props.onPress === 'function');
  expect(rows).toHaveLength(3);
  act(() => renderer.unmount());
});

test.each(['backdrop', 'back button'])('clears a search on %s dismissal so reopening shows the full list', dismissal => {
  const {renderer, onClose} = renderPicker();
  act(() => renderer.root.findByType(TextInput).props.onChangeText('no such country'));
  expect(renderer.root.findByType(ScrollView).findAll(node => typeof node.props.onPress === 'function')).toHaveLength(0);
  act(() => {
    if (dismissal === 'backdrop') {
      renderer.root.findByType(Modal).findAll(node => typeof node.props.onPress === 'function')[0].props.onPress();
    } else {
      renderer.root.findByType(Modal).props.onRequestClose();
    }
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
  expect(renderer.root.findByType(ScrollView).findAll(node => typeof node.props.onPress === 'function')).toHaveLength(COUNTRIES.length);
  act(() => renderer.unmount());
});
