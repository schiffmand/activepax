import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '@core';
import { session } from '../audio/session';
import { builtInLayer, type Layer, type Motion } from '../tuck/layers';
import { arrivalFor, type ChipId, firstPickLine, type Labels } from '../tuck/copy';
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
  const base: ThemeName = core.settings.theme === 'light' ? 'day' : core.settings.theme === 'system' ? (systemLight ? 'day' : 'night') : 'night';
  const dim =
    prefs.dimAtNight !== 'off' && evening && (prefs.dimAtNight === 'always' || layer.journey === 'evening-descent');
  const theme: ThemeName = dim ? 'dim' : base;
  const texture = prefs.texture && !prefs.plainLabels && !core.settings.sensoryMode && theme !== 'dim';
  const motion: Motion = layer.motionLocked ? 'hold' : active ? s.motion : u.motionOverride ?? prefs.lastMotion[layer.id] ?? layer.motion;
  return { st, u, s, prefs, core, labels, reduced, selected, layer, binaural, forced, hour, theme, texture, motion, active };
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

export function startSound() {
  const { prefs } = store.get();
  const u = ui.get();
  const l = store.findLayer(u.selectedId) ?? builtInLayer('focus')!;
  const motion: Motion = l.motionLocked ? 'hold' : u.motionOverride ?? prefs.lastMotion[l.id] ?? l.motion;
  const timer = prefs.timerByLayer[l.id] ?? null;
  ui.set({ chipsOpen: false });
  void session.start(l, { level: prefs.lastLevel, motion, timerMin: timer, binaural: binauralFor(l) });
}

export function stopSound() {
  void session.stop();
}
