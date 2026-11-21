import {createThemedStyles} from '../theme/themedStyles';
import React from 'react';
import {Platform, Text, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import type {ChatMessage} from '../types/chat';
import {callLogDisplayKind, callLogDisplayLabel, type CallLogDisplayKind} from '../utils/callLog';

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

const APPEARANCE: Record<CallLogDisplayKind, {color: string; label: string}> = {
  missed: {color: '#E5484D', label: 'Missed call'},
  incoming: {color: '#139C69', label: 'Incoming call'},
  outgoing: {color: '#7B2AE8', label: 'Outgoing call'},
  declined: {color: '#E5484D', label: 'Declined call'},
};

function CallStatusIcon({kind, video}: {kind: CallLogDisplayKind; video: boolean}) {
  const {color, label} = APPEARANCE[kind];
  const incoming = kind === 'incoming' || kind === 'missed';
  return (
    <View accessibilityLabel={`${video ? 'Video' : 'Audio'} ${label.toLowerCase()} icon`} style={styles.icon}>
      <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
        <Path
          d={video
            ? 'M3.5 7.5A1.5 1.5 0 0 1 5 6h9a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 14 18H5a1.5 1.5 0 0 1-1.5-1.5v-9ZM15.5 10l5-3v10l-5-3v-4Z'
            : 'M7.2 4.8 10 9.2 8.2 11.3a13.5 13.5 0 0 0 4.5 4.5l2.1-1.8 4.4 2.8-.5 2.3c-.12.55-.63.93-1.2.87C10.4 19.1 4.9 13.6 4.1 6.5c-.07-.57.32-1.08.87-1.2l2.23-.5Z'}
          stroke={color}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        {kind === 'declined' ? (
          <Path d="m14.8 5.2 4 4m0-4-4 4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        ) : (
          <Path
            d={incoming ? 'M19 5.5h-4v4M19 5.5l-5 5' : 'M14 10.5l5-5M15 5.5h4v4'}
            stroke={color}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>
    </View>
  );
}

export function CallLogNotice({message}: {message: ChatMessage}) {
  const kind = callLogDisplayKind(message);
  const video = /\bvideo\b/i.test(message.text);
  const label = APPEARANCE[kind].label;
  const display = callLogDisplayLabel(message);
  const date = new Date(message.createdAt);
  const time = Number.isNaN(date.valueOf()) ? '' : date.toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  return (
    <View accessibilityLabel={`${label}: ${display.title}${display.detail ? `, ${display.detail}` : ''}`} style={styles.row}>
      <View style={styles.content}>
        <CallStatusIcon kind={kind} video={video}/>
        <View>
          <Text style={[styles.text, (kind === 'missed' || kind === 'declined') && styles.negativeText]}>{display.title}</Text>
          {display.detail ? <Text style={styles.detail}>{display.detail}</Text> : null}
          {time ? <Text style={styles.detail}>{time}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = createThemedStyles({
  row: {
    minHeight: 34,
    marginVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {minWidth: 126, maxWidth: '76%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center'},
  icon: {width: 19, height: 19, marginRight: 4, alignItems: 'center', justifyContent: 'center'},
  text: {
    color: '#42516A',
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
  negativeText: {color: '#C7373D'},
  detail: {marginTop: 1, color: '#7A8799', fontFamily: FONT_FAMILY, fontSize: 8, lineHeight: 11},
});
