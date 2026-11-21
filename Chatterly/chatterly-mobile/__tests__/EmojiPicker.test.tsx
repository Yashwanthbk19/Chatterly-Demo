import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {EmojiPicker} from '../src/components/EmojiPicker';
import {loadRecentEmojis, recordRecentEmoji} from '../src/services/recentEmojiStore';

jest.setTimeout(15000);

jest.mock('../src/services/recentEmojiStore', () => ({
  loadRecentEmojis: jest.fn(),
  recordRecentEmoji: jest.fn(),
  MAX_RECENT_EMOJIS: 24,
}));

const onSelectEmoji = jest.fn();
const onSelectGif = jest.fn();
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

async function renderPicker() {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <EmojiPicker onSelectEmoji={onSelectEmoji} onSelectGif={onSelectGif} visible />,
    );
    await Promise.resolve();
  });
  mountedRenderers.push(renderer!);
  return renderer!;
}

const press = async (renderer: ReactTestRenderer.ReactTestRenderer, label: string) => {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: label}).props.onPress();
    await Promise.resolve();
  });
};

const type = async (renderer: ReactTestRenderer.ReactTestRenderer, label: string, value: string) => {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: label}).props.onChangeText(value);
    await Promise.resolve();
  });
};

/**
 * The emoji currently laid out in the grid, in order. Only host nodes are
 * counted: a Pressable also exposes its label on the composite element above
 * the view it renders, which would report every glyph twice.
 */
const glyphsOn = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAll(node =>
      typeof node.type === 'string' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Add '))
    .map(node => String(node.props.accessibilityLabel).replace('Add ', ''));

const headingOn = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findByProps({accessibilityRole: 'header'}).props.children;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadRecentEmojis).mockResolvedValue([]);
  jest.mocked(recordRecentEmoji).mockResolvedValue([]);
});

test('finds an emoji by its own name across categories and inserts the selected result', async () => {
  const renderer = await renderPicker();
  await press(renderer, 'Flags');
  await type(renderer, 'Search Emoji', ':broccoli:');
  expect(headingOn(renderer)).toBe('Results');
  expect(glyphsOn(renderer)).toEqual(['🥦']);
  await press(renderer, 'Add 🥦');
  expect(onSelectEmoji).toHaveBeenCalledWith('🥦');
});

afterEach(() => {
  ReactTestRenderer.act(() => {
    mountedRenderers.splice(0).forEach(renderer => renderer.unmount());
  });
});

test('renders nothing until the composer opens it', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <EmojiPicker onSelectEmoji={onSelectEmoji} onSelectGif={onSelectGif} visible={false} />,
    );
  });
  mountedRenderers.push(renderer!);

  expect(renderer!.toJSON()).toBeNull();
});

