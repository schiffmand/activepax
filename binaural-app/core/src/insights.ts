import type { SessionRecord } from './store/schema';
import { BANDS, type Band } from './types';

/**
 * Insights are descriptive and kind. Deliberately absent: streaks, "you missed a day",
 * goals you can fail, leaderboards. The ADHD / autistic users we design for get enough
 * judgement elsewhere; this should feel like a quiet notebook, not a coach.
 */

const DAY_MS = 86_400_000;

export interface Range {
  from: number; // inclusive epoch ms
  to: number; // exclusive epoch ms
}

/** Start of the local-time day containing `t`. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Week containing `now` (local time). weekStartsOn: 0 = Sunday, 1 = Monday. */
export function weekRange(now: number, weekStartsOn: 0 | 1 = 1): Range {
  const d = new Date(startOfDay(now));
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  const from = d.getTime();
  const end = new Date(from);
  end.setDate(end.getDate() + 7);
  return { from, to: end.getTime() };
}

/** The trailing `days` days ending at the end of today. */
export function lastNDays(now: number, days: number): Range {
  const end = new Date(startOfDay(now));
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { from: start.getTime(), to: end.getTime() };
}

/** Seconds of a session that fall inside a range, split by band (proportional clipping). */
export function clipSession(s: SessionRecord, r: Range): Partial<Record<Band, number>> {
  const start = s.startedAt;
  const end = s.startedAt + s.durationSec * 1000;
  const overlap = Math.max(0, Math.min(end, r.to) - Math.max(start, r.from)) / 1000;
  if (overlap <= 0 || s.durationSec <= 0) return {};
  const fraction = overlap / s.durationSec;
  const bands = s.bandSeconds && Object.keys(s.bandSeconds).length ? s.bandSeconds : { [s.band]: s.durationSec };
  const out: Partial<Record<Band, number>> = {};
  for (const b of BANDS) {
    const v = bands[b];
    if (v) out[b] = v * fraction;
  }
  return out;
}

export interface DaySummary {
  /** Local midnight, epoch ms. */
  date: number;
  totalSec: number;
  byBand: Record<Band, number>;
}

