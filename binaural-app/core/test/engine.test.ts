import { describe, expect, it, vi } from 'vitest';
import {
  BinauralEngine,
  AudioBlockedError,
  DISPOSE_FADE_SEC,
  GAIN_STEP_SEC,
  NOISE_FULL_GAIN,
  MAX_CLEAN_VOLUME,
  PEAK_CEILING,
  TONE_HEADROOM,
  RESUME_TIMEOUT_MS,
  WORST_CASE_PEAK,
  gainToDb,
  gainToVolume,
  sanitizeTone,
  volumeToGain,
  type EngineState,
} from '../src/audio/engine';
import { MockAudioContext, MockBufferSource, MockParam, MockGain, MockOscillator, flushMicrotasks, type MockNode } from './mockAudio';
import { makeRig } from './helpers';

function graph(ctx: MockAudioContext) {
  const oscs = ctx.of<MockOscillator>('oscillator');
  const gains = ctx.of<MockGain>('gain');
  const merger = ctx.of<MockNode>('merger')[0]!;
  // creation order in engine: toneGain, levelGain, volumeGain, fadeGain
  const [toneGain, levelGain, volumeGain, fadeGain] = gains;
  return { oscL: oscs[0]!, oscR: oscs[1]!, merger, toneGain: toneGain!, levelGain: levelGain!, volumeGain: volumeGain!, fadeGain: fadeGain! };
}

describe('volume helpers', () => {
  it('maps perceptual volume to gain with a square law and back', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25);
    expect(volumeToGain(2)).toBe(1);
    expect(volumeToGain(-1)).toBe(0);
    expect(gainToVolume(0.25)).toBeCloseTo(0.5);
    expect(gainToDb(1)).toBeCloseTo(0);
    expect(gainToDb(0)).toBeCloseTo(-80);
  });

  it('sanitizes tones to limits and keeps beat below carrier', () => {
    expect(sanitizeTone(100, 200)).toEqual({ beatHz: 45, carrierHz: 200 });
    expect(sanitizeTone(0.1, 200).beatHz).toBe(0.5);
    expect(sanitizeTone(10, 5000).carrierHz).toBe(1000);
    expect(sanitizeTone(44, 40)).toEqual({ beatHz: 39, carrierHz: 40 });
    expect(sanitizeTone(NaN, NaN)).toEqual({ beatHz: 0.5, carrierHz: 40 });
  });
});

describe('BinauralEngine graph', () => {
  it('builds L/R oscillators hard-panned through a ChannelMerger into a gain chain with headroom', async () => {
    const { ctx, engine } = makeRig({ initial: { beatHz: 10, carrierHz: 200, volume: 0.5 } });
    await engine.start();
    const g = graph(ctx);
    expect(ctx.state).toBe('running');
    expect(g.oscL.type).toBe('sine');
    expect(g.oscL.frequency.value).toBeCloseTo(195);
    expect(g.oscR.frequency.value).toBeCloseTo(205);
    // hard panning: L -> merger input 0, R -> merger input 1
    expect(g.oscL.connections[0]).toMatchObject({ dest: g.merger, output: 0, input: 0 });
    expect(g.oscR.connections[0]).toMatchObject({ dest: g.merger, output: 0, input: 1 });
    expect(g.merger.connections[0]!.dest).toBe(g.toneGain);
    expect(g.toneGain.connections[0]!.dest).toBe(g.levelGain);
    expect(g.levelGain.connections[0]!.dest).toBe(g.volumeGain);
    expect(g.volumeGain.connections[0]!.dest).toBe(g.fadeGain);
    expect(g.fadeGain.connections[0]!.dest).toBe(ctx.destination);
    expect(ctx.of('compressor')).toHaveLength(0); // no limiter: headroom does the job without makeup gain
    expect(g.toneGain.gain.value).toBe(TONE_HEADROOM);
    expect(g.volumeGain.gain.value).toBeCloseTo(0.25);
    // 100% noise is as loud as the beat, so the sum can pass 1 before the user volume; any volume up to
    // MAX_CLEAN_VOLUME keeps it under -1 dBFS, and Tuck's loudest level (Full, 0.42) is well under that.
    expect(WORST_CASE_PEAK * volumeToGain(MAX_CLEAN_VOLUME)).toBeLessThanOrEqual(PEAK_CEILING + 1e-9);
    expect(MAX_CLEAN_VOLUME).toBeGreaterThan(0.42);
    expect(g.oscL.startedAt).toBe(0);
  });

  it('creates the context lazily via createContext and closes it on dispose', async () => {
    const ctx = new MockAudioContext();
    const createContext = vi.fn(() => ctx);
    const engine = new BinauralEngine({ createContext });
    expect(engine.context).toBeUndefined();
    await engine.start();
    expect(createContext).toHaveBeenCalledTimes(1);
    await engine.dispose();
    expect(ctx.state).toBe('closed');
    await expect(engine.start()).rejects.toThrow(/disposed/);
  });

  it('does not close an injected context on dispose', async () => {
    const rig = makeRig();
    const { ctx, engine } = rig;
    await engine.start();
    await Promise.all([engine.dispose(), rig.advance(0.1, 10)]);
    expect(ctx.state).toBe('running');
  });

  it('throws helpfully when Web Audio is unavailable', async () => {
    const engine = new BinauralEngine();
    await expect(engine.start()).rejects.toThrow(/Web Audio/);
  });
});

