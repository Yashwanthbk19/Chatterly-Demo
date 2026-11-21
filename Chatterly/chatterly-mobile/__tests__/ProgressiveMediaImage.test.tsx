import React from 'react';
import {Image} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {ProgressiveMediaImage} from '../src/components/ProgressiveMediaImage';

test('keeps the thumbnail visible until the full CDN image has loaded', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<ProgressiveMediaImage
      mediaUrl={'https://cdn.example/full.jpg'}
      style={{width: 210, height: 255}}
      thumbnailUrl={'https://cdn.example/thumb.jpg'}
    />);
  });

  const images = renderer.root.findAllByType(Image);
  expect(images.map(image => image.props.source.uri)).toEqual([
    'https://cdn.example/thumb.jpg',
    'https://cdn.example/full.jpg',
  ]);
  expect(images[1].props.style).toEqual(expect.arrayContaining([expect.objectContaining({opacity: 0})]));

  ReactTestRenderer.act(() => images[1].props.onLoad());
  expect(renderer.root.findAllByType(Image)[1].props.style).not.toEqual(expect.arrayContaining([expect.objectContaining({opacity: 0})]));
});

test('shows an in-frame failure state when no thumbnail can be used', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<ProgressiveMediaImage mediaUrl={'https://cdn.example/missing.jpg'} style={{width: 210, height: 255}} />);
  });
  ReactTestRenderer.act(() => renderer.root.findByType(Image).props.onError());
  expect(renderer.root.findByProps({accessibilityLabel: 'Media unavailable'})).toBeDefined();
});
