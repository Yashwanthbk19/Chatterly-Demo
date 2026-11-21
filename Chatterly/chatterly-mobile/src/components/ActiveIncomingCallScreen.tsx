import {createThemedStyles, themeInk} from '../theme/themedStyles';
import NetInfo from '@react-native-community/netinfo';
import {RecordingPresets, useAudioRecorder} from 'expo-audio';
import {type CameraType} from 'expo-camera';
import {CallVideoView} from './CallVideoView';
import {CallMuteIcon} from './CallMuteIcon';
import {sendCallReaction, startCallScreenCapture, stopCallScreenCapture, subscribeToCallMedia, switchCallCamera, type CallMediaStreams} from '../services/callAudio';
import {getCallMicrophoneMode, openCallMicrophoneMode} from '../services/callMicrophoneMode';
import {CallReactionOverlay} from './CallReactionOverlay';
import {applyCallAudioRoute, EARPIECE_ROUTE, listCallAudioRoutes, SPEAKER_ROUTE, type CallAudioRoute} from '../services/callAudioRoutes';
import {setCallScreenShareOverSocket} from '../services/chatRealtime';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, AppState, Image, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import type {EdgeInsets} from 'react-native-safe-area-context';
import Svg, {Path, Rect} from 'react-native-svg';
import {getCallStatus, getChatProfile} from '../services/chatApi';
import {getSession} from '../services/sessionStore';
import type {ChatProfile} from '../types/chat';
import type {IncomingCall} from '../types/call';
import {CallAddPeopleSheet} from './CallAddPeopleSheet';
import {CallContactSheet} from './CallContactSheet';
import {OneToOneCallMoreOptionsSheet} from './OneToOneCallMoreOptionsSheet';

type Props = {
  busy: boolean;
  call: IncomingCall;
  insets: EdgeInsets;
  onEnd: () => void;
  onMinimize: () => void;
  onOpenChat?: () => void;
  closeOptionsRequest?: number;
  onOptionsVisibilityChange?: (visible: boolean) => void;
  /** The route was applied here; the app records the speaker state. */
  onSelectAudioOutput?: (route: CallAudioRoute) => void;
  onToggleHold?: () => void;
  onToggleMute?: () => void;
  onToggleVideo?: () => void;
};

type ControlName = 'more' | 'mute' | 'video' | 'speaker' | 'bluetooth' | 'hold' | 'end' | 'chat' | 'switch' | 'down' | 'hide';

const PREVIEW_WIDTH = 92;
const PREVIEW_HEIGHT = 132;
const PREVIEW_MARGIN = 12;
const PREVIEW_CONTROLS_GAP = 12;
const CONTROLS_PANEL_HEIGHT = 190;

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});

const formatTimer = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

