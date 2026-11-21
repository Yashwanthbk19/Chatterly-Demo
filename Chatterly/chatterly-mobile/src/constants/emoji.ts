/**
 * Sprint 4 Story 6's emoji catalogue.
 *
 * Categories and their order retain the web client's catalogue. Unicode CLDR
 * supplies names and keywords for every glyph, alongside the existing aliases,
 * so an emoji is searchable by its own name rather than just its category.
 *
 * The one deliberate difference: an emoji the web lists under two categories
 * is kept only under the first, so a glyph resolves to exactly one category
 * when the recents list is read back.
 */
import {EMOJI_ANNOTATIONS} from './emojiAnnotations';

export type EmojiCategoryId =
  | 'smileys'
  | 'people'
  | 'animals'
  | 'food'
  | 'travel'
  | 'activities'
  | 'objects'
  | 'symbols'
  | 'flags';

/** `recent` is a view over what this user has used, not a catalogue category. */
export type EmojiTabId = 'recent' | EmojiCategoryId;

export type EmojiCategory = {
  id: EmojiCategoryId;
  label: string;
  /** Free-text tokens every emoji in the category inherits when searching. */
  keywords: string;
  emojis: string[];
};

export type EmojiItem = {
  emoji: string;
  categoryId: EmojiCategoryId;
  categoryIndex: number;
  itemIndex: number;
  keywords: string[];
};

