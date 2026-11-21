/**
 * The GIF tab's catalogue for Sprint 4 Story 6.
 *
 * This is the web client's catalogue (`CHAT_LIST_GIF_ITEMS` in
 * chatterly-web/frontend/src/components/EmojiPicker.jsx), and the URLs are
 * identical on purpose: a GIF is delivered as an image message whose `mediaUrl`
 * is this remote address, so a GIF sent from one client has to be an address
 * the other can already render. To resync, re-extract from that file rather
 * than editing by hand. Three kinds of web entry are left out:
 *
 * - "Excited" and "Grinning", whose Giphy media now answers 404, so the tile
 *   could only ever show its fallback label;
 * - the "Stickers" entries and "Big smile", which point at the same media as a
 *   reaction already listed, so a search would show the same GIF twice.
 */

export type GifCategory = 'reactions' | 'happy' | 'love' | 'celebrate' | 'thanks' | 'sad' | 'work' | 'cute';

export type GifItem = {
  id: string;
  /** Spoken name for the tile, and the preview text on the chat list row. */
  label: string;
  /** The full rendition. This is what is sent, so the web can render it too. */
  url: string;
  /**
   * Giphy's 200px-wide rendition of the same media, used for the grid tile.
   * A full `giphy.gif` is often several megabytes; the grid only needs a
   * thumbnail-sized loop.
   */
  previewUrl: string;
  category: GifCategory;
  /** The tile's share of its grid row, in the web grid's twelfths. */
  span: number;
  /** Free-text the search field matches against. */
  keywords: string;
};

const GIPHY_MEDIA = 'https://media.giphy.com/media';

function gif(id: string, label: string, category: GifCategory, mediaId: string, span: number, keywords: string): GifItem {
  return {
    id,
    label,
    url: `${GIPHY_MEDIA}/${mediaId}/giphy.gif`,
    previewUrl: `${GIPHY_MEDIA}/${mediaId}/200w.gif`,
    category,
    span,
    keywords,
  };
}

