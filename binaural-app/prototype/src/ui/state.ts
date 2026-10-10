import { useSyncExternalStore } from 'react';
import { session } from '../audio/session';
import { otherApp } from '../audio/otherApp';
import { store } from '../tuck/store';
import type { ChipId } from '../tuck/copy';
import type { Layer, Motion } from '../tuck/layers';

export type Page = 'home' | 'settings' | 'science' | 'studies' | 'mixing' | 'week' | 'plus' | 'editor' | 'lock' | 'blind';
export type Sheet = null | 'picker' | 'timer' | 'menu' | 'save' | 'headphones' | 'demo' | 'delete' | 'share' | 'anywhere';
export type Headphone = 'stereoOk' | 'speaker' | 'oneEar' | 'callMode' | 'mono' | 'spatial' | 'swapped' | 'disconnected' | 'unknown';

export interface UiState {
  onboarding: null | 'intro' | 'ear';
  /** Ear check opened from Settings / banner instead of onboarding. */
  earFrom: 'onboarding' | 'settings';
  page: Page;
  sheet: Sheet;
  spec: boolean;
  chipsOpen: boolean;
  chip: ChipId | null;
  chipLine: string | null;
  chipFirst: string | null;
  /** The layer selected while idle (id). */
  selectedId: string;
  motionOverride: Motion | null;
  headphone: Headphone;
  /** Demo: pretend the local hour is this (null = real clock). */
  hourOverride: number | null;
  toast: string | null;
  /**
   * 'replace': the toast takes the felt's focal line for a few seconds (Saved, Deleted, Vary).
   * 'note': a line shown under the time while sound plays (the first-play "isn't a treatment" line). Cleared on stop.
   */
  toastKind: 'replace' | 'note';
  /** A draft from "Edit a copy". */
  draftFrom: string | null;
  deleteId: string | null;
  /** The editor's unsaved copy, handed to the Save sheet. */
  draft: Layer | null;
  /** What we know: the section to scroll to ('beat' or 'noise'). */
  anchor: 'beat' | 'noise' | null;
  /** A layer opened from a shared link, waiting to be saved or played. */
  shared: Layer | null;
  /** The idle layer sits lower when Home's top content needs the room (a notice plus the chips). */
  compactIdle: boolean;
  /** The layer's measured minimum height (handle + controls + a little felt). Grows with large text. */
  layerMinH: number;
}

const initial: UiState = {
  onboarding: null,
  earFrom: 'onboarding',
  page: 'home',
  sheet: null,
  spec: false,
  chipsOpen: false,
  chip: null,
  chipLine: null,
  chipFirst: null,
  selectedId: 'focus',
  motionOverride: null,
  headphone: 'stereoOk',
  hourOverride: null,
  toast: null,
  toastKind: 'replace',
  draftFrom: null,
  deleteId: null,
  draft: null,
  anchor: null,
  shared: null,
  compactIdle: false,
  layerMinH: 0,
};

class Ui {
  private s: UiState = initial;
  private ls = new Set<() => void>();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  get = () => this.s;
  subscribe = (fn: () => void) => {
    this.ls.add(fn);
    return () => this.ls.delete(fn);
  };
  set = (p: Partial<UiState>) => {
    // Toasts never follow you: opening a sheet, a page or the spec card dismisses them.
    const covers = (p.sheet !== undefined && p.sheet !== null) || (p.page !== undefined && p.page !== 'home') || p.spec === true || (p.onboarding !== undefined && p.onboarding !== null);
    if (covers && this.s.toast && p.toast === undefined) {
      p = { ...p, toast: null };
      if (this.toastTimer) clearTimeout(this.toastTimer);
    }
    this.s = { ...this.s, ...p };
    for (const l of this.ls) l();
  };
  toast(msg: string, ms = 4000, kind: 'replace' | 'note' = 'replace') {
    this.set({ toast: msg, toastKind: kind });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.set({ toast: null }), ms);
  }
  hour() {
    return this.s.hourOverride ?? new Date().getHours();
  }
  /** The prototype's clock: the real time, with the hour replaced by ?hour= or Prototype controls. */
  now(): Date {
    const d = new Date();
    if (this.s.hourOverride !== null) d.setHours(this.s.hourOverride);
    return d;
  }
  clearToast() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.s.toast) this.set({ toast: null });
  }
}

export const ui = new Ui();

// A note that belongs to a session (the first-play line) never outlives it: Stop, Esc, a timer or a call clears it.
session.subscribe(() => {
  const ph = session.get().phase;
  const u = ui.get();
  if (u.toast && u.toastKind === 'note' && (ph === 'fadingOut' || ph === 'idle')) ui.clearToast();
});

export const useUi = () => useSyncExternalStore(ui.subscribe, ui.get);
export const useSession = () => useSyncExternalStore(session.subscribe, session.get);
export const useStore = () => useSyncExternalStore(store.subscribe, store.get);
export const useOther = () => useSyncExternalStore(otherApp.subscribe, otherApp.get);

/** Headphone states that stop the beat from forming (noise only is forced unless the user overrides). */
export const FORCES_NOISE: Headphone[] = ['speaker', 'oneEar', 'callMode', 'mono', 'disconnected'];