describe('fades', () => {
  it('fades in from silence without a click', async () => {
    const rig = makeRig({ fadeInSec: 2 });
    await rig.engine.start();
    const { fadeGain } = graph(rig.ctx);
    expect(fadeGain.gain.valueAt(0)).toBe(0);
    expect(fadeGain.gain.valueAt(1)).toBeCloseTo(0.5);
    expect(fadeGain.gain.valueAt(2)).toBeCloseTo(1);
  });

  it('stop() fades out, then tears down every node', async () => {
    const rig = makeRig({ fadeInSec: 1, fadeOutSec: 2 });
    await rig.engine.start();
    await rig.advance(1);
    const g = graph(rig.ctx);
    const states: string[] = [];
    rig.engine.subscribe((s) => states.push(s.status));
    const stopped = vi.fn();
    rig.engine.on('stopped', stopped);
    const p = rig.engine.stop();
    expect(rig.engine.getState().status).toBe('stopping');
    await rig.advance(1);
    expect(g.fadeGain.gain.value).toBeCloseTo(0.5, 1);
    expect(stopped).not.toHaveBeenCalled();
    await rig.advance(1.2);
    await p;
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(rig.engine.getState().status).toBe('idle');
    expect(g.oscL.stoppedAt).not.toBeNull();
    expect(g.oscL.disconnected && g.oscR.disconnected && g.fadeGain.disconnected).toBe(true);
    expect(states).toEqual(['stopping', 'idle']);
  });

  it('stop({fadeSec}) overrides the fade length', async () => {
    const rig = makeRig({ fadeOutSec: 10 });
    await rig.engine.start();
    const p = rig.engine.stop({ fadeSec: 0.5 });
    await rig.advance(0.6);
    await p;
    expect(rig.engine.getState().status).toBe('idle');
  });

  it('start() during a fade-out cancels teardown and fades back up on the same graph', async () => {
    const rig = makeRig({ fadeInSec: 1, fadeOutSec: 2 });
    await rig.engine.start();
    await rig.advance(1);
    const stopP = rig.engine.stop();
    await rig.advance(0.5);
    await rig.engine.start({ beatHz: 6 });
    await stopP; // superseded promise still settles
    await rig.advance(3);
    const g = graph(rig.ctx);
    expect(rig.ctx.of('oscillator')).toHaveLength(2);
    expect(g.oscL.disconnected).toBe(false);
    expect(rig.engine.getState().status).toBe('playing');
    expect(g.fadeGain.gain.value).toBeCloseTo(1);
    expect(rig.engine.getCurrentFrequencies().beatHz).toBeCloseTo(6);
    // Derived state must follow too (UIs show band and ear frequencies).
    expect(rig.engine.getState()).toMatchObject({ beatHz: 6, band: 'theta', leftHz: 197, rightHz: 203 });
  });

  it('start() with new params on a playing graph recomputes band and ear frequencies', async () => {
    const rig = makeRig({ initial: { beatHz: 10, carrierHz: 200 } });
    await rig.engine.start();
    await rig.engine.start({ beatHz: 40, carrierHz: 300 });
    expect(rig.engine.getState()).toMatchObject({ beatHz: 40, carrierHz: 300, band: 'gamma', leftHz: 280, rightHz: 320 });
  });

  it('stop() when idle is a no-op', async () => {
    const rig = makeRig();
    await rig.engine.stop();
    expect(rig.engine.getState().status).toBe('idle');
  });
});

