const React = require('react');
const {View} = require('react-native');
module.exports = {useVideoPlayer: jest.fn(() => ({})), VideoView: props => React.createElement(View, props)};