function ControlIcon({crossed = false, name}: {crossed?: boolean; name: ControlName}) {
  if (name === 'speaker') {
    return <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
      <Path d="M5.33333 20.0003H8L12.6667 26.0003C12.7832 26.2266 12.9769 26.4039 13.2127 26.4999C13.4484 26.5959 13.7108 26.6045 13.9523 26.524C14.1939 26.4435 14.3986 26.2792 14.5296 26.0609C14.6606 25.8426 14.7093 25.5846 14.6667 25.3336V6.66696C14.7093 6.41595 14.6606 6.15798 14.5296 5.93968C14.3986 5.72137 14.1939 5.55712 13.9523 5.47661C13.7108 5.3961 13.4484 5.40464 13.2127 5.50068C12.9769 5.59672 12.7832 5.77393 12.6667 6.00029L8 12.0003H5.33333C4.97971 12.0003 4.64057 12.1408 4.39052 12.3908C4.14048 12.6409 4 12.98 4 13.3336V18.667C4 19.0206 4.14048 19.3597 4.39052 19.6098C4.64057 19.8598 4.97971 20.0003 5.33333 20.0003Z" fill={themeInk('#334155')}/>
      <Path d="M20 10.667C20.828 11.2879 21.5 12.0932 21.9628 13.0189C22.4257 13.9446 22.6667 14.9653 22.6667 16.0003C22.6667 17.0353 22.4257 18.056 21.9628 18.9817C21.5 19.9074 20.828 20.7126 20 21.3336M23.6 6.66696C24.992 7.79182 26.1147 9.21379 26.886 10.8287C27.6572 12.4436 28.0575 14.2106 28.0575 16.0003C28.0575 17.7899 27.6572 19.5569 26.886 21.1719C26.1147 22.7868 24.992 24.2088 23.6 25.3336M8 20.0003H5.33333C4.97971 20.0003 4.64057 19.8598 4.39052 19.6098C4.14048 19.3597 4 19.0206 4 18.667V13.3336C4 12.98 4.14048 12.6409 4.39052 12.3908C4.64057 12.1408 4.97971 12.0003 5.33333 12.0003H8L12.6667 6.00029C12.7832 5.77393 12.9769 5.59672 13.2127 5.50068C13.4484 5.40464 13.7108 5.3961 13.9523 5.47661C14.1939 5.55712 14.3986 5.72137 14.5296 5.93968C14.6606 6.15798 14.7093 6.41595 14.6667 6.66696V25.3336C14.7093 25.5846 14.6606 25.8426 14.5296 26.0609C14.3986 26.2792 14.1939 26.4435 13.9523 26.524C13.7108 26.6045 13.4484 26.5959 13.2127 26.4999C12.9769 26.4039 12.7832 26.2266 12.6667 26.0003L8 20.0003Z" stroke={themeInk('#334155')} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>;
  }
  if (name === 'video') {
    return <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
      <Path d="M26.8227 10.169C26.5644 10.1391 26.303 10.1855 26.0707 10.3023L20 13.3356V18.669L26.0707 21.7023C26.2737 21.8037 26.4993 21.8517 26.726 21.8416C26.9527 21.8315 27.1731 21.7637 27.3663 21.6446C27.5595 21.5255 27.7192 21.359 27.83 21.161C27.9409 20.963 27.9994 20.7399 28 20.513V11.4916C27.9996 11.1653 27.8796 10.8504 27.6626 10.6066C27.4456 10.3629 27.1468 10.2071 26.8227 10.169Z" fill={themeInk('#334155')}/>
      <Path d="M6.66675 6.66797C4.47341 6.66797 2.66675 8.47464 2.66675 10.668V21.3346C2.66675 23.528 4.47341 25.3346 6.66675 25.3346H17.3334C19.5267 25.3346 21.3334 23.528 21.3334 21.3346V10.668C21.3334 8.47464 19.5267 6.66797 17.3334 6.66797H6.66675Z" fill={themeInk('#334155')}/>
    </Svg>;
  }
  if (name === 'mute') { return <CallMuteIcon muted={crossed}/>; }
  if (name === 'more') {
    return <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
      <Path d="M14.6667 15.9987C14.6667 16.3523 14.8072 16.6915 15.0573 16.9415C15.3073 17.1916 15.6465 17.332 16.0001 17.332C16.3537 17.332 16.6928 17.1916 16.9429 16.9415C17.1929 16.6915 17.3334 16.3523 17.3334 15.9987C17.3334 15.6451 17.1929 15.3059 16.9429 15.0559C16.6928 14.8058 16.3537 14.6654 16.0001 14.6654C15.6465 14.6654 15.3073 14.8058 15.0573 15.0559C14.8072 15.3059 14.6667 15.6451 14.6667 15.9987ZM14.6667 25.332C14.6667 25.6857 14.8072 26.0248 15.0573 26.2748C15.3073 26.5249 15.6465 26.6654 16.0001 26.6654C16.3537 26.6654 16.6928 26.5249 16.9429 26.2748C17.1929 26.0248 17.3334 25.6857 17.3334 25.332C17.3334 24.9784 17.1929 24.6393 16.9429 24.3892C16.6928 24.1392 16.3537 23.9987 16.0001 23.9987C15.6465 23.9987 15.3073 24.1392 15.0573 24.3892C14.8072 24.6393 14.6667 24.9784 14.6667 25.332ZM14.6667 6.66536C14.6667 7.01899 14.8072 7.35812 15.0573 7.60817C15.3073 7.85822 15.6465 7.9987 16.0001 7.9987C16.3537 7.9987 16.6928 7.85822 16.9429 7.60817C17.1929 7.35812 17.3334 7.01899 17.3334 6.66536C17.3334 6.31174 17.1929 5.9726 16.9429 5.72256C16.6928 5.47251 16.3537 5.33203 16.0001 5.33203C15.6465 5.33203 15.3073 5.47251 15.0573 5.72256C14.8072 5.9726 14.6667 6.31174 14.6667 6.66536Z" fill={themeInk('#1E293B')} stroke={themeInk('#1E293B')} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>;
  }
  if (name === 'end') {
    return <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
      <Path d="M24.3394 21.3346L27.3719 18.2172C27.7741 17.8038 28 17.2431 28 16.6585C28 16.0739 27.7741 15.5132 27.3719 15.0998C20.8808 9.1907 11.1192 9.1907 4.62805 15.0998C4.22592 15.5132 4 16.0739 4 16.6585C4 17.2431 4.22592 17.8038 4.62805 18.2172L7.66057 21.3346L12.9675 18.9966L12.2094 15.8791C14.6676 15.0214 17.3324 15.0214 19.7906 15.8791L19.0325 18.9966L24.3394 21.3346Z" fill="white"/>
    </Svg>;
  }
  if (name === 'chat') {
    return <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
      <Path d="M24.0001 4C25.4146 4 26.7711 4.5619 27.7713 5.5621C28.7715 6.56229 29.3334 7.91885 29.3334 9.33333V20C29.3334 21.4145 28.7715 22.771 27.7713 23.7712C26.7711 24.7714 25.4146 25.3333 24.0001 25.3333H17.7014L11.3521 29.1427C11.1609 29.2574 10.9439 29.3224 10.7211 29.3316C10.4983 29.3408 10.2767 29.294 10.0767 29.1954C9.87665 29.0969 9.70453 28.9497 9.57607 28.7674C9.44762 28.5851 9.36694 28.3735 9.34141 28.152L9.33341 28V25.3333H8.00008C6.63176 25.3333 5.31578 24.8074 4.32433 23.8644C3.33289 22.9213 2.74183 21.6333 2.67341 20.2667L2.66675 20V9.33333C2.66675 7.91885 3.22865 6.56229 4.22885 5.5621C5.22904 4.5619 6.58559 4 8.00008 4H24.0001ZM18.6667 16H10.6667C10.3131 16 9.97399 16.1405 9.72394 16.3905C9.47389 16.6406 9.33341 16.9797 9.33341 17.3333C9.33341 17.687 9.47389 18.0261 9.72394 18.2761C9.97399 18.5262 10.3131 18.6667 10.6667 18.6667H18.6667C19.0204 18.6667 19.3595 18.5262 19.6096 18.2761C19.8596 18.0261 20.0001 17.687 20.0001 17.3333C20.0001 16.9797 19.8596 16.6406 19.6096 16.3905C19.3595 16.1405 19.0204 16 18.6667 16ZM21.3334 10.6667H10.6667C10.3131 10.6667 9.97399 10.8071 9.72394 11.0572C9.47389 11.3072 9.33341 11.6464 9.33341 12C9.33341 12.3536 9.47389 12.6928 9.72394 12.9428C9.97399 13.1929 10.3131 13.3333 10.6667 13.3333H21.3334C21.687 13.3333 22.0262 13.1929 22.2762 12.9428C22.5263 12.6928 22.6667 12.3536 22.6667 12C22.6667 11.6464 22.5263 11.3072 22.2762 11.0572C22.0262 10.8071 21.687 10.6667 21.3334 10.6667Z" fill={themeInk('#334155')}/>
    </Svg>;
  }
  const paths: Record<ControlName, string[]> = {
    more: ['M12 7.5h.01M12 12h.01M12 16.5h.01'],
    hold: ['M8 5v14M16 5v14'],
    mute: ['M9 5.8a3 3 0 0 1 6 0V11a3 3 0 0 1-6 0V5.8Z', 'M6.8 10.5a5.2 5.2 0 0 0 10.4 0M12 15.8V20M9.2 20h5.6'],
    video: ['M5 7h9.5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z', 'm16.5 10 4-2.2v8.4l-4-2.2'],
    speaker: ['M6 10h3.2L14 6v12l-4.8-4H6v-4Z', 'M17 9.2a4.2 4.2 0 0 1 0 5.6M19.5 6.8a7.6 7.6 0 0 1 0 10.4'],
    bluetooth: ['M7 8l10 8-5 4V4l5 4L7 16'],
    end: ['M6.2 13.8c3.5-2.4 8.1-2.4 11.6 0l-1.6 2.7c-.2.4-.7.6-1.1.4l-2-.9c-.7-.3-1.5-.3-2.2 0l-2 .9c-.4.2-.9 0-1.1-.4l-1.6-2.7Z'],
    chat: ['M5.2 6.5h13.6a2.2 2.2 0 0 1 2.2 2.2v6.2a2.2 2.2 0 0 1-2.2 2.2h-6L8 20v-2.9H5.2A2.2 2.2 0 0 1 3 14.9V8.7a2.2 2.2 0 0 1 2.2-2.2Z', 'M7.8 10.2h8.4M7.8 13.4h5.6'],
    switch: ['M7 7h9.5l-2.3-2.3M17 17H7.5l2.3 2.3', 'M17 7l-2.3 2.3M7 17l2.3-2.3'],
    down: ['m7 10 5 5 5-5'],
    hide: ['M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z', 'M4 4l16 16'],
  };
  const color = name === 'hide' ? '#FFFFFF' : themeInk('#152033');
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    {paths[name].map(path => <Path d={path} key={path} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.65}/>)}
    {crossed ? <Path d="M4.5 4.5 19.5 19.5" stroke={color} strokeLinecap="round" strokeWidth={1.9}/> : null}
  </Svg>;
}