describe('pause / resume', () => {
  it('pauses with a short fade and suspends the context, then resumes with a fade-in', async () => {
    const rig = makeRig({ fadeInSec: 1, pauseFadeSec: 0.4 });
    await rig.engine.start();
    await rig.advance(1.5);
    const p = rig.engine.pause();
    expect(rig.engine.getState().status).toBe('paused');
    await rig.advance(0.5);
    await p;
    expect(rig.ctx.state).toBe('suspended');
    expect(graph(rig.ctx).fadeGain.gain.value).toBeCloseTo(0);
    await rig.engine.resume();
    expect(rig.ctx.state).toBe('running');
    expect(rig.engine.getState().status).toBe('playing');
    await rig.advance(1.1);
    expect(graph(rig.ctx).fadeGain.gain.value).toBeCloseTo(1);
  });

  it('resume before the pause fade completes does not suspend', async () => {
    const rig = makeRig({ pauseFadeSec: 1 });
    await rig.engine.start();
    void rig.engine.pause();
    await rig.advance(0.3);
    await rig.engine.resume();
    await rig.advance(2);
    expect(rig.ctx.suspendCalls).toBe(0);
    expect(rig.engine.getState().status).toBe('playing');
  });

  it('respects suspendOnPause: false', async () => {
    const rig = makeRig({ suspendOnPause: false });
    await rig.engine.start();
    const p = rig.engine.pause();
    await rig.advance(1);
    await p;
    expect(rig.ctx.suspendCalls).toBe(0);
  });

  it('toggle() cycles idle -> playing -> paused -> playing', async () => {
    const rig = makeRig();
    await rig.engine.toggle();
    expect(rig.engine.getState().status).toBe('playing');
    const p = rig.engine.toggle();
    await rig.advance(1);
    await p;
    expect(rig.engine.getState().status).toBe('paused');
    await rig.engine.toggle();
    expect(rig.engine.getState().status).toBe('playing');
  });

  it('stop() while paused tears down immediately', async () => {
    const rig = makeRig();
    await rig.engine.start();
    const p = rig.engine.pause();
    await rig.advance(1);
    await p;
    await rig.engine.stop();
    expect(rig.engine.getState().status).toBe('idle');
    expect(graph(rig.ctx).oscL.disconnected).toBe(true);
  });

  it('pause/resume are no-ops in the wrong state', async () => {
    const rig = makeRig();
    await rig.engine.pause();
    await rig.engine.resume();
    expect(rig.engine.getState().status).toBe('idle');
  });
});

describe('parameter changes', () => {
  it('glides beat frequency smoothly (exponential ramp on both ears, no jumps)', async () => {
    const rig = makeRig({ initial: { beatHz: 10, carrierHz: 200 } });
    await rig.engine.start();
    rig.engine.setBeat(20, 2);
    const g = graph(rig.ctx);
    expect(g.oscL.frequency.value).toBeCloseTo(195); // no jump at t0
    await rig.advance(1);
    const mid = g.oscL.frequency.value;
    expect(mid).toBeLessThan(195);
    expect(mid).toBeGreaterThan(190);
    await rig.advance(1.1);
    expect(g.oscL.frequency.value).toBeCloseTo(190);
    expect(g.oscR.frequency.value).toBeCloseTo(210);
    expect(rig.engine.getCurrentFrequencies().beatHz).toBeCloseTo(20);
    expect(g.oscL.frequency.calls.some((c) => c.startsWith('exp('))).toBe(true);
  });

  it('a new glide mid-ramp starts from the current value (cancel-and-hold)', async () => {
    const rig = makeRig({ initial: { beatHz: 10, carrierHz: 200 } });
    await rig.engine.start();
    rig.engine.setCarrier(400, 4);
    await rig.advance(2);
    const g = graph(rig.ctx);
    const before = g.oscL.frequency.value;
    rig.engine.setCarrier(100, 4);
    expect(g.oscL.frequency.value).toBeCloseTo(before, 3);
  });

  it('updates state targets immediately and emits state events', async () => {
    const rig = makeRig();
    const seen: EngineState[] = [];
    rig.engine.subscribe((s) => seen.push(s));
    rig.engine.setBeat(40);
    expect(rig.engine.getState()).toMatchObject({ beatHz: 40, band: 'gamma' });
    rig.engine.setCarrier(300);
    expect(rig.engine.getState()).toMatchObject({ leftHz: 280, rightHz: 320 });
    rig.engine.setVolume(0.8);
    rig.engine.setLevel(0.5);
    expect(seen.map((s) => s.volume).at(-1)).toBe(0.8);
    expect(seen.at(-1)!.level).toBe(0.5);
  });

  it('clamps unsafe values', async () => {
    const rig = makeRig();
    await rig.engine.start();
    rig.engine.setBeat(500);
    rig.engine.setVolume(3);
    expect(rig.engine.getState().beatHz).toBe(45);
    expect(rig.engine.getState().volume).toBe(1);
  });

  it('setVolume ramps the volume gain linearly', async () => {
    const rig = makeRig({ initial: { volume: 0 } });
    await rig.engine.start();
    rig.engine.setVolume(1, 1);
    const { volumeGain } = graph(rig.ctx);
    await rig.advance(0.5);
    expect(volumeGain.gain.value).toBeCloseTo(0.5, 1);
    await rig.advance(0.6);
    expect(volumeGain.gain.value).toBeCloseTo(1);
  });

  it('rampTo with step curve jumps frequencies immediately and levels over a few ms', async () => {
    const rig = makeRig({ initial: { beatHz: 10, carrierHz: 200 } });
    await rig.engine.start();
    rig.engine.rampTo({ beatHz: 4, level: 0.5 }, 10, 'step');
    const g = graph(rig.ctx);
    expect(g.oscR.frequency.value - g.oscL.frequency.value).toBeCloseTo(4);
    // a level step is a GAIN_STEP_SEC ramp, never an instantaneous (clicking) gain change
    const t = rig.ctx.currentTime;
    expect(g.levelGain.gain.valueAt(t)).toBeCloseTo(1);
    expect(g.levelGain.gain.valueAt(t + GAIN_STEP_SEC / 2)).toBeCloseTo(0.75);
    expect(g.levelGain.gain.valueAt(t + GAIN_STEP_SEC)).toBeCloseTo(0.5);
  });

  it('hold() freezes glides at their current values', async () => {
    const rig = makeRig({ initial: { beatHz: 10, carrierHz: 200 } });
    await rig.engine.start();
    rig.engine.rampTo({ beatHz: 30 }, 10, 'linear');
    await rig.advance(5);
    rig.engine.hold();
    const held = rig.engine.getState().beatHz;
    expect(held).toBeGreaterThan(15);
    expect(held).toBeLessThan(25);
    await rig.advance(5);
    expect(rig.engine.getCurrentFrequencies().beatHz).toBeCloseTo(held);
  });

  it('getCurrentFrequencies falls back to state when idle', () => {
    const rig = makeRig({ initial: { beatHz: 8, carrierHz: 100 } });
    expect(rig.engine.getCurrentFrequencies()).toEqual({ leftHz: 96, rightHz: 104, beatHz: 8, carrierHz: 100 });
  });

  it('start params override the initial config', async () => {
    const rig = makeRig();
    await rig.engine.start({ beatHz: 2, carrierHz: 120, volume: 0.2, level: 0.7 });
    const g = graph(rig.ctx);
    expect(g.oscR.frequency.value - g.oscL.frequency.value).toBeCloseTo(2);
    expect(g.levelGain.gain.value).toBeCloseTo(0.7);
    expect(rig.engine.getState()).toMatchObject({ band: 'delta', volume: 0.2 });
  });
});

