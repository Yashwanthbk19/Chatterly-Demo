import {File, Paths} from 'expo-file-system';
import {ImageManipulator, SaveFormat} from 'expo-image-manipulator';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type GestureResponderEvent} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Defs, FeColorMatrix, Filter, Image as SvgImage, Text as SvgText} from 'react-native-svg';

/** A photo as the editors work on it: orientation applied, real pixel size known. */
export type EditableImage = {uri: string; width: number; height: number};
type Box = {width: number; height: number};
type Rect = {x: number; y: number; width: number; height: number};

const PURPLE = '#8B27E9';
// No upload is larger than this (the HD "high" preset), so editing at this size loses nothing.
const EDIT_MAX_EDGE = 2400;
const EDIT_QUALITY = 0.92;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

async function saveRendered(context: ReturnType<typeof ImageManipulator.manipulate>): Promise<EditableImage> {
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({compress: EDIT_QUALITY, format: SaveFormat.JPEG});
  return {uri: saved.uri, width: saved.width, height: saved.height};
}

/**
 * Re-encodes the photo before an editor opens. The manipulator applies the EXIF
 * orientation, so a portrait camera shot really is portrait for the crop maths
 * and for the SVG renderer, which draws raw bitmaps without rotating them.
 */
export async function loadEditableImage(uri: string): Promise<EditableImage> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(original.width, original.height) > EDIT_MAX_EDGE) {
    context.resize(original.width >= original.height ? {width: EDIT_MAX_EDGE} : {height: EDIT_MAX_EDGE});
  }
  return saveRendered(context);
}

export function rotateImage(uri: string): Promise<EditableImage> {
  const context = ImageManipulator.manipulate(uri);
  context.rotate(90);
  return saveRendered(context);
}

/** The largest rect with the photo's aspect that fits in the box, centred, with a margin. */
function fitContain(image: Box, box: Box, margin: number): Rect {
  const room = {width: Math.max(1, box.width - margin * 2), height: Math.max(1, box.height - margin * 2)};
  const scale = Math.min(room.width / image.width, room.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {x: (box.width - width) / 2, y: (box.height - height) / 2, width, height};
}

/**
 * Pinch to zoom, drag to look around a zoomed photo, double tap to zoom in or
 * back out. The +/- buttons drive `zoom`; gestures report back through
 * `onZoomChange` so the percentage stays in step.
 */
export function ZoomableImage({uri, zoom, onZoomChange}: {uri: string; zoom: number; onZoomChange: (zoom: number) => void}) {
  const [view, setView] = useState({scale: zoom, x: 0, y: 0});
  const box = useRef<Box>({width: 0, height: 0});
  const gesture = useRef({view, start: {x: 0, y: 0}, pinch: null as null | {distance: number; scale: number}, moved: false, lastTap: 0});
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const show = (scale: number, x: number, y: number) => {
    const maxX = (scale - 1) * box.current.width / 2;
    const maxY = (scale - 1) * box.current.height / 2;
    const next = {scale, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY)};
    gesture.current.view = next;
    setView(next);
  };
  useEffect(() => {
    const current = gesture.current.view;
    if (Math.abs(current.scale - zoom) > 0.001) show(zoom, current.x, current.y);
  }, [zoom]);
  const responder = useMemo(() => {
    const distance = (event: GestureResponderEvent) => {
      const [a, b] = event.nativeEvent.touches;
      return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: event => {
        const state = gesture.current;
        state.start = {x: state.view.x, y: state.view.y};
        state.pinch = event.nativeEvent.touches.length > 1 ? {distance: distance(event), scale: state.view.scale} : null;
        state.moved = false;
      },
      onPanResponderMove: (event, move) => {
        const state = gesture.current;
        if (event.nativeEvent.touches.length > 1) {
          if (!state.pinch) state.pinch = {distance: distance(event), scale: state.view.scale};
          state.moved = true;
          show(clamp(state.pinch.scale * distance(event) / state.pinch.distance, 1, 3), state.view.x, state.view.y);
          return;
        }
        if (state.pinch) {
          // One finger left the pinch: keep panning from where the photo is now.
          state.pinch = null;
          state.start = {x: state.view.x - move.dx, y: state.view.y - move.dy};
        }
        if (Math.abs(move.dx) + Math.abs(move.dy) > 6) state.moved = true;
        if (state.view.scale > 1) show(state.view.scale, state.start.x + move.dx, state.start.y + move.dy);
      },
      onPanResponderRelease: () => {
        const state = gesture.current;
        state.pinch = null;
        if (!state.moved) {
          const now = Date.now();
          if (now - state.lastTap < 300) {
            state.lastTap = 0;
            show(state.view.scale > 1 ? 1 : 2, 0, 0);
          } else {
            state.lastTap = now;
          }
        }
        if (state.view.scale <= 1.001) show(1, 0, 0);
        onZoomChangeRef.current(Number(state.view.scale.toFixed(2)));
      },
    });
  }, []);
  return <View
    {...responder.panHandlers}
    onLayout={event => { box.current = {width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height}; }}
    style={styles.fill}
  >
    <Image accessibilityLabel={'Selected image preview'} resizeMode={'contain'} source={{uri}} style={[styles.fill, {transform: [{translateX: view.x}, {translateY: view.y}, {scale: view.scale}]}]} />
  </View>;
}