function ActiveControl({accessibilityLabel, active = false, crossed = false, danger = false, disabled = false, label, name, onPress}: {accessibilityLabel?: string; active?: boolean; crossed?: boolean; danger?: boolean; disabled?: boolean; label: string; name: ControlName; onPress: () => void}) {
  return <Pressable accessibilityLabel={accessibilityLabel || label} accessibilityRole="button" accessibilityState={{disabled, selected: active}} disabled={disabled} onPress={onPress} style={styles.control}>
    <View style={[styles.controlButton, active && styles.controlButtonActive, danger && styles.controlButtonDanger, disabled && styles.disabled]}><ControlIcon crossed={crossed} name={name}/></View>
    <Text style={[styles.controlLabel, danger && styles.endLabel]}>{label}</Text>
  </Pressable>;
}

function AddPersonIcon() {
  return <Svg width={36} height={36} viewBox="0 0 48 48" fill="none">
    <Path d="M0 24C0 16.5449 0 12.8174 1.21793 9.87706C2.84183 5.95662 5.95662 2.84183 9.87706 1.21793C12.8174 0 16.5449 0 24 0C31.4551 0 35.1826 0 38.1229 1.21793C42.0434 2.84183 45.1582 5.95662 46.7821 9.87706C48 12.8174 48 16.5449 48 24C48 31.4551 48 35.1826 46.7821 38.1229C45.1582 42.0434 42.0434 45.1582 38.1229 46.7821C35.1826 48 31.4551 48 24 48C16.5449 48 12.8174 48 9.87706 46.7821C5.95662 45.1582 2.84183 42.0434 1.21793 38.1229C0 35.1826 0 31.4551 0 24Z" fill={themeInk('#FFFFFF')} fillOpacity={0.8}/>
    <Path d="M26.3334 32.1667H33.3334M29.8334 28.6667V35.6667M14.6667 34.5V32.1667C14.6667 30.929 15.1584 29.742 16.0336 28.8668C16.9088 27.9917 18.0957 27.5 19.3334 27.5H24.0001M17.0001 18.1667C17.0001 19.4043 17.4917 20.5913 18.3669 21.4665C19.2421 22.3417 20.4291 22.8333 21.6667 22.8333C22.9044 22.8333 24.0914 22.3417 24.9666 21.4665C25.8417 20.5913 26.3334 19.4043 26.3334 18.1667C26.3334 16.929 25.8417 15.742 24.9666 14.8668C24.0914 13.9917 22.9044 13.5 21.6667 13.5C20.4291 13.5 19.2421 13.9917 18.3669 14.8668C17.4917 15.742 17.0001 16.929 17.0001 18.1667Z" stroke={themeInk('#1E293B')} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>;
}

function OutputIcon({route}: {route: CallAudioRoute}) {
  if (route.kind === 'bluetooth') {
    return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="M7 8l10 8-5 4V4l5 4L7 16" stroke={themeInk('#111827')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
  }
  if (route.kind === 'earpiece') {
    return <Svg width={16} height={20} viewBox="0 0 18 24" fill="none"><Path d="M5 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm2 17h4" stroke={themeInk('#111827')} strokeWidth={1.5} strokeLinecap="round"/></Svg>;
  }
  if (route.kind === 'wired') {
    return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2v-2Zm16 0a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z" stroke={themeInk('#111827')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
  }
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d={route.kind === 'none' ? 'M5 10h3l4-3v10l-4-3H5v-4Zm11-2 5 8m0-8-5 8' : 'M5 10h3l4-3v10l-4-3H5v-4Zm10-1a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11'} stroke={themeInk('#111827')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function AudioOutputSheet({insets, onClose, onSelect, routes, selected, visible}: {insets: EdgeInsets; onClose: () => void; onSelect: (route: CallAudioRoute) => void; routes: CallAudioRoute[]; selected: string; visible: boolean}) {
  return <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
    <View style={styles.sheetBackdrop}>
      <Pressable accessibilityLabel="Close Audio Output backdrop" onPress={onClose} style={StyleSheet.absoluteFill}/>
      <View accessibilityLabel="Audio Output options" style={[styles.outputSheet, {paddingBottom: Math.max(insets.bottom, 12)}]}>
        <View style={styles.sheetHeader}>
          <Pressable accessibilityLabel="Back from Audio Output" onPress={onClose} style={styles.sheetHeaderButton}><Svg width={20} height={20} viewBox="0 0 24 24"><Path d="m14 6-6 6 6 6" fill="none" stroke={themeInk('#344256')} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}/></Svg></Pressable>
          <Text style={styles.sheetTitle}>Audio Output</Text>
          <Pressable accessibilityLabel="Close Audio Output" onPress={onClose} style={styles.sheetHeaderButton}><Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6 6 18" fill="none" stroke={themeInk('#344256')} strokeLinecap="round" strokeWidth={1.6}/></Svg></Pressable>
        </View>
        {routes.map(route => <Pressable accessibilityLabel={`Use ${route.label}`} accessibilityRole="radio" accessibilityState={{selected: route.id === selected}} key={route.id} onPress={() => onSelect(route)} style={styles.outputRow}>
          <View style={styles.outputIcon}><OutputIcon route={route}/></View>
          <Text numberOfLines={1} style={styles.outputLabel}>{route.label}</Text>
          <View style={styles.outputCheck}>{route.id === selected ? <Svg width={15} height={15} viewBox="0 0 24 24"><Path d="m5 12 4 4L19 7" fill="none" stroke={themeInk('#111827')} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}/></Svg> : null}</View>
        </Pressable>)}
      </View>
    </View>
  </Modal>;
}

function OptionToggle({enabled}: {enabled: boolean}) {
  return <Svg accessibilityRole="switch" width={44} height={24} viewBox="0 0 44 24" fill="none">
    <Rect x={0.25} y={0.25} width={43.5} height={23.5} rx={3.75} fill={enabled ? '#8B5CF6' : '#E2E8F0'}/>
    <Rect x={0.25} y={0.25} width={43.5} height={23.5} rx={3.75} stroke={enabled ? '#7C3AED' : '#CBD5E1'} strokeWidth={0.5}/>
    <Rect x={enabled ? 22 : 2} y={2} width={20} height={20} rx={2} fill={themeInk('#FFFFFF')}/>
  </Svg>;
}

function SubSheetHeader({onBack, title}: {onBack: () => void; title: string}) {
  return <View style={styles.subSheetHeader}>
    <Pressable accessibilityLabel={`Back from ${title}`} hitSlop={8} onPress={onBack} style={styles.sheetHeaderButton}><Svg width={20} height={20} viewBox="0 0 24 24"><Path d="m14 6-6 6 6 6" fill="none" stroke={themeInk('#344256')} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}/></Svg></Pressable>
    <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
    <Pressable accessibilityLabel={`Close ${title}`} hitSlop={8} onPress={onBack} style={styles.sheetHeaderButton}><Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6 6 18" fill="none" stroke={themeInk('#344256')} strokeLinecap="round" strokeWidth={1.6}/></Svg></Pressable>
  </View>;
}

