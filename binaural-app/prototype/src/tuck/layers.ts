/**
 * Tuck's layer model, built on core types (Preset, Program, NoiseSetting).
 *
 * The product spec (docs/product-spec.md §3) asks core for new numbers (Focus 14 Hz / 207 Hz, Steady, noise beds
 * on every intent, Drift / Hold). Until core ships those, the prototype defines the five intents here as plain
 * data and hands them to the real core engine via presetToProgram / ProgramPlayer. Nothing here touches audio.
 */
import {
  bandFor,
  earFrequencies,
  presetToProgram,
  type NoiseSetting,
  type NoiseType,
  type Preset,
  type Program,
} from '@core';

export type IntentId = 'focus' | 'calm' | 'unwind' | 'sleep' | 'steady';
/** Drift: the beat and the noise wander slowly. Vary: Drift, plus a different noise each session. Hold: identical. */
export type Motion = 'drift' | 'vary' | 'hold';
export const wanders = (m: Motion) => m !== 'hold';
export type LevelName = 'quiet' | 'medium' | 'full';

export const LEVELS: readonly LevelName[] = ['quiet', 'medium', 'full'];
/** tokens.json → level (engine volume, perceptual 0..1). */
export const LEVEL_VOLUME: Record<LevelName, number> = { quiet: 0.16, medium: 0.28, full: 0.42 };
export const LEVEL_LABEL: Record<LevelName, string> = { quiet: 'Quiet', medium: 'Medium', full: 'Full' };
/** tokens.json → layer.restHeight (px above the bottom safe area). */
export const LAYER_HEIGHT = { idle: 300, quiet: 360, medium: 430, full: 500 } as const;

export interface Layer {
  id: string;
  name: string;
  kind: 'builtin' | 'saved';
  intent: IntentId | 'long-focus' | 'custom';
  beatHz: number;
  carrierHz: number;
  noise: NoiseSetting;
  motion: Motion;
  /** Steady: Hold is locked and can't be switched to Drift. */
  motionLocked?: boolean;
  driftHz: number;
  driftPeriodMin: number;
  fadeInSec: number;
  fadeOutSec: number;
  /** Plays the beat (false = noise only). */
  binaural: boolean;
  /** Evening descent is a journey (core Program) rather than a held preset. */
  journey?: 'evening-descent';
  version: string;
  /** For saved layers: which layer it was copied from, and when it was saved. */
  basedOn?: string;
  savedAt?: number;
  /** Level the layer starts at (Just working → Quiet). */
  startLevel?: LevelName;
  /** One honest line shown with the layer (Long focus). */
  note?: string;
  /** Vary: which noise this session picked (shown on the readout). */
  variant?: string;
}

const builtin = (l: Omit<Layer, 'kind' | 'version' | 'binaural' | 'driftHz' | 'driftPeriodMin' | 'fadeOutSec'> & Partial<Layer>): Layer =>
  Object.freeze({
    kind: 'builtin',
    version: '1.0',
    binaural: true,
    driftHz: 0.5,
    driftPeriodMin: 10,
    fadeOutSec: 20,
    ...l,
  }) as Layer;

/** The five intents (spec §3), in display order, plus Long focus. */
export const BUILT_IN_LAYERS: readonly Layer[] = Object.freeze([
  builtin({ id: 'focus', name: 'Focus', intent: 'focus', beatHz: 14, carrierHz: 207, noise: { type: 'brown', volume: 0.25 }, motion: 'drift', fadeInSec: 8 }),
  builtin({ id: 'calm', name: 'Calm', intent: 'calm', beatHz: 10, carrierHz: 180, noise: { type: 'pink', volume: 0.2 }, motion: 'drift', fadeInSec: 8 }),
  builtin({ id: 'unwind', name: 'Unwind', intent: 'unwind', beatHz: 6, carrierHz: 160, noise: { type: 'pink', volume: 0.25 }, motion: 'drift', fadeInSec: 8 }),
  builtin({
    id: 'sleep',
    name: 'Evening descent',
    intent: 'sleep',
    beatHz: 8,
    carrierHz: 140,
    noise: { type: 'brown', volume: 0.35 },
    motion: 'hold',
    fadeInSec: 8,
    fadeOutSec: 60,
    journey: 'evening-descent',
  }),
  builtin({ id: 'steady', name: 'Steady', intent: 'steady', beatHz: 10, carrierHz: 180, noise: { type: 'brown', volume: 0.35 }, motion: 'hold', motionLocked: true, fadeInSec: 15 }),
  builtin({
    id: 'long-focus',
    name: 'Long focus',
    intent: 'long-focus',
    beatHz: 40,
    carrierHz: 220,
    noise: { type: 'pink', volume: 0.2 },
    motion: 'drift',
    fadeInSec: 8,
    note: 'At 40 Hz the beat is faint. Most of what you hear is texture.',
  }),
]);

