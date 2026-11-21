package com.chatterlymobile.notifications

import android.content.Intent
import android.os.Bundle
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/** Route actionable pushes through Expo even when FCM would auto-display them. */
class ChatFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun handleIntent(intent: Intent) {
    val extras = intent.extras
    if (intent.action == "com.google.android.c2dm.intent.RECEIVE" && extras != null &&
        (extras.getString("message_type") ?: "gcm") == "gcm") {
      val payload = Bundle(extras)
      val message = RemoteMessage(payload)
      if (message.notification != null && (ChatNotificationGroups.isMessage(message.data) ||
          ChatNotificationGroups.isIncomingCall(message.data))) {
        if (message.notification?.channelId == null) {
          payload.putString("gcm.n.android_channel_id", "messages")
        }
        onMessageReceived(RemoteMessage(payload))
        return
      }
    }
    // Other pushes, silent data messages, token updates and Firebase control events
    // retain the original Expo/Firebase behavior.
    super.handleIntent(intent)
  }
}