function EditorActions({busy, label, onCancel, onDone, disabled = false}: {busy: boolean; label: string; onCancel: () => void; onDone: () => void; disabled?: boolean}) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.actions, {paddingBottom: Math.max(insets.bottom, 10)}]}>
    <Pressable accessibilityLabel={`Cancel ${label}`} accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
    <Pressable accessibilityLabel={`Apply ${label}`} accessibilityRole="button" accessibilityState={{busy, disabled: disabled || busy}} disabled={disabled || busy} onPress={onDone} style={[styles.doneButton, (disabled || busy) && styles.doneDisabled]}>{busy ? <ActivityIndicator color={'#FFF'} size={'small'} /> : <Text style={styles.doneText}>Done</Text>}</Pressable>
  </View>;
}

function Chips<T extends string>({items, selected, label, onSelect}: {items: {key: T; label: string}[]; selected: T; label: string; onSelect: (key: T) => void}) {
  return <ScrollView contentContainerStyle={styles.chips} horizontal keyboardShouldPersistTaps={'handled'} showsHorizontalScrollIndicator={false} style={styles.chipStrip}>
    {items.map(item => <Pressable accessibilityLabel={`${label} ${item.label}`} accessibilityRole="button" accessibilityState={{selected: item.key === selected}} key={item.key} onPress={() => onSelect(item.key)} style={[styles.chip, item.key === selected && styles.chipSelected]}><Text style={[styles.chipText, item.key === selected && styles.chipTextSelected]}>{item.label}</Text></Pressable>)}
  </ScrollView>;
}

type CropAspect = 'free' | 'square' | '4:3' | '16:9';
const CROP_ASPECTS: {key: CropAspect; label: string}[] = [{key: 'free', label: 'Free'}, {key: 'square', label: 'Square'}, {key: '4:3', label: '4:3'}, {key: '16:9', label: '16:9'}];
const MIN_CROP = 48;
const HANDLE_REACH = 36;

function cropRatio(aspect: CropAspect, image: Box): number | null {
  if (aspect === 'free') return null;
  if (aspect === 'square') return 1;
  const [long, short] = aspect === '4:3' ? [4, 3] : [16, 9];
  // The ratio follows the photo: a portrait shot gets 3:4 rather than a thin strip.
  return image.width >= image.height ? long / short : short / long;
}

function largestCrop(bounds: Box, ratio: number | null): Rect {
  if (!ratio) return {x: 0, y: 0, width: bounds.width, height: bounds.height};
  const width = Math.min(bounds.width, bounds.height * ratio);
  const height = width / ratio;
  return {x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height};
}

