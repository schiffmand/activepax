import { describe, expect, it, vi } from 'vitest';
import { interpretStereoCheck, planStereoCheck, runStereoCheck } from '../src/audio/stereoCheck';
import { createManualClock } from '../src/clock';
import { AudioBlockedError, BinauralEngine } from '../src/audio/engine';
import { flushMicrotasks } from './mockAudio';
import { MockAudioContext, type MockGain, type MockNode, type MockOscillator } from './mockAudio';

describe('planStereoCheck', () => {
  it('plans left then right with gaps', () => {
    const p = planStereoCheck({ toneSec: 1, gapSec: 0.5, leadInSec: 0 });
    expect(p.steps.map((s) => s.ear)).toEqual(['left', 'right']);
    expect(p.steps[0]).toMatchObject({ startSec: 0, endSec: 1 });
    expect(p.steps[1]).toMatchObject({ startSec: 1.5, endSec: 2.5 });
    expect(p.totalSec).toBe(3);
  });
  it('supports custom sequences', () => {
    expect(planStereoCheck({ sequence: ['right', 'left', 'right'] }).steps).toHaveLength(3);
  });
});

describe('runStereoCheck', () => {
  it('routes the tone to exactly one ear at a time through a merger', async () => {
    const ctx = new MockAudioContext();
    const clock = createManualClock();
    const onStep = vi.fn();
    const h = await runStereoCheck(ctx, { clock, onStep, toneSec: 1, gapSec: 0.5, leadInSec: 0, edgeSec: 0.05 });
    const [left, right] = ctx.of<MockGain>('gain');
    const merger = ctx.of<MockNode>('merger')[0]!;
    expect(left!.connections[0]).toMatchObject({ dest: merger, input: 0 });
    expect(right!.connections[0]).toMatchObject({ dest: merger, input: 1 });
    // mid left tone: left on, right off
    expect(left!.gain.valueAt(0.5)).toBeCloseTo(1);
    expect(right!.gain.valueAt(0.5)).toBeCloseTo(0);
    // mid right tone
    expect(left!.gain.valueAt(2)).toBeCloseTo(0);
    expect(right!.gain.valueAt(2)).toBeCloseTo(1);
    // soft edges (no clicks)
    expect(left!.gain.valueAt(0.025)).toBeCloseTo(0.5, 1);

    clock.advance(0);
    expect(onStep).toHaveBeenCalledWith(expect.objectContaining({ ear: 'left' }), 0);
    clock.advance(1500);
    expect(onStep).toHaveBeenLastCalledWith(expect.objectContaining({ ear: 'right' }), 1);
    clock.advance(2000);
    await expect(h.done).resolves.toEqual({ cancelled: false });
    expect(ctx.of<MockOscillator>('oscillator')[0]!.disconnected).toBe(true);
  });

  it('can be cancelled', async () => {
    const ctx = new MockAudioContext();
    const clock = createManualClock();
    const onStep = vi.fn();
    const h = await runStereoCheck(ctx, { clock, onStep, leadInSec: 0.5 });
    h.cancel();
    h.cancel();
    clock.advance(10_000);
    await expect(h.done).resolves.toEqual({ cancelled: true });
    expect(onStep).not.toHaveBeenCalled();
    expect(clock.pending()).toBe(0);
  });

  it('resumes a suspended context (e.g. after the engine paused) before scheduling, so tones are audible', async () => {
    const ctx = new MockAudioContext();
    const clock = createManualClock();
    // Engine paused with suspendOnPause: context is 'suspended' and currentTime frozen.
    const engine = new BinauralEngine({ context: ctx, clock, fadeInSec: 0.1, pauseFadeSec: 0.1 });
    await engine.start();
    const paused = engine.pause();
    ctx.tick(0.2);
    clock.advance(200);
    await paused;
    expect(ctx.state).toBe('suspended');
    const resumesBefore = ctx.resumeCalls;
    const h = await runStereoCheck(ctx, { clock, leadInSec: 0 });
    expect(ctx.resumeCalls).toBe(resumesBefore + 1);
    expect(ctx.state).toBe('running');
    h.cancel();
    await expect(h.done).resolves.toEqual({ cancelled: true });
  });

  it('rejects with AudioBlockedError (and schedules nothing) when the context will not run', async () => {
    const ctx = new MockAudioContext({ resumeBlockedState: 'suspended' });
    const clock = createManualClock();
    const onStep = vi.fn();
    await expect(runStereoCheck(ctx, { clock, onStep })).rejects.toBeInstanceOf(AudioBlockedError);
    expect(ctx.of('oscillator')).toHaveLength(0);
    clock.advance(10_000);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('does not hang when resume() never settles (autoplay block): rejects after the timeout', async () => {
    const ctx = new MockAudioContext({ deferResume: true });
    const clock = createManualClock();
    let result: unknown = 'pending';
    runStereoCheck(ctx, { clock }).then(
      () => (result = 'resolved'),
      (e: unknown) => (result = e),
    );
    await flushMicrotasks();
    expect(result).toBe('pending');
    clock.advance(600);
    await flushMicrotasks(10);
    expect(result).toBeInstanceOf(AudioBlockedError);
    expect(clock.pending()).toBe(0);
  });
});

describe('interpretStereoCheck', () => {
  it('ok when both ears are heard correctly', () => {
    expect(interpretStereoCheck([{ played: 'left', heard: 'left' }, { played: 'right', heard: 'right' }]).verdict).toBe('ok');
  });
  it('mono when both tones were heard in both ears, with Mono/Spatial Audio tips', () => {
    const r = interpretStereoCheck([{ played: 'left', heard: 'both' }, { played: 'right', heard: 'both' }]);
    expect(r.verdict).toBe('mono');
    expect(r.tips.join(' ')).toMatch(/Mono Audio/);
    expect(r.tips.join(' ')).toMatch(/Spatial Audio/);
  });
  it('swapped is reassuring, not an error', () => {
    const r = interpretStereoCheck([{ played: 'left', heard: 'right' }, { played: 'right', heard: 'left' }]);
    expect(r.verdict).toBe('swapped');
    expect(r.message).toMatch(/fine/);
  });
  it('one-ear when a side is silent', () => {
    expect(interpretStereoCheck([{ played: 'left', heard: 'left' }, { played: 'right', heard: 'none' }]).verdict).toBe('one-ear');
  });
  it('unsure for empty, unsure, or mixed answers', () => {
    expect(interpretStereoCheck([]).verdict).toBe('unsure');
    expect(interpretStereoCheck([{ played: 'left', heard: 'unsure' }]).verdict).toBe('unsure');
    expect(interpretStereoCheck([{ played: 'left', heard: 'left' }, { played: 'right', heard: 'both' }]).verdict).toBe('unsure');
  });
});
