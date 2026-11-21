import React, {useState} from 'react';
import {ActivityIndicator, Image, Platform, Text, View} from 'react-native';
import type {ImageResizeMode, ImageStyle, StyleProp} from 'react-native';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {
  mediaUrl: string;
  thumbnailUrl?: string;
  resizeMode?: ImageResizeMode;
  style: StyleProp<ImageStyle>;
};

export function ProgressiveMediaImage({mediaUrl, thumbnailUrl, resizeMode = 'cover', style}: Props) {
  const hasPreview = Boolean(thumbnailUrl && thumbnailUrl !== mediaUrl);
  const [loadedUrl, setLoadedUrl] = useState('');
  const [failedUrl, setFailedUrl] = useState('');
  const loaded = loadedUrl === mediaUrl;
  const failed = failedUrl === mediaUrl;

  return <View style={[style as never, styles.frame]}>
    {hasPreview ? <Image accessible={false} resizeMode={resizeMode} source={{uri: thumbnailUrl}} style={styles.layer} /> : null}
    {!failed ? <Image
      accessible={false}
      fadeDuration={180}
      onError={() => setFailedUrl(mediaUrl)}
      onLoad={() => setLoadedUrl(mediaUrl)}
      progressiveRenderingEnabled={Platform.OS === 'android'}
      resizeMode={resizeMode}
      source={{uri: mediaUrl}}
      style={[styles.layer, hasPreview && !loaded && styles.hidden]}
    /> : null}
    {!hasPreview && !loaded && !failed ? <View pointerEvents={'none'} style={styles.loading}><ActivityIndicator color={'#8B27E9'} size={'small'} /></View> : null}
    {!hasPreview && failed ? <View accessibilityLabel={'Media unavailable'} style={styles.loading}><Text style={styles.unavailable}>Media unavailable</Text></View> : null}
  </View>;
}

const styles = createThemedStyles({
  frame: {overflow: 'hidden'},
  layer: {position: 'absolute', inset: 0, width: '100%', height: '100%'},
  hidden: {opacity: 0},
  loading: {position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center'},
  unavailable: {color: '#758196', fontSize: 9, fontWeight: '600'},
});
