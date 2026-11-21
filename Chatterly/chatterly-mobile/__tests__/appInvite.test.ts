import {APP_INVITE_LINK, withAppInviteLink} from '../src/utils/appInvite';

test('adds the app link to invitation text and preserves Unicode and line breaks', () => {
  const message = 'Hi! Join me on Chatterly 👋\nLet’s chat & call!';
  expect(withAppInviteLink(`  ${message}  `)).toBe(`${message}\n${APP_INVITE_LINK}`);
});

test('returns the app link without a leading blank line for an empty message', () => {
  expect(withAppInviteLink('   ')).toBe(APP_INVITE_LINK);
});

test.each([
  APP_INVITE_LINK,
  `Join me! ${APP_INVITE_LINK}`,
  `Join me!\n${APP_INVITE_LINK}`,
  `Download here: (${APP_INVITE_LINK}).`,
  `Download here: ${APP_INVITE_LINK}/`,
  `Download here: ${APP_INVITE_LINK}?ref=friend&source=invite`,
  `Download here: ${APP_INVITE_LINK}#install`,
])('keeps an existing app link without adding another: %s', message => {
  expect(withAppInviteLink(message)).toBe(message);
  expect(withAppInviteLink(withAppInviteLink(message))).toBe(message);
});

test.each([
  `${APP_INVITE_LINK}s`,
  `${APP_INVITE_LINK}-old`,
  `${APP_INVITE_LINK}/unrelated`,
  `https://other.example/?redirect=${APP_INVITE_LINK}`,
  `https://other.example/${APP_INVITE_LINK}`,
])('includes the real download link when a different URL contains its text: %s', otherUrl => {
  expect(withAppInviteLink(`Join me! ${otherUrl}`)).toBe(`Join me! ${otherUrl}\n${APP_INVITE_LINK}`);
});
