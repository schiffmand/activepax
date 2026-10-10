/**
 * App state. The core store (createStore + localStorageAdapter) is the source of truth for saved layers
 * (customPresets), history, lastPlayed and the settings core already knows (sensoryMode, reducedMotion, theme,
 * onboarded, headphoneCheck, haptics, showFrequencies, defaultTimerSec). Tuck-only settings from the spec
 * (§5.9) that core's schema v2 doesn't have yet live beside it in `tuck/prefs`, persisted through the same
 * core adapter, until core's schema v3 lands.
 */
import { createStore, localStorageAdapter, type AppState, type Preset, type Store } from '@core';
import { BUILT_IN_LAYERS, builtInLayer, presetToLayer, type Layer, type LevelName, type Motion, type TuckPresetExtras } from './layers';

export type ThemePref = 'night' | 'day' | 'system';
export type DimPref = 'auto' | 'always' | 'off';

export interface TuckPrefs {
  askArrival: boolean;
  /** Once the user turns "Ask how I'm arriving" off, mode switches never turn it back on. */
  askArrivalUserSet: boolean;
  greeting: boolean;
  plainLabels: boolean;
  texture: boolean;
  breathingLayer: boolean;
  legibleText: boolean;
  levelCeiling: LevelName;
  ceilingLocked: boolean;
  fadeInSec: number;
  fadeOutSec: number;
  defaultMotion: Motion;
  swapChannels: boolean;
  noiseOnly: boolean;
  advancedTuning: boolean;
  takeFiveChime: boolean;
  autoContinue: boolean;
  dimAtNight: DimPref;
  appIcon: 'tuck' | 'plain';
  liveActivityStyle: 'standard' | 'minimal';
  showWeeklyTotal: boolean;
  tooMuchLayerId: string | null;
  theme: ThemePref;
  /** Remember-once UI facts. */
  chipsSeen: string[];
  audioNoteDismissed: boolean;
  hintDone: boolean;
  firstSessionDone: boolean;
  timerByLayer: Record<string, number | null>;
  lastLevel: LevelName;
  lastMotion: Record<string, Motion>;
  lastVisit: number | null;
  /** Values the user changed after Sensory mode applied its bundle. */
  sensoryOverrides: string[];
}

export const DEFAULT_PREFS: TuckPrefs = {
  askArrival: true,
  askArrivalUserSet: false,
  greeting: true,
  plainLabels: false,
  texture: true,
  breathingLayer: false,
  legibleText: false,
  levelCeiling: 'full',
  ceilingLocked: false,
  fadeInSec: 8,
  fadeOutSec: 20,
  defaultMotion: 'drift',
  swapChannels: false,
  noiseOnly: false,
  advancedTuning: false,
  takeFiveChime: true,
  autoContinue: false,
  dimAtNight: 'auto',
  appIcon: 'tuck',
  liveActivityStyle: 'standard',
  showWeeklyTotal: true,
  tooMuchLayerId: null,
  theme: 'night',
  chipsSeen: [],
  audioNoteDismissed: false,
  hintDone: false,
  firstSessionDone: false,
  timerByLayer: {},
  lastLevel: 'medium',
  lastMotion: {},
  lastVisit: null,
  sensoryOverrides: [],
};

/** Sensory mode's bundle (spec §5.9). Applied once when switched on; each value can still be changed. */
export const SENSORY_BUNDLE: Partial<TuckPrefs> = {
  plainLabels: true,
  greeting: false,
  askArrival: false,
  texture: false,
  defaultMotion: 'hold',
  fadeInSec: 15,
  fadeOutSec: 30,
  levelCeiling: 'medium',
  ceilingLocked: true,
  takeFiveChime: false,
  breathingLayer: false,
};

const PREFS_KEY = 'tuck/prefs';

export interface TuckState {
  core: AppState;
  prefs: TuckPrefs;
  hydrated: boolean;
}

type Listener = () => void;

function sanitizePrefs(raw: unknown): TuckPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFS };
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_PREFS };
  for (const [k, def] of Object.entries(DEFAULT_PREFS)) {
    const v = r[k];
    if (v === undefined) continue;
    if (def === null ? v === null || typeof v === 'string' : typeof v === typeof def && (Array.isArray(def) === Array.isArray(v))) out[k] = v;
  }
  return out as unknown as TuckPrefs;
}

