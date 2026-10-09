import { describe, expect, it } from 'vitest';
import {
  BAND_LABELS,
  clipSession,
  compareRanges,
  formatDuration,
  lastNDays,
  reflections,
  startOfDay,
  summarizeRange,
  summarizeWeek,
  timeOfDay,
  weekRange,
} from '../src/insights';
import type { SessionRecord } from '../src/store/schema';

// Local-time helpers so tests are timezone-independent.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
let n = 0;
const rec = (startedAt: number, durationSec: number, over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: `r${n++}`,
  programId: 'p',
  presetId: null,
  name: 'Focus',
  startedAt,
  durationSec,
  band: 'beta',
  bandSeconds: { beta: durationSec },
  completed: true,
  endedBy: 'user',
  ...over,
});

// Wednesday 2026-10-07 15:00 local
const NOW = at(2026, 10, 7, 15);

describe('ranges', () => {
  it('weekRange starts on Monday by default, Sunday optionally', () => {
    const w = weekRange(NOW);
    expect(new Date(w.from).getDay()).toBe(1);
    expect(w.from).toBe(at(2026, 10, 5));
    expect(w.to).toBe(at(2026, 10, 12));
    expect(weekRange(NOW, 0).from).toBe(at(2026, 10, 4));
    // Monday itself and Sunday edge
    expect(weekRange(at(2026, 10, 5, 0, 1)).from).toBe(at(2026, 10, 5));
    expect(weekRange(at(2026, 10, 11, 23, 59)).from).toBe(at(2026, 10, 5));
  });
  it('lastNDays covers the trailing days including today', () => {
    const r = lastNDays(NOW, 7);
    expect(r.to).toBe(at(2026, 10, 8));
    expect(r.from).toBe(at(2026, 10, 1));
  });
  it('startOfDay', () => {
    expect(startOfDay(NOW)).toBe(at(2026, 10, 7));
  });
});

describe('clipSession', () => {
  it('clips proportionally to the range and splits by band', () => {
    const s = rec(at(2026, 10, 4, 23, 30), 3600, { bandSeconds: { alpha: 1800, beta: 1800 } }); // 23:30 Sun -> 00:30 Mon
    const c = clipSession(s, weekRange(NOW));
    expect(c.alpha).toBeCloseTo(900);
    expect(c.beta).toBeCloseTo(900);
  });
  it('falls back to the primary band when bandSeconds is empty', () => {
    expect(clipSession(rec(NOW, 100, { bandSeconds: {}, band: 'gamma' }), weekRange(NOW))).toEqual({ gamma: 100 });
  });
  it('outside range or zero-length -> empty', () => {
    expect(clipSession(rec(at(2026, 9, 1), 100), weekRange(NOW))).toEqual({});
    expect(clipSession(rec(NOW, 0), weekRange(NOW))).toEqual({});
  });
});

describe('summarizeWeek', () => {
  const history = [
    rec(at(2026, 10, 5, 9), 3000, { name: 'Deep Work', band: 'gamma', bandSeconds: { gamma: 3000 }, feeling: 4 }),
    rec(at(2026, 10, 6, 9, 30), 1500, { name: 'Focus', feeling: 2 }),
    rec(at(2026, 10, 6, 23, 30), 3600, { name: 'Sleep', band: 'delta', bandSeconds: { theta: 1200, delta: 2400 } }), // crosses midnight
    rec(at(2026, 9, 28, 9), 5000), // last week
  ];
  const s = summarizeWeek(history, NOW);

  it('totals time per band and overall, excluding other weeks', () => {
    expect(s.sessions).toBe(3);
    expect(s.totalSec).toBeCloseTo(3000 + 1500 + 3600);
    expect(s.byBand).toMatchObject({ gamma: 3000, beta: 1500, theta: 1200, delta: 2400, alpha: 0 });
    expect(s.topBands).toEqual(['gamma', 'delta', 'beta', 'theta']);
  });
  it('returns 7 day buckets with cross-midnight sessions split', () => {
    expect(s.perDay).toHaveLength(7);
    expect(s.perDay[0]!.totalSec).toBeCloseTo(3000);
    expect(s.perDay[1]!.totalSec).toBeCloseTo(1500 + 1800);
    expect(s.perDay[2]!.totalSec).toBeCloseTo(1800);
    expect(s.perDay[2]!.byBand.delta + s.perDay[2]!.byBand.theta).toBeCloseTo(1800);
    expect(s.activeDays).toBe(3);
  });
  it('reports longest/average, time of day, favourite and average feeling', () => {
    expect(s.longestSessionSec).toBe(3600);
    expect(s.averageSessionSec).toBeCloseTo(8100 / 3);
    expect(s.byTimeOfDay.morning).toBeCloseTo(4500);
    expect(s.byTimeOfDay.night).toBeCloseTo(3600);
    expect(s.favoriteName).toBe('Sleep');
    expect(s.averageFeeling).toBe(3);
  });
  it('an empty history yields zeros and a complete set of days', () => {
    const e = summarizeWeek([], NOW);
    expect(e.totalSec).toBe(0);
    expect(e.perDay).toHaveLength(7);
    expect(e.favoriteName).toBeNull();
    expect(e.averageFeeling).toBeNull();
    expect(e.averageSessionSec).toBe(0);
    expect(reflections(e)).toEqual([]);
  });
  it('summarizeRange works for arbitrary ranges', () => {
    expect(summarizeRange(history, lastNDays(NOW, 30)).sessions).toBe(4);
  });
});

describe('copy helpers', () => {
  it('formats durations compactly', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(12 * 60)).toBe('12m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(85 * 60)).toBe('1h 25m');
  });
  it('time of day buckets', () => {
    expect(timeOfDay(at(2026, 1, 1, 6))).toBe('morning');
    expect(timeOfDay(at(2026, 1, 1, 13))).toBe('afternoon');
    expect(timeOfDay(at(2026, 1, 1, 19))).toBe('evening');
    expect(timeOfDay(at(2026, 1, 1, 2))).toBe('night');
  });
  it('reflections are short, kind, and never mention streaks or missed days', () => {
    const s = summarizeWeek([rec(at(2026, 10, 5, 9), 3000, { band: 'gamma', bandSeconds: { gamma: 3000 } })], NOW);
    const r = reflections(s);
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r[0]).toContain(BAND_LABELS.gamma.toLowerCase());
    expect(r.join(' ')).toMatch(/morning/);
    expect(r.join(' ')).toMatch(/longest stretch/);
    expect(r.join(' ').toLowerCase()).not.toMatch(/streak|missed|goal|fail|only|should/);
  });
  it('compares ranges neutrally', () => {
    const a = summarizeWeek([rec(NOW, 1000)], NOW);
    const b = summarizeWeek([rec(NOW, 1050)], NOW);
    const c = summarizeWeek([rec(NOW, 3000)], NOW);
    expect(compareRanges(b, a).direction).toBe('similar');
    expect(compareRanges(c, a)).toMatchObject({ direction: 'more', deltaSec: 2000 });
    expect(compareRanges(a, c).direction).toBe('less');
  });
});
