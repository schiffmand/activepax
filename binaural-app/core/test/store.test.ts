import { describe, expect, it, vi } from 'vitest';
import {
  MAX_HISTORY,
  MIN_SESSION_SEC,
  allPresets,
  createStore,
  findPreset,
  isFavorite,
  reducer,
  sessionToRecord,
  STORAGE_KEY,
} from '../src/store/store';
import { SCHEMA_VERSION, audioProfile, defaultState, prefersReducedMotion, type SessionRecord } from '../src/store/schema';
import { detectVersion, migrate } from '../src/store/migrations';
import { localStorageAdapter, memoryAdapter, type StorageLike } from '../src/store/persistence';
import { createCustomPreset, BUILT_IN_PRESETS } from '../src/presets';

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: over.id ?? `s${Math.random()}`,
  programId: 'preset:focus',
  presetId: 'focus',
  name: 'Focus',
  startedAt: 1000,
  durationSec: 600,
  band: 'beta',
  bandSeconds: { beta: 600 },
  completed: true,
  endedBy: 'timer',
  ...over,
});

const custom = () => {
  const r = createCustomPreset({ name: 'Mine', beatHz: 12, carrierHz: 200 });
  if (!r.ok) throw new Error('bad');
  return r.value;
};

describe('reducer', () => {
  it('adds, updates and removes custom presets (and cleans favourites/lastPlayed)', () => {
    const p = custom();
    let s = reducer(defaultState(), { type: 'preset/add', preset: p });
    expect(s.customPresets).toHaveLength(1);
    expect(reducer(s, { type: 'preset/add', preset: p })).toBe(s); // duplicate id
    expect(reducer(s, { type: 'preset/add', preset: BUILT_IN_PRESETS[0]! })).toBe(s); // built-ins can't be added
    s = reducer(s, { type: 'preset/update', preset: { ...p, name: 'Renamed' } });
    expect(s.customPresets[0]!.name).toBe('Renamed');
    expect(reducer(s, { type: 'preset/update', preset: { ...p, id: 'missing' } })).toBe(s);
    s = reducer(s, { type: 'favorite/toggle', id: p.id });
    s = reducer(s, { type: 'lastPlayed/set', value: { kind: 'preset', id: p.id } });
    s = reducer(s, { type: 'preset/remove', id: p.id });
    expect(s.customPresets).toHaveLength(0);
    expect(s.favorites).not.toContain(p.id);
    expect(s.lastPlayed).toBeNull();
    expect(reducer(s, { type: 'preset/remove', id: 'nope' })).toBe(s);
  });

  it('toggles and reorders favourites with a cap', () => {
    let s = defaultState();
    expect(s.favorites).toEqual(['focus']);
    s = reducer(s, { type: 'favorite/toggle', id: 'sleep' });
    s = reducer(s, { type: 'favorite/toggle', id: 'calm' });
    s = reducer(s, { type: 'favorite/reorder', ids: ['calm', 'ghost', 'focus'] });
    expect(s.favorites).toEqual(['calm', 'focus', 'sleep']);
    s = reducer(s, { type: 'favorite/toggle', id: 'focus' });
    expect(s.favorites).toEqual(['calm', 'sleep']);
    for (let i = 0; i < 40; i++) s = reducer(s, { type: 'favorite/toggle', id: `f${i}` });
    expect(s.favorites).toHaveLength(24);
  });

  it('updates settings and clamps volume', () => {
    let s = reducer(defaultState(), { type: 'settings/update', patch: { sensoryMode: true, defaultVolume: 4 } });
    expect(s.settings).toMatchObject({ sensoryMode: true, defaultVolume: 1, theme: 'system' });
    s = reducer(s, { type: 'settings/update', patch: { defaultVolume: -1 } });
    expect(s.settings.defaultVolume).toBe(0);
  });

  it('records sessions (ignoring very short ones and duplicates), keeps them sorted and capped', () => {
    let s = defaultState();
    s = reducer(s, { type: 'history/add', record: rec({ id: 'a', startedAt: 5000 }) });
    s = reducer(s, { type: 'history/add', record: rec({ id: 'b', startedAt: 1000 }) });
    expect(s.history.map((h) => h.id)).toEqual(['b', 'a']);
    expect(reducer(s, { type: 'history/add', record: rec({ id: 'c', durationSec: MIN_SESSION_SEC - 1 }) })).toBe(s);
    expect(reducer(s, { type: 'history/add', record: rec({ id: 'a' }) })).toBe(s);
    let big = defaultState();
    big = { ...big, history: Array.from({ length: MAX_HISTORY }, (_, i) => rec({ id: `h${i}`, startedAt: i })) };
    big = reducer(big, { type: 'history/add', record: rec({ id: 'new', startedAt: 10 ** 9 }) });
    expect(big.history).toHaveLength(MAX_HISTORY);
    expect(big.history.at(-1)!.id).toBe('new');
    expect(big.history[0]!.id).toBe('h1');
  });

  it('rates, removes and clears history', () => {
    let s = reducer(defaultState(), { type: 'history/add', record: rec({ id: 'a' }) });
    s = reducer(s, { type: 'history/rate', id: 'a', feeling: 9 });
    expect(s.history[0]!.feeling).toBe(5);
    s = reducer(s, { type: 'history/rate', id: 'a', feeling: null });
    expect(s.history[0]!.feeling).toBeNull();
    expect(reducer(s, { type: 'history/rate', id: 'zzz', feeling: 3 })).toBe(s);
    expect(reducer(s, { type: 'history/remove', id: 'a' }).history).toHaveLength(0);
    const cleared = reducer(s, { type: 'history/clear' });
    expect(cleared.history).toHaveLength(0);
    expect(reducer(cleared, { type: 'history/clear' })).toBe(cleared);
  });

  it('replaces and resets state; unknown actions are no-ops', () => {
    const s = reducer(defaultState(), { type: 'favorite/toggle', id: 'calm' });
    expect(reducer(s, { type: 'state/reset' })).toEqual(defaultState());
    const other = defaultState();
    expect(reducer(s, { type: 'state/replace', state: other })).toBe(other);
    expect(reducer(s, { type: 'nope' } as never)).toBe(s);
  });
});

