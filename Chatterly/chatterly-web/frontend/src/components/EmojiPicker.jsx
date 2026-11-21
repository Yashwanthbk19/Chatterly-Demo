import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { getTwemojiAssetName, isEmojiRenderable, warmUpEmojiSupport } from '../utils/emojiSupport';

const RECENT_EMOJIS_STORAGE_KEY = 'chatterly_recent_emojis';
const MAX_RECENT_EMOJIS = 36;
const EMOJI_GLYPH_CLASSNAME = 'chatterly-emoji-glyph';
const TWEMOJI_CDN_BASE_URL = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg';
const REGIONAL_INDICATOR_FLAG_PATTERN = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;
const SPECIAL_FLAG_EMOJIS = new Set(['🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏳️‍⚧️']);

const PICKER_TABS = [
  { id: 'emoji', label: 'Emoji' },
  { id: 'gif', label: 'GIF' },
];

const GIF_CARD_ITEMS = [
  { id: 'lol', label: 'LOL', caption: 'Quick reactions', emoji: '😂', gradient: 'from-[#8B5CF6] via-[#A855F7] to-[#EC4899]', searchText: 'lol laugh funny haha reaction' },
  { id: 'love', label: 'Love', caption: 'Warm moments', emoji: '😍', gradient: 'from-[#FB7185] via-[#F43F5E] to-[#EC4899]', searchText: 'love heart romance sweet' },
  { id: 'wow', label: 'Wow', caption: 'Big surprise', emoji: '😮', gradient: 'from-[#38BDF8] via-[#0EA5E9] to-[#6366F1]', searchText: 'wow surprise shocked omg' },
  { id: 'party', label: 'Party', caption: 'Celebrate fast', emoji: '🥳', gradient: 'from-[#F59E0B] via-[#F97316] to-[#EF4444]', searchText: 'party celebrate congrats fun' },
  { id: 'mood', label: 'Mood', caption: 'Daily vibes', emoji: '😎', gradient: 'from-[#14B8A6] via-[#10B981] to-[#22C55E]', searchText: 'mood vibe cool chill' },
  { id: 'oops', label: 'Oops', caption: 'Playful misses', emoji: '🙈', gradient: 'from-[#64748B] via-[#475569] to-[#0F172A]', searchText: 'oops awkward shy playful' },
];

const CHAT_LIST_GIF_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'reactions', label: 'Reactions' },
  { id: 'happy', label: 'Happy' },
  { id: 'love', label: 'Love' },
  { id: 'celebrate', label: 'Celebrate' },
  { id: 'thanks', label: 'Thanks' },
  { id: 'sad', label: 'Sad' },
  { id: 'work', label: 'Work' },
  { id: 'cute', label: 'Cute' },
  { id: 'stickers', label: 'Stickers' },
];

const createChatListGifItem = ({
  id,
  label,
  category,
  url,
  keywords = '',
  className = 'col-span-4',
}) => ({
  id,
  label,
  category,
  alt: `${label} GIF`,
  className,
  imageUrl: url,
  animatedUrl: url,
  searchText: `${label} ${category} ${keywords}`.toLowerCase(),
});