describe('noise bed', () => {
  it('starts a looped stereo noise source with its own gain when requested', async () => {
    const rig = makeRig({ fadeInSec: 1 });
    await rig.engine.start({ noise: { type: 'brown', volume: 1 } });
    const src = rig.ctx.of<MockBufferSource>('bufferSource')[0]!;
    expect(src.loop).toBe(true);
    expect(src.buffer!.numberOfChannels).toBe(2);
    expect(src.buffer!.getChannelData(0)).not.toEqual(src.buffer!.getChannelData(1));
    const noiseGain = src.connections[0]!.dest as MockGain;
    expect(noiseGain.connections[0]!.dest).toBe(graph(rig.ctx).levelGain);
    await rig.advance(1.1);
    expect(noiseGain.gain.value).toBeCloseTo(NOISE_FULL_GAIN);
  });

  it('no noise by default', async () => {
    const rig = makeRig();
    await rig.engine.start();
    expect(rig.ctx.of('bufferSource')).toHaveLength(0);
  });

  it('crossfades between colours and reuses cached buffers', async () => {
    const rig = makeRig();
    await rig.engine.start({ noise: { type: 'pink', volume: 0.5 } });
    rig.engine.setNoise({ type: 'white' }, 1);
    const sources = rig.ctx.of<MockBufferSource>('bufferSource');
    expect(sources).toHaveLength(2);
    expect(sources[0]!.stoppedAt).toBeCloseTo(1.05);
    rig.engine.setNoise({ type: 'pink' }, 1);
    expect(rig.ctx.buffersCreated).toBe(2);
    await rig.advance(2);
    expect(sources[0]!.disconnected).toBe(true);
  });

  it('adjusts volume in place for the same colour, and turns off', async () => {
    const rig = makeRig();
    await rig.engine.start({ noise: { type: 'pink', volume: 0.5 } });
    rig.engine.setNoise({ volume: 1 }, 0);
    expect(rig.ctx.of('bufferSource')).toHaveLength(1);
    const g = rig.ctx.of<MockBufferSource>('bufferSource')[0]!.connections[0]!.dest as MockGain;
    await rig.advance(0.05, 10); // "instant" changes still get a GAIN_STEP_SEC ramp (no click)
    expect(g.gain.value).toBeCloseTo(NOISE_FULL_GAIN);
    rig.engine.setNoise({ type: 'off' }, 0);
    expect(g.gain.valueAt(rig.ctx.currentTime + GAIN_STEP_SEC)).toBeCloseTo(0);
    await rig.advance(0.2, 10);
    expect(rig.ctx.of<MockBufferSource>('bufferSource')[0]!.disconnected).toBe(true);
    expect(rig.engine.getState().noise.type).toBe('off');
  });

  it('setNoise while idle only updates state', () => {
    const rig = makeRig();
    rig.engine.setNoise({ type: 'brown', volume: 0.4 });
    expect(rig.engine.getState().noise).toEqual({ type: 'brown', volume: 0.4 });
    expect(rig.ctx.of('bufferSource')).toHaveLength(0);
  });
});

