/**
 * Shared Web Audio plumbing for the prototype:
 * - one AudioContext, created on the first tap (autoplay policy)
 * - a stereo router in front of the speakers that can swap left and right ("Swap left and right" setting)
 * - a routed AudioContextLike that core's BinauralEngine renders into
 * - a noise bed (core generateNoise) so the beat and the noise can be faded independently (noise only, call mode)
 */
import { generateNoise, rampParam, setParam, volumeToGain, type AudioContextLike, type NoiseSetting, type NoiseType } from '@core';

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

export function setSwap(on: boolean) {
  if (swapped === on) return;
  swapped = on;
  wireSwap();
}

export async function ensureRunning(): Promise<boolean> {
  const c = getContext();
  if (c.state !== 'running') {
    try {
      await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 600))]);
    } catch {
      /* fallthrough */
    }
  }
  return c.state === 'running';
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

const bufferCache = new Map<NoiseType, AudioBuffer>();
function noiseBuffer(type: NoiseType): AudioBuffer {
  const c = getContext();
  const cached = bufferCache.get(type);
  if (cached) return cached;
  const len = Math.floor(c.sampleRate * 8);
  const buf = c.createBuffer(2, len, c.sampleRate);
  // Different seeds per ear: a wide, natural bed (decorrelated noise doesn't form a beat).
  buf.copyToChannel(generateNoise(type, len, { seed: 11 }) as Float32Array<ArrayBuffer>, 0);
  buf.copyToChannel(generateNoise(type, len, { seed: 23 }) as Float32Array<ArrayBuffer>, 1);
  bufferCache.set(type, buf);
  return buf;
}

/** Same headroom as core's engine (NOISE_HEADROOM). */
const NOISE_HEADROOM = 0.5;

export class NoiseBed {
  private src: AudioBufferSourceNode | null = null;
  private typeGain: GainNode | null = null;
  private readonly level: GainNode;
  private readonly volume: GainNode;
  private readonly fade: GainNode;
  private noise: NoiseSetting = { type: 'off', volume: 0.25 };

  constructor() {
    const c = getContext();
    this.level = c.createGain();
    this.volume = c.createGain();
    this.fade = c.createGain();
    setParam(this.fade.gain, 0, c.currentTime);
    this.level.connect(this.volume).connect(this.fade).connect(layerInput());
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
      rampParam(this.typeGain.gain, n.volume * NOISE_HEADROOM, t, fadeSec, 'linear');
      return;
    }
    // Crossfade to the new colour.
    const oldSrc = this.src;
    const oldGain = this.typeGain;
    if (oldSrc && oldGain) {
      rampParam(oldGain.gain, 0, t, fadeSec, 'linear');
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
    src.start(t, Math.random() * 6);
    rampParam(g.gain, n.volume * NOISE_HEADROOM, t, Math.max(0.05, fadeSec), 'linear');
    this.src = src;
    this.typeGain = g;
  }

  setVolume(v: number, glideSec: number) {
    rampParam(this.volume.gain, volumeToGain(v), this.now(), Math.max(0.03, glideSec), 'linear');
  }

  setLevel(v: number, glideSec: number) {
    rampParam(this.level.gain, v, this.now(), Math.max(0.03, glideSec), 'linear');
  }

  fadeTo(v: number, sec: number) {
    rampParam(this.fade.gain, v, this.now(), Math.max(0.03, sec), 'linear');
  }

  dispose(afterSec = 0) {
    const nodes = [this.src, this.typeGain, this.level, this.volume, this.fade];
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

/** One soft chime, −24 dBFS, 1.5 s (Take 5 end). */
export function playChime() {
  const c = getContext();
  const t = c.currentTime + 0.02;
  const out = c.createGain();
  out.gain.value = 0.063; // −24 dBFS
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
    g.gain.linearRampToValueAtTime(a, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.5);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.55);
  }
  setTimeout(() => out.disconnect(), 1800);
}
