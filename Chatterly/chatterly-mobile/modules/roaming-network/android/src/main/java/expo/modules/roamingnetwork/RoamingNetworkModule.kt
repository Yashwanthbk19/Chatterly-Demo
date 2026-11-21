package expo.modules.roamingnetwork

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RoamingNetworkModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChatterlyRoamingNetwork")

    Function("getIsRoaming") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return@Function null
      val context = appContext.reactContext?.applicationContext ?: return@Function null
      val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        ?: return@Function null
      val network = manager.activeNetwork ?: return@Function null
      val capabilities = manager.getNetworkCapabilities(network) ?: return@Function null
      if (!capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return@Function false
      !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_ROAMING)
    }
  }
}
