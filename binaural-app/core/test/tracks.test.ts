import { describe, expect, it } from 'vitest';
import { GOAL_TRACKS, breathingSegments, compileProgram, getGoalTrack, sampleProgram, validateProgram } from '../src';

const HEALTH_CLAIMS = /\b(cure|treat|heal|therapy|therapeutic|anxiety relief|reduces? anxiety|proven|clinically)\b/i;

describe('goal tracks', () => {
  it('has the eight goals, each a valid program with a unique id', () => {
    expect(GOAL_TRACKS.map((t) => t.id)).toEqual([
      'meditate', 'focus', 'relax', 'unwind', 'ease-anxious', 'ready-for-sleep', 'deep-sleep', 'wake-up',
    ]);
    expect(new Set(GOAL_TRACKS.map((t) => t.program.id)).size).toBe(GOAL_TRACKS.length);
    for (const t of GOAL_TRACKS) expect(validateProgram(t.program), t.id).toEqual([]);
  });

  it('states the same length it actually plays', () => {
    for (const t of GOAL_TRACKS) {
      const c = compileProgram(t.program);
      if (t.minutes === null) {
        expect(t.program.end, t.id).toBe('hold');
        expect(c.totalSec).toBeNull();
      } else {
        expect(t.program.end, t.id).toBe('stop');
        expect(c.timedSec, t.id).toBeCloseTo(t.minutes * 60, 6);
      }
    }
  });

  it('describes sound, never an outcome', () => {
    for (const t of GOAL_TRACKS) {
      expect(`${t.plays} ${t.goodFor} ${t.goal}`, t.id).not.toMatch(HEALTH_CLAIMS);
    }
  });

  it('starts and ends on the beats its description names', () => {
    const at = (id: string, sec: number) => sampleProgram(compileProgram(getGoalTrack(id)!.program), sec).beatHz;
    expect(at('meditate', 0)).toBeCloseTo(10);
    expect(at('meditate', 8 * 60)).toBeCloseTo(6);
    expect(at('focus', 5 * 60)).toBeCloseTo(14);
    expect(at('ready-for-sleep', 30 * 60)).toBeCloseTo(3);
    expect(at('deep-sleep', 3 * 3600)).toBeCloseTo(2);
    expect(at('wake-up', 0)).toBeCloseTo(6);
    expect(at('wake-up', 10 * 60)).toBeCloseTo(16);
    expect(at('ease-anxious', 0)).toBeCloseTo(12);
    expect(at('ease-anxious', 12 * 60)).toBeCloseTo(8, 1);
  });

  it('wake-up gets louder and sleep tracks get quieter', () => {
    const level = (id: string, sec: number) => sampleProgram(compileProgram(getGoalTrack(id)!.program), sec).level;
    expect(level('wake-up', 0)).toBeLessThan(level('wake-up', 11 * 60));
    expect(level('ready-for-sleep', 44 * 60)).toBeLessThan(level('ready-for-sleep', 0));
    expect(level('deep-sleep', 2 * 3600)).toBeLessThan(level('deep-sleep', 0));
  });
});

describe('breathingSegments', () => {
  it('swells six times a minute and glides the beat monotonically', () => {
    const segs = breathingSegments(9 * 60, 12, 8);
    expect(segs).toHaveLength(9 * 6 * 2);
    expect(segs.every((s) => s.durationSec === 5)).toBe(true);
    expect(segs.map((s) => s.level)).toEqual(segs.map((_, i) => (i % 2 === 0 ? 1 : 0.6)));
    const beats = segs.map((s) => s.beatHz!);
    for (let i = 1; i < beats.length; i++) expect(beats[i]!).toBeLessThanOrEqual(beats[i - 1]!);
    expect(beats.at(-1)).toBeCloseTo(8);
  });
});
