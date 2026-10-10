// Tealight native engine — Android
// REFERENCE IMPLEMENTATION, NOT YET COMPILED (see model/Model.kt header).
//
// Foreground service (type mediaPlayback) that owns the engine while a layer plays, so Android keeps
// the process alive with the screen off and while the user is in Spotify / YouTube / a podcast app.
//
// Deliberately absent, because each would fight the user's other audio:
// - AudioManager.requestAudioFocus()  -> would pause or duck their music.
// - MediaSession / MediaStyle notification -> would take the headset play/pause keys and the media
//   controls in the shade from their music app (spec §5.8).
// What it shows instead: one quiet, ongoing notification ("Focus · 36 min left") with a Stop action.
//
// Start it only from a user action (a tap in the app or the notification): Android 12+ forbids
// starting foreground services from the background, and Android 14+ requires the
// FOREGROUND_SERVICE_MEDIA_PLAYBACK permission declared in the manifest.

package app.tealight.layer.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import app.tealight.layer.R
import app.tealight.layer.audio.BinauralEngine
import app.tealight.layer.audio.EngineStatus
import app.tealight.layer.audio.HeadphoneFacts
import app.tealight.layer.audio.HeadphoneMonitor
import app.tealight.layer.model.BUILT_IN_PRESETS
import app.tealight.layer.model.BUILT_IN_PROGRAMS
import app.tealight.layer.model.Program
import app.tealight.layer.model.presetToProgram
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class LayerService : LifecycleService() {

    /** Events the UI shows as calm banners (spec §5.2 / §5.7). */
    enum class Notice { PAUSED_FOR_CALL, HEADPHONES_DISCONNECTED }

    inner class LocalBinder : Binder() {
        val service: LayerService get() = this@LayerService
    }

    lateinit var engine: BinauralEngine
        private set
    lateinit var runner: ProgramRunner
        private set
    private lateinit var monitor: HeadphoneMonitor
    private var notificationTicker: Job? = null
    private var foreground = false
    private var currentTitle = "Tealight"

    private val _facts = MutableStateFlow<HeadphoneFacts?>(null)
    val headphoneFacts: StateFlow<HeadphoneFacts?> = _facts
    private val _notice = MutableStateFlow<Notice?>(null)
    val notice: StateFlow<Notice?> = _notice

    override fun onCreate() {
        super.onCreate()
        engine = BinauralEngine(lifecycleScope)
        runner = ProgramRunner(engine, lifecycleScope)
        runner.onEnded = { goIdle() }
        monitor = HeadphoneMonitor(
            this,
            onBecomingNoisy = {
                if (engine.state.value.status == EngineStatus.PLAYING) {
                    runner.pause()
                    _notice.value = Notice.HEADPHONES_DISCONNECTED
                    updateNotification()
                }
            },
            onCallStarted = {
                if (engine.state.value.status == EngineStatus.PLAYING) {
                    runner.pause() // and never auto-resume after the call
                    _notice.value = Notice.PAUSED_FOR_CALL
                    updateNotification()
                }
            },
            onFacts = { _facts.value = it },
        )
        monitor.start()
        createChannel()
    }

    override fun onBind(intent: Intent): IBinder {
        super.onBind(intent)
        return LocalBinder()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_PLAY -> {
                val program = resolveProgram(intent) ?: return START_NOT_STICKY
                currentTitle = program.name
                // startForeground must be called within a few seconds of startForegroundService().
                enterForeground()
                runCatching {
                    runner.play(program, timerSec = intent.getDoubleExtra(EXTRA_TIMER_SEC, Double.NaN).takeIf { it.isFinite() })
                }.onFailure { goIdle() }
                startTicker()
            }
            ACTION_PAUSE -> { runner.pause(); updateNotification() }
            ACTION_RESUME -> { _notice.value = null; runner.resume(); updateNotification() }
            ACTION_STOP -> runner.stop(completed = false) { goIdle() }
        }
        // Don't restart by itself after being killed: sound must only ever start from a user action.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        monitor.stop()
        engine.release()
        super.onDestroy()
    }

    private fun resolveProgram(intent: Intent): Program? {
        intent.getStringExtra(EXTRA_PROGRAM_ID)?.let { id -> return BUILT_IN_PROGRAMS.firstOrNull { it.id == id } }
        intent.getStringExtra(EXTRA_PRESET_ID)?.let { id -> return BUILT_IN_PRESETS.firstOrNull { it.id == id }?.let(::presetToProgram) }
        // Custom presets/programs: the UI passes them as JSON (kotlinx.serialization, same shape as core).
        return null
    }

    private fun goIdle() {
        notificationTicker?.cancel()
        if (foreground) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            foreground = false
        }
        stopSelf()
    }

    // ── notification ──

    private fun createChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        val ch = NotificationChannel(CHANNEL_ID, "Playing layer", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Shows while Tealight plays under your other audio, with a Stop button."
            setShowBadge(false)
            setSound(null, null)
            enableVibration(false)
        }
        nm.createNotificationChannel(ch)
    }

    private fun enterForeground() {
        val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)
        foreground = true
    }

    private fun startTicker() {
        notificationTicker?.cancel()
        notificationTicker = lifecycleScope.launch {
            while (true) {
                updateNotification()
                delay(60_000) // minute resolution: "36 min left" — no per-second churn
            }
        }
    }

    private fun updateNotification() {
        if (!foreground) return
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        val stop = PendingIntent.getService(
            this, 1, Intent(this, LayerService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 2, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val paused = runner.status == ProgramRunner.Status.PAUSED
        val text = when {
            _notice.value == Notice.PAUSED_FOR_CALL -> "Paused for your call"
            _notice.value == Notice.HEADPHONES_DISCONNECTED -> "Headphones disconnected. Paused."
            paused -> "Paused"
            else -> runner.remainingSec?.let { "${kotlin.math.ceil(it / 60).toInt()} min left" } ?: "Under your audio"
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_tealight_flame)
            .setContentTitle(currentTitle)
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(!paused)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_SERVICE) // NOT CATEGORY_TRANSPORT / MediaStyle (see header)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(0, "Stop", stop)
            .build()
    }

    companion object {
        const val ACTION_PLAY = "app.tealight.layer.PLAY"
        const val ACTION_PAUSE = "app.tealight.layer.PAUSE"
        const val ACTION_RESUME = "app.tealight.layer.RESUME"
        const val ACTION_STOP = "app.tealight.layer.STOP"
        const val EXTRA_PRESET_ID = "presetId"
        const val EXTRA_PROGRAM_ID = "programId"
        const val EXTRA_TIMER_SEC = "timerSec"
        private const val CHANNEL_ID = "layer"
        private const val NOTIFICATION_ID = 7

        /** Call from a user tap. */
        fun playPreset(context: Context, presetId: String, timerSec: Double? = null) =
            ContextCompat.startForegroundService(context, Intent(context, LayerService::class.java)
                .setAction(ACTION_PLAY).putExtra(EXTRA_PRESET_ID, presetId)
                .apply { timerSec?.let { putExtra(EXTRA_TIMER_SEC, it) } })

        fun playProgram(context: Context, programId: String, timerSec: Double? = null) =
            ContextCompat.startForegroundService(context, Intent(context, LayerService::class.java)
                .setAction(ACTION_PLAY).putExtra(EXTRA_PROGRAM_ID, programId)
                .apply { timerSec?.let { putExtra(EXTRA_TIMER_SEC, it) } })

        fun stop(context: Context) =
            context.startService(Intent(context, LayerService::class.java).setAction(ACTION_STOP))
    }
}
