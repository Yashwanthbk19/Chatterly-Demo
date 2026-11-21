package com.chatterlymobile.calls

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.util.concurrent.ConcurrentHashMap

class CallBackgroundModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  companion object {
    private val starts = ConcurrentHashMap<String, Promise>()
    fun started(callId: String) { starts.remove(callId)?.resolve(null) }
    fun failed(callId: String, error: Exception) {
      starts.remove(callId)?.reject("CALL_BACKGROUND_START", "Unable to keep this call active in the background", error)
    }
  }
  override fun getName() = "CallBackground"

  @ReactMethod
  fun start(callId: String, type: String, contactName: String, promise: Promise) {
    try {
      require(callId.isNotBlank()) { "A call id is required" }
      starts[callId] = promise
      val intent = Intent(reactApplicationContext, CallBackgroundService::class.java)
          .putExtra("callId", callId).putExtra("type", type).putExtra("contactName", contactName)
      ContextCompat.startForegroundService(reactApplicationContext, intent)
    } catch (error: Exception) {
      starts.remove(callId)
      promise.reject("CALL_BACKGROUND_START", "Unable to keep this call active in the background", error)
    }
  }

  @ReactMethod
  fun stop(callId: String, promise: Promise) {
    // Stale cleanup from a previous call must never stop the current call.
    if (CallBackgroundService.activeCallId == callId) {
      reactApplicationContext.stopService(Intent(reactApplicationContext, CallBackgroundService::class.java))
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun isActive(callId: String, promise: Promise) {
    promise.resolve(CallBackgroundService.activeCallId == callId)
  }

  override fun invalidate() {
    reactApplicationContext.stopService(Intent(reactApplicationContext, CallBackgroundService::class.java))
    starts.keys.toList().forEach { failed(it, IllegalStateException("Call runtime stopped")) }
    super.invalidate()
  }
}

class CallBackgroundPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
      listOf(CallBackgroundModule(context), CallAvailabilityModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
