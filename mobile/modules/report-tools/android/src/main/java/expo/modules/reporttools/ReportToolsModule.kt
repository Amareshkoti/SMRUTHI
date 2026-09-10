package expo.modules.reporttools

import android.content.Intent
import android.graphics.*
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.security.MessageDigest

class ReportToolsModule : Module() {
  private fun context() = requireNotNull(appContext.reactContext)
  override fun definition() = ModuleDefinition {
    Name("ReportTools")
    AsyncFunction("startProcessing") {
      val intent = Intent(context(), ReportUploadService::class.java)
      if (Build.VERSION.SDK_INT >= 26) context().startForegroundService(intent) else context().startService(intent)
      Unit
    }
    AsyncFunction("stopProcessing") {
      context().stopService(Intent(context(), ReportUploadService::class.java))
      Unit
    }
    // Android passes a content:// URI when a person chooses SMRUTI from
    // WhatsApp, Drive, Photos, or another app's share sheet.  Reading through
    // ContentResolver preserves the temporary permission granted by Android.
    AsyncFunction("sharedFile") {
      val intent = appContext.currentActivity?.intent
      if (intent?.action != Intent.ACTION_SEND) return@AsyncFunction null
      val uri = if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
      } ?: return@AsyncFunction null
      val mime = intent.type ?: context().contentResolver.getType(uri) ?: ""
      if (mime != "application/pdf" && !mime.startsWith("image/")) return@AsyncFunction null
      var name = "shared-report"
      context().contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) name = cursor.getString(0) ?: name
      }
      // Consume this launch intent so returning to the app does not re-import
      // the same report by accident.
      intent.action = Intent.ACTION_MAIN
      mapOf("uri" to uri.toString(), "name" to name, "mimeType" to mime)
    }
    AsyncFunction("hashFile") { uri: String ->
      val digest = MessageDigest.getInstance("SHA-256")
      var size = 0L
      context().contentResolver.openInputStream(Uri.parse(uri)).use { stream ->
        requireNotNull(stream) { "Cannot open the selected report." }
        val buffer = ByteArray(65536)
        while (true) {
          val read = stream.read(buffer)
          if (read < 0) break
          size += read
          require(size <= 18 * 1024 * 1024) { "Choose a report smaller than 18 MB." }
          digest.update(buffer, 0, read)
        }
      }
      require(size > 0) { "The selected file is empty." }
      digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
    }
    AsyncFunction("pageCount") { uri: String ->
      val descriptor = requireNotNull(context().contentResolver.openFileDescriptor(Uri.parse(uri), "r"))
      PdfRenderer(descriptor).use { renderer ->
        require(renderer.pageCount in 1..10) { "Choose a PDF with 1 to 10 pages." }
        renderer.pageCount
      }
    }
    AsyncFunction("renderPage") { uri: String, pageIndex: Int ->
      val descriptor = requireNotNull(context().contentResolver.openFileDescriptor(Uri.parse(uri), "r"))
      PdfRenderer(descriptor).use { renderer ->
        require(renderer.pageCount in 1..10) { "Choose a PDF with 1 to 10 pages." }
        renderer.openPage(pageIndex).use { page ->
          val width = 1600
          val height = (width.toDouble() * page.height / page.width).toInt().coerceIn(1, 3200)
          val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          try {
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            encode(bitmap)
          } finally { bitmap.recycle() }
        }
      }
    }
    AsyncFunction("renderImage") { uri: String ->
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      context().contentResolver.openInputStream(Uri.parse(uri)).use { BitmapFactory.decodeStream(it, null, bounds) }
      require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Choose a readable report image." }
      var sample = 1
      while (bounds.outWidth / sample > 2000 || bounds.outHeight / sample > 3200) sample *= 2
      val opts = BitmapFactory.Options().apply { inSampleSize = sample }
      val bitmap = requireNotNull(context().contentResolver.openInputStream(Uri.parse(uri)).use { BitmapFactory.decodeStream(it, null, opts) })
      try { encode(bitmap) } finally { bitmap.recycle() }
    }
  }
  private fun encode(source: Bitmap): String {
    var bitmap = source
    try {
      for (attempt in 0..5) {
        for (quality in listOf(85, 70, 55, 40)) {
          val bytes = ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            out.toByteArray()
          }
          val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
          if (base64.length <= 180000) return base64
        }
        val smaller = Bitmap.createScaledBitmap(bitmap, (bitmap.width * 0.8).toInt().coerceAtLeast(1), (bitmap.height * 0.8).toInt().coerceAtLeast(1), true)
        if (bitmap !== source) bitmap.recycle()
        bitmap = smaller
      }
      error("This page is too detailed. Choose a clearer, smaller report page.")
    } finally { if (bitmap !== source) bitmap.recycle() }
  }
}
