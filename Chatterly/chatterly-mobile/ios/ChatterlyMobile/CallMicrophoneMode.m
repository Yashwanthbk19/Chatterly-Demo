#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>

@interface CallMicrophoneMode : NSObject <RCTBridgeModule>
@end

@implementation CallMicrophoneMode
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

RCT_EXPORT_METHOD(getMode:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if (@available(iOS 15.0, *)) {
    switch (AVCaptureDevice.activeMicrophoneMode) {
      case AVCaptureMicrophoneModeVoiceIsolation: resolve(@"Voice Isolation"); break;
      case AVCaptureMicrophoneModeWideSpectrum: resolve(@"Wide Spectrum"); break;
      default: resolve(@"Standard"); break;
    }
  } else {
    resolve(@"Standard");
  }
}

RCT_EXPORT_METHOD(show:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if (@available(iOS 15.0, *)) {
    [AVCaptureDevice showSystemUserInterface:AVCaptureSystemUserInterfaceMicrophoneModes];
    resolve(@YES);
  } else {
    reject(@"unavailable", @"Microphone modes require iOS 15 or later.", nil);
  }
}
@end
