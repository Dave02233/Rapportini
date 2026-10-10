package com.example.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val azione = intent.action
        if (azione != Intent.ACTION_BOOT_COMPLETED &&
            azione != Intent.ACTION_MY_PACKAGE_REPLACED &&
            azione != "android.intent.action.QUICKBOOT_POWERON"
        ) {
            return
        }
        val prefs = context.getSharedPreferences(TrackingService.PREFS, Context.MODE_PRIVATE)
        if (prefs.getString("token", null).isNullOrEmpty()) return
        val fine = ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_COARSE_LOCATION)
        if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED) return
        try {
            ContextCompat.startForegroundService(context, Intent(context, TrackingService::class.java))
        } catch (_: Exception) {
        }
    }
}