const EMOJI_CATEGORY_DEFINITIONS: EmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    keywords: 'smiley face emotion expression',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰',
      '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳',
      '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤',
      '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🫣', '🤭',
      '🫢', '🤫', '🤥', '😶', '🫠', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴',
      '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '👻', '👽', '🤖',
      '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
    ],
  },
  {
    id: 'people',
    label: 'People',
    keywords: 'people person human gesture body hand family',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🙏',
      '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '👀', '👁️',
      '👅', '👄', '👶', '👧', '🧒', '👦', '👩', '🧑', '👨', '👩‍🦱', '👨‍🦱', '👩‍🦰', '👨‍🦰', '👱‍♀️', '👱‍♂️', '🧔',
      '👵', '👴', '🙍‍♀️', '🙍‍♂️', '🙎‍♀️', '🙎‍♂️', '🙅‍♀️', '🙅‍♂️', '🙆‍♀️', '🙆‍♂️', '💁‍♀️', '💁‍♂️', '🙋‍♀️', '🙋‍♂️', '🧏‍♀️', '🧏‍♂️',
      '🙇‍♀️', '🙇‍♂️', '🤦‍♀️', '🤦‍♂️', '🤷‍♀️', '🤷‍♂️', '👮‍♀️', '👮‍♂️', '👷‍♀️', '👷‍♂️', '🧑‍⚕️', '👨‍🍳', '👩‍💻', '🧑‍🎓', '💃', '🕺',
      '🧍‍♀️', '🧍‍♂️', '🚶‍♀️', '🚶‍♂️', '🏃‍♀️', '🏃‍♂️', '🧎‍♀️', '🧎‍♂️', '🧘‍♀️', '🧘‍♂️', '🛌',
    ],
  },
  {
    id: 'animals',
    label: 'Animals',
    keywords: 'animal animals nature pet wildlife flower tree plant',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸',
      '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🐣', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴',
      '🦄', '🐝', '🪲', '🐞', '🦋', '🐌', '🐛', '🐢', '🐍', '🦎', '🦂', '🦀', '🦞', '🐙', '🦑', '🦐',
      '🐠', '🐟', '🐬', '🐳', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫',
      '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🐐', '🦌', '🐕', '🐈', '🐓', '🦃',
      '🦚', '🦜', '🦢', '🕊️', '🐇', '🦔', '🌲', '🌳', '🌴', '🌵', '🌷', '🌹', '🌺', '🌻', '🌼', '🪷',
      '🍀', '🌿', '☘️', '🍁', '🍂', '🍃', '🍄',
    ],
  },
  {
    id: 'food',
    label: 'Food',
    keywords: 'food drink meal fruit snack dessert cafe',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥',
      '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🫘',
      '🌰', '🥐', '🍞', '🥖', '🫓', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🍔', '🍟', '🍕',
      '🌭', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🥗', '🥘', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟',
      '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🍢', '🍡', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁',
      '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '☕', '🍵', '🧃', '🥤', '🍺', '🍻', '🍷', '🍸', '🍹', '🧉',
    ],
  },
  {
    id: 'travel',
    label: 'Travel',
    keywords: 'travel transport vacation holiday city place',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛵', '🏍️',
      '🛺', '🚲', '🛴', '🚏', '⛽', '🚨', '🚥', '🚦', '🛞', '✈️', '🛫', '🛬', '🪂', '🚁', '🚟', '🚠',
      '🚡', '🚂', '🚆', '🚅', '🚄', '🚇', '🚊', '🚉', '🚞', '🚋', '⛵', '🚤', '🛥️', '🛳️', '🚢', '⚓',
      '🗺️', '🧭', '🏖️', '🏝️', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '🌋', '⛲', '🏜️', '🌁',
      '🌃', '🏙️', '🌄', '🌅', '🌆', '🌇', '🌉', '🛣️', '🛤️',
    ],
  },
  {
    id: 'activities',
    label: 'Activities',
    keywords: 'activities sports celebration music game hobby',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍',
      '🏏', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿',
      '⛷️', '🏂', '🏋️‍♀️', '🏋️‍♂️', '🤸‍♀️', '🤸‍♂️', '⛹️‍♀️', '⛹️‍♂️', '🤾‍♀️', '🤾‍♂️', '🏌️‍♀️', '🏌️‍♂️', '🏄‍♀️', '🏄‍♂️', '🚣‍♀️', '🚣‍♂️',
      '🏊‍♀️', '🏊‍♂️', '🤽‍♀️', '🤽‍♂️', '🚴‍♀️', '🚴‍♂️', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎯', '🎳', '🎮', '🧩',
      '♟️', '🎨', '🎭', '🎤', '🎧', '🎹', '🥁', '🎷', '🎺', '🎸', '🪘', '🎬', '🎪', '🎟️', '🎫', '🎊',
      '🎉',
    ],
  },
  {
    id: 'objects',
    label: 'Objects',
    keywords: 'objects tool tools tech device office home money',
    emojis: [
      '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '💽', '💾', '💿', '📀', '🎥', '🎞️', '📷',
      '📸', '📹', '📼', '🔍', '🔎', '💡', '🔦', '🏮', '🕯️', '🔌', '🔋', '🪫', '📞', '☎️', '📟', '📠',
      '📺', '📻', '🎙️', '🎚️', '🎛️', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔭', '🔬', '💊', '💉',
      '🩹', '🩺', '🩻', '🚪', '🪑', '🛏️', '🛋️', '🚽', '🚿', '🛁', '🧴', '🧷', '🧹', '🧺', '🧻', '🪣',
      '🧼', '🫧', '🪥', '🧽', '🧯', '🛒', '🚬', '⚰️', '🪦', '⚱️', '🗿', '🪪', '💸', '💵', '💴', '💶',
      '💷', '🪙', '💰', '💎', '⚖️', '🪜', '🧰', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🪛', '🔩', '⚙️',
      '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '📿', '🔒', '🔓', '🗝️',
    ],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    keywords: 'symbols marks arrows zodiac religion check alert',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '🩵', '💜', '🩷', '🤎', '🖤', '🩶', '🤍', '💔', '❣️', '💕', '💞',
      '💓', '💗', '💖', '💘', '💝', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐',
      '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '⚛️', '☢️', '☣️', '💤',
      '♨️', '♻️', '⚜️', '🔱', '📛', '🔰', '⭕', '✅', '☑️', '✔️', '❌', '❎', '➕', '➖', '➗', '✖️',
      '♾️', '‼️', '⁉️', '❗', '❕', '❓', '❔', '💯', '🔔', '🔕', '🎵', '🎶', '➡️', '⬅️', '⬆️', '⬇️',
      '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↩️', '↪️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '◀️', '▶️',
      '⏪', '⏩', '⏭️', '⏮️', '⏹️', '⏺️', '™️', '©️', '®️', '〰️', '➰', '➿',
    ],
  },
  {
    id: 'flags',
    label: 'Flags',
    keywords: 'flags flag country countries world nation pride travel',
    emojis: [
      '🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏳️‍⚧️', '🇮🇳', '🇺🇸', '🇬🇧', '🇨🇦', '🇦🇺', '🇳🇿', '🇿🇦', '🇸🇬', '🇯🇵', '🇰🇷',
      '🇨🇳', '🇫🇷', '🇩🇪', '🇪🇸', '🇮🇹', '🇳🇱', '🇧🇷', '🇦🇷', '🇲🇽', '🇸🇦', '🇦🇪', '🇹🇷', '🇪🇬', '🇳🇬', '🇰🇪', '🇵🇰',
      '🇧🇩', '🇳🇵', '🇱🇰', '🇮🇩', '🇲🇾', '🇹🇭', '🇻🇳', '🇵🇭',
    ],
  },
];

