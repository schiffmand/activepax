import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PROGRAMS,
  bandSecondsBetween,
  compileProgram,
  createProgram,
  getBuiltInProgram,
  presetToProgram,
  sampleProgram,
  validateProgram,
  type Program,
} from '../src/programs';
import { getBuiltInPreset } from '../src/presets';

const arrive = getBuiltInProgram('arrive')!;

describe('compileProgram', () => {
  it("compiles 'Arrive' (14→10 Hz over 8 min, then hold)", () => {
    const c = compileProgram(arrive);
    expect(c.start).toEqual({ beatHz: 14, carrierHz: 200, level: 1 });
    expect(c.steps).toHaveLength(1);
    expect(c.steps[0]).toMatchObject({ atSec: 0, durationSec: 480, to: { beatHz: 10, carrierHz: 200, level: 1 }, curve: 'exponential' });
    expect(c.end).toBe('hold');
    expect(c.totalSec).toBeNull();
    expect(c.timedSec).toBe(480);
  });

  it('chains segment targets, carrying forward unspecified values; empty segments are holds', () => {
    const p: Program = {
      id: 'x',
      name: 'X',
      start: { beatHz: 10, carrierHz: 200 },
      segments: [
        { durationSec: 60, beatHz: 20 },
        { durationSec: 30 },
        { durationSec: 60, carrierHz: 300, level: 0.5, curve: 'linear', label: 'up', noise: { type: 'pink', volume: 0.2 } },
      ],
      end: 'stop',
      endFadeSec: 5,
    };
    const c = compileProgram(p);
    expect(c.steps.map((s) => s.atSec)).toEqual([0, 60, 90]);
    expect(c.steps[1]!.from).toEqual(c.steps[1]!.to);
    expect(c.steps[2]).toMatchObject({ from: { beatHz: 20, carrierHz: 200, level: 1 }, to: { beatHz: 20, carrierHz: 300, level: 0.5 }, label: 'up', noise: { type: 'pink' } });
    expect(c.totalSec).toBe(150);
    expect(c.endFadeSec).toBe(5);
  });

  it('is pure (does not mutate input) and deterministic', () => {
    const snapshot = JSON.stringify(arrive);
    expect(compileProgram(arrive)).toEqual(compileProgram(arrive));
    expect(JSON.stringify(arrive)).toBe(snapshot);
  });
});

