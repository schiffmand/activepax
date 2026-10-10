import { describe, expect, it } from 'vitest';
import { FADE_FLOOR, rampFade, paramValueAt } from '../src/audio/webaudio';
import { gainToDb } from '../src/audio/engine';
import { generateNoise } from '../src/audio/noise';
import { MockAudioContext, MockGain, MockParam } from './mockAudio';
import { makeRig } from './helpers';

const db = (g: number) => gainToDb(g);

describe('rampFade (perceptual fades)', () => {
  it('fades in evenly in dB from silence, with no jump at the start', () => {
    const ctx = new MockAudioContext();
    const p = new MockParam(ctx, 0);
    rampFade(p, 1, 0, 8);
    expect(p.valueAt(0)).toBe(0);
    // The first 50 ms is a linear step from silence to -40 dB.
    expect(p.valueAt(0.05)).toBeCloseTo(FADE_FLOOR, 4);
    // Halfway through the fade is halfway in dB (about -20 dB), not -6 dB as with a linear ramp.
    expect(db(p.valueAt(4))).toBeGreaterThan(-22);
    expect(db(p.valueAt(4))).toBeLessThan(-18);
    expect(p.valueAt(8)).toBeCloseTo(1);
    // Equal steps in time are close to equal steps in dB.
    const d1 = db(p.valueAt(3)) - db(p.valueAt(2));
    const d2 = db(p.valueAt(7)) - db(p.valueAt(6));
    expect(Math.abs(d1 - d2)).toBeLessThan(0.5);
  });

  it('fades out to true silence without hanging at the top', () => {
    const ctx = new MockAudioContext();
    const p = new MockParam(ctx, 1);
    rampFade(p, 0, 0, 20);
    expect(db(p.valueAt(10))).toBeLessThan(-18);
    expect(db(p.valueAt(10))).toBeGreaterThan(-22);
    expect(p.valueAt(20)).toBe(0);
  });

  it('tracks the curve so a later ramp starts from the real value', () => {
    const ctx = new MockAudioContext();
    const p = new MockParam(ctx, 0);
    rampFade(p, 1, 0, 8);
    expect(Math.abs(db(paramValueAt(p, 4)) - db(p.valueAt(4)))).toBeLessThan(0.5);
    expect(paramValueAt(p, 8)).toBe(1);
  });

  it('the engine uses it when fadeCurve is perceptual', async () => {
    const rig = makeRig({ fadeInSec: 8, fadeCurve: 'perceptual' });
    await rig.engine.start();
    const fadeGain = rig.ctx.of<MockGain>('gain')[3]!;
    expect(fadeGain.gain.valueAt(0)).toBe(0);
    expect(db(fadeGain.gain.valueAt(4))).toBeLessThan(-15);
    expect(fadeGain.gain.valueAt(8)).toBeCloseTo(1);
  });
});

describe('generateNoise with an RMS target', () => {
  const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  it('puts every colour at the same RMS, within the peak ceiling', () => {
    const N = 48_000 * 4;
    const levels = (['white', 'pink', 'brown'] as const).map((t) => {
      const d = generateNoise(t, N, { seed: 5, rms: 0.18, peak: 0.95 });
      const peak = d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(peak).toBeLessThanOrEqual(0.95 + 1e-6);
      return db(rms(d));
    });
    for (const l of levels) expect(l).toBeCloseTo(db(0.18), 1);
  });
  it('peak-normalises as before when no RMS target is given', () => {
    const d = generateNoise('pink', 48_000, { seed: 5 });
    expect(d.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeCloseTo(0.9, 5);
  });
});
