import { describe, expect, it, vi } from 'vitest';
import { ProgramPlayer, type SessionSummary } from '../src/scheduler';
import { getBuiltInProgram, presetToProgram, type Program } from '../src/programs';
import { getBuiltInPreset } from '../src/presets';
import { makeRig } from './helpers';
import type { MockBufferSource, MockOscillator, MockGain } from './mockAudio';

function setup(opts: { fadeOutSec?: number } = {}) {
  const rig = makeRig({ fadeInSec: 1, fadeOutSec: opts.fadeOutSec ?? 1, pauseFadeSec: 0.2 });
  const ended: SessionSummary[] = [];
  const player = new ProgramPlayer(rig.engine, { clock: rig.clock, tickMs: 1000, onSessionEnd: (s) => ended.push(s) });
  const beat = () => {
    const [l, r] = rig.ctx.of<MockOscillator>('oscillator').slice(-2);
    return r!.frequency.value - l!.frequency.value;
  };
  return { rig, player, ended, beat };
}

const short: Program = {
  id: 'short',
  name: 'Short',
  start: { beatHz: 14, carrierHz: 200, level: 1 },
  segments: [
    { durationSec: 10, beatHz: 10, label: 'down' },
    { durationSec: 10, label: 'hold', noise: { type: 'pink', volume: 0.3 } },
    { durationSec: 10, beatHz: 20, level: 0.5, label: 'up' },
  ],
  end: 'stop',
  endFadeSec: 4,
};

