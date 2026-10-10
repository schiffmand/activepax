import { createManualClock, type ManualClock } from '../src/clock';
import { BinauralEngine, type EngineOptions } from '../src/audio/engine';
import { MockAudioContext, flushMicrotasks, type MockContextOptions } from './mockAudio';

export interface Rig {
  ctx: MockAudioContext;
  clock: ManualClock;
  engine: BinauralEngine;
  /** Advance wall clock and audio clock together, then flush promise chains. */
  advance(sec: number, stepMs?: number): Promise<void>;
}

export function makeRig(opts: Partial<EngineOptions> = {}, ctxOpts: MockContextOptions = {}): Rig {
  const ctx = new MockAudioContext(ctxOpts);
  const clock = createManualClock(1_700_000_000_000);
  const engine = new BinauralEngine({ context: ctx, clock, ...opts });
  return {
    ctx,
    clock,
    engine,
    async advance(sec: number, stepMs = 50) {
      // step in small increments so timers see roughly-correct audio time
      let remaining = Math.round(sec * 1000);
      while (remaining > 0) {
        const d = Math.min(stepMs, remaining);
        ctx.tick(d / 1000);
        clock.advance(d);
        remaining -= d;
        await flushMicrotasks();
      }
      await flushMicrotasks(10);
    },
  };
}
