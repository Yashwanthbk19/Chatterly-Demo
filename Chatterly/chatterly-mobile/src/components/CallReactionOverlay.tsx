import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {subscribeToCallReactions, type CallReaction} from '../services/callReactions';

export function CallReactionOverlay({callId}: {callId?: string}) {
  const [reaction, setReaction] = useState<CallReaction | null>(null);
  useEffect(() => {
    setReaction(null);
    return subscribeToCallReactions(next => { if (next.callId === callId) setReaction({...next}); });
  }, [callId]);
  useEffect(() => {
    if (!reaction) return;
    const timer = setTimeout(() => setReaction(null), 2400);
    return () => clearTimeout(timer);
  }, [reaction]);
  if (!reaction) return null;
  return <View pointerEvents="none" style={styles.overlay}><Text accessibilityLiveRegion="polite" accessibilityLabel={`${reaction.local ? 'You' : 'Caller'} reacted ${reaction.emoji}`} style={styles.emoji}>{reaction.emoji}</Text></View>;
}
const styles = StyleSheet.create({
  overlay: {position: 'absolute', top: '40%', alignSelf: 'center', zIndex: 110, elevation: 21},
  emoji: {fontSize: 80, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 12},
});
