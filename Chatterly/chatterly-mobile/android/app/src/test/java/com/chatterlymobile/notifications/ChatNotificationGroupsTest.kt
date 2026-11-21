package com.chatterlymobile.notifications

import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.os.Bundle
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.notifications.model.Notification as ExpoNotification
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.model.RemoteNotificationContent
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.notifications.model.triggers.FirebaseNotificationTrigger
import expo.modules.notifications.service.NotificationsService
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.Date

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class ChatNotificationGroupsTest {
  private lateinit var context: Context
  private lateinit var manager: NotificationManager
  private lateinit var presenter: ChatNotificationGroups

  @Before fun setUp() {
    context = RuntimeEnvironment.getApplication()
    manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancelAll()
    context.deleteDatabase("RKStorage")
    presenter = ChatNotificationGroups(context)
  }

  private fun message(id: String, chatId: String, body: String = id, values: Map<String, String> = emptyMap()): ExpoNotification {
    val remote = RemoteMessage(Bundle().apply {
      putString("google.message_id", id)
      putString("gcm.n.e", "1")
      putString("gcm.n.title", "Rahul")
      putString("gcm.n.body", body)
      putString("chatId", chatId)
      values.forEach { (key, value) -> putString(key, value) }
    })
    return ExpoNotification(NotificationRequest(id, RemoteNotificationContent(remote),
        FirebaseNotificationTrigger(remote)), Date())
  }

  private fun awaitCount(count: Int) = runBlocking {
    withTimeout(10000) {
      while (manager.activeNotifications.size != count) { delay(25) }
    }
  }

  @Test fun disabledPreviewHidesMessageTextInBackground() {
    saveSettings("{\"popupPreview\":false}")
    presenter.presentNotification(message("private", "chat", "Secret message"), null)
    awaitCount(1)
    val posted = manager.activeNotifications.single().notification
    assertEquals("New message", posted.extras.getCharSequence(Notification.EXTRA_TEXT).toString())
    assertEquals("messages-tone-v1-incoming_call-no-preview", posted.channelId)
    assertEquals(NotificationManager.IMPORTANCE_DEFAULT,
        manager.getNotificationChannel(posted.channelId).importance)
    assertTrue(manager.getNotificationChannel(posted.channelId).sound.toString().endsWith("/raw/incoming_call"))
  }

  private fun saveSettings(value: String) {
    context.openOrCreateDatabase("RKStorage", Context.MODE_PRIVATE, null).use { db ->
      db.execSQL("CREATE TABLE IF NOT EXISTS catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT)")
      db.execSQL("INSERT OR REPLACE INTO catalystLocalStorage VALUES (?, ?)",
          arrayOf("chatterly.notification-preferences.v1", value))
    }
  }

  @Test fun `saved tones sound for background pushes without a sound field`() {
    val tones = mapOf("Default" to "incoming_call", "Chime" to "incoming_call_chime",
        "Bell" to "incoming_call_bell", "Pop" to "incoming_call_pop")
    tones.entries.forEachIndexed { index, (tone, resource) ->
      saveSettings("{\"notificationTone\":\"$tone\"}")
      presenter.presentNotification(message("tone-$tone", "chat-$tone"), null)
      awaitCount(index + 1)
      val posted = manager.activeNotifications.single { it.tag == "tone-$tone" }.notification
      val channel = manager.getNotificationChannel(posted.channelId)
      assertEquals("android.resource://${context.packageName}/raw/$resource", channel.sound.toString())
      assertEquals(NotificationCompat.GROUP_ALERT_CHILDREN, posted.groupAlertBehavior)
      assertTrue(context.resources.getIdentifier(resource, "raw", context.packageName) != 0)
    }
  }

  @Test fun `changing the tone selects a new channel rather than reusing an immutable sound`() {
    saveSettings("{\"notificationTone\":\"Chime\"}")
    presenter.presentNotification(message("first-tone", "chat-1"), null)
    awaitCount(1)
    val first = manager.activeNotifications.single().notification.channelId
    saveSettings("{\"notificationTone\":\"Bell\"}")
    presenter.presentNotification(message("second-tone", "chat-2"), null)
    awaitCount(2)
    val second = manager.activeNotifications.single { it.tag == "second-tone" }.notification.channelId
    assertNotEquals(first, second)
    assertTrue(manager.getNotificationChannel(first).sound.toString().endsWith("incoming_call_chime"))
    assertTrue(manager.getNotificationChannel(second).sound.toString().endsWith("incoming_call_bell"))
  }

  @Test fun `sound off preserves the selected vibration pattern`() {
    saveSettings("{\"soundEnabled\":false,\"messageVibration\":\"Medium\"}")
    presenter.presentNotification(message("vibrate-only", "chat"), null)
    awaitCount(1)
    val channel = manager.getNotificationChannel(manager.activeNotifications.single().notification.channelId)
    assertNull(channel.sound)
    assertTrue(channel.shouldVibrate())
    assertArrayEquals(longArrayOf(0, 250, 120, 250), channel.vibrationPattern)
  }

  @Test fun `all message vibration patterns work in foreground and background with or without sound`() {
    val patterns = mapOf("Short" to longArrayOf(0, 150), "Medium" to longArrayOf(0, 250, 120, 250),
        "Long" to longArrayOf(0, 500, 180, 500))
    var count = 0
    for (soundEnabled in listOf(true, false)) {
      for (foreground in listOf(true, false)) {
        for ((mode, pattern) in patterns) {
          val id = "vibration-$mode-$foreground-$soundEnabled"
          saveSettings("{\"vibrationEnabled\":true,\"messageVibration\":\"$mode\",\"soundEnabled\":$soundEnabled}")
          val behavior = if (foreground) NotificationBehaviorRecord(shouldShowList = true, shouldPlaySound = soundEnabled) else null
          presenter.presentNotification(message(id, id), behavior)
          awaitCount(++count)
          val posted = manager.activeNotifications.single { it.tag == id }.notification
          val channel = manager.getNotificationChannel(posted.channelId)
          assertTrue(channel.shouldVibrate())
          assertArrayEquals(pattern, channel.vibrationPattern)
          assertEquals("Alert behavior for $id", NotificationCompat.GROUP_ALERT_CHILDREN, posted.groupAlertBehavior)
          assertEquals(soundEnabled, channel.sound != null)
        }
      }
    }
  }

  @Test fun `off and disabled message notifications suppress vibration`() {
    listOf("{\"vibrationEnabled\":false,\"messageVibration\":\"Medium\"}",
        "{\"vibrationEnabled\":true,\"messageVibration\":\"Turned Off\"}",
        "{\"notifications\":false,\"vibrationEnabled\":true,\"messageVibration\":\"Medium\"}",
        "{\"messageNotifications\":false,\"vibrationEnabled\":true,\"messageVibration\":\"Medium\"}")
        .forEachIndexed { index, settings ->
          saveSettings(settings)
          presenter.presentNotification(message("vibration-off-$index", "chat-$index"), null)
          awaitCount(index + 1)
          val posted = manager.activeNotifications.single { it.tag == "vibration-off-$index" }.notification
          assertFalse(manager.getNotificationChannel(posted.channelId).shouldVibrate())
        }
  }

  @Test fun `changing vibration patterns uses channels with the new pattern`() {
    var previousChannel: String? = null
    listOf("Short", "Medium", "Long", "Turned Off").forEachIndexed { index, mode ->
      saveSettings("{\"vibrationEnabled\":true,\"messageVibration\":\"$mode\",\"popupPreview\":false}")
      presenter.presentNotification(message("pattern-$index", "chat-$index"), null)
      awaitCount(index + 1)
      val channelId = manager.activeNotifications.single { it.tag == "pattern-$index" }.notification.channelId
      assertNotEquals(previousChannel, channelId)
      assertEquals(mode != "Turned Off", manager.getNotificationChannel(channelId).shouldVibrate())
      assertEquals(NotificationManager.IMPORTANCE_DEFAULT, manager.getNotificationChannel(channelId).importance)
      previousChannel = channelId
    }
  }

  @Test fun `disabled notification settings never play a message sound`() {
    listOf("notifications", "messageNotifications", "soundEnabled").forEachIndexed { index, setting ->
      saveSettings("{\"$setting\":false}")
      presenter.presentNotification(message("disabled-$setting", "chat-$setting"), null)
      awaitCount(index + 1)
      val posted = manager.activeNotifications.single { it.tag == "disabled-$setting" }.notification
      assertNull(manager.getNotificationChannel(posted.channelId).sound)
    }
  }

  @Test fun `disabled group notifications do not play the direct message tone`() {
    saveSettings("{\"groupNotifications\":false,\"notificationTone\":\"Bell\"}")
    presenter.presentNotification(message("group-disabled", "chat", values = mapOf("type" to "group_message", "groupId" to "group")), null)
    awaitCount(1)
    assertNull(manager.getNotificationChannel(manager.activeNotifications.single().notification.channelId).sound)
  }

  @Test fun `foreground messages use the saved tone when the JS handler permits sound`() {
    saveSettings("{\"notificationTone\":\"Pop\"}")
    presenter.presentNotification(message("foreground-tone", "chat"),
        NotificationBehaviorRecord(shouldShowList = true, shouldPlaySound = true))
    awaitCount(1)
    assertTrue(manager.getNotificationChannel(manager.activeNotifications.single().notification.channelId)
        .sound.toString().endsWith("incoming_call_pop"))
  }

  @Test fun `foreground handler can suppress notification sound`() {
    presenter.presentNotification(message("foreground-silent", "chat"),
        NotificationBehaviorRecord(shouldShowList = true, shouldPlaySound = false))
    awaitCount(1)
    assertNull(manager.getNotificationChannel(manager.activeNotifications.single().notification.channelId).sound)
  }

  private fun summaries() = manager.activeNotifications.filter {
    it.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0
  }

  @Test fun `multiple messages keep distinct children and a summary with the same chat tap action`() {
    presenter.presentNotification(message("push-1", "chat-1", "Hello"), null)
    awaitCount(1)
    presenter.presentNotification(message("push-2", "chat-1", "See you soon"), null)
    awaitCount(3)

    val summary = summaries().single().notification
    val latest = manager.activeNotifications.single { it.tag == "push-2" }.notification
    val summaryIntent = shadowOf(summary.contentIntent).savedIntent
    assertEquals(shadowOf(latest.contentIntent).savedIntent.data, summaryIntent.data)
    val response = NotificationsService.getNotificationResponseFromBroadcastIntent(summaryIntent)
    val trigger = response.notification.notificationRequest.trigger as FirebaseNotificationTrigger
    assertEquals("chat-1", trigger.remoteMessage.data["chatId"])
    assertEquals("2 new messages", summary.extras.getCharSequence(Notification.EXTRA_TEXT).toString())
    assertEquals(setOf("Hello", "See you soon"),
        summary.extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES).orEmpty().map { it.toString() }.toSet())
    assertEquals(2, presenter.getAllPresentedNotifications().size)
  }

  @Test fun `conversations with the same display name remain in different groups`() {
    presenter.presentNotification(message("push-1", "chat-1"), null)
    awaitCount(1)
    presenter.presentNotification(message("push-2", "chat-2"), null)
    awaitCount(2)
    assertEquals(0, summaries().size)
    assertEquals(2, manager.activeNotifications.map { it.notification.group }.distinct().size)
  }

  @Test fun `reading a chat removes its summary and preserves other conversation alerts`() {
    presenter.presentNotification(message("push-1", "chat-1"), null)
    awaitCount(1)
    presenter.presentNotification(message("push-2", "chat-1"), null)
    awaitCount(3)
    presenter.presentNotification(message("push-3", "chat-2"), null)
    awaitCount(4)
    presenter.dismissNotifications(listOf("push-1", "push-2"))
    assertEquals(listOf("push-3"), manager.activeNotifications.map { it.tag })
  }

  @Test fun `updating an existing push identifier never creates a second child`() {
    presenter.presentNotification(message("push-1", "chat-1"), null)
    awaitCount(1)
    presenter.presentNotification(message("push-1", "chat-1", "Updated"), null)
    runBlocking {
      withTimeout(10000) {
        while (manager.activeNotifications.single().notification.extras
            .getCharSequence(Notification.EXTRA_TEXT).toString() != "Updated") { delay(25) }
      }
    }
    assertEquals(0, summaries().size)
  }

  @Test fun `reads the sender profile image URL and falls back when it is absent`() {
    assertEquals("https://cdn.example/rahul.jpg", ChatNotificationGroups.senderProfilePic(mapOf(
        "senderProfilePic" to "https://cdn.example/rahul.jpg")))
    assertEquals("https://cdn.example/fallback.jpg", ChatNotificationGroups.senderProfilePic(mapOf(
        "profilePic" to "https://cdn.example/fallback.jpg")))
    assertEquals("https://cdn.example/caller.jpg", ChatNotificationGroups.senderProfilePic(mapOf(
        "callerProfilePicture" to "https://cdn.example/caller.jpg")))
    assertNull(ChatNotificationGroups.senderProfilePic(emptyMap()))
  }

  private fun incomingCall(id: String): ExpoNotification {
    val remote = RemoteMessage(Bundle().apply {
      putString("google.message_id", id)
      putString("gcm.n.e", "1")
      putString("gcm.n.title", "Ananya")
      putString("gcm.n.body", "video call")
      putString("type", "incoming_call")
      putString("callId", "call-$id")
      putString("callerId", "caller-2")
      putString("callType", "video")
    })
    return ExpoNotification(NotificationRequest(id, RemoteNotificationContent(remote),
        FirebaseNotificationTrigger(remote)), Date())
  }

  @Test
  @Config(sdk = [30, 33])
  fun `incoming video calls have distinct accept and reject actions with the original call payload`() {
    presenter.presentNotification(incomingCall("video-1"), null)
    awaitCount(1)
    val call = manager.activeNotifications.single().notification
    assertEquals(Notification.CATEGORY_CALL, call.category)
    assertEquals("incoming-calls-v1", call.channelId)
    assertEquals(NotificationManager.IMPORTANCE_HIGH, manager.getNotificationChannel(call.channelId).importance)
    assertEquals(Notification.VISIBILITY_PUBLIC, call.visibility)
    assertNotNull(call.fullScreenIntent)
    assertEquals(IncomingCallActivity::class.java.name, shadowOf(call.fullScreenIntent).savedIntent.component?.className)
    assertNotNull(call.getLargeIcon())
    assertEquals(listOf("Accept", "Reject"), call.actions.map { it.title.toString() })
    assertNotEquals(call.actions[0].actionIntent, call.actions[1].actionIntent)
    assertNotEquals(call.contentIntent, call.actions[0].actionIntent)
    call.actions.forEachIndexed { index, action ->
      val intent = shadowOf(action.actionIntent).savedIntent
      val response = NotificationsService.getNotificationResponseFromBroadcastIntent(intent)
      assertEquals(if (index == 0) "accept_call" else "reject_call", response.actionIdentifier)
      assertTrue(response.action.opensAppToForeground())
      val trigger = response.notification.notificationRequest.trigger as FirebaseNotificationTrigger
      assertEquals("call-video-1", trigger.remoteMessage.data["callId"])
      assertEquals("video", trigger.remoteMessage.data["callType"])
    }
    assertNull(call.group)
    assertEquals(1, presenter.getAllPresentedNotifications().size)
  }

  @Test fun `incoming call detection excludes missed calls messages and incomplete payloads`() {
    val data = mapOf("type" to "incoming_call", "callId" to "call-1", "callerId" to "caller-2")
    assertTrue(ChatNotificationGroups.isIncomingCall(data))
    assertFalse(ChatNotificationGroups.isIncomingCall(data + ("type" to "missed_call")))
    assertFalse(ChatNotificationGroups.isIncomingCall(data - "callerId"))
    assertFalse(ChatNotificationGroups.isIncomingCall(mapOf("chatId" to "chat-1")))
    assertFalse(ChatNotificationGroups.isMessage(data))
  }

  @Test fun `foreground list-only call notifications retain both actions`() {
    presenter.presentNotification(incomingCall("video-foreground"),
        NotificationBehaviorRecord(shouldShowBanner = false, shouldShowList = true))
    awaitCount(1)
    assertEquals(listOf("Accept", "Reject"),
        manager.activeNotifications.single().notification.actions.map { it.title.toString() })
  }

  @Test fun `disabled call alerts are not presented`() {
    presenter.presentNotification(incomingCall("video-disabled"), NotificationBehaviorRecord())
    assertEquals(0, manager.activeNotifications.size)
  }
}
