import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, Image, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View} from 'react-native';
import {
  BallCategoryIcon,
  CarCategoryIcon,
  FlagCategoryIcon,
  FoodCategoryIcon,
  NatureCategoryIcon,
  ObjectsCategoryIcon,
  PeopleCategoryIcon,
  PickerSearchIcon,
  RecentCategoryIcon,
  SmileyCategoryIcon,
  SymbolsCategoryIcon,
} from './EmojiPickerIcons';
import {
  EMOJI_CATEGORY_LABELS,
  emojiItemsForCategory,
  emojiItemsForGlyphs,
  searchEmojis,
  type EmojiItem,
  type EmojiTabId,
} from '../constants/emoji';
import {gifRows, gifRowWidths, searchGifs, type GifItem} from '../constants/gifs';
import {loadRecentEmojis, recordRecentEmoji} from '../services/recentEmojiStore';
import {createThemedStyles} from '../theme/themedStyles';

type Props = {
  visible: boolean;
  /** The panel replaces the keyboard, so it owns the home-indicator gap. */
  bottomInset?: number;
  onSelectEmoji: (emoji: string) => void;
  /** Only needed while the GIF tab is shown. */
  onSelectGif?: (gif: GifItem) => void;
  /** A text field that takes emoji but cannot send a GIF turns the GIF tab off. */
  showGifTab?: boolean;
};

const FONT_FAMILY = Platform.select({android: 'sans-serif', ios: 'System'});
const ACTIVE = '#8B27E9';
const IDLE = '#64748B';

/**
 * The rail from the attached design: seven tabs across a centred pill, opening
 * on Recent, in the design's order. The catalogue has three more categories
 * than the design draws, so they sit just past the seventh tab and the rail
 * scrolls to them - every emoji can be browsed as well as searched.
 */
const VISIBLE_RAIL_TABS = 7;
const RAIL_CELL_WIDTH = 41;
/** The rail's border and inner padding on both sides. */
const RAIL_CHROME_WIDTH = 6;
const RAIL_TABS: Array<{id: EmojiTabId; Icon: typeof SmileyCategoryIcon}> = [
  {id: 'recent', Icon: RecentCategoryIcon},
  {id: 'smileys', Icon: SmileyCategoryIcon},
  {id: 'people', Icon: PeopleCategoryIcon},
  {id: 'travel', Icon: CarCategoryIcon},
  {id: 'symbols', Icon: SymbolsCategoryIcon},
  {id: 'activities', Icon: BallCategoryIcon},
  {id: 'flags', Icon: FlagCategoryIcon},
  {id: 'animals', Icon: NatureCategoryIcon},
  {id: 'food', Icon: FoodCategoryIcon},
  {id: 'objects', Icon: ObjectsCategoryIcon},
];

/**
 * What an empty Recent tab offers instead of a blank grid, matching the design's
 * first-run screen. It is a suggestion, so the header names the real category.
 */
const EMPTY_RECENT_FALLBACK = 'objects' as const;

const PANEL_SIDE_PADDING = 14;
/** The design's grid density: twelve glyphs across a standard handset. */
const MIN_GRID_COLUMNS = 9;
const MAX_GRID_COLUMNS = 12;
const GRID_CELL_TARGET = 30;
const GIF_GAP = 8;
const GIF_ASPECT_RATIO = 1.35;

/**
 * The panel stands in for the keyboard, so it is sized like one: a little under
 * half the screen, bounded so a small phone keeps some of the thread visible
 * and a tall one does not get a mostly empty sheet.
 */
const MIN_PANEL_HEIGHT = 300;
const MAX_PANEL_HEIGHT = 420;
const PANEL_SCREEN_SHARE = 0.46;
/**
 * While the search field has the keyboard up, the panel shrinks to the search
 * box and a couple of rows of results, so the keyboard, the results and the
 * composer all fit on screen together.
 */
const COMPACT_PANEL_HEIGHT = 196;