export const INTENT_ORDER: readonly IntentId[] = ['focus', 'calm', 'unwind', 'sleep', 'steady'];
export const INTENT_SHORT: Record<IntentId, string> = { focus: 'Focus', calm: 'Calm', unwind: 'Unwind', sleep: 'Sleep', steady: 'Steady' };

export function builtInLayer(id: string): Layer | undefined {
  return BUILT_IN_LAYERS.find((l) => l.id === id);
}

/** A noise-only twin of a layer ("More layers" and the headphone fallbacks). */
export function noiseOnlyOf(l: Layer): Layer {
  return { ...l, id: `${l.id}~noise`, name: `${l.name}, noise only`, binaural: false, noise: l.noise.type === 'off' ? { type: 'brown', volume: 0.3 } : l.noise };
}

/** Evening descent as a core Program: 8 → 4 → 2 Hz over 30 min, then 15 min low, then a 60 s fade to silence. */
export function eveningDescentProgram(l: Layer): Program {
  return {
    id: 'evening-descent',
    name: l.name,
    tagline: '8 Hz easing to 2 Hz over 30 minutes, then 15 quiet minutes and silence.',
    start: { beatHz: 8, carrierHz: 140, level: 1, noise: l.noise },
    segments: [
      { durationSec: 15 * 60, beatHz: 4, carrierHz: 130, label: 'Easing' },
      { durationSec: 15 * 60, beatHz: 2, carrierHz: 120, level: 0.6, label: 'Slower' },
      { durationSec: 15 * 60, level: 0.4, label: 'Low' },
    ],
    end: 'stop',
    endFadeSec: 60,
    presetId: l.id,
  };
}

/** Turn a layer into the core Program the ProgramPlayer plays. */
export function programFor(l: Layer, level: LevelName): Program {
  if (l.journey === 'evening-descent') return { ...eveningDescentProgram(l), volume: LEVEL_VOLUME[level] };
  return { ...presetToProgram(layerToPreset(l)), id: `layer:${l.id}`, name: l.name, volume: LEVEL_VOLUME[level], endFadeSec: l.fadeOutSec };
}

/** Core Preset view of a layer (used for saving into the core store and for presetToProgram). */
export function layerToPreset(l: Layer): Preset {
  return {
    id: l.id,
    name: l.name,
    tagline: describeLayer(l, 'plain'),
    beatHz: l.beatHz,
    carrierHz: l.carrierHz,
    volume: LEVEL_VOLUME.medium,
    noise: { ...l.noise },
    band: bandFor(l.beatHz),
    builtIn: l.kind === 'builtin',
    tone: 'custom',
  };
}

/** Extra Tuck fields we keep on a saved core Preset (core's normalize() keeps unknown keys). */
export interface TuckPresetExtras {
  tuck?: Pick<Layer, 'motion' | 'driftHz' | 'driftPeriodMin' | 'fadeInSec' | 'fadeOutSec' | 'binaural' | 'basedOn' | 'savedAt' | 'version'>;
}

export function presetToLayer(p: Preset & TuckPresetExtras): Layer {
  const t = p.tuck;
  return {
    id: p.id,
    name: p.name,
    kind: 'saved',
    intent: 'custom',
    beatHz: p.beatHz,
    carrierHz: p.carrierHz,
    noise: { ...p.noise },
    motion: t?.motion ?? 'drift',
    driftHz: t?.driftHz ?? 0.5,
    driftPeriodMin: t?.driftPeriodMin ?? 10,
    fadeInSec: t?.fadeInSec ?? 8,
    fadeOutSec: t?.fadeOutSec ?? 20,
    binaural: t?.binaural ?? true,
    version: t?.version ?? '1',
    basedOn: t?.basedOn,
    savedAt: t?.savedAt ?? p.createdAt,
  };
}

