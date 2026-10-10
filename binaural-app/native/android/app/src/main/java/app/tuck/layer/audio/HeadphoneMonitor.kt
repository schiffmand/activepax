// Tuck native engine — Android
// REFERENCE IMPLEMENTATION, NOT YET COMPILED (see model/Model.kt header).
//
// Because Tuck deliberately holds no audio focus, it gets no focus callbacks. This class supplies
// the events the engine still needs, plus the facts for the UI's headphone-state model
// (product-spec §5.2: speaker | oneEar | mono | spatial | stereoOk | swapped | disconnected):
//
// - ACTION_AUDIO_BECOMING_NOISY: headphones unplugged / Bluetooth dropped -> pause (never blast the speaker).
// - AudioManager mode IN_CALL / IN_COMMUNICATION: a phone or VoIP call -> fade out, do not auto-resume.
// - AudioDeviceCallback: what we're routed to (speaker vs wired vs Bluetooth vs USB).
// - Settings.System "master_mono" (Accessibility > Mono audio): hidden key, read best effort.
// - Spatializer (API 32+): reported for completeness; our AudioTrack already opts out of it.

package app.tuck.layer.audio

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.ContextCompat

enum class OutputRoute { SPEAKER, WIRED, BLUETOOTH, USB, OTHER, NONE }

data class HeadphoneFacts(
    val route: OutputRoute,
    val monoAudio: Boolean,
    /** Spatial audio is on for this device; informational (we opt out per-stream on API 32+). */
    val spatialAudio: Boolean,
    val outputName: String?,
)

class HeadphoneMonitor(
    private val context: Context,
    private val onBecomingNoisy: () -> Unit,
    private val onCallStarted: () -> Unit,
    private val onFacts: (HeadphoneFacts) -> Unit,
) {
    private val audio = context.getSystemService(AudioManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private var lastFacts: HeadphoneFacts? = null
    private var inCall = false

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            if (i.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) onBecomingNoisy()
        }
    }

    private val deviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) = refresh()
        override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) = refresh()
    }

    private val monoObserver = object : ContentObserver(main) {
        override fun onChange(selfChange: Boolean) = refresh()
    }

    private val modeListener: Any? = if (Build.VERSION.SDK_INT >= 31) AudioManager.OnModeChangedListener { checkMode(it) } else null

    private val modePoll = object : Runnable {
        override fun run() {
            checkMode(audio.mode)
            main.postDelayed(this, 1000)
        }
    }

    fun start() {
        ContextCompat.registerReceiver(context, noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED)
        audio.registerAudioDeviceCallback(deviceCallback, main)
        context.contentResolver.registerContentObserver(Settings.System.getUriFor(MASTER_MONO), false, monoObserver)
        if (Build.VERSION.SDK_INT >= 31) {
            audio.addOnModeChangedListener(ContextCompat.getMainExecutor(context), modeListener as AudioManager.OnModeChangedListener)
        } else {
            main.post(modePoll) // no listener before API 31; READ_PHONE_STATE is not worth asking for
        }
        refresh()
    }

    fun stop() {
        runCatching { context.unregisterReceiver(noisyReceiver) }
        audio.unregisterAudioDeviceCallback(deviceCallback)
        context.contentResolver.unregisterContentObserver(monoObserver)
        if (Build.VERSION.SDK_INT >= 31) {
            audio.removeOnModeChangedListener(modeListener as AudioManager.OnModeChangedListener)
        } else {
            main.removeCallbacks(modePoll)
        }
    }

    private fun checkMode(mode: Int) {
        val call = mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_RINGTONE
        if (call && !inCall) onCallStarted()
        inCall = call
    }

    /** The output media would play on right now: the highest-priority connected sink. */
    private fun currentOutput(): AudioDeviceInfo? {
        val outs = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        val priority = listOf(
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET,
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE,
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
        )
        for (t in priority) outs.firstOrNull { it.type == t }?.let { return it }
        return outs.firstOrNull()
    }

    fun refresh() {
        val d = currentOutput()
        val route = when (d?.type) {
            null -> OutputRoute.NONE
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> OutputRoute.SPEAKER
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET -> OutputRoute.WIRED
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLE_HEADSET -> OutputRoute.BLUETOOTH
            AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE -> OutputRoute.USB
            else -> OutputRoute.OTHER
        }
        val mono = runCatching { Settings.System.getInt(context.contentResolver, MASTER_MONO, 0) == 1 }.getOrDefault(false)
        val spatial = Build.VERSION.SDK_INT >= 32 && audio.spatializer.let { it.isAvailable && it.isEnabled }
        val facts = HeadphoneFacts(route, mono, spatial, d?.productName?.toString())
        if (facts != lastFacts) {
            lastFacts = facts
            onFacts(facts)
        }
    }

    private companion object {
        /** Hidden Settings.System key behind Accessibility > Audio > Mono audio (AOSP). OEMs may differ. */
        const val MASTER_MONO = "master_mono"
    }
}
