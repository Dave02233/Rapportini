package com.example.mobile

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.AlarmManagerCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Pattern allineato a Google Codelab "while-in-use location" + Fused PendingIntent:
 * - Foreground service type=location + notifica (come Life360 / Maps tracking)
 * - requestLocationUpdates via PendingIntent (Play Services può riattivare il processo)
 * - AlarmManager watchdog: se il campione è in ritardo, getCurrentLocation + invio
 * Wake lock solo durante la POST.
 */
class TrackingService : Service() {
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val invioInCorso = AtomicBoolean(false)
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private lateinit var wakeLock: PowerManager.WakeLock

    override fun onCreate() {
        super.onCreate()
        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tec:invio")
            .apply { setReferenceCounted(false) }
        creaCanale()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        attivo = true
        try {
            ServiceCompat.startForeground(
                this,
                NOTIF_ID,
                notifica(testoNotifica()),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            )
        } catch (_: SecurityException) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (prefs().getString("token", null).isNullOrEmpty()) {
            fermaTutto()
            stopSelf()
            return START_NOT_STICKY
        }

        when (intent?.action) {
            ACTION_STOP -> {
                attivo = false
                fermaTutto()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_LOCATION -> {
                // Consegna da Fused via PendingIntent (API ufficiale Play Services).
                val loc = LocationResult.extractResult(intent)?.lastLocation
                if (loc != null) accodaInvio(loc.latitude, loc.longitude)
                programmaWatchdog()
            }
            ACTION_CAMPIONE -> {
                // Watchdog: scatta se Fused non ha portato un invio in tempo.
                if (eOra()) campionaOra()
                programmaWatchdog()
            }
            ACTION_AGGIORNA -> {
                registraFused()
                programmaWatchdog()
            }
            else -> {
                registraFused()
                if (eOra()) campionaOra()
                programmaWatchdog()
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        attivo = false
        fermaTutto()
        if (wakeLock.isHeld) wakeLock.release()
        io.shutdown()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    @Suppress("MissingPermission")
    private fun registraFused() {
        val ms = intervalloMinuti() * 60_000L
        // Intervallo lungo + distanza 0: un fix anche da fermo (Google: interval alto = meno batteria).
        val richiesta = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, ms)
            .setMinUpdateIntervalMillis(ms)
            .setMinUpdateDistanceMeters(0f)
            .setMaxUpdateDelayMillis(ms)
            .setWaitForAccurateLocation(false)
            .build()
        try {
            fused.removeLocationUpdates(pendingLocation())
            fused.requestLocationUpdates(richiesta, pendingLocation())
        } catch (_: SecurityException) {
            main.post { aggiornaNotifica("Permesso posizione mancante") }
        }
    }

    private fun campionaOra() {
        if (!attivo || !eOra()) return
        chiediPosizione()
    }

    @Suppress("MissingPermission")
    private fun chiediPosizione() {
        val richiesta = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
            .setDurationMillis(45_000)
            .setMaxUpdateAgeMillis(120_000)
            .build()
        try {
            fused.getCurrentLocation(richiesta, null)
                .addOnSuccessListener { loc ->
                    if (!attivo) return@addOnSuccessListener
                    if (loc != null) accodaInvio(loc.latitude, loc.longitude)
                    else usaUltimaNota()
                }
                .addOnFailureListener {
                    if (attivo) usaUltimaNota()
                }
        } catch (_: SecurityException) {
            main.post { aggiornaNotifica("Permesso posizione mancante") }
        }
    }

    @Suppress("MissingPermission")
    private fun usaUltimaNota() {
        try {
            fused.lastLocation.addOnSuccessListener { loc ->
                if (loc != null && attivo) accodaInvio(loc.latitude, loc.longitude)
                else if (attivo) main.post { aggiornaNotifica("GPS non disponibile") }
            }
        } catch (_: SecurityException) {
        }
    }

    private fun accodaInvio(lat: Double, lon: Double) {
        if (!attivo || !eOra()) return
        if (!invioInCorso.compareAndSet(false, true)) return
        wakeLock.acquire(WAKE_MS)
        try {
            io.execute {
                try {
                    invia(lat, lon)
                } finally {
                    invioInCorso.set(false)
                    if (wakeLock.isHeld) wakeLock.release()
                    // Dopo un invio (o skip), riallinea il watchdog all'intervallo.
                    main.post { if (attivo) programmaWatchdog() }
                }
            }
        } catch (_: RejectedExecutionException) {
            invioInCorso.set(false)
            if (wakeLock.isHeld) wakeLock.release()
        }
    }

    private fun invia(lat: Double, lon: Double) {
        if (!attivo) return
        try {
            inviaPosizione(lat, lon)
            if (!attivo) return
            val ora = oraIso()
            prefs().edit()
                .putString("ultima_lat", DOUBLE_PREFIX + lat)
                .putString("ultima_lon", DOUBLE_PREFIX + lon)
                .putString("ultimo_invio", ora)
                .putLong("ultimo_invio_ms", System.currentTimeMillis())
                .remove("ultimo_errore")
                .apply()
            main.post { aggiornaNotifica("Ultimo invio ${oraBreve()}") }
        } catch (e: Exception) {
            if (!attivo) return
            prefs().edit().putString("ultimo_errore", messaggio(e)).apply()
            main.post { aggiornaNotifica("Errore ultimo invio") }
        }
    }

    private fun inviaPosizione(lat: Double, lon: Double) {
        val store = prefs()
        var token = store.getString("token", null) ?: return
        val body = JSONObject().put("lat", lat).put("lon", lon)
        try {
            post("/users/positions", body, token)
        } catch (e: ApiException) {
            if (e.codice != 401 || !attivo) throw e
            val user = store.getString("username", null) ?: throw e
            val pass = store.getString("password", null) ?: throw e
            token = login(user, pass)
            if (!attivo) return
            store.edit().putString("token", token).apply()
            post("/users/positions", body, token)
        }
    }

    private fun login(username: String, password: String): String {
        val body = JSONObject().put("username", username).put("password", password)
        val testo = post("/login", body, null)
        return JSONObject(testo).getString("access_token")
    }

    private fun post(path: String, body: JSONObject, token: String?): String {
        val conn = (URL(baseUrl() + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 15_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            if (token != null) setRequestProperty("Authorization", "Bearer $token")
        }
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val codice = conn.responseCode
            val stream = if (codice in 200..299) conn.inputStream else conn.errorStream
            val testo = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (codice != 200) throw ApiException(codice, dettaglio(testo, codice))
            return testo
        } finally {
            conn.disconnect()
        }
    }

    /** Watchdog: Google sconsiglia exact alarm per sync ricorrenti; usiamo allow-while-idle (+ exact se già concesso). */
    private fun programmaWatchdog() {
        if (!attivo) return
        val am = getSystemService(AlarmManager::class.java) ?: return
        val pi = pendingCampione()
        val attesa = msAlProssimo().coerceAtLeast(15_000L)
        val a = SystemClock.elapsedRealtime() + attesa
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
                AlarmManagerCompat.setExactAndAllowWhileIdle(am, AlarmManager.ELAPSED_REALTIME_WAKEUP, a, pi)
            } else {
                AlarmManagerCompat.setAndAllowWhileIdle(am, AlarmManager.ELAPSED_REALTIME_WAKEUP, a, pi)
            }
        } catch (_: SecurityException) {
            AlarmManagerCompat.setAndAllowWhileIdle(am, AlarmManager.ELAPSED_REALTIME_WAKEUP, a, pi)
        }
    }

    private fun fermaTutto() {
        annullaWatchdog()
        try {
            fused.removeLocationUpdates(pendingLocation())
        } catch (_: Exception) {
        }
    }

    private fun annullaWatchdog() {
        val am = getSystemService(AlarmManager::class.java) ?: return
        am.cancel(pendingCampione())
    }

    private fun pendingCampione(): PendingIntent {
        val intent = Intent(this, TrackingService::class.java).setAction(ACTION_CAMPIONE)
        return foregroundPi(REQ_CAMPIONE, intent)
    }

    private fun pendingLocation(): PendingIntent {
        val intent = Intent(this, TrackingService::class.java).setAction(ACTION_LOCATION)
        return foregroundPi(REQ_LOCATION, intent)
    }

    private fun foregroundPi(req: Int, intent: Intent): PendingIntent {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PendingIntent.getForegroundService(this, req, intent, flags)
        } else {
            PendingIntent.getService(this, req, intent, flags)
        }
    }

