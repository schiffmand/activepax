/**
 * Minimal structural subset of the Web Audio API used by the engine.
 * A real `AudioContext` satisfies `AudioContextLike` (checked in test/types.check.ts),
 * and tests inject a mock. Native ports mirror these nodes 1:1 (see README).
 */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
  cancelScheduledValues(startTime: number): unknown;
  cancelAndHoldAtTime?(cancelTime: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike, output?: number, input?: number): unknown;
  disconnect(): void;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface DynamicsCompressorNodeLike extends AudioNodeLike {
  threshold: AudioParamLike;
  knee: AudioParamLike;
  ratio: AudioParamLike;
  attack: AudioParamLike;
  release: AudioParamLike;
}

export interface AudioBufferLike {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  createChannelMerger(numberOfInputs?: number): AudioNodeLike;
  /** Not used by the engine any more (see engine.ts on headroom); kept optional for compatibility. */
  createDynamicsCompressor?(): DynamicsCompressorNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close?(): Promise<void>;
  /**
   * 'statechange' notifications (interruptions: calls, Siri, alarms, Safari's 'interrupted' state).
   * Optional so minimal mocks/bridges still satisfy the interface.
   */
  addEventListener?(type: 'statechange', listener: () => void): void;
  removeEventListener?(type: 'statechange', listener: () => void): void;
}

/**
 * The last automation segment the helpers below scheduled on each param.
 *
 * Why: `AudioParam.value` is only refreshed once per render quantum, so right after scheduling
 * (e.g. a fresh gain set to 0) it still reports the stale default (1). Browsers without
 * cancelAndHoldAtTime (Firefox, incl. Android) need the current value to emulate a hold, and reading
 * `.value` there turns a fade-in from 0 into an instant jump to 1 (a click). Tracking what we scheduled
 * lets us compute the true value instead. Params never touched by these helpers fall back to `.value`.
 */
interface Segment {
  startTime: number;
  startValue: number;
  endTime: number;
  endValue: number;
  curve: 'linear' | 'exponential' | 'step';
}

const segments = new WeakMap<AudioParamLike, Segment>();

function segmentValueAt(s: Segment, t: number): number {
  if (t >= s.endTime || s.endTime <= s.startTime) return s.endValue;
  if (t <= s.startTime) return s.startValue;
  const frac = (t - s.startTime) / (s.endTime - s.startTime);
  if (s.curve === 'exponential' && s.startValue > 0 && s.endValue > 0) {
    return s.startValue * Math.pow(s.endValue / s.startValue, frac);
  }
  return s.startValue + (s.endValue - s.startValue) * frac;
}

/**
 * Best estimate of a param's value at `time`: computed from the tracked schedule when the helpers
 * scheduled it, else `param.value`.
 */
export function paramValueAt(param: AudioParamLike, time: number): number {
  const s = segments.get(param);
  return s ? segmentValueAt(s, time) : param.value;
}

/** setValueAtTime that is also tracked (use this for every initial value on engine-owned params). */
export function setParam(param: AudioParamLike, value: number, time: number): void {
  if (!Number.isFinite(value) || !Number.isFinite(time)) return;
  param.setValueAtTime(value, time);
  segments.set(param, { startTime: time, startValue: value, endTime: time, endValue: value, curve: 'step' });
}

/** Freeze a param at its current value at `time`, cancelling later automation. */
export function holdParam(param: AudioParamLike, time: number): void {
  const v = paramValueAt(param, time);
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(time);
  } else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(v, time);
  }
  segments.set(param, { startTime: time, startValue: v, endTime: time, endValue: v, curve: 'step' });
}

/**
 * Glide a param from its current value to `target` over `durationSec` with no zipper noise.
 * Exponential curves are used for frequencies (perceptually even), linear for gains.
 */
export function rampParam(
  param: AudioParamLike,
  target: number,
  now: number,
  durationSec: number,
  curve: 'linear' | 'exponential' | 'step' = 'linear',
): void {
  // Non-finite values would make Web Audio throw (TypeError) mid-transport; ignore bad targets,
  // treat bad durations as an instant change.
  if (!Number.isFinite(target)) return;
  if (!Number.isFinite(durationSec)) durationSec = 0;
  if (!Number.isFinite(now)) return;
  const from = paramValueAt(param, now);
  holdParam(param, now);
  if (curve === 'step' || durationSec <= 0) {
    setParam(param, target, now);
    return;
  }
  const end = now + durationSec;
  if (curve === 'exponential' && target > 0 && from > 0) {
    param.exponentialRampToValueAtTime(target, end);
    segments.set(param, { startTime: now, startValue: from, endTime: end, endValue: target, curve: 'exponential' });
  } else {
    param.linearRampToValueAtTime(target, end);
    segments.set(param, { startTime: now, startValue: from, endTime: end, endValue: target, curve: 'linear' });
  }
}
