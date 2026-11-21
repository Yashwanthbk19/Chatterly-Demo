import React from 'react';
import Svg, {Path, Rect} from 'react-native-svg';
import {themeInk} from '../theme/themedStyles';

export function PlusIcon() {
  return <Svg width={21} height={21} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" stroke={themeInk('#536074')} strokeWidth={1.35} strokeLinecap="round" /></Svg>;
}

export function CalendarIcon() {
  return <Svg width={19} height={19} viewBox="0 0 24 24" fill="none"><Rect x={4} y={5} width={16} height={15} rx={2} stroke={themeInk('#273448')} strokeWidth={1.4} /><Path d="M8 3v4M16 3v4M4 10h16" stroke={themeInk('#273448')} strokeWidth={1.4} strokeLinecap="round" /></Svg>;
}

export function CameraIcon() {
  return <Svg width={21} height={18} viewBox="0 0 21 18" fill="none"><Path d="M4.125 4H3.08333C2.5308 4 2.00089 4.21071 1.61019 4.58579C1.21949 4.96086 1 5.46957 1 6V15C1 15.5304 1.21949 16.0391 1.61019 16.4142C2.00089 16.7893 2.5308 17 3.08333 17H17.6667C18.2192 17 18.7491 16.7893 19.1398 16.4142C19.5305 16.0391 19.75 15.5304 19.75 15V6C19.75 5.46957 19.5305 4.96086 19.1398 4.58579C18.7491 4.21071 18.2192 4 17.6667 4H16.625C16.0725 4 15.5426 3.78929 15.1519 3.41421C14.7612 3.03914 14.5417 2.53043 14.5417 2C14.5417 1.73478 14.4319 1.48043 14.2366 1.29289C14.0412 1.10536 13.7763 1 13.5 1H7.25C6.97373 1 6.70878 1.10536 6.51343 1.29289C6.31808 1.48043 6.20833 1.73478 6.20833 2C6.20833 2.53043 5.98884 3.03914 5.59814 3.41421C5.20744 3.78929 4.67753 4 4.125 4Z" stroke={themeInk('#0B1220')} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/><Path d="M7.25 10C7.25 10.7956 7.57924 11.5587 8.16529 12.1213C8.75134 12.6839 9.5462 13 10.375 13C11.2038 13 11.9987 12.6839 12.5847 12.1213C13.1708 11.5587 13.5 10.7956 13.5 10C13.5 9.20435 13.1708 8.44129 12.5847 7.87868C11.9987 7.31607 11.2038 7 10.375 7C9.5462 7 8.75134 7.31607 8.16529 7.87868C7.57924 8.44129 7.25 9.20435 7.25 10Z" stroke={themeInk('#0B1220')} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

export function GalleryIcon() {
  return <Svg width={21} height={20} viewBox="0 0 21 20" fill="none"><Path d="M13.5 6H13.5104M1 14L6.20833 9C7.175 8.107 8.36667 8.107 9.33333 9L14.5417 14M12.4583 12L13.5 11C14.4667 10.107 15.6583 10.107 16.625 11L19.75 14M1 4C1 3.20435 1.32924 2.44129 1.91529 1.87868C2.50134 1.31607 3.2962 1 4.125 1H16.625C17.4538 1 18.2487 1.31607 18.8347 1.87868C19.4208 2.44129 19.75 3.20435 19.75 4V16C19.75 16.7956 19.4208 17.5587 18.8347 18.1213C18.2487 18.6839 17.4538 19 16.625 19H4.125C3.2962 19 2.50134 18.6839 1.91529 18.1213C1.32924 17.5587 1 16.7956 1 16V4Z" stroke={themeInk('#0B1220')} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

export function CloseIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="m6 6 12 12M18 6 6 18" stroke={themeInk('#273448')} strokeWidth={1.4} strokeLinecap="round" /></Svg>;
}

export function EditIcon() {
  return <Svg width={10} height={10} viewBox="0 0 24 24" fill="none"><Path d="m4 16.5-.7 3.2 3.2-.7L17.7 7.8a2.1 2.1 0 0 0-3-3L3.5 16Z" stroke={themeInk('#7137DD')} strokeWidth={1.7} strokeLinejoin="round" /><Path d="m13.5 6 3 3" stroke={themeInk('#7137DD')} strokeWidth={1.7} /></Svg>;
}

export function TrashIcon() {
  return <Svg width={14} height={14} viewBox="0 0 24 24" fill="none"><Path d="M5 7h14M10 11v5M14 11v5M9 7l.7-2h4.6l.7 2M7 7l.8 12h8.4L17 7" stroke={themeInk('#EF3B43')} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
