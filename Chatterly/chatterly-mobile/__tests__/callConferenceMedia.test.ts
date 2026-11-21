import {startCallConferenceMedia} from '../src/services/callConferenceMedia';
import {sendCallAnswerOverSocket, sendCallOfferOverSocket, sendIceCandidateOverSocket, subscribeToSocketEvents} from '../src/services/chatRealtime';

jest.mock('../src/services/sessionStore', () => ({getSession: () => ({user: {id: 'me'}})}));
jest.mock('../src/services/chatRealtime', () => ({
  sendCallAnswerOverSocket: jest.fn().mockResolvedValue({success: true}),
  sendCallOfferOverSocket: jest.fn().mockResolvedValue({success: true}),
  sendIceCandidateOverSocket: jest.fn().mockResolvedValue({success: true}),
  subscribeToSocketEvents: jest.fn(),
}));

const rtc = require('../__mocks__/react-native-webrtc');
let events: Record<string, (payload: any) => void>;
let unsubscribe: jest.Mock;
const settle = async () => { for (let tick = 0; tick < 30; tick += 1) await Promise.resolve(); };

beforeEach(() => {
  jest.clearAllMocks();
  rtc.__peerConnections.length = 0;
  unsubscribe = jest.fn();
  jest.mocked(subscribeToSocketEvents).mockImplementation(handlers => { events = handlers; return unsubscribe; });
});

test('connects each newcomer independently with the existing camera and microphone', async () => {
  const stream = new rtc.MediaStream([{kind: 'audio'}, {kind: 'video'}]);
  const media = startCallConferenceMedia('call', stream, rtc);
  try {
    events.participant_joined({callId: 'call', participant: 'third'});
    events.participant_joined({callId: 'call', participant: 'fourth'});
    events.participant_joined({callId: 'call', participant: 'third'});
    events.participant_joined({callId: 'elsewhere', participant: 'fifth'});
    events.participant_joined({callId: 'call', participant: 'me'});
    await settle();
    expect(rtc.__peerConnections).toHaveLength(2);
    expect(sendCallOfferOverSocket).toHaveBeenCalledWith('call', expect.objectContaining({conferenceTarget: 'third'}));
    expect(sendCallOfferOverSocket).toHaveBeenCalledWith('call', expect.objectContaining({conferenceTarget: 'fourth'}));
    expect(rtc.__peerConnections[0].addTrack).toHaveBeenCalledTimes(2);
    const screen = {kind: 'video'};
    await media.replaceVideo(screen);
    rtc.__peerConnections.forEach((peer: any) => expect(peer.senders[1].replaceTrack).toHaveBeenCalledWith(screen));
    rtc.__peerConnections[0].onicecandidate({candidate: {candidate: 'ice'}});
    expect(sendIceCandidateOverSocket).toHaveBeenCalledWith('call', {candidate: 'ice', conferenceTarget: 'third'});
  } finally { media.stop(); }
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  rtc.__peerConnections.forEach((peer: any) => expect(peer.close).toHaveBeenCalledTimes(1));
});

test('serializes native SDP getters before attaching the recipient', async () => {
  const media = startCallConferenceMedia('call', new rtc.MediaStream(), rtc);
  try {
    events.participant_joined({callId: 'call', participant: 'third'});
    const peer = rtc.__peerConnections[0];
    peer.createOffer.mockResolvedValue({toJSON: () => ({type: 'offer', sdp: 'native-sdp'})});
    await settle();
    expect(sendCallOfferOverSocket).toHaveBeenCalledWith('call', {type: 'offer', sdp: 'native-sdp', conferenceTarget: 'third'});
  } finally { media.stop(); }
});

test('answers only its own offers and queues early ICE for the correct participant', async () => {
  const media = startCallConferenceMedia('call', new rtc.MediaStream(), rtc);
  try {
    events.webrtc_offer({callId: 'call', from: 'original', offer: {type: 'offer', sdp: 'original-pair'}});
    events.webrtc_offer({callId: 'call', from: 'original', offer: {type: 'offer', sdp: 'another-peer', conferenceTarget: 'someone-else'}});
    expect(rtc.__peerConnections).toHaveLength(0);
    events.ice_candidate({callId: 'call', from: 'inviter', candidate: {candidate: 'early', conferenceTarget: 'me'}});
    await settle();
    const peer = rtc.__peerConnections[0];
    expect(peer.addIceCandidate).not.toHaveBeenCalled();
    events.webrtc_offer({callId: 'call', from: 'inviter', offer: {type: 'offer', sdp: 'invite', conferenceTarget: 'me'}});
    await settle();
    expect(peer.addIceCandidate).toHaveBeenCalledTimes(1);
    expect(sendCallAnswerOverSocket).toHaveBeenCalledWith('call', expect.objectContaining({conferenceTarget: 'inviter'}));
  } finally { media.stop(); }
});

test.each([
  ['caller', 'webrtc_answer'],
  ['receiver', 'webrtc_offer'],
] as const)('uses HD encoding on the targeted %s camera sender', async (_role, eventName) => {
  const stream = new rtc.MediaStream([{kind: 'audio'}, {kind: 'video'}]);
  const media = startCallConferenceMedia('call', stream, rtc);
  try {
    if (eventName === 'webrtc_answer') {
      events.participant_joined({callId: 'call', participant: 'other'});
      await settle();
    }
    events[eventName]({
      callId: 'call',
      from: 'other',
      [eventName === 'webrtc_answer' ? 'answer' : 'offer']: {
        type: eventName === 'webrtc_answer' ? 'answer' : 'offer',
        sdp: 'remote-sdp',
        conferenceTarget: 'me',
      },
    });
    await settle();
    const peer = rtc.__peerConnections[0];
    const video = peer.senders.find((sender: any) => sender.track?.kind === 'video');
    const audio = peer.senders.find((sender: any) => sender.track?.kind === 'audio');
    expect(video.setParameters).toHaveBeenCalledWith(expect.objectContaining({
      degradationPreference: 'maintain-resolution',
      encodings: [expect.objectContaining({maxBitrate: 2500000, maxFramerate: 30, scaleResolutionDownBy: 1})],
    }));
    expect(audio.setParameters).not.toHaveBeenCalled();
  } finally { media.stop(); }
});

test('No Audio and hold silence added participants, including late tracks', async () => {
  const media = startCallConferenceMedia('call', new rtc.MediaStream(), rtc);
  try {
    events.participant_joined({callId: 'call', participant: 'third'});
    await settle();
    media.setRemoteAudio(false);
    const track = {kind: 'audio', enabled: true};
    rtc.__peerConnections[0].ontrack({track, streams: [new rtc.MediaStream([track])]});
    expect(track.enabled).toBe(false);
    media.setRemoteAudio(true);
    expect(track.enabled).toBe(true);
    events.participant_left({callId: 'call', userId: 'third'});
    expect(rtc.__peerConnections[0].close).toHaveBeenCalledTimes(1);
  } finally { media.stop(); }
});