/** Per-emoji search words, for what a category keyword alone cannot describe. */
const EMOJI_SEARCH_TOKENS: Record<string, string> = {
  '😂': 'laugh joy tears funny lol',
  '🤣': 'rolling laugh rofl funny',
  '😍': 'love heart eyes crush',
  '🥰': 'love hearts smiling affectionate',
  '😘': 'kiss blowing heart',
  '😎': 'cool sunglasses chill vibe',
  '😭': 'cry sob tears sad',
  '😡': 'angry mad rage',
  '😱': 'shock scream fear surprise',
  '🤔': 'thinking wonder curious',
  '🤗': 'hug embrace warm',
  '🤭': 'giggle oops shy',
  '🤯': 'mind blown wow shocked',
  '🥳': 'party celebrate congrats birthday',
  '👍': 'thumbs up yes ok',
  '👎': 'thumbs down no dislike',
  '👏': 'clap applause well done',
  '🙌': 'celebration hooray hands up',
  '🙏': 'pray thanks please namaste',
  '💪': 'muscle strong workout',
  '👀': 'eyes look watch',
  '❤️': 'heart love red romance classic',
  '💔': 'heart broken breakup sad',
  '🔥': 'fire lit hot',
  '✨': 'sparkles magic shine',
  '🎉': 'party popper celebration',
  '🎂': 'cake birthday dessert',
  '🍕': 'pizza slice food',
  '🍔': 'burger hamburger food',
  '🍟': 'fries chips food',
  '☕': 'coffee tea drink',
  '🍺': 'beer drink cheers',
  '🚗': 'car auto drive vehicle',
  '✈️': 'airplane flight travel',
  '🏖️': 'beach holiday vacation',
  '⚽': 'football soccer sport',
  '🏀': 'basketball sport',
  '🎮': 'game gaming controller',
  '🎵': 'music note song',
  '🎤': 'mic microphone sing',
  '📱': 'phone mobile smartphone',
  '💻': 'laptop computer work',
  '⌚': 'watch time wearable',
  '📷': 'camera photo picture',
  '📞': 'telephone call',
  '🔋': 'battery power',
  '🔌': 'plug charge charging',
  '💡': 'idea light bulb',
  '💸': 'money cash spend',
  '💰': 'money bag savings',
  '💎': 'diamond gem luxury',
  '🔒': 'lock secure private',
  '🔓': 'unlock open',
  '🛠️': 'tools fix repair',
  '⚙️': 'settings gear',
  '🔧': 'wrench tool',
  '🔨': 'hammer tool',
  '⚔️': 'swords battle',
  '🛡️': 'shield protect',
  '✅': 'check success done',
  '❌': 'cross no cancel',
  '❗': 'important alert',
  '❓': 'question ask',
  '🏳️‍🌈': 'rainbow flag pride lgbt',
  '🇮🇳': 'india indian flag tricolor',
  '🇺🇸': 'usa united states america flag',
  '🇬🇧': 'uk united kingdom britain england flag',
  '🧡': 'heart love orange affection',
  '💛': 'heart love yellow affection',
  '💚': 'heart love green affection',
  '💙': 'heart love blue affection',
  '🩵': 'heart love light blue cyan affection',
  '🤎': 'heart love brown affection',
  '🖤': 'heart love black affection',
  '🩶': 'heart love gray grey affection',
  '🤍': 'heart love white affection',
  '❣️': 'heart exclamation love',
  '💕': 'heart hearts pink love affection',
  '💞': 'heart revolving love affection',
  '💓': 'heart beating love affection',
  '💗': 'heart growing love affection',
  '💖': 'heart sparkling love affection',
  '💘': 'heart arrow cupid love romance',
  '💝': 'heart ribbon gift love affection',
  '🏳️': 'white flag surrender flag',
  '🏴': 'black flag flag',
  '🏁': 'checkered flag racing finish flag',
  '🚩': 'triangular flag red flag marker',
  '🏳️‍⚧️': 'transgender flag pride trans',
  '🇨🇦': 'canada canadian flag',
  '🇦🇺': 'australia australian flag',
  '🇳🇿': 'new zealand flag',
  '🇿🇦': 'south africa flag',
  '🇸🇬': 'singapore flag',
  '🇯🇵': 'japan japanese flag',
  '🇰🇷': 'korea south korea flag',
  '🇨🇳': 'china chinese flag',
  '🇫🇷': 'france french flag',
  '🇩🇪': 'germany german flag',
  '🇪🇸': 'spain spanish flag',
  '🇮🇹': 'italy italian flag',
  '🇳🇱': 'netherlands dutch flag',
  '🇧🇷': 'brazil brazilian flag',
  '🇦🇷': 'argentina argentinian flag',
  '🇲🇽': 'mexico mexican flag',
  '🇸🇦': 'saudi arabia flag',
  '🇦🇪': 'uae united arab emirates flag',
  '🇹🇷': 'turkey turkish flag',
  '🇪🇬': 'egypt egyptian flag',
  '🇳🇬': 'nigeria nigerian flag',
  '🇰🇪': 'kenya kenyan flag',
  '🇵🇰': 'pakistan pakistani flag',
  '🇧🇩': 'bangladesh bangladeshi flag',
  '🇳🇵': 'nepal nepali flag',
  '🇱🇰': 'sri lanka flag',
  '🇮🇩': 'indonesia indonesian flag',
  '🇲🇾': 'malaysia malaysian flag',
  '🇹🇭': 'thailand thai flag',
  '🇻🇳': 'vietnam vietnamese flag',
  '🇵🇭': 'philippines filipino flag',
};

