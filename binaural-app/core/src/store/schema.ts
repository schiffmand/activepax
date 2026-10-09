import type { StereoVerdict } from '../audio/stereoCheck';
import type { Preset } from '../presets';
import type { Band } from '../types';

export const SCHEMA_VERSION = 2;

export type ReducedMotion = 'system' | 'reduce' | 'full';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  /** User's layer volume 0..1 — persistent, applies to every session. */
  defaultVolume: number;
  reducedMotion: ReducedMotion;
  /**
   * Sensory mode: longer, softer fades; a lower volume ceiling; no noise-colour crossfades
   * that "swoosh"; UIs should also mute animation and contrast. Opt-in, never assumed.
   */
  sensoryMode: boolean;
  hapticsEnabled: boolean;
  /** Show Hz numbers & curves (programmers / tinkerers love this; others find it noise). */
  showFrequencies: boolean;
  defaultTimerSec: number | null;
  theme: Theme;
  headphoneCheck: { verdict: StereoVerdict | null; at: number | null };
  onboarded: boolean;
}

export interface SessionRecord {
  id: string;
  programId: string;
  presetId: string | null;
  name: string;
  startedAt: number;
  durationSec: number;
  band: Band;
  bandSeconds: Partial<Record<Band, number>>;
  completed: boolean;
  endedBy: 'timer' | 'program' | 'user';
  /** Optional, private self-report 1..5 ("how did that feel?"). Never required. */
  feeling?: number | null;
}

export interface AppState {
  schemaVersion: typeof SCHEMA_VERSION;
  customPresets: Preset[];
  /** Preset or program ids. Order is user-defined. */
  favorites: string[];
  settings: Settings;
  history: SessionRecord[];
  /** Last thing played, for one-tap "continue". */
  lastPlayed: { kind: 'preset' | 'program'; id: string } | null;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  defaultVolume: 0.3,
  reducedMotion: 'system',
  sensoryMode: false,
  hapticsEnabled: true,
  showFrequencies: false,
  defaultTimerSec: null,
  theme: 'system',
  headphoneCheck: Object.freeze({ verdict: null, at: null }) as Settings['headphoneCheck'],
  onboarded: false,
}) as Settings;

export function defaultState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    customPresets: [],
    favorites: ['focus'],
    settings: { ...DEFAULT_SETTINGS, headphoneCheck: { verdict: null, at: null } },
    history: [],
    lastPlayed: null,
  };
}

/** Audio behaviour derived from settings (sensory mode softens everything). */
export function audioProfile(settings: Settings): { fadeInSec: number; fadeOutSec: number; glideSec: number; maxVolume: number } {
  return settings.sensoryMode
    ? { fadeInSec: 6, fadeOutSec: 6, glideSec: 1.5, maxVolume: 0.6 }
    : { fadeInSec: 2.5, fadeOutSec: 2, glideSec: 0.4, maxVolume: 1 };
}

/** Resolve 'system' reduced motion against the platform preference. */
export function prefersReducedMotion(settings: Settings, systemPrefersReduced: boolean): boolean {
  if (settings.sensoryMode) return true;
  if (settings.reducedMotion === 'system') return systemPrefersReduced;
  return settings.reducedMotion === 'reduce';
}
