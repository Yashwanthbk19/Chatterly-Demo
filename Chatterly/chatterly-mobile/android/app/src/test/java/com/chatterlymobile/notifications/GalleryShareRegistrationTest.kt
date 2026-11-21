package com.chatterlymobile.notifications

import android.app.Application
import android.content.Intent
import android.content.pm.PackageManager
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class GalleryShareRegistrationTest {
  private fun offersChatterly(action: String, mimeType: String): Boolean {
    val context = RuntimeEnvironment.getApplication()
    val intent = Intent(action).setType(mimeType).addCategory(Intent.CATEGORY_DEFAULT)
    return context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        .any { it.activityInfo.name == "com.chatterlymobile.MainActivity" }
  }

  @Test fun `gallery photo GIF and video shares offer Chatterly`() {
    listOf("image/jpeg", "image/png", "image/gif", "video/mp4", "video/quicktime").forEach {
      assertTrue("Chatterly must accept $it", offersChatterly(Intent.ACTION_SEND, it))
    }
  }

  @Test fun `gallery selections including mixed photos and videos offer Chatterly`() {
    listOf("image/jpeg", "video/mp4", "*/*").forEach {
      assertTrue("Chatterly must accept multiple $it", offersChatterly(Intent.ACTION_SEND_MULTIPLE, it))
    }
  }

  @Test fun `share reception uses the existing app scheme`() {
    val context = RuntimeEnvironment.getApplication()
    val id = context.resources.getIdentifier("share_into_scheme", "string", context.packageName)
    assertNotEquals(0, id)
    assertEquals("chatterly", context.getString(id))
  }

  @Test fun `the gallery target does not claim unrelated document shares`() {
    assertFalse(offersChatterly(Intent.ACTION_SEND, "application/pdf"))
    assertFalse(offersChatterly(Intent.ACTION_SEND_MULTIPLE, "application/pdf"))
  }
}
