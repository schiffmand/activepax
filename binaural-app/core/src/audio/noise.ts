import type { NoiseType } from '../types';

/** Deterministic PRNG (mulberry32) so generated noise is reproducible across platforms/tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface NoiseOptions {
  seed?: number;
  /** Peak amplitude after normalisation (0..1). */
  peak?: number;
  /** Samples used to cross-fade the tail into the head so the loop has no click. 0 disables. */
  loopCrossfadeSamples?: number;
}

/**
 * Generate a mono noise buffer of exactly `length` samples, already made seamlessly loopable.
 * - white: flat spectrum
 * - pink: -3 dB/oct (Paul Kellet's refined filter)
 * - brown: -6 dB/oct (leaky integrator), DC removed
 */
export function generateNoise(type: NoiseType, length: number, opts: NoiseOptions = {}): Float32Array {
  const { seed = 1, peak = 0.9 } = opts;
  const xfade = Math.max(0, Math.min(opts.loopCrossfadeSamples ?? Math.floor(length * 0.05), Math.floor(length / 2)));
  const rawLen = length + xfade;
  const rand = mulberry32(seed);
  const raw = new Float32Array(rawLen);

  if (type === 'white') {
    for (let i = 0; i < rawLen; i++) raw[i] = rand() * 2 - 1;
  } else if (type === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < rawLen; i++) {
      const w = rand() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < rawLen; i++) {
      const w = rand() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      raw[i] = last;
    }
  }

  // Remove DC offset (matters for brown noise).
  let mean = 0;
  for (let i = 0; i < rawLen; i++) mean += raw[i]!;
  mean /= rawLen;
  for (let i = 0; i < rawLen; i++) raw[i] = raw[i]! - mean;

  // Seamless loop: out[i] for i < xfade blends the overflow tail (raw[length+i]) into the head,
  // so out[length-1] -> out[0] continues raw[length-1] -> raw[length] without a jump.
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    if (i < xfade) {
      const t = (i + 0.5) / xfade;
      // equal-power crossfade
      out[i] = raw[i]! * Math.sin((t * Math.PI) / 2) + raw[length + i]! * Math.cos((t * Math.PI) / 2);
    } else {
      out[i] = raw[i]!;
    }
  }

  let max = 0;
  for (let i = 0; i < length; i++) max = Math.max(max, Math.abs(out[i]!));
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < length; i++) out[i] = out[i]! * k;
  }
  return out;
}
