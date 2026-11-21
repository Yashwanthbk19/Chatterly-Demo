import {albumGroupId, createAlbumToken, parseAlbumFileName, tagAlbumFileName} from '../src/utils/mediaAlbum';

// An album is one multi-select send stored as one message per file, and the
// backend keeps no batch id. The id travels in the uploaded file's name so the
// thread can put the files back together after a reinstall.

test('a tagged upload name reads back as its album and its original name', () => {
  const token = createAlbumToken(1_760_000_000_000, () => 0.5);
  const tagged = tagAlbumFileName('IMG_0412.jpg', token);

  expect(tagged).toBe(`IMG_0412~album-${token}.jpg`);
  expect(parseAlbumFileName(tagged)).toEqual({fileName: 'IMG_0412.jpg', mediaGroupId: albumGroupId(token)});
});

test('every file of one send gets the same album, whatever its type or name', () => {
  const token = createAlbumToken();
  const names = ['photo.jpg', 'clip.mp4', 'scan.final.v2.jpg', 'noextension'];

  const groups = names.map(name => parseAlbumFileName(tagAlbumFileName(name, token)));

  expect(new Set(groups.map(group => group?.mediaGroupId)).size).toBe(1);
  expect(groups.map(group => group?.fileName)).toEqual(names);
});

test('tagging twice replaces the tag instead of stacking a second one', () => {
  const once = tagAlbumFileName('photo.jpg', 'aaaa1111');
  const twice = tagAlbumFileName(once, 'bbbb2222');

  expect(twice).toBe('photo~album-bbbb2222.jpg');
  expect(parseAlbumFileName(twice)?.fileName).toBe('photo.jpg');
});

test('ordinary names, documents and missing names are not albums', () => {
  expect(parseAlbumFileName('IMG_0412.jpg')).toBeNull();
  expect(parseAlbumFileName('report~final.pdf')).toBeNull();
  expect(parseAlbumFileName('photo~album-.jpg')).toBeNull();
  expect(parseAlbumFileName('')).toBeNull();
  expect(parseAlbumFileName(undefined)).toBeNull();
  expect(parseAlbumFileName(null)).toBeNull();
});

test('each send gets its own token, made only of url-safe lowercase characters', () => {
  const first = createAlbumToken(1_760_000_000_000, () => 0.1);
  const second = createAlbumToken(1_760_000_000_001, () => 0.1);
  const sameMomentDifferentDevice = createAlbumToken(1_760_000_000_000, () => 0.9);

  expect(new Set([first, second, sameMomentDifferentDevice]).size).toBe(3);
  [first, second, sameMomentDifferentDevice].forEach(token => expect(token).toMatch(/^[a-z0-9]+$/));
});