export const GIF_ITEMS: GifItem[] = [
  gif('laughing', 'Laughing', 'reactions', '10JhviFuU2gWD6', 5, 'laugh laughing funny lol haha reaction'),
  gif('applause', 'Applause', 'reactions', '111ebonMs90YLu', 3, 'clap applause nice yes good reaction'),
  gif('thumbs-up', 'Thumbs up', 'reactions', '3o7abKhOpu0NwenH3O', 4, 'thumbs up yes ok approve reaction'),
  gif('wow', 'Wow', 'reactions', '26ufdipQqU2lhNA4g', 3, 'wow surprised shocked mind blown reaction'),
  gif('mind-blown', 'Mind blown', 'reactions', 'Um3ljJl8jrnHy', 5, 'mind blown amazed shocked reaction'),
  gif('facepalm', 'Facepalm', 'reactions', '3xz2BLBOt13X9AgjEA', 4, 'facepalm oops mistake awkward reaction'),
  gif('nope', 'Nope', 'reactions', '3o7TKwmnDgQb5jemjK', 4, 'no nope disagree not happening reaction'),
  gif('yes', 'Yes', 'reactions', '3ohhweiVB36rAlqVCE', 4, 'yes agree correct nod reaction'),
  gif('deal-with-it', 'Deal with it', 'reactions', 'xT9IgG50Fb7Mi0prBC', 5, 'cool sunglasses deal with it reaction'),
  gif('happy-dance', 'Happy dance', 'happy', 'ASd0Ukj0y3qMM', 5, 'happy dance excited yay mood celebration'),
  gif('good-mood', 'Good mood', 'happy', 'chzz1FQgqhytWRWbp3', 4, 'good mood happy excited smile'),
  gif('laugh-cry', 'Laugh cry', 'happy', 'Q7ozWVYCR0nyW2rvPW', 5, 'laugh cry funny lol haha'),
  gif('love-hearts', 'Love hearts', 'love', 'MDJ9IbxxvDUQM', 6, 'love heart cute affection reaction'),
  gif('heart-eyes', 'Heart eyes', 'love', 'R6gvnAxj2ISzJdbA63', 4, 'love heart eyes adore cute'),
  gif('sending-love', 'Sending love', 'love', 'Z21HJj2kz9uBG', 5, 'sending love heart hug affection'),
  gif('hug', 'Hug', 'love', 'od5H3PmEG5EVq', 4, 'hug warm comfort love support'),
  gif('miss-you', 'Miss you', 'love', 'l4FGpP4lxGGgK5CBW', 4, 'miss you love affection'),
  gif('party', 'Party', 'celebrate', 'l0MYt5jPR6QX5pnqM', 5, 'party celebrate dancing fun reaction smile happy'),
  gif('congrats', 'Congrats', 'celebrate', '3oz8xAFtqoOUUrsh7W', 4, 'congrats congratulations celebration win'),
  gif('cheers', 'Cheers', 'celebrate', 'BPJmthQ3YRwD6QqcVD', 4, 'cheers toast celebrate party'),
  gif('fireworks', 'Fireworks', 'celebrate', '26tOZ42Mg6pbTUPHW', 5, 'fireworks celebration festive party'),
  gif('birthday', 'Birthday', 'celebrate', 'SwIMZUJE3ZPpHAfTC4', 4, 'birthday cake celebrate wishes'),
  gif('success', 'Success', 'celebrate', 'ely3apij36BJhoZ234', 4, 'success win done achievement'),
  gif('thank-you', 'Thank you', 'thanks', '3oEdva9BUHPIs2SkGk', 3, 'thanks thank you grateful reaction'),
  gif('thanks-so-much', 'Thanks so much', 'thanks', '3o6Zt6KHxJTbXCnSvu', 5, 'thanks thank you appreciate grateful'),
  gif('you-rock', 'You rock', 'thanks', 'l4pMattUYTTM7qpIk', 4, 'you rock thanks awesome appreciate'),
  gif('please', 'Please', 'thanks', 'l0NwNrl4BtDD7JCx2', 4, 'please request pray thanks'),
  gif('sad-tears', 'Sad tears', 'sad', 'OPU6wzx8JrHna', 4, 'sad cry tears upset'),
  gif('crying', 'Crying', 'sad', 'BEob5qwFkSJ7G', 4, 'crying sad emotional tears'),
  gif('tired', 'Tired', 'sad', 'l2JHVUriDGEtWOx0c', 5, 'tired sleepy exhausted mood'),
  gif('waiting', 'Waiting', 'sad', 'l0HlBO7eyXzSZkJri', 5, 'waiting patient clock bored reaction'),
  gif('angry', 'Angry', 'sad', '11tTNkNy1SdXGg', 4, 'angry mad annoyed frustrated'),
  gif('typing', 'Typing', 'work', 'JIX9t2j0ZTN9S', 5, 'typing work laptop busy reply'),
  gif('on-it', 'On it', 'work', '13HgwGsXF0aiGY', 4, 'on it work busy coding computer'),
  gif('brb', 'BRB', 'work', '3o7aD2saalBwwftBIY', 4, 'brb be right back away'),
  gif('coffee', 'Coffee break', 'work', '3oriO04qxVReM5rJEA', 4, 'coffee break work morning'),
  gif('meeting', 'Meeting', 'work', 'l0IylOPCNkiqOgMyA', 5, 'meeting work office busy'),
  gif('cute-cat', 'Cute cat', 'cute', 'vFKqnCdLPNOKc', 4, 'cute cat adorable pet'),
  gif('dog-smile', 'Dog smile', 'cute', '3ndAvMC5LFPNMCzq7m', 4, 'cute dog smile pet happy'),
  gif('peek', 'Peek', 'cute', 'ASvQ3A2Q7blzq', 4, 'peek shy cute hello'),
  gif('hello', 'Hello', 'cute', '28GHfhGFWpFgsQB4wR', 5, 'hello hi wave cute greeting'),
  gif('sleepy', 'Sleepy', 'cute', '3oriO0OEd9QIDdllqo', 4, 'sleepy cute tired nap'),
];

/** Every term has to match, so "thank you" narrows rather than widens. */
export function searchGifs(query: string): GifItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) { return GIF_ITEMS; }
  return GIF_ITEMS.filter(item => {
    const haystack = `${item.label} ${item.category} ${item.keywords}`.toLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}

/** How many GIFs share a grid row, as in the design's three-across masonry. */
export const GIF_ROW_SIZE = 3;

/**
 * Breaks the results into the grid's rows. Each row is laid out by `span`, so
 * neighbouring tiles differ in width the way the design's masonry does, while
 * every row still fills the panel edge to edge.
 */
export function gifRows(items: GifItem[], rowSize = GIF_ROW_SIZE): GifItem[][] {
  const rows: GifItem[][] = [];
  for (let index = 0; index < items.length; index += rowSize) {
    rows.push(items.slice(index, index + rowSize));
  }
  return rows;
}

/**
 * Tile widths for one row, in whole pixels, summing exactly to the space the
 * row has after its gaps. A short last row keeps a three-across tile width
 * rather than stretching one GIF across the panel.
 */
export function gifRowWidths(row: GifItem[], contentWidth: number, gap: number, rowSize = GIF_ROW_SIZE): number[] {
  if (!row.length) { return []; }
  const fullRowSpace = Math.max(0, contentWidth - gap * (rowSize - 1));
  if (row.length < rowSize) {
    const width = Math.floor(fullRowSpace / rowSize);
    return row.map(() => width);
  }
  const totalSpan = row.reduce((sum, item) => sum + Math.max(1, item.span), 0);
  const widths = row.map(item => Math.floor((fullRowSpace * Math.max(1, item.span)) / totalSpan));
  // Give the rounding remainder to the last tile so the row ends flush.
  widths[widths.length - 1] += fullRowSpace - widths.reduce((sum, width) => sum + width, 0);
  return widths;
}