describe('selectors and helpers', () => {
  it('lists built-in + custom presets and finds by id', () => {
    const p = custom();
    const s = reducer(defaultState(), { type: 'preset/add', preset: p });
    expect(allPresets(s)).toHaveLength(BUILT_IN_PRESETS.length + 1);
    expect(findPreset(s, p.id)?.name).toBe('Mine');
    expect(findPreset(s, 'sleep')?.builtIn).toBe(true);
    expect(isFavorite(s, 'focus')).toBe(true);
  });
  it('converts a player summary to a record', () => {
    const r = sessionToRecord({ programId: 'arrive', presetId: null, name: 'Arrive', startedAt: 5, endedAt: 10, durationSec: 300, band: 'alpha', bandSeconds: { alpha: 300 }, completed: true, endedBy: 'program' }, 'id1');
    expect(r).toEqual({ id: 'id1', programId: 'arrive', presetId: null, name: 'Arrive', startedAt: 5, durationSec: 300, band: 'alpha', bandSeconds: { alpha: 300 }, completed: true, endedBy: 'program' });
    expect(sessionToRecord({ programId: 'a', presetId: null, name: 'A', startedAt: 5, endedAt: 10, durationSec: 300, band: 'alpha', bandSeconds: {}, completed: true, endedBy: 'program' }).id).toMatch(/^session_/);
  });
  it('sensory mode softens the audio profile and forces reduced motion', () => {
    const s = defaultState().settings;
    expect(audioProfile(s).maxVolume).toBe(1);
    const sensory = { ...s, sensoryMode: true };
    expect(audioProfile(sensory).fadeInSec).toBeGreaterThan(audioProfile(s).fadeInSec);
    expect(audioProfile(sensory).maxVolume).toBeLessThan(1);
    expect(prefersReducedMotion(sensory, false)).toBe(true);
    expect(prefersReducedMotion(s, true)).toBe(true);
    expect(prefersReducedMotion(s, false)).toBe(false);
    expect(prefersReducedMotion({ ...s, reducedMotion: 'full' }, true)).toBe(false);
    expect(prefersReducedMotion({ ...s, reducedMotion: 'reduce' }, false)).toBe(true);
  });
  it('defaultState returns fresh objects', () => {
    const a = defaultState();
    a.settings.headphoneCheck.verdict = 'ok';
    a.favorites.push('x');
    expect(defaultState().settings.headphoneCheck.verdict).toBeNull();
    expect(defaultState().favorites).toEqual(['focus']);
  });
});

