package com.example.mobile

import android.content.Intent
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CANALE).setMethodCallHandler { call, result ->
            when (call.method) {
                "start" -> {
                    TrackingService.avvia(this)
                    result.success(null)
                }
                "aggiorna" -> {
                    val intent = Intent(this, TrackingService::class.java)
                        .setAction(TrackingService.ACTION_AGGIORNA)
                    ContextCompat.startForegroundService(this, intent)
                    result.success(null)
                }
                "stop" -> {
                    TrackingService.ferma(this)
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    companion object {
        private const val CANALE = "com.example.mobile/tracking"
    }
}