const tokenize = (value: string): string[] =>
  value.normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f\uFE0E\uFE0F]/g, '')
    .replace(/[-_:,]+/g, ' ')
    .trim().split(/\s+/).filter(Boolean);

export const EMOJI_CATEGORIES = EMOJI_CATEGORY_DEFINITIONS;

export const EMOJI_CATEGORY_LABELS: Record<EmojiTabId, string> = {
  recent: 'Recently used',
  smileys: 'Smileys',
  people: 'People',
  animals: 'Animals',
  food: 'Food',
  travel: 'Travel',
  activities: 'Activities',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
};

export const ALL_EMOJI_ITEMS: EmojiItem[] = EMOJI_CATEGORY_DEFINITIONS.flatMap(
  (category, categoryIndex) => category.emojis.map((emoji, itemIndex) => ({
    emoji,
    categoryId: category.id,
    categoryIndex,
    itemIndex,
    keywords: Array.from(new Set([
      category.id,
      ...tokenize(category.label),
      ...tokenize(category.keywords),
      ...tokenize(emoji),
      ...tokenize(EMOJI_ANNOTATIONS[emoji] || ''),
      ...tokenize(EMOJI_SEARCH_TOKENS[emoji] || ''),
    ])),
  })),
);

const EMOJI_ITEMS_BY_CATEGORY = new Map<EmojiCategoryId, EmojiItem[]>(
  EMOJI_CATEGORY_DEFINITIONS.map(category => [
    category.id,
    ALL_EMOJI_ITEMS.filter(item => item.categoryId === category.id),
  ]),
);

const EMOJI_ITEMS_BY_GLYPH = new Map<string, EmojiItem>(
  ALL_EMOJI_ITEMS.map(item => [item.emoji, item]),
);

export function emojiItemsForCategory(categoryId: EmojiCategoryId): EmojiItem[] {
  return EMOJI_ITEMS_BY_CATEGORY.get(categoryId) || [];
}

/** Turns stored glyphs back into catalogue entries, dropping any we retired. */
export function emojiItemsForGlyphs(glyphs: string[]): EmojiItem[] {
  return glyphs
    .map(glyph => EMOJI_ITEMS_BY_GLYPH.get(glyph))
    .filter((item): item is EmojiItem => Boolean(item));
}

export const emojiSearchTerms = (query: string): string[] => tokenize(query);

/**
 * Scores one emoji against the typed terms.
 *
 * Every term has to match something, so "red heart" cannot be satisfied by
 * "red" alone. An exact keyword outranks a prefix, which outranks a substring,
 * so typing "car" puts the car ahead of everything merely tagged "card".
 * A score of 0 means the emoji is not a result at all.
 */
export function emojiSearchScore(item: EmojiItem, terms: string[]): number {
  if (!terms.length) { return 0; }

  let total = 0;
  for (const term of terms) {
    let best = 0;
    for (const keyword of item.keywords) {
      if (keyword === term) { best = Math.max(best, 8); continue; }
      if (keyword.startsWith(term)) { best = Math.max(best, 5); continue; }
      if (keyword.includes(term)) { best = Math.max(best, 3); }
    }
    if (!best) { return 0; }
    total += best;
  }
  return total;
}

/** Highest scoring first, then catalogue order so results never reshuffle. */
export function searchEmojis(query: string): EmojiItem[] {
  const terms = emojiSearchTerms(query);
  if (!terms.length) { return []; }

  return ALL_EMOJI_ITEMS
    .map(item => ({item, score: emojiSearchScore(item, terms)}))
    .filter(result => result.score > 0)
    .sort((first, second) =>
      second.score - first.score ||
      first.item.categoryIndex - second.item.categoryIndex ||
      first.item.itemIndex - second.item.itemIndex)
    .map(result => result.item);
}
