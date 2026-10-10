/**
 * Loudness regression (round 2, audio engineer B1): the noise bed measured -67 dBFS RMS at Medium, 36 dB under
 * the beat, because two square laws and a 0.5 headroom were stacked. These tests pin the noise law to the
 * rendered level, with BS.1770 K-weighting, so it can't silently regress again.
 */
import { describe, expect, it } from 'vitest';
import { generateNoise } from '../src/audio/noise';
import {
  NOISE_FULL_GAIN,
  NOISE_RMS,
  TONE_HEADROOM,
  noiseDbReBeat,
  noiseDbfs,
  noiseOnlyGain,
  noiseVolumeToGain,
  toneDbfs,
  volumeToGain,
  formatDb,
} from '../src/audio/engine';
import { makeRig } from './helpers';
import type { MockBufferSource, MockGain } from './mockAudio';

const SR = 48_000;
const N = SR * 10;

function biquad(x: Float32Array, b: number[], a: number[]): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0]! * x[i]! + b[1]! * x1 + b[2]! * x2 - a[1]! * y1 - a[2]! * y2;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}
/** BS.1770 K-weighting at 48 kHz (shelf, then high-pass). */
const kWeight = (x: Float32Array) =>
  biquad(
    biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]),
    [1, -2, 1],
    [1, -1.99004745483398, 0.99007225036621],
  );
const meanSquare = (x: Float32Array) => x.reduce((s, v) => s + v * v, 0) / x.length;
/** Integrated loudness (no gating; steady signals), LKFS, stereo. */
const lkfs = (l: Float32Array, r: Float32Array) => -0.691 + 10 * Math.log10(meanSquare(kWeight(l)) + meanSquare(kWeight(r)));
const scale = (x: Float32Array, g: number) => x.map((v) => v * g);
const sine = (f: number, amp: number) => {
  const x = new Float32Array(N);
  for (let i = 0; i < N; i++) x[i] = amp * Math.sin((2 * Math.PI * f * i) / SR);
  return x;
};
const rmsDb = (x: Float32Array) => 10 * Math.log10(meanSquare(x));

const beatL = sine(200, TONE_HEADROOM);
const beatR = sine(214, TONE_HEADROOM);
const beatLoudness = lkfs(beatL, beatR);
const noise = (type: 'brown' | 'pink' | 'white') => ({
  l: generateNoise(type, N, { seed: 11, peak: 0.9, rms: NOISE_RMS[type] }),
  r: generateNoise(type, N, { seed: 23, peak: 0.9, rms: NOISE_RMS[type] }),
});

describe('noise loudness', () => {
  it('the three colours are loudness-matched (within 0.5 LU)', () => {
    const ls = (['brown', 'pink', 'white'] as const).map((t) => {
      const n = noise(t);
      return lkfs(n.l, n.r);
    });
    expect(Math.max(...ls) - Math.min(...ls)).toBeLessThan(0.5);
  });

  it('noise at 100% is as loud as the beat; 25% is 12 dB under it (one linear law)', () => {
    for (const t of ['brown', 'pink', 'white'] as const) {
      const n = noise(t);
      const full = lkfs(scale(n.l, noiseVolumeToGain(1)), scale(n.r, noiseVolumeToGain(1)));
      expect(Math.abs(full - beatLoudness)).toBeLessThan(0.5);
      const q = lkfs(scale(n.l, noiseVolumeToGain(0.25)), scale(n.r, noiseVolumeToGain(0.25)));
      expect(q - beatLoudness).toBeCloseTo(-12, 0);
    }
    expect(noiseDbReBeat(0.25)).toBeCloseTo(-12.04, 1);
    expect(noiseDbReBeat(0.5)).toBeCloseTo(-6.02, 1);
  });

  it('renders Focus at Medium as: beat about -31 dBFS RMS, noise (brown 25%) about -43 dBFS RMS', () => {
    const medium = volumeToGain(0.28);
    expect(rmsDb(scale(beatL, medium))).toBeCloseTo(-31.1, 0);
    const n = noise('brown');
    const noiseLevel = rmsDb(scale(n.l, noiseVolumeToGain(0.25) * medium));
    // The round-1 law rendered this at -67 dBFS. Target -43 ±2.
    expect(noiseLevel).toBeGreaterThan(-45);
    expect(noiseLevel).toBeLessThan(-41);
    expect(noiseDbfs(0.28, 0.25)).toBeCloseTo(noiseLevel, 0);
    expect(toneDbfs(0.28)).toBeCloseTo(-31.1, 0);
  });

  it('noise only is loudness-matched to the layer it replaces (beat + noise), within 1 LU', () => {
    for (const v of [0.2, 0.25, 0.35]) {
      const n = noise('brown');
      const layer = lkfs(
        beatL.map((b, i) => b + n.l[i]! * noiseVolumeToGain(v)),
        beatR.map((b, i) => b + n.r[i]! * noiseVolumeToGain(v)),
      );
      const only = lkfs(scale(n.l, noiseOnlyGain(v)), scale(n.r, noiseOnlyGain(v)));
      expect(Math.abs(only - layer)).toBeLessThan(1);
    }
    // Noise only, Medium, 25%: about -30 dBFS RMS (it was -67).
    expect(noiseDbfs(0.28, 0.25, { noiseOnly: true })).toBeGreaterThan(-32);
    expect(noiseDbfs(0.28, 0.25, { noiseOnly: true })).toBeLessThan(-28);
  });

  it('the engine renders that law: the noise voice gain is noiseVolumeToGain on an RMS-normalised buffer', async () => {
    const rig = makeRig({ fadeInSec: 0.1 });
    await rig.engine.start({ noise: { type: 'brown', volume: 0.25 }, volume: 0.28 });
    await rig.advance(0.5);
    const src = rig.ctx.of<MockBufferSource>('bufferSource')[0]!;
    const g = src.connections[0]!.dest as MockGain;
    expect(g.gain.value).toBeCloseTo(0.25 * NOISE_FULL_GAIN);
    const data = src.buffer!.getChannelData(0) as Float32Array;
    expect(Math.sqrt(meanSquare(data))).toBeCloseTo(NOISE_RMS.brown, 2);
    const out = 20 * Math.log10(NOISE_RMS.brown * g.gain.value * volumeToGain(0.28));
    expect(out).toBeGreaterThan(-45);
    expect(out).toBeLessThan(-41);
  });

  it('formats dB with a true minus sign', () => {
    expect(formatDb(-12.04)).toBe('−12 dB');
    expect(formatDb(-31.1, 'dBFS')).toBe('−31 dBFS');
    expect(formatDb(-24.08, 'dB', 1)).toBe('−24.1 dB');
    expect(formatDb(-Infinity)).toBe('−∞ dB');
  });
});
