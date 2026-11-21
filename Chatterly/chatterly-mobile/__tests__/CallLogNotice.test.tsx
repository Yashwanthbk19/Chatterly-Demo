import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';
import {CallLogNotice} from '../src/components/CallLogNotice';
import {normalizeMessage} from '../src/services/chatApi';

jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: 'me'}}), getToken: () => 'jwt'}));

test.each([true, false])('call timestamp survives remount for isOwn=%s', async isOwn => {
  const record = {_id: 'call-message', sender: isOwn ? 'me' : 'friend', receiver: isOwn ? 'friend' : 'me', messageType: 'call' as const, encryptedContent: 'audio call completed', createdAt: '2026-10-15T23:45:00.000Z'};
  const expected = new Date(record.createdAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: true});
  for (let i = 0; i < 2; i++) {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<CallLogNotice message={normalizeMessage(record)}/>); });
    expect(renderer!.root.findAllByType(Text).some(node => node.props.children === expected)).toBe(true);
    await ReactTestRenderer.act(async () => { renderer!.unmount(); });
  }
});