export function emojiPanelHeight(windowHeight: number): number {
  return Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, Math.round(windowHeight * PANEL_SCREEN_SHARE)));
}

function TabSwitcher({activeTab, onChange}: {activeTab: 'emoji' | 'gif'; onChange: (tab: 'emoji' | 'gif') => void}) {
  return <View style={styles.switcherRow}>
    <View style={styles.switcher}>
      <Pressable
        accessibilityLabel="Emoji"
        accessibilityRole="tab"
        accessibilityState={{selected: activeTab === 'emoji'}}
        onPress={() => onChange('emoji')}
        style={[styles.switcherCell, activeTab === 'emoji' && styles.pillActive]}
      >
        <SmileyCategoryIcon color={activeTab === 'emoji' ? ACTIVE : IDLE} size={19} />
      </Pressable>
      <View style={styles.switcherDivider} />
      <Pressable
        accessibilityLabel="GIF"
        accessibilityRole="tab"
        accessibilityState={{selected: activeTab === 'gif'}}
        onPress={() => onChange('gif')}
        style={[styles.switcherCell, activeTab === 'gif' && styles.pillActive]}
      >
        <View style={[styles.gifBadge, activeTab === 'gif' && styles.gifBadgeActive]}>
          <Text style={[styles.gifBadgeText, activeTab === 'gif' && styles.gifBadgeTextActive]}>GIF</Text>
        </View>
      </Pressable>
    </View>
  </View>;
}

function CategoryRail({activeTab, onChange, width}: {activeTab: EmojiTabId; onChange: (tab: EmojiTabId) => void; width: number}) {
  // Exactly seven cells fill the pill inside its border and padding.
  const cellWidth = Math.max(0, width - RAIL_CHROME_WIDTH) / VISIBLE_RAIL_TABS;
  return <View style={styles.railRow}>
    <View style={[styles.rail, {width}]}>
      <FlatList
        data={RAIL_TABS}
        horizontal
        keyExtractor={tab => tab.id}
        renderItem={({item, index}) => {
          const selected = activeTab === item.id;
          return <Pressable
            accessibilityLabel={EMOJI_CATEGORY_LABELS[item.id]}
            accessibilityRole="tab"
            accessibilityState={{selected}}
            onPress={() => onChange(item.id)}
            style={[styles.railCell, {width: cellWidth}, index < RAIL_TABS.length - 1 && styles.railDivider, selected && styles.pillActive]}
          >
            <item.Icon color={selected ? ACTIVE : IDLE} size={17} />
          </Pressable>;
        }}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  </View>;
}