describe('migrations', () => {
  it('detects versions', () => {
    expect(detectVersion(null)).toBe(-1);
    expect(detectVersion('str')).toBe(-1);
    expect(detectVersion({})).toBe(0);
    expect(detectVersion({ version: 1 })).toBe(1);
    expect(detectVersion({ schemaVersion: 2 })).toBe(2);
  });

  it('empty storage -> defaults', () => {
    expect(migrate(null)).toEqual({ status: 'empty', state: defaultState() });
  });

  it('migrates v1 (flat settings, sessions) to current', () => {
    const v1 = {
      version: 1,
      favorites: ['calm'],
      customPresets: [],
      volume: 0.55,
      reducedMotion: true,
      sessions: [
        { id: 'x', preset: 'sleep', start: 1000, seconds: 900, beatHz: 2 },
        { preset: 'focus', start: 5000, seconds: 300 },
        { garbage: true },
      ],
    };
    const out = migrate(v1);
    expect(out.status).toBe('migrated');
    expect(out.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.state.settings).toMatchObject({ defaultVolume: 0.55, reducedMotion: 'reduce', sensoryMode: false });
    expect(out.state.favorites).toEqual(['calm']);
    expect(out.state.history).toHaveLength(2);
    expect(out.state.history[0]).toMatchObject({ id: 'x', presetId: 'sleep', band: 'delta', bandSeconds: { delta: 900 }, durationSec: 900 });
    expect(out.state.history[1]).toMatchObject({ id: 'migrated_1', band: 'alpha' });
  });

  it('migrates unversioned v0 data through every step', () => {
    const out = migrate({ favorites: ['sleep'], volume: 0.2 });
    expect(out.status).toBe('migrated');
    expect(out.state.favorites).toEqual(['sleep']);
    expect(out.state.settings.defaultVolume).toBe(0.2);
  });

  it('current-version data is normalised (missing fields filled, junk dropped)', () => {
    const out = migrate({ schemaVersion: 2, favorites: ['a', 3, null], settings: { theme: 'dark' } });
    expect(out.status).toBe('current');
    expect(out.state.favorites).toEqual(['a']);
    expect(out.state.settings).toMatchObject({ theme: 'dark', defaultVolume: 0.3, headphoneCheck: { verdict: null } });
    expect(out.state.history).toEqual([]);
  });

  it('future versions are flagged so we never clobber newer data', () => {
    expect(migrate({ schemaVersion: 99 }).status).toBe('future');
  });

  it('corrupt data falls back to defaults', () => {
    expect(migrate(42).status).toBe('corrupt');
    expect(migrate({ schemaVersion: -3 }).status).toBe('corrupt');
  });
});

