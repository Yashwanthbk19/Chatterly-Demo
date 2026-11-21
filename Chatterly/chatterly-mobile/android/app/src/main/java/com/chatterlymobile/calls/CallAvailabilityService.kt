package com.chatterlymobile.calls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.chatterlymobile.R
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.modules.core.DeviceEventManagerModule

/** Idle call signaling only: never opens the microphone or camera. */
class CallAvailabilityService : Service() {
  companion object {
    const val CHANNEL_ID = "call-availability"
    const val NOTIFICATION_ID = 167
    @Volatile var activeUserId: String? = null
      private set
  }

  private var userId: String? = null
  private var taskContext: ReactContext? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  private fun stopped(id: String) {
    taskContext?.takeIf { it.hasActiveReactInstance() }
        ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("chatterly.callAvailabilityStopped", Arguments.createMap().apply { putString("userId", id) })
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val id = intent?.getStringExtra("userId")?.takeIf { it.isNotBlank() }
    if (id == null) {
      if (userId == null) stopSelf()
      return START_NOT_STICKY
    }
    try {
      val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Incoming call availability", NotificationManager.IMPORTANCE_LOW))
      }
      val launch = packageManager.getLaunchIntentForPackage(packageName)
      val notification = NotificationCompat.Builder(this, CHANNEL_ID)
          .setSmallIcon(R.drawable.ic_chat_bubble)
          .setContentTitle("Chatterly")
          .setContentText("Incoming calls enabled")
          .setOngoing(true).setAutoCancel(false).setOnlyAlertOnce(true)
          .setCategory(NotificationCompat.CATEGORY_SERVICE)
          .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
          .apply {
            if (launch != null) setContentIntent(PendingIntent.getActivity(this@CallAvailabilityService, 167, launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
          }.build()
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
      ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)

      if (userId != id) {
        userId?.let(::stopped)
        userId = id
        activeUserId = id
        taskContext = (application as? ReactApplication)?.reactHost?.currentReactContext
        taskContext?.let { context ->
          HeadlessJsTaskContext.getInstance(context).startTask(HeadlessJsTaskConfig(
              "ChatterlyCallAvailability", Arguments.createMap().apply { putString("userId", id) }, 0, true))
        }
      }
      if (wakeLock == null) {
        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Chatterly:call-availability").apply {
              setReferenceCounted(false)
              @Suppress("WakelockTimeout")
              acquire()
            }
        @Suppress("DEPRECATION")
        wifiLock = (applicationContext.getSystemService(WIFI_SERVICE) as WifiManager)
            .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Chatterly:call-availability").apply {
              setReferenceCounted(false)
              acquire()
            }
      }
      CallAvailabilityModule.completed(id)
    } catch (error: Exception) {
      CallAvailabilityModule.completed(id, error)
      stopSelf()
    }
    // Do not resurrect an account or claim it is online after its process ends.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    userId?.let(::stopped)
    if (activeUserId == userId) activeUserId = null
    userId = null
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
