const React = require('react');
const {View} = require('react-native');

const CameraView = React.forwardRef((props, ref) => {
  const onCameraReady = props.onCameraReady;
  React.useImperativeHandle(ref, () => ({
    takePictureAsync: jest.fn(async () => ({uri: 'file:///camera/photo.jpg', width: 1200, height: 1600})),
    recordAsync: jest.fn(async () => ({uri: 'file:///camera/video.mp4'})),
    stopRecording: jest.fn(),
  }));
  React.useEffect(() => { onCameraReady?.(); }, [onCameraReady]);
  return React.createElement(View, props, props.children);
});

module.exports = {
  CameraView,
  Camera: {
    getCameraPermissionsAsync: jest.fn(async () => ({granted: true})),
    requestCameraPermissionsAsync: jest.fn(async () => ({granted: true})),
  },
  useCameraPermissions: () => [{granted: true}, jest.fn(async () => ({granted: true})), jest.fn()],
};