test('opens on the Recent tab and shows the design first-run suggestions', async () => {
  const renderer = await renderPicker();

  expect(renderer.root.findByProps({accessibilityLabel: 'Emoji picker'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Recently used'}).props.accessibilityState.selected).toBe(true);
  // With no history the design shows the Objects set, headed by its own name.
  expect(headingOn(renderer)).toBe('Objects');
  expect(glyphsOn(renderer)).toContain('📱');
});

test('lists what the user has already used once there is a history', async () => {
  jest.mocked(loadRecentEmojis).mockResolvedValue(['🎉', '👍']);
  const renderer = await renderPicker();

  expect(headingOn(renderer)).toBe('Recently used');
  expect(glyphsOn(renderer).slice(0, 2)).toEqual(['🎉', '👍']);
});

test('the rail switches categories and names the section it is showing', async () => {
  const renderer = await renderPicker();

  await press(renderer, 'Travel');

  expect(headingOn(renderer)).toBe('Travel');
  expect(glyphsOn(renderer)).toContain('🚗');
  expect(glyphsOn(renderer)).not.toContain('📱');
});

// The web client's rail stops at seven; every category has to be reachable here.
test('the rail reaches all nine categories', async () => {
  const renderer = await renderPicker();

  for (const label of ['Smileys', 'People', 'Animals', 'Food', 'Travel', 'Activities', 'Objects', 'Symbols', 'Flags']) {
    await press(renderer, label);
    expect(headingOn(renderer)).toBe(label);
  }
});

test('searching filters across every category, not just the open one', async () => {
  const renderer = await renderPicker();

  await type(renderer, 'Search Emoji', 'pizza');

  expect(headingOn(renderer)).toBe('Results');
  expect(glyphsOn(renderer)).toEqual(['🍕']);
});

test('a search with no match says so instead of showing a blank grid', async () => {
  const renderer = await renderPicker();

  await type(renderer, 'Search Emoji', 'zzzznotanemoji');

  expect(glyphsOn(renderer)).toEqual([]);
  expect(renderer.root.findByProps({children: 'No emoji matched that search yet.'})).toBeDefined();
});

test('picking an emoji reports it and records it as recent', async () => {
  jest.mocked(recordRecentEmoji).mockResolvedValue(['🍕']);
  const renderer = await renderPicker();

  await press(renderer, 'Add 📱');

  expect(onSelectEmoji).toHaveBeenCalledWith('📱');
  expect(recordRecentEmoji).toHaveBeenCalledWith('📱');
});

// The picker stays put so a run of emoji can be tapped in one go.
test('the panel is still open after a pick', async () => {
  const renderer = await renderPicker();

  await press(renderer, 'Add 📱');
  await press(renderer, 'Add ⌚');

  expect(onSelectEmoji).toHaveBeenNthCalledWith(1, '📱');
  expect(onSelectEmoji).toHaveBeenNthCalledWith(2, '⌚');
  expect(renderer.root.findByProps({accessibilityLabel: 'Emoji picker'})).toBeDefined();
});

test('the GIF tab replaces the emoji grid with searchable GIFs', async () => {
  const renderer = await renderPicker();

  await press(renderer, 'GIF');

  expect(renderer.root.findByProps({accessibilityLabel: 'Search GIF'})).toBeDefined();
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Search Emoji'})).toHaveLength(0);
  expect(glyphsOn(renderer)).toEqual([]);
  expect(renderer.root.findByProps({accessibilityLabel: 'Send Thumbs up GIF'})).toBeDefined();

  await type(renderer, 'Search GIF', 'thanks');

  expect(renderer.root.findAllByProps({accessibilityLabel: 'Send Thumbs up GIF'})).toHaveLength(0);
  expect(renderer.root.findByProps({accessibilityLabel: 'Send Thank you GIF'})).toBeDefined();
});

test('choosing a GIF hands the whole catalogue entry back', async () => {
  const renderer = await renderPicker();

  await press(renderer, 'GIF');
  await press(renderer, 'Send Party GIF');

  expect(onSelectGif).toHaveBeenCalledWith(expect.objectContaining({
    id: 'party',
    label: 'Party',
    url: expect.stringMatching(/\.gif$/),
  }));
});

// Each tab owns its search field; a term typed in one must not filter the other.
test('switching tabs clears the query that belonged to the tab being left', async () => {
  const renderer = await renderPicker();

  await type(renderer, 'Search Emoji', 'pizza');
  await press(renderer, 'GIF');

  expect(renderer.root.findByProps({accessibilityLabel: 'Search GIF'}).props.value).toBe('');

  await press(renderer, 'Emoji');

  expect(renderer.root.findByProps({accessibilityLabel: 'Search Emoji'}).props.value).toBe('');
});

// Picking from the first-run suggestions used to collapse the grid to that one
// emoji, moving every other target out from under the user's finger.
test('the first-run suggestions stay put while picks accumulate behind them', async () => {
  jest.mocked(recordRecentEmoji).mockImplementation(async emoji => [emoji]);
  const renderer = await renderPicker();

  await press(renderer, 'Add 📱');

  expect(headingOn(renderer)).toBe('Objects');
  expect(glyphsOn(renderer)).toContain('⌚');

  // Leaving Recent and coming back is when the history takes over the tab.
  await press(renderer, 'Travel');
  await press(renderer, 'Recently used');

  expect(headingOn(renderer)).toBe('Recently used');
  expect(glyphsOn(renderer)).toEqual(['📱']);
});

test('the Recent grid holds its order while picks are made, so a run of taps lands where aimed', async () => {
  jest.mocked(loadRecentEmojis).mockResolvedValue(['🎉', '👍', '❤️']);
  // Recording moves the picked glyph to the front of the stored history.
  jest.mocked(recordRecentEmoji).mockImplementation(async emoji =>
    [emoji, ...['🎉', '👍', '❤️'].filter(item => item !== emoji)]);
  const renderer = await renderPicker();

  expect(glyphsOn(renderer)).toEqual(['🎉', '👍', '❤️']);

  // Tapping the third one must not pull it under the finger that is already
  // moving towards the third slot again.
  await press(renderer, 'Add ❤️');
  expect(glyphsOn(renderer)).toEqual(['🎉', '👍', '❤️']);

  await press(renderer, 'Add ❤️');
  expect(onSelectEmoji).toHaveBeenNthCalledWith(1, '❤️');
  expect(onSelectEmoji).toHaveBeenNthCalledWith(2, '❤️');

  // The new order is taken up the next time the tab is entered.
  await press(renderer, 'Travel');
  await press(renderer, 'Recently used');
  expect(glyphsOn(renderer)).toEqual(['❤️', '🎉', '👍']);
});

test('a query belongs to the session that typed it and does not survive a reopen', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <EmojiPicker onSelectEmoji={onSelectEmoji} onSelectGif={onSelectGif} visible />,
    );
    await Promise.resolve();
  });
  mountedRenderers.push(renderer!);

  await type(renderer!, 'Search Emoji', 'pizza');
  expect(headingOn(renderer!)).toBe('Results');

  await ReactTestRenderer.act(async () => {
    renderer!.update(<EmojiPicker onSelectEmoji={onSelectEmoji} onSelectGif={onSelectGif} visible={false} />);
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    renderer!.update(<EmojiPicker onSelectEmoji={onSelectEmoji} onSelectGif={onSelectGif} visible />);
    await Promise.resolve();
  });

  expect(renderer!.root.findByProps({accessibilityLabel: 'Search Emoji'}).props.value).toBe('');
  expect(headingOn(renderer!)).not.toBe('Results');
});

