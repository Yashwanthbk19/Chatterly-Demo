package com.chatterlymobile.calls

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CallAvailabilityModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  companion object {
    private val starts = mutableMapOf<String, MutableList<Promise>>()

    fun completed(userId: String, error: Exception? = null) {
      val promises = synchronized(starts) { starts.remove(userId)?.toList().orEmpty() }
      promises.forEach { promise ->
        if (error == null) promise.resolve(null)
        else promise.reject("CALL_AVAILABILITY_START", "Unable to maintain incoming call availability", error)
      }
    }
  }

  override fun getName() = "CallAvailability"

  @ReactMethod
  fun start(userId: String, promise: Promise) {
    if (userId.isBlank()) {
      promise.reject("CALL_AVAILABILITY_USER", "An authenticated user is required")
      return
    }
    synchronized(starts) { starts.getOrPut(userId) { mutableListOf() }.add(promise) }
    try {
      ContextCompat.startForegroundService(reactApplicationContext,
          Intent(reactApplicationContext, CallAvailabilityService::class.java).putExtra("userId", userId))
    } catch (error: Exception) { completed(userId, error) }
  }

  @ReactMethod
  fun stop(userId: String, promise: Promise) {
    if (CallAvailabilityService.activeUserId == userId) {
      reactApplicationContext.stopService(Intent(reactApplicationContext, CallAvailabilityService::class.java))
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun isActive(userId: String, promise: Promise) {
    promise.resolve(CallAvailabilityService.activeUserId == userId)
  }

  override fun invalidate() {
    reactApplicationContext.stopService(Intent(reactApplicationContext, CallAvailabilityService::class.java))
    synchronized(starts) { starts.keys.toList() }.forEach {
      completed(it, IllegalStateException("Call availability runtime stopped"))
    }
    super.invalidate()
  }
}