const CHAT_LIST_GIF_ITEMS = [
  { id: 'excited', label: 'Excited celebration', category: 'happy', url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif', className: 'col-span-5', keywords: 'excited celebration happy yay reaction' },
  { id: 'laughing', label: 'Laughing', category: 'reactions', url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif', className: 'col-span-5', keywords: 'laugh laughing funny lol haha reaction' },
  { id: 'applause', label: 'Applause', category: 'reactions', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', className: 'col-span-3', keywords: 'clap applause nice yes good reaction' },
  { id: 'thumbs-up', label: 'Thumbs up', category: 'reactions', url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif', className: 'col-span-4', keywords: 'thumbs up yes ok approve reaction' },
  { id: 'wow', label: 'Wow', category: 'reactions', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', className: 'col-span-3', keywords: 'wow surprised shocked mind blown reaction' },
  { id: 'mind-blown', label: 'Mind blown', category: 'reactions', url: 'https://media.giphy.com/media/Um3ljJl8jrnHy/giphy.gif', className: 'col-span-5', keywords: 'mind blown amazed shocked reaction' },
  { id: 'facepalm', label: 'Facepalm', category: 'reactions', url: 'https://media.giphy.com/media/3xz2BLBOt13X9AgjEA/giphy.gif', className: 'col-span-4', keywords: 'facepalm oops mistake awkward reaction' },
  { id: 'nope', label: 'Nope', category: 'reactions', url: 'https://media.giphy.com/media/3o7TKwmnDgQb5jemjK/giphy.gif', className: 'col-span-4', keywords: 'no nope disagree not happening reaction' },
  { id: 'yes', label: 'Yes', category: 'reactions', url: 'https://media.giphy.com/media/3ohhweiVB36rAlqVCE/giphy.gif', className: 'col-span-4', keywords: 'yes agree correct nod reaction' },
  { id: 'deal-with-it', label: 'Deal with it', category: 'reactions', url: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif', className: 'col-span-5', keywords: 'cool sunglasses deal with it reaction' },
  { id: 'happy-dance', label: 'Happy dance', category: 'happy', url: 'https://media.giphy.com/media/ASd0Ukj0y3qMM/giphy.gif', className: 'col-span-5', keywords: 'happy dance excited yay mood' },
  { id: 'smile', label: 'Big smile', category: 'happy', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', className: 'col-span-5', keywords: 'smile happy cheerful dance fun' },
  { id: 'good-mood', label: 'Good mood', category: 'happy', url: 'https://media.giphy.com/media/chzz1FQgqhytWRWbp3/giphy.gif', className: 'col-span-4', keywords: 'good mood happy excited' },
  { id: 'laugh-cry', label: 'Laugh cry', category: 'happy', url: 'https://media.giphy.com/media/Q7ozWVYCR0nyW2rvPW/giphy.gif', className: 'col-span-5', keywords: 'laugh cry funny lol haha' },
  { id: 'grinning', label: 'Grinning', category: 'happy', url: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif', className: 'col-span-4', keywords: 'grin happy smile cheerful' },
  { id: 'love-hearts', label: 'Love hearts', category: 'love', url: 'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif', className: 'col-span-6', keywords: 'love heart cute affection reaction' },
  { id: 'heart-eyes', label: 'Heart eyes', category: 'love', url: 'https://media.giphy.com/media/R6gvnAxj2ISzJdbA63/giphy.gif', className: 'col-span-4', keywords: 'love heart eyes adore cute' },
  { id: 'sending-love', label: 'Sending love', category: 'love', url: 'https://media.giphy.com/media/Z21HJj2kz9uBG/giphy.gif', className: 'col-span-5', keywords: 'sending love heart hug affection' },
  { id: 'hug', label: 'Hug', category: 'love', url: 'https://media.giphy.com/media/od5H3PmEG5EVq/giphy.gif', className: 'col-span-4', keywords: 'hug warm comfort love support' },
  { id: 'miss-you', label: 'Miss you', category: 'love', url: 'https://media.giphy.com/media/l4FGpP4lxGGgK5CBW/giphy.gif', className: 'col-span-4', keywords: 'miss you love affection' },
  { id: 'party', label: 'Party', category: 'celebrate', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', className: 'col-span-5', keywords: 'party celebrate dancing fun reaction' },
  { id: 'congrats', label: 'Congrats', category: 'celebrate', url: 'https://media.giphy.com/media/3oz8xAFtqoOUUrsh7W/giphy.gif', className: 'col-span-4', keywords: 'congrats congratulations celebration win' },
  { id: 'cheers', label: 'Cheers', category: 'celebrate', url: 'https://media.giphy.com/media/BPJmthQ3YRwD6QqcVD/giphy.gif', className: 'col-span-4', keywords: 'cheers toast celebrate party' },
  { id: 'fireworks', label: 'Fireworks', category: 'celebrate', url: 'https://media.giphy.com/media/26tOZ42Mg6pbTUPHW/giphy.gif', className: 'col-span-5', keywords: 'fireworks celebration festive party' },
  { id: 'birthday', label: 'Birthday', category: 'celebrate', url: 'https://media.giphy.com/media/SwIMZUJE3ZPpHAfTC4/giphy.gif', className: 'col-span-4', keywords: 'birthday cake celebrate wishes' },
  { id: 'success', label: 'Success', category: 'celebrate', url: 'https://media.giphy.com/media/ely3apij36BJhoZ234/giphy.gif', className: 'col-span-4', keywords: 'success win done achievement' },
  { id: 'thank-you', label: 'Thank you', category: 'thanks', url: 'https://media.giphy.com/media/3oEdva9BUHPIs2SkGk/giphy.gif', className: 'col-span-3', keywords: 'thanks thank you grateful reaction' },
  { id: 'thanks-so-much', label: 'Thanks so much', category: 'thanks', url: 'https://media.giphy.com/media/3o6Zt6KHxJTbXCnSvu/giphy.gif', className: 'col-span-5', keywords: 'thanks thank you appreciate grateful' },
  { id: 'you-rock', label: 'You rock', category: 'thanks', url: 'https://media.giphy.com/media/l4pMattUYTTM7qpIk/giphy.gif', className: 'col-span-4', keywords: 'you rock thanks awesome appreciate' },
  { id: 'please', label: 'Please', category: 'thanks', url: 'https://media.giphy.com/media/l0NwNrl4BtDD7JCx2/giphy.gif', className: 'col-span-4', keywords: 'please request pray thanks' },
  { id: 'sad-tears', label: 'Sad tears', category: 'sad', url: 'https://media.giphy.com/media/OPU6wzx8JrHna/giphy.gif', className: 'col-span-4', keywords: 'sad cry tears upset' },
  { id: 'crying', label: 'Crying', category: 'sad', url: 'https://media.giphy.com/media/BEob5qwFkSJ7G/giphy.gif', className: 'col-span-4', keywords: 'crying sad emotional tears' },
  { id: 'tired', label: 'Tired', category: 'sad', url: 'https://media.giphy.com/media/l2JHVUriDGEtWOx0c/giphy.gif', className: 'col-span-5', keywords: 'tired sleepy exhausted mood' },
  { id: 'waiting', label: 'Waiting', category: 'sad', url: 'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif', className: 'col-span-5', keywords: 'waiting patient clock bored' },
  { id: 'angry', label: 'Angry', category: 'sad', url: 'https://media.giphy.com/media/11tTNkNy1SdXGg/giphy.gif', className: 'col-span-4', keywords: 'angry mad annoyed frustrated' },
  { id: 'typing', label: 'Typing', category: 'work', url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif', className: 'col-span-5', keywords: 'typing work laptop busy reply' },
  { id: 'on-it', label: 'On it', category: 'work', url: 'https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif', className: 'col-span-4', keywords: 'on it work busy coding computer' },
  { id: 'brb', label: 'BRB', category: 'work', url: 'https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif', className: 'col-span-4', keywords: 'brb be right back away' },
  { id: 'coffee', label: 'Coffee break', category: 'work', url: 'https://media.giphy.com/media/3oriO04qxVReM5rJEA/giphy.gif', className: 'col-span-4', keywords: 'coffee break work morning' },
  { id: 'meeting', label: 'Meeting', category: 'work', url: 'https://media.giphy.com/media/l0IylOPCNkiqOgMyA/giphy.gif', className: 'col-span-5', keywords: 'meeting work office busy' },
  { id: 'cute-cat', label: 'Cute cat', category: 'cute', url: 'https://media.giphy.com/media/vFKqnCdLPNOKc/giphy.gif', className: 'col-span-4', keywords: 'cute cat adorable pet' },
  { id: 'dog-smile', label: 'Dog smile', category: 'cute', url: 'https://media.giphy.com/media/3ndAvMC5LFPNMCzq7m/giphy.gif', className: 'col-span-4', keywords: 'cute dog smile pet happy' },
  { id: 'peek', label: 'Peek', category: 'cute', url: 'https://media.giphy.com/media/ASvQ3A2Q7blzq/giphy.gif', className: 'col-span-4', keywords: 'peek shy cute hello' },
  { id: 'hello', label: 'Hello', category: 'cute', url: 'https://media.giphy.com/media/28GHfhGFWpFgsQB4wR/giphy.gif', className: 'col-span-5', keywords: 'hello hi wave cute greeting' },
  { id: 'sleepy', label: 'Sleepy', category: 'cute', url: 'https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif', className: 'col-span-4', keywords: 'sleepy cute tired nap' },
  { id: 'sticker-ok', label: 'OK sticker', category: 'stickers', url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif', className: 'col-span-3', keywords: 'ok sticker thumbs up approve' },
  { id: 'sticker-lol', label: 'LOL sticker', category: 'stickers', url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif', className: 'col-span-4', keywords: 'lol sticker laugh funny' },
  { id: 'sticker-wow', label: 'Wow sticker', category: 'stickers', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', className: 'col-span-3', keywords: 'wow sticker surprised reaction' },
  { id: 'sticker-love', label: 'Love sticker', category: 'stickers', url: 'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif', className: 'col-span-4', keywords: 'love sticker hearts cute' },
  { id: 'sticker-thanks', label: 'Thanks sticker', category: 'stickers', url: 'https://media.giphy.com/media/3oEdva9BUHPIs2SkGk/giphy.gif', className: 'col-span-4', keywords: 'thanks sticker thank you' },
  { id: 'sticker-party', label: 'Party sticker', category: 'stickers', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', className: 'col-span-4', keywords: 'party sticker celebrate' },
].map(createChatListGifItem);

const SPECIFIC_EMOJI_SEARCH_TOKENS = {
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
  '❤️': 'heart love red',
  '💔': 'broken heart breakup sad',
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
  '🏳️‍🌈': 'rainbow pride flag',
  '🇮🇳': 'india indian flag',
  '🇺🇸': 'usa america flag',
  '🇬🇧': 'uk britain flag',
};

const EMOJI_SEARCH_TOKEN_OVERRIDES = Object.freeze({
  ...SPECIFIC_EMOJI_SEARCH_TOKENS,
  '❤️': 'heart love red romance classic',
  '🧡': 'heart love orange affection',
  '💛': 'heart love yellow affection',
  '💚': 'heart love green affection',
  '💙': 'heart love blue affection',
  '🩵': 'heart love light blue cyan affection',
  '🤎': 'heart love brown affection',
  '🖤': 'heart love black affection',
  '🩶': 'heart love gray grey affection',
  '🤍': 'heart love white affection',
  '💔': 'heart broken breakup sad',
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
  '🏳️‍🌈': 'rainbow flag pride lgbt',
  '🏳️‍⚧️': 'transgender flag pride trans',
  '🇮🇳': 'india indian flag tricolor',
  '🇺🇸': 'usa united states america flag',
  '🇬🇧': 'uk united kingdom britain england flag',
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
});

const COMMON_EMOJI_NAME_TOKENS = Object.freeze({
  '😀': 'grinning face',
  '😃': 'grinning face big eyes',
  '😄': 'grinning face smiling eyes',
  '😁': 'beaming face smiling eyes',
  '😊': 'smiling face smiling eyes blush',
  '😇': 'smiling face halo angel',
  '🙂': 'slightly smiling face',
  '😍': 'smiling face heart eyes',
  '🥳': 'partying face',
  '😆': 'grinning squinting face',
  '😅': 'grinning face sweat',
  '😂': 'face tears joy',
  '🤣': 'rolling floor laughing rofl',
  '😢': 'crying face tear',
  '😭': 'loudly crying face sobbing',
  '🥲': 'smiling face tear bittersweet',
  '🥹': 'face holding back tears emotional',
  '😠': 'angry face',
  '😡': 'pouting face rage',
  '❤️': 'red heart',
  '💔': 'broken heart',
  '🔥': 'fire flame',
  '🎉': 'party popper',
  '🎊': 'confetti ball',
  '🎈': 'balloon birthday',
  '🎁': 'wrapped gift present birthday',
  '🎆': 'fireworks',
  '🎇': 'sparkler',
  '👍': 'thumbs up approval like',
  '👎': 'thumbs down dislike',
  '👋': 'waving hand hello goodbye',
  '✋': 'raised hand high five stop',
  '👏': 'clapping hands applause',
  '🙌': 'raising hands celebration',
  '🙏': 'folded hands prayer thanks',
  '🫶': 'heart hands love',
  '👨‍💻': 'man technologist programmer developer coding profession',
  '👩‍💻': 'woman technologist programmer developer coding profession',
  '🧑‍💻': 'technologist programmer developer coding profession',
  '👨‍⚕️': 'man doctor health worker medical profession',
  '👩‍⚕️': 'woman doctor health worker medical profession',
  '🧑‍⚕️': 'doctor health worker medical profession',
  '👨‍🏫': 'man teacher educator school profession',
  '👩‍🏫': 'woman teacher educator school profession',
  '🧑‍🏫': 'teacher educator school profession',
  '👨‍🍳': 'man cook chef profession',
  '👩‍🍳': 'woman cook chef profession',
  '🧑‍🍳': 'cook chef profession',
  '👨‍🚀': 'man astronaut space profession',
  '👩‍🚀': 'woman astronaut space profession',
  '🧑‍🚀': 'astronaut space profession',
  '👨‍🎨': 'man artist painter profession',
  '👩‍🎨': 'woman artist painter profession',
  '🧑‍🎨': 'artist painter profession',
  '🐶': 'dog puppy pet',
  '🐱': 'cat kitten pet',
  '🌸': 'cherry blossom flower spring',
  '☀️': 'sun sunny weather',
  '🌙': 'moon night',
  '🍿': 'popcorn snack movie',
  '🧋': 'bubble tea drink boba',
  '🎲': 'dice game',
  '🎻': 'violin music instrument',
  '🏠': 'house home building',
  '🏢': 'office building workplace',
  '👕': 'shirt clothing clothes',
  '📎': 'paperclip office stationery',
  '⚠️': 'warning caution sign alert',
  '⭐': 'star symbol favorite',
  '❤️‍🔥': 'heart on fire love passion',
  '❤️‍🩹': 'mending heart healing love',
});

const SKIN_TONE_OPTIONS = Object.freeze([
  { modifier: '🏻', keywords: 'light skin tone' },
  { modifier: '🏼', keywords: 'medium light skin tone' },
  { modifier: '🏽', keywords: 'medium skin tone' },
  { modifier: '🏾', keywords: 'medium dark skin tone' },
  { modifier: '🏿', keywords: 'dark skin tone' },
]);

const SKIN_TONE_BASE_EMOJIS = new Set(`
👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🙏 💪
👂 👃 👶 👧 🧒 👦 👩 🧑 👨 👵 👴 🙋‍♀️ 🙋‍♂️ 🙋 🙇‍♀️ 🙇‍♂️ 🤦‍♀️ 🤦‍♂️ 🤷‍♀️ 🤷‍♂️
👨‍💻 👩‍💻 🧑‍💻 👨‍⚕️ 👩‍⚕️ 🧑‍⚕️ 👨‍🏫 👩‍🏫 🧑‍🏫 👨‍🍳 👩‍🍳 🧑‍🍳 👨‍🚀 👩‍🚀 🧑‍🚀 👨‍🎨 👩‍🎨 🧑‍🎨
`.trim().split(/\s+/));

const createSkinToneEmoji = (emoji, modifier) => {
  const firstCodepoint = Array.from(emoji)[0];
  return `${firstCodepoint}${modifier}${emoji.slice(firstCodepoint.length).replace(/^\uFE0F/u, '')}`;
};

const SKIN_TONE_EMOJI_METADATA = new Map(
  Array.from(SKIN_TONE_BASE_EMOJIS).flatMap((baseEmoji) =>
    SKIN_TONE_OPTIONS.map(({ modifier, keywords }) => [
      createSkinToneEmoji(baseEmoji, modifier),
      { baseEmoji, keywords },
    ])
  )
);

const COUNTRY_FLAG_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS
MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU
RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA
UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.trim().split(/\s+/);

const regionDisplayNames = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;
const COUNTRY_FLAG_KEYWORDS = new Map(COUNTRY_FLAG_CODES.map((code) => {
  const emoji = Array.from(code, (letter) => String.fromCodePoint(0x1F1E6 + letter.charCodeAt(0) - 65)).join('');
  return [emoji, `${code.toLowerCase()} ${regionDisplayNames?.of(code) || ''} country flag`];
}));

const EMOJI_SEARCH_TOKEN_GROUPS = [
  {
    emojis: '😀 😃 😄 😁 😊 😇 🙂 😍 🥳',
    keywords: 'happy smile smiling cheerful joyful',
  },
  {
    emojis: '😉 😌',
    keywords: 'smile smiling content wink',
  },
  {
    emojis: '😆 😅 😂 🤣 😹',
    keywords: 'laugh laughing funny lol haha joy',
  },
  {
    emojis: '😍 🥰 😘 😗 😙 😚 😻 😽',
    keywords: 'love loving kiss affection romance',
  },
  {
    emojis: '😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😿 💔',
    keywords: 'sad unhappy upset disappointed',
  },
  {
    emojis: '😢 😭 😿',
    keywords: 'cry crying tears tear sob sobbing weep weeping',
  },
  {
    emojis: '😤 😠 😡 🤬 😾',
    keywords: 'angry mad annoyed rage frustrated',
  },
  {
    emojis: '🤯 😳 😱 😯 😦 😧 😮 😲 🙀',
    keywords: 'surprised surprise shocked shock wow amazed',
  },
  {
    emojis: '😨 😰 😥 😓',
    keywords: 'afraid scared fear worried anxious nervous',
  },
  {
    emojis: '🤔 🤨 🧐 😕 🙄',
    keywords: 'thinking think curious confused question doubt',
  },
  {
    emojis: '🥱 😴 🤤 😪',
    keywords: 'sleep sleepy sleeping tired yawn rest',
  },
  {
    emojis: '🥴 🤢 🤮 🤧 😷 🤒 🤕',
    keywords: 'sick ill unwell medical mask',
  },
  {
    emojis: '🤗 🫶 👐 🤲',
    keywords: 'hug hugs embrace care support hands',
  },
  {
    emojis: '👋 🤚 🖐️ ✋ 🖖',
    keywords: 'hello hi hey wave waving hand greeting goodbye',
  },
  {
    emojis: '👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👍 👎',
    keywords: 'hand gesture okay yes no approve luck peace',
  },
  {
    emojis: '🥳 🎊 🎉 🎈 🎁 🎆 🎇',
    keywords: 'celebrate celebration party festive congratulations birthday',
  },
  {
    emojis: '👏 🙌',
    keywords: 'celebrate celebration clap applause hooray congratulations',
  },
  {
    emojis: '🙏',
    keywords: 'pray prayer please thanks thank you namaste',
  },
  {
    emojis: '🫶',
    keywords: 'heart love',
  },
  {
    emojis: '❤️ 🧡 💛 💚 💙 🩵 💜 🩷 🤎 🖤 🩶 🤍 ❣️ 💕 💞 💓 💗 💖 💘 💝',
    keywords: 'heart hearts love affection romance',
  },
  {
    emojis: '🏊 🏊‍♀️ 🏊‍♂️ 🤿 🤽 🤽‍♀️ 🤽‍♂️',
    keywords: 'swim swimming swimmer pool aquatic water sport',
  },
  {
    emojis: '🌊 💧 💦 🫧 🌧️ ☔ 🚰 🚿 🛁 🏊 🏊‍♀️ 🏊‍♂️ 🏄 🏄‍♀️ 🏄‍♂️ 🚣 🚣‍♀️ 🚣‍♂️ 🤽 🤽‍♀️ 🤽‍♂️ 🤿 🐬 🐳 🦈 🐠 🐟 🐙 🦑 🦀 🦞 🦐',
    keywords: 'water wave waves ocean sea splash wet aquatic',
  },
  {
    emojis: '🌧️ ☔ 💧 💦',
    keywords: 'rain rainy rainfall weather umbrella water',
  },
  {
    emojis: '👨‍👩‍👧 👨‍👩‍👧‍👦 👩‍👩‍👧 👩‍👩‍👧‍👦 👨‍👨‍👦 👨‍👨‍👦‍👦 👩‍👧 👨‍👧 👩‍👦 👨‍👦',
    keywords: 'family parent parents child children kids',
  },
  {
    emojis: '👩 👧 👵 🙋‍♀️ 🙇‍♀️ 🤦‍♀️ 🤷‍♀️ 👩‍💻 👩‍⚕️ 👩‍🏫 👩‍🍳 👩‍🚀 👩‍🎨',
    keywords: 'woman women female girl',
  },
  {
    emojis: '👨 👦 👴 🙋‍♂️ 🙇‍♂️ 🤦‍♂️ 🤷‍♂️ 👨‍💻 👨‍⚕️ 👨‍🏫 👨‍🍳 👨‍🚀 👨‍🎨',
    keywords: 'man men male boy',
  },
  {
    emojis: '👫 👭 👬 🧑‍🤝‍🧑 👩‍❤️‍👨 👩‍❤️‍👩 👨‍❤️‍👨 👩‍❤️‍💋‍👨 👩‍❤️‍💋‍👩 👨‍❤️‍💋‍👨',
    keywords: 'couple partners relationship romance love',
  },
  {
    emojis: '🐶 🐕 🐕‍🦺',
    keywords: 'dog puppy canine pet animal',
  },
  {
    emojis: '🐱 🐈 🐈‍⬛',
    keywords: 'cat kitten feline pet animal',
  },
  {
    emojis: '🌷 🌹 🌺 🌻 🌼 🪷 🌸 🪻',
    keywords: 'flower flowers floral bloom blossom plant',
  },
  {
    emojis: '☀️ 🌞 🌤️ 🌅',
    keywords: 'sun sunny sunshine weather',
  },
  {
    emojis: '🌙 🌚 🌛 🌜',
    keywords: 'moon night lunar',
  },
  {
    emojis: '❄️ ☃️ ⛄ 🌨️',
    keywords: 'snow snowy winter cold weather',
  },
  {
    emojis: '☀️ 🌞 🌤️ 🌅 🌧️ ☔ ⛈️ 🌦️ ☁️ ❄️ ☃️ ⛄ 🌨️ 🌪️ 🌫️ 🌈',
    keywords: 'weather nature forecast',
  },
  {
    emojis: '☕ 🍵 🧃 🥤 🍺 🍻 🍷 🍸 🍹 🧉 🥛 🧋 🥂 🍾 🥃',
    keywords: 'drink drinks beverage beverages',
  },
  {
    emojis: '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🛺 🚲 🛴 🚂 🚆 🚅 🚄 🚇 🚊 🚉 🚞 🚋 ✈️ 🛫 🛬 🚁 ⛵ 🚤 🛥️ 🛳️ 🚢',
    keywords: 'vehicle vehicles transport transportation',
  },
  {
    emojis: '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🏓 🏸 🏒 🏑 🥍 🏏 🥅 ⛳',
    keywords: 'sport sports athletic athletics',
  },
  {
    emojis: '🎲 🎮 🧩 ♟️ 🃏 🀄 🎰',
    keywords: 'game games gaming play',
  },
  {
    emojis: '🎹 🥁 🎷 🎺 🎸 🪘 🎻 🪕 🪈 🪇',
    keywords: 'music musical instrument instruments',
  },
  {
    emojis: '👕 👖 👗 👚 🧥 🥼 👔 👟 👠 👒 🧢 🎒 👜',
    keywords: 'clothes clothing outfit fashion wear',
  },
  {
    emojis: '📌 📎 ✂️ 📝 📅 📂 🗂️ 📚 📖 ✏️ 🖊️',
    keywords: 'office stationery work school',
  },
  {
    emojis: '📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🖲️ 📷 📸 📹 📺 📻 🔌 🔋 🪫',
    keywords: 'technology tech electronic electronics device devices',
  },
  {
    emojis: '🏠 🏡 🏢 🏫 🏥 🏦 🏨 🏪 🏬 🏭 🏛️ 🏚️ 🕌 ⛪ 🛕',
    keywords: 'building buildings place places',
  },
  {
    emojis: '💵 💴 💶 💷 💸 🪙 💰 💳 🏦',
    keywords: 'money cash currency finance payment',
  },
  {
    emojis: '⚠️ 🚫 ⛔ 🚸 ☢️ ☣️ ❗',
    keywords: 'warning caution danger alert sign',
  },
  {
    emojis: '⬅️ ➡️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↩️ ↪️',
    keywords: 'arrow arrows direction',
  },
  {
    emojis: '0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 #️⃣ *️⃣',
    keywords: 'number numbers digit digits',
  },
  {
    emojis: '♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓',
    keywords: 'zodiac horoscope astrology star sign',
  },
];

const GROUPED_EMOJI_SEARCH_TOKENS = Object.freeze(
  EMOJI_SEARCH_TOKEN_GROUPS.reduce((tokensByEmoji, group) => {
    String(group.emojis || '').trim().split(/\s+/).filter(Boolean).forEach((emoji) => {
      tokensByEmoji[emoji] = `${tokensByEmoji[emoji] || ''} ${group.keywords}`.trim();
    });
    return tokensByEmoji;
  }, {})
);

const tokenizeSearchText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

const buildEmojiSearchKeywords = (category, emoji) => {
  const skinToneMetadata = SKIN_TONE_EMOJI_METADATA.get(emoji);
  const searchableEmoji = skinToneMetadata?.baseEmoji || emoji;
  const categoryKeywords = Array.from(new Set([
    category.id,
    ...tokenizeSearchText(category.label),
  ]));
  const emojiKeywords = Array.from(new Set([
    ...tokenizeSearchText(GROUPED_EMOJI_SEARCH_TOKENS[searchableEmoji] || ''),
    ...tokenizeSearchText(EMOJI_SEARCH_TOKEN_OVERRIDES[searchableEmoji] || ''),
    ...tokenizeSearchText(COMMON_EMOJI_NAME_TOKENS[searchableEmoji] || ''),
    ...tokenizeSearchText(skinToneMetadata?.keywords || ''),
    ...tokenizeSearchText(COUNTRY_FLAG_KEYWORDS.get(emoji) || ''),
  ]));

  return {
    categoryKeywords,
    emojiKeywords,
    keywords: Array.from(new Set([...categoryKeywords, ...emojiKeywords])),
  };
};

const getEmojiSearchMatchScore = (item, searchTerms) => {
  if (!searchTerms.length) {
    return 0;
  }

  return searchTerms.reduce((score, term) => {
    const bestEmojiKeywordScore = item.emojiKeywords.reduce((bestScore, keyword) => {
      if (keyword === term) return Math.max(bestScore, 12);
      if (keyword.startsWith(term)) return Math.max(bestScore, 8);
      return bestScore;
    }, 0);
    const bestCategoryKeywordScore = item.categoryKeywords.reduce((bestScore, keyword) => {
      if (keyword === term) return Math.max(bestScore, 5);
      return bestScore;
    }, 0);
    const bestKeywordScore = Math.max(bestEmojiKeywordScore, bestCategoryKeywordScore);

    if (!bestKeywordScore) {
      return -1;
    }

    if (score < 0) {
      return score;
    }

    return score + bestKeywordScore;
  }, 0);
};

const isFlagEmoji = (emoji = '') =>
  REGIONAL_INDICATOR_FLAG_PATTERN.test(String(emoji || '')) || SPECIAL_FLAG_EMOJIS.has(String(emoji || ''));

const getEmojiAssetCodepoints = (emoji = '') =>
  Array.from(String(emoji || ''))
    .map((character) => character.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join('-')
    .replace(/^1f3f3-fe0f$/, '1f3f3');

const FlagEmojiImage = ({ emoji, className = 'h-6 w-6' }) => {
  const emojiCodepoints = getEmojiAssetCodepoints(emoji);
  if (!emojiCodepoints) {
    return <span aria-hidden="true" className={EMOJI_GLYPH_CLASSNAME}>{emoji}</span>;
  }

  return (
    <img
      src={`${TWEMOJI_CDN_BASE_URL}/${emojiCodepoints}.svg`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable="false"
      className={className}
    />
  );
};

// An emoji this device's font cannot draw (an empty box on an older system) is drawn with
// Twemoji artwork instead, so the list is complete on every machine (BUG_USR_557). If the
// artwork cannot be fetched either, the plain glyph is shown as before.
const NativelyUnsupportedEmoji = ({ emoji, className }) => {
  const [hasArtworkFailed, setHasArtworkFailed] = useState(false);
  const assetName = getTwemojiAssetName(emoji);

  if (hasArtworkFailed || !assetName) {
    return <span aria-hidden="true" className={`${EMOJI_GLYPH_CLASSNAME} ${className}`}>{emoji}</span>;
  }

  return (
    <span aria-hidden="true" className={`${EMOJI_GLYPH_CLASSNAME} ${className} inline-flex items-center justify-center`}>
      <img
        src={`${TWEMOJI_CDN_BASE_URL}/${assetName}.svg`}
        alt=""
        decoding="async"
        draggable="false"
        className="h-[1.1em] w-[1.1em]"
        onError={() => setHasArtworkFailed(true)}
      />
    </span>
  );
};

export const EmojiGlyph = ({ emoji, className = 'text-[23px]', flagClassName = 'h-6 w-6' }) => {
  if (isFlagEmoji(emoji)) {
    return <FlagEmojiImage emoji={emoji} className={flagClassName} />;
  }

  if (!isEmojiRenderable(emoji)) {
    return <NativelyUnsupportedEmoji emoji={emoji} className={className} />;
  }

  return <span aria-hidden="true" className={`${EMOJI_GLYPH_CLASSNAME} ${className}`}>{emoji}</span>;
};

const EMOJI_CATEGORY_DEFINITIONS = [
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '😀',
    searchText: 'smileys faces happy sad laugh cry love angry shocked sleepy sick hearts',
    emojis: `
😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 🥲 🥹
😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔
🫣 🤭 🫢 🤫 🤥 😶 🫠 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕
🤑 🤠 👻 👽 🤖 💩 😺 😸 😹 😻 😼 😽 🙀 😿 😾
    `,
  },
  {
    id: 'people',
    label: 'People',
    icon: '🫶',
    searchText: 'people hands body family gesture wave thumbs celebrate dance work',
    emojis: `
👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🙏
✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 🦻 👃 🧠 🫀 🫁 👀 👁️ 👅 👄 👶 👧 🧒 👦 👩 🧑 👨 👩‍🦱 👨‍🦱 👩‍🦰 👨‍🦰
👱‍♀️ 👱‍♂️ 🧔 👵 👴 🙍‍♀️ 🙍‍♂️ 🙎‍♀️ 🙎‍♂️ 🙅‍♀️ 🙅‍♂️ 🙆‍♀️ 🙆‍♂️ 💁‍♀️ 💁‍♂️ 🙋 🙋‍♀️ 🙋‍♂️ 🧏‍♀️ 🧏‍♂️
🙇‍♀️ 🙇‍♂️ 🤦‍♀️ 🤦‍♂️ 🤷‍♀️ 🤷‍♂️ 👮‍♀️ 👮‍♂️ 👷‍♀️ 👷‍♂️ 🧑‍⚕️ 👨‍🍳 👩‍💻 🧑‍🎓 💃 🕺 🧍‍♀️ 🧍‍♂️
🚶‍♀️ 🚶‍♂️ 🏃‍♀️ 🏃‍♂️ 🧎‍♀️ 🧎‍♂️ 🧘‍♀️ 🧘‍♂️ 🛌
👨‍💻 🧑‍💻 👨‍⚕️ 👩‍⚕️ 👨‍🏫 👩‍🏫 🧑‍🏫 👩‍🍳 🧑‍🍳 👨‍🚀 👩‍🚀 🧑‍🚀 👨‍🎨 👩‍🎨 🧑‍🎨
👨‍👩‍👧 👨‍👩‍👧‍👦 👩‍👩‍👧 👩‍👩‍👧‍👦 👨‍👨‍👦 👨‍👨‍👦‍👦 👩‍👧 👨‍👧 👩‍👦 👨‍👦
👫 👭 👬 🧑‍🤝‍🧑 👩‍❤️‍👨 👩‍❤️‍👩 👨‍❤️‍👨 👩‍❤️‍💋‍👨 👩‍❤️‍💋‍👩 👨‍❤️‍💋‍👨
    `,
  },
  {
    id: 'animals',
    label: 'Animals',
    icon: '🐻',
    searchText: 'animals nature pet wild bird ocean flower tree plant bug garden',
    emojis: `
🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🐣 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄
🐝 🪲 🐞 🦋 🐌 🐛 🐢 🐍 🦎 🦂 🦀 🦞 🐙 🦑 🦐 🐠 🐟 🐬 🐳 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🐫 🦒
🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🐐 🦌 🐕 🐈 🐓 🦃 🦚 🦜 🦢 🕊️ 🐇 🦔 🌲 🌳 🌴 🌵 🌷 🌹 🌺 🌻 🌼 🪷 🍀 🌿 ☘️
🍁 🍂 🍃 🍄 🌊 💧 💦 🌧️ ☔ 🐕‍🦺 🐈‍⬛ 🌸 🪻 ☀️ 🌞 🌤️ 🌙 🌚 🌛 🌜 🌈 ⛈️ 🌦️ ☁️ ❄️ ☃️ ⛄ 🌨️ 🌪️ 🌫️
    `,
  },
  {
    id: 'food',
    label: 'Food',
    icon: '🍔',
    searchText: 'food drink fruit meal dessert snack breakfast lunch dinner cafe',
    emojis: `
🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🫘 🌰
🥐 🍞 🥖 🫓 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆 🥗 🥘 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚
🍘 🍥 🥠 🍢 🍡 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍮 🍯 🍼 ☕ 🍵 🧃 🥤 🍺 🍻 🍷 🍸 🍹 🧉 🍿 🥛 🧋 🧊 🥂 🍾 🥃 🍽️
    `,
  },
  {
    id: 'travel',
    label: 'Travel',
    icon: '🚗',
    searchText: 'travel car train plane city holiday road transport places vacation',
    emojis: `
🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🛺 🚲 🛴 🚏 ⛽ 🚨 🚥 🚦 🛞 ✈️ 🛫 🛬 🪂 🚁 🚟 🚠 🚡 🚂 🚆
🚅 🚄 🚇 🚊 🚉 🚞 🚋 ⛵ 🚤 🛥️ 🛳️ 🚢 ⚓ 🗺️ 🧭 🏖️ 🏝️ 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 🌋 ⛲ 🏜️ 🌁 🌃 🏙️ 🌄 🌅 🌆
🌇 🌉 🛣️ 🛤️ 🏠 🏡 🏢 🏫 🏥 🏦 🏨 🏪 🏬 🏭 🏛️ 🏚️ 🕌 ⛪ 🛕
    `,
  },
  {
    id: 'activities',
    label: 'Activities',
    icon: '⚽',
    searchText: 'activities sports party game music hobby art awards celebration',
    emojis: `
⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂
🏋️‍♀️ 🏋️‍♂️ 🤸‍♀️ 🤸‍♂️ ⛹️‍♀️ ⛹️‍♂️ 🤾‍♀️ 🤾‍♂️ 🏌️‍♀️ 🏌️‍♂️ 🧘‍♀️ 🧘‍♂️ 🏄 🏄‍♀️ 🏄‍♂️ 🚣 🚣‍♀️ 🚣‍♂️ 🏊 🏊‍♀️ 🏊‍♂️
🤽 🤽‍♀️ 🤽‍♂️ 🚴‍♀️ 🚴‍♂️ 🏆 🥇 🥈 🥉 🏅 🎖️ 🎯 🎳 🎮 🧩 ♟️ 🎨 🎭 🎤 🎧 🎹 🥁 🎷 🎺 🎸 🪘 🎬 🎪 🎟️ 🎫
🎊 🎉 🎈 🎁 🎆 🎇 🎲 🃏 🀄 🎰 🎻 🪕 🪈 🪇
    `,
  },
  {
    id: 'objects',
    label: 'Objects',
    icon: '💡',
    searchText: 'objects tools tech office phone computer light home money repair media',
    emojis: `
⌚ 📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🖲️ 💽 💾 💿 📀 🎥 🎞️ 📷 📸 📹 📼 🔍 🔎 💡 🔦 🏮 🕯️ 🔌 🔋 🪫 📞 ☎️ 📟 📠 📺 📻
🎙️ 🎚️ 🎛️ ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 📡 🔭 🔬 💊 💉 🩹 🩺 🩻 🚪 🪑 🛏️ 🛋️ 🚽 🚰 🚿 🛁 🧴 🧷 🧹 🧺 🧻 🪣 🧼 🫧
🪥 🧽 🧯 🛒 🚬 ⚰️ 🪦 ⚱️ 🗿 🪪 💸 💵 💴 💶 💷 🪙 💰 💎 ⚖️ 🪜 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🪚 🪛 🔩 ⚙️ 🧱 ⛓️
🧲 🔫 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️ 📿 🔒 🔓 🗝️ 👕 👖 👗 👚 🧥 🥼 👔 👟 👠 👒 🧢 🎒 👜
📌 📎 ✂️ 📝 📅 📂 🗂️ 📚 📖 ✏️ 🖊️ 💳
    `,
  },
  {
    id: 'symbols',
    label: 'Symbols',
    icon: '🔣',
    searchText: 'symbols hearts arrows check marks alerts zodiac signs music religion',
    emojis: `
❤️ 🧡 💛 💚 💙 🩵 💜 🩷 🤎 🖤 🩶 🤍 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 🔥 ✨ ⭐ 🌟 ⚠️ 🚫 ⛔ 🚸 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐
♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ⚛️ ☢️ ☣️ 💤 ♨️ ♻️ ⚜️ 🔱 📛 🔰 ⭕ ✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ➗ ✖️ ♾️
‼️ ⁉️ ❗ ❕ ❓ ❔ 💯 🔔 🔕 🎵 🎶 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↩️ ↪️ ⤴️ ⤵️ 🔀 🔁 🔂 🔄 ◀️ ▶️
⏪ ⏩ ⏭️ ⏮️ ⏹️ ⏺️ ™️ ©️ ®️ 〰️ ➰ ➿ 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 #️⃣ *️⃣
    `,
  },
  {
    id: 'flags',
    label: 'Flags',
    icon: '🏁',
    searchText: 'flags countries world pride finish travel national',
    emojis: `
🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🇮🇳 🇺🇸 🇬🇧 🇨🇦 🇦🇺 🇳🇿 🇿🇦 🇸🇬 🇯🇵 🇰🇷 🇨🇳 🇫🇷 🇩🇪 🇪🇸 🇮🇹 🇳🇱 🇧🇷 🇦🇷 🇲🇽
🇸🇦 🇦🇪 🇹🇷 🇪🇬 🇳🇬 🇰🇪 🇵🇰 🇧🇩 🇳🇵 🇱🇰 🇮🇩 🇲🇾 🇹🇭 🇻🇳 🇵🇭
    `,
  },
];

const EMOJI_CATEGORIES = EMOJI_CATEGORY_DEFINITIONS.map((category, categoryIndex) => {
  const baseEmojis = category.emojis.trim().split(/\s+/);
  const categoryEmojis = Array.from(new Set([
    ...baseEmojis,
    ...(category.id === 'people'
      ? Array.from(SKIN_TONE_EMOJI_METADATA.entries())
          .filter(([, metadata]) => baseEmojis.includes(metadata.baseEmoji))
          .map(([emoji]) => emoji)
      : []),
    ...(category.id === 'flags' ? Array.from(COUNTRY_FLAG_KEYWORDS.keys()) : []),
  ]));

  return {
    ...category,
    categoryIndex,
    items: categoryEmojis.map((emoji, itemIndex) => {
      const searchMetadata = buildEmojiSearchKeywords(category, emoji);
      return {
        emoji,
        categoryId: category.id,
        categoryIndex,
        itemIndex,
        ...searchMetadata,
        searchText: searchMetadata.keywords.join(' '),
      };
    }),
  };
});

const EMOJI_CATEGORY_MAP = Object.fromEntries(
  EMOJI_CATEGORIES.map((category) => [category.id, category])
);

const EMOJI_CATEGORY_BUTTONS = [
  { id: 'recent', label: 'Recent', icon: '🕘' },
  ...EMOJI_CATEGORIES.map(({ id, label, icon }) => ({ id, label, icon })),
];

const CHAT_LIST_CATEGORY_BUTTONS = [
  { id: 'recent', label: 'Recent', Icon: RecentCategoryIcon },
  { id: 'smileys', label: 'Smileys', Icon: SmileyCategoryIcon },
  { id: 'animals', label: 'Animals', Icon: NatureCategoryIcon },
  { id: 'travel', label: 'Travel', Icon: CarCategoryIcon },
  { id: 'symbols', label: 'Symbols', Icon: SymbolsCategoryIcon },
  { id: 'activities', label: 'Activities', Icon: BallCategoryIcon },
  { id: 'flags', label: 'Flags', Icon: FlagCategoryIcon },
];

const ALL_EMOJI_ITEMS = Array.from(new Map(
  EMOJI_CATEGORIES.flatMap((category) => category.items).map((item) => [item.emoji, item])
).values());
const EMOJI_ITEM_LOOKUP = new Map(ALL_EMOJI_ITEMS.map((item) => [item.emoji, item]));
// On a device whose emoji font is missing some of these, find out which in the background
// (nothing happens on a device that has them all).
warmUpEmojiSupport(ALL_EMOJI_ITEMS.map((item) => item.emoji));

const readRecentEmojis = () => {
  if (typeof window === 'undefined') return [];
  try {
    const storedValue = JSON.parse(window.localStorage.getItem(RECENT_EMOJIS_STORAGE_KEY) || '[]');
    return Array.isArray(storedValue) ? storedValue.filter((value) => typeof value === 'string' && value.trim()) : [];
  } catch (error) {
    console.error('Unable to read recent emojis:', error);
    return [];
  }
};

const persistRecentEmojis = (recentEmojis) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify(recentEmojis));
  } catch (error) {
    console.error('Unable to persist recent emojis:', error);
  }
};

const getInitialCategoryId = (chromeVariant = 'default') => (
  chromeVariant === 'chat-list'
    ? 'recent'
    : (readRecentEmojis().length ? 'recent' : 'objects')
);

const getSearchTerms = (value) => value.trim().toLowerCase().split(/\s+/).filter(Boolean);

const matchesSearchTerms = (searchText, searchTerms) => (
  !searchTerms.length || searchTerms.every((term) => searchText.includes(term))
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7"></circle>
    <path d="m20 20-3.5-3.5"></path>
  </svg>
);

const StrokeIcon = ({ className = 'h-5 w-5', children }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

function SmileyCategoryIcon({ className = 'h-5 w-5' }) {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="8.1" />
      <path d="M8.7 14.2c.95 1.15 2.12 1.72 3.3 1.72 1.18 0 2.35-.57 3.3-1.72" />
      <circle cx="9.25" cy="10.1" r=".7" fill="currentColor" stroke="none" />
      <circle cx="14.75" cy="10.1" r=".7" fill="currentColor" stroke="none" />
    </StrokeIcon>
  );
}

function RecentCategoryIcon({ className = 'h-5 w-5' }) {
  return (
    <StrokeIcon className={className}>
      <path d="M3.8 10.8A8.3 8.3 0 1 0 7 5.1" />
      <path d="M3.6 4.85v5.05h5.05" />
      <path d="M12 7.9v4.55l3.1 1.85" />
    </StrokeIcon>
  );
}

function NatureCategoryIcon({ className = 'h-5 w-5' }) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 11.45c0-2.7 1.6-5 3.9-5 1.75 0 2.85 1.45 2.85 3.05 0 2.55-2.55 4.25-5.95 4.7" />
      <path d="M12 11.45c0-2.7-1.6-5-3.9-5-1.75 0-2.85 1.45-2.85 3.05 0 2.55 2.55 4.25 5.95 4.7" />
      <path d="M12 12.55c0 2.7 1.6 5 3.9 5 1.75 0 2.85-1.45 2.85-3.05 0-2.55-2.55-4.25-5.95-4.7" />
      <path d="M12 12.55c0 2.7-1.6 5-3.9 5-1.75 0-2.85-1.45-2.85-3.05 0-2.55 2.55-4.25 5.95-4.7" />
    </StrokeIcon>
  );
}

function CarCategoryIcon({ className = 'h-5 w-5' }) {
  return (
    <StrokeIcon className={className}>
      <path d="M5.2 13.65h13.6l-1.3-4.1a2 2 0 0 0-1.9-1.45H8.4a2 2 0 0 0-1.9 1.45l-1.3 4.1Z" />
      <path d="M5 13.65v2.25a1.1 1.1 0 0 0 1.1 1.1h.7" />
      <path d="M19 13.65v2.25a1.1 1.1 0 0 1-1.1 1.1h-.7" />
      <circle cx="8.2" cy="16.35" r="1.15" />
      <circle cx="15.8" cy="16.35" r="1.15" />
    </StrokeIcon>
  );
}

function SymbolsCategoryIcon({ className = 'h-5 w-5' }) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 4.8v2.9" />
      <path d="M12 16.3v2.9" />
      <path d="M4.8 12h2.9" />
      <path d="M16.3 12h2.9" />
      <path d="m7 7 2 2-2 2-2-2 2-2Z" />
      <path d="m15 14 2 2-2 2-2-2 2-2Z" />
      <path d="m15.5 5.25.7 1.45 1.45.7-1.45.7-.7 1.45-.7-1.45-1.45-.7 1.45-.7.7-1.45Z" />
      <path d="m7 15 2 2" />
      <path d="m9 15-2 2" />
    </StrokeIcon>
  );
}

function BallCategoryIcon({ className = 'h-5 w-5' }) {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="8.1" />
      <path d="M9.05 4.55c1.95 1.55 3.1 4.15 3.1 7.45 0 3.3-1.15 5.9-3.1 7.45" />
      <path d="M14.95 4.55c-1.95 1.55-3.1 4.15-3.1 7.45 0 3.3 1.15 5.9 3.1 7.45" />
    </StrokeIcon>
  );
}

function FlagCategoryIcon({ className = 'h-5 w-5' }) {
  return (
    <StrokeIcon className={className}>
      <path d="M6.3 20V4.3" />
      <path d="M6.3 5.1h10.25l-1.85 3.1 1.85 3.1H6.3" />
    </StrokeIcon>
  );
}

const ChatListTabSwitcher = ({ activeTab, onTabChange, compact = false, showGifTab = true }) => (
  <div className="flex justify-center">
    <div className={`${showGifTab ? 'grid grid-cols-2' : 'flex'} overflow-hidden rounded-full border border-[#D8E0EB] bg-white ${
      compact
        ? 'h-[60px] w-[220px]'
        : 'h-[40px] w-[152px] sm:h-[44px] sm:w-[166px]'
    }`}>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'emoji'}
        aria-label="Emoji"
        onClick={() => onTabChange('emoji')}
        className={`flex h-full w-full items-center justify-center transition-colors ${showGifTab ? 'border-r border-[#D8E0EB]' : ''} ${activeTab === 'emoji' ? 'bg-[#E3EAF2] text-[#66748D]' : 'bg-white text-[#718099] hover:bg-[#F8FAFC]'}`}
      >
        <SmileyCategoryIcon className={compact ? 'h-[30px] w-[30px]' : 'h-[22px] w-[22px]'} />
      </button>
      {showGifTab ? (
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'gif'}
          aria-label="GIF"
          onClick={() => onTabChange('gif')}
          className={`flex h-full items-center justify-center transition-colors ${activeTab === 'gif' ? 'bg-[#E3EAF2] text-[#66748D]' : 'bg-white text-[#718099] hover:bg-[#F8FAFC]'}`}
        >
          <span className={`inline-flex items-center justify-center rounded-[10px] border font-semibold tracking-[0.02em] ${compact ? 'h-[34px] min-w-[54px] px-3 text-[13px]' : 'h-[24px] min-w-[33px] px-[6px] text-[10px]'} ${activeTab === 'gif' ? 'border-[#AEB9C9] bg-white text-[#66748D]' : 'border-[#AEB9C9] text-[#718099]'}`}>
            GIF
          </span>
        </button>
      ) : null}
    </div>
  </div>
);

const ChatListCategoryRail = ({ activeCategoryId, onCategoryChange, compact = false }) => (
  <div className="flex justify-center">
    <div className={`grid grid-cols-7 overflow-hidden rounded-full border border-[#D8E0EB] bg-white ${
      compact ? 'h-[60px] w-[420px] max-w-[calc(100%-48px)]' : 'h-[42px] w-full max-w-full sm:h-[38px] sm:w-[352px] sm:max-w-[352px]'
    }`}>
      {CHAT_LIST_CATEGORY_BUTTONS.map(({ id, label, Icon: CategoryIcon }) => {
        const isActive = activeCategoryId === id;
        return (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => onCategoryChange(id)}
            className={`flex h-full items-center justify-center border-r border-[#D8E0EB] text-[#718099] transition-colors last:border-r-0 ${isActive ? 'bg-[#E3EAF2] text-[#66748D]' : 'bg-white hover:bg-[#F8FAFC]'}`}
          >
            {React.createElement(CategoryIcon, { className: compact ? 'h-[28px] w-[28px]' : 'h-5 w-5 sm:h-5 sm:w-5' })}
          </button>
        );
      })}
    </div>
  </div>
);

const ChatListChromeHeader = ({ activeTab, onTabChange, activeCategoryId, onCategoryChange, compact = false, showGifTab = true }) => (
  <div className={`mx-auto flex w-full flex-col items-center ${compact ? 'py-3' : 'py-2 sm:py-[14px]'}`}>
    <div className={`mx-auto flex w-full items-center ${activeTab === 'emoji' ? (compact ? 'flex-col gap-5' : 'flex-col gap-3 sm:gap-[21px]') : 'justify-center'}`}>
      <ChatListTabSwitcher activeTab={activeTab} onTabChange={onTabChange} compact={compact} showGifTab={showGifTab} />
      {activeTab === 'emoji' ? (
        <ChatListCategoryRail activeCategoryId={activeCategoryId} onCategoryChange={onCategoryChange} compact={compact} />
      ) : null}
    </div>
  </div>
);

const ChatListGifPanel = ({
  searchInputId,
  searchInputRef,
  searchValue,
  onSearchValueChange,
  visibleItems,
  categories,
  activeCategoryId,
  onCategoryChange,
  onGifSelect,
}) => (
  <div className="flex min-h-0 flex-1 flex-col gap-[14px] px-[14px]">
    <div>
      <label htmlFor={`${searchInputId}-gif`} className="sr-only">Search GIF</label>
      <div className="flex h-[56px] items-center gap-3 rounded-full border border-[#D8E0EB] bg-[#F8FAFC] px-4">
        <SearchIcon />
        <input
          ref={searchInputRef}
          id={`${searchInputId}-gif`}
          type="text"
          value={searchValue}
          onChange={(event) => onSearchValueChange(event.target.value)}
          placeholder="Search GIF"
          className="w-full bg-transparent text-[16px] leading-6 text-[#0F172A] outline-none placeholder:text-[#53647D]"
        />
      </div>
    </div>

    <div className="chatterly-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {categories.map((category) => {
        const isActive = activeCategoryId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onCategoryChange(category.id)}
            className={`flex h-8 flex-shrink-0 items-center justify-center rounded-full border px-3 text-[12px] font-semibold transition-colors ${
              isActive
                ? 'border-[#A855F7] bg-[#F3E8FF] text-[#7C3AED]'
                : 'border-[#D8E0EB] bg-white text-[#64748B] hover:border-[#C4B5FD] hover:text-[#7C3AED]'
            }`}
            aria-pressed={isActive}
          >
            {category.label}
          </button>
        );
      })}
    </div>

    <div className="min-h-0 flex-1 overflow-hidden">
      <div className="chatterly-scrollbar grid h-full grid-cols-[repeat(13,minmax(0,1fr))] auto-rows-[82px] gap-[8px] overflow-y-auto overscroll-contain">
        {visibleItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onGifSelect?.(item)}
            className={`${item.className} relative overflow-hidden rounded-[4px] bg-[#E2E8F0] focus:outline-none focus:ring-2 focus:ring-[#168CFF]`}
            aria-label={item.alt}
          >
            <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] font-semibold leading-4 text-[#64748B]">
              {item.label}
            </span>
            <img
              src={item.animatedUrl || item.imageUrl}
              alt=""
              className="relative h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          </button>
        ))}
      </div>
      {visibleItems.length === 0 ? (
        <div className="mt-3 rounded-[20px] border border-dashed border-[#D8E0EB] bg-[#F8FAFC] px-4 py-6 text-center text-[13px] text-[#64748B]">
          No GIFs matched that search yet.
        </div>
      ) : null}
    </div>
  </div>
);

