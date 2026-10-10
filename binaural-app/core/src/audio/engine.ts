import { systemClock, type Clock, type TimerHandle } from '../clock';
import { Emitter } from '../emitter';
import {
  LIMITS,
  bandFor,
  clamp,
  earFrequencies,
  type Band,
  type NoiseSetting,
  type NoiseType,
  type RampCurve,
  type ToneTarget,
} from '../types';
import { generateNoise } from './noise';
import {
  holdParam,
  paramValueAt,
  rampFade,
  rampParam,
  setParam,
  type AudioBufferLike,
  type AudioBufferSourceNodeLike,
  type AudioContextLike,
  type AudioNodeLike,
  type GainNodeLike,
  type OscillatorNodeLike,
} from './webaudio';

/**
 * - idle: no graph
 * - playing: audible (or fading in)
 * - paused: silent by request, graph kept, context possibly suspended
 * - stopping: fading out before teardown
 * - interrupted: the OS suspended the context (call, Siri, alarm, Safari 'interrupted') while playing
 */
export type EngineStatus = 'idle' | 'playing' | 'paused' | 'stopping' | 'interrupted';

export interface EngineState {
  status: EngineStatus;
  /** Target values (where the engine is, or is gliding to). */
  beatHz: number;
  carrierHz: number;
  leftHz: number;
  rightHz: number;
  band: Band;
  /** User volume 0..1 (perceptual). */
  volume: number;
  /** Program envelope 0..1. */
  level: number;
  noise: NoiseSetting;
}

export interface EngineEvents extends Record<string, unknown> {
  state: EngineState;
  started: EngineState;
  paused: EngineState;
  resumed: EngineState;
  stopped: EngineState;
  /** The OS took the audio context away while playing. Clocks should pause. */
  interrupted: EngineState;
  /** The context came back by itself after an interruption; the engine has faded back in. */
  interruptionEnded: EngineState;
  error: Error;
}

export interface EngineStartParams {
  beatHz?: number;
  carrierHz?: number;
  volume?: number;
  level?: number;
  noise?: NoiseSetting;
}

export interface EngineOptions {
  /** Inject a context (tests, or sharing one app-wide). */
  context?: AudioContextLike;
  /** Lazily create a context on first start (default: `new AudioContext()` if available). */
  createContext?: () => AudioContextLike;
  clock?: Clock;
  /** Fade-in on start/resume, seconds. */
  fadeInSec?: number;
  /** Fade-out on stop, seconds. */
  fadeOutSec?: number;
  /** Fade-out on pause, seconds. */
  pauseFadeSec?: number;
  /** Default glide for parameter changes, seconds. */
  glideSec?: number;
  /** Suspend the AudioContext while paused (saves battery). Default true. */
  suspendOnPause?: boolean;
  /** Initial parameters. */
  initial?: EngineStartParams;
  /** Noise buffer length in seconds. */
  noiseBufferSec?: number;
  /**
   * Shape of the start/stop/pause fades. 'linear' (default) ramps the amplitude linearly;
   * 'perceptual' ramps in decibels from -40 dB (see rampFade), which sounds even over long fades.
   */
  fadeCurve?: 'linear' | 'perceptual';
}

/**
 * Thrown by start()/resume() when the platform refuses to run audio (autoplay policy: not called
 * from a user gesture, or the context is held 'interrupted'). UIs should show "Tap to start".
 */
export class AudioBlockedError extends Error {
  readonly code = 'needs-gesture';
  constructor(public readonly contextState: string) {
    super(`Audio could not start (context is '${contextState}'). Start playback from a tap.`);
    this.name = 'AudioBlockedError';
  }
}

/** Headroom: each sine peaks at this amplitude before the user volume. -6 dBFS. */
export const TONE_HEADROOM = 0.5;
/** RMS of each ear's tone before the user volume (a sine at TONE_HEADROOM): about -9 dBFS. */
export const TONE_RMS = TONE_HEADROOM / Math.SQRT2;
/**
 * RMS of the noise buffers, per colour. Loudness-matched with BS.1770 K-weighting (measured on
 * generateNoise output: all three land within 0.1 LU of each other), so switching colour doesn't jump.
 * Peaks stay at or under 0.83.
 */
export const NOISE_RMS: Readonly<Record<NoiseType, number>> = Object.freeze({ brown: 0.18, pink: 0.157, white: 0.105 });
/**
 * The noise law, in one place (round 2: the old law stacked a second square law and a 0.5 headroom on top of
 * the user volume, which left the noise about 36 dB under the beat and inaudible).
 *
 * Noise % is the noise's amplitude relative to the beat, linear: 100% is as loud as the beat (equal
 * BS.1770 loudness), 50% is 6 dB under it, 25% is 12 dB under it. NOISE_FULL_GAIN is the gain that puts
 * an RMS-normalised buffer (NOISE_RMS) at the beat's loudness: measured 2.11 for all three colours.
 */
