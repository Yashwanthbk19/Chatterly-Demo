import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, PanResponder, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle} from 'react-native';
export function DraggableCallPreview({children, style}: {children: React.ReactNode; style: StyleProp<ViewStyle>}) {
  const {width, height} = useWindowDimensions();
  const position = useRef(new Animated.ValueXY()).current;
  const point = useRef({x: 0, y: 0});
  const start = useRef(point.current);
  const bounds = useRef({x: 0, y: 0, width: 0, height: 0});
  const clamp = useMemo(() => (x: number, y: number) => ({
    x: Math.max(-bounds.current.x, Math.min(x, width - bounds.current.x - bounds.current.width)),
    y: Math.max(-bounds.current.y, Math.min(y, height - bounds.current.y - bounds.current.height)),
  }), [width, height]);
  useEffect(() => { point.current = clamp(point.current.x, point.current.y); position.setValue(point.current); }, [clamp, position]);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = point.current; },
    onPanResponderMove: (_event, gesture) => {
      point.current = clamp(start.current.x + gesture.dx, start.current.y + gesture.dy);
      position.setValue(point.current);
    },
    onPanResponderTerminationRequest: () => false,
  }), [clamp, position]);
  return <Animated.View accessibilityLabel="Floating self preview" accessibilityHint="Drag to reposition the self preview"
    onLayout={event => { bounds.current = event.nativeEvent.layout; point.current = clamp(point.current.x, point.current.y); position.setValue(point.current); }}
    style={[style, {zIndex: 4, transform: position.getTranslateTransform()}]} {...responder.panHandlers}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>{children}</View>
  </Animated.View>;
}
