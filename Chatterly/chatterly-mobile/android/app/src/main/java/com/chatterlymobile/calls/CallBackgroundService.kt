package com.chatterlymobile.calls

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.chatterlymobile.R
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.modules.core.DeviceEventManagerModule

/** Owns background execution only while WebRTC owns an active direct call. */
class CallBackgroundService : Service() {
  companion object {
    const val HANG_UP = "com.chatterlymobile.HANG_UP_CALL"
    const val CHANNEL_ID = "ongoing-calls"
    const val NOTIFICATION_ID = 164
    @Volatile var activeCallId: String? = null
      private set
  }

  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null
  private var callId: String? = null
  private var startedAt = 0L
  private var taskContext: ReactContext? = null

  private fun reactContext(): ReactContext? =
      (application as? ReactApplication)?.reactHost?.currentReactContext

  private fun emit(name: String, id: String) {
    val context = taskContext ?: reactContext() ?: return
    if (!context.hasActiveReactInstance()) return
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(name, Arguments.createMap().apply { putString("callId", id) })
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    return try {
      handleCommand(intent)
    } catch (error: Exception) {
      intent?.getStringExtra("callId")?.let { CallBackgroundModule.failed(it, error) }
      stopSelf()
      START_NOT_STICKY
    }
  }

  private fun handleCommand(intent: Intent?): Int {
    val id = intent?.getStringExtra("callId")?.takeIf { it.isNotBlank() }
    if (intent?.action == HANG_UP) {
      if (id != null && id == callId) emit("chatterly.callBackgroundEnd", id)
      if (callId == null) stopSelf()
      return START_NOT_STICKY
    }
    if (id == null) {
      if (callId == null) stopSelf()
      return START_NOT_STICKY
    }
    if (callId != null && callId != id) {
      emit("chatterly.callBackgroundStopped", callId!!)
      taskContext = null
    }
    val newCall = callId != id
    callId = id
    activeCallId = id
    if (newCall) startedAt = System.currentTimeMillis()
    val video = intent?.getStringExtra("type") == "video"
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Ongoing calls", NotificationManager.IMPORTANCE_LOW))
    }
    val endIntent = Intent(this, CallBackgroundService::class.java).apply {
      action = HANG_UP
      data = Uri.Builder().scheme("chatterly-call").authority("end").appendPath(id).build()
      putExtra("callId", id)
    }
    val end = PendingIntent.getService(this, 0, endIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_chat_bubble)
        .setContentTitle(intent?.getStringExtra("contactName") ?: "Chatterly")
        .setContentText(if (video) "Ongoing video call" else "Ongoing voice call")
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        .setOngoing(true).setAutoCancel(false).setOnlyAlertOnce(true)
        .setWhen(startedAt).setUsesChronometer(true)
        .addAction(NotificationCompat.Action.Builder(0, "Hang up", end).build())
        .apply {
          if (launch != null) setContentIntent(PendingIntent.getActivity(this@CallBackgroundService, 0, launch,
              PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }.build()
    var types = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && video &&
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
      types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
    }
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, types)
    if (wakeLock == null) {
      wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
          .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Chatterly:active-call").apply {
            setReferenceCounted(false)
            @Suppress("WakelockTimeout")
            acquire()
          }
      @Suppress("DEPRECATION")
      wifiLock = (applicationContext.getSystemService(WIFI_SERVICE) as WifiManager)
          .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Chatterly:active-call").apply {
            setReferenceCounted(false)
            acquire()
          }
    }
    if (newCall) {
      taskContext = reactContext()
      taskContext?.let { context ->
        HeadlessJsTaskContext.getInstance(context).startTask(HeadlessJsTaskConfig(
            "ChatterlyActiveCall", Arguments.createMap().apply { putString("callId", id) }, 0, true))
      }
    }
    CallBackgroundModule.started(id)
    // A killed WebRTC session cannot be restored by restarting an empty service.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    callId?.let { emit("chatterly.callBackgroundStopped", it) }
    if (activeCallId == callId) activeCallId = null
    callId = null
    taskContext = null
    wifiLock?.let { if (it.isHeld) it.release() }
    wakeLock?.let { if (it.isHeld) it.release() }
    wifiLock = null
    wakeLock = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