export const NOISE_FULL_GAIN = 2.11;
/** Highest noise peak the buffers produce (generateNoise caps it; the RMS-normalised colours peak at 0.81 or less). */
export const NOISE_PEAK = 0.9;
/**
 * Worst-case peak of the whole layer per channel before the user volume: both tones (0.5) plus noise at
 * 100% (peak 0.9 x NOISE_FULL_GAIN). It is above 1 on purpose, because 100% noise is as loud as the beat;
 * the user volume keeps the sum clean. Every volume up to MAX_CLEAN_VOLUME stays under -1 dBFS, so no
 * limiter is needed (a DynamicsCompressor would add about +3.4 dB of makeup gain and pump with the noise).
 */
export const WORST_CASE_PEAK = TONE_HEADROOM + NOISE_PEAK * NOISE_FULL_GAIN;
/** -1 dBFS. */
export const PEAK_CEILING = Math.pow(10, -1 / 20);
/** The highest user volume at which the worst case still peaks under -1 dBFS (about 0.61; Tuck's Full is 0.42). */
export const MAX_CLEAN_VOLUME = Math.sqrt(PEAK_CEILING / WORST_CASE_PEAK);

/** Noise % (0..1) -> gain on an RMS-normalised buffer. One law, linear in amplitude: 25% = -12 dB re the beat. */
export function noiseVolumeToGain(volume: number): number {
  return clamp(fin(volume, 0), 0, 1) * NOISE_FULL_GAIN;
}

/**
 * Noise only (speaker, mono, call mode, a blind comparison's noise arm, or the Noise only switch): the noise
 * is brought up to the loudness of the layer it replaces (beat + noise at `volume`), so the fallback is never
 * quieter than what it stands in for. Loudness adds as power: sqrt(1 + v^2) x the beat's loudness.
 */
export function noiseOnlyGain(volume: number): number {
  const v = clamp(fin(volume, 0), 0, 1);
  return Math.sqrt(1 + v * v) * NOISE_FULL_GAIN;
}

/** The noise's level relative to the beat, in dB (25% -> -12.0). -Infinity at 0%. */
export function noiseDbReBeat(volume: number): number {
  const v = clamp(fin(volume, 0), 0, 1);
  return v > 0 ? 20 * Math.log10(v) : -Infinity;
}

/** The beat's RMS level per ear at a user volume, in dBFS (Medium 0.28 -> about -31). */
export function toneDbfs(volume: number): number {
  const g = volumeToGain(volume);
  return g > 0 ? 20 * Math.log10(TONE_RMS * g) : -Infinity;
}

/** The noise's RMS level per ear at a user volume and noise %, in dBFS (brown reference). */
export function noiseDbfs(volume: number, noiseVolume: number, opts: { noiseOnly?: boolean } = {}): number {
  const g = volumeToGain(volume) * (opts.noiseOnly ? noiseOnlyGain(noiseVolume) : noiseVolumeToGain(noiseVolume)) * NOISE_RMS.brown;
  return g > 0 ? 20 * Math.log10(g) : -Infinity;
}

/** dB with a true minus sign (U+2212), one decimal unless whole: "−12 dB", "−24.1 dBFS". */
export function formatDb(db: number, unit = 'dB', digits = 0): string {
  if (!Number.isFinite(db)) return `\u2212\u221E ${unit}`;
  const r = Number(db.toFixed(digits));
  const abs = Math.abs(r).toFixed(digits);
  return `${r < 0 ? '\u2212' : ''}${abs} ${unit}`;
}
/** Instant gain changes are rendered as a short linear ramp so they never click. */
export const GAIN_STEP_SEC = 0.03;
/** Fade used by dispose() while audible. */
export const DISPOSE_FADE_SEC = 0.03;
/**
 * How long start()/resume() wait for ctx.resume() before giving up with AudioBlockedError.
 * Browsers keep resume() *pending* (not rejected) when autoplay policy blocks the context.
 */
export const RESUME_TIMEOUT_MS = 500;
/** A tiny floor used when ramping gains "to zero" so exponential math never sees 0. */
const SILENT = 0.0001;

const fin = (x: number | undefined, fallback: number): number => (x !== undefined && Number.isFinite(x) ? x : fallback);

/** Perceptual volume (0..1) -> linear gain. Square law approximates loudness well enough for a slider. */
export function volumeToGain(volume: number): number {
  const v = clamp(volume, 0, 1);
  return v * v;
}

export function gainToVolume(gain: number): number {
  return Math.sqrt(clamp(gain, 0, 1));
}

