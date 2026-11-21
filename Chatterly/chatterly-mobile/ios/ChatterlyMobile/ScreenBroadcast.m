#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <ReplayKit/ReplayKit.h>

@interface ScreenBroadcast : NSObject <RCTBridgeModule>
@end
@implementation ScreenBroadcast {
  RPSystemBroadcastPickerView *_picker;
  NSTimer *_timer;
  RCTPromiseRejectBlock _reject;
}
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (NSUserDefaults *)shared {
  return [[NSUserDefaults alloc] initWithSuiteName:[NSBundle.mainBundle objectForInfoDictionaryKey:@"RTCAppGroupIdentifier"]];
}
RCT_EXPORT_METHOD(start:(nonnull NSNumber *)height resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if (_timer) { reject(@"busy", @"Screen sharing is already starting.", nil); return; }
  NSString *group = [NSBundle.mainBundle objectForInfoDictionaryKey:@"RTCAppGroupIdentifier"];
  if (![NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:group]) {
    reject(@"configuration", @"Screen sharing is unavailable in this build. Check App Group signing.", nil);
    return;
  }
  NSString *request = NSUUID.UUID.UUIDString;
  NSUserDefaults *shared = [self shared];
  [shared setInteger:MAX(360, MIN(1080, height.integerValue)) forKey:@"screenShareHeight"];
  [shared removeObjectForKey:@"screenShareStarted"];
  [shared setObject:request forKey:@"screenShareRequest"];
  _picker = [[RPSystemBroadcastPickerView alloc] initWithFrame:CGRectMake(0, 0, 1, 1)];
  _picker.preferredExtension = [NSBundle.mainBundle objectForInfoDictionaryKey:@"RTCScreenSharingExtension"];
  _picker.showsMicrophoneButton = NO;
  [RCTPresentedViewController().view addSubview:_picker];
  _reject = reject;
  __weak ScreenBroadcast *weakSelf = self;
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:60];
  _timer = [NSTimer scheduledTimerWithTimeInterval:0.25 repeats:YES block:^(NSTimer *timer) {
    ScreenBroadcast *strongSelf = weakSelf;
    if (!strongSelf) { [timer invalidate]; return; }
    if ([[shared stringForKey:@"screenShareStarted"] isEqualToString:request]) {
      [strongSelf clearPicker];
      resolve(@YES);
    } else if (deadline.timeIntervalSinceNow <= 0) {
      [shared removeObjectForKey:@"screenShareRequest"];
      [strongSelf clearPicker];
      reject(@"cancelled", @"Screen sharing was cancelled or did not start.", nil);
    }
  }];
  for (UIView *view in _picker.subviews) {
    if ([view isKindOfClass:UIButton.class]) { [(UIButton *)view sendActionsForControlEvents:UIControlEventTouchUpInside]; break; }
  }
}
RCT_EXPORT_METHOD(stop) {
  [[self shared] removeObjectForKey:@"screenShareRequest"];
  RCTPromiseRejectBlock reject = _reject;
  [self clearPicker];
  if (reject) { reject(@"cancelled", @"Screen sharing stopped.", nil); }
}
- (void)invalidate {
  dispatch_async(dispatch_get_main_queue(), ^{ [self stop]; });
}
- (void)clearPicker {
  [_timer invalidate]; _timer = nil;
  [_picker removeFromSuperview]; _picker = nil;
  _reject = nil;
}
@end
