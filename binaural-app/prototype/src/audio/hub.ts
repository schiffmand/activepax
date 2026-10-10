/**
 * Shared Web Audio plumbing for the prototype:
 * - one AudioContext, created on the first tap (autoplay policy)
 * - a stereo router in front of the speakers that can swap left and right ("Swap left and right" setting)
 * - a routed AudioContextLike that core's BinauralEngine renders into
 * - a noise bed (core generateNoise) so the beat and the noise can be faded independently (noise only, call mode)
 */
import { generateNoise, NOISE_PEAK, NOISE_RMS, noiseOnlyGain, noiseVolumeToGain, rampFade, rampParam, setParam, TONE_HEADROOM, volumeToGain, type AudioContextLike, type NoiseSetting, type NoiseType } from '@core';

let ctx: AudioContext | null = null;
let routerIn: GainNode | null = null;
let splitter: ChannelSplitterNode | null = null;
let merger: ChannelMergerNode | null = null;
let swapped = false;

export function hasAudio(): boolean {
  return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
}

export function getContext(): AudioContext {
  if (!ctx) {
    const C = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
    ctx = new C({ latencyHint: 'playback' });
    routerIn = ctx.createGain();
    routerIn.channelCount = 2;
    routerIn.channelCountMode = 'explicit';
    routerIn.channelInterpretation = 'speakers';
    splitter = ctx.createChannelSplitter(2);
    merger = ctx.createChannelMerger(2);
    routerIn.connect(splitter);
    wireSwap();
    merger.connect(ctx.destination);
  }
  return ctx;
}

function wireSwap() {
  if (!splitter || !merger) return;
  try {
    splitter.disconnect();
  } catch {
    /* first wiring */
  }
  splitter.connect(merger, 0, swapped ? 1 : 0);
  splitter.connect(merger, 1, swapped ? 0 : 1);
}

/**
 * Swap left and right. Rewiring the splitter is instant, so if sound is running it's done inside a 50 ms dip
 * (25 ms down, rewire, 25 ms up) so it can never click. The swap doesn't change the beat (it forms either way);
 * it only keeps "L 200" true for the ear that hears it.
 */
export function setSwap(on: boolean) {
  if (swapped === on) return;
  swapped = on;
  if (!ctx || !routerIn || ctx.state !== 'running') {
    wireSwap();
    return;
  }
  const t = ctx.currentTime;
  rampParam(routerIn.gain, 0, t, 0.025, 'linear');
  setTimeout(() => {
    wireSwap();
    if (ctx && routerIn) rampParam(routerIn.gain, 1, ctx.currentTime, 0.025, 'linear');
  }, 30);
}

/**
 * Resume the context from a tap. iOS can take well over half a second to wake a Bluetooth route, so wait for
 * the context's own statechange (up to 2 s) instead of giving up early and showing a "blocked" notice while
 * sound then starts anyway.
 */
export async function ensureRunning(capMs = 2000): Promise<boolean> {
  const c = getContext();
  const isRunning = () => (c.state as string) === 'running';
  if (isRunning()) return true;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      c.removeEventListener('statechange', onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (isRunning()) finish();
    };
    const timer = setTimeout(finish, capMs);
    c.addEventListener('statechange', onChange);
    c.resume().then(() => {
      if (isRunning()) finish();
    }, finish);
  });
  return isRunning();
}

/** The input every Tuck sound connects to (passes through the L/R swap). */
export function layerInput(): AudioNode {
  getContext();
  return routerIn!;
}