/** Clamp a tone to engine limits; also guarantees beat < carrier so the left ear stays > 0 Hz. */
export function sanitizeTone(beatHz: number, carrierHz: number): { beatHz: number; carrierHz: number } {
  const carrier = clamp(carrierHz, LIMITS.carrierHz.min, LIMITS.carrierHz.max);
  const beat = clamp(beatHz, LIMITS.beatHz.min, Math.min(LIMITS.beatHz.max, carrier - 1));
  return { beatHz: beat, carrierHz: carrier };
}

interface NoiseVoice {
  type: NoiseType;
  source: AudioBufferSourceNodeLike;
  gain: GainNodeLike;
}

interface Graph {
  oscL: OscillatorNodeLike;
  oscR: OscillatorNodeLike;
  merger: AudioNodeLike;
  toneGain: GainNodeLike;
  levelGain: GainNodeLike;
  volumeGain: GainNodeLike;
  fadeGain: GainNodeLike;
}

function defaultCreateContext(): AudioContextLike {
  const g = globalThis as unknown as {
    AudioContext?: new (opts?: { latencyHint?: string }) => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API is not available in this environment');
  // 'playback' favours stability/battery over latency — we're a background layer.
  return new Ctor({ latencyHint: 'playback' });
}

/**
 * BinauralEngine — two sine oscillators hard-panned L/R through a ChannelMerger,
 * an optional looped noise bed, and a gain chain:
 *
 *   oscL ─┐
 *         ├─ merger ─ toneGain ─┐
 *   oscR ─┘                     ├─ levelGain ─ volumeGain ─ fadeGain ─ destination
 *   noise ─ noiseGain ──────────┘
 *
 * - fadeGain: click-free start/stop/pause fades (owned by the engine)
 * - volumeGain: the user's volume (owned by the UI)
 * - levelGain: the program envelope (owned by the ProgramPlayer)
 * so none of these fight each other. Headroom (see WORST_CASE_PEAK) keeps the sum below full scale.
 */
export class BinauralEngine {
  private ctx: AudioContextLike | undefined;
  private readonly createContext: () => AudioContextLike;
  private readonly clock: Clock;
  private readonly opts: Required<Omit<EngineOptions, 'context' | 'createContext' | 'clock' | 'initial'>>;
  private graph: Graph | undefined;
  private noiseVoice: NoiseVoice | undefined;
  /** Faded-out noise voices waiting to be disconnected. */
  private readonly retiringVoices = new Map<TimerHandle, NoiseVoice>();
  private readonly noiseBuffers = new Map<NoiseType, AudioBufferLike>();
  private readonly emitter = new Emitter<EngineEvents>();
  private pendingTimer: TimerHandle | undefined;
  private pendingResolve: (() => void) | undefined;
  private state: EngineState;
  private disposed = false;
  private ownsContext = false;
  /** Bumped by every transport call so a stale async start()/resume() can tell it was superseded. */
  private opSeq = 0;
  /** In-flight ctx.suspend() from pause(); start()/resume() wait for it before resuming. */
  private suspending: Promise<void> | undefined;
  private listeningCtx: AudioContextLike | undefined;
  private readonly onContextStateChange = (): void => this.handleContextState();

  constructor(options: EngineOptions = {}) {
    this.ctx = options.context;
    this.createContext = options.createContext ?? defaultCreateContext;
    this.clock = options.clock ?? systemClock;
    this.opts = {
      fadeInSec: Math.max(0, fin(options.fadeInSec, 2.5)),
      fadeOutSec: Math.max(0, fin(options.fadeOutSec, 2)),
      pauseFadeSec: Math.max(0, fin(options.pauseFadeSec, 0.4)),
      glideSec: Math.max(0, fin(options.glideSec, 0.4)),
      suspendOnPause: options.suspendOnPause ?? true,
      noiseBufferSec: Math.max(0.1, fin(options.noiseBufferSec, 8)),
      fadeCurve: options.fadeCurve === 'perceptual' ? 'perceptual' : 'linear',
    };
    const init = options.initial ?? {};
    const tone = sanitizeTone(fin(init.beatHz, 10), fin(init.carrierHz, 200));
    this.state = this.makeState('idle', tone.beatHz, tone.carrierHz, fin(init.volume, 0.3), fin(init.level, 1), init.noise);
  }

  // ───────────────────────────── state & events ─────────────────────────────

  getState(): EngineState {
    return { ...this.state, noise: { ...this.state.noise } };
  }

  /** Subscribe to every state change. Returns an unsubscribe function. */
  subscribe(fn: (state: EngineState) => void): () => void {
    return this.emitter.on('state', fn);
  }

  on<K extends keyof EngineEvents>(event: K, fn: (payload: EngineEvents[K]) => void): () => void {
    return this.emitter.on(event, fn);
  }

  /** The AudioContext (created lazily on first start). */
  get context(): AudioContextLike | undefined {
    return this.ctx;
  }

  /** Actual instantaneous L/R frequencies (reads the audio params mid-glide). */
  getCurrentFrequencies(): { leftHz: number; rightHz: number; beatHz: number; carrierHz: number } {
    if (!this.graph) {
      return { leftHz: this.state.leftHz, rightHz: this.state.rightHz, beatHz: this.state.beatHz, carrierHz: this.state.carrierHz };
    }
    const t = this.now();
    const leftHz = paramValueAt(this.graph.oscL.frequency, t);
    const rightHz = paramValueAt(this.graph.oscR.frequency, t);
    return { leftHz, rightHz, beatHz: rightHz - leftHz, carrierHz: (leftHz + rightHz) / 2 };
  }

  private makeState(
    status: EngineStatus,
    beatHz: number,
    carrierHz: number,
    volume: number,
    level: number,
    noise?: NoiseSetting,
  ): EngineState {
    const { leftHz, rightHz } = earFrequencies(carrierHz, beatHz);
    return {
      status,
      beatHz,
      carrierHz,
      leftHz,
      rightHz,
      band: bandFor(beatHz),
      volume: clamp(volume, 0, 1),
      level: clamp(level, 0, 1),
      noise: noise ? { type: noise.type, volume: clamp(fin(noise.volume, 0.3), 0, 1) } : { type: 'off', volume: 0.3 },
    };
  }

  private patch(p: Partial<EngineState>): void {
    const next = { ...this.state, ...p };
    if (p.beatHz !== undefined || p.carrierHz !== undefined) {
      const f = earFrequencies(next.carrierHz, next.beatHz);
      next.leftHz = f.leftHz;
      next.rightHz = f.rightHz;
      next.band = bandFor(next.beatHz);
    }
    this.state = next;
    this.emitter.emit('state', this.getState());
  }

  /**
   * Volume to remember for a noise change. Non-finite means "unchanged"; for type 'off' a 0 is ignored
   * too, so "noise off" never zeroes the remembered volume (turning noise back on must be audible).
   */
  private nextNoiseVolume(type: NoiseType | 'off', volume: number | undefined): number {
    const v = fin(volume, this.state.noise.volume);
    if (type === 'off' && v <= 0) return this.state.noise.volume;
    return clamp(v, 0, 1);
  }

  /** Unnarrowed read (status can change across awaits). */
  private currentStatus(): EngineStatus {
    return this.state.status;
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private ensureContext(): AudioContextLike {
    if (!this.ctx) {
      this.ctx = this.createContext();
      this.ownsContext = true;
    }
    if (this.listeningCtx !== this.ctx) {
      this.listeningCtx?.removeEventListener?.('statechange', this.onContextStateChange);
      this.ctx.addEventListener?.('statechange', this.onContextStateChange);
      this.listeningCtx = this.ctx;
    }
    return this.ctx;
  }

  /** Wait for any in-flight suspend, then resume the context. Returns whether it is actually running. */
  private async ensureRunning(ctx: AudioContextLike): Promise<boolean> {
    if (this.suspending) {
      try {
        await this.suspending;
      } catch {
        /* a failed suspend leaves the context running — fine */
      }
    }
    if (ctx.state === 'running') return true;
    // resume() can stay pending forever when blocked (no user gesture), or reject (closed context):
    // race it against a timeout on the injected clock, then trust only the resulting state.
    let timer: TimerHandle | undefined;
    await Promise.race([
      Promise.resolve()
        .then(() => ctx.resume())
        .catch(() => undefined),
      new Promise<void>((r) => {
        timer = this.clock.setTimeout(r, RESUME_TIMEOUT_MS);
      }),
    ]);
    if (timer !== undefined) this.clock.clearTimeout(timer);
    return ctx.state === 'running';
  }

  /** OS interruptions (and their end) arrive as context state changes. */
  private handleContextState(): void {
    const ctx = this.ctx;
    if (!ctx || !this.graph) return;
    if (ctx.state !== 'running') {
      if (this.state.status === 'playing') {
        this.patch({ status: 'interrupted' });
        this.emitter.emit('interrupted', this.getState());
      }
      return;
    }
    if (this.state.status === 'interrupted') {
      this.fadeInFromSilence();
      this.patch({ status: 'playing' });
      this.emitter.emit('interruptionEnded', this.getState());
    }
  }

  /** Start/stop/pause fades, in the configured curve. */
  private fade(param: GainNodeLike['gain'], target: number, now: number, sec: number): void {
    if (this.opts.fadeCurve === 'perceptual') rampFade(param, target, now, sec);
    else rampParam(param, target, now, sec, 'linear');
  }

  /** Re-ramp the fade from silence (after an interruption the param may be mid-fade or stale). */
  private fadeInFromSilence(): void {
    const g = this.graph;
    const ctx = this.ctx;
    if (!g || !ctx) return;
    const t = ctx.currentTime;
    rampParam(g.fadeGain.gain, 0, t, 0, 'linear');
    this.fade(g.fadeGain.gain, 1, t, this.opts.fadeInSec);
  }

  private cancelPending(): void {
    if (this.pendingTimer !== undefined) {
      this.clock.clearTimeout(this.pendingTimer);
      this.pendingTimer = undefined;
    }
    // Settle any awaiting stop()/pause() promise — the operation was superseded.
    const r = this.pendingResolve;
    this.pendingResolve = undefined;
    r?.();
  }

  private afterSec(sec: number, fn: () => void | Promise<void>): Promise<void> {
    this.cancelPending();
    return new Promise<void>((resolve) => {
      this.pendingResolve = resolve;
      this.pendingTimer = this.clock.setTimeout(() => {
        this.pendingTimer = undefined;
        this.pendingResolve = undefined;
        Promise.resolve()
          .then(fn)
          .catch((e: unknown) => this.emitter.emit('error', e instanceof Error ? e : new Error(String(e))))
          .finally(resolve);
      }, Math.ceil(Math.max(0, fin(sec, 0)) * 1000) + 20);
    });
  }

  // ───────────────────────────── graph ─────────────────────────────

  private buildGraph(ctx: AudioContextLike): Graph {
    const t = ctx.currentTime;
    const oscL = ctx.createOscillator();
    const oscR = ctx.createOscillator();
    oscL.type = 'sine';
    oscR.type = 'sine';
    const { leftHz, rightHz } = earFrequencies(this.state.carrierHz, this.state.beatHz);
    setParam(oscL.frequency, leftHz, t);
    setParam(oscR.frequency, rightHz, t);

    const merger = ctx.createChannelMerger(2);
    oscL.connect(merger, 0, 0); // left input
    oscR.connect(merger, 0, 1); // right input

    const toneGain = ctx.createGain();
    // setParam (tracked) rather than setValueAtTime: a fresh param's .value still reads its default (1)
    // until the next render quantum, so the hold-emulation fallback must not trust it (see webaudio.ts).
    setParam(toneGain.gain, TONE_HEADROOM, t);
    const levelGain = ctx.createGain();
    setParam(levelGain.gain, this.state.level, t);
    const volumeGain = ctx.createGain();
    setParam(volumeGain.gain, volumeToGain(this.state.volume), t);
    const fadeGain = ctx.createGain();
    setParam(fadeGain.gain, 0, t);

    merger.connect(toneGain);
    toneGain.connect(levelGain);
    levelGain.connect(volumeGain);
    volumeGain.connect(fadeGain);
    fadeGain.connect(ctx.destination);

    oscL.start(t);
    oscR.start(t);
    return { oscL, oscR, merger, toneGain, levelGain, volumeGain, fadeGain };
  }

  private disconnectVoice(v: NoiseVoice): void {
    for (const n of [v.source, v.gain]) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  private flushRetiringVoices(): void {
    for (const [handle, v] of this.retiringVoices) {
      this.clock.clearTimeout(handle);
      this.disconnectVoice(v);
    }
    this.retiringVoices.clear();
  }

  private teardown(): void {
    const g = this.graph;
    if (!g) return;
    this.stopNoiseVoice(0);
    this.flushRetiringVoices();
    const t = this.now();
    for (const osc of [g.oscL, g.oscR]) {
      try {
        osc.stop(t);
      } catch {
        /* already stopped */
      }
    }
    for (const n of [g.oscL, g.oscR, g.merger, g.toneGain, g.levelGain, g.volumeGain, g.fadeGain]) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.graph = undefined;
  }

  private getNoiseBuffer(ctx: AudioContextLike, type: NoiseType): AudioBufferLike {
    const cached = this.noiseBuffers.get(type);
    if (cached) return cached;
    const length = Math.max(1024, Math.floor(ctx.sampleRate * this.opts.noiseBufferSec));
    const buf = ctx.createBuffer(2, length, ctx.sampleRate);
    // Decorrelated L/R so the noise sounds wide rather than centred. RMS-normalised per colour (NOISE_RMS),
    // peak capped at NOISE_PEAK (see WORST_CASE_PEAK).
    buf.getChannelData(0).set(generateNoise(type, length, { seed: 11, peak: NOISE_PEAK, rms: NOISE_RMS[type] }));
    buf.getChannelData(1).set(generateNoise(type, length, { seed: 23, peak: NOISE_PEAK, rms: NOISE_RMS[type] }));
    this.noiseBuffers.set(type, buf);
    return buf;
  }

  private startNoiseVoice(type: NoiseType, volume: number, fadeSec: number): void {
    const ctx = this.ctx;
    const g = this.graph;
    if (!ctx || !g) return;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx, type);
    source.loop = true;
    const gain = ctx.createGain();
    setParam(gain.gain, 0, t);
    source.connect(gain);
    gain.connect(g.levelGain);
    source.start(t);
    rampParam(gain.gain, noiseVolumeToGain(volume), t, Math.max(fadeSec, GAIN_STEP_SEC), 'linear');
    this.noiseVoice = { type, source, gain };
  }

  private stopNoiseVoice(fadeSec: number): void {
    const v = this.noiseVoice;
    if (!v || !this.ctx) return;
    this.noiseVoice = undefined;
    const t = this.ctx.currentTime;
    const fade = Math.max(0, fin(fadeSec, 0));
    rampParam(v.gain.gain, 0, t, fade, 'linear');
    try {
      v.source.stop(t + fade + 0.05);
    } catch {
      /* ignore */
    }
    if (fade <= 0) {
      this.disconnectVoice(v);
    } else {
      const handle: TimerHandle = this.clock.setTimeout(() => {
        this.retiringVoices.delete(handle);
        this.disconnectVoice(v);
      }, Math.ceil(fade * 1000) + 100);
      this.retiringVoices.set(handle, v);
    }
  }

  private applyNoise(noise: NoiseSetting, fadeSec: number): void {
    if (!this.graph || !this.ctx) return;
    fadeSec = Math.max(fin(fadeSec, 0), GAIN_STEP_SEC); // never switch noise on/off/level instantly (click)
    const current = this.noiseVoice;
    if (noise.type === 'off' || noise.volume <= 0) {
      this.stopNoiseVoice(fadeSec);
      return;
    }
    if (current && current.type === noise.type) {
      rampParam(current.gain.gain, noiseVolumeToGain(noise.volume), this.ctx.currentTime, fadeSec, 'linear');
      return;
    }
    // Crossfade between noise colours.
    this.stopNoiseVoice(fadeSec);
    this.startNoiseVoice(noise.type, noise.volume, fadeSec);
  }

  // ───────────────────────────── transport ─────────────────────────────

  /**
   * Start (or restart) playback with a click-free fade-in.
   * Must be called from a user gesture the first time on the web (autoplay policy);
   * rejects with AudioBlockedError if the context still isn't running afterwards.
   * Resolves without starting if stop()/pause()/another start() superseded it while awaiting.
   */
  async start(params: EngineStartParams = {}): Promise<void> {
    if (this.disposed) throw new Error('Engine disposed');
    const ctx = this.ensureContext();
    this.cancelPending();
    const op = ++this.opSeq;

    const tone = sanitizeTone(fin(params.beatHz, this.state.beatHz), fin(params.carrierHz, this.state.carrierHz));
    const volume = clamp(fin(params.volume, this.state.volume), 0, 1);
    const level = clamp(fin(params.level, this.state.level), 0, 1);
    // 'off' keeps the remembered noise volume, so a later setNoise({ type }) is audible again.
    const noise = params.noise
      ? {
          type: params.noise.type,
          volume: this.nextNoiseVolume(params.noise.type, params.noise.volume),
        }
      : this.state.noise;

    const running = await this.ensureRunning(ctx);
    if (op !== this.opSeq || this.disposed) return; // superseded while awaiting
    if (!running) {
      const err = new AudioBlockedError(ctx.state);
      this.emitter.emit('error', err);
      throw err;
    }

    if (this.graph) {
      // Already have a graph (playing, paused or mid-stop): glide to new params and fade back up.
      this.state = this.makeState(this.state.status, tone.beatHz, tone.carrierHz, volume, level, noise);
      this.applyAll(this.opts.glideSec);
    } else {
      this.state = this.makeState(this.state.status, tone.beatHz, tone.carrierHz, volume, level, noise);
      this.graph = this.buildGraph(ctx);
      this.applyNoise(noise, this.opts.fadeInSec);
    }
    const g = this.graph!;
    this.fade(g.fadeGain.gain, 1, ctx.currentTime, this.opts.fadeInSec);
    this.patch({ status: 'playing' });
    this.emitter.emit('started', this.getState());
  }

  /** Fade out and release all nodes. Resolves when silent and torn down. */
  async stop(opts: { fadeSec?: number } = {}): Promise<void> {
    this.opSeq++;
    if (!this.graph || !this.ctx) {
      this.cancelPending();
      if (this.state.status !== 'idle') this.patch({ status: 'idle' });
      return;
    }
    const fade = Math.max(0, fin(opts.fadeSec, this.opts.fadeOutSec));
    if (this.state.status === 'paused' || this.state.status === 'interrupted' || this.ctx.state !== 'running') {
      // Already silent (or the context can't render a fade anyway).
      this.cancelPending();
      this.teardown();
      this.patch({ status: 'idle' });
      this.emitter.emit('stopped', this.getState());
      await this.suspendIfIdle(this.ctx);
      return;
    }
    const ctx = this.ctx;
    this.fade(this.graph.fadeGain.gain, 0, ctx.currentTime, fade);
    this.patch({ status: 'stopping' });
    await this.afterSec(fade, async () => {
      this.teardown();
      this.patch({ status: 'idle' });
      this.emitter.emit('stopped', this.getState());
      await this.suspendIfIdle(ctx);
    });
  }

  /**
   * After stop(): don't leave the context rendering silence (battery; on iOS it keeps the audio session
   * active). Uses the same `suspending` bookkeeping as pause() so a following start() awaits it.
   */
  private async suspendIfIdle(ctx: AudioContextLike): Promise<void> {
    if (!this.opts.suspendOnPause || this.disposed || this.state.status !== 'idle' || ctx.state !== 'running') return;
    await this.trackedSuspend(ctx);
  }

  /** ctx.suspend() recorded in `suspending`; if a start()/resume() raced it, make sure we end up running. */
  private async trackedSuspend(ctx: AudioContextLike): Promise<void> {
    const p = ctx.suspend();
    this.suspending = p;
    try {
      await p;
    } finally {
      if (this.suspending === p) this.suspending = undefined;
    }
    const now = this.currentStatus();
    if ((now === 'playing' || now === 'stopping') && ctx.state !== 'running') {
      await ctx.resume();
    }
  }

  /** Fade out quickly and suspend; the graph is kept so resume() is instant. */
  async pause(): Promise<void> {
    if (!this.graph || !this.ctx) return;
    const ctx = this.ctx;
    if (this.state.status === 'interrupted') {
      // Already silent: just make the pause explicit so a later context 'running' doesn't auto-resume.
      this.opSeq++;
      rampParam(this.graph.fadeGain.gain, 0, ctx.currentTime, 0, 'linear');
      this.patch({ status: 'paused' });
      this.emitter.emit('paused', this.getState());
      return;
    }
    if (this.state.status !== 'playing') return;
    this.opSeq++;
    this.fade(this.graph.fadeGain.gain, 0, ctx.currentTime, this.opts.pauseFadeSec);
    this.patch({ status: 'paused' });
    this.emitter.emit('paused', this.getState());
    await this.afterSec(this.opts.pauseFadeSec, async () => {
      if (!this.opts.suspendOnPause || this.state.status !== 'paused' || ctx.state !== 'running') return;
      await this.trackedSuspend(ctx);
    });
  }

  /** Resume after pause() or after an interruption the OS didn't end by itself. */
  async resume(): Promise<void> {
    if ((this.state.status !== 'paused' && this.state.status !== 'interrupted') || !this.graph || !this.ctx) return;
    const ctx = this.ctx;
    this.cancelPending();
    const op = ++this.opSeq;
    const running = await this.ensureRunning(ctx);
    if (op !== this.opSeq || !this.graph) return;
    if (this.currentStatus() === 'playing') return; // the statechange handler already brought us back
    if (!running) {
      const err = new AudioBlockedError(ctx.state);
      this.emitter.emit('error', err);
      throw err;
    }
    this.fade(this.graph.fadeGain.gain, 1, ctx.currentTime, this.opts.fadeInSec);
    this.patch({ status: 'playing' });
    this.emitter.emit('resumed', this.getState());
  }

  /** Toggle play/pause; starts if idle. */
  async toggle(): Promise<void> {
    if (this.state.status === 'playing') return this.pause();
    if (this.state.status === 'paused' || this.state.status === 'interrupted') return this.resume();
    return this.start();
  }

  // ───────────────────────────── parameters ─────────────────────────────

  private applyAll(glideSec: number): void {
    const g = this.graph;
    if (!g || !this.ctx) return;
    const t = this.ctx.currentTime;
    const { leftHz, rightHz } = earFrequencies(this.state.carrierHz, this.state.beatHz);
    rampParam(g.oscL.frequency, leftHz, t, glideSec, 'exponential');
    rampParam(g.oscR.frequency, rightHz, t, glideSec, 'exponential');
    rampParam(g.volumeGain.gain, volumeToGain(this.state.volume), t, Math.max(glideSec, GAIN_STEP_SEC), 'linear');
    rampParam(g.levelGain.gain, this.state.level, t, Math.max(glideSec, GAIN_STEP_SEC), 'linear');
    this.applyNoise(this.state.noise, glideSec);
  }

  /**
   * Glide any of beat / carrier / level to new values over `durationSec`.
   * Used by the ProgramPlayer; also handy for UI sliders.
   * 'step' (or a zero duration) jumps frequencies at once; level jumps get a GAIN_STEP_SEC ramp (no click).
   * Non-finite fields are ignored.
   */
  rampTo(target: Partial<ToneTarget>, durationSec: number = this.opts.glideSec, curve: RampCurve = 'exponential'): void {
    const beatIn = target.beatHz !== undefined && Number.isFinite(target.beatHz) ? target.beatHz : undefined;
    const carrierIn = target.carrierHz !== undefined && Number.isFinite(target.carrierHz) ? target.carrierHz : undefined;
    const levelIn = target.level !== undefined && Number.isFinite(target.level) ? target.level : undefined;
    const tone = sanitizeTone(beatIn ?? this.state.beatHz, carrierIn ?? this.state.carrierHz);
    const level = clamp(levelIn ?? this.state.level, 0, 1);
    const g = this.graph;
    if (g && this.ctx) {
      const t = this.ctx.currentTime;
      const dur = Math.max(0, fin(durationSec, 0));
      if (beatIn !== undefined || carrierIn !== undefined) {
        const { leftHz, rightHz } = earFrequencies(tone.carrierHz, tone.beatHz);
        rampParam(g.oscL.frequency, leftHz, t, dur, curve);
        rampParam(g.oscR.frequency, rightHz, t, dur, curve);
      }
      if (levelIn !== undefined) {
        const instant = curve === 'step' || dur <= 0;
        rampParam(g.levelGain.gain, level, t, instant ? GAIN_STEP_SEC : dur, 'linear');
      }
    }
    this.patch({ beatHz: tone.beatHz, carrierHz: tone.carrierHz, level });
  }

  setBeat(beatHz: number, glideSec = this.opts.glideSec): void {
    this.rampTo({ beatHz }, glideSec);
  }

  setCarrier(carrierHz: number, glideSec = this.opts.glideSec): void {
    this.rampTo({ carrierHz }, glideSec);
  }

  setLevel(level: number, glideSec = this.opts.glideSec): void {
    this.rampTo({ level }, glideSec, 'linear');
  }

  setVolume(volume: number, glideSec = this.opts.glideSec): void {
    if (!Number.isFinite(volume)) return;
    const v = clamp(volume, 0, 1);
    if (this.graph && this.ctx) {
      rampParam(this.graph.volumeGain.gain, volumeToGain(v), this.ctx.currentTime, Math.max(fin(glideSec, 0), GAIN_STEP_SEC), 'linear');
    }
    this.patch({ volume: v });
  }

  setNoise(noise: Partial<NoiseSetting>, fadeSec = 1.5): void {
    const type = noise.type ?? this.state.noise.type;
    const next: NoiseSetting = {
      type,
      // Switching off keeps the remembered volume so switching back on is audible.
      volume: this.nextNoiseVolume(type, noise.volume),
    };
    this.patch({ noise: next });
    if (this.graph && this.state.status !== 'idle') this.applyNoise(next, Math.max(0, fin(fadeSec, 1.5)));
  }

  /** Freeze all glides at their current values (e.g. a "hold here" button). */
  hold(): void {
    const g = this.graph;
    if (!g || !this.ctx) return;
    const t = this.ctx.currentTime;
    holdParam(g.oscL.frequency, t);
    holdParam(g.oscR.frequency, t);
    holdParam(g.levelGain.gain, t);
    const f = this.getCurrentFrequencies();
    this.patch({ beatHz: f.beatHz, carrierHz: f.carrierHz, level: paramValueAt(g.levelGain.gain, t) });
  }

  /**
   * Release everything and close the context if the engine created it.
   * While audible, fades out over DISPOSE_FADE_SEC first (no click) — the promise resolves after that.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.cancelPending();
    this.opSeq++;
    this.disposed = true;
    const ctx = this.ctx;
    const g = this.graph;
    const audible = !!g && !!ctx && ctx.state === 'running' && (this.state.status === 'playing' || this.state.status === 'stopping');
    if (audible && g && ctx) {
      const t = ctx.currentTime;
      rampParam(g.fadeGain.gain, 0, t, DISPOSE_FADE_SEC, 'linear');
      for (const osc of [g.oscL, g.oscR]) {
        try {
          osc.stop(t + DISPOSE_FADE_SEC + 0.01);
        } catch {
          /* ignore */
        }
      }
      await new Promise<void>((r) => this.clock.setTimeout(r, Math.ceil(DISPOSE_FADE_SEC * 1000) + 30));
    }
    this.teardown();
    this.flushRetiringVoices();
    this.patch({ status: 'idle' });
    this.emitter.clear();
    this.listeningCtx?.removeEventListener?.('statechange', this.onContextStateChange);
    this.listeningCtx = undefined;
    if (this.ownsContext && ctx?.close) await ctx.close();
  }
}

/** Convenience used by tests & UIs: a gain value in dBFS. */
export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, SILENT));
}