describe('ProgramPlayer', () => {
  it('applies the program to the engine over time', async () => {
    const { rig, player, beat } = setup();
    await player.play(short);
    expect(player.getState()).toMatchObject({ status: 'playing', programId: 'short', stepIndex: 0, stepLabel: 'down', endsAtSec: 30 });
    expect(beat()).toBeCloseTo(14, 1);
    await rig.advance(5, 250);
    expect(beat()).toBeGreaterThan(10);
    expect(beat()).toBeLessThan(14);
    await rig.advance(5.5, 250);
    expect(beat()).toBeCloseTo(10, 1);
    expect(rig.ctx.of('bufferSource')).toHaveLength(1); // noise started at step 2
    await rig.advance(10, 250);
    expect(player.getState().stepLabel).toBe('up');
    await rig.advance(5, 250);
    expect(beat()).toBeGreaterThan(14);
  });

  it('emits step events in order', async () => {
    const { rig, player } = setup();
    const steps: (string | null)[] = [];
    player.on('step', (s) => steps.push(s.label));
    await player.play(short);
    await rig.advance(31, 500);
    expect(steps).toEqual(['down', 'hold', 'up']);
  });

  it('ends a self-ending program with a gentle fade and records a completed session', async () => {
    const { rig, player, ended } = setup();
    await player.play(short);
    await rig.advance(25.5, 250);
    expect(player.getState().status).toBe('playing');
    await rig.advance(1, 250);
    expect(player.getState().status).toBe('ending'); // fade begins at 30 - 4 = 26s
    expect(rig.engine.getState().status).toBe('stopping');
    await rig.advance(5, 250);
    expect(player.getState().status).toBe('ended');
    expect(rig.engine.getState().status).toBe('idle');
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({ programId: 'short', completed: true, endedBy: 'program' });
    expect(ended[0]!.durationSec).toBeGreaterThanOrEqual(29.5);
    const total = Object.values(ended[0]!.bandSeconds).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeCloseTo(ended[0]!.durationSec, 0);
  });

  it('a timer ends an open-ended preset session with a fade', async () => {
    const { rig, player, ended } = setup();
    await player.play(presetToProgram(getBuiltInPreset('focus')!), { timerSec: 60, endFadeSec: 10 });
    expect(player.getState()).toMatchObject({ endsAtSec: 60, timerSec: 60, presetId: 'focus' });
    await rig.advance(49, 1000);
    expect(player.getState().status).toBe('playing');
    expect(player.getState().remainingSec).toBeCloseTo(11, 0);
    await rig.advance(2, 1000);
    expect(player.getState().status).toBe('ending');
    await rig.advance(11, 1000);
    expect(ended[0]).toMatchObject({ endedBy: 'timer', completed: true, band: 'beta', presetId: 'focus' });
  });

  it('timer shorter than the program wins', async () => {
    const { rig, player, ended } = setup();
    await player.play(short, { timerSec: 12, endFadeSec: 2 });
    await rig.advance(13, 250);
    expect(ended[0]).toMatchObject({ endedBy: 'timer' });
  });

  it('setTimer mid-session reschedules (and can clear) the end', async () => {
    const { rig, player, ended } = setup();
    await player.play(presetToProgram(getBuiltInPreset('calm')!), { timerSec: 600, endFadeSec: 1 });
    await rig.advance(5, 1000);
    player.setTimer(null);
    expect(player.getState().endsAtSec).toBeNull();
    await rig.advance(700, 5000);
    expect(ended).toHaveLength(0);
    player.setTimer(720);
    await rig.advance(30, 1000);
    expect(ended).toHaveLength(1);
  });

  it('pause excludes time and resume continues exactly where it left off', async () => {
    const { rig, player, beat } = setup();
    await player.play(short);
    await rig.advance(5, 250);
    await Promise.all([player.pause(), rig.advance(0.5, 100)]);
    const pausedAt = player.getState().elapsedSec;
    expect(player.getState().status).toBe('paused');
    expect(rig.ctx.state).toBe('suspended');
    // long pause: wall clock moves, schedule doesn't
    rig.clock.advance(60_000);
    expect(player.getState().elapsedSec).toBeCloseTo(pausedAt);
    await player.resume();
    expect(player.getState().status).toBe('playing');
    expect(beat()).toBeCloseTo(14 * Math.pow(10 / 14, pausedAt / 10), 0);
    await rig.advance(5, 250);
    expect(beat()).toBeCloseTo(10, 0);
  });

  it('user stop records an incomplete session and fades the engine', async () => {
    const { rig, player, ended } = setup();
    await player.play(short);
    await rig.advance(8, 250);
    const p = player.stop();
    await rig.advance(2, 250);
    await p;
    expect(ended[0]).toMatchObject({ completed: false, endedBy: 'user' });
    expect(rig.engine.getState().status).toBe('idle');
    await player.stop(); // idempotent
    expect(ended).toHaveLength(1);
  });

  it('stop while paused works', async () => {
    const { rig, player, ended } = setup();
    await player.play(short);
    await rig.advance(3, 250);
    await Promise.all([player.pause(), rig.advance(0.5, 100)]);
    await player.stop();
    expect(ended[0]!.durationSec).toBeCloseTo(3, 0);
    expect(rig.engine.getState().status).toBe('idle');
  });

  it('playing a new program ends the previous session first', async () => {
    const { rig, player, ended } = setup();
    await player.play(short);
    await rig.advance(40, 1000);
    await player.play(getBuiltInProgram('arrive')!);
    await rig.advance(31, 1000);
    expect(player.getState().programId).toBe('arrive');
    await player.play(short);
    expect(ended.map((e) => e.programId)).toEqual(['short', 'arrive']);
    expect(ended[1]).toMatchObject({ endedBy: 'user', completed: false });
  });

  it('emits progress ticks while playing and stops ticking when ended', async () => {
    const { rig, player } = setup();
    const fn = vi.fn();
    player.subscribe(fn);
    await player.play(presetToProgram(getBuiltInPreset('calm')!), { timerSec: 5, endFadeSec: 1 });
    await rig.advance(10, 500);
    const n = fn.mock.calls.length;
    expect(n).toBeGreaterThanOrEqual(5);
    await rig.advance(10, 500);
    expect(fn.mock.calls.length).toBe(n);
    expect(rig.clock.pending()).toBe(0);
  });

  it('program level automation reaches the engine level gain', async () => {
    const { rig, player } = setup();
    await player.play(short);
    await rig.advance(29.9, 250);
    const levelGain = rig.ctx.of<MockGain>('gain')[1]!;
    expect(levelGain.gain.value).toBeLessThan(0.6);
  });

  it('uses the volume override when given and otherwise keeps the user volume', async () => {
    const { player, rig } = setup();
    rig.engine.setVolume(0.42);
    await player.play(short);
    expect(rig.engine.getState().volume).toBe(0.42);
    await player.play(short, { volume: 0.1 });
    expect(rig.engine.getState().volume).toBe(0.1);
  });

  it('getState when idle is sane', () => {
    const { player } = setup();
    expect(player.getState()).toMatchObject({ status: 'idle', programId: null, elapsedSec: 0, endsAtSec: null, remainingSec: null });
  });

  it('a program without a noise bed does not zero the noise volume (noise can be turned on afterwards)', async () => {
    const { rig, player } = setup();
    const arrive = getBuiltInProgram('arrive')!;
    expect(arrive.start.noise).toBeUndefined();
    await player.play(arrive);
    expect(rig.engine.getState().noise.type).toBe('off');
    expect(rig.engine.getState().noise.volume).toBeGreaterThan(0);
    rig.engine.setNoise({ type: 'pink' }, 0.5);
    const sources = rig.ctx.of<MockBufferSource>('bufferSource');
    expect(sources).toHaveLength(1);
    const g = sources[0]!.connections[0]!.dest as MockGain;
    await rig.advance(1, 250);
    expect(g.gain.value).toBeGreaterThan(0.01);
  });
});
