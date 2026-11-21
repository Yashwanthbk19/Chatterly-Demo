import {createThemedStyles} from '../theme/themedStyles';
import {ImageManipulator, SaveFormat} from 'expo-image-manipulator';
import type {ImagePickerAsset} from 'expo-image-picker';
import React, {useMemo, useRef, useState} from 'react';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  Alert,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

type Props = {
  asset: ImagePickerAsset | null;
  onCancel: () => void;
  onUse: (asset: ImagePickerAsset) => void;
  subject?: 'broadcast' | 'group';
};

const FONT = Platform.select({android: 'sans-serif', ios: 'System'});
const PURPLE = '#8750F4';

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function BroadcastPhotoEditor({asset, onCancel, onUse, subject = 'broadcast'}: Props) {
  const {width: windowWidth} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const frameSize = Math.min(windowWidth - 48, 320);
  const [workingAsset, setWorkingAsset] = useState<ImagePickerAsset | null>(asset);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({x: 0, y: 0});
  const [cropping, setCropping] = useState(false);
  const panStart = useRef({x: 0, y: 0});

  React.useEffect(() => {
    setWorkingAsset(asset);
    setZoom(1);
    setPan({x: 0, y: 0});
  }, [asset]);

  const dimensions = useMemo(() => {
    const width = Math.max(1, Number(workingAsset?.width || frameSize));
    const height = Math.max(1, Number(workingAsset?.height || frameSize));
    const baseScale = Math.max(frameSize / width, frameSize / height);
    return {width, height, baseScale};
  }, [frameSize, workingAsset]);

  const constrainedPan = (next: {x: number; y: number}, nextZoom = zoom) => {
    const displayedWidth = dimensions.width * dimensions.baseScale * nextZoom;
    const displayedHeight = dimensions.height * dimensions.baseScale * nextZoom;
    return {
      x: clamp(next.x, -(displayedWidth - frameSize) / 2, (displayedWidth - frameSize) / 2),
      y: clamp(next.y, -(displayedHeight - frameSize) / 2, (displayedHeight - frameSize) / 2),
    };
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
    onPanResponderGrant: () => { panStart.current = pan; },
    onPanResponderMove: (_event, gesture) => {
      setPan(constrainedPan({x: panStart.current.x + gesture.dx, y: panStart.current.y + gesture.dy}));
    },
  // The responder is intentionally rebuilt when the crop geometry changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dimensions, frameSize, pan, zoom]);

  const changeZoom = (delta: number) => {
    const nextZoom = clamp(Number((zoom + delta).toFixed(2)), 1, 3);
    setZoom(nextZoom);
    setPan(current => constrainedPan(current, nextZoom));
  };

  const cropPhoto = async (showConfirmation: boolean): Promise<ImagePickerAsset | null> => {
    if (!workingAsset || cropping) return null;
    setCropping(true);
    try {
      const renderedScale = dimensions.baseScale * zoom;
      const cropSize = Math.min(dimensions.width, dimensions.height, frameSize / renderedScale);
      const originX = clamp((dimensions.width - cropSize) / 2 - pan.x / renderedScale, 0, dimensions.width - cropSize);
      const originY = clamp((dimensions.height - cropSize) / 2 - pan.y / renderedScale, 0, dimensions.height - cropSize);
      const context = ImageManipulator.manipulate(workingAsset.uri);
      context.crop({
        originX: Math.round(originX),
        originY: Math.round(originY),
        width: Math.max(1, Math.round(cropSize)),
        height: Math.max(1, Math.round(cropSize)),
      });
      const rendered = await context.renderAsync();
      const result = await rendered.saveAsync({compress: 0.86, format: SaveFormat.JPEG});
      const croppedAsset: ImagePickerAsset = {
        ...workingAsset,
        uri: result.uri,
        width: result.width,
        height: result.height,
        fileName: `${subject}-photo-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      };
      setWorkingAsset(croppedAsset);
      setZoom(1);
      setPan({x: 0, y: 0});
      if (showConfirmation) {
        Alert.alert(
          'Crop complete',
          `Your ${subject} picture was cropped successfully. Review it, then tap Use Photo.`,
          [{text: 'OK'}],
        );
      }
      return croppedAsset;
    } catch (error) {
      Alert.alert('Unable to crop photo', error instanceof Error ? error.message : 'Please try another photo.');
      return null;
    } finally {
      setCropping(false);
    }
  };
  const applyCrop = () => cropPhoto(true);
  const finishGroupCrop = async () => {
    const croppedAsset = await cropPhoto(false);
    if (croppedAsset) onUse(croppedAsset);
  };

  if (!asset || !workingAsset) return null;
  const imageWidth = dimensions.width * dimensions.baseScale;
  const imageHeight = dimensions.height * dimensions.baseScale;
  const accessibleSubject = subject === 'group' ? 'group' : 'broadcast';

  return (
    <Modal animationType="slide" onRequestClose={onCancel} statusBarTranslucent visible>
      <View accessibilityLabel={`Crop ${accessibleSubject} picture`} style={styles.root}>
        <View style={[styles.header, {height: 58 + insets.top, paddingTop: insets.top, paddingLeft: 14 + insets.left, paddingRight: 14 + insets.right}]}>
          <Pressable accessibilityLabel={`Cancel ${accessibleSubject} picture crop`} onPress={onCancel} style={styles.headerButton}><Text style={styles.cancel}>Cancel</Text></Pressable>
          <Text accessibilityRole="header" style={styles.title}>Crop Photo</Text>
          {subject === 'group' ? <View style={styles.headerButton}/> : <Pressable accessibilityLabel="Use cropped broadcast picture" disabled={cropping} onPress={() => onUse(workingAsset)} style={styles.headerButton}><Text style={styles.use}>Use Photo</Text></Pressable>}
        </View>
        <View style={styles.body}>
          <Text style={styles.hint}>Drag the photo and use zoom to frame the {accessibleSubject} picture.</Text>
          <View {...panResponder.panHandlers} accessibilityLabel={`${subject === 'group' ? 'Group' : 'Broadcast'} picture crop area`} style={[styles.cropFrame, {height: frameSize, width: frameSize}]}>
            <Image
              source={{uri: workingAsset.uri}}
              style={{
                ...styles.cropImage,
                width: imageWidth,
                height: imageHeight,
                transform: [{translateX: pan.x}, {translateY: pan.y}, {scale: zoom}],
              }}
            />
            <View pointerEvents="none" style={styles.cropOutline}/>
          </View>
          <View style={styles.zoomRow}>
            <Pressable accessibilityLabel={`Zoom out ${accessibleSubject} picture`} disabled={zoom <= 1 || cropping} onPress={() => changeZoom(-0.25)} style={styles.zoomButton}><Text style={styles.zoomGlyph}>−</Text></Pressable>
            <Text accessibilityLabel={`${subject === 'group' ? 'Group' : 'Broadcast'} picture zoom ${Math.round(zoom * 100)} percent`} style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
            <Pressable accessibilityLabel={`Zoom in ${accessibleSubject} picture`} disabled={zoom >= 3 || cropping} onPress={() => changeZoom(0.25)} style={styles.zoomButton}><Text style={styles.zoomGlyph}>+</Text></Pressable>
          </View>
          <Pressable accessibilityLabel={subject === 'group' ? 'Done cropping group picture' : 'Apply broadcast picture crop'} disabled={cropping} onPress={subject === 'group' ? finishGroupCrop : applyCrop} style={[styles.cropButton, cropping && styles.disabled]}>
            <Text style={styles.cropButtonText}>{cropping ? 'Cropping…' : subject === 'group' ? 'Done' : 'Apply Crop'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = createThemedStyles({
  root: {flex: 1, backgroundColor: '#111318'},
  header: {height: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF'},
  headerButton: {minWidth: 72, height: 42, justifyContent: 'center'},
  cancel: {color: '#526176', fontFamily: FONT, fontSize: 14},
  title: {color: '#111827', fontFamily: FONT, fontSize: 16, fontWeight: '700'},
  use: {color: PURPLE, fontFamily: FONT, fontSize: 14, fontWeight: '700', textAlign: 'right'},
  body: {flex: 1, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center'},
  hint: {marginBottom: 20, color: '#E5E7EB', fontFamily: FONT, fontSize: 13, lineHeight: 18, textAlign: 'center'},
  cropFrame: {overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#262A33'},
  cropImage: {position: 'absolute'},
  cropOutline: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 2, borderColor: '#FFFFFF'},
  zoomRow: {height: 64, flexDirection: 'row', alignItems: 'center', gap: 22},
  zoomButton: {width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E323B', alignItems: 'center', justifyContent: 'center'},
  zoomGlyph: {color: '#FFFFFF', fontFamily: FONT, fontSize: 25, lineHeight: 28},
  zoomText: {minWidth: 48, color: '#FFFFFF', fontFamily: FONT, fontSize: 13, textAlign: 'center'},
  cropButton: {height: 46, minWidth: 180, paddingHorizontal: 24, borderRadius: 7, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center'},
  cropButtonText: {color: '#FFFFFF', fontFamily: FONT, fontSize: 14, fontWeight: '700'},
  disabled: {opacity: 0.55},
}, {keep: ['cropOutline']});
