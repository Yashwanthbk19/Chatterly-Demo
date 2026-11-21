package com.chatterlymobile.calls

import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
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
@Config(sdk = [33], application = Application::class)
class CallBackgroundServiceTest {
  private fun callIntent(context: Context, id: String = "call-164") =
      Intent(context, CallBackgroundService::class.java)
          .putExtra("callId", id).putExtra("type", "video").putExtra("contactName", "Ram")

  @Test fun `screen off retains the ongoing call notification hang-up action and CPU wake lock`() {
    val context = RuntimeEnvironment.getApplication()
    val controller = Robolectric.buildService(CallBackgroundService::class.java, callIntent(context)).create()
    val service = controller.get()
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    try {
      controller.startCommand(0, 1)
      assertEquals("call-164", CallBackgroundService.activeCallId)
      val lock = ShadowPowerManager.getLatestWakeLock()
      assertTrue(lock.isHeld)
      shadowOf(context.getSystemService(Context.POWER_SERVICE) as PowerManager).setIsInteractive(false)
      assertTrue(lock.isHeld)
      val notification = manager.activeNotifications.single { it.id == CallBackgroundService.NOTIFICATION_ID }.notification
      assertEquals(Notification.CATEGORY_CALL, notification.category)
      assertTrue(notification.flags and Notification.FLAG_ONGOING_EVENT != 0)
      assertEquals("Ram", notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString())
      val hangUp = notification.actions.single()
      assertEquals("Hang up", hangUp.title.toString())
      val intent = shadowOf(hangUp.actionIntent).savedIntent
      assertEquals(CallBackgroundService.HANG_UP, intent.action)
      assertEquals("call-164", intent.getStringExtra("callId"))
      service.onStartCommand(intent, 0, 2)
      // Keep media protected until the existing call handler confirms the end.
      assertEquals("call-164", CallBackgroundService.activeCallId)
      assertTrue(lock.isHeld)
      controller.destroy()
      assertFalse(lock.isHeld)
      assertNull(CallBackgroundService.activeCallId)
      assertTrue(manager.activeNotifications.none { it.id == CallBackgroundService.NOTIFICATION_ID })
    } finally {
      if (CallBackgroundService.activeCallId != null) controller.destroy()
    }
  }

  @Test fun `stale hang-up intents cannot end another call or restore a finished session`() {
    val context = RuntimeEnvironment.getApplication()
    val controller = Robolectric.buildService(CallBackgroundService::class.java, callIntent(context)).create()
    try {
      controller.startCommand(0, 1)
      controller.get().onStartCommand(callIntent(context, "old-call").setAction(CallBackgroundService.HANG_UP), 0, 2)
      assertEquals("call-164", CallBackgroundService.activeCallId)
    } finally { controller.destroy() }
    val stale = Robolectric.buildService(CallBackgroundService::class.java,
        callIntent(context).setAction(CallBackgroundService.HANG_UP)).create()
    try {
      stale.startCommand(0, 1)
      assertNull(CallBackgroundService.activeCallId)
      assertTrue(shadowOf(stale.get()).isStoppedBySelf)
    } finally { stale.destroy() }
  }
}
