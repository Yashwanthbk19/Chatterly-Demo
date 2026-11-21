import AVFoundation
import CallKit
import ExpoModulesCore

private final class PhoneCallObserver: NSObject, CXCallObserverDelegate {
  var changed: (() -> Void)?
  func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) { changed?() }
}

public class CallInterruptionModule: Module {
  private let callObserver = CXCallObserver()
  private let phoneDelegate = PhoneCallObserver()
  private var audioInterrupted = false
  private var interruptionObserver: NSObjectProtocol?
  private var isMonitoring = false
  private var interruptionIsActive = false

  public func definition() -> ModuleDefinition {
    Name("CallInterruption")
    Events("callInterruption")

    Function("startMonitoring") {
      self.isMonitoring = true
      self.phoneDelegate.changed = { [weak self] in self?.updateInterruption() }
      self.callObserver.setDelegate(self.phoneDelegate, queue: .main)
      self.updateInterruption()
    }

    Function("stopMonitoring") {
      self.stopMonitoring()
    }

    OnCreate {
      self.interruptionObserver = NotificationCenter.default.addObserver(
        forName: AVAudioSession.interruptionNotification,
        object: AVAudioSession.sharedInstance(),
        queue: .main
      ) { [weak self] notification in
        guard let self = self,
              self.isMonitoring,
              let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType) else { return }
        switch type {
        case .began:
          self.audioInterrupted = true
          self.updateInterruption()
        case .ended:
          self.audioInterrupted = false
          self.updateInterruption()
        @unknown default:
          break
        }
      }
    }

    OnDestroy {
      self.stopMonitoring()
      if let observer = self.interruptionObserver {
        NotificationCenter.default.removeObserver(observer)
        self.interruptionObserver = nil
      }
    }
  }

  private func publishInterruption(_ active: Bool) {
    guard interruptionIsActive != active else { return }
    interruptionIsActive = active
    sendEvent("callInterruption", ["type": active ? "began" : "ended"])
  }

  private func updateInterruption() {
    guard isMonitoring else { return }
    publishInterruption(audioInterrupted || callObserver.calls.contains { !$0.hasEnded })
  }

  private func stopMonitoring() {
    isMonitoring = false
    callObserver.setDelegate(nil, queue: .main)
    phoneDelegate.changed = nil
    audioInterrupted = false
    interruptionIsActive = false
  }
}
