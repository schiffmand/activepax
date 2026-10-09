/** Brainwave band labels used for presets and insights. Descriptive only — not a claim of effect. */
export type Band = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';

export const BANDS: readonly Band[] = ['delta', 'theta', 'alpha', 'beta', 'gamma'] as const;

export type NoiseType = 'white' | 'pink' | 'brown';
export const NOISE_TYPES: readonly NoiseType[] = ['white', 'pink', 'brown'] as const;

/** A noise bed setting. `type: 'off'` means no noise. Volume is 0..1 (perceptual). */
export interface NoiseSetting {
  type: NoiseType | 'off';
  volume: number;
}

/** The three parameters a program automates over time. */
export interface ToneTarget {
  /** Beat frequency in Hz = |right - left|. */
  beatHz: number;
  /** Centre (carrier) frequency in Hz. Left ear = carrier - beat/2, right = carrier + beat/2. */
  carrierHz: number;
  /** Program envelope 0..1, multiplied with the user's volume. 1 = "as loud as the user set it". */
  level: number;
}

export type RampCurve = 'linear' | 'exponential' | 'step';

/** Hard safety/validity limits shared by the engine, presets and programs. */
export const LIMITS = {
  beatHz: { min: 0.5, max: 45 },
  carrierHz: { min: 40, max: 1000 },
  volume: { min: 0, max: 1 },
  level: { min: 0, max: 1 },
} as const;

/** Classify a beat frequency into a conventional EEG band name. */
export function bandFor(beatHz: number): Band {
  if (beatHz < 4) return 'delta';
  if (beatHz < 8) return 'theta';
  if (beatHz < 13) return 'alpha';
  if (beatHz < 30) return 'beta';
  return 'gamma';
}

export function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/** Left/right oscillator frequencies for a carrier + beat. */
export function earFrequencies(carrierHz: number, beatHz: number): { leftHz: number; rightHz: number } {
  return { leftHz: carrierHz - beatHz / 2, rightHz: carrierHz + beatHz / 2 };
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };
