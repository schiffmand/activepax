import { LIMITS, bandFor, type Band, type NoiseSetting, type Result } from './types';

export interface Preset {
  id: string;
  name: string;
  /** One-line, honest description — what it's *for*, not what it "does to your brain". */
  tagline: string;
  beatHz: number;
  carrierHz: number;
  /** Suggested volume 0..1 — low enough to sit under music/podcasts. */
  volume: number;
  noise: NoiseSetting;
  band: Band;
  builtIn: boolean;
  /** Optional icon/colour hint for UIs (no visual decisions live in core). */
  tone?: 'focus' | 'deep' | 'calm' | 'wind' | 'sleep' | 'custom';
  createdAt?: number;
  updatedAt?: number;
}

export type PresetInput = Pick<Preset, 'name' | 'beatHz' | 'carrierHz'> &
  Partial<Pick<Preset, 'id' | 'tagline' | 'volume' | 'noise' | 'tone'>>;

/** Volume ceiling for built-ins: these are meant to be a quiet layer, not the main event. */
export const DEFAULT_LAYER_VOLUME = 0.3;

const preset = (p: Omit<Preset, 'band' | 'builtIn'>): Preset => Object.freeze({ ...p, band: bandFor(p.beatHz), builtIn: true });

/**
 * Built-in presets. Frequencies follow common convention for each EEG band.
 * Copy is deliberately non-medical: the evidence for binaural beats is mixed and individual.
 */
export const BUILT_IN_PRESETS: readonly Preset[] = Object.freeze([
  preset({
    id: 'focus',
    name: 'Focus',
    tagline: 'A steady beta hum for getting into the work.',
    beatHz: 16,
    carrierHz: 200,
    volume: 0.3,
    noise: { type: 'off', volume: 0.25 },
    tone: 'focus',
  }),
  preset({
    id: 'deep-work',
    name: 'Deep Work',
    tagline: 'A 40 Hz gamma layer for long, absorbed stretches.',
    beatHz: 40,
    carrierHz: 220,
    volume: 0.28,
    noise: { type: 'pink', volume: 0.2 },
    tone: 'deep',
  }),
  preset({
    id: 'calm',
    name: 'Calm',
    tagline: 'Alpha at 10 Hz — relaxed but awake.',
    beatHz: 10,
    carrierHz: 180,
    volume: 0.3,
    noise: { type: 'off', volume: 0.25 },
    tone: 'calm',
  }),
  preset({
    id: 'wind-down',
    name: 'Wind Down',
    tagline: 'Theta at 6 Hz for the end of the day.',
    beatHz: 6,
    carrierHz: 160,
    volume: 0.26,
    noise: { type: 'pink', volume: 0.25 },
    tone: 'wind',
  }),
  preset({
    id: 'sleep',
    name: 'Sleep',
    tagline: 'Slow delta at 2 Hz under soft brown noise.',
    beatHz: 2,
    carrierHz: 120,
    volume: 0.22,
    noise: { type: 'brown', volume: 0.35 },
    tone: 'sleep',
  }),
]);

export function getBuiltInPreset(id: string): Preset | undefined {
  return BUILT_IN_PRESETS.find((p) => p.id === id);
}

/** Validate tone parameters. Returns human-readable errors (suitable for UI). */
export function validateTone(beatHz: number, carrierHz: number): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(beatHz)) errors.push('Beat frequency must be a number.');
  else if (beatHz < LIMITS.beatHz.min || beatHz > LIMITS.beatHz.max)
    errors.push(`Beat frequency must be between ${LIMITS.beatHz.min} and ${LIMITS.beatHz.max} Hz.`);
  if (!Number.isFinite(carrierHz)) errors.push('Carrier frequency must be a number.');
  else if (carrierHz < LIMITS.carrierHz.min || carrierHz > LIMITS.carrierHz.max)
    errors.push(`Carrier frequency must be between ${LIMITS.carrierHz.min} and ${LIMITS.carrierHz.max} Hz.`);
  if (Number.isFinite(beatHz) && Number.isFinite(carrierHz) && beatHz >= carrierHz)
    errors.push('Beat frequency must be lower than the carrier frequency.');
  return errors;
}

export function validatePreset(input: PresetInput): string[] {
  const errors = validateTone(input.beatHz, input.carrierHz);
  const name = (input.name ?? '').trim();
  if (!name) errors.push('Give your preset a name.');
  else if (name.length > 40) errors.push('Name must be 40 characters or fewer.');
  if (input.volume !== undefined && (!Number.isFinite(input.volume) || input.volume < 0 || input.volume > 1))
    errors.push('Volume must be between 0 and 1.');
  if (input.noise) {
    if (!['off', 'white', 'pink', 'brown'].includes(input.noise.type)) errors.push('Unknown noise type.');
    if (!Number.isFinite(input.noise.volume) || input.noise.volume < 0 || input.noise.volume > 1)
      errors.push('Noise volume must be between 0 and 1.');
  }
  return errors;
}

let idCounter = 0;
/** Collision-resistant id without crypto dependencies. */
export function makeId(prefix = 'id', now: number = Date.now()): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}_${now.toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Create a validated custom preset. */
export function createCustomPreset(input: PresetInput, now: number = Date.now()): Result<Preset> {
  const errors = validatePreset(input);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id: input.id ?? makeId('preset', now),
      name: input.name.trim(),
      tagline: input.tagline?.trim() ?? '',
      beatHz: round(input.beatHz, 2),
      carrierHz: round(input.carrierHz, 1),
      volume: input.volume ?? DEFAULT_LAYER_VOLUME,
      noise: input.noise ? { ...input.noise } : { type: 'off', volume: 0.25 },
      band: bandFor(input.beatHz),
      builtIn: false,
      tone: input.tone ?? 'custom',
      createdAt: now,
      updatedAt: now,
    },
  };
}

/** Apply a partial edit to a custom preset, re-validating. Built-ins cannot be edited. */
export function updateCustomPreset(existing: Preset, patch: Partial<PresetInput>, now: number = Date.now()): Result<Preset> {
  if (existing.builtIn) return { ok: false, errors: ['Built-in presets can’t be edited — save a copy instead.'] };
  const merged: PresetInput = {
    id: existing.id,
    name: patch.name ?? existing.name,
    tagline: patch.tagline ?? existing.tagline,
    beatHz: patch.beatHz ?? existing.beatHz,
    carrierHz: patch.carrierHz ?? existing.carrierHz,
    volume: patch.volume ?? existing.volume,
    noise: patch.noise ?? existing.noise,
    tone: patch.tone ?? existing.tone,
  };
  const r = createCustomPreset(merged, now);
  if (!r.ok) return r;
  return { ok: true, value: { ...r.value, createdAt: existing.createdAt ?? now } };
}

function round(v: number, dp: number): number {
  const k = 10 ** dp;
  return Math.round(v * k) / k;
}
