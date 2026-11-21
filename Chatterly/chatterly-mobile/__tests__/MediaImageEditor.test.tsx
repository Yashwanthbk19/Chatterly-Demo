import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Image, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {FeColorMatrix, Image as SvgImage, Text as SvgText} from 'react-native-svg';
import {ImageCropEditor, ImageEffectsEditor, ImageTextEditor, PHOTO_EFFECTS, ZoomableImage, resizeCrop} from '../src/components/MediaImageEditor';

const METRICS = {frame: {x: 0, y: 0, width: 400, height: 800}, insets: {top: 24, right: 0, bottom: 24, left: 0}};
const PHOTO = {uri: 'file:///cache/photo.jpg', width: 1200, height: 800};
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
  });
  mounted.push(renderer);
  return renderer;
}

// The editors size the photo from the stage's layout.
async function layoutStage(renderer: ReactTestRenderer.ReactTestRenderer, width = 400, height = 344) {
  const stage = renderer.root.findAll(node => node.type === View && typeof node.props.onLayout === 'function')[0];
  await ReactTestRenderer.act(async () => stage.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width, height}}}));
}

const press = (renderer: ReactTestRenderer.ReactTestRenderer, accessibilityLabel: string) => ReactTestRenderer.act(async () => {
  await renderer.root.findAllByProps({accessibilityLabel}).find(node => typeof node.props.onPress === 'function')!.props.onPress();
});

afterEach(() => {
  ReactTestRenderer.act(() => mounted.splice(0).forEach(renderer => renderer.unmount()));
});

test('dragging a crop corner keeps the opposite corner, stays on the photo and respects a fixed ratio', () => {
  const bounds = {width: 300, height: 200};
  const start = {x: 0, y: 0, width: 300, height: 200};

  expect(resizeCrop(start, 'br', -100, -50, null, bounds)).toEqual({x: 0, y: 0, width: 200, height: 150});
  expect(resizeCrop(start, 'tl', 60, 40, null, bounds)).toEqual({x: 60, y: 40, width: 240, height: 160});
  // Dragging past the edge of the photo stops at the edge.
  expect(resizeCrop({x: 50, y: 50, width: 100, height: 100}, 'br', 500, 500, null, bounds)).toEqual({x: 50, y: 50, width: 250, height: 150});
  // A frame never collapses below the minimum size.
  expect(resizeCrop(start, 'br', -400, -400, null, bounds)).toEqual({x: 0, y: 0, width: 48, height: 48});
  // Square: the frame stays square and inside the photo.
  const square = resizeCrop({x: 0, y: 0, width: 200, height: 200}, 'br', 80, 10, 1, bounds);
  expect(square.width).toBe(square.height);
  expect(square.width).toBeLessThanOrEqual(200);
});

test('the crop tool crops the area in the frame, in photo pixels', async () => {
  const onApply = jest.fn();
  const onCancel = jest.fn();
  const renderer = await render(<ImageCropEditor busy={false} image={PHOTO} onApply={onApply} onCancel={onCancel} />);
  await layoutStage(renderer);

  // The untouched frame covers the whole photo, so Done changes nothing.
  await press(renderer, 'Apply crop');
  expect(onApply).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);

  await press(renderer, 'Crop Square');
  await press(renderer, 'Apply crop');
  expect(onApply).toHaveBeenCalledWith({originX: 200, originY: 0, width: 800, height: 800});
});

test('effects preview a colour filter on the photo, and Original leaves it untouched', async () => {
  const onApply = jest.fn();
  const onCancel = jest.fn();
  const renderer = await render(<ImageEffectsEditor image={PHOTO} onApply={onApply} onCancel={onCancel} />);
  await layoutStage(renderer);
  const done = () => renderer.root.findAllByProps({accessibilityLabel: 'Apply effect'}).find(node => typeof node.props.onPress === 'function')!;

  // Nothing can be applied before the photo has loaded into the canvas.
  expect(done().props.disabled).toBe(true);
  expect(renderer.root.findAllByType(FeColorMatrix)).toHaveLength(0);

  await press(renderer, 'Effect Sepia');
  expect(renderer.root.findByType(FeColorMatrix).props.values).toEqual(PHOTO_EFFECTS.find(effect => effect.key === 'sepia')!.matrix);

  await press(renderer, 'Effect Original');
  await ReactTestRenderer.act(async () => renderer.root.findByType(SvgImage).props.onLoad());
  expect(done().props.disabled).toBe(false);
  await press(renderer, 'Apply effect');
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onApply).not.toHaveBeenCalled();
});

