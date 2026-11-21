module.exports = {
  Image: {compress: jest.fn(async uri => uri)},
  Video: {compress: jest.fn(async (_uri, _options, progress) => { progress?.(0.5); progress?.(1); return 'file:///cache/compressed-video.mp4'; })},
};