    private fun msAlProssimo(): Long {
        val intervallo = intervalloMinuti() * 60_000L
        val store = prefs()
        if (!store.contains("ultimo_invio_ms")) return 15_000L
        val ultimo = try {
            store.getLong("ultimo_invio_ms", 0L)
        } catch (_: ClassCastException) {
            store.getInt("ultimo_invio_ms", 0).toLong()
        }
        val rimanente = intervallo - (System.currentTimeMillis() - ultimo)
        // Piccolo slack: se Fused è in ritardo di pochi secondi, il watchdog non ruba il turno.
        return if (rimanente <= 0L) 15_000L else rimanente + 30_000L
    }

    private fun eOra(): Boolean {
        val store = prefs()
        if (!store.contains("ultimo_invio_ms")) return true
        val ms = try {
            store.getLong("ultimo_invio_ms", 0L)
        } catch (_: ClassCastException) {
            store.getInt("ultimo_invio_ms", 0).toLong()
        }
        return System.currentTimeMillis() - ms >= intervalloMinuti() * 60_000L
    }

    private fun intervalloMinuti(): Int {
        val store = prefs()
        if (!store.contains("intervallo")) return 15
        val v = try {
            store.getLong("intervallo", 15L).toInt()
        } catch (_: ClassCastException) {
            store.getInt("intervallo", 15)
        }
        return if (v == 5 || v == 15 || v == 30 || v == 60) v else 15
    }