test('the panel keeps a keyboard-sized height instead of being squeezed by a long thread', async () => {
  const renderer = await renderPicker();
  const panel = renderer.root.findByProps({accessibilityLabel: 'Emoji picker'});
  const style = Object.assign({}, ...[panel.props.style].flat(3).filter(Boolean));
  expect(style.flexShrink).toBe(0);
  expect(style.height).toBeGreaterThanOrEqual(300);
  expect(style.borderTopLeftRadius).toBe(16);
});

test('GIF tiles play the small rendition while the full GIF is what gets sent', async () => {
  const renderer = await renderPicker();
  await press(renderer, 'GIF');

  const tile = renderer.root.findByProps({accessibilityLabel: 'Send Thumbs up GIF'});
  const image = tile.findAll(node => node.props?.source?.uri)[0];
  expect(image.props.source.uri).toMatch(/\/200w\.gif$/);

  await press(renderer, 'Send Thumbs up GIF');
  expect(onSelectGif).toHaveBeenCalledWith(expect.objectContaining({url: expect.stringMatching(/\/giphy\.gif$/)}));
});

test('the GIF tab offers far more than the original nine', async () => {
  const renderer = await renderPicker();
  await press(renderer, 'GIF');
  await type(renderer, 'Search GIF', 'love');
  const sendLabels = renderer.root
    .findAll(node => typeof node.type === 'string' && String(node.props.accessibilityLabel || '').startsWith('Send '))
    .map(node => node.props.accessibilityLabel);
  expect(new Set(sendLabels).size).toBeGreaterThanOrEqual(4);
});
