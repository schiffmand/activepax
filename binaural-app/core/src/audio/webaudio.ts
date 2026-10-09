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

/** Freeze a param at its current value at `time`, cancelling later automation. */
export function holdParam(param: AudioParamLike, time: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(time);
  } else {
    const v = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(v, time);
  }
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
  holdParam(param, now);
  if (curve === 'step' || durationSec <= 0) {
    param.setValueAtTime(target, now);
    return;
  }
  const end = now + durationSec;
  if (curve === 'exponential' && target > 0 && param.value > 0) {
    param.exponentialRampToValueAtTime(target, end);
  } else {
    param.linearRampToValueAtTime(target, end);
  }
}