    private fun baseUrl(): String {
        val salvato = prefs().getString("base_url", null)?.trimEnd('/')
        return if (salvato.isNullOrEmpty()) URL_DEFAULT else salvato
    }

    private fun prefs(): SharedPreferences =
        getSharedPreferences(PREFS, MODE_PRIVATE)

    private fun creaCanale() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val canale = NotificationChannel(CANALE, "Tracciamento", NotificationManager.IMPORTANCE_LOW).apply {
            setSound(null, null)
            enableVibration(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(canale)
    }

    private fun testoNotifica(): String {
        val store = prefs()
        val errore = store.getString("ultimo_errore", null)
        if (errore != null) return "Errore ultimo invio"
        val invio = store.getString("ultimo_invio", null) ?: return "Tracciamento posizione attivo"
        return try {
            val t = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).parse(invio)
            if (t != null) "Ultimo invio ${SimpleDateFormat("HH:mm", Locale.US).format(t)}"
            else "Tracciamento posizione attivo"
        } catch (_: Exception) {
            "Tracciamento posizione attivo"
        }
    }

    private fun aggiornaNotifica(testo: String) {
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notifica(testo))
    }

    private fun notifica(testo: String): Notification {
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val tap = PendingIntent.getActivity(this, 0, launch, flags)
        return NotificationCompat.Builder(this, CANALE)
            .setSmallIcon(R.drawable.ic_bg_service_small)
            .setContentTitle("TEC Energie")
            .setContentText(testo)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(tap)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun oraIso(): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(Date())

    private fun oraBreve(): String =
        SimpleDateFormat("HH:mm", Locale.US).format(Date())

    private fun dettaglio(testo: String, codice: Int): String {
        try {
            val detail = JSONObject(testo).opt("detail")
            if (detail is String && detail.isNotEmpty()) return detail
        } catch (_: Exception) {
        }
        return "Errore del server ($codice)"
    }

    private fun messaggio(e: Exception): String = when (e) {
        is ApiException -> e.message ?: "Errore del server"
        is SocketTimeoutException, is UnknownHostException, is IOException -> "Errore di rete"
        else -> "Errore di invio"
    }.take(180)

    private class ApiException(val codice: Int, messaggio: String) : Exception(messaggio)

    companion object {
        const val ACTION_AGGIORNA = "com.example.mobile.AGGIORNA"
        const val ACTION_CAMPIONE = "com.example.mobile.CAMPIONE"
        const val ACTION_LOCATION = "com.example.mobile.LOCATION"
        const val ACTION_STOP = "com.example.mobile.STOP"
        const val PREFS = "tec_tracking"
        private const val CANALE = "tec_tracking"
        private const val NOTIF_ID = 1101
        private const val REQ_CAMPIONE = 2201
        private const val REQ_LOCATION = 2202
        private const val WAKE_MS = 45_000L
        private const val URL_DEFAULT = "https://gestionale.davide-test.online"
        private const val DOUBLE_PREFIX = "VGhpcyBpcyB0aGUgcHJlZml4IGZvciBEb3VibGUu"

        @Volatile
        var attivo = false

        fun avvia(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, TrackingService::class.java))
        }

        fun ferma(context: Context) {
            attivo = false
            ContextCompat.startForegroundService(
                context,
                Intent(context, TrackingService::class.java).setAction(ACTION_STOP),
            )
        }
    }
}