function MicrophoneSettingsSheet({echoCancellation, insets, noiseSuppression, onBack, onToggleEchoCancellation, onToggleNoiseSuppression, visible}: {echoCancellation: boolean; insets: EdgeInsets; noiseSuppression: boolean; onBack: () => void; onToggleEchoCancellation: () => void; onToggleNoiseSuppression: () => void; visible: boolean}) {
  const setting = (label: string, enabled: boolean, onPress: () => void) => <Pressable accessibilityLabel={label} key={label} onPress={onPress} style={styles.settingsRow}>
    <Text style={styles.settingsLabel}>{label}</Text>
    <OptionToggle enabled={enabled}/>
  </Pressable>;
  return <Modal animationType="slide" onRequestClose={onBack} statusBarTranslucent transparent visible={visible}>
    <View style={styles.sheetBackdrop}>
      <Pressable accessibilityLabel="Close Microphone Settings backdrop" onPress={onBack} style={StyleSheet.absoluteFill}/>
      <View accessibilityLabel="Microphone Settings options" style={[styles.microphoneSheet, {paddingBottom: Math.max(insets.bottom, 12)}]}>
        <SubSheetHeader onBack={onBack} title="Microphone Settings"/>
        {setting('Echo Cancellation', echoCancellation, onToggleEchoCancellation)}
        {setting('Noise Suppression', noiseSuppression, onToggleNoiseSuppression)}
      </View>
    </View>
  </Modal>;
}

function CallStatusSheet({autoReconnect, backendStatus, echoCancellation, insets, loading, network, noiseSuppression, onBack, visible}: {autoReconnect: boolean; backendStatus: string; echoCancellation: boolean; insets: EdgeInsets; loading: boolean; network: string; noiseSuppression: boolean; onBack: () => void; visible: boolean}) {
  const rows = [
    {label: 'Network Status', value: network === 'Good Connection' ? 'Stable' : network === 'Weak Connection' ? 'Unstable' : 'Offline'},
    {label: 'Call Status', value: loading ? 'Checking' : backendStatus},
    {label: 'Audio Quality', value: network === 'Offline' ? 'Unavailable' : network === 'Weak Connection' ? 'Fair' : 'Excellent'},
    {label: 'Auto Reconnect', value: autoReconnect ? 'Enabled' : 'Disabled'},
    {label: 'Echo Cancellation', value: echoCancellation ? 'Active' : 'Off'},
    {label: 'Noise Suppression', value: noiseSuppression ? 'Active' : 'Off'},
  ];
  return <Modal animationType="slide" onRequestClose={onBack} statusBarTranslucent transparent visible={visible}>
    <View style={styles.sheetBackdrop}>
      <Pressable accessibilityLabel="Close Call Status backdrop" onPress={onBack} style={StyleSheet.absoluteFill}/>
      <View accessibilityLabel="Call Status details" style={[styles.statusSheet, {paddingBottom: Math.max(insets.bottom, 12)}]}>
        <SubSheetHeader onBack={onBack} title="Call Status"/>
        {rows.map(row => <View accessibilityLabel={`${row.label}: ${row.value}`} key={row.label} style={styles.statusRow}>
          <Text style={styles.statusLabel}>{row.label}</Text>
          <View style={styles.statusValue}><Text style={styles.statusValueText}>{row.value}</Text></View>
        </View>)}
      </View>
    </View>
  </Modal>;
}

