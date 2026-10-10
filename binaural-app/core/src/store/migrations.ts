import type { StereoVerdict } from '../audio/stereoCheck';
import { validatePreset, type Preset } from '../presets';
import { BANDS, NOISE_TYPES, bandFor, clamp, type Band } from '../types';
import { SCHEMA_VERSION, defaultState, type AppState, type SessionRecord, type Settings } from './schema';

/**
 * Adapters return `{ [UNPARSEABLE_KEY]: rawText }` when stored text isn't valid JSON (e.g. a truncated
 * write), so migrate() reports it as 'corrupt' (and the store's hydrate() backs the raw text up under
 * `${key}.corrupt-<timestamp>` before anything can overwrite it) instead of 'empty'.
 */
export const UNPARSEABLE_KEY = '__unparseable';

export function unparseable(raw: string): { [UNPARSEABLE_KEY]: string } {
  return { [UNPARSEABLE_KEY]: raw };
}

export function isUnparseable(raw: unknown): raw is { [UNPARSEABLE_KEY]: string } {
  return !!raw && typeof raw === 'object' && UNPARSEABLE_KEY in raw;
}

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * migrations[n] upgrades a version-n document to version n+1.
 * Add a new entry (and bump SCHEMA_VERSION) for every breaking shape change; never edit old ones.
 */
export const MIGRATIONS: Record<number, Migration> = {
  // v0: unversioned scratch data from the first prototype — keep only what is recognisable.
  0: (d) => ({
    version: 1,
    favorites: Array.isArray(d.favorites) ? d.favorites.filter((f): f is string => typeof f === 'string') : [],
    customPresets: [],
    volume: typeof d.volume === 'number' && Number.isFinite(d.volume) ? d.volume : 0.3,
    reducedMotion: false,
    sessions: [],
  }),
  // v1 -> v2: settings grouped; `volume` -> settings.defaultVolume; sessions -> history with bands.
  1: (d) => {
    const base = defaultState();
    const sessions: unknown[] = Array.isArray(d.sessions) ? d.sessions : [];
    const history: SessionRecord[] = sessions
      // Guard the shape first: null / primitive / garbage entries must be skipped, not crash the
      // whole migration (which would fall back to defaults and lose favourites and presets).
      .filter(
        (s): s is Record<string, unknown> =>
          !!s &&
          typeof s === 'object' &&
          !Array.isArray(s) &&
          typeof (s as Record<string, unknown>).start === 'number' &&
          Number.isFinite((s as Record<string, unknown>).start) &&
          typeof (s as Record<string, unknown>).seconds === 'number' &&
          ((s as Record<string, unknown>).seconds as number) >= 0 &&
          Number.isFinite((s as Record<string, unknown>).seconds),
      )
      .map((s, i) => {
        const beat = typeof s.beatHz === 'number' && Number.isFinite(s.beatHz) ? s.beatHz : 10;
        const band = bandFor(beat);
        return {
          id: typeof s.id === 'string' ? s.id : `migrated_${i}`,
          programId: typeof s.preset === 'string' ? `preset:${s.preset}` : 'unknown',
          presetId: typeof s.preset === 'string' ? s.preset : null,
          name: typeof s.preset === 'string' ? s.preset : 'Session',
          startedAt: s.start as number,
          durationSec: s.seconds as number,
          band,
          bandSeconds: { [band]: s.seconds as number },
          completed: true,
          endedBy: 'user',
        };
      });
    return {
      schemaVersion: 2,
      customPresets: Array.isArray(d.customPresets) ? d.customPresets : [],
      favorites: Array.isArray(d.favorites) ? d.favorites.filter((f): f is string => typeof f === 'string') : base.favorites,
      settings: {
        ...base.settings,
        defaultVolume: typeof d.volume === 'number' && Number.isFinite(d.volume) ? d.volume : base.settings.defaultVolume,
        reducedMotion: d.reducedMotion === true ? 'reduce' : 'system',
      },
      history,
      lastPlayed: null,
    };
  },
};