class TuckStore {
  readonly core: Store;
  private readonly adapter = localStorageAdapter();
  private state: TuckState;
  private listeners = new Set<Listener>();

  constructor() {
    this.core = createStore({ adapter: this.adapter, key: 'tuck/core' });
    this.state = { core: this.core.getState(), prefs: { ...DEFAULT_PREFS }, hydrated: false };
    this.core.subscribe((core) => this.set({ core }));
  }

  async hydrate() {
    await this.core.hydrate();
    let prefs = DEFAULT_PREFS;
    try {
      prefs = sanitizePrefs(await this.adapter.load(PREFS_KEY));
    } catch {
      prefs = { ...DEFAULT_PREFS };
    }
    this.set({ prefs, core: this.core.getState(), hydrated: true });
  }

  get = () => this.state;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<TuckState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  setPrefs(patch: Partial<TuckPrefs>, opts: { user?: boolean } = {}) {
    const prev = this.state.prefs;
    const next = { ...prev, ...patch };
    if (opts.user && prev.sensoryOverrides !== undefined && this.state.core.settings.sensoryMode) {
      next.sensoryOverrides = [...new Set([...prev.sensoryOverrides, ...Object.keys(patch)])];
    }
    if (opts.user && patch.askArrival === false) next.askArrivalUserSet = true;
    if (opts.user && patch.askArrival === true) next.askArrivalUserSet = false;
    this.set({ prefs: next });
    void this.adapter.save(PREFS_KEY, next);
  }

  /** Sensory mode: one switch. Applies the bundle once; switching off restores the warm defaults the user hasn't touched. */
  setSensory(on: boolean) {
    this.core.dispatch({ type: 'settings/update', patch: { sensoryMode: on, hapticsEnabled: on ? false : this.state.core.settings.hapticsEnabled } });
    const p = this.state.prefs;
    if (on) {
      const bundle = { ...SENSORY_BUNDLE };
      this.setPrefs({ ...bundle, sensoryOverrides: [] });
    } else {
      const restore: Partial<TuckPrefs> = {};
      for (const k of Object.keys(SENSORY_BUNDLE) as (keyof TuckPrefs)[]) {
        if (p.sensoryOverrides.includes(k)) continue;
        (restore as Record<string, unknown>)[k] = DEFAULT_PREFS[k];
      }
      // "Ask how I'm arriving" stays off once the user has turned it off themselves.
      if (p.askArrivalUserSet) delete restore.askArrival;
      this.setPrefs({ ...restore, sensoryOverrides: [] });
    }
  }

  setPlainLabels(on: boolean) {
    const p = this.state.prefs;
    const patch: Partial<TuckPrefs> = { plainLabels: on };
    if (on) {
      patch.greeting = false;
      patch.texture = false;
      patch.askArrival = false;
    } else {
      patch.greeting = true;
      patch.texture = true;
      if (!p.askArrivalUserSet) patch.askArrival = true;
    }
    this.setPrefs(patch, { user: true });
  }

  savedLayers(): Layer[] {
    return this.state.core.customPresets.map((p) => presetToLayer(p as Preset & TuckPresetExtras));
  }

  findLayer(id: string | null | undefined): Layer | undefined {
    if (!id) return undefined;
    if (id.endsWith('~noise')) {
      const base = this.findLayer(id.slice(0, -'~noise'.length));
      return base ? { ...base, id, name: `${base.name}, noise only`, binaural: false } : undefined;
    }
    return builtInLayer(id) ?? this.savedLayers().find((l) => l.id === id);
  }

  allLayers(): Layer[] {
    return [...BUILT_IN_LAYERS, ...this.savedLayers()];
  }

  resetAll() {
    this.core.dispatch({ type: 'state/reset' });
    this.setPrefs({ ...DEFAULT_PREFS });
    this.core.dispatch({ type: 'settings/update', patch: { theme: 'dark', hapticsEnabled: false } });
  }
}

export const store = new TuckStore();
