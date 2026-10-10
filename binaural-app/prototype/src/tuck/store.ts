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
/** A timer choice: minutes, no timer, or work/break cycles. */
export type TimerChoice = number | null | 'cycles';

/** One private, one-tap note about a session (only when the log or a blind comparison is on). */
export interface SessionNote {
  at: number;
  layerId: string;
  layerName: string;
  beatHz: number | null;
  noise: string;
  minutes: number;
  /** 3 = good, 2 = about the same, 1 = not for me. */
  rating: 1 | 2 | 3;
  /** Set during a blind comparison: which label played. */
  blind?: 'A' | 'B';
}

/** "How did you sleep?" the morning after a session that started in the evening. */
export interface SleepNote {
  /** The night the session started (local date, YYYY-MM-DD). */
  night: string;
  layerName: string;
  rating: 1 | 2 | 3 | 0;
  at: number;
}

/** A blind comparison: one layer, A and B (one with the beat, one noise only), randomised locally. */
export interface BlindState {
  layerId: string;
  /** Which label carries the beat. Hidden until the end. */
  beatIs: 'A' | 'B';
  startedAt: number;
  days: number;
  /** The label of the session that's playing now or played last. */
  current: 'A' | 'B' | null;
  plays: { A: number; B: number };
  revealed: boolean;
}

export interface Schedule {
  on: boolean;
  /** "HH:MM", local time. */
  time: string;
  layerId: string;
  /** The last local date (YYYY-MM-DD) it fired. */
  lastFired: string | null;
}
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
  /** Pinned layer: Home always offers this one layer, with no arrival question. */
  pinnedLayerId: string | null;
  theme: ThemePref;
  /** Private log: one tap after each session, and a sleep note the morning after. Off by default. */
  logOn: boolean;
  notes: SessionNote[];
  sleepNotes: SleepNote[];
  blind: BlindState | null;
  schedule: Schedule;
  /** Vary: which noise variant each layer played last. */
  varyIndex: Record<string, number>;
  /** The sample week came from Prototype controls. */
  sampleWeek: boolean;
  /** The "Start Tuck without opening it" suggestion was shown. */
  startTipSeen: boolean;
  /** Remember-once UI facts. */
  chipsSeen: string[];
  audioNoteDismissed: boolean;
  hintDone: boolean;
  firstSessionDone: boolean;
  timerByLayer: Record<string, TimerChoice>;
  lastLevel: LevelName;
  lastMotion: Record<string, Motion>;
  lastVisit: number | null;
  /** The last session that started in the evening (for the morning sleep note): layer, start time, length. */
  lastNight: { night: string; layerName: string; at: number; time: string; minutes?: number } | null;
  /** When Tuck first stayed under another app for 10 minutes (the activation moment). 0 = not yet. */
  activatedAt: number;
  /** Write each session to Health as mindful minutes (free; history and analysis are Plus). */
  healthOn: boolean;
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
  pinnedLayerId: null,
  theme: 'night',
  logOn: false,
  notes: [],
  sleepNotes: [],
  blind: null,
  schedule: { on: false, time: '21:30', layerId: 'sleep', lastFired: null },
  varyIndex: {},
  sampleWeek: false,
  startTipSeen: false,
  chipsSeen: [],
  audioNoteDismissed: false,
  hintDone: false,
  firstSessionDone: false,
  timerByLayer: {},
  lastLevel: 'medium',
  lastMotion: {},
  lastVisit: null,
  lastNight: null,
  activatedAt: 0,
  healthOn: false,
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
    // null defaults (optional ids and objects) accept a string, an object or null.
    if (def === null ? v === null || typeof v === 'string' || typeof v === 'object' : typeof v === typeof def && Array.isArray(def) === Array.isArray(v)) out[k] = v;
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

  /** A layer that isn't saved yet: one opened from a shared link. It plays like any other until Saved or dismissed. */
  private transient: Layer | null = null;
  setTransient(l: Layer | null) {
    this.transient = l;
    this.set({});
  }

  findLayer(id: string | null | undefined): Layer | undefined {
    if (!id) return undefined;
    if (this.transient && id === this.transient.id) return this.transient;
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
