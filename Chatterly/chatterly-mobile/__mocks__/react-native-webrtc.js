class MockMediaStream {
  constructor(tracks = []) {
    this._audioTracks = tracks.filter(track => track.kind === 'audio');
    this._videoTracks = tracks.filter(track => track.kind === 'video');
  }
  getTracks() { return [...this._audioTracks, ...this._videoTracks]; }
  getAudioTracks() { return this._audioTracks; }
  getVideoTracks() { return this._videoTracks; }
  addTrack(track) {
    const tracks = track.kind === 'video' ? this._videoTracks : this._audioTracks;
    if (!tracks.includes(track)) { tracks.push(track); }
  }
  toURL() { return 'mock://media-stream'; }
  release = jest.fn();
}

class MockRTCPeerConnection {
  static instances = [];
  constructor() {
    MockRTCPeerConnection.instances.push(this);
    this.localDescription = null;
    this.remoteDescription = null;
    this.signalingState = 'stable';
    this.onicecandidate = null;
    this.ontrack = null;
    this.ondatachannel = null;
    this.createDataChannel = jest.fn(label => ({label, readyState: 'open', onmessage: null, send: jest.fn(), close: jest.fn()}));
    this.transceivers = [];
    this.senders = [];
    this.addTrack = jest.fn(track => this.makeSender(track));
    this.addTransceiver = jest.fn(() => ({sender: this.makeSender(null)}));
    this.close = jest.fn();
  }
  makeSender(track) {
    const sender = {
      track,
      replaceTrack: jest.fn(async next => { sender.track = next; }),
      getParameters: jest.fn(() => ({encodings: [{}]})),
      setParameters: jest.fn(async () => undefined),
    };
    this.senders.push(sender);
    this.transceivers.push({
      mid: null,
      stopped: false,
      direction: 'sendrecv',
      sender,
      receiver: {track: {kind: track?.kind}},
    });
    return sender;
  }
  getTransceivers = jest.fn(() => this.transceivers);
  createOffer = jest.fn(async () => ({type: 'offer', sdp: 'offer-sdp'}));
  createAnswer = jest.fn(async () => ({type: 'answer', sdp: 'answer-sdp'}));
  setLocalDescription = jest.fn(async description => {
    this.localDescription = description.type === 'rollback' ? null : description;
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
  });
  setRemoteDescription = jest.fn(async description => {
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    if (description?.type === 'offer') {
      this.transceivers.forEach((transceiver, index) => {
        transceiver.mid = String(index);
        transceiver.direction = 'recvonly';
      });
    }
  });
  addIceCandidate = jest.fn(async () => undefined);
}

class MockRTCSessionDescription {
  constructor(description) { Object.assign(this, description); }
}

class MockRTCIceCandidate {
  constructor(candidate) { Object.assign(this, candidate); }
}

module.exports = {
  RTCView: 'RTCView',
  MediaStream: MockMediaStream,
  RTCPeerConnection: MockRTCPeerConnection,
  RTCSessionDescription: MockRTCSessionDescription,
  RTCIceCandidate: MockRTCIceCandidate,
  mediaDevices: {
    getUserMedia: jest.fn(async ({video}) => {
      const tracks = [{enabled: true, kind: 'audio', stop: jest.fn()}];
      if (video) { tracks.push({kind: 'video', enabled: true, stop: jest.fn()}); }
      const stream = new MockMediaStream(tracks);
      return stream;
    }),
    getDisplayMedia: jest.fn(async () => {
      const stream = new MockMediaStream();
      stream._audioTracks = [];
      stream._videoTracks = [{kind: 'video', enabled: true, stop: jest.fn(), onended: null}];
      return stream;
    }),
  },
  __peerConnections: MockRTCPeerConnection.instances,
};