/** Drags one corner; the opposite corner stays where it is. */
export function resizeCrop(start: Rect, corner: 'tl' | 'tr' | 'bl' | 'br', dx: number, dy: number, ratio: number | null, bounds: Box): Rect {
  const left = corner === 'tl' || corner === 'bl';
  const top = corner === 'tl' || corner === 'tr';
  const anchorX = left ? start.x + start.width : start.x;
  const anchorY = top ? start.y + start.height : start.y;
  const cornerX = clamp((left ? start.x : start.x + start.width) + dx, 0, bounds.width);
  const cornerY = clamp((top ? start.y : start.y + start.height) + dy, 0, bounds.height);
  const roomX = left ? anchorX : bounds.width - anchorX;
  const roomY = top ? anchorY : bounds.height - anchorY;
  let width = clamp(left ? anchorX - cornerX : cornerX - anchorX, MIN_CROP, roomX);
  let height = clamp(top ? anchorY - cornerY : cornerY - anchorY, MIN_CROP, roomY);
  if (ratio) {
    width = Math.min(Math.max(width, height * ratio), roomX, roomY * ratio);
    height = width / ratio;
  }
  return {x: left ? anchorX - width : anchorX, y: top ? anchorY - height : anchorY, width, height};
}

/** Pick the part of the photo to keep: drag the frame, or drag a corner to resize it. */
export function ImageCropEditor({image, busy, onCancel, onApply}: {image: EditableImage; busy: boolean; onCancel: () => void; onApply: (crop: {originX: number; originY: number; width: number; height: number}) => void}) {
  const [box, setBox] = useState<Box | null>(null);
  const [aspect, setAspect] = useState<CropAspect>('free');
  const [rect, setRect] = useState<Rect | null>(null);
  const fit = useMemo(() => box ? fitContain(image, box, 22) : null, [box, image]);
  useEffect(() => { if (fit) setRect(largestCrop(fit, cropRatio(aspect, image))); }, [aspect, fit, image]);
  const live = useRef({rect, fit, ratio: cropRatio(aspect, image)});
  live.current = {rect, fit, ratio: cropRatio(aspect, image)};
  const drag = useRef<null | {mode: 'move' | 'tl' | 'tr' | 'bl' | 'br'; start: Rect}>(null);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: event => {
      const {rect: current, fit: frame} = live.current;
      if (!current || !frame) return;
      const x = event.nativeEvent.locationX - frame.x;
      const y = event.nativeEvent.locationY - frame.y;
      const corners = {tl: [current.x, current.y], tr: [current.x + current.width, current.y], bl: [current.x, current.y + current.height], br: [current.x + current.width, current.y + current.height]} as const;
      const corner = (Object.keys(corners) as (keyof typeof corners)[]).find(key => Math.hypot(corners[key][0] - x, corners[key][1] - y) <= HANDLE_REACH);
      const inside = x >= current.x && x <= current.x + current.width && y >= current.y && y <= current.y + current.height;
      drag.current = corner ? {mode: corner, start: current} : inside ? {mode: 'move', start: current} : null;
    },
    onPanResponderMove: (_event, move) => {
      const {fit: frame, ratio} = live.current;
      if (!drag.current || !frame) return;
      const {mode, start} = drag.current;
      setRect(mode === 'move'
        ? {...start, x: clamp(start.x + move.dx, 0, frame.width - start.width), y: clamp(start.y + move.dy, 0, frame.height - start.height)}
        : resizeCrop(start, mode, move.dx, move.dy, ratio, frame));
    },
    onPanResponderRelease: () => { drag.current = null; },
  }), []);
  const apply = () => {
    if (!rect || !fit) return;
    const scale = image.width / fit.width;
    const originX = clamp(Math.round(rect.x * scale), 0, image.width - 1);
    const originY = clamp(Math.round(rect.y * scale), 0, image.height - 1);
    const width = clamp(Math.round(rect.width * scale), 1, image.width - originX);
    const height = clamp(Math.round(rect.height * scale), 1, image.height - originY);
    if (originX === 0 && originY === 0 && width === image.width && height === image.height) { onCancel(); return; }
    onApply({originX, originY, width, height});
  };
  const frame = fit && rect ? {left: fit.x + rect.x, top: fit.y + rect.y, width: rect.width, height: rect.height} : null;
  return <View accessibilityLabel={'Crop editor'} style={styles.editor}>
    <View onLayout={event => setBox({width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height})} style={styles.stage}>
      {fit ? <Image accessibilityLabel={'Photo being cropped'} resizeMode={'stretch'} source={{uri: image.uri}} style={[styles.placed, {left: fit.x, top: fit.y, width: fit.width, height: fit.height}]} /> : null}
      {fit && frame ? <View accessibilityLabel={'Crop frame'} {...responder.panHandlers} style={styles.fill}>
        <View pointerEvents={'none'} style={[styles.shade, {left: fit.x, top: fit.y, width: fit.width, height: frame.top - fit.y}]} />
        <View pointerEvents={'none'} style={[styles.shade, {left: fit.x, top: frame.top + frame.height, width: fit.width, height: fit.y + fit.height - frame.top - frame.height}]} />
        <View pointerEvents={'none'} style={[styles.shade, {left: fit.x, top: frame.top, width: frame.left - fit.x, height: frame.height}]} />
        <View pointerEvents={'none'} style={[styles.shade, {left: frame.left + frame.width, top: frame.top, width: fit.x + fit.width - frame.left - frame.width, height: frame.height}]} />
        <View pointerEvents={'none'} style={[styles.cropBorder, frame]}>
          <View style={[styles.gridLine, styles.gridColumn, styles.firstThirdX]} /><View style={[styles.gridLine, styles.gridColumn, styles.secondThirdX]} />
          <View style={[styles.gridLine, styles.gridRow, styles.firstThirdY]} /><View style={[styles.gridLine, styles.gridRow, styles.secondThirdY]} />
          <View style={[styles.corner, styles.cornerTopLeft]} /><View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} /><View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
      </View> : <View style={styles.loading}><ActivityIndicator color={'#FFF'} /></View>}
    </View>
    <Chips items={CROP_ASPECTS} label={'Crop'} onSelect={setAspect} selected={aspect} />
    <EditorActions busy={busy} label={'crop'} onCancel={onCancel} onDone={apply} />
  </View>;
}

