import React from 'react';
import {Linking, Text, type StyleProp, type TextStyle} from 'react-native';

const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
const TRAILING_PUNCTUATION = /[),.!?:;]+$/;

export function linkTarget(value: string): string {
  return /^www\./i.test(value) ? `https://${value}` : value;
}

export function LinkifiedText({
  children,
  style,
  linkStyle,
  onOpenError,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  onOpenError?: () => void;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of children.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(children.slice(cursor, index));
    const matched = match[0];
    const trailing = matched.match(TRAILING_PUNCTUATION)?.[0] || '';
    const url = trailing ? matched.slice(0, -trailing.length) : matched;
    parts.push(
      <Text
        accessibilityLabel={`Open link ${url}`}
        accessibilityRole="link"
        key={`${index}-${url}`}
        onPress={() => Linking.openURL(linkTarget(url)).catch(() => onOpenError?.())}
        style={linkStyle}>
        {url}
      </Text>,
    );
    if (trailing) parts.push(trailing);
    cursor = index + matched.length;
  }
  if (cursor < children.length) parts.push(children.slice(cursor));
  return <Text style={style}>{parts}</Text>;
}