test('text is drawn on the photo in the chosen colour', async () => {
  const renderer = await render(<ImageTextEditor image={PHOTO} onApply={jest.fn()} onCancel={jest.fn()} />);
  await layoutStage(renderer);
  await ReactTestRenderer.act(async () => renderer.root.findByType(SvgImage).props.onLoad());
  const done = () => renderer.root.findAllByProps({accessibilityLabel: 'Apply text'}).find(node => typeof node.props.onPress === 'function')!;
  expect(done().props.disabled).toBe(true);

  await ReactTestRenderer.act(async () => renderer.root.findByProps({accessibilityLabel: 'Text to add on the photo'}).props.onChangeText('Hello'));
  await press(renderer, 'Text colour Red');

  const drawn = renderer.root.findAllByType(SvgText);
  expect(drawn.map(node => node.props.children)).toEqual(['Hello', 'Hello']);
  expect(drawn[1].props.fill).toBe('#EF4444');
  // Centred on the photo until it is dragged.
  expect(drawn[1].props.x).toBe(600);
  expect(done().props.disabled).toBe(false);
});

function touches(points: {pageX: number; pageY: number}[], time: number) {
  return {
    nativeEvent: {touches: points, changedTouches: points, pageX: points[0].pageX, pageY: points[0].pageY, timestamp: time},
    touchHistory: {
      numberActiveTouches: points.length,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: time,
      touchBank: points.map(point => ({
        touchActive: true, startPageX: point.pageX, startPageY: point.pageY, startTimeStamp: time,
        currentPageX: point.pageX, currentPageY: point.pageY, currentTimeStamp: time,
        previousPageX: point.pageX, previousPageY: point.pageY, previousTimeStamp: time,
      })),
    },
  };
}

test('the preview zooms with a pinch or a double tap and follows the zoom buttons', async () => {
  const onZoomChange = jest.fn();
  const renderer = await render(<ZoomableImage onZoomChange={onZoomChange} uri={PHOTO.uri} zoom={1} />);
  const surface = renderer.root.findAll(node => node.type === View && typeof node.props.onResponderGrant === 'function')[0];
  const scale = () => renderer.root.findByType(Image).props.style[1].transform[2].scale;
  await ReactTestRenderer.act(async () => surface.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 400, height: 600}}}));

  // Two fingers moving apart from 100 to 200 points: twice the size.
  await ReactTestRenderer.act(async () => {
    surface.props.onResponderGrant(touches([{pageX: 150, pageY: 300}, {pageX: 250, pageY: 300}], 1));
    surface.props.onResponderMove(touches([{pageX: 100, pageY: 300}, {pageX: 300, pageY: 300}], 2));
    surface.props.onResponderRelease(touches([{pageX: 100, pageY: 300}], 3));
  });
  expect(scale()).toBe(2);
  expect(onZoomChange).toHaveBeenLastCalledWith(2);

  // A double tap on a zoomed photo goes back to the whole photo.
  await ReactTestRenderer.act(async () => {
    for (const time of [10, 11]) {
      surface.props.onResponderGrant(touches([{pageX: 200, pageY: 300}], time));
      surface.props.onResponderRelease(touches([{pageX: 200, pageY: 300}], time));
    }
  });
  expect(scale()).toBe(1);
  expect(onZoomChange).toHaveBeenLastCalledWith(1);

  await ReactTestRenderer.act(async () => {
    renderer.update(<SafeAreaProvider initialMetrics={METRICS}><ZoomableImage onZoomChange={onZoomChange} uri={PHOTO.uri} zoom={1.5} /></SafeAreaProvider>);
  });
  expect(scale()).toBe(1.5);
});
