#import <ReplayKit/ReplayKit.h>
#import <CoreImage/CoreImage.h>
#import <ImageIO/ImageIO.h>
#import <sys/socket.h>
#import <sys/un.h>
#import <unistd.h>

@interface SampleHandler : RPBroadcastSampleHandler
@end
@implementation SampleHandler {
  int _socket;
  BOOL _finished;
  CIContext *_context;
  NSUserDefaults *_shared;
  NSString *_request;
  NSTimeInterval _lastFrame;
  dispatch_source_t _stopTimer;
}
- (void)broadcastStartedWithSetupInfo:(NSDictionary *)setupInfo {
  _socket = -1;
  NSString *group = [NSBundle.mainBundle objectForInfoDictionaryKey:@"RTCAppGroupIdentifier"];
  _shared = [[NSUserDefaults alloc] initWithSuiteName:group];
  _request = [_shared stringForKey:@"screenShareRequest"];
  if (!_request.length) { [self fail:@"Start screen sharing from your Chatterly call."]; return; }
  NSString *path = [[[NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:group] URLByAppendingPathComponent:@"rtc_SSFD"] path];
  if (!path || path.length >= sizeof(((struct sockaddr_un *)0)->sun_path)) { [self fail:@"Screen sharing is not configured."]; return; }
  _socket = socket(AF_UNIX, SOCK_STREAM, 0);
  struct sockaddr_un address = {0};
  address.sun_family = AF_UNIX;
  strlcpy(address.sun_path, path.UTF8String, sizeof(address.sun_path));
  int noSignal = 1;
  setsockopt(_socket, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, sizeof(noSignal));
  struct timeval timeout = {0, 250000};
  setsockopt(_socket, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
  if (connect(_socket, (struct sockaddr *)&address, sizeof(address)) != 0) { [self fail:@"Unable to connect to your call."]; return; }
  _context = [CIContext contextWithOptions:@{kCIContextCacheIntermediates: @NO}];
  _stopTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
  dispatch_source_set_timer(_stopTimer, DISPATCH_TIME_NOW, NSEC_PER_SEC / 2, NSEC_PER_SEC / 10);
  __weak SampleHandler *weakSelf = self;
  dispatch_source_set_event_handler(_stopTimer, ^{ [weakSelf checkStop]; });
  dispatch_resume(_stopTimer);
}
- (void)checkStop {
  if (![[_shared stringForKey:@"screenShareRequest"] isEqualToString:_request]) { [self fail:@"Screen sharing stopped."]; }
}
- (void)processSampleBuffer:(CMSampleBufferRef)sampleBuffer withType:(RPSampleBufferType)sampleBufferType {
  @synchronized (self) {
  if (sampleBufferType != RPSampleBufferTypeVideo || _socket < 0) { return; }
  NSTimeInterval now = NSProcessInfo.processInfo.systemUptime;
  if (now - _lastFrame < 1.0 / 15.0) { return; }
  _lastFrame = now;
  @autoreleasepool {
    CVImageBufferRef buffer = CMSampleBufferGetImageBuffer(sampleBuffer);
    if (!buffer) { return; }
    CIImage *image = [CIImage imageWithCVPixelBuffer:buffer];
    CGFloat requested = MAX(360, MIN(1080, [_shared integerForKey:@"screenShareHeight"]));
    CGFloat scale = MIN(1.0, MIN(requested / MIN(image.extent.size.width, image.extent.size.height), 1920.0 / MAX(image.extent.size.width, image.extent.size.height)));
    image = [image imageByApplyingTransform:CGAffineTransformMakeScale(scale, scale)];
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    NSData *jpeg = [_context JPEGRepresentationOfImage:image colorSpace:colorSpace options:@{(__bridge NSString *)kCGImageDestinationLossyCompressionQuality: @0.7}];
    CGColorSpaceRelease(colorSpace);
    if (!jpeg) { return; }
    NSNumber *orientation = (__bridge NSNumber *)CMGetAttachment(sampleBuffer, (__bridge CFStringRef)RPVideoSampleOrientationKey, NULL);
    NSString *header = [NSString stringWithFormat:@"HTTP/1.1 200 OK\r\nContent-Length: %lu\r\nBuffer-Width: %d\r\nBuffer-Height: %d\r\nBuffer-Orientation: %d\r\n\r\n", (unsigned long)jpeg.length, (int)image.extent.size.width, (int)image.extent.size.height, orientation ? orientation.intValue : 1];
    NSMutableData *packet = [[header dataUsingEncoding:NSUTF8StringEncoding] mutableCopy];
    [packet appendData:jpeg];
    const uint8_t *bytes = packet.bytes;
    NSUInteger offset = 0;
    while (offset < packet.length && _socket >= 0) {
      ssize_t count = send(_socket, bytes + offset, packet.length - offset, 0);
      if (count <= 0) { [self fail:@"Screen sharing ended."]; return; }
      offset += count;
    }
    if (offset == packet.length) { [_shared setObject:_request forKey:@"screenShareStarted"]; }
  }
  }
}
- (void)broadcastFinished { [self cleanup]; }
- (void)fail:(NSString *)message {
  @synchronized (self) {
  if (_finished) { return; }
  [self cleanup];
  [self finishBroadcastWithError:[NSError errorWithDomain:@"ChatterlyScreenShare" code:1 userInfo:@{NSLocalizedDescriptionKey: message}]];
  }
}
- (void)cleanup {
  @synchronized (self) {
  _finished = YES;
  if (_stopTimer) { dispatch_source_cancel(_stopTimer); _stopTimer = nil; }
  if (_socket >= 0) { close(_socket); _socket = -1; }
  if ([[_shared stringForKey:@"screenShareStarted"] isEqualToString:_request]) {
    [_shared removeObjectForKey:@"screenShareStarted"];
  }
  _context = nil;
  }
}
@end
