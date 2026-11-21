package com.chatterlymobile.calls

import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.PowerManager
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowPowerManager

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33, 34], application = Application::class)
class CallAvailabilityServiceTest {
  private fun available(context: Context, userId: String = "user-167") =
      Intent(context, CallAvailabilityService::class.java).putExtra("userId", userId)

  @Test fun `signed-in availability survives screen lock without microphone camera or an active call`() {
    val context = RuntimeEnvironment.getApplication()
    val controller = Robolectric.buildService(CallAvailabilityService::class.java, available(context)).create()
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    try {
      controller.startCommand(0, 1)
      assertEquals("user-167", CallAvailabilityService.activeUserId)
      assertNull(CallBackgroundService.activeCallId)
      val lock = ShadowPowerManager.getLatestWakeLock()
      shadowOf(context.getSystemService(Context.POWER_SERVICE) as PowerManager).setIsInteractive(false)
      assertTrue(lock.isHeld)
      val notification = manager.activeNotifications.single { it.id == CallAvailabilityService.NOTIFICATION_ID }.notification
      assertTrue(notification.flags and Notification.FLAG_ONGOING_EVENT != 0)
      assertEquals("Incoming calls enabled", notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString())
      assertEquals(0, controller.get().foregroundServiceType and
          (ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA))
      controller.destroy()
      assertNull(CallAvailabilityService.activeUserId)
      assertFalse(lock.isHeld)
      assertTrue(manager.activeNotifications.none { it.id == CallAvailabilityService.NOTIFICATION_ID })
    } finally {
      if (CallAvailabilityService.activeUserId != null) controller.destroy()
    }
  }

  @Test fun `an empty restart cannot resurrect signed-out availability`() {
    val controller = Robolectric.buildService(CallAvailabilityService::class.java, Intent()).create()
    try {
      controller.startCommand(0, 1)
      assertNull(CallAvailabilityService.activeUserId)
      assertTrue(shadowOf(controller.get()).isStoppedBySelf)
    } finally { controller.destroy() }
  }

  @Test fun `a repeated start keeps a single notification and the same wake lock`() {
    val context = RuntimeEnvironment.getApplication()
    val controller = Robolectric.buildService(CallAvailabilityService::class.java, available(context)).create()
    try {
      controller.startCommand(0, 1)
      val lock = ShadowPowerManager.getLatestWakeLock()
      controller.get().onStartCommand(available(context), 0, 2)
      assertSame(lock, ShadowPowerManager.getLatestWakeLock())
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      assertEquals(1, manager.activeNotifications.count { it.id == CallAvailabilityService.NOTIFICATION_ID })
    } finally { controller.destroy() }
  }
}
