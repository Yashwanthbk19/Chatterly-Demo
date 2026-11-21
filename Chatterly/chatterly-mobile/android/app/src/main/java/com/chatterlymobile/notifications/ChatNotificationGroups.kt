package com.chatterlymobile.notifications

import android.app.Notification
import android.app.NotificationManager
import android.app.NotificationChannel
import android.database.sqlite.SQLiteDatabase
import android.media.AudioAttributes
import android.os.Build
import org.json.JSONObject
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.chatterlymobile.R
import expo.modules.notifications.notifications.NotificationSerializer
import expo.modules.notifications.notifications.model.Notification as ExpoNotification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.notifications.model.NotificationAction
import expo.modules.notifications.notifications.model.triggers.FirebaseNotificationTrigger
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.Locale
import java.net.HttpURLConnection
import java.net.URL

/** Keep distinct messages and a tappable summary for each conversation. */
class ChatNotificationGroups(context: Context) : ExpoPresentationDelegate(context) {
  companion object {
    private const val PREFIX = "chatterly.messages:"
    private const val SUMMARY_ID = 44
    private const val SUMMARY_PREFIX = "chatterly.summary:"
    private const val GROUP_EXTRA = "chatterly.group"
    private val mutex = Mutex()

    fun isMessage(data: Map<String, String>): Boolean {
      val kind = (data["type"] ?: data["notificationType"] ?: data["kind"] ?: "")
          .lowercase(Locale.ROOT).replace('-', '_')
      return kind in setOf("", "message", "chat_message", "group_message") &&
          data["callId"].isNullOrEmpty() && data["groupCallId"].isNullOrEmpty()
    }

    fun isIncomingCall(data: Map<String, String>): Boolean =
        (data["type"] ?: data["notificationType"] ?: data["kind"] ?: "")
            .lowercase(Locale.ROOT).replace('-', '_') == "incoming_call" &&
            !data["callId"].isNullOrBlank() &&
            !data["callerId"].isNullOrBlank()

    internal fun senderProfilePic(data: Map<String, String>): String? =
        listOf(
            "senderProfilePic", "senderProfilePicture",
            "callerProfilePic", "callerProfilePicture",
            "profilePic", "profilePicture", "avatar", "photoURL", "photoUrl"
        )
            .asSequence()
            .mapNotNull { data[it]?.trim()?.takeIf(String::isNotEmpty) }
            .firstOrNull()

    private fun deleteIntent(context: Context, group: String, summary: Boolean): PendingIntent {
      val intent = Intent(context, ChatNotificationDismissReceiver::class.java).apply {
        data = Uri.parse("chatterly-notification://dismiss").buildUpon()
            .appendQueryParameter("group", group).appendQueryParameter("summary", summary.toString()).build()
        putExtra(GROUP_EXTRA, group)
        putExtra("summary", summary)
      }
      return PendingIntent.getBroadcast(context, 0, intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun refreshSummary(context: Context, group: String, newest: Notification? = null) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val children = manager.activeNotifications.filter {
        it.notification.group == group && it.notification.flags and Notification.FLAG_GROUP_SUMMARY == 0
      }.sortedBy { it.postTime }
      val compat = NotificationManagerCompat.from(context)
      if (children.size < 2) {
        compat.cancel(SUMMARY_PREFIX + group, SUMMARY_ID)
        return
      }
      val latest = newest ?: children.last().notification
      val title = latest.extras.getCharSequence(Notification.EXTRA_TITLE)
      val inbox = NotificationCompat.InboxStyle().setBigContentTitle(title)
          .setSummaryText("${children.size} new messages")
      children.takeLast(7).forEach {
        inbox.addLine(it.notification.extras.getCharSequence(Notification.EXTRA_TEXT) ?: "Message")
      }
      // Copying the child preserves Expo's response PendingIntent and original
      // chat data. A summary tap therefore opens this conversation after a
      // cold start as well as while the app is already running.
      val summary = NotificationCompat.Builder(context, latest)
          .setContentTitle(title).setContentText("${children.size} new messages")
          .setStyle(inbox).setNumber(children.size).setGroup(group).setGroupSummary(true)
          .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
          .setSilent(true).setOnlyAlertOnce(true).setAutoCancel(true)
          .setDeleteIntent(deleteIntent(context, group, true)).build()
      compat.notify(SUMMARY_PREFIX + group, SUMMARY_ID, summary)
    }

    suspend fun dismissed(context: Context, intent: Intent) {
      val group = intent.getStringExtra(GROUP_EXTRA) ?: return
      mutex.withLock {
        if (intent.getBooleanExtra("summary", false)) {
          val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
          manager.activeNotifications.filter { it.notification.group == group }.forEach {
            NotificationManagerCompat.from(context).cancel(it.tag, it.id)
          }
        } else {
          refreshSummary(context, group)
        }
      }
    }
  }

  private fun cachedAvatar(data: Map<String, String>, title: String?): String? = runCatching {
    val path = context.getDatabasePath("RKStorage")
    if (!path.exists()) return@runCatching null
    SQLiteDatabase.openDatabase(path.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
      db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?",
          arrayOf("chatterly.notification-avatars.v1")).use { cursor ->
        if (!cursor.moveToFirst()) return@runCatching null
        val avatars = JSONObject(cursor.getString(0))
        val ids = listOf("senderId", "callerId", "contactId")
            .mapNotNull { data[it]?.trim()?.takeIf(String::isNotEmpty) }
        ids.asSequence().map { avatars.optString("id:$it") }
            .firstOrNull { it.isNotBlank() }?.let { return@runCatching it }
        val names = listOf(data["senderName"], data["callerName"], title)
            .mapNotNull { it?.trim()?.lowercase(Locale.ROOT)?.takeIf(String::isNotEmpty) }
        names.asSequence().map { avatars.optString("name:$it") }
            .firstOrNull { it.isNotBlank() }
      }
    }
  }.getOrNull()

