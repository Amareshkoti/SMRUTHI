package com.smruti.research.ppg

import android.graphics.ImageFormat
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import java.nio.ByteBuffer

/**
 * PPGImageAnalyzer
 *
 * Implements high-speed frame-by-frame luminance extraction for reflective photoplethysmography
 * (cPPG) directly using the Android CameraX API.
 *
 * Architectural Note:
 * Third-party apps cannot access raw sensor matrices from the native fingerprint scanner due to
 * hardware-level isolation in ARM TrustZone / Trusted Execution Environment (TEE). This analyzer
 * bypasses this restriction by using the camera sensor while the rear LED flash illuminates
 * the capillary beds of the fingertip.
 */
class PPGImageAnalyzer(
    private val onLuminanceSample: (timestampMs: Long, averageLuminance: Double) -> Unit
) : ImageAnalysis.Analyzer {

    override fun analyze(image: ImageProxy) {
        // Standard CameraX YUV_420_888 format
        if (image.format == ImageFormat.YUV_420_888) {
            val yPlane = image.planes[0] // Y plane contains luminance (brightness)
            val yBuffer: ByteBuffer = yPlane.buffer
            val yData = ByteArray(yBuffer.remaining())
            yBuffer.get(yData)

            var sum: Long = 0
            val size = yData.size
            
            // Convert signed byte (-128..127) to unsigned integer (0..255) to prevent overflow artifacts
            for (i in 0 until size) {
                sum += (yData[i].toInt() and 0xFF)
            }

            val averageLuminance = if (size > 0) sum.toDouble() / size else 0.0
            val timestamp = System.currentTimeMillis()

            // Emit timestamp and normalized luminance sample for downstream CSV logging or real-time filtering
            onLuminanceSample(timestamp, averageLuminance)
        }

        // Critical: Must close imageProxy to release buffer back to CameraX pipeline
        image.close()
    }
}