/** An AudioContextLike whose destination is the swap router. Core's engine renders into it unchanged. */
export function routedContext(): AudioContextLike {
  const c = getContext();
  const dest = routerIn!;
  return {
    get currentTime() {
      return c.currentTime;
    },
    get sampleRate() {
      return c.sampleRate;
    },
    get state() {
      return c.state;
    },
    destination: dest as unknown as AudioContextLike['destination'],
    createOscillator: () => c.createOscillator() as never,
    createGain: () => c.createGain() as never,
    createChannelMerger: (n?: number) => c.createChannelMerger(n) as never,
    createDynamicsCompressor: () => c.createDynamicsCompressor() as never,
    createBufferSource: () => c.createBufferSource() as never,
    createBuffer: (ch: number, len: number, sr: number) => c.createBuffer(ch, len, sr) as never,
    resume: () => c.resume(),
    // Tuck's context is shared with the demo's "other app" audio, so it is never suspended by the layer.
    suspend: () => Promise.resolve(),
    addEventListener: (t: 'statechange', l: () => void) => c.addEventListener(t, l),
    removeEventListener: (t: 'statechange', l: () => void) => c.removeEventListener(t, l),
  };
}

// ───────────────────────────── noise bed ─────────────────────────────

/** Loop length. 30 s, so a two-hour session repeats each grain about 240 times rather than 900. */
export const NOISE_LOOP_SEC = 30;

/** Per-colour RMS (core NOISE_RMS): loudness-matched with BS.1770 K-weighting, so switching colour doesn't jump. */
export { NOISE_RMS };

const bufferCache = new Map<NoiseType, AudioBuffer>();
function noiseBuffer(type: NoiseType): AudioBuffer {
  const c = getContext();
  const cached = bufferCache.get(type);
  if (cached) return cached;
  const len = Math.floor(c.sampleRate * NOISE_LOOP_SEC);
  const buf = c.createBuffer(2, len, c.sampleRate);
  // Different seeds per ear: a wide, natural bed (decorrelated noise doesn't form a beat).
  const opts = { rms: NOISE_RMS[type], peak: NOISE_PEAK, loopCrossfadeSamples: Math.floor(c.sampleRate * 0.5) };
  buf.copyToChannel(generateNoise(type, len, { ...opts, seed: 11 }) as Float32Array<ArrayBuffer>, 0);
  buf.copyToChannel(generateNoise(type, len, { ...opts, seed: 23 }) as Float32Array<ArrayBuffer>, 1);
  bufferCache.set(type, buf);
  return buf;
}

/**
 * The noise level the shipping engines use (core noiseVolumeToGain: one linear law, 25% = 12 dB under the beat).
 * With the beat off (noise only), core noiseOnlyGain brings the noise up to the loudness of the layer it replaces.
 */
export function noiseGain(volume: number, binaural = true): number {
  return binaural ? noiseVolumeToGain(volume) : noiseOnlyGain(volume);
}

export class NoiseBed {
  private src: AudioBufferSourceNode | null = null;
  private typeGain: GainNode | null = null;
  private readonly level: GainNode;
  private readonly volume: GainNode;
  /** Drift's slow noise-level wander (±1 dB). */
  private readonly wander: GainNode;
  private readonly fade: GainNode;
  private noise: NoiseSetting = { type: 'off', volume: 0.25 };
  /** The beat is playing: noise at its own level. Off: noise only, loudness-matched to the layer. */
  private binaural = true;

  constructor() {
    const c = getContext();
    this.level = c.createGain();
    this.volume = c.createGain();
    this.wander = c.createGain();
    this.fade = c.createGain();
    setParam(this.fade.gain, 0, c.currentTime);
    setParam(this.wander.gain, 1, c.currentTime);
    this.level.connect(this.volume).connect(this.wander).connect(this.fade).connect(layerInput());
  }

  private now() {
    return getContext().currentTime;
  }

