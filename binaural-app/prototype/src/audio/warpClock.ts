import type { Clock, TimerHandle } from '@core';

/**
 * A real-time Clock (core `Clock` interface) that the demo can jump forward ("time-lapse"), so a 25-minute
 * timer can be shown ending without waiting. Timers that become due during a jump fire in order, exactly
 * like core's createManualClock; otherwise they run on real setTimeout.
 */
export interface WarpClock extends Clock {
  skip(ms: number): void;
  offsetMs(): number;
}

export function createWarpClock(): WarpClock {
  let offset = 0;
  let seq = 0;
  const perf = globalThis.performance;
  const real = () => perf.now();
  const timers = new Map<number, { at: number; fn: () => void; handle: ReturnType<typeof setTimeout> | undefined }>();
  const now = () => real() + offset;

  const arm = (id: number) => {
    const t = timers.get(id);
    if (!t) return;
    if (t.handle !== undefined) clearTimeout(t.handle);
    t.handle = setTimeout(() => {
      const cur = timers.get(id);
      if (!cur) return;
      timers.delete(id);
      cur.fn();
    }, Math.max(0, t.at - now()));
  };

  return {
    now,
    wallNow: () => Date.now() + offset,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: now() + (Number.isFinite(ms) ? Math.max(0, ms) : 0), fn, handle: undefined });
      arm(id);
      return id as TimerHandle;
    },
    clearTimeout(h) {
      const t = timers.get(h as number);
      if (t?.handle !== undefined) clearTimeout(t.handle);
      timers.delete(h as number);
    },
    offsetMs: () => offset,
    skip(ms) {
      if (!(ms > 0)) return;
      offset += ms;
      // Fire everything now due, earliest first (callbacks may schedule more timers).
      for (;;) {
        let next: [number, { at: number; fn: () => void; handle: ReturnType<typeof setTimeout> | undefined }] | undefined;
        for (const e of timers) if (e[1].at <= now() && (!next || e[1].at < next[1].at)) next = e;
        if (!next) break;
        if (next[1].handle !== undefined) clearTimeout(next[1].handle);
        timers.delete(next[0]);
        next[1].fn();
      }
      for (const id of [...timers.keys()]) arm(id);
    },
  };
}