export function cropImage(uri: string, crop: {originX: number; originY: number; width: number; height: number}): Promise<EditableImage> {
  const context = ImageManipulator.manipulate(uri);
  context.crop(crop);
  return saveRendered(context);
}

/**
 * Writes what an <Svg> shows - the photo plus a colour filter or text - at the
 * photo's own size. The viewBox is the photo's pixel size, so a larger canvas
 * scales the drawing up instead of cropping it.
 */
function exportSvg(svg: Svg, image: EditableImage): Promise<EditableImage> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Unable to apply this edit. Please try again.')), 20000);
    svg.toDataURL(base64 => { clearTimeout(timer); resolve(base64); }, {width: image.width, height: image.height});
  }).then(async base64 => {
    const file = new File(Paths.cache, `chatterly-edit-${Date.now()}.png`);
    file.write(base64, {encoding: 'base64'});
    try {
      return await saveRendered(ImageManipulator.manipulate(file.uri));
    } finally {
      try { file.delete(); } catch { /* The cache is cleared by the system anyway. */ }
    }
  });
}

function PhotoCanvas({image, fit, svgRef, filter, onLoad, children}: {image: EditableImage; fit: Rect; svgRef: React.RefObject<Svg | null>; filter?: number[] | null; onLoad: () => void; children?: React.ReactNode}) {
  return <Svg height={fit.height} ref={svgRef} style={[styles.placed, {left: fit.x, top: fit.y}]} viewBox={`0 0 ${image.width} ${image.height}`} width={fit.width}>
    {filter ? <Defs><Filter id={'chatterlyPhotoEffect'}><FeColorMatrix type={'matrix'} values={filter} /></Filter></Defs> : null}
    <SvgImage filter={filter ? 'url(#chatterlyPhotoEffect)' : undefined} height={image.height} href={{uri: image.uri}} onLoad={onLoad} preserveAspectRatio={'none'} width={image.width} x={0} y={0} />
    {children}
  </Svg>;
}