function OpenEmojiPicker({ pickerRef, anchorRef, onEmojiSelect, onGifSelect, onClose, chromeVariant = 'default', placement = 'floating', maximizeScrollSpace = false, showGifTab = true, autoFocusSearch = true, initialCategoryId = '' }) {
  const isChatListChrome = chromeVariant === 'chat-list';
  const isProfileChrome = chromeVariant === 'profile';
  const usesIconChrome = isChatListChrome || isProfileChrome;
  const isInlineBelow = placement === 'inline-below';
  const useMaximizedEmojiGrid = maximizeScrollSpace && isInlineBelow;
  const isFloatingBelow = placement === 'floating-below';
  const isProfileSide = placement === 'profile-side';
  const isAnchoredIconFloating = usesIconChrome && !isInlineBelow && Boolean(anchorRef);
  const searchInputId = useId();
  const searchInputRef = useRef(null);
  const emojiScrollContainerRef = useRef(null);
  const [activeTab, setActiveTab] = useState('emoji');
  const [searchValue, setSearchValue] = useState('');
  const [recentEmojis, setRecentEmojis] = useState(() => readRecentEmojis());
  // A caller can open on a specific category — the reaction pickers open on
  // Smileys so the emojis show straight away instead of an empty Recent tab.
  const [activeCategoryId, setActiveCategoryId] = useState(() => (
    initialCategoryId === 'recent' || EMOJI_CATEGORY_MAP[initialCategoryId]
      ? initialCategoryId
      : getInitialCategoryId(chromeVariant)
  ));
  const [activeGifCategoryId, setActiveGifCategoryId] = useState('all');
  const [floatingPositionStyle, setFloatingPositionStyle] = useState(null);

  useEffect(() => {
    if (!autoFocusSearch) return undefined;

    const focusSearchInput = () => {
      searchInputRef.current?.focus();
    };

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(focusSearchInput);
      return undefined;
    }

    focusSearchInput();
    return undefined;
  }, [activeTab, autoFocusSearch]);

  const normalizedSearchValue = searchValue.trim().toLowerCase();
  const searchTerms = getSearchTerms(searchValue);
  const recentEmojiItems = recentEmojis
    .map((emoji, recentIndex) => {
      const normalizedEmoji = String(emoji || '').trim();
      if (!normalizedEmoji) {
        return null;
      }

      const storedEmojiItem = EMOJI_ITEM_LOOKUP.get(normalizedEmoji);
      return {
        ...(storedEmojiItem || {
          categoryId: 'recent',
          categoryIndex: -1,
          itemIndex: recentIndex,
          keywords: [],
          searchText: '',
        }),
        emoji: normalizedEmoji,
        isRecentItem: true,
        recentIndex,
      };
    })
    .filter(Boolean);
  const emptyRecentFallbackCategoryId = usesIconChrome ? 'smileys' : 'objects';
  const fallbackCategory = EMOJI_CATEGORY_MAP[emptyRecentFallbackCategoryId];
  const activeCategory = EMOJI_CATEGORY_MAP[activeCategoryId] || EMOJI_CATEGORY_MAP.objects;
  const filteredEmojiItems = searchTerms.length
    ? ALL_EMOJI_ITEMS
        .map((item) => ({
          item,
          score: getEmojiSearchMatchScore(item, searchTerms),
        }))
        .filter(({ score }) => score > 0)
        .sort((firstResult, secondResult) =>
          secondResult.score - firstResult.score ||
          firstResult.item.categoryIndex - secondResult.item.categoryIndex ||
          firstResult.item.itemIndex - secondResult.item.itemIndex
        )
        .map(({ item }) => item)
    : [];
  const activeCategoryItems = activeCategoryId === 'recent' ? recentEmojiItems : activeCategory.items;
  const recentSectionItems = !usesIconChrome && !searchTerms.length && activeCategoryId !== 'recent'
    ? recentEmojiItems.slice(0, usesIconChrome ? 16 : 12)
    : [];
  const visibleEmojiItems = searchTerms.length
    ? filteredEmojiItems
    : (useMaximizedEmojiGrid ? ALL_EMOJI_ITEMS : activeCategoryItems);
  const showEmptyRecentState = !useMaximizedEmojiGrid && !searchTerms.length && activeCategoryId === 'recent' && recentEmojiItems.length === 0;
  const suggestedEmojiItems = showEmptyRecentState
    ? fallbackCategory.items.slice(0, usesIconChrome ? 24 : 18)
    : [];

  useEffect(() => {
    emojiScrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeCategoryId, activeTab, normalizedSearchValue]);

  useLayoutEffect(() => {
    if (!isAnchoredIconFloating || !anchorRef?.current || typeof window === 'undefined') {
      setFloatingPositionStyle(null);
      return undefined;
    }

    const updateFloatingPosition = () => {
      const pickerElement = pickerRef?.current;
      const anchorElement = anchorRef?.current;

      if (!(anchorElement instanceof HTMLElement)) {
        setFloatingPositionStyle(null);
        return;
      }

      const anchorRect = anchorElement.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 8;
      const spaceBelow = window.innerHeight - anchorRect.bottom - gap - viewportPadding;
      const spaceAbove = anchorRect.top - gap - viewportPadding;
      const shouldFlipAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
      const availableHeight = Math.max(220, Math.floor(shouldFlipAbove ? spaceAbove : spaceBelow));

      if (isProfileChrome) {
        const preferredPopupHeight = 500;
        const minimumUsefulPopupHeight = 360;
        const viewportAvailableHeight = Math.max(220, window.innerHeight - (viewportPadding * 2));
        const popupWidth = Math.min(520, Math.max(320, window.innerWidth - (viewportPadding * 2)));

        if (isProfileSide) {
          const sideGap = 12;
          const spaceToRight = window.innerWidth - anchorRect.right - sideGap - viewportPadding;
          const spaceToLeft = anchorRect.left - sideGap - viewportPadding;
          const canFitRight = spaceToRight >= popupWidth;
          const canFitLeft = spaceToLeft >= popupWidth;
          const popupHeight = Math.min(preferredPopupHeight, viewportAvailableHeight);
          const top = Math.min(
            Math.max(viewportPadding, anchorRect.top),
            Math.max(viewportPadding, window.innerHeight - popupHeight - viewportPadding)
          );

          if (canFitRight || canFitLeft) {
            setFloatingPositionStyle({
              position: 'fixed',
              width: `${popupWidth}px`,
              maxHeight: `${popupHeight}px`,
              left: `${canFitRight ? anchorRect.right + sideGap : anchorRect.left - sideGap - popupWidth}px`,
              right: 'auto',
              top: `${top}px`,
              bottom: 'auto',
            });
            return;
          }

          const placeBelow = spaceBelow >= spaceAbove;
          const fallbackHeight = Math.min(
            preferredPopupHeight,
            Math.max(80, Math.floor(placeBelow ? spaceBelow : spaceAbove))
          );
          const desiredLeft = anchorRect.right - popupWidth;
          const left = Math.min(
            Math.max(viewportPadding, desiredLeft),
            Math.max(viewportPadding, window.innerWidth - popupWidth - viewportPadding)
          );

          setFloatingPositionStyle({
            position: 'fixed',
            width: `${popupWidth}px`,
            maxHeight: `${fallbackHeight}px`,
            left: `${left}px`,
            right: 'auto',
            ...(placeBelow
              ? { top: `${anchorRect.bottom + gap}px`, bottom: 'auto' }
              : { top: 'auto', bottom: `${window.innerHeight - anchorRect.top + gap}px` }),
          });
          return;
        }

        const shouldPinToViewport =
          availableHeight < minimumUsefulPopupHeight &&
          viewportAvailableHeight > availableHeight;
        const desiredLeft = anchorRect.right - popupWidth + 34;
        const left = Math.min(
          Math.max(viewportPadding, desiredLeft),
          Math.max(viewportPadding, window.innerWidth - popupWidth - viewportPadding)
        );
        const popupHeight = Math.min(
          preferredPopupHeight,
          shouldPinToViewport ? viewportAvailableHeight : availableHeight
        );

        setFloatingPositionStyle({
          position: 'fixed',
          width: `${popupWidth}px`,
          maxHeight: `${popupHeight}px`,
          left: `${left}px`,
          right: 'auto',
          ...(shouldPinToViewport
            ? { top: `${viewportPadding}px`, bottom: 'auto' }
            : shouldFlipAbove
            ? { top: 'auto', bottom: `${window.innerHeight - anchorRect.top + gap}px` }
            : { top: `${anchorRect.bottom + gap}px`, bottom: 'auto' }),
        });
        return;
      }

      const offsetParent = pickerElement?.offsetParent;
      if (!(offsetParent instanceof HTMLElement)) {
        setFloatingPositionStyle(null);
        return;
      }

      const parentRect = offsetParent.getBoundingClientRect();
      const availableWidth = Math.max(Math.min(window.innerWidth - 24, parentRect.width), 0);
      const popupWidth = Math.min(455, availableWidth);
      const desiredRight = Math.max(parentRect.right - anchorRect.right - 4, 0);
      const maxRight = Math.max(parentRect.width - popupWidth, 0);

      setFloatingPositionStyle({
        width: `${popupWidth}px`,
        left: 'auto',
        right: `${Math.min(desiredRight, maxRight)}px`,
        maxHeight: `${availableHeight}px`,
        ...(isFloatingBelow && shouldFlipAbove
          ? { top: 'auto', bottom: `calc(100% + ${gap}px)` }
          : {}),
      });
    };

    updateFloatingPosition();
    window.addEventListener('resize', updateFloatingPosition);
    window.addEventListener('scroll', updateFloatingPosition, true);

    return () => {
      window.removeEventListener('resize', updateFloatingPosition);
      window.removeEventListener('scroll', updateFloatingPosition, true);
    };
  }, [anchorRef, isAnchoredIconFloating, isFloatingBelow, isProfileChrome, isProfileSide, pickerRef]);

  const emojiGridClassName = isProfileChrome
    ? 'grid grid-cols-8 gap-3'
    : 'grid grid-cols-8 gap-0.5 sm:grid-cols-9';
  const emojiButtonClassName = isProfileChrome
    ? `flex h-14 w-14 items-center justify-center rounded-[16px] text-[32px] transition-colors hover:bg-[#F3F6FB] ${EMOJI_GLYPH_CLASSNAME}`
    : `flex h-9 w-9 items-center justify-center rounded-[12px] text-[23px] transition-colors hover:bg-[#F3F6FB] ${EMOJI_GLYPH_CLASSNAME}`;

  const emojiSections = searchTerms.length
    ? [
        {
          id: 'search-results',
          title: `Results for "${searchValue.trim()}"`,
          items: visibleEmojiItems,
        },
      ]
    : useMaximizedEmojiGrid
      ? [
          {
            id: 'all-emojis',
            title: 'All emojis',
            items: visibleEmojiItems,
          },
        ]
      : [
        ...(recentSectionItems.length
          ? [
              {
                id: 'recent-preview',
                title: 'Recently used',
                items: recentSectionItems,
              },
            ]
          : []),
        ...(!showEmptyRecentState
          ? [
              {
                id: activeCategoryId,
                title: activeCategoryId === 'recent' ? 'Recently used' : activeCategory.label,
                items: visibleEmojiItems,
              },
            ]
          : []),
      ];

  const visibleGifCards = normalizedSearchValue
    ? GIF_CARD_ITEMS.filter((card) => matchesSearchTerms(card.searchText, searchTerms))
    : GIF_CARD_ITEMS;
  const searchedChatListGifItems = normalizedSearchValue
    ? CHAT_LIST_GIF_ITEMS.filter((item) => matchesSearchTerms(item.searchText, searchTerms))
    : CHAT_LIST_GIF_ITEMS;
  const visibleChatListGifItems = activeGifCategoryId === 'all'
    ? searchedChatListGifItems
    : searchedChatListGifItems.filter((item) => item.category === activeGifCategoryId);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchValue('');
  };

  const handleCategoryChange = (categoryId) => {
    setActiveCategoryId(categoryId);
    setSearchValue('');
    setActiveTab('emoji');
  };

  const handleEmojiClick = (emoji, { preserveRecentOrder = false } = {}) => {
    const selectedEmoji = String(emoji || '').trim();
    if (!selectedEmoji) {
      return;
    }

    onEmojiSelect?.(selectedEmoji);
    setRecentEmojis((currentRecentEmojis) => {
      const hasExistingRecentEmoji = currentRecentEmojis.includes(selectedEmoji);
      const nextRecentEmojis = preserveRecentOrder && hasExistingRecentEmoji
        ? currentRecentEmojis
        : [selectedEmoji, ...currentRecentEmojis.filter((value) => value !== selectedEmoji)].slice(0, MAX_RECENT_EMOJIS);
      persistRecentEmojis(nextRecentEmojis);
      return nextRecentEmojis;
    });
  };

  return (
    <div
      ref={pickerRef}
      role="dialog"
      aria-label="Emoji picker"
      className={[
        isInlineBelow
          ? 'relative mt-3 box-border flex w-full flex-col overflow-hidden'
          : (isFloatingBelow
              ? 'absolute top-[calc(100%+8px)] z-[200] box-border flex flex-col overflow-hidden'
              : 'absolute bottom-[calc(100%+8px)] z-[200] box-border flex flex-col overflow-hidden'),
        isInlineBelow
          ? (isChatListChrome ? 'md:ml-auto md:w-[455px]' : 'sm:ml-auto sm:w-[455px]')
              : (usesIconChrome
                  ? (isAnchoredIconFloating
                      ? 'left-0 right-0 w-auto sm:w-[455px]'
                      : 'left-0 right-0 w-auto sm:left-0 sm:right-0 md:left-auto md:right-[206px] md:w-[455px]')
                  : 'left-0 right-0 sm:left-auto sm:right-0 sm:w-[455px]'),
        isProfileChrome
          ? 'w-[min(520px,calc(100vw-24px))] max-w-[520px]'
          : 'max-w-[calc(100vw-24px)] sm:max-w-[455px]',
        isInlineBelow
          ? (isProfileChrome
              ? 'gap-4 h-[300px] max-h-[calc(100dvh-220px)]'
              : isChatListChrome
                ? (useMaximizedEmojiGrid
                    // Group-name picker in the Create Group dialog, whose card is a
                    // size container while the picker is open. The card keeps
                    // ~389px for its header, photo, name field, character count and
                    // footer; a fixed 320px only fit tall viewports, so at 100% zoom
                    // on laptop screens the popup's frame and scrollbar ran under
                    // the footer (BUG_USR_363). Size it to the space the card leaves.
                    ? 'gap-2.5 h-[min(280px,calc(100dvh-300px))] max-h-[calc(100dvh-288px)] sm:gap-3 sm:h-[min(320px,calc(100cqh-389px))] sm:min-h-[160px]'
                    : 'gap-2.5 h-[min(280px,calc(100dvh-300px))] max-h-[calc(100dvh-288px)] sm:gap-3 sm:h-[320px] sm:max-h-[min(320px,calc(100dvh-220px))]')
                : 'gap-3 h-[360px] max-h-[calc(100dvh-220px)] sm:h-[442px] sm:max-h-[min(442px,calc(100dvh-160px))]')
          : (isProfileChrome
              ? 'gap-5 h-[500px] max-h-[min(500px,calc(100dvh-96px))]'
              : isChatListChrome
              ? 'gap-2.5 h-[min(332px,calc(100dvh-190px))] max-h-[calc(100dvh-176px)] sm:gap-3 sm:h-[442px] sm:max-h-[min(442px,calc(100dvh-120px))]'
              : 'gap-3 h-[360px] max-h-[calc(100dvh-156px)] sm:h-[442px] sm:max-h-[min(442px,calc(100dvh-120px))]'),
        'chatterly-emoji-picker',
        isProfileChrome ? 'chatterly-emoji-picker--profile' : '',
        'bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]',
      ].join(' ')}
      style={{
        ...(floatingPositionStyle || {}),
        borderRadius: '16px',
        border: '0.5px solid #D8E0EB',
        padding: usesIconChrome ? (isProfileChrome ? '18px 24px 24px' : '8px 8px 12px') : '8px 8px 16px',
      }}
    >
      {onClose && !useMaximizedEmojiGrid ? (
        <button
          type="button"
          onClick={onClose}
          className={`absolute z-10 flex items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#334155] ${
            isProfileChrome
              ? 'right-4 top-4 h-10 w-10'
              : 'right-3 top-3 h-7 w-7 bg-white'
          }`}
          aria-label="Close emoji picker"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      ) : null}

      {/* The group-name picker intentionally omits the chrome so its emoji
          grid receives nearly all of the available dialog height. */}
      {!useMaximizedEmojiGrid && (usesIconChrome ? (
        <ChatListChromeHeader
          activeTab={activeTab}
          onTabChange={handleTabChange}
          activeCategoryId={activeCategoryId}
          onCategoryChange={handleCategoryChange}
          compact={isProfileChrome}
          showGifTab={showGifTab}
        />
      ) : (
        <div className="flex justify-center">
          <div className="inline-flex items-center rounded-full border border-[#D8E0EB] bg-[#F8FAFC] p-1">
            {PICKER_TABS.filter((tab) => showGifTab || tab.id !== 'gif').map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleTabChange(tab.id)}
                  className={`min-w-[76px] rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${isActive ? 'bg-white text-[#0F172A] shadow-[0_4px_12px_rgba(148,163,184,0.2)]' : 'text-[#64748B] hover:text-[#334155]'}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Emoji tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'emoji' ? (
        <div className={`flex min-h-0 flex-1 flex-col ${useMaximizedEmojiGrid ? 'gap-3' : (isProfileChrome ? 'gap-5' : isChatListChrome ? 'gap-4' : 'gap-3')}`}>
          {/* Category pills */}
          {usesIconChrome ? null : (
            <div className="overflow-x-hidden">
              <div className="inline-flex min-w-full items-center justify-center rounded-full border border-[#D8E0EB] bg-[#F8FAFC] p-1">
                {EMOJI_CATEGORY_BUTTONS.map((category) => {
                  const isActive = activeCategoryId === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      title={category.label}
                      aria-label={category.label}
                      onClick={() => handleCategoryChange(category.id)}
                      className={`flex h-8.5 w-9 items-center justify-center rounded-full text-[17px] transition-colors ${isActive ? 'bg-white shadow-[0_4px_10px_rgba(148,163,184,0.18)]' : 'hover:bg-white/70'}`}
                    >
                      <EmojiGlyph emoji={category.icon} className="text-[17px]" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search (the group-name picker keeps its close button on this row
              rather than a row of its own, leaving that height to the grid) */}
          <div className={useMaximizedEmojiGrid && onClose ? 'flex items-center gap-2' : undefined}>
            <label htmlFor={searchInputId} className="sr-only">Search Emoji</label>
            <div className={`flex items-center rounded-full border border-[#D8E0EB] bg-[#F8FAFC] ${useMaximizedEmojiGrid && onClose ? 'min-w-0 flex-1 ' : ''}${
              isProfileChrome ? 'h-[66px] gap-4 px-6 py-0' : 'gap-2.5 px-3.5 py-2 sm:gap-3 sm:px-4 sm:py-2.5'
            }`}>
              <SearchIcon />
              <input
                ref={searchInputRef}
                id={searchInputId}
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search Emoji"
                className={`w-full bg-transparent text-[#0F172A] outline-none placeholder:text-[#64748B] ${isProfileChrome ? 'text-[17px]' : 'text-[13px] sm:text-[14px]'}`}
              />
              {searchValue ? (
                <button
                  type="button"
                  onClick={() => setSearchValue('')}
                  className={`${isProfileChrome ? 'h-10 w-10' : 'h-6 w-6'} flex items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-white hover:text-[#334155]`}
                  aria-label="Clear emoji search"
                >
                  <svg width={isProfileChrome ? '16' : '12'} height={isProfileChrome ? '16' : '12'} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M2 2l8 8" />
                    <path d="M10 2 2 10" />
                  </svg>
                </button>
              ) : null}
            </div>
            {useMaximizedEmojiGrid && onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#334155]"
                aria-label="Close emoji picker"
                title="Close emoji picker"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            ) : null}
          </div>

          {/* Emoji grid */}
          <div ref={emojiScrollContainerRef} className={`chatterly-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${useMaximizedEmojiGrid ? 'mr-1 pr-1' : isProfileChrome ? 'pr-0' : 'pr-1'}`}>
            <div className={`flex flex-col ${isProfileChrome ? 'gap-5' : 'gap-3.5 sm:gap-4'}`}>
              {showEmptyRecentState ? (
                <>
                  <div className="rounded-[20px] border border-dashed border-[#D8E0EB] bg-[#F8FAFC] px-4 py-6 text-center text-[13px] text-[#64748B]">
                    Your recent emojis will appear here once you start using them.
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between px-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
                        Suggested
                      </p>
                    </div>
                    <div className={emojiGridClassName}>
                      {suggestedEmojiItems.map((item) => (
                        <button
                          key={`suggested-${item.categoryId}-${item.emoji}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleEmojiClick(item.emoji)}
                          className={emojiButtonClassName}
                          aria-label={item.emoji}
                        >
                          <EmojiGlyph emoji={item.emoji} className={isProfileChrome ? 'text-[32px]' : 'text-[23px]'} />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                emojiSections.map((section) => (
                  <div key={section.id}>
                    <div className="mb-2 flex items-center justify-between px-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
                        {section.title}
                      </p>
                      {section.id === 'search-results' ? (
                        <span className="text-[11px] text-[#94A3B8]" aria-live="polite">
                          {section.items.length} results
                        </span>
                      ) : null}
                    </div>
                    <div className={emojiGridClassName}>
                      {section.items.map((item) => (
                        <button
                          key={`${section.id}-${item.categoryId}-${item.emoji}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() =>
                            handleEmojiClick(item.emoji, {
                              preserveRecentOrder: Boolean(item.isRecentItem),
                            })
                          }
                          className={emojiButtonClassName}
                          aria-label={item.emoji}
                        >
                          <EmojiGlyph emoji={item.emoji} className={isProfileChrome ? 'text-[32px]' : 'text-[23px]'} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
            {normalizedSearchValue && visibleEmojiItems.length === 0 ? (
              <div className="mt-3 rounded-[20px] border border-dashed border-[#D8E0EB] bg-[#F8FAFC] px-4 py-6 text-center text-[13px] text-[#64748B]">
                No emojis matched that search. Try words like `heart`, `party`, or `laugh`.
              </div>
            ) : null}
          </div>
        </div>
      ) : isChatListChrome ? (
        <ChatListGifPanel
          searchInputId={searchInputId}
          searchInputRef={searchInputRef}
          searchValue={searchValue}
          onSearchValueChange={setSearchValue}
          visibleItems={visibleChatListGifItems}
          categories={CHAT_LIST_GIF_CATEGORIES}
          activeCategoryId={activeGifCategoryId}
          onCategoryChange={setActiveGifCategoryId}
          onGifSelect={onGifSelect}
        />
      ) : (
        /* ── GIF tab ─────────────────────────────────────────────────────────── */
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Search */}
          <div>
            <label htmlFor={`${searchInputId}-gif`} className="sr-only">Search GIF</label>
            <div className="flex items-center gap-3 rounded-full border border-[#D8E0EB] bg-[#F8FAFC] px-4 py-2.5">
              <SearchIcon />
              <input
                ref={searchInputRef}
                id={`${searchInputId}-gif`}
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search GIF"
                className="w-full bg-transparent text-[14px] text-[#0F172A] outline-none placeholder:text-[#64748B]"
              />
            </div>
          </div>

          {/* GIF card grid */}
          <div className="min-h-0 flex-1">
            <div className="chatterly-scrollbar grid h-full grid-cols-2 gap-2.5 overflow-y-auto overscroll-contain pr-1">
              {visibleGifCards.map((card) => (
                <div key={card.id} className="overflow-hidden rounded-[20px] border border-[#D8E0EB] bg-[#F8FAFC] p-2.5">
                  <div className={`flex h-[88px] items-end rounded-[16px] bg-gradient-to-br ${card.gradient} p-3 text-white shadow-[0_14px_28px_rgba(15,23,42,0.14)]`}>
                    <EmojiGlyph emoji={card.emoji} className="text-[26px]" />
                    <span className="ml-auto rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                      GIF
                    </span>
                  </div>
                  <div className="mt-3">
                    <p className="text-[13px] font-semibold text-[#0F172A]">{card.label}</p>
                    <p className="mt-1 text-[12px] leading-5 text-[#64748B]">{card.caption}</p>
                  </div>
                </div>
              ))}
            </div>
            {visibleGifCards.length === 0 ? (
              <div className="mt-3 rounded-[20px] border border-dashed border-[#D8E0EB] bg-[#F8FAFC] px-4 py-6 text-center text-[13px] text-[#64748B]">
                No GIF categories matched that search yet.
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmojiPicker({ isOpen, ...props }) {
  if (!isOpen) {
    return null;
  }

  return <OpenEmojiPicker {...props} />;
}
