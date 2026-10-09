import { describe, expect, it } from 'vitest';
import { generateNoise, mulberry32 } from '../src/audio/noise';

const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
/** Mean absolute first difference — high for white (bright), low for brown (dark). */
const roughness = (a: Float32Array) => {
  let s = 0;
  for (let i = 1; i < a.length; i++) s += Math.abs(a[i]! - a[i - 1]!);
  return s / (a.length - 1) / rms(a);
};

describe('mulberry32', () => {
  it('is deterministic and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('generateNoise', () => {
  const N = 48_000;
  for (const type of ['white', 'pink', 'brown'] as const) {
    it(`${type}: exact length, normalised peak, no DC, finite`, () => {
      const d = generateNoise(type, N, { seed: 3 });
      expect(d).toHaveLength(N);
      const peak = d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(peak).toBeCloseTo(0.9, 5);
      const mean = d.reduce((s, v) => s + v, 0) / N;
      expect(Math.abs(mean)).toBeLessThan(0.05);
      expect(d.every(Number.isFinite)).toBe(true);
    });
  }

  it('colours are progressively darker: white > pink > brown', () => {
    const w = roughness(generateNoise('white', N));
    const p = roughness(generateNoise('pink', N));
    const b = roughness(generateNoise('brown', N));
    expect(w).toBeGreaterThan(p);
    expect(p).toBeGreaterThan(b);
  });

  it('loops seamlessly: the wrap-around step is no bigger than typical steps', () => {
    for (const type of ['pink', 'brown'] as const) {
      const d = generateNoise(type, N, { seed: 9 });
      const steps: number[] = [];
      for (let i = 1; i < d.length; i++) steps.push(Math.abs(d[i]! - d[i - 1]!));
      steps.sort((a, b) => a - b);
      const p999 = steps[Math.floor(steps.length * 0.999)]!;
      const wrap = Math.abs(d[0]! - d[d.length - 1]!);
      expect(wrap).toBeLessThanOrEqual(p999);
    }
  });

  it('is reproducible by seed and differs across seeds', () => {
    expect(generateNoise('pink', 1000, { seed: 1 })).toEqual(generateNoise('pink', 1000, { seed: 1 }));
    expect(generateNoise('pink', 1000, { seed: 1 })).not.toEqual(generateNoise('pink', 1000, { seed: 2 }));
  });

  it('supports disabling the loop crossfade and custom peak', () => {
    const d = generateNoise('white', 1000, { loopCrossfadeSamples: 0, peak: 0.5 });
    expect(Math.max(...Array.from(d, Math.abs))).toBeCloseTo(0.5);
  });
});