export function ActiveIncomingCallScreen({busy, call, closeOptionsRequest, insets, onEnd, onMinimize, onOpenChat, onOptionsVisibilityChange, onSelectAudioOutput, onToggleHold, onToggleMute, onToggleVideo}: Props) {
  const {height, width} = useWindowDimensions();
  const [duration, setDuration] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
  const [callMedia, setCallMedia] = useState<CallMediaStreams>({localUrl: '', remoteUrl: '', remoteVideoLive: false, sharingScreen: false});
  useEffect(() => subscribeToCallMedia(setCallMedia), []);
  // Audio Output lists the hardware actually connected; this recorder handle is
  // only used to read and select audio devices, never to record.
  const audioDevices = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const [routes, setRoutes] = useState<CallAudioRoute[]>(() => listCallAudioRoutes(null));
  const [selectedRouteId, setSelectedRouteId] = useState(call.speaker ? SPEAKER_ROUTE.id : EARPIECE_ROUTE.id);
  const [notice, setNotice] = useState('');
  const sharing = callMedia.sharingScreen;
  const isMuted = call.muted === true;
  // The other side's screen in a voice call arrives on the reserved video lane.
  const remoteScreenVisible = call.type === 'audio' && callMedia.remoteVideoLive && Boolean(callMedia.remoteUrl);
  const [outputOpen, setOutputOpen] = useState(false);
  const [outputReturnsToMore, setOutputReturnsToMore] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { onOptionsVisibilityChange?.(moreOpen); }, [moreOpen, onOptionsVisibilityChange]);
  useEffect(() => () => { onOptionsVisibilityChange?.(false); }, [onOptionsVisibilityChange]);
  useEffect(() => { if (closeOptionsRequest) setMoreOpen(false); }, [closeOptionsRequest]);
  const [microphoneModeLabel, setMicrophoneModeLabel] = useState('Standard');
  useEffect(() => {
    if (!moreOpen || Platform.OS !== 'ios') return;
    let active = true;
    const refresh = () => { getCallMicrophoneMode().then(mode => { if (active) setMicrophoneModeLabel(mode); }).catch(() => undefined); };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, [moreOpen]);
  const [microphoneSettingsOpen, setMicrophoneSettingsOpen] = useState(false);
  const [callStatusOpen, setCallStatusOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [backendStatus, setBackendStatus] = useState('connected');
  const [statusLoading, setStatusLoading] = useState(false);
  const [contactProfile, setContactProfile] = useState<ChatProfile | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [network, setNetwork] = useState<'Good Connection' | 'Weak Connection' | 'Offline'>('Good Connection');
  const [chromeVisible, setChromeVisible] = useState(true);
  const [previewVisible, setPreviewVisible] = useState(true);
  const defaultPreviewPoint = useMemo(() => ({
    x: Math.max(PREVIEW_MARGIN, width - PREVIEW_WIDTH - PREVIEW_MARGIN),
    y: Math.max(insets.top + 58, height - Math.max(insets.bottom, 10) - PREVIEW_HEIGHT - (chromeVisible ? CONTROLS_PANEL_HEIGHT + PREVIEW_CONTROLS_GAP : PREVIEW_MARGIN)),
  }), [chromeVisible, height, insets.bottom, insets.top, width]);
  const previewPosition = useRef(new Animated.ValueXY(defaultPreviewPoint)).current;
  const previewAnimation = useRef(new Animated.Value(1)).current;
  const previewPoint = useRef(defaultPreviewPoint);
  const dragStart = useRef(defaultPreviewPoint);
  const previewMoved = useRef(false);
  const videoVisible = call.type === 'video' && call.videoEnabled !== false;

  const clampPreviewPoint = useMemo(() => (x: number, y: number) => ({
    x: Math.max(PREVIEW_MARGIN, Math.min(x, width - PREVIEW_WIDTH - PREVIEW_MARGIN)),
    y: Math.max(insets.top, Math.min(y, height - Math.max(insets.bottom, 10) - PREVIEW_HEIGHT - PREVIEW_MARGIN)),
  }), [chromeVisible, height, insets.bottom, insets.top, width]);

  useEffect(() => {
    const next = previewMoved.current
      ? clampPreviewPoint(previewPoint.current.x, previewPoint.current.y)
      : defaultPreviewPoint;
    previewPoint.current = next;
    previewPosition.setValue(next);
  }, [clampPreviewPoint, defaultPreviewPoint, previewPosition]);

  const previewPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
    onPanResponderGrant: () => { dragStart.current = previewPoint.current; },
    onPanResponderMove: (_event, gesture) => {
      const next = clampPreviewPoint(dragStart.current.x + gesture.dx, dragStart.current.y + gesture.dy);
      previewPoint.current = next;
      previewPosition.setValue(next);
    },
    onPanResponderRelease: () => { previewMoved.current = true; },
    onPanResponderTerminate: () => { previewMoved.current = true; },
    onPanResponderTerminationRequest: () => false,
  }), [clampPreviewPoint, previewPosition]);

  useEffect(() => {
    const connectedAt = call.connectedAt ? Date.parse(call.connectedAt) : Date.now();
    const update = () => setDuration(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [call.connectedAt]);

  useEffect(() => NetInfo.addEventListener(state => {
    if (state.isConnected === false || state.isInternetReachable === false) { setNetwork('Offline'); return; }
    const generation = String(state.details && 'cellularGeneration' in state.details ? state.details.cellularGeneration || '' : '');
    setNetwork(generation === '2g' ? 'Weak Connection' : 'Good Connection');
  }), []);

  // The Speaker control and the speaker state the app keeps can change the
  // route too; a headset choice is left alone.
  useEffect(() => {
    setSelectedRouteId(current => (current === SPEAKER_ROUTE.id || current === EARPIECE_ROUTE.id)
      ? (call.speaker ? SPEAKER_ROUTE.id : EARPIECE_ROUTE.id)
      : current);
  }, [call.speaker]);

  useEffect(() => {
    if (!notice) { return; }
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const networkColor = network === 'Good Connection' ? '#18B777' : network === 'Weak Connection' ? '#F59E0B' : '#EF4444';
  const statusText = useMemo(() => formatTimer(duration), [duration]);
  const selectedRoute = routes.find(route => route.id === selectedRouteId) || (selectedRouteId === SPEAKER_ROUTE.id ? SPEAKER_ROUTE : EARPIECE_ROUTE);
  const openOutputs = (fromMore: boolean) => {
    // Read the devices each time: a headset may have been connected mid-call.
    setRoutes(listCallAudioRoutes(audioDevices));
    setMoreOpen(false);
    setOutputReturnsToMore(fromMore);
    setOutputOpen(true);
  };
  const selectOutput = (route: CallAudioRoute) => {
    setSelectedRouteId(route.id);
    applyCallAudioRoute(route, audioDevices).catch(() => setNotice('Unable to switch the audio output.'));
    onSelectAudioOutput?.(route);
    setOutputOpen(false);
    setOutputReturnsToMore(false);
  };
  const toggleScreenShare = useCallback(async () => {
    setMoreOpen(false);
    try {
      if (sharing) {
        await stopCallScreenCapture();
        setCallScreenShareOverSocket(call.callId, false).catch(() => undefined);
        return;
      }
      await startCallScreenCapture(() => { setCallScreenShareOverSocket(call.callId, false).catch(() => undefined); });
      // Tell the call room, so the other side can show who is sharing.
      setCallScreenShareOverSocket(call.callId, true).catch(() => undefined);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to start screen sharing.');
    }
  }, [call.callId, sharing]);
  const openCallStatus = () => {
    setMoreOpen(false);
    setCallStatusOpen(true);
    setStatusLoading(true);
    getCallStatus(call.callId)
      .then(status => setBackendStatus(status))
      .catch(() => setBackendStatus(call.status))
      .finally(() => setStatusLoading(false));
  };
  const openContact = () => {
    setMoreOpen(false);
    setContactOpen(true);
    setContactLoading(true);
    getChatProfile(call.callerId)
      .then(setContactProfile)
      .catch(() => setContactProfile(null))
      .finally(() => setContactLoading(false));
  };
  const showSelfPreview = () => {
    setPreviewVisible(true);
    previewAnimation.setValue(0);
    requestAnimationFrame(() => Animated.spring(previewAnimation, {
      toValue: 1,
      tension: 90,
      friction: 10,
      useNativeDriver: true,
    }).start());
  };
  const hideSelfPreview = () => {
    Animated.timing(previewAnimation, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(({finished}) => {
      if (finished) { setPreviewVisible(false); }
    });
  };
  const handlePreviewSurface = () => {
    if (!previewVisible && call.type === 'video') {
      showSelfPreview();
      return;
    }
    setChromeVisible(visible => !visible);
  };
  const outputIcon: ControlName = selectedRoute.kind === 'bluetooth' ? 'bluetooth' : 'speaker';
  const outputControlLabel = selectedRoute.kind === 'earpiece' ? 'Speaker' : selectedRoute.label;

  return <View accessibilityLabel={`Active one-to-one ${call.type} call`} style={styles.screen}>
    {call.type === 'video' ? <View style={StyleSheet.absoluteFill}>
      {callMedia.remoteUrl
        ? <CallVideoView mirror={false} objectFit="cover" streamURL={callMedia.remoteUrl} zOrder={0} style={StyleSheet.absoluteFill}/>
        : call.callerProfilePic
        ? <Image blurRadius={videoVisible ? 0 : 10} resizeMode="cover" source={{uri: call.callerProfilePic}} style={StyleSheet.absoluteFill}/>
        : <View style={[StyleSheet.absoluteFill, styles.remoteFallback]}><Text style={styles.remoteInitial}>{initialsOf(call.callerName)}</Text></View>}
      {!videoVisible ? <View style={styles.remoteVideoOff}><Text style={styles.remoteVideoOffText}>Video is off</Text></View> : null}
      {chromeVisible ? <View style={styles.videoScrim}/> : null}
    </View> : null}

    {call.type === 'video' ? <Pressable accessibilityHint="Shows a hidden self preview or toggles full-screen call controls" accessibilityLabel="Call preview surface" onPress={handlePreviewSurface} style={StyleSheet.absoluteFill}/> : null}

    {chromeVisible ? <View style={[styles.topBar, {paddingTop: Math.max(insets.top, 12)}]}>
      <Pressable accessibilityLabel="Minimize active call" onPress={onMinimize} style={styles.topButton}><ControlIcon name="down"/></Pressable>
      <View style={styles.callHeading}>
        <Text numberOfLines={1} style={[styles.callerName, call.type === 'video' && styles.lightText]}>{call.callerName}</Text>
        <Text accessibilityLabel={`Call duration ${statusText}`} style={[styles.timer, call.type === 'video' && styles.lightMeta]}>{statusText}</Text>
      </View>
      <Pressable accessibilityLabel="Add person" accessibilityRole="button" hitSlop={8} onPress={() => setAddPeopleOpen(true)} style={styles.addPersonButton}><AddPersonIcon/></Pressable>
    </View> : null}

    {chromeVisible ? <View style={styles.connectionWrap}><View accessibilityLabel={network} style={styles.connectionBadge}><View style={[styles.networkDot, {backgroundColor: networkColor}]}/><Text style={styles.connectionText}>{network}</Text></View></View> : null}

    <View style={styles.content}>
      {remoteScreenVisible ? <View accessibilityLabel={`${call.callerName} is sharing their screen`} style={styles.remoteScreen}>
        <CallVideoView mirror={false} objectFit="contain" streamURL={callMedia.remoteUrl} style={StyleSheet.absoluteFill}/>
        <View style={styles.remoteScreenLabel}><Text numberOfLines={1} style={styles.remoteScreenText}>{call.callerName} is sharing their screen</Text></View>
      </View> : call.type === 'audio' ? <>
        <Text style={styles.audioCallType}>One-to-One Voice Call</Text>
        {call.callerProfilePic ? <Image source={{uri: call.callerProfilePic}} style={styles.audioAvatar}/> : <View style={[styles.audioAvatar, styles.audioAvatarFallback]}><Text style={styles.audioInitial}>{initialsOf(call.callerName)}</Text></View>}
      </> : null}
    </View>

    {sharing ? <View accessibilityLabel="You are sharing your screen" style={[styles.sharingBanner, {top: Math.max(insets.top, 12) + 108}]}>
      <Text style={styles.sharingText}>You are sharing your screen</Text>
      <Pressable accessibilityLabel="Stop sharing your screen" onPress={() => { toggleScreenShare().catch(() => undefined); }} style={styles.sharingStop}><Text style={styles.sharingStopText}>Stop</Text></Pressable>
    </View> : null}
    {notice ? <View accessibilityLiveRegion="polite" style={[styles.noticeBanner, {top: Math.max(insets.top, 12) + (sharing ? 160 : 108)}]}><Text style={styles.noticeText}>{notice}</Text></View> : null}

    {call.type === 'video' && previewVisible ? <Animated.View accessibilityHint="Drag to reposition the self preview" accessibilityLabel="Floating self preview" style={[styles.selfPreview, {opacity: previewAnimation, transform: [...previewPosition.getTranslateTransform(), {scale: previewAnimation.interpolate({inputRange: [0, 1], outputRange: [0.94, 1]})}]}]} {...previewPanResponder.panHandlers}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>{videoVisible && callMedia.localUrl ? <CallVideoView mirror={cameraFacing === 'front'} objectFit="cover" streamURL={callMedia.localUrl} zOrder={1} style={StyleSheet.absoluteFill}/> : <View style={[StyleSheet.absoluteFill, styles.selfCameraOff]}><ControlIcon crossed name="video"/></View>}</View>
      <Pressable accessibilityLabel="Hide self preview" onPress={hideSelfPreview} style={styles.hidePreview}><ControlIcon name="hide"/></Pressable>
      <Pressable accessibilityLabel="Switch camera" accessibilityState={{disabled: !videoVisible}} disabled={!videoVisible} onPress={() => {switchCallCamera(); setCameraFacing(facing => facing === 'front' ? 'back' : 'front');}} style={styles.switchCamera}><ControlIcon name="switch"/></Pressable>
      {selectedRoute.kind === 'bluetooth' ? <View pointerEvents="none" style={styles.previewOutputBadge}><Text numberOfLines={1} style={styles.previewOutputText}>{selectedRoute.label}</Text></View> : null}
    </Animated.View> : null}

    {call.type === 'video' && !previewVisible ? <Pressable accessibilityHint="Restores the floating camera preview" accessibilityLabel="Show self preview" onPress={showSelfPreview} style={[styles.previewHandle, previewPoint.current.x < width / 2 ? styles.previewHandleLeft : styles.previewHandleRight, {top: Math.max(insets.top + 48, Math.min(previewPoint.current.y + 42, height - Math.max(insets.bottom, 10) - CONTROLS_PANEL_HEIGHT - 68 - PREVIEW_CONTROLS_GAP))}]}><Svg width={14} height={18} viewBox="0 0 24 24"><Path d={previewPoint.current.x < width / 2 ? 'm14 7-5 5 5 5' : 'm10 7 5 5-5 5'} fill="none" stroke={themeInk('#344256')} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}/></Svg></Pressable> : null}

    {chromeVisible ? <View style={[styles.controlsPanel, {paddingBottom: Math.max(insets.bottom, 10)}]}>
      <ActiveControl active={selectedRoute.kind !== 'earpiece' && selectedRoute.kind !== 'none'} label={outputControlLabel} name={outputIcon} onPress={() => openOutputs(false)}/>
      <ActiveControl accessibilityLabel="Video" active={videoVisible} label="Video On" name="video" onPress={() => onToggleVideo?.()}/>
      <ActiveControl accessibilityLabel={isMuted ? 'Unmute' : 'Mute'} active={isMuted} crossed={isMuted} label="Mute" name="mute" onPress={() => onToggleMute?.()}/>
      <ActiveControl accessibilityLabel={call.held ? 'Resume call' : 'Hold call'} active={Boolean(call.held)} label={call.held ? 'Resume' : 'Hold'} name="hold" onPress={() => onToggleHold?.()}/>
      <ActiveControl label="More" name="more" onPress={() => setMoreOpen(true)}/>
      <ActiveControl danger disabled={busy} label="End" name="end" onPress={onEnd}/>
      <ActiveControl disabled={!onOpenChat} label="Chat" name="chat" onPress={() => onOpenChat?.()}/>
    </View> : null}

    <OneToOneCallMoreOptionsSheet
      incomingCallType={call.type}
      microphoneModeLabel={microphoneModeLabel}
      onMicrophoneMode={() => { openCallMicrophoneMode().catch(error => setNotice(error instanceof Error ? error.message : 'Unable to open microphone modes.')); }}
      onReaction={emoji => {
        try { sendCallReaction(call.callId, emoji); setMoreOpen(false); }
        catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to send call reaction.'); }
      }}
      onSendMessage={onOpenChat ? () => { setMoreOpen(false); onOpenChat(); } : undefined}
      audioOutputLabel={selectedRoute.label}
      autoReconnect={autoReconnect}
      bottomInset={insets.bottom}
      canAddPeople
      onAddPeople={() => { setMoreOpen(false); setAddPeopleOpen(true); }}
      onAudioOutput={() => openOutputs(true)}
      onCallStatus={openCallStatus}
      onClose={() => setMoreOpen(false)}
      onMicrophoneSettings={() => { setMoreOpen(false); setMicrophoneSettingsOpen(true); }}
      onShareScreen={() => { toggleScreenShare().catch(() => undefined); }}
      onToggleAutoReconnect={() => setAutoReconnect(enabled => !enabled)}
      onViewContact={openContact}
      sharingScreen={sharing}
      visible={moreOpen}
    />
    <CallReactionOverlay callId={call.callId}/>
    <AudioOutputSheet insets={insets} onClose={() => { setOutputOpen(false); if (outputReturnsToMore) { setMoreOpen(true); } setOutputReturnsToMore(false); }} onSelect={selectOutput} routes={routes} selected={selectedRouteId} visible={outputOpen}/>
    <MicrophoneSettingsSheet
      echoCancellation={echoCancellation}
      insets={insets}
      noiseSuppression={noiseSuppression}
      onBack={() => { setMicrophoneSettingsOpen(false); setMoreOpen(true); }}
      onToggleEchoCancellation={() => setEchoCancellation(enabled => !enabled)}
      onToggleNoiseSuppression={() => setNoiseSuppression(enabled => !enabled)}
      visible={microphoneSettingsOpen}
    />
    <CallStatusSheet autoReconnect={autoReconnect} backendStatus={backendStatus} echoCancellation={echoCancellation} insets={insets} loading={statusLoading} network={network} noiseSuppression={noiseSuppression} onBack={() => { setCallStatusOpen(false); setMoreOpen(true); }} visible={callStatusOpen}/>
    <CallContactSheet bottomInset={insets.bottom} loading={contactLoading} name={call.callerName} onBack={() => { setContactOpen(false); setMoreOpen(true); }} onMessage={onOpenChat ? () => { setContactOpen(false); onOpenChat(); } : undefined} picture={call.callerProfilePic} profile={contactProfile} visible={contactOpen}/>
    <CallAddPeopleSheet
      callId={call.callId}
      excludeUserIds={[String(getSession()?.user?.id || ''), call.callerId, call.receiverId || ''].filter(Boolean)}
      onAdded={count => setNotice(count === 1 ? 'Participant invited to the call.' : `${count} participants invited to the call.`)}
      onClose={() => setAddPeopleOpen(false)}
      visible={addPeopleOpen}
    />
  </View>;
}

const styles = createThemedStyles({
  screen: {flex: 1, backgroundColor: '#FFFFFF'},
  remoteFallback: {backgroundColor: '#C8BFB1', alignItems: 'center', justifyContent: 'center'},
  remoteInitial: {color: 'rgba(255,255,255,.85)', fontFamily: FONT_FAMILY, fontSize: 92, fontWeight: '700'},
  remoteVideoOff: {position: 'absolute', left: 0, right: 0, top: '44%', alignItems: 'center'},
  remoteVideoOffText: {paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, overflow: 'hidden', color: '#FFFFFF', backgroundColor: 'rgba(17,24,39,.55)', fontFamily: FONT_FAMILY, fontSize: 11},
  videoScrim: {position: 'absolute', left: 0, right: 0, top: 0, height: 130, backgroundColor: 'rgba(15,23,42,.16)'},
  topBar: {zIndex: 5, minHeight: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center'},
  topButton: {width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.82)', alignItems: 'center', justifyContent: 'center'},
  callHeading: {flex: 1, paddingHorizontal: 10, alignItems: 'center'},
  callerName: {color: '#111827', fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: '700'},
  timer: {marginTop: 2, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 9, fontVariant: ['tabular-nums']},
  lightText: {color: '#FFFFFF'},
  lightMeta: {color: 'rgba(255,255,255,.82)'},
  addPersonButton: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  connectionWrap: {position: 'absolute', zIndex: 3, top: 82, left: 0, right: 0, alignItems: 'center'},
  connectionBadge: {height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.88)', flexDirection: 'row', alignItems: 'center'},
  networkDot: {width: 6, height: 6, marginRight: 5, borderRadius: 3},
  connectionText: {color: '#344256', fontFamily: FONT_FAMILY, fontSize: 8, fontWeight: '600'},
  content: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  audioCallType: {marginBottom: 28, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 12},
  audioAvatar: {width: 128, height: 128, borderRadius: 24},
  audioAvatarFallback: {backgroundColor: '#F0E7FF', alignItems: 'center', justifyContent: 'center'},
  audioInitial: {color: '#7137DD', fontFamily: FONT_FAMILY, fontSize: 36, fontWeight: '800'},
  selfPreview: {position: 'absolute', zIndex: 8, left: 0, top: 0, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, borderWidth: 2, borderColor: 'rgba(255,255,255,.88)', borderRadius: 8, overflow: 'hidden', backgroundColor: '#DDD', shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: .2, shadowRadius: 6, elevation: 7},
  selfCameraOff: {backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center'},
  hidePreview: {position: 'absolute', right: 4, top: 4, width: 24, height: 24, borderRadius: 5, backgroundColor: 'rgba(15,23,42,.68)', alignItems: 'center', justifyContent: 'center'},
  switchCamera: {position: 'absolute', left: 5, bottom: 5, width: 28, height: 28, borderRadius: 7, backgroundColor: 'rgba(255,255,255,.88)', alignItems: 'center', justifyContent: 'center'},
  previewOutputBadge: {position: 'absolute', left: 35, right: 4, bottom: 5, height: 16, paddingHorizontal: 3, borderRadius: 3, backgroundColor: 'rgba(15,23,42,.65)', alignItems: 'center', justifyContent: 'center'},
  previewOutputText: {color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 6, fontWeight: '600'},
  previewHandle: {position: 'absolute', zIndex: 6, width: 22, height: 68, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: 'rgba(255,255,255,.94)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: .12, shadowRadius: 3, elevation: 5},
  previewHandleLeft: {left: 0, borderTopRightRadius: 7, borderBottomRightRadius: 7},
  previewHandleRight: {right: 0, borderTopLeftRadius: 7, borderBottomLeftRadius: 7},
  controlsPanel: {position: 'absolute', zIndex: 5, left: 0, right: 0, bottom: 0, minHeight: 172, paddingTop: 9, paddingHorizontal: 28, backgroundColor: 'rgba(255,255,255,.96)', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', rowGap: 10},
  control: {width: '30%', alignItems: 'center'},
  controlButton: {width: 58, height: 58, borderWidth: 1, borderColor: '#E6EAF0', borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center'},
  controlButtonActive: {borderColor: '#1877F2', backgroundColor: '#E8F1FF'},
  controlButtonDanger: {borderColor: '#E9282D', backgroundColor: '#E9282D'},
  controlLabel: {marginTop: 5, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 10},
  endLabel: {color: '#E9282D'},
  disabled: {opacity: .45},
  sheetBackdrop: {flex: 1, backgroundColor: 'rgba(15,23,42,.42)', justifyContent: 'flex-end'},
  outputSheet: {minHeight: 292, paddingHorizontal: 8, borderTopLeftRadius: 15, borderTopRightRadius: 15, backgroundColor: '#FFFFFF'},
  sheetHeader: {height: 48, flexDirection: 'row', alignItems: 'center'},
  subSheetHeader: {height: 48, flexDirection: 'row', alignItems: 'center'},
  sheetHeaderButton: {width: 42, height: 42, alignItems: 'center', justifyContent: 'center'},
  sheetTitle: {flex: 1, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600', textAlign: 'center'},
  outputRow: {height: 53, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center'},
  outputIcon: {width: 32, marginRight: 6, alignItems: 'center', justifyContent: 'center'},
  outputLabel: {flex: 1, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: '500'},
  outputCheck: {width: 30, alignItems: 'center', justifyContent: 'center'},
  microphoneSheet: {minHeight: 196, paddingHorizontal: 8, borderTopLeftRadius: 15, borderTopRightRadius: 15, backgroundColor: '#FFFFFF'},
  settingsRow: {height: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center'},
  settingsLabel: {flex: 1, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '500'},
  statusSheet: {minHeight: 220, paddingHorizontal: 8, borderTopLeftRadius: 15, borderTopRightRadius: 15, backgroundColor: '#FFFFFF'},
  statusRow: {height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center'},
  statusLabel: {flex: 1, color: '#111827', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '500'},
  statusValue: {paddingHorizontal: 7, paddingVertical: 5, borderRadius: 3, backgroundColor: '#E9FBF4'},
  statusValueText: {color: '#087A52', fontFamily: FONT_FAMILY, fontSize: 9, fontWeight: '500', textTransform: 'capitalize'},
  remoteScreen: {alignSelf: 'stretch', flex: 1, marginHorizontal: 12, marginBottom: 180, overflow: 'hidden', borderRadius: 12, backgroundColor: '#0F172A'},
  remoteScreenLabel: {position: 'absolute', left: 10, right: 10, bottom: 10, alignItems: 'center'},
  remoteScreenText: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, overflow: 'hidden', color: '#FFFFFF', backgroundColor: 'rgba(15,23,42,.62)', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '600'},
  sharingBanner: {position: 'absolute', zIndex: 7, left: 16, right: 16, minHeight: 44, paddingLeft: 14, paddingRight: 6, borderRadius: 10, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', shadowColor: '#0F172A', shadowOffset: {width: 0, height: 3}, shadowOpacity: .12, shadowRadius: 8, elevation: 6},
  sharingText: {flex: 1, color: '#1E293B', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600'},
  sharingStop: {paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: '#FFF1F2'},
  sharingStopText: {color: '#E52228', fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '700'},
  noticeBanner: {position: 'absolute', zIndex: 7, left: 24, right: 24, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#242629'},
  noticeText: {color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 12, textAlign: 'center'},
});