  private fun notificationAvatar(data: Map<String, String>, title: String?): Bitmap? {
    val remote = (senderProfilePic(data) ?: cachedAvatar(data, title))?.let { url ->
      runCatching {
        (URL(url).openConnection() as HttpURLConnection).run {
          connectTimeout = 4000
          readTimeout = 4000
          instanceFollowRedirects = true
          inputStream.use(BitmapFactory::decodeStream)
        }
      }.getOrNull()
    }
    return remote ?: BitmapFactory.decodeResource(context.resources, R.mipmap.ic_launcher_foreground)
  }

  // Background FCM presentation runs without the JavaScript notification handler.
  // Read the same persisted preference used by the settings screen.
  private fun notificationSettings(): JSONObject = runCatching {
    val path = context.getDatabasePath("RKStorage")
    if (!path.exists()) return@runCatching JSONObject()
    SQLiteDatabase.openDatabase(path.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
      db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?",
          arrayOf("chatterly.notification-preferences.v1")).use { cursor ->
        if (cursor.moveToFirst()) JSONObject(cursor.getString(0)) else JSONObject()
      }
    }
  }.getOrElse { JSONObject() }

  private fun hidePreview(original: Notification): Notification {
    val builder = NotificationCompat.Builder(context, original)
        .setContentText("New message").setStyle(NotificationCompat.BigTextStyle().bigText("New message"))
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
    return builder.build()
  }

  private fun vibrationPattern(settings: JSONObject, key: String): LongArray? {
    if (!settings.optBoolean("vibrationEnabled", true)) return null
    return when (settings.optString(key, "Turned Off")) {
      "Short" -> longArrayOf(0, 150)
      "Medium" -> longArrayOf(0, 250, 120, 250)
      "Long" -> longArrayOf(0, 500, 180, 500)
      else -> null
    }
  }

  private fun applyMessageSound(
      original: Notification,
      settings: JSONObject,
      values: Map<String, String>,
      behavior: NotificationBehaviorRecord?
  ): Notification {
    val groupMessage = !values["groupId"].isNullOrBlank() ||
        !values["groupName"].isNullOrBlank() || values["type"] == "group_message"
    val enabled = settings.optBoolean("notifications", true) &&
        settings.optBoolean(if (groupMessage) "groupNotifications" else "messageNotifications", true)
    val soundEnabled = enabled && settings.optBoolean("soundEnabled", true) && behavior?.shouldPlaySound != false
    val vibration = if (enabled && settings.optBoolean("vibrationEnabled", true))
      settings.optString(if (groupMessage) "groupVibration" else "messageVibration", "Turned Off") else "Turned Off"
    // Foreground JS owns vibration for both socket and push receipts, with
    // shared deduplication. Keep native vibration for background delivery.
    val vibrationPattern = if (enabled && behavior == null) vibrationPattern(settings,
        if (groupMessage) "groupVibration" else "messageVibration") else null
    val tone = when (settings.optString("notificationTone", "Default")) {
      "Chime" -> "incoming_call_chime"
      "Bell" -> "incoming_call_bell"
      "Pop" -> "incoming_call_pop"
      else -> "incoming_call"
    }
    val sound = Uri.parse("android.resource://${context.packageName}/raw/$tone")
    val preview = settings.optBoolean("popupPreview", true)
    val builder = NotificationCompat.Builder(context, original)
        // Pushes without a sound field were marked silent by Expo's builder.
        // The receiver's saved preference determines the message sound.
        .setDefaults(0)
        .setSilent(!soundEnabled && vibrationPattern == null)
        .setSound(if (soundEnabled) sound else null)
        .setVibrate(vibrationPattern)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Android channel sounds are immutable. Give each tone/preview choice a
      // stable channel so changing the saved tone also works on existing installs.
      val channelId = "messages-tone-v1-${if (soundEnabled) tone else "silent"}-${if (preview) "preview" else "no-preview"}" +
          if (vibrationPattern != null) "-${vibration.lowercase(Locale.ROOT)}" else ""
      val channel = NotificationChannel(channelId,
          if (preview) "Messages (${settings.optString("notificationTone", "Default")})"
          else "Messages without previews (${settings.optString("notificationTone", "Default")})",
          if (preview) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT)
      channel.lockscreenVisibility = Notification.VISIBILITY_PRIVATE
      channel.setSound(if (soundEnabled) sound else null, AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
      channel.vibrationPattern = vibrationPattern
      channel.enableVibration(vibrationPattern != null)
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(channel)
      builder.setChannelId(channelId)
    }
    return builder.build()
  }

  override fun presentNotification(notification: ExpoNotification, behavior: NotificationBehaviorRecord?) {
    val request = notification.notificationRequest
    val data = NotificationSerializer.toBundle(request).getBundle("content")?.getBundle("data")
    val values = data?.keySet()?.associateWith { data.getString(it) ?: "" } ?: emptyMap()
    if (isIncomingCall(values) &&
        behavior?.shouldPresentAlert != false) {
      val settings = notificationSettings()
      if (!settings.optBoolean("notifications", true) || !settings.optBoolean("callNotifications", true)) return
      CoroutineScope(Dispatchers.IO).launch {
        val original = super.createNotification(notification, behavior)
        // Use Expo's response intents so each action retains the call payload
        // and is delivered after a cold start as well as to a running app.
        val accept = NotificationsService.createNotificationResponseIntent(context, notification,
            NotificationAction("accept_call", "Accept", true))
        val reject = NotificationsService.createNotificationResponseIntent(context, notification,
            NotificationAction("reject_call", "Reject", true))
        val soundEnabled = settings.optBoolean("soundEnabled", true) && settings.optBoolean("callRingtone", true)
        val callVibration = vibrationPattern(settings, "callVibration")
        val vibrationMode = if (callVibration == null) "off" else settings.optString("callVibration").lowercase(Locale.ROOT)
        val channelId = "incoming-calls-v2-${if (soundEnabled) "sound" else "silent"}-$vibrationMode"
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          val channel = NotificationChannel(channelId, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setSound(if (soundEnabled) Uri.parse("android.resource://${context.packageName}/${R.raw.incoming_call}") else null,
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            vibrationPattern = callVibration
            enableVibration(callVibration != null)
          }
          manager.createNotificationChannel(channel)
        }
        val fullScreen = IncomingCallActivity.pendingIntent(context, request.identifier, getNotifyId(request),
            request.content.title?.toString() ?: "Incoming call", values["callType"] ?: "audio", accept, reject)
        val call = NotificationCompat.Builder(context, original)
            .setChannelId(channelId)
            .setDefaults(0)
            .setSilent(false)
            .setSound(if (soundEnabled) Uri.parse("android.resource://${context.packageName}/${R.raw.incoming_call}") else null)
            .setVibrate(callVibration)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // Present immediately; a remote caller photo must not delay ringing.
            .setLargeIcon(BitmapFactory.decodeResource(context.resources, R.mipmap.ic_launcher_foreground))
            .setFullScreenIntent(fullScreen, true)
            .setTimeoutAfter(60_000)
            .addAction(NotificationCompat.Action.Builder(0, "Accept", accept)
                .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_CALL).build())
            .addAction(NotificationCompat.Action.Builder(0, "Reject", reject)
                .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_DELETE).build())
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(request.identifier, getNotifyId(request), call)
        val avatar = notificationAvatar(values, request.content.title?.toString())
        if (manager.activeNotifications.any { it.tag == request.identifier && it.id == getNotifyId(request) }) {
          NotificationManagerCompat.from(context).notify(request.identifier, getNotifyId(request),
              NotificationCompat.Builder(context, call).setLargeIcon(avatar).setOnlyAlertOnce(true).build())
        }
      }
      return
    }
    if (request.trigger !is FirebaseNotificationTrigger || !isMessage(values) ||
        behavior?.shouldPresentAlert == false || request.content.title.isNullOrBlank()) {
      super.presentNotification(notification, behavior)
      return
    }
    val key = values["groupId"]?.takeIf { it.isNotBlank() }
        ?: values["chatId"]?.takeIf { it.isNotBlank() }
        ?: values["conversationId"]?.takeIf { it.isNotBlank() }
        ?: values["senderId"]?.takeIf { it.isNotBlank() }
        ?: request.content.title!!.trim().lowercase(Locale.ROOT)
    val group = PREFIX + key
    CoroutineScope(Dispatchers.IO).launch {
      mutex.withLock {
        val original = super.createNotification(notification, behavior)
        val settings = notificationSettings()
        val preview = if (settings.optBoolean("popupPreview", true)) original else hidePreview(original)
        val presented = applyMessageSound(preview, settings, values, behavior)
        val child = NotificationCompat.Builder(context, presented)
            .setLargeIcon(notificationAvatar(values, request.content.title?.toString()))
            .setGroup(group).setGroupSummary(false)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            // Cloning Expo's original notification can restore its silent flag.
            // The configured channel/sound/pattern already controls alerting;
            // clear that flag so vibration-only messages are not suppressed.
            .setSilent(false)
            .setDeleteIntent(deleteIntent(context, group, false)).build()
        NotificationManagerCompat.from(context).notify(request.identifier, getNotifyId(request), child)
        refreshSummary(context, group, child)
      }
    }
  }

  // Summaries are derived from children, rather than extra unread messages.
  override fun getAllPresentedNotifications(): Collection<ExpoNotification> {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return manager.activeNotifications.filter { it.tag?.startsWith(SUMMARY_PREFIX) != true }
        .mapNotNull { getNotification(it) }
  }

  override fun dismissNotifications(identifiers: Collection<String>) {
    runBlocking {
      mutex.withLock {
        super.dismissNotifications(identifiers)
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.activeNotifications.mapNotNull { it.notification.group }
            .filter { it.startsWith(PREFIX) }.distinct().forEach { refreshSummary(context, it) }
      }
    }
  }
}

class ChatNotificationDismissReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    CoroutineScope(Dispatchers.IO).launch {
      try {
        ChatNotificationGroups.dismissed(context.applicationContext, intent)
      } finally {
        pending.finish()
      }
    }
  }
}