describe('persistence adapters', () => {
  it('memory adapter round-trips JSON (and isolates references)', () => {
    const a = memoryAdapter({ k: { x: 1 } });
    expect(a.load('k')).toEqual({ x: 1 });
    const v = { y: [1] };
    a.save('k2', v);
    v.y.push(2);
    expect(a.load('k2')).toEqual({ y: [1] });
    a.remove!('k');
    expect(a.load('k')).toBeNull();
    expect(a.dump()).toEqual({ k2: { y: [1] } });
  });

  it('localStorage adapter round-trips and survives throwing storage', () => {
    const data = new Map<string, string>();
    const storage: StorageLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
    const a = localStorageAdapter(storage);
    a.save('k', { a: 1 });
    expect(a.load('k')).toEqual({ a: 1 });
    a.remove!('k');
    expect(a.load('k')).toBeNull();

    const broken: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {
        throw new Error('nope');
      },
    };
    const b = localStorageAdapter(broken);
    expect(() => b.save('k', 1)).not.toThrow();
    expect(b.load('k')).toBeNull();
    expect(() => b.remove!('k')).not.toThrow();

    data.set('bad', '{not json');
    expect(a.load('bad')).toBeNull();
  });

  it('localStorage adapter without any storage is inert', () => {
    const a = localStorageAdapter();
    expect(a.load('x')).toBeNull();
    expect(() => a.save('x', 1)).not.toThrow();
  });
});

describe('createStore', () => {
  it('dispatches, notifies subscribers and persists', async () => {
    const adapter = memoryAdapter();
    const store = createStore({ adapter });
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.dispatch({ type: 'favorite/toggle', id: 'sleep' });
    store.dispatch({ type: 'history/clear' }); // no-op: no notify, no write
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![1]).toEqual({ type: 'favorite/toggle', id: 'sleep' });
    await store.flush();
    expect((adapter.load(STORAGE_KEY) as { favorites: string[] }).favorites).toEqual(['focus', 'sleep']);
    off();
    store.dispatch({ type: 'favorite/toggle', id: 'calm' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('hydrates from storage, migrating and re-saving old data', async () => {
    const adapter = memoryAdapter({ [STORAGE_KEY]: { version: 1, favorites: ['calm'], volume: 0.4, sessions: [] } });
    const store = createStore({ adapter });
    const outcome = await store.hydrate();
    expect(outcome.status).toBe('migrated');
    expect(store.getState().settings.defaultVolume).toBe(0.4);
    await store.flush();
    expect((adapter.load(STORAGE_KEY) as { schemaVersion: number }).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('works with async adapters and a custom key', async () => {
    const backing = memoryAdapter();
    const adapter = {
      load: async (k: string) => backing.load(k),
      save: async (k: string, v: unknown) => {
        await new Promise((r) => setTimeout(r, 1));
        backing.save(k, v);
      },
    };
    const store = createStore({ adapter, key: 'custom' });
    await store.hydrate();
    store.dispatch({ type: 'settings/update', patch: { theme: 'dark' } });
    store.dispatch({ type: 'settings/update', patch: { theme: 'light' } });
    await store.flush();
    expect((backing.load('custom') as { settings: { theme: string } }).settings.theme).toBe('light');
  });

  it('becomes read-only for data from a newer app version', async () => {
    const adapter = memoryAdapter({ [STORAGE_KEY]: { schemaVersion: 99, secret: true } });
    const store = createStore({ adapter });
    await store.hydrate();
    expect(store.readOnly).toBe(true);
    store.dispatch({ type: 'favorite/toggle', id: 'calm' });
    await store.flush();
    expect(adapter.load(STORAGE_KEY)).toEqual({ schemaVersion: 99, secret: true });
    expect(store.getState().favorites).toContain('calm'); // still works in-memory
  });

  it('survives adapters that throw on load or save', async () => {
    const store = createStore({
      adapter: {
        load: () => {
          throw new Error('x');
        },
        save: () => Promise.reject(new Error('y')),
      },
    });
    expect((await store.hydrate()).status).toBe('empty');
    store.dispatch({ type: 'favorite/toggle', id: 'calm' });
    await expect(store.flush()).resolves.toBeUndefined();
  });

  it('works with no adapter at all', async () => {
    const store = createStore();
    store.dispatch({ type: 'favorite/toggle', id: 'calm' });
    expect(store.getState().favorites).toContain('calm');
    expect((await store.hydrate()).status).toBe('empty');
  });
});
