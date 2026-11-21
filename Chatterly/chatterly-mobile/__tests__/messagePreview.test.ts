import type {ChatMessage} from '../src/types/chat';
import {isGifMessage, messagePreview} from '../src/utils/messagePreview';

const message = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: 'message-1',
  text: '',
  createdAt: '2026-08-19T06:00:00.000Z',
  isOwn: true,
  ...overrides,
});

test('a text message previews as what was written', () => {
  expect(messagePreview(message({messageType: 'text', text: 'See you at 5'}))).toBe('See you at 5');
});

// Before this, a media message previewed as an empty string and the chat list
// row silently kept showing the previous message.
test('each attachment kind previews as its own label', () => {
  expect(messagePreview(message({messageType: 'image', mediaUrl: 'https://cdn.example/a.jpg'}))).toBe('Photo');
  expect(messagePreview(message({messageType: 'video', mediaUrl: 'https://cdn.example/a.mp4'}))).toBe('Video');
  expect(messagePreview(message({messageType: 'audio', mediaUrl: 'https://cdn.example/a.m4a'}))).toBe('Voice message');
  expect(messagePreview(message({messageType: 'file', fileName: 'Project_Plan.pdf'}))).toBe('Project_Plan.pdf');
  expect(messagePreview(message({messageType: 'location', locationName: 'Anna Nagar'}))).toBe('Anna Nagar');
});

test('a GIF is distinguished from an uploaded photo', () => {
  const gif = message({messageType: 'image', mediaUrl: 'https://media.giphy.com/media/abc/giphy.gif'});

  expect(isGifMessage(gif)).toBe(true);
  expect(messagePreview(gif)).toBe('GIF');
  expect(isGifMessage(message({messageType: 'image', mediaUrl: 'https://cdn.example/a.jpg'}))).toBe(false);
  expect(isGifMessage(message({messageType: 'text', text: 'giphy.gif'}))).toBe(false);
});

test('a group notice previews as the sentence it is, not as a document', () => {
  // The backend stores "Abc was added to the group" as a `system` message and makes
  // it the group's last message, so the chat list has to be able to show it.
  const notice = message({messageType: 'system' as never, text: 'Abc was added to the group', isOwn: false});

  expect(messagePreview(notice)).toBe('Abc was added to the group');
  expect(messagePreview(message({messageType: 'text', systemEvent: true, text: 'Abc was removed from the group'})))
    .toBe('Abc was removed from the group');
  expect(messagePreview(message({messageType: 'system' as never, text: 'Ravi was promoted to Moderator'})))
    .toBe('Ravi was promoted to Moderator');
});

test('a caption leads the preview and keeps the attachment as its qualifier', () => {
  expect(messagePreview(message({messageType: 'image', mediaUrl: 'https://cdn.example/a.jpg', text: 'At the beach'})))
    .toBe('Photo · At the beach');
});
