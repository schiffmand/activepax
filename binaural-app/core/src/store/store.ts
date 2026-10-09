import { Emitter } from '../emitter';
import { BUILT_IN_PRESETS, makeId, type Preset } from '../presets';
import type { SessionSummary } from '../scheduler';
import { migrate, type MigrationOutcome } from './migrations';
import type { PersistenceAdapter } from './persistence';
import { defaultState, type AppState, type SessionRecord, type Settings } from './schema';

/** Sessions shorter than this aren't recorded (accidental taps, previews). */
export const MIN_SESSION_SEC = 30;
/** History is capped so storage never grows without bound. */
export const MAX_HISTORY = 2000;
export const MAX_FAVORITES = 24;

export type Action =
  | { type: 'preset/add'; preset: Preset }
  | { type: 'preset/update'; preset: Preset }
  | { type: 'preset/remove'; id: string }
  | { type: 'favorite/toggle'; id: string }
  | { type: 'favorite/reorder'; ids: string[] }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'history/add'; record: SessionRecord }
  | { type: 'history/rate'; id: string; feeling: number | null }
  | { type: 'history/remove'; id: string }
  | { type: 'history/clear' }
  | { type: 'lastPlayed/set'; value: AppState['lastPlayed'] }
  | { type: 'state/replace'; state: AppState }
  | { type: 'state/reset' };

/** Pure reducer. Invalid actions are no-ops (return the same reference). */
export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'preset/add': {
      if (action.preset.builtIn) return state;
      if (state.customPresets.some((p) => p.id === action.preset.id)) return state;
      return { ...state, customPresets: [...state.customPresets, action.preset] };
    }
    case 'preset/update': {
      const idx = state.customPresets.findIndex((p) => p.id === action.preset.id);
      if (idx < 0) return state;
      const customPresets = state.customPresets.slice();
      customPresets[idx] = action.preset;
      return { ...state, customPresets };
    }
    case 'preset/remove': {
      if (!state.customPresets.some((p) => p.id === action.id)) return state;
      return {
        ...state,
        customPresets: state.customPresets.filter((p) => p.id !== action.id),
        favorites: state.favorites.filter((f) => f !== action.id),
        lastPlayed: state.lastPlayed?.id === action.id ? null : state.lastPlayed,
      };
    }
    case 'favorite/toggle': {
      const has = state.favorites.includes(action.id);
      if (!has && state.favorites.length >= MAX_FAVORITES) return state;
      return { ...state, favorites: has ? state.favorites.filter((f) => f !== action.id) : [...state.favorites, action.id] };
    }
    case 'favorite/reorder': {
      const set = new Set(state.favorites);
      const ordered = action.ids.filter((id) => set.has(id));
      const rest = state.favorites.filter((id) => !ordered.includes(id));
      return { ...state, favorites: [...ordered, ...rest] };
    }
    case 'settings/update': {
      const patch = { ...action.patch };
      if (patch.defaultVolume !== undefined) patch.defaultVolume = Math.min(1, Math.max(0, patch.defaultVolume));
      return { ...state, settings: { ...state.settings, ...patch } };
    }
    case 'history/add': {
      if (action.record.durationSec < MIN_SESSION_SEC) return state;
      if (state.history.some((h) => h.id === action.record.id)) return state;
      const history = [...state.history, action.record].sort((a, b) => a.startedAt - b.startedAt);
      return { ...state, history: history.length > MAX_HISTORY ? history.slice(history.length - MAX_HISTORY) : history };
    }
    case 'history/rate': {
      const idx = state.history.findIndex((h) => h.id === action.id);
      if (idx < 0) return state;
      const feeling = action.feeling === null ? null : Math.min(5, Math.max(1, Math.round(action.feeling)));
      const history = state.history.slice();
      history[idx] = { ...history[idx]!, feeling };
      return { ...state, history };
    }
    case 'history/remove':
      return { ...state, history: state.history.filter((h) => h.id !== action.id) };
    case 'history/clear':
      return state.history.length ? { ...state, history: [] } : state;
    case 'lastPlayed/set':
      return { ...state, lastPlayed: action.value };
    case 'state/replace':
      return action.state;
    case 'state/reset':
      return defaultState();
    default:
      return state;
  }
}

/** Convert a player SessionSummary into a history record. */
export function sessionToRecord(s: SessionSummary, id: string = makeId('session', s.startedAt)): SessionRecord {
  return {
    id,
    programId: s.programId,
    presetId: s.presetId,
    name: s.name,
    startedAt: s.startedAt,
    durationSec: s.durationSec,
    band: s.band,
    bandSeconds: s.bandSeconds,
    completed: s.completed,
    endedBy: s.endedBy,
  };
}

// ───────────────────────────── selectors ─────────────────────────────

export function allPresets(state: AppState): Preset[] {
  return [...BUILT_IN_PRESETS, ...state.customPresets];
}

export function findPreset(state: AppState, id: string): Preset | undefined {
  return allPresets(state).find((p) => p.id === id);
}

export function isFavorite(state: AppState, id: string): boolean {
  return state.favorites.includes(id);
}

// ───────────────────────────── store ─────────────────────────────

export interface StoreOptions {
  adapter?: PersistenceAdapter;
  key?: string;
  initialState?: AppState;
}

export interface Store {
  getState(): AppState;
  dispatch(action: Action): void;
  subscribe(fn: (state: AppState, action: Action) => void): () => void;
  /** Load + migrate persisted state. Call once at startup. */
  hydrate(): Promise<MigrationOutcome>;
  /** Resolves when all queued writes have finished. */
  flush(): Promise<void>;
  /** True if stored data came from a newer app version; we won't overwrite it. */
  readonly readOnly: boolean;
}

export const STORAGE_KEY = 'binaural-layer/state';

export function createStore(options: StoreOptions = {}): Store {
  const key = options.key ?? STORAGE_KEY;
  const adapter = options.adapter;
  let state = options.initialState ?? defaultState();
  let readOnly = false;
  let writeChain: Promise<void> = Promise.resolve();
  const emitter = new Emitter<{ change: { state: AppState; action: Action } }>();

  const persist = () => {
    if (!adapter || readOnly) return;
    const snapshot = state;
    writeChain = writeChain
      .then(() => adapter.save(key, snapshot))
      .catch(() => {
        /* persistence must never break the app */
      });
  };

  return {
    getState: () => state,
    get readOnly() {
      return readOnly;
    },
    dispatch(action) {
      const next = reducer(state, action);
      if (next === state) return;
      state = next;
      persist();
      emitter.emit('change', { state, action });
    },
    subscribe(fn) {
      return emitter.on('change', ({ state: s, action }) => fn(s, action));
    },
    async hydrate() {
      let raw: unknown = null;
      try {
        raw = adapter ? await adapter.load(key) : null;
      } catch {
        raw = null;
      }
      const outcome = migrate(raw);
      readOnly = outcome.status === 'future';
      state = outcome.state;
      if (outcome.status === 'migrated') persist();
      emitter.emit('change', { state, action: { type: 'state/replace', state } });
      return outcome;
    },
    flush: () => writeChain,
  };
}
