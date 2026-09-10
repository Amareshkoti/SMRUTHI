package expo.modules.reporttools

import android.app.*
import android.content.Intent
import android.os.*

class ReportUploadService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  override fun onCreate() {
    super.onCreate()
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) {
      manager.createNotificationChannel(NotificationChannel("reports", "Report processing", NotificationManager.IMPORTANCE_LOW))
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "reports") else Notification.Builder(this)
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    if (launch != null) builder.setContentIntent(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    startForeground(1729, builder.setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle("Reading your report").setContentText("You can return to SMRUTI to check progress.").setOngoing(true).build())
    wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "smruti:report")
    wakeLock?.acquire(30 * 60 * 1000L)
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onDestroy() {
    if (wakeLock?.isHeld == true) wakeLock?.release()
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