function SearchField({onBlur, onChangeText, onFocus, placeholder, value}: {onBlur?: () => void; onChangeText: (value: string) => void; onFocus?: () => void; placeholder: string; value: string}) {
  return <View style={styles.searchField}>
    <PickerSearchIcon />
    <TextInput
      accessibilityLabel={placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      onBlur={onBlur}
      onChangeText={onChangeText}
      onFocus={onFocus}
      placeholder={placeholder}
      placeholderTextColor="#8792A4"
      returnKeyType="search"
      style={styles.searchInput}
      value={value}
    />
  </View>;
}

function GifTile({gif, height, onPress, width}: {gif: GifItem; height: number; onPress: () => void; width: number}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return <Pressable
    accessibilityLabel={`Send ${gif.label} GIF`}
    accessibilityRole="button"
    onPress={onPress}
    style={[styles.gifTile, {width, height}]}
  >
    {failed
      ? <Text style={styles.gifUnavailable}>{gif.label}</Text>
      : <Image
          accessible={false}
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
          resizeMode="cover"
          // The grid plays Giphy's 200px rendition; the message carries the
          // full one, so what the other person receives is not downscaled.
          source={{uri: gif.previewUrl || gif.url}}
          style={styles.gifImage}
        />}
    {!loaded && !failed ? <ActivityIndicator color="#8B27E9" size="small" style={styles.gifSpinner} /> : null}
  </Pressable>;
}

/**
 * Sprint 4 Story 6's picker.
 *
 * It takes the keyboard's place below the composer rather than floating over
 * the thread, which is what lets a run of emoji be tapped in one go. Recents,
 * the nine categories, search and the GIF tab are all one panel, so switching
 * between them never costs the user their place in the conversation.
 */
export function EmojiPicker({bottomInset = 0, onSelectEmoji, onSelectGif, showGifTab = true, visible}: Props): React.JSX.Element | null {
  const {height: windowHeight, width: windowWidth} = useWindowDimensions();
  const [chosenTab, setTab] = useState<'emoji' | 'gif'>('emoji');
  const tab = showGifTab ? chosenTab : 'emoji';
  const [category, setCategory] = useState<EmojiTabId>('recent');
  const [emojiQuery, setEmojiQuery] = useState('');
  const [gifQuery, setGifQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  // What the Recent tab is currently drawing. Held apart from `recent` on
  // purpose: recording a pick moves that glyph to the front of the history, and
  // rendering straight from it would reshuffle the grid under the user's finger
  // mid-tap, so a second tap in the same place inserts a different emoji. The
  // new order is taken up the next time the tab is entered.
  const [displayRecent, setDisplayRecent] = useState<string[]>([]);
  // Whether the Recent tab is standing in for a history the user does not have
  // yet. Latched rather than derived: picking from the suggestions would
  // otherwise collapse the grid to that one emoji under the user's finger.
  const [suggestingOnRecent, setSuggestingOnRecent] = useState(true);
  // The search field raised the keyboard: the panel steps down to its compact
  // layout so the results stay visible above the keys.
  const [searchKeyboard, setSearchKeyboard] = useState(false);
  const searchFocused = useRef(false);
  const gridRef = useRef<FlatList<EmojiItem>>(null);

  // Recents are read when the panel opens rather than on mount: they change
  // from the other end of the app - a picker opened in another chat - and this
  // is the moment the list is about to be shown.
  useEffect(() => {
    if (!visible) { return; }
    let active = true;
    // A query belongs to the session that typed it; reopening the panel should
    // show the catalogue, not results for something the user has forgotten.
    setEmojiQuery('');
    setGifQuery('');
    setSearchKeyboard(false);
    loadRecentEmojis().then(stored => {
      if (!active) { return; }
      setRecent(stored);
      setDisplayRecent(stored);
      setSuggestingOnRecent(stored.length === 0);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [visible]);

  // The compact layout follows the keyboard itself rather than focus alone, so
  // dismissing the keys with the system Back button restores the full panel.
  useEffect(() => {
    if (!visible) { return; }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, () => { if (searchFocused.current) { setSearchKeyboard(true); } });
    const hidden = Keyboard.addListener(hideEvent, () => setSearchKeyboard(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [visible]);

  const searching = emojiQuery.trim().length > 0;
  const recentItems = useMemo(() => emojiItemsForGlyphs(displayRecent), [displayRecent]);
  const emptyRecent = category === 'recent' && suggestingOnRecent;
  const results = useMemo(() => searching ? searchEmojis(emojiQuery) : [], [emojiQuery, searching]);

  const sectionCategory: EmojiTabId = emptyRecent ? EMPTY_RECENT_FALLBACK : category;
  const items = searching
    ? results
    : category === 'recent'
      ? (emptyRecent ? emojiItemsForCategory(EMPTY_RECENT_FALLBACK) : recentItems)
      : emojiItemsForCategory(category);
  const heading = searching ? 'Results' : EMOJI_CATEGORY_LABELS[sectionCategory];

  const gifs = useMemo(() => searchGifs(gifQuery), [gifQuery]);
  const rows = useMemo(() => gifRows(gifs), [gifs]);

  // A new section starts at the top; scrolling into the middle of "Flags"
  // because the previous category was longer would look like a glitch.
  useEffect(() => {
    if (items.length) { gridRef.current?.scrollToOffset({offset: 0, animated: false}); }
  }, [category, emojiQuery, items.length, tab]);

  const contentWidth = Math.max(0, windowWidth - PANEL_SIDE_PADDING * 2);
  const columns = useMemo(
    () => Math.max(MIN_GRID_COLUMNS, Math.min(MAX_GRID_COLUMNS, Math.floor(contentWidth / GRID_CELL_TARGET))),
    [contentWidth],
  );
  const railWidth = Math.min(contentWidth, VISIBLE_RAIL_TABS * RAIL_CELL_WIDTH);
  const gifRowHeight = Math.round(((contentWidth - GIF_GAP * 2) / 3) / GIF_ASPECT_RATIO);

  const pickEmoji = useCallback((emoji: string) => {
    onSelectEmoji(emoji);
    // Only the stored history moves; the grid on screen keeps its order so a
    // run of taps lands on the emoji the user is aiming at.
    recordRecentEmoji(emoji).then(setRecent).catch(() => undefined);
  }, [onSelectEmoji]);

  const changeTab = useCallback((next: 'emoji' | 'gif') => {
    // The search field belongs to the tab that owns it, so leaving a tab clears
    // its query instead of filtering the other tab by a term meant for this one.
    Keyboard.dismiss();
    setTab(next);
    setEmojiQuery('');
    setGifQuery('');
  }, []);

  const changeCategory = useCallback((next: EmojiTabId) => {
    setCategory(next);
    setEmojiQuery('');
    // Coming back to Recent is when both latches are re-evaluated, so picks made
    // since the panel opened are on the tab by the time the user returns to it.
    if (next === 'recent') {
      setSuggestingOnRecent(recent.length === 0);
      setDisplayRecent(recent);
    }
  }, [recent]);

  const focusSearch = useCallback(() => { searchFocused.current = true; }, []);
  const blurSearch = useCallback(() => { searchFocused.current = false; }, []);

  if (!visible) { return null; }

  const panelStyle = searchKeyboard
    // The keyboard covers the home indicator, so the compact panel has no
    // inset of its own, and it may give way further on a very short screen.
    ? [styles.panel, styles.panelCompact, {height: COMPACT_PANEL_HEIGHT}]
    : [styles.panel, {height: emojiPanelHeight(windowHeight) + bottomInset, paddingBottom: bottomInset}];

  return <View accessibilityLabel="Emoji picker" style={panelStyle}>
    {showGifTab ? <TabSwitcher activeTab={tab} onChange={changeTab} /> : null}
    {tab === 'emoji' && !searchKeyboard ? <CategoryRail activeTab={category} onChange={changeCategory} width={railWidth} /> : null}

    {tab === 'emoji' ? (
      <View style={styles.body}>
        <SearchField onBlur={blurSearch} onChangeText={setEmojiQuery} onFocus={focusSearch} placeholder="Search Emoji" value={emojiQuery} />
        <Text accessibilityRole="header" style={styles.sectionHeading}>{heading}</Text>
        {items.length === 0 ? (
          <Text style={styles.emptyMessage}>
            {searching
              ? 'No emoji matched that search yet.'
              : 'Nothing here yet. Pick a category to browse the catalogue.'}
          </Text>
        ) : (
          <FlatList
            data={items}
            key={`emoji-grid-${columns}`}
            keyboardShouldPersistTaps="handled"
            keyExtractor={item => `${item.categoryId}-${item.itemIndex}-${item.emoji}`}
            numColumns={columns}
            ref={gridRef}
            renderItem={({item}) => (
              <Pressable
                accessibilityLabel={`Add ${item.emoji}`}
                accessibilityRole="button"
                onPress={() => pickEmoji(item.emoji)}
                style={[styles.emojiCell, {width: `${100 / columns}%`}]}
              >
                <Text style={styles.emojiGlyph}>{item.emoji}</Text>
              </Pressable>
            )}
            showsVerticalScrollIndicator={false}
            style={styles.grid}
          />
        )}
      </View>
    ) : (
      <View style={styles.body}>
        <SearchField onBlur={blurSearch} onChangeText={setGifQuery} onFocus={focusSearch} placeholder="Search GIF" value={gifQuery} />
        {gifs.length === 0 ? (
          <Text style={styles.emptyMessage}>No GIFs matched that search yet.</Text>
        ) : (
          <FlatList
            contentContainerStyle={styles.gifContent}
            data={rows}
            keyboardShouldPersistTaps="handled"
            keyExtractor={row => row.map(gif => gif.id).join('|')}
            renderItem={({item: row}) => {
              const widths = gifRowWidths(row, contentWidth, GIF_GAP);
              return <View style={styles.gifRow}>
                {row.map((gif, index) => <GifTile gif={gif} height={gifRowHeight} key={gif.id} onPress={() => onSelectGif?.(gif)} width={widths[index]} />)}
              </View>;
            }}
            showsVerticalScrollIndicator={false}
            style={styles.grid}
          />
        )}
      </View>
    )}
  </View>;
}

const styles = createThemedStyles({
  // The design draws the picker as a sheet in the keyboard's place: rounded
  // top corners, lifted off the thread. It keeps its height (no flexShrink) so
  // a long conversation above it cannot squeeze the grid down to one row.
  panel: {
    flexShrink: 0,
    paddingTop: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: '#E6EAF0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 6,
  },
  // The compact panel may give way on a very short screen rather than push the
  // composer up behind the header.
  panelCompact: {flexShrink: 1, minHeight: 132, paddingTop: 10},
  switcherRow: {alignItems: 'center'},
  switcher: {height: 32, width: 112, padding: 2, borderWidth: 1, borderColor: '#EEF1F5', borderRadius: 8, flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#FFFFFF'},
  switcherCell: {flex: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center'},
  switcherDivider: {width: 1, marginVertical: 4, backgroundColor: '#EEF1F5'},
  pillActive: {backgroundColor: '#F1EBFE'},
  gifBadge: {minWidth: 26, height: 18, paddingHorizontal: 4, borderWidth: 1.4, borderColor: '#475569', borderRadius: 5, alignItems: 'center', justifyContent: 'center'},
  gifBadgeActive: {borderColor: ACTIVE},
  gifBadgeText: {color: '#475569', fontFamily: FONT_FAMILY, fontSize: 8, fontWeight: '800', letterSpacing: 0.2},
  gifBadgeTextActive: {color: ACTIVE},
  railRow: {marginTop: 10, alignItems: 'center'},
  rail: {height: 32, padding: 2, borderWidth: 1, borderColor: '#EEF1F5', borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFFFFF'},
  railCell: {height: '100%', borderRadius: 6, alignItems: 'center', justifyContent: 'center'},
  railDivider: {borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#EEF1F5'},
  body: {flex: 1, marginTop: 10, paddingHorizontal: PANEL_SIDE_PADDING},
  searchField: {height: 40, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#F6F7F9', flexDirection: 'row', alignItems: 'center', gap: 10},
  searchInput: {flex: 1, padding: 0, color: '#0F172A', fontFamily: FONT_FAMILY, fontSize: 13},
  sectionHeading: {marginTop: 10, marginBottom: 2, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '600'},
  emptyMessage: {marginTop: 18, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 12, textAlign: 'center'},
  grid: {flex: 1},
  emojiCell: {height: 36, alignItems: 'center', justifyContent: 'center'},
  emojiGlyph: {fontSize: 22, lineHeight: 28},
  gifContent: {paddingTop: 10, paddingBottom: 8},
  gifRow: {flexDirection: 'row', gap: GIF_GAP, marginBottom: GIF_GAP},
  gifTile: {overflow: 'hidden', borderRadius: 6, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center'},
  gifImage: {width: '100%', height: '100%'},
  gifSpinner: {position: 'absolute'},
  gifUnavailable: {paddingHorizontal: 6, color: '#64748B', fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: '600', textAlign: 'center'},
});
