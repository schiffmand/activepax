import type { Preset } from './presets';
import { validateTone } from './presets';
import { BANDS, LIMITS, NOISE_TYPES, bandFor, earFrequencies, type Band, type NoiseSetting, type RampCurve, type Result, type ToneTarget } from './types';

/**
 * A "journey": a start point plus timed segments that glide beat / carrier / level.
 * A segment with no targets is a hold. Pure data — serialisable, shareable, testable.
 */
export interface ProgramSegment {
  durationSec: number;
  beatHz?: number;
  carrierHz?: number;
  level?: number;
  curve?: RampCurve;
  label?: string;
  /** Change the noise bed when this segment begins. */
  noise?: NoiseSetting;
}

export interface Program {
  id: string;
  name: string;
  tagline?: string;
  start: { beatHz: number; carrierHz: number; level?: number; noise?: NoiseSetting };
  segments: ProgramSegment[];
  /**
   * What happens after the last segment:
   * - 'hold': keep playing the final values until the user (or a timer) stops it
   * - 'stop': gently fade out and end
   */
  end: 'hold' | 'stop';
  /** Fade-out length when the program (or its timer) ends. */
  endFadeSec?: number;
  /** Suggested user volume. */
  volume?: number;
  presetId?: string;
}

export interface AutomationStep {
  index: number;
  label?: string;
  atSec: number;
  durationSec: number;
  from: ToneTarget;
  to: ToneTarget;
  curve: RampCurve;
  noise?: NoiseSetting;
}

export interface CompiledProgram {
  programId: string;
  start: ToneTarget;
  startNoise?: NoiseSetting;
  steps: AutomationStep[];
  /** Length of the timed part, seconds. */
  timedSec: number;
  end: 'hold' | 'stop';
  endFadeSec: number;
  /** Total length if the program ends on its own; null when it holds indefinitely. */
  totalSec: number | null;
}

export const DEFAULT_END_FADE_SEC = 20;

const RAMP_CURVES: readonly RampCurve[] = ['linear', 'exponential', 'step'];

function validateNoise(n: unknown, where: string): string[] {
  if (n === undefined) return [];
  if (!n || typeof n !== 'object') return [`${where}: noise must be an object.`];
  const { type, volume } = n as Partial<NoiseSetting>;
  const errors: string[] = [];
  if (type !== 'off' && !NOISE_TYPES.includes(type as never)) errors.push(`${where}: unknown noise type.`);
  if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1)
    errors.push(`${where}: noise volume must be between 0 and 1.`);
  return errors;
}

function validLevel(l: unknown): boolean {
  return typeof l === 'number' && Number.isFinite(l) && l >= LIMITS.level.min && l <= LIMITS.level.max;
}

/**
 * Validate any (possibly imported/shared/hand-written) program. Never throws: malformed input
 * returns errors. Segments must have a positive duration — instant changes are expressed with
 * `curve: 'step'` (the new values apply from the start of that segment).
 */
export function validateProgram(input: Program): string[] {
  const p = input as unknown as Partial<Program> | null | undefined;
  if (!p || typeof p !== 'object' || !p.start || typeof p.start !== 'object' || !Array.isArray(p.segments)) {
    return ['Invalid program.'];
  }
  const errors: string[] = [];
  if (!p.id || typeof p.id !== 'string') errors.push('Program needs an id.');
  if (typeof p.name !== 'string' || !p.name.trim()) errors.push('Program needs a name.');
  errors.push(...validateTone(p.start.beatHz, p.start.carrierHz).map((e) => `Start: ${e}`));
  if (p.start.level !== undefined && !validLevel(p.start.level)) errors.push('Start: level must be between 0 and 1.');
  errors.push(...validateNoise(p.start.noise, 'Start'));
  let beat = p.start.beatHz;
  let carrier = p.start.carrierHz;
  p.segments.forEach((s, i) => {
    const where = `Segment ${i + 1}`;
    if (!s || typeof s !== 'object') {
      errors.push(`${where}: invalid segment.`);
      return;
    }
    if (typeof s.durationSec !== 'number' || !Number.isFinite(s.durationSec) || s.durationSec <= 0)
      errors.push(`${where}: duration must be greater than 0 (use curve 'step' for an instant change).`);
    beat = s.beatHz ?? beat;
    carrier = s.carrierHz ?? carrier;
    errors.push(...validateTone(beat, carrier).map((e) => `${where}: ${e}`));
    if (s.level !== undefined && !validLevel(s.level)) errors.push(`${where}: level must be between 0 and 1.`);
    if (s.curve !== undefined && !RAMP_CURVES.includes(s.curve)) errors.push(`${where}: unknown curve.`);
    errors.push(...validateNoise(s.noise, where));
  });
  if (p.end !== 'hold' && p.end !== 'stop') errors.push("End must be 'hold' or 'stop'.");
  if (p.endFadeSec !== undefined && (typeof p.endFadeSec !== 'number' || !Number.isFinite(p.endFadeSec) || p.endFadeSec < 0))
    errors.push('End fade must be 0 seconds or more.');
  if (p.volume !== undefined && !validLevel(p.volume)) errors.push('Volume must be between 0 and 1.');
  if (p.end === 'stop' && p.segments.length === 0) errors.push('A program that stops on its own needs at least one segment.');
  return errors;
}

