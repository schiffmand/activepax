/**
 * Wall-clock + timer abstraction so engine/scheduler logic is deterministic in tests
 * and can be backed by native timers later.
 */
export type TimerHandle = unknown;

export interface Clock {
  /**
   * Monotonic milliseconds from an arbitrary origin. Used for ALL elapsed/duration math, so wall-clock
   * changes (NTP, time zone, manual change) never make timers or step boundaries fire early or late.
   */
  now(): number;
  /** Wall-clock milliseconds since epoch, only for timestamps (startedAt / endedAt). Defaults to now(). */
  wallNow?(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

const perf = (globalThis as { performance?: { now(): number } }).performance;

export const systemClock: Clock = {
  now: perf && typeof perf.now === 'function' ? () => perf.now() : () => Date.now(),
  wallNow: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

/** Wall-clock timestamp from a clock (falls back to now() for clocks without wallNow). */
export function wallNow(clock: Clock): number {
  return clock.wallNow ? clock.wallNow() : clock.now();
}

export interface ManualClock extends Clock {
  /** Advance time, firing due timers in order. */
  advance(ms: number): void;
  /** Number of pending timers. */
  pending(): number;
}

/** A deterministic clock for tests, storybooks and demo "time-lapse" modes. */
export function createManualClock(startMs = 0): ManualClock {
  let now = startMs;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void; seq: number }>();
  return {
    now: () => now,
    wallNow: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: now + (Number.isFinite(ms) ? Math.max(0, ms) : 0), fn, seq: id });
      return id;
    },
    clearTimeout(h) {
      timers.delete(h as number);
    },
    pending: () => timers.size,
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let next: [number, { at: number; fn: () => void; seq: number }] | undefined;
        for (const entry of timers) {
          if (entry[1].at <= target && (!next || entry[1].at < next[1].at || (entry[1].at === next[1].at && entry[1].seq < next[1].seq))) {
            next = entry;
          }
        }
        if (!next) break;
        timers.delete(next[0]);
        now = Math.max(now, next[1].at);
        next[1].fn();
      }
      now = target;
    },
  };
}
