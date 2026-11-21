package expo.modules.callinterruption

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

@Suppress("DEPRECATION")
class CallInterruptionModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var audioManager: AudioManager? = null
  private var focusRequest: AudioFocusRequest? = null
  private var phoneManager: TelephonyManager? = null
  private var phoneListener: PhoneStateListener? = null
  private var monitoring = false
  private var focusLost = false
  private var phoneBusy = false
  private var interruptionActive = false
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    main.post {
      if (monitoring) {
        when (change) {
          AudioManager.AUDIOFOCUS_LOSS,
          AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
          AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> focusLost = true
          AudioManager.AUDIOFOCUS_GAIN -> focusLost = false
        }
        publishInterruption()
      }
    }
  }
  override fun definition() = ModuleDefinition {
    Name("CallInterruption")
    Events("callInterruption")
    Function("startMonitoring") { main.post { startMonitoring() }; Unit }
    Function("stopMonitoring") { main.post { stopMonitoring() }; Unit }
    OnDestroy { main.post { stopMonitoring() } }
  }
  private fun startMonitoring() {
    if (monitoring) return
    val context = appContext.reactContext?.applicationContext ?: return
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    audioManager = manager
    monitoring = true
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        .setOnAudioFocusChangeListener(focusListener, main).build()
      focusRequest = request
      manager.requestAudioFocus(request)
    } else {
      manager.requestAudioFocus(focusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN)
    }
    // Phone state catches ringing, before some diallers take audio focus.
    if (context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
      val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
      val listener = object : PhoneStateListener() {
        override fun onCallStateChanged(state: Int, ignoredNumber: String?) {
          if (!monitoring) return
          val wasBusy = phoneBusy
          phoneBusy = state != TelephonyManager.CALL_STATE_IDLE
          // Telephony may report permanent focus loss, with no later GAIN.
          if (wasBusy && !phoneBusy) {
            focusLost = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) focusRequest?.let(manager::requestAudioFocus)
            else manager.requestAudioFocus(focusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN)
          }
          publishInterruption()
        }
      }
      try {
        telephony?.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
        phoneManager = telephony
        phoneListener = listener
      } catch (_: SecurityException) { /* Audio-focus fallback when phone access is unavailable. */ }
    }
  }
  private fun publishInterruption() {
    val active = phoneBusy || focusLost
    if (!monitoring || interruptionActive == active) return
    interruptionActive = active
    sendEvent("callInterruption", mapOf("type" to if (active) "began" else "ended"))
  }
  private fun stopMonitoring() {
    monitoring = false
    phoneListener?.let { phoneManager?.listen(it, PhoneStateListener.LISTEN_NONE) }
    phoneListener = null
    phoneManager = null
    audioManager?.let { manager ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) focusRequest?.let(manager::abandonAudioFocusRequest)
      else manager.abandonAudioFocus(focusListener)
    }
    focusRequest = null
    audioManager = null
    focusLost = false
    phoneBusy = false
    interruptionActive = false
  }
}