export interface RangeSummary {
  range: Range;
  totalSec: number;
  sessions: number;
  byBand: Record<Band, number>;
  /** Bands sorted by time, most first (only bands with time). */
  topBands: Band[];
  /** Days (count) with any listening. Informational only — not a streak. */
  activeDays: number;
  longestSessionSec: number;
  averageSessionSec: number;
  perDay: DaySummary[];
  /** When during the day you tend to listen. */
  byTimeOfDay: Record<TimeOfDay, number>;
  favoriteName: string | null;
  /** Mean of optional self-reports (1..5) in range, or null if none. */
  averageFeeling: number | null;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function timeOfDay(t: number): TimeOfDay {
  const h = new Date(t).getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

const zeroBands = (): Record<Band, number> => ({ delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 });

export function summarizeRange(history: SessionRecord[], range: Range): RangeSummary {
  const byBand = zeroBands();
  const byTimeOfDay: Record<TimeOfDay, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const perDayMap = new Map<number, DaySummary>();
  const nameTime = new Map<string, number>();
  let sessions = 0;
  let longest = 0;
  let feelingSum = 0;
  let feelingN = 0;

  // Build day buckets across the range so the UI always gets a complete row.
  for (let d = startOfDay(range.from); d < range.to; d = startOfDay(d + DAY_MS + 3_600_000)) {
    perDayMap.set(d, { date: d, totalSec: 0, byBand: zeroBands() });
  }

  for (const s of history) {
    const clipped = clipSession(s, range);
    const secs = Object.values(clipped).reduce((a, b) => a + (b ?? 0), 0);
    if (secs <= 0) continue;
    sessions++;
    longest = Math.max(longest, secs);
    for (const b of BANDS) byBand[b] += clipped[b] ?? 0;
    byTimeOfDay[timeOfDay(Math.max(s.startedAt, range.from))] += secs;
    nameTime.set(s.name, (nameTime.get(s.name) ?? 0) + secs);
    if (typeof s.feeling === 'number') {
      feelingSum += s.feeling;
      feelingN++;
    }
    // Split across days (sessions can cross midnight).
    const sStart = Math.max(s.startedAt, range.from);
    const sEnd = Math.min(s.startedAt + s.durationSec * 1000, range.to);
    for (let day = startOfDay(sStart); day < sEnd; day = startOfDay(day + DAY_MS + 3_600_000)) {
      const nextDay = startOfDay(day + DAY_MS + 3_600_000);
      const part = Math.max(0, Math.min(sEnd, nextDay) - Math.max(sStart, day)) / 1000;
      if (part <= 0) continue;
      const bucket = perDayMap.get(day) ?? { date: day, totalSec: 0, byBand: zeroBands() };
      bucket.totalSec += part;
      const frac = part / secs;
      for (const b of BANDS) bucket.byBand[b] += (clipped[b] ?? 0) * frac;
      perDayMap.set(day, bucket);
    }
  }

  const totalSec = BANDS.reduce((a, b) => a + byBand[b], 0);
  const perDay = [...perDayMap.values()].sort((a, b) => a.date - b.date);
  let favoriteName: string | null = null;
  let favTime = 0;
  for (const [name, t] of nameTime) {
    if (t > favTime) {
      favTime = t;
      favoriteName = name;
    }
  }
  return {
    range,
    totalSec,
    sessions,
    byBand,
    topBands: BANDS.filter((b) => byBand[b] > 0).sort((a, b) => byBand[b] - byBand[a]),
    activeDays: perDay.filter((d) => d.totalSec > 0).length,
    longestSessionSec: longest,
    averageSessionSec: sessions ? totalSec / sessions : 0,
    perDay,
    byTimeOfDay,
    favoriteName,
    averageFeeling: feelingN ? Math.round((feelingSum / feelingN) * 10) / 10 : null,
  };
}

export function summarizeWeek(history: SessionRecord[], now: number, weekStartsOn: 0 | 1 = 1): RangeSummary {
  return summarizeRange(history, weekRange(now, weekStartsOn));
}

/** Friendly names for bands — what people *use* them for, not what they "do". */
export const BAND_LABELS: Record<Band, string> = {
  delta: 'Sleep',
  theta: 'Wind down',
  alpha: 'Calm',
  beta: 'Focus',
  gamma: 'Deep work',
};

/** "1h 25m", "12m", "45s". */
export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

/**
 * Up to three short, non-judgemental reflections. Never compares to a goal, never
 * mentions missed days. Returns [] when there's nothing worth saying.
 */
export function reflections(summary: RangeSummary): string[] {
  const out: string[] = [];
  if (summary.totalSec < 60) return out;
  const top = summary.topBands[0];
  if (top) out.push(`Most of your listening was ${BAND_LABELS[top].toLowerCase()} — ${formatDuration(summary.byBand[top])}.`);
  const tod = (Object.entries(summary.byTimeOfDay) as [TimeOfDay, number][]).sort((a, b) => b[1] - a[1])[0];
  if (tod && tod[1] > 0) out.push(`You tend to reach for it in the ${tod[0]}.`);
  if (summary.longestSessionSec >= 25 * 60) out.push(`Your longest stretch was ${formatDuration(summary.longestSessionSec)}.`);
  return out.slice(0, 3);
}

/** Compare two ranges in neutral terms (no "down 40%!" alarms). */
export function compareRanges(current: RangeSummary, previous: RangeSummary): { deltaSec: number; direction: 'more' | 'less' | 'similar' } {
  const deltaSec = current.totalSec - previous.totalSec;
  const base = Math.max(previous.totalSec, 1);
  const direction = Math.abs(deltaSec) / base < 0.15 ? 'similar' : deltaSec > 0 ? 'more' : 'less';
  return { deltaSec, direction };
}