export const ears = (l: Pick<Layer, 'beatHz' | 'carrierHz'>) => {
  const { leftHz, rightHz } = earFrequencies(l.carrierHz, l.beatHz);
  return { left: round1(leftHz), right: round1(rightHz) };
};

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function hz(v: number): string {
  const r = round1(v);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export const NOISE_NAME: Record<NoiseType | 'off', string> = { white: 'white', pink: 'pink', brown: 'brown', off: 'no' };

export function noiseLine(n: NoiseSetting): string {
  return n.type === 'off' ? 'No noise' : `${capital(n.type)} noise`;
}

export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "A 14 Hz beat over soft brown noise." Describes the design, never an outcome. */
export function describeLayer(l: Layer, labels: 'warm' | 'plain'): string {
  if (!l.binaural) return labels === 'plain' ? `Noise only, ${l.noise.type}.` : `soft ${l.noise.type} noise, no beat`;
  if (l.journey === 'evening-descent') return '8 Hz easing to 2 Hz over 30 minutes, then 15 quiet minutes and silence.';
  const noise = l.noise.type === 'off' ? 'no noise' : `${labels === 'plain' ? '' : 'soft '}${l.noise.type} noise`;
  return labels === 'plain' ? `${hz(l.beatHz)} Hz beat, ${noise}.` : `a ${hz(l.beatHz)} Hz beat over ${noise}`;
}

/** Engraved line for pickers: "14 Hz · brown noise · Drift". */
export function engravedLine(l: Layer): string {
  const parts = [] as string[];
  if (l.binaural) parts.push(l.journey ? '8 → 2 Hz' : `${hz(l.beatHz)} Hz`);
  parts.push(l.noise.type === 'off' ? 'no noise' : `${l.noise.type} noise`);
  parts.push(l.motion === 'drift' ? 'Drift' : l.motion === 'vary' ? 'Vary' : 'Hold');
  return parts.join(' · ');
}

/**
 * Vary: the noise beds a layer rotates through, one per session, without asking. Colours stay within
 * the layer's character (dark beds for Focus and Sleep, softer ones for Calm). Levels are loudness-matched.
 */
const VARIANTS: Record<string, NoiseSetting['type'][]> = {
  focus: ['brown', 'pink', 'brown', 'white'],
  calm: ['pink', 'brown'],
  unwind: ['pink', 'brown'],
  'long-focus': ['pink', 'brown', 'white'],
};

export function variedLayer(l: Layer, index: number): Layer {
  const base = l.id.replace(/~noise$/, '');
  const list = VARIANTS[base] ?? (l.noise.type === 'off' ? ['off' as const] : [l.noise.type, l.noise.type === 'brown' ? 'pink' : 'brown']);
  const type = list[index % list.length]!;
  if (type === l.noise.type) return { ...l, variant: `${type} noise today` };
  return { ...l, noise: { ...l.noise, type }, variant: `${type} noise today` };
}

// ───────────────────────────── envelope (spec card plot) ─────────────────────────────

export interface EnvelopePoint {
  t: number;
  v: number;
}

/** Level over time for the spec-card plot: fade-in ramp, plateau, fade-out ramp. Journeys follow their steps. */
export function envelopeFor(
  l: Layer,
  timerMin: number | null,
): { points: EnvelopePoint[]; totalSec: number; open: boolean; plateauFrom: number; plateauTo: number; beat?: EnvelopePoint[] } {
  const fadeIn = l.fadeInSec;
  if (l.journey === 'evening-descent') {
    const total = 45 * 60 + 60;
    return {
      points: [
        { t: 0, v: 0 },
        { t: fadeIn, v: 1 },
        { t: 15 * 60, v: 1 },
        { t: 30 * 60, v: 0.6 },
        { t: 45 * 60, v: 0.4 },
        { t: total, v: 0 },
      ],
      totalSec: total,
      open: false,
      plateauFrom: fadeIn,
      plateauTo: 45 * 60,
      // The beat (Hz): 8 → 4 over 15 min, 4 → 2 over the next 15, then held at 2.
      beat: [
        { t: 0, v: 8 },
        { t: 15 * 60, v: 4 },
        { t: 30 * 60, v: 2 },
        { t: total, v: 2 },
      ],
    };
  }
  if (timerMin === null) {
    const span = 60 * 60;
    return { points: [{ t: 0, v: 0 }, { t: fadeIn, v: 1 }, { t: span, v: 1 }], totalSec: span, open: true, plateauFrom: fadeIn, plateauTo: span };
  }
  const end = timerMin * 60;
  return {
    points: [
      { t: 0, v: 0 },
      { t: fadeIn, v: 1 },
      { t: end, v: 1 },
      { t: end + l.fadeOutSec, v: 0 },
    ],
    totalSec: end + l.fadeOutSec,
    open: false,
    plateauFrom: fadeIn,
    plateauTo: end,
  };
}
