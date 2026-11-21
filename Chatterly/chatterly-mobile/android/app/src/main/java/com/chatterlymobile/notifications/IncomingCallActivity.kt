package com.chatterlymobile.notifications

import android.app.Activity
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** A call-only lock-screen surface; the rest of the app stays behind the lock. */
class IncomingCallActivity : Activity() {
  companion object {
    fun pendingIntent(context: Context, tag: String, id: Int, caller: String, type: String,
        accept: PendingIntent, reject: PendingIntent): PendingIntent {
      val intent = Intent(context, IncomingCallActivity::class.java).apply {
        data = Uri.parse("chatterly-call://incoming").buildUpon().appendPath(tag).build()
        putExtra("tag", tag)
        putExtra("id", id)
        putExtra("caller", caller)
        putExtra("type", type)
        putExtra("accept", accept)
        putExtra("reject", reject)
      }
      return PendingIntent.getActivity(context, 0, intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private val checkCall = object : Runnable {
    override fun run() {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.activeNotifications.none { it.tag == intent.getStringExtra("tag") && it.id == intent.getIntExtra("id", 0) }) {
        finish()
      } else handler.postDelayed(this, 1000)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(32, 48, 32, 48)
      setBackgroundColor(Color.rgb(24, 18, 38))
      fitsSystemWindows = true
    }
    content.addView(TextView(this).apply {
      text = intent.getStringExtra("caller") ?: "Incoming call"
      textSize = 28f
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
    })
    content.addView(TextView(this).apply {
      text = if (intent.getStringExtra("type") == "video") "Incoming video call" else "Incoming audio call"
      textSize = 18f
      gravity = Gravity.CENTER
      setPadding(0, 24, 0, 48)
      setTextColor(Color.WHITE)
    })
    listOf("Accept" to "accept", "Reject" to "reject").forEach { (label, key) ->
      content.addView(Button(this).apply {
        text = label
        setOnClickListener {
          @Suppress("DEPRECATION")
          val action = intent.getParcelableExtra<PendingIntent>(key)
          runCatching { action?.send() }
          finish()
        }
      })
    }
    setContentView(content)
    // Notification cancellation (answer, rejection, missed call or timeout)
    // also dismisses this surface without depending on JavaScript being awake.
    handler.postDelayed(checkCall, 1000)
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }
}