/** Pure compiler: program -> absolute-time automation schedule. */
export function compileProgram(p: Program): CompiledProgram {
  const start: ToneTarget = { beatHz: p.start.beatHz, carrierHz: p.start.carrierHz, level: p.start.level ?? 1 };
  const steps: AutomationStep[] = [];
  let at = 0;
  let from = start;
  p.segments.forEach((s, index) => {
    const to: ToneTarget = {
      beatHz: s.beatHz ?? from.beatHz,
      carrierHz: s.carrierHz ?? from.carrierHz,
      level: s.level ?? from.level,
    };
    const step: AutomationStep = {
      index,
      atSec: at,
      durationSec: Math.max(0, s.durationSec),
      from,
      to,
      curve: s.curve ?? 'exponential',
    };
    if (s.label !== undefined) step.label = s.label;
    if (s.noise !== undefined) step.noise = s.noise;
    steps.push(step);
    at += step.durationSec;
    from = to;
  });
  const endFadeSec = p.endFadeSec ?? DEFAULT_END_FADE_SEC;
  const compiled: CompiledProgram = {
    programId: p.id,
    start,
    steps,
    timedSec: at,
    end: p.end,
    endFadeSec,
    totalSec: p.end === 'stop' ? at : null,
  };
  if (p.start.noise) compiled.startNoise = p.start.noise;
  return compiled;
}

function interp(a: number, b: number, t: number, curve: RampCurve, positive: boolean): number {
  // 'step' jumps at the START of its segment — exactly what the engine does (setValueAtTime at the boundary).
  if (curve === 'step') return b;
  if (t <= 0) return a;
  if (t >= 1) return b;
  if (curve === 'exponential' && positive && a > 0 && b > 0) return a * Math.pow(b / a, t);
  return a + (b - a) * t;
}

export interface ProgramSample extends ToneTarget {
  stepIndex: number; // -1 before any step / when no steps
  phase: 'ramp' | 'hold' | 'after';
  label?: string;
}

/**
 * Pure: value of the schedule at time t (seconds). Matches what Web Audio produces:
 * the engine ramps each EAR frequency (exponentially by default), so we interpolate left and right
 * the same way and derive beat = R − L and carrier = (L + R) / 2. Level is linear.
 */
export function sampleProgram(c: CompiledProgram, tSec: number): ProgramSample {
  if (c.steps.length === 0) return { ...c.start, stepIndex: -1, phase: 'hold' };
  tSec = Number.isFinite(tSec) ? Math.max(0, tSec) : 0;
  for (const s of c.steps) {
    if (tSec < s.atSec + s.durationSec) {
      const t = s.durationSec > 0 ? (tSec - s.atSec) / s.durationSec : 1;
      const toneSame = s.from.beatHz === s.to.beatHz && s.from.carrierHz === s.to.carrierHz;
      const isHold = toneSame && s.from.level === s.to.level;
      let beatHz: number;
      let carrierHz: number;
      if (toneSame) {
        beatHz = s.to.beatHz;
        carrierHz = s.to.carrierHz;
      } else {
        const a = earFrequencies(s.from.carrierHz, s.from.beatHz);
        const b = earFrequencies(s.to.carrierHz, s.to.beatHz);
        const left = interp(a.leftHz, b.leftHz, t, s.curve, true);
        const right = interp(a.rightHz, b.rightHz, t, s.curve, true);
        beatHz = right - left;
        carrierHz = (left + right) / 2;
      }
      const r: ProgramSample = {
        beatHz,
        carrierHz,
        level: interp(s.from.level, s.to.level, t, s.curve === 'step' ? 'step' : 'linear', false),
        stepIndex: s.index,
        phase: isHold ? 'hold' : 'ramp',
      };
      if (s.label !== undefined) r.label = s.label;
      return r;
    }
  }
  const last = c.steps[c.steps.length - 1]!;
  const r: ProgramSample = { ...last.to, stepIndex: last.index, phase: 'after' };
  if (last.label !== undefined) r.label = last.label;
  return r;
}

/**
 * Pure: seconds spent in each band between [fromSec, toSec) of a compiled program,
 * integrated numerically (1 s resolution, exact at band crossings to within 1 s).
 */