describe('sampleProgram', () => {
  const c = compileProgram(arrive);
  it('starts at the start values and reaches the target at the segment end', () => {
    expect(sampleProgram(c, 0).beatHz).toBeCloseTo(14);
    expect(sampleProgram(c, 480).beatHz).toBeCloseTo(10);
    expect(sampleProgram(c, 10_000)).toMatchObject({ beatHz: 10, phase: 'after', stepIndex: 0 });
    expect(sampleProgram(c, -5).beatHz).toBeCloseTo(14);
  });
  it('interpolates each ear exponentially (as the engine does) and derives the beat', () => {
    // Arrive: carrier 200, beat 14 -> 10. L 193 -> 195, R 207 -> 205.
    const mid = sampleProgram(c, 240);
    const L = Math.sqrt(193 * 195);
    const R = Math.sqrt(207 * 205);
    expect(mid.beatHz).toBeCloseTo(R - L, 9);
    expect(mid.carrierHz).toBeCloseTo((L + R) / 2, 9);
    expect(sampleProgram(c, 240).phase).toBe('ramp');
  });
  it('is monotonic during a ramp', () => {
    let prev = Infinity;
    for (let t = 0; t <= 480; t += 10) {
      const v = sampleProgram(c, t).beatHz;
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
  it('linear level and step curves', () => {
    const p = compileProgram({ id: 'l', name: 'L', start: { beatHz: 10, carrierHz: 200, level: 1 }, segments: [{ durationSec: 100, level: 0, curve: 'linear', beatHz: 20 }, { durationSec: 10, beatHz: 5, curve: 'step' }], end: 'stop' });
    expect(sampleProgram(p, 50).level).toBeCloseTo(0.5);
    expect(sampleProgram(p, 50).beatHz).toBeCloseTo(15);
    // 'step' jumps at the START of its segment (same as the engine)
    expect(sampleProgram(p, 99.9).beatHz).toBeCloseTo(20, 1);
    expect(sampleProgram(p, 100).beatHz).toBeCloseTo(5, 9);
    expect(sampleProgram(p, 105).beatHz).toBeCloseTo(5, 9);
  });
  it('labels and phases', () => {
    const d = compileProgram(getBuiltInProgram('deep-work-block')!);
    expect(sampleProgram(d, 60)).toMatchObject({ label: 'Going in', phase: 'ramp', stepIndex: 0 });
    expect(sampleProgram(d, 20 * 60)).toMatchObject({ label: 'Deep', phase: 'hold', stepIndex: 1, beatHz: 40 });
  });
  it('a preset program holds forever', () => {
    const p = compileProgram(presetToProgram(getBuiltInPreset('calm')!));
    expect(sampleProgram(p, 99_999)).toMatchObject({ beatHz: 10, stepIndex: -1, phase: 'hold' });
  });
});

describe('bandSecondsBetween', () => {
  it('splits time across bands as the beat crosses boundaries', () => {
    const c = compileProgram(arrive); // 14 (beta) -> 10 (alpha)
    const r = bandSecondsBetween(c, 0, 600);
    expect((r.beta ?? 0) + (r.alpha ?? 0)).toBeCloseTo(600);
    // crosses 13 Hz where R(t) - L(t) = 13 with each ear exponential (L 193->195, R 207->205)
    let tCross = 0;
    while (207 * Math.pow(205 / 207, tCross / 480) - 193 * Math.pow(195 / 193, tCross / 480) > 13) tCross += 0.01;
    expect(Math.abs(r.beta! - tCross)).toBeLessThanOrEqual(1);
  });
  it('handles empty and fractional ranges', () => {
    const c = compileProgram(arrive);
    expect(bandSecondsBetween(c, 10, 10)).toEqual({});
    expect(bandSecondsBetween(c, 0, 0.5)).toEqual({ beta: 0.5 });
  });
});

describe('validation & built-ins', () => {
  it('all built-in programs are valid and non-medical', () => {
    for (const p of BUILT_IN_PROGRAMS) {
      expect(validateProgram(p)).toEqual([]);
      expect(`${p.name} ${p.tagline}`.toLowerCase()).not.toMatch(/cure|treat|heal|adhd|insomnia|proven/);
    }
  });
  it('deep work block totals 50 minutes and ends itself', () => {
    const c = compileProgram(getBuiltInProgram('deep-work-block')!);
    expect(c.totalSec).toBe(50 * 60);
  });
  it('flags invalid segments with their position', () => {
    const errors = validateProgram({ id: 'b', name: 'B', start: { beatHz: 10, carrierHz: 200 }, segments: [{ durationSec: -1 }, { durationSec: 10, beatHz: 300 }, { durationSec: 1, level: 2 }], end: 'hold' });
    expect(errors.some((e) => e.startsWith('Segment 1'))).toBe(true);
    expect(errors.some((e) => e.startsWith('Segment 2'))).toBe(true);
    expect(errors.some((e) => e.startsWith('Segment 3'))).toBe(true);
  });
  it('requires a name, id, valid start, and segments for self-ending programs', () => {
    const errors = validateProgram({ id: '', name: '', start: { beatHz: 50, carrierHz: 20 }, segments: [], end: 'stop' });
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(createProgram(arrive)).toEqual({ ok: true, value: arrive });
    expect(createProgram({ ...arrive, name: '' }).ok).toBe(false);
  });
  it('presetToProgram carries tone, noise and volume', () => {
    const p = presetToProgram(getBuiltInPreset('sleep')!);
    expect(p).toMatchObject({ id: 'preset:sleep', presetId: 'sleep', end: 'hold', volume: 0.22, start: { beatHz: 2, noise: { type: 'brown' } } });
  });
});