const saturate = (amount: number) => [
  0.213 + 0.787 * amount, 0.715 - 0.715 * amount, 0.072 - 0.072 * amount, 0, 0,
  0.213 - 0.213 * amount, 0.715 + 0.285 * amount, 0.072 - 0.072 * amount, 0, 0,
  0.213 - 0.213 * amount, 0.715 - 0.715 * amount, 0.072 + 0.928 * amount, 0, 0,
  0, 0, 0, 1, 0,
];
type EffectKey = 'original' | 'mono' | 'sepia' | 'warm' | 'cool' | 'vivid' | 'fade';
export const PHOTO_EFFECTS: {key: EffectKey; label: string; matrix: number[] | null}[] = [
  {key: 'original', label: 'Original', matrix: null},
  {key: 'mono', label: 'B&W', matrix: saturate(0)},
  {key: 'sepia', label: 'Sepia', matrix: [0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0]},
  {key: 'warm', label: 'Warm', matrix: [1.08, 0, 0, 0, 0.04, 0, 1, 0, 0, 0.01, 0, 0, 0.86, 0, 0, 0, 0, 0, 1, 0]},
  {key: 'cool', label: 'Cool', matrix: [0.88, 0, 0, 0, 0, 0, 1, 0, 0, 0.02, 0, 0, 1.12, 0, 0.05, 0, 0, 0, 1, 0]},
  {key: 'vivid', label: 'Vivid', matrix: saturate(1.6)},
  {key: 'fade', label: 'Fade', matrix: [0.8, 0, 0, 0, 0.12, 0, 0.8, 0, 0, 0.12, 0, 0, 0.8, 0, 0.12, 0, 0, 0, 1, 0]},
];

function useFit(image: EditableImage) {
  const [box, setBox] = useState<Box | null>(null);
  const fit = useMemo(() => box ? fitContain(image, box, 12) : null, [box, image]);
  return {fit, onLayout: (event: {nativeEvent: {layout: Box}}) => setBox({width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height})};
}

