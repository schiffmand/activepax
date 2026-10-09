import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PRESETS,
  createCustomPreset,
  getBuiltInPreset,
  updateCustomPreset,
  validatePreset,
  validateTone,
} from '../src/presets';
import { bandFor, earFrequencies } from '../src/types';

describe('built-in presets', () => {
  it('cover the five core states with the expected bands', () => {
    const byId = Object.fromEntries(BUILT_IN_PRESETS.map((p) => [p.id, p]));
    expect(byId.focus).toMatchObject({ band: 'beta' });
    expect(byId.focus!.beatHz).toBeGreaterThanOrEqual(14);
    expect(byId.focus!.beatHz).toBeLessThanOrEqual(18);
    expect(byId['deep-work']).toMatchObject({ beatHz: 40, band: 'gamma' });
    expect(byId.calm).toMatchObject({ beatHz: 10, band: 'alpha' });
    expect(byId['wind-down']).toMatchObject({ beatHz: 6, band: 'theta' });
    expect(byId.sleep).toMatchObject({ beatHz: 2, band: 'delta' });
  });

  it('are valid, quiet enough to sit under music, and use sensible carriers', () => {
    for (const p of BUILT_IN_PRESETS) {
      expect(validatePreset(p)).toEqual([]);
      expect(p.carrierHz).toBeGreaterThanOrEqual(100);
      expect(p.carrierHz).toBeLessThanOrEqual(250);
      expect(p.volume).toBeLessThanOrEqual(0.35);
      expect(p.builtIn).toBe(true);
      expect(Object.isFrozen(p)).toBe(true);
    }
  });

  it('make no medical claims in copy', () => {
    const text = BUILT_IN_PRESETS.map((p) => `${p.name} ${p.tagline}`).join(' ').toLowerCase();
    for (const w of ['cure', 'treat', 'heal', 'adhd', 'anxiety', 'insomnia', 'clinically', 'proven', 'boost iq']) {
      expect(text).not.toContain(w);
    }
  });

  it('getBuiltInPreset finds by id', () => {
    expect(getBuiltInPreset('sleep')?.name).toBe('Sleep');
    expect(getBuiltInPreset('nope')).toBeUndefined();
  });
});

describe('validation', () => {
  it('accepts the documented boundaries', () => {
    expect(validateTone(0.5, 40)).toEqual([]);
    expect(validateTone(45, 1000)).toEqual([]);
  });
  it('rejects out-of-range and non-numeric values', () => {
    expect(validateTone(0.4, 200)).toHaveLength(1);
    expect(validateTone(46, 200)).toHaveLength(1);
    expect(validateTone(10, 39)).toHaveLength(1);
    expect(validateTone(10, 1001)).toHaveLength(1);
    expect(validateTone(NaN, 200)[0]).toMatch(/number/);
    expect(validateTone(10, Infinity)[0]).toMatch(/number/);
  });
  it('requires beat < carrier', () => {
    expect(validateTone(40, 40).join()).toMatch(/lower than the carrier/);
  });
  it('validates names, volume and noise', () => {
    expect(validatePreset({ name: '  ', beatHz: 10, carrierHz: 200 })).toContain('Give your preset a name.');
    expect(validatePreset({ name: 'x'.repeat(41), beatHz: 10, carrierHz: 200 })[0]).toMatch(/40 characters/);
    expect(validatePreset({ name: 'a', beatHz: 10, carrierHz: 200, volume: 2 })[0]).toMatch(/Volume/);
    expect(validatePreset({ name: 'a', beatHz: 10, carrierHz: 200, noise: { type: 'blue' as 'pink', volume: 0.2 } })[0]).toMatch(/noise type/);
    expect(validatePreset({ name: 'a', beatHz: 10, carrierHz: 200, noise: { type: 'pink', volume: -1 } })[0]).toMatch(/Noise volume/);
  });
});

describe('custom presets', () => {
  it('creates a normalised custom preset', () => {
    const r = createCustomPreset({ name: ' Coding ', beatHz: 15.555, carrierHz: 210.04 }, 1000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ name: 'Coding', beatHz: 15.56, carrierHz: 210, band: 'beta', builtIn: false, volume: 0.3, createdAt: 1000 });
    expect(r.value.id).toMatch(/^preset_/);
  });
  it('returns errors instead of throwing', () => {
    const r = createCustomPreset({ name: '', beatHz: 100, carrierHz: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => (createCustomPreset({ name: 'a', beatHz: 10, carrierHz: 200 }) as { value: { id: string } }).value.id));
    expect(ids.size).toBe(200);
  });
  it('updates custom presets (keeping createdAt) but not built-ins', () => {
    const r = createCustomPreset({ name: 'Mine', beatHz: 10, carrierHz: 200 }, 1);
    if (!r.ok) throw new Error();
    const u = updateCustomPreset(r.value, { beatHz: 4 }, 2);
    expect(u.ok && u.value).toMatchObject({ id: r.value.id, beatHz: 4, band: 'theta', createdAt: 1, updatedAt: 2 });
    expect(updateCustomPreset(r.value, { carrierHz: 1 }).ok).toBe(false);
    expect(updateCustomPreset(BUILT_IN_PRESETS[0]!, { beatHz: 12 }).ok).toBe(false);
  });
});

describe('band + ear helpers', () => {
  it('classifies bands at the boundaries', () => {
    expect([1, 3.99, 4, 7.9, 8, 12.9, 13, 29.9, 30, 40].map(bandFor)).toEqual([
      'delta', 'delta', 'theta', 'theta', 'alpha', 'alpha', 'beta', 'beta', 'gamma', 'gamma',
    ]);
  });
  it('splits the beat symmetrically around the carrier', () => {
    expect(earFrequencies(200, 10)).toEqual({ leftHz: 195, rightHz: 205 });
  });
});
