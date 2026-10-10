import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '@core';
import { localDate, session } from '../audio/session';
import { builtInLayer, noiseOnlyOf, variedLayer, type Layer, type Motion } from '../tuck/layers';
import { arrivalFor, chipForLayer, type ChipId, firstPickLine, type Labels } from '../tuck/copy';
import { store } from '../tuck/store';
import { FORCES_NOISE, ui, useSession, useStore, useUi } from './state';

function useMedia(q: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export type ThemeName = 'night' | 'day' | 'dim';

export function useTuck() {
  const st = useStore();
  const u = useUi();
  const s = useSession();
  const systemReduced = useMedia('(prefers-reduced-motion: reduce)');
  const systemLight = useMedia('(prefers-color-scheme: light)');
  const systemTransparencyReduced = useMedia('(prefers-reduced-transparency: reduce)');
  const { prefs, core } = st;
  const labels: Labels = prefs.plainLabels || core.settings.sensoryMode ? 'plain' : 'warm';
  const reduced = prefersReducedMotion(core.settings, systemReduced);
  const selected: Layer = store.findLayer(u.selectedId) ?? builtInLayer('focus')!;
  const active = s.phase !== 'idle';
  const layer = active && s.layer ? s.layer : selected;
  const forced = FORCES_NOISE.includes(u.headphone);
  const binaural = layer.binaural && !prefs.noiseOnly && !forced;
  const hour = u.hourOverride ?? new Date().getHours();
  const evening = hour >= 18 || hour < 6;
  const late = hour >= 21 || hour < 6;
  const base: ThemeName = core.settings.theme === 'light' ? 'day' : core.settings.theme === 'system' ? (systemLight ? 'day' : 'night') : 'night';
  // Auto: dim and warm after 21:00 for every layer, and from 18:00 for Sleep. Always: from 18:00.
  const sleepy = layer.journey === 'evening-descent' || layer.intent === 'sleep';
  const dim = prefs.dimAtNight !== 'off' && evening && (prefs.dimAtNight === 'always' || late || sleepy);
  const theme: ThemeName = dim ? 'dim' : base;
  const texture = prefs.texture && !prefs.plainLabels && !core.settings.sensoryMode && theme !== 'dim' && !systemTransparencyReduced;
  const motion: Motion = layer.motionLocked ? 'hold' : active ? s.motion : u.motionOverride ?? prefs.lastMotion[layer.id] ?? layer.motion;
  const transparencyReduced = systemTransparencyReduced;
  const sensory = core.settings.sensoryMode;
  return { st, u, s, prefs, core, labels, reduced, selected, layer, binaural, forced, hour, theme, texture, motion, active, systemReduced, transparencyReduced, sensory };
}

/** Pick an arrival chip: select its layer (never starts sound; glides if sound is playing). */
export function pickChip(chip: ChipId) {
  const { prefs } = store.get();
  const labels: Labels = prefs.plainLabels || store.get().core.settings.sensoryMode ? 'plain' : 'warm';
  const tooMuch = store.findLayer(prefs.tooMuchLayerId);
  const a = arrivalFor(chip, ui.hour(), tooMuch, labels);
  const first = !prefs.chipsSeen.includes(chip);
  if (first) store.setPrefs({ chipsSeen: [...prefs.chipsSeen, chip] });
  ui.set({ chipsOpen: false, chip, chipLine: a.line, chipFirst: first ? firstPickLine(chip, labels) : null, selectedId: a.layer.id, motionOverride: a.motion ?? null });
  if (a.level) store.setPrefs({ lastLevel: a.level });
  if (session.isActive()) void session.switchLayer(a.layer, { motion: a.motion ?? a.layer.motion, binaural: binauralFor(a.layer), level: a.level });
}

export function binauralFor(l: Layer): boolean {
  const { prefs } = store.get();
  return l.binaural && !prefs.noiseOnly && !FORCES_NOISE.includes(ui.get().headphone);
}

export function selectLayer(id: string) {
  const l = store.findLayer(id);
  if (!l) return;
  ui.set({ selectedId: id, motionOverride: null, chip: null, chipLine: null, chipFirst: null });
  if (session.isActive()) void session.switchLayer(l, { motion: store.get().prefs.lastMotion[l.id] ?? l.motion, binaural: binauralFor(l) });
}

export function startSound(layerId?: string) {
  const { prefs } = store.get();
  const u = ui.get();
  let l = store.findLayer(layerId ?? u.selectedId) ?? builtInLayer('focus')!;
  const motion: Motion = l.motionLocked ? 'hold' : u.motionOverride ?? prefs.lastMotion[l.id] ?? l.motion;
  const timer = prefs.timerByLayer[l.id] ?? null;
  let binaural = binauralFor(l);
  // A blind comparison on this layer: pick A or B (balanced, random), and play the beat or noise only.
  let blind: 'A' | 'B' | null = null;
  const b = prefs.blind;
  if (b && !b.revealed && b.layerId === l.id.replace(/~noise$/, '') && (b.plays.A + b.plays.B) < b.days * 3) {
    const diff = b.plays.A - b.plays.B;
    blind = diff > 0 ? 'B' : diff < 0 ? 'A' : Math.random() < 0.5 ? 'A' : 'B';
    const beat = blind === b.beatIs;
    const base = store.findLayer(b.layerId) ?? l;
    l = beat ? base : noiseOnlyOf(base);
    binaural = beat && binauralFor(base);
    store.setPrefs({ blind: { ...b, current: blind, plays: { ...b.plays, [blind]: b.plays[blind] + 1 } } });
  } else if (motion === 'vary') {
    // Vary: a different noise bed this session, chosen for you, within the layer's character.
    const i = (prefs.varyIndex[l.id] ?? 0) + 1;
    store.setPrefs({ varyIndex: { ...prefs.varyIndex, [l.id]: i } });
    l = variedLayer(l, i);
  }
  // The first play of the preselected layer gets the same "isn't a treatment" line as a tapped chip.
  const chip = u.chip ?? chipForLayer(l.id);
  if (chip && !blind && !prefs.chipsSeen.includes(chip) && prefs.askArrival && !prefs.pinnedLayerId) {
    store.setPrefs({ chipsSeen: [...prefs.chipsSeen, chip] });
    const labels: Labels = prefs.plainLabels || store.get().core.settings.sensoryMode ? 'plain' : 'warm';
    ui.toast(firstPickLine(chip, labels), 7000);
  }
  // Remember an evening session for the morning sleep note (local date of the night it started).
  const h = ui.hour();
  if (h >= 18 || h < 4) {
    const d = new Date();
    if (h < 4) d.setDate(d.getDate() - 1);
    store.setPrefs({ lastNight: { night: localDate(d), layerName: l.name.replace(/, noise only$/, '') } });
  }
  // The audio explainer is first-view only: it goes once sound has started.
  store.setPrefs({ audioNoteDismissed: true, hintDone: true });
  ui.set({ chipsOpen: false });
  void session.start(l, {
    level: prefs.lastLevel,
    motion,
    timerMin: typeof timer === 'number' ? timer : null,
    cycles: timer === 'cycles',
    binaural,
    blind,
  });
}

export function stopSound() {
  void session.stop();
}