export function detectVersion(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return -1;
  const r = raw as Record<string, unknown>;
  if (typeof r.schemaVersion === 'number') return r.schemaVersion;
  if (typeof r.version === 'number') return r.version;
  return 0;
}

export type MigrationOutcome =
  | { status: 'empty'; state: AppState }
  | { status: 'current' | 'migrated'; state: AppState; from: number }
  | { status: 'future'; state: AppState; from: number }
  | {
      status: 'corrupt';
      state: AppState;
      error: string;
      /**
       * Set by the store's hydrate(): the storage key holding a copy of the original bytes,
       * written before anything could overwrite them. UIs can offer "recover / send to support".
       */
      backupKey?: string;
    };

/** Upgrade any persisted document to the current schema, filling gaps with defaults. */
export function migrate(raw: unknown): MigrationOutcome {
  if (raw === null || raw === undefined) return { status: 'empty', state: defaultState() };
  if (isUnparseable(raw)) return { status: 'corrupt', state: defaultState(), error: 'Stored data could not be parsed' };
  const from = detectVersion(raw);
  // -1 is detectVersion's "not an object"; anything else must be a non-negative integer (NaN, 1.5, -2 are
  // possible from non-JSON adapters such as structured clone or hand-edited data).
  if (from !== -1 && (!Number.isInteger(from) || from < 0))
    return { status: 'corrupt', state: defaultState(), error: `Invalid schema version ${from}` };
  if (from < 0) return { status: 'corrupt', state: defaultState(), error: 'Stored data is not an object' };
  if (from > SCHEMA_VERSION) return { status: 'future', state: defaultState(), from };
  let doc = { ...(raw as Record<string, unknown>) };
  try {
    for (let v = from; v < SCHEMA_VERSION; v++) {
      const m = MIGRATIONS[v];
      if (!m) throw new Error(`No migration from v${v}`);
      doc = m(doc);
    }
    return { status: from === SCHEMA_VERSION ? 'current' : 'migrated', state: normalize(doc), from };
  } catch (e) {
    return { status: 'corrupt', state: defaultState(), error: e instanceof Error ? e.message : String(e) };
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const REDUCED_MOTION: readonly Settings['reducedMotion'][] = ['system', 'reduce', 'full'];
const THEMES: readonly Settings['theme'][] = ['system', 'light', 'dark'];
const VERDICTS: readonly StereoVerdict[] = ['ok', 'swapped', 'mono', 'one-ear', 'unsure'];
const END_REASONS: readonly SessionRecord['endedBy'][] = ['timer', 'program', 'user'];

/**
 * Keep only the well-typed fields of a settings patch (used by normalize() and the reducer).
 * Numbers are clamped; anything of the wrong type (including NaN) is dropped.
 */
export function sanitizeSettingsPatch(input: unknown): Partial<Settings> {
  if (!isObj(input)) return {};
  const out: Partial<Settings> = {};
  if (isFiniteNum(input.defaultVolume)) out.defaultVolume = clamp(input.defaultVolume, 0, 1);
  if (REDUCED_MOTION.includes(input.reducedMotion as never)) out.reducedMotion = input.reducedMotion as Settings['reducedMotion'];
  if (typeof input.sensoryMode === 'boolean') out.sensoryMode = input.sensoryMode;
  if (typeof input.hapticsEnabled === 'boolean') out.hapticsEnabled = input.hapticsEnabled;
  if (typeof input.showFrequencies === 'boolean') out.showFrequencies = input.showFrequencies;
  if (input.defaultTimerSec === null || (isFiniteNum(input.defaultTimerSec) && input.defaultTimerSec > 0))
    out.defaultTimerSec = input.defaultTimerSec as number | null;
  if (THEMES.includes(input.theme as never)) out.theme = input.theme as Settings['theme'];
  if (typeof input.onboarded === 'boolean') out.onboarded = input.onboarded;
  if (isObj(input.headphoneCheck)) {
    const h = input.headphoneCheck;
    out.headphoneCheck = {
      verdict: VERDICTS.includes(h.verdict as never) ? (h.verdict as StereoVerdict) : null,
      at: isFiniteNum(h.at) ? h.at : null,
    };
  }
  return out;
}

function normalizePreset(p: unknown): Preset | null {
  if (!isObj(p) || typeof p.id !== 'string' || !p.id) return null;
  const candidate = p as unknown as Preset;
  if (typeof candidate.name !== 'string' || validatePreset(candidate).length) return null;
  const noise = isObj(p.noise) && (p.noise.type === 'off' || NOISE_TYPES.includes(p.noise.type as never)) && isFiniteNum(p.noise.volume)
    ? { type: p.noise.type as Preset['noise']['type'], volume: clamp(p.noise.volume, 0, 1) }
    : { type: 'off' as const, volume: 0.25 };
  return {
    ...candidate,
    tagline: typeof p.tagline === 'string' ? p.tagline : '',
    volume: isFiniteNum(p.volume) ? clamp(p.volume, 0, 1) : 0.3,
    noise,
    band: bandFor(candidate.beatHz),
    builtIn: false,
  };
}

function normalizeRecord(r: unknown, i: number): SessionRecord | null {
  if (!isObj(r)) return null;
  if (!isFiniteNum(r.startedAt) || !isFiniteNum(r.durationSec) || r.durationSec < 0) return null;
  if (!BANDS.includes(r.band as Band)) return null;
  const band = r.band as Band;
  const bandSeconds: Partial<Record<Band, number>> = {};
  if (isObj(r.bandSeconds)) {
    for (const b of BANDS) if (isFiniteNum(r.bandSeconds[b]) && (r.bandSeconds[b] as number) >= 0) bandSeconds[b] = r.bandSeconds[b] as number;
  }
  if (Object.keys(bandSeconds).length === 0) bandSeconds[band] = r.durationSec;
  const rec: SessionRecord = {
    id: typeof r.id === 'string' && r.id ? r.id : `recovered_${i}_${r.startedAt}`,
    programId: typeof r.programId === 'string' ? r.programId : 'unknown',
    presetId: typeof r.presetId === 'string' ? r.presetId : null,
    name: typeof r.name === 'string' ? r.name : 'Session',
    startedAt: r.startedAt,
    durationSec: r.durationSec,
    band,
    bandSeconds,
    completed: r.completed === true,
    endedBy: END_REASONS.includes(r.endedBy as never) ? (r.endedBy as SessionRecord['endedBy']) : 'user',
  };
  if (r.feeling === null) rec.feeling = null;
  else if (isFiniteNum(r.feeling)) rec.feeling = clamp(Math.round(r.feeling), 1, 5);
  return rec;
}

/** Defensive merge so partially-written or hand-edited data can't crash the app. Every field is type-checked. */
export function normalize(doc: Record<string, unknown>): AppState {
  const base = defaultState();
  const settings = sanitizeSettingsPatch(doc.settings);
  const lp = doc.lastPlayed;
  const lastPlayed: AppState['lastPlayed'] =
    isObj(lp) && (lp.kind === 'preset' || lp.kind === 'program') && typeof lp.id === 'string' ? { kind: lp.kind, id: lp.id } : null;
  const seen = new Set<string>();
  return {
    schemaVersion: SCHEMA_VERSION,
    customPresets: Array.isArray(doc.customPresets)
      ? doc.customPresets
          .map(normalizePreset)
          .filter((p): p is Preset => p !== null && !seen.has(p.id) && (seen.add(p.id), true))
      : [],
    favorites: Array.isArray(doc.favorites) ? (doc.favorites as unknown[]).filter((x): x is string => typeof x === 'string') : base.favorites,
    settings: {
      ...base.settings,
      ...settings,
      headphoneCheck: settings.headphoneCheck ?? base.settings.headphoneCheck,
    },
    history: Array.isArray(doc.history)
      ? doc.history.map(normalizeRecord).filter((r): r is SessionRecord => r !== null).sort((a, b) => a.startedAt - b.startedAt)
      : [],
    lastPlayed,
  };
}