/** Colour effects, previewed live on the photo and written into it on Done. */
export function ImageEffectsEditor({image, onCancel, onApply}: {image: EditableImage; onCancel: () => void; onApply: (image: EditableImage) => void}) {
  const svgRef = useRef<Svg | null>(null);
  const {fit, onLayout} = useFit(image);
  const [effect, setEffect] = useState<EffectKey>('original');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matrix = PHOTO_EFFECTS.find(item => item.key === effect)?.matrix || null;
  const apply = async () => {
    if (!matrix) { onCancel(); return; }
    if (!svgRef.current) return;
    setBusy(true); setError('');
    try { onApply(await exportSvg(svgRef.current, image)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to apply this effect.'); setBusy(false); }
  };
  return <View accessibilityLabel={'Effects editor'} style={styles.editor}>
    <View onLayout={onLayout} style={styles.stage}>
      {fit ? <PhotoCanvas filter={matrix} fit={fit} image={image} onLoad={() => setLoaded(true)} svgRef={svgRef} /> : null}
      {!loaded ? <View pointerEvents={'none'} style={styles.loading}><ActivityIndicator color={'#FFF'} /></View> : null}
    </View>
    {error ? <Text accessibilityLiveRegion={'polite'} style={styles.error}>{error}</Text> : null}
    <Chips items={PHOTO_EFFECTS} label={'Effect'} onSelect={setEffect} selected={effect} />
    <EditorActions busy={busy} disabled={!loaded} label={'effect'} onCancel={onCancel} onDone={apply} />
  </View>;
}

const TEXT_COLORS = ['#FFFFFF', '#111827', '#EF4444', '#F59E0B', '#22C55E', '#3B82F6', PURPLE];
const TEXT_COLOR_NAMES: Record<string, string> = {'#FFFFFF': 'White', '#111827': 'Black', '#EF4444': 'Red', '#F59E0B': 'Yellow', '#22C55E': 'Green', '#3B82F6': 'Blue', [PURPLE]: 'Purple'};
const isLight = (color: string) => color === '#FFFFFF' || color === '#F59E0B';

/** Text on the photo: type it, pick a colour and size, drag it into place. */
export function ImageTextEditor({image, onCancel, onApply}: {image: EditableImage; onCancel: () => void; onApply: (image: EditableImage) => void}) {
  const svgRef = useRef<Svg | null>(null);
  const {fit, onLayout} = useFit(image);
  const [text, setText] = useState('');
  const [color, setColor] = useState(TEXT_COLORS[0]);
  const [size, setSize] = useState(0.08);
  const [position, setPosition] = useState({x: image.width / 2, y: image.height / 2});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const live = useRef({fit, position});
  live.current = {fit, position};
  const start = useRef(position);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = live.current.position; },
    onPanResponderMove: (_event, move) => {
      const frame = live.current.fit;
      if (!frame) return;
      const scale = image.width / frame.width;
      setPosition({x: clamp(start.current.x + move.dx * scale, 0, image.width), y: clamp(start.current.y + move.dy * scale, 0, image.height)});
    },
  }), [image.width, image.height]);
  const fontSize = Math.round(Math.min(image.width, image.height * 1.4) * size);
  const label = text.trim();
  const apply = async () => {
    if (!label) { onCancel(); return; }
    if (!svgRef.current) return;
    setBusy(true); setError('');
    try { onApply(await exportSvg(svgRef.current, image)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add this text.'); setBusy(false); }
  };
  const textProps = {fontSize, fontWeight: '700' as const, textAnchor: 'middle' as const, x: position.x, y: position.y + fontSize * 0.35};
  return <View accessibilityLabel={'Text editor'} style={styles.editor}>
    <TextInput accessibilityLabel={'Text to add on the photo'} autoFocus editable={!busy} maxLength={60} onChangeText={setText} placeholder={'Type text'} placeholderTextColor={'#98A2B3'} style={styles.textInput} value={text} />
    <View onLayout={onLayout} style={styles.stage}>
      {fit ? <PhotoCanvas fit={fit} image={image} onLoad={() => setLoaded(true)} svgRef={svgRef}>
        {label ? <SvgText {...textProps} fill={'none'} stroke={isLight(color) ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.8)'} strokeWidth={fontSize * 0.12}>{label}</SvgText> : null}
        {label ? <SvgText {...textProps} fill={color}>{label}</SvgText> : null}
      </PhotoCanvas> : null}
      {fit && label ? <View accessibilityHint={'Drag to move the text'} accessibilityLabel={'Text position'} {...responder.panHandlers} style={[styles.fill, {left: fit.x, top: fit.y, width: fit.width, height: fit.height}]} /> : null}
      {!loaded ? <View pointerEvents={'none'} style={styles.loading}><ActivityIndicator color={'#FFF'} /></View> : null}
    </View>
    {error ? <Text accessibilityLiveRegion={'polite'} style={styles.error}>{error}</Text> : null}
    <View style={styles.textTools}>
      {TEXT_COLORS.map(value => <Pressable accessibilityLabel={`Text colour ${TEXT_COLOR_NAMES[value]}`} accessibilityRole="button" accessibilityState={{selected: value === color}} key={value} onPress={() => setColor(value)} style={[styles.swatch, {backgroundColor: value}, value === color && styles.swatchSelected]} />)}
      <Pressable accessibilityLabel={'Smaller text'} disabled={size <= 0.04} onPress={() => setSize(value => Math.max(0.04, Number((value - 0.02).toFixed(2))))} style={styles.sizeButton}><Text style={styles.sizeText}>A−</Text></Pressable>
      <Pressable accessibilityLabel={'Larger text'} disabled={size >= 0.2} onPress={() => setSize(value => Math.min(0.2, Number((value + 0.02).toFixed(2))))} style={styles.sizeButton}><Text style={styles.sizeTextLarge}>A+</Text></Pressable>
    </View>
    <EditorActions busy={busy} disabled={!loaded || !label} label={'text'} onCancel={onCancel} onDone={apply} />
  </View>;
}

const CORNER = 22;
// The editor is dark in both app themes, so its colours are not remapped.
const styles = StyleSheet.create({
  fill: {position: 'absolute', left: 0, top: 0, right: 0, bottom: 0},
  editor: {flex: 1, backgroundColor: '#14161C'},
  stage: {flex: 1, overflow: 'hidden'},
  loading: {position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center'},
  shade: {position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)'},
  cropBorder: {position: 'absolute', borderWidth: 1.5, borderColor: '#FFF'},
  placed: {position: 'absolute'},
  gridLine: {position: 'absolute', backgroundColor: 'rgba(255,255,255,0.45)'},
  gridColumn: {top: 0, bottom: 0, width: 1},
  gridRow: {left: 0, right: 0, height: 1},
  firstThirdX: {left: '33.3%'},
  secondThirdX: {left: '66.6%'},
  firstThirdY: {top: '33.3%'},
  secondThirdY: {top: '66.6%'},
  corner: {position: 'absolute', width: CORNER, height: CORNER, borderColor: '#FFF'},
  cornerTopLeft: {left: -3, top: -3, borderLeftWidth: 4, borderTopWidth: 4},
  cornerTopRight: {right: -3, top: -3, borderRightWidth: 4, borderTopWidth: 4},
  cornerBottomLeft: {left: -3, bottom: -3, borderLeftWidth: 4, borderBottomWidth: 4},
  cornerBottomRight: {right: -3, bottom: -3, borderRightWidth: 4, borderBottomWidth: 4},
  // A horizontal ScrollView grows to fill a column unless told not to.
  chipStrip: {flexGrow: 0},
  chips: {paddingHorizontal: 12, paddingVertical: 10, gap: 8},
  chip: {height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center'},
  chipSelected: {backgroundColor: '#FFF', borderColor: '#FFF'},
  chipText: {color: '#FFF', fontSize: 12, fontWeight: '600'},
  chipTextSelected: {color: '#14161C'},
  actions: {flexDirection: 'row', gap: 10, paddingHorizontal: 12},
  cancelButton: {flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center'},
  cancelText: {color: '#FFF', fontSize: 14, fontWeight: '600'},
  doneButton: {flex: 1, height: 44, borderRadius: 10, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center'},
  doneDisabled: {opacity: 0.5},
  doneText: {color: '#FFF', fontSize: 14, fontWeight: '700'},
  error: {paddingHorizontal: 14, paddingTop: 8, color: '#FCA5A5', fontSize: 12},
  textInput: {height: 44, marginHorizontal: 12, marginTop: 10, paddingHorizontal: 12, paddingVertical: 0, borderRadius: 10, backgroundColor: '#FFF', color: '#172033', fontSize: 15},
  textTools: {flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10},
  swatch: {width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)'},
  swatchSelected: {borderColor: '#FFF', transform: [{scale: 1.15}]},
  sizeButton: {height: 30, minWidth: 40, marginLeft: 2, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center'},
  sizeText: {color: '#FFF', fontSize: 12, fontWeight: '700'},
  sizeTextLarge: {color: '#FFF', fontSize: 15, fontWeight: '700'},
});
