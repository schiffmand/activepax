/**
 * Tuck's layer model, built on core types (Preset, Program, NoiseSetting).
 *
 * The product spec (docs/product-spec.md §3) asks core for new numbers (Focus 14 Hz / 207 Hz, Steady, noise beds
 * on every intent, Drift / Hold). Until core ships those, the prototype defines the five intents here as plain
 * data and hands them to the real core engine via presetToProgram / ProgramPlayer. Nothing here touches audio.
 */
import {
  GOAL_TRACKS,
  SHAM_BEAT_HZ,
  bandFor,
  compileProgram,
  earFrequencies,
  getGoalTrack,
  presetToProgram,
  sampleProgram,
  type GoalTrack,
  type GoalTrackId,
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
/** Round 2: raised by 40 to 70 px so the felt (stitch, time, timer) is the playing screen's centre, not a dead band above it. */
/** Round 4: playing heights raised (Medium +60) so the top band holds only the status, the name and one line. */
export const LAYER_HEIGHT = { idle: 300, quiet: 450, medium: 530, full: 580 } as const;

export interface Layer {
  id: string;
  name: string;
  kind: 'builtin' | 'saved';
  intent: IntentId | 'long-focus' | 'custom' | 'goal';
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
  /** Evening descent and the goal tracks are journeys (core Programs) rather than held presets. */
  journey?: 'evening-descent' | 'goal';
  /** For goal tracks: which core GoalTrack this layer plays. */
  goal?: GoalTrackId;
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

/** The goal tracks (core GOAL_TRACKS) as layers: pick a goal, no frequency to choose. */
export const GOAL_LAYERS: readonly Layer[] = Object.freeze(
  GOAL_TRACKS.map((t: GoalTrack) =>
    builtin({
      id: `goal-${t.id}`,
      name: t.goal,
      intent: 'goal',
      beatHz: t.program.start.beatHz,
      carrierHz: t.program.start.carrierHz,
      noise: t.program.start.noise ?? { type: 'off', volume: 0 },
      motion: 'hold',
      fadeInSec: 8,
      fadeOutSec: t.program.endFadeSec ?? 20,
      journey: 'goal',
      goal: t.id,
    }),
  ),
);

export const INTENT_ORDER: readonly IntentId[] = ['focus', 'calm', 'unwind', 'sleep', 'steady'];
export const INTENT_SHORT: Record<IntentId, string> = { focus: 'Focus', calm: 'Calm', unwind: 'Unwind', sleep: 'Evening descent', steady: 'Steady' };

export function builtInLayer(id: string): Layer | undefined {
  return BUILT_IN_LAYERS.find((l) => l.id === id) ?? GOAL_LAYERS.find((l) => l.id === id);
}

export interface JourneyInfo {
  program: Program;
  /** Minutes until it ends on its own; null when it plays until stopped. */
  minutes: number | null;
  endFadeSec: number;
  /** The beat's turning points, e.g. "10 → 6 → 8 Hz". */
  range: string;
  plain: string;
  warm: string;
  goodFor?: string;
}

/** The beat values a program turns at (start, every change of direction, end). */
function turningPoints(p: Program): number[] {
  const beats = [p.start.beatHz];
  let b = p.start.beatHz;
  for (const s of p.segments) {
    b = s.beatHz ?? b;
    beats.push(b);
  }
  const dedup = beats.filter((v, i) => i === 0 || Math.abs(v - beats[i - 1]!) > 1e-9);
  return dedup.filter((v, i) => i === 0 || i === dedup.length - 1 || Math.sign(v - dedup[i - 1]!) !== Math.sign(dedup[i + 1]! - v));
}

/** Everything the UI says about a journey layer, from its program. Null for held layers. */
export function journeyOf(l: Layer): JourneyInfo | null {
  if (l.journey === 'evening-descent') {
    return {
      program: eveningDescentProgram(l),
      minutes: 45,
      endFadeSec: 60,
      range: '8 → 2 Hz',
      plain: 'Evening descent: 8 Hz to 2 Hz over 30 min, then 15 min low, then silence.',
      warm: 'That’s Evening descent: 8 Hz easing to 2 Hz over 30 minutes, then 15 quiet minutes and silence.',
    };
  }
  const t = l.journey === 'goal' && l.goal ? getGoalTrack(l.goal) : undefined;
  if (!t) return null;
  const c = compileProgram(t.program);
  return {
    program: { ...t.program, start: { ...t.program.start, noise: l.noise } },
    minutes: c.totalSec === null ? null : Math.round(c.totalSec / 60),
    endFadeSec: c.endFadeSec,
    range: `${turningPoints(t.program).map(hz).join(' → ')} Hz`,
    plain: `${t.goal}: ${t.plays}`,
    warm: `That’s ${t.goal}. ${t.plays}`,
    goodFor: t.goodFor,
  };
}

/** "Ends after 20 min" / "Plays until you stop it". */
export function journeyEndText(j: JourneyInfo): string {
  return j.minutes === null ? 'Plays until you stop it' : `Ends after ${j.minutes} min`;
}

/** A noise-only twin of a layer ("More layers" and the headphone fallbacks). */
export function noiseOnlyOf(l: Layer): Layer {
  return { ...l, id: `${l.id}~noise`, name: `${l.name}, noise only`, binaural: false, noise: l.noise.type === 'off' ? { type: 'brown', volume: 0.3 } : l.noise };
}

/**
 * The control arm of a blind comparison: the same carrier in both ears (a 0 Hz beat, core SHAM_BEAT_HZ),
 * at the same tone level, with the same noise. It sounds like the layer (same hum, same bed) and differs only
 * in the beat, so the two arms can't be told apart by timbre. Round 3 audio B4: a noise-only arm could.
 * Held still (no drift, no journey); it keeps the layer's id so the comparison's bookkeeping is unchanged.
 */
export function shamOf(l: Layer): Layer {
  return { ...l, beatHz: SHAM_BEAT_HZ, binaural: true, journey: undefined, driftHz: 0, motion: 'hold' };
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
  const j = journeyOf(l);
  if (j) return { ...j.program, volume: LEVEL_VOLUME[level], presetId: l.id };
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

/**
 * The numbers the readout shows, always self-consistent (R − L = the beat shown). A journey shows where the
 * sound is right now while it plays, and its start values otherwise (round 4: "7.8 Hz · L 136 / R 144").
 */
export function readoutNumbers(l: Layer, live: { beatHz: number; carrierHz: number } | null): { beat: number; left: number; right: number } {
  if (!l.journey || !live) {
    const e = ears(l);
    return { beat: l.beatHz, left: e.left, right: e.right };
  }
  const e = ears(live);
  return { beat: round1(e.right - e.left), left: e.left, right: e.right };
}

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
  const j = journeyOf(l);
  if (j) return j.plain.slice(j.plain.indexOf(': ') + 2);
  const noise = l.noise.type === 'off' ? 'no noise' : `${labels === 'plain' ? '' : 'soft '}${l.noise.type} noise`;
  return labels === 'plain' ? `${hz(l.beatHz)} Hz beat, ${noise}.` : `a ${hz(l.beatHz)} Hz beat over ${noise}`;
}

/** Engraved line for pickers: "14 Hz · brown noise · Drift". */
export function engravedLine(l: Layer): string {
  const parts = [] as string[];
  if (l.binaural) parts.push(journeyOf(l)?.range ?? `${hz(l.beatHz)} Hz`);
  parts.push(l.noise.type === 'off' ? 'no noise' : `${l.noise.type} noise`);
  const j = journeyOf(l);
  if (j && l.journey === 'goal') parts.push(j.minutes === null ? 'all night' : `${j.minutes} min`);
  else parts.push(l.motion === 'drift' ? 'Drift' : l.motion === 'vary' ? 'Vary' : 'Hold');
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
  if (l.journey === 'goal') return goalEnvelope(l, fadeIn);
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

/** A goal track's envelope (level) and beat for the spec-card plot, sampled from its compiled program. */
function goalEnvelope(l: Layer, fadeIn: number) {
  const j = journeyOf(l)!;
  const c = compileProgram(j.program);
  const open = c.totalSec === null;
  const timed = c.timedSec;
  const totalSec = open ? timed + 30 * 60 : timed;
  const n = 120;
  const points: EnvelopePoint[] = [{ t: 0, v: 0 }];
  const beat: EnvelopePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (totalSec * i) / n;
    const smp = sampleProgram(c, t);
    beat.push({ t, v: smp.beatHz });
    if (t < fadeIn) continue;
    const fadeLeft = open ? 1 : Math.min(1, Math.max(0, (totalSec - t) / Math.max(1, c.endFadeSec)));
    points.push({ t, v: smp.level * fadeLeft });
  }
  return { points, totalSec, open, plateauFrom: fadeIn, plateauTo: open ? totalSec : totalSec - c.endFadeSec, beat };
}