describe('events', () => {
  it('emits started/paused/resumed/stopped and isolates throwing listeners', async () => {
    const rig = makeRig();
    const events: string[] = [];
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    rig.engine.on('started', () => {
      throw new Error('bad listener');
    });
    for (const e of ['started', 'paused', 'resumed', 'stopped'] as const) rig.engine.on(e, () => events.push(e));
    await rig.engine.start();
    const p = rig.engine.pause();
    await rig.advance(1);
    await p;
    await rig.engine.resume();
    const s = rig.engine.stop();
    await rig.advance(3);
    await s;
    expect(events).toEqual(['started', 'paused', 'resumed', 'stopped']);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('unsubscribe stops notifications', () => {
    const rig = makeRig();
    const fn = vi.fn();
    const off = rig.engine.subscribe(fn);
    rig.engine.setBeat(12);
    off();
    rig.engine.setBeat(13);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('getState returns a copy', () => {
    const rig = makeRig();
    const s = rig.engine.getState();
    s.noise.type = 'white';
    expect(rig.engine.getState().noise.type).toBe('off');
  });
});

describe('blocked / hanging resume()', () => {
  async function settle<T>(p: Promise<T>): Promise<{ v?: T; e?: unknown; done: boolean }> {
    const out: { v?: T; e?: unknown; done: boolean } = { done: false };
    p.then(
      (v) => Object.assign(out, { v, done: true }),
      (e: unknown) => Object.assign(out, { e, done: true }),
    );
    await flushMicrotasks(10);
    return out;
  }

  it('start() rejects with AudioBlockedError when resume() never settles (autoplay policy)', async () => {
    const rig = makeRig({}, { deferResume: true });
    const errors: Error[] = [];
    rig.engine.on('error', (e) => errors.push(e));
    const r = await settle(rig.engine.start());
    expect(r.done).toBe(false);
    rig.clock.advance(RESUME_TIMEOUT_MS - 1);
    await flushMicrotasks(10);
    expect(r.done).toBe(false);
    rig.clock.advance(1);
    await flushMicrotasks(10);
    expect(r.done).toBe(true);
    expect(r.e).toBeInstanceOf(AudioBlockedError);
    expect(errors[0]).toBeInstanceOf(AudioBlockedError);
    expect(rig.engine.getState().status).toBe('idle');
    expect(rig.clock.pending()).toBe(0);
  });

  it('start() rejects with AudioBlockedError (not a raw error) when resume() rejects', async () => {
    const rig = makeRig({}, { resumeRejects: true });
    await expect(rig.engine.start()).rejects.toBeInstanceOf(AudioBlockedError);
  });

  it('a resume() that settles before the timeout starts normally and leaves no timer behind', async () => {
    const rig = makeRig({}, { deferResume: true });
    const r = await settle(rig.engine.start());
    rig.ctx.settleResume();
    await flushMicrotasks(10);
    expect(r.done).toBe(true);
    expect(r.e).toBeUndefined();
    expect(rig.engine.getState().status).toBe('playing');
    expect(rig.clock.pending()).toBe(0);
  });

  it('resume() after pause also times out into AudioBlockedError', async () => {
    const rig = makeRig({ pauseFadeSec: 0.1 });
    await rig.engine.start();
    const p = rig.engine.pause();
    await rig.advance(0.3);
    await p;
    expect(rig.ctx.state).toBe('suspended');
    rig.ctx.opts.deferResume = true;
    const r = await settle(rig.engine.resume());
    rig.clock.advance(RESUME_TIMEOUT_MS);
    await flushMicrotasks(10);
    expect(r.e).toBeInstanceOf(AudioBlockedError);
    expect(rig.engine.getState().status).toBe('paused');
  });
});

describe('stop() releases the audio session', () => {
  it('suspends the context after a faded stop', async () => {
    const rig = makeRig({ fadeInSec: 0.5, fadeOutSec: 0.5 });
    await rig.engine.start();
    await rig.advance(0.5);
    const p = rig.engine.stop();
    await rig.advance(1);
    await p;
    expect(rig.engine.getState().status).toBe('idle');
    expect(rig.ctx.state).toBe('suspended');
    // and a later start() resumes it
    await rig.engine.start();
    expect(rig.ctx.state).toBe('running');
    expect(rig.engine.getState().status).toBe('playing');
  });

  it('suspends after an immediate stop too, but not with suspendOnPause: false', async () => {
    const rig = makeRig({ suspendOnPause: false, fadeOutSec: 0.2 });
    await rig.engine.start();
    const p = rig.engine.stop();
    await rig.advance(0.5);
    await p;
    expect(rig.ctx.state).toBe('running');

    const rig2 = makeRig({ pauseFadeSec: 0.1 }, { deferSuspend: true });
    await rig2.engine.start();
    // stop while the context is already suspended by pause: nothing more to do
    const pp = rig2.engine.pause();
    await rig2.advance(0.3);
    rig2.ctx.settleSuspend();
    await pp;
    await rig2.engine.stop();
    expect(rig2.ctx.state).toBe('suspended');
    expect(rig2.engine.getState().status).toBe('idle');
  });

  it('start() racing the post-stop suspend still ends up audible', async () => {
    const rig = makeRig({ fadeOutSec: 0.2 }, { deferSuspend: true });
    await rig.engine.start();
    const p = rig.engine.stop();
    await rig.advance(0.5);
    expect(rig.ctx.suspendCalls).toBe(1);
    const s = rig.engine.start();
    rig.ctx.settleSuspend();
    await flushMicrotasks(10);
    await s;
    await p;
    expect(rig.engine.getState().status).toBe('playing');
    expect(rig.ctx.state).toBe('running');
  });
});

describe('noise volume survives programs without a noise bed', () => {
  it("start({ noise: off }) keeps the remembered volume, so setNoise({ type }) is audible", async () => {
    const rig = makeRig({ initial: { noise: { type: 'off', volume: 0.4 } } });
    await rig.engine.start({ noise: { type: 'off', volume: 0 } });
    expect(rig.engine.getState().noise).toEqual({ type: 'off', volume: 0.4 });
    rig.engine.setNoise({ type: 'pink' });
    expect(rig.engine.getState().noise).toEqual({ type: 'pink', volume: 0.4 });
    expect(rig.ctx.of('bufferSource')).toHaveLength(1);
    rig.engine.setNoise({ type: 'off', volume: 0 });
    expect(rig.engine.getState().noise.volume).toBe(0.4);
  });
});

describe('browsers without cancelAndHoldAtTime and with a lagging AudioParam.value (Firefox)', () => {
  const legacy = { legacyParams: true };

  it('the mock really emulates the stale .value and missing cancelAndHoldAtTime', () => {
    const ctx = new MockAudioContext(legacy);
    const g = ctx.createGain();
    expect(typeof (g.gain as MockParam).cancelAndHoldAtTime).not.toBe('function');
    g.gain.setValueAtTime(0, 0);
    expect(g.gain.value).toBe(1); // stale default until the next render quantum
    ctx.tick(0.01);
    expect(g.gain.value).toBe(0);
  });

  it('fades in from silence without a click', async () => {
    const rig = makeRig({ fadeInSec: 2 }, legacy);
    await rig.engine.start();
    const { fadeGain } = graph(rig.ctx);
    expect(fadeGain.gain.valueAt(0)).toBe(0);
    expect(fadeGain.gain.valueAt(0.01)).toBeLessThan(0.01);
    expect(fadeGain.gain.valueAt(1)).toBeCloseTo(0.5);
    expect(fadeGain.gain.valueAt(2)).toBeCloseTo(1);
  });

  it('noise fades in from silence without a click', async () => {
    const rig = makeRig({ fadeInSec: 1 }, legacy);
    await rig.engine.start({ noise: { type: 'pink', volume: 1 } });
    const src = rig.ctx.of<MockBufferSource>('bufferSource')[0]!;
    const noiseGain = src.connections[0]!.dest as MockGain;
    expect(noiseGain.gain.valueAt(0)).toBe(0);
    expect(noiseGain.gain.valueAt(0.5)).toBeCloseTo(NOISE_FULL_GAIN / 2);
    // and a colour switched on mid-play also starts from 0
    await rig.advance(1.5);
    rig.engine.setNoise({ type: 'white' }, 1);
    const fresh = rig.ctx.of<MockBufferSource>('bufferSource')[1]!.connections[0]!.dest as MockGain;
    expect(fresh.gain.valueAt(rig.ctx.currentTime)).toBe(0);
  });

  it('stop mid fade-in ramps down from the real current value (no jump up to full)', async () => {
    const rig = makeRig({ fadeInSec: 2, fadeOutSec: 1 }, legacy);
    await rig.engine.start();
    await rig.advance(1, 1000); // one coarse "render quantum": .value refreshed once at t=1
    rig.ctx.tick(0.0); // no refresh between scheduling and reading
    const { fadeGain } = graph(rig.ctx);
    const p = rig.engine.stop();
    const t = rig.ctx.currentTime;
    expect(fadeGain.gain.valueAt(t)).toBeCloseTo(0.5, 2);
    expect(fadeGain.gain.valueAt(t + 0.5)).toBeCloseTo(0.25, 2);
    await rig.advance(1.5);
    await p;
  });

  it('pause/resume and glides stay continuous', async () => {
    const rig = makeRig({ fadeInSec: 0.5, pauseFadeSec: 0.4, glideSec: 1, suspendOnPause: false }, legacy);
    await rig.engine.start({ beatHz: 10, carrierHz: 200 });
    await rig.advance(1);
    const g = graph(rig.ctx);
    rig.engine.setBeat(20, 1);
    // A glide must start where the oscillator currently is.
    expect(g.oscL.frequency.valueAt(rig.ctx.currentTime)).toBeCloseTo(195);
    expect(g.oscR.frequency.valueAt(rig.ctx.currentTime)).toBeCloseTo(205);
    const p = rig.engine.pause();
    expect(g.fadeGain.gain.valueAt(rig.ctx.currentTime)).toBeCloseTo(1);
    await rig.advance(0.5);
    await p;
    await rig.engine.resume();
    expect(g.fadeGain.gain.valueAt(rig.ctx.currentTime)).toBeCloseTo(0);
  });
});
