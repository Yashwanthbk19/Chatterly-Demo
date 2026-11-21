import React, {useRef, useState} from 'react';
import {Keyboard, Pressable, type NativeSyntheticEvent, type TextInput, type TextInputSelectionChangeEventData} from 'react-native';
import {EmojiIcon, KeyboardIcon} from './ChatIcons';
import {createThemedStyles} from '../theme/themedStyles';

type Selection = {start: number; end: number};

/**
 * A text field whose corner button swaps the keyboard for the emoji panel and
 * back. The panel takes the keyboard's place, so the field only keeps the caret
 * position for the emoji to land on.
 */
export function useEmojiKeyboardToggle({value, onChangeText, maxLength, onLimit}: {
  value: string;
  onChangeText: (value: string) => void;
  maxLength: number;
  onLimit: () => void;
}) {
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const selection = useRef<Selection>({start: value.length, end: value.length});
  const [forcedSelection, setForcedSelection] = useState<Selection | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const toggle = () => {
    if (emojiOpen) {
      setEmojiOpen(false);
      inputRef.current?.focus();
      return;
    }
    Keyboard.dismiss();
    setEmojiOpen(true);
  };
  const insertEmoji = (emoji: string) => {
    const start = Math.min(selection.current.start, value.length);
    const end = Math.max(start, Math.min(selection.current.end, value.length));
    const next = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
    if (next.length > maxLength) {
      onLimit();
      return;
    }
    const caret = start + emoji.length;
    selection.current = {start: caret, end: caret};
    // The caret is pushed back into the field only for this edit; the next
    // selection event from the user releases it again.
    setForcedSelection({start: caret, end: caret});
    onChangeText(next);
  };
  return {
    emojiOpen,
    closeEmoji: () => setEmojiOpen(false),
    toggle,
    insertEmoji,
    inputProps: {
      ref: inputRef,
      // Tapping into the field asks for the keyboard, which is the space the
      // emoji panel is occupying.
      onFocus: () => setEmojiOpen(false),
      onSelectionChange: (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
        selection.current = event.nativeEvent.selection;
        setForcedSelection(null);
      },
      selection: forcedSelection ?? undefined,
    },
  };
}

export function EmojiKeyboardToggle({open, onPress}: {open: boolean; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={open ? 'Show keyboard' : 'Add emoji'}
      accessibilityRole="button"
      accessibilityState={{expanded: open}}
      hitSlop={8}
      onPress={onPress}
      style={styles.toggle}
    >
      {open ? <KeyboardIcon active /> : <EmojiIcon />}
    </Pressable>
  );
}

const styles = createThemedStyles({
  toggle: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center'},
});