  setNoise(n: NoiseSetting, fadeSec = 1.5) {
    const c = getContext();
    const t = this.now();
    const sameType = n.type === this.noise.type && this.src;
    this.noise = { ...n };
    if (sameType && this.typeGain) {
      rampParam(this.typeGain.gain, noiseGain(n.volume, this.binaural), t, Math.max(0.03, fadeSec), 'linear');
      return;
    }
    // Crossfade to the new colour (equal loudness, so only the colour changes).
    const oldSrc = this.src;
    const oldGain = this.typeGain;
    if (oldSrc && oldGain) {
      rampParam(oldGain.gain, 0, t, Math.max(0.03, fadeSec), 'linear');
      setTimeout(() => {
        try {
          oldSrc.stop();
          oldSrc.disconnect();
          oldGain.disconnect();
        } catch {
          /* already gone */
        }
      }, fadeSec * 1000 + 100);
    }
    this.src = null;
    this.typeGain = null;
    if (n.type === 'off') return;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(n.type);
    src.loop = true;
    const g = c.createGain();
    setParam(g.gain, 0, t);
    src.connect(g).connect(this.level);
    src.start(t, Math.random() * (NOISE_LOOP_SEC - 1));
    rampParam(g.gain, noiseGain(n.volume, this.binaural), t, Math.max(0.05, fadeSec), 'linear');
    this.src = src;
    this.typeGain = g;
  }

  /** Beat on or off: the noise moves between its own level and the layer-matched noise-only level. */
  setBinaural(on: boolean, glideSec: number) {
    this.binaural = on;
    if (this.typeGain) rampParam(this.typeGain.gain, noiseGain(this.noise.volume, on), this.now(), Math.max(0.03, glideSec), 'linear');
  }

  /**
   * Mid-crossfade between beat + noise and noise only: `toneShare` is the beat's amplitude share (1 to 0).
   * The noise takes the power the beat gives up, so the total stays at the layer's loudness.
   */
  setMix(toneShare: number, glideSec: number) {
    const c = Math.min(1, Math.max(0, toneShare));
    const v = this.noise.volume;
    this.binaural = c > 0;
    if (this.typeGain) rampParam(this.typeGain.gain, noiseVolumeToGain(Math.sqrt(v * v + 1 - c * c)), this.now(), Math.max(0.03, glideSec), 'linear');
  }

  setVolume(v: number, glideSec: number) {
    rampParam(this.volume.gain, volumeToGain(v), this.now(), Math.max(0.03, glideSec), 'linear');
  }

  setLevel(v: number, glideSec: number) {
    rampParam(this.level.gain, v, this.now(), Math.max(0.03, glideSec), 'linear');
  }

  /** Drift: move the noise level to `db` (±1 dB) over `sec`. */
  wanderTo(db: number, sec: number) {
    rampParam(this.wander.gain, Math.pow(10, db / 20), this.now(), Math.max(0.03, sec), 'linear');
  }

  /** Start/stop fades: in dB, the same curve as the tones (core rampFade). */
  fadeTo(v: number, sec: number) {
    rampFade(this.fade.gain, v, this.now(), Math.max(0.03, sec));
  }

  dispose(afterSec = 0) {
    const nodes = [this.src, this.typeGain, this.level, this.volume, this.wander, this.fade];
    setTimeout(() => {
      try {
        this.src?.stop();
      } catch {
        /* */
      }
      for (const n of nodes) {
        try {
          n?.disconnect();
        } catch {
          /* */
        }
      }
    }, afterSec * 1000 + 60);
  }
}

// ───────────────────────────── chime ─────────────────────────────

/**
 * One soft chime (Take 5 end, the end of a break). Scaled to the layer: about 6 dB above the tones at
 * the current level (so about −32 dBFS at Quiet, not a fixed −24 dBFS), with a 40 ms attack.
 */
export function playChime(levelVolume: number) {
  const c = getContext();
  const t = c.currentTime + 0.02;
  const out = c.createGain();
  out.gain.value = Math.min(0.063, TONE_HEADROOM * volumeToGain(levelVolume) * 2);
  out.connect(layerInput());
  for (const [f, a] of [
    [523.25, 1],
    [784, 0.4],
    [1046.5, 0.18],
  ] as const) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.5);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.55);
  }
  setTimeout(() => out.disconnect(), 1800);
}