export function bandSecondsBetween(c: CompiledProgram, fromSec: number, toSec: number, resolutionSec = 1): Partial<Record<Band, number>> {
  const out: Partial<Record<Band, number>> = {};
  if (toSec <= fromSec) return out;
  for (let t = fromSec; t < toSec; t += resolutionSec) {
    const dt = Math.min(resolutionSec, toSec - t);
    const band = bandFor(sampleProgram(c, t + dt / 2).beatHz);
    out[band] = (out[band] ?? 0) + dt;
  }
  for (const b of BANDS) if (out[b] !== undefined) out[b] = Math.round(out[b]! * 1000) / 1000;
  return out;
}

/** A preset is just a program that starts at the preset and holds. */
export function presetToProgram(preset: Preset): Program {
  return {
    id: `preset:${preset.id}`,
    name: preset.name,
    tagline: preset.tagline,
    start: { beatHz: preset.beatHz, carrierHz: preset.carrierHz, level: 1, noise: preset.noise },
    segments: [],
    end: 'hold',
    volume: preset.volume,
    presetId: preset.id,
  };
}

export function createProgram(p: Program): Result<Program> {
  const errors = validateProgram(p);
  return errors.length ? { ok: false, errors } : { ok: true, value: p };
}

const min = (m: number) => m * 60;

/** Built-in journeys. Kept short and legible so users can see what's happening. */
export const BUILT_IN_PROGRAMS: readonly Program[] = Object.freeze([
  {
    id: 'arrive',
    name: 'Arrive',
    tagline: 'Settle from busy to calm over 8 minutes, then stay there.',
    start: { beatHz: 14, carrierHz: 200, level: 1 },
    segments: [{ durationSec: min(8), beatHz: 10, label: 'Settling' }],
    end: 'hold',
    volume: 0.3,
  },
  {
    id: 'ease-into-focus',
    name: 'Ease into Focus',
    tagline: 'Start relaxed, rise to a steady focus over 10 minutes.',
    start: { beatHz: 10, carrierHz: 200, level: 0.8 },
    segments: [{ durationSec: min(10), beatHz: 16, level: 1, label: 'Rising' }],
    end: 'hold',
    volume: 0.3,
  },
  {
    id: 'deep-work-block',
    name: 'Deep Work Block',
    tagline: '5 minutes in, 40 minutes deep, 5 minutes to surface.',
    start: { beatHz: 14, carrierHz: 210, level: 0.85, noise: { type: 'pink', volume: 0.2 } },
    segments: [
      { durationSec: min(5), beatHz: 40, carrierHz: 220, level: 1, label: 'Going in' },
      { durationSec: min(40), label: 'Deep' },
      { durationSec: min(5), beatHz: 10, carrierHz: 200, level: 0.85, label: 'Surfacing' },
    ],
    end: 'stop',
    endFadeSec: 15,
    volume: 0.28,
  },
  {
    id: 'reset',
    name: 'Ten-Minute Reset',
    tagline: 'A short alpha break between meetings.',
    start: { beatHz: 12, carrierHz: 180, level: 1 },
    segments: [
      { durationSec: min(3), beatHz: 10, label: 'Slowing' },
      { durationSec: min(5), label: 'Resting' },
      { durationSec: min(2), beatHz: 14, label: 'Back up' },
    ],
    end: 'stop',
    endFadeSec: 10,
    volume: 0.3,
  },
  {
    id: 'wind-down',
    name: 'Wind Down',
    tagline: 'Drift from alpha to theta across 20 minutes.',
    start: { beatHz: 10, carrierHz: 170, level: 1, noise: { type: 'pink', volume: 0.25 } },
    segments: [
      { durationSec: min(15), beatHz: 6, carrierHz: 160, label: 'Unwinding' },
      { durationSec: min(5), level: 0.7, label: 'Softening' },
    ],
    end: 'stop',
    endFadeSec: 30,
    volume: 0.26,
  },
  {
    id: 'sleep-descent',
    name: 'Sleep Descent',
    tagline: 'From calm to slow delta over 30 minutes, then quietly fades.',
    start: { beatHz: 8, carrierHz: 140, level: 1, noise: { type: 'brown', volume: 0.35 } },
    segments: [
      { durationSec: min(15), beatHz: 4, carrierHz: 130, label: 'Drifting' },
      { durationSec: min(15), beatHz: 2, carrierHz: 120, level: 0.6, label: 'Descending' },
      { durationSec: min(15), level: 0.4, label: 'Asleep' },
    ],
    end: 'stop',
    endFadeSec: 60,
    volume: 0.22,
  },
] satisfies Program[]);

export function getBuiltInProgram(id: string): Program | undefined {
  return BUILT_IN_PROGRAMS.find((p) => p.id === id);
}
