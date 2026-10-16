import { useSyncExternalStore } from 'react';
import { session } from '../audio/session';
import { otherApp } from '../audio/otherApp';
import { setSwap } from '../audio/hub';
import { store } from '../tuck/store';
import type { ChipId } from '../tuck/copy';
import type { Layer, Motion } from '../tuck/layers';

export type Page = 'home' | 'settings' | 'science' | 'studies' | 'mixing' | 'week' | 'plus' | 'editor' | 'lock' | 'blind';
export type Sheet = null | 'picker' | 'goals' | 'timer' | 'menu' | 'save' | 'headphones' | 'demo' | 'delete' | 'share' | 'anywhere' | 'export';
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
  /** The sharer's optional word of context, from the link (?note=). */
  sharedNote: string;
  /** The shared link was this person's first visit (no setup yet): they may well be on a speaker. */
  sharedNew: boolean;
  /** The idle layer sits lower when Home's top content needs the room (a notice plus the chips). */
  compactIdle: boolean;
  /** The layer's measured minimum height (handle + controls + a little felt). Grows with large text. */
  layerMinH: number;
  /** Playing: the height Home's top needs (top bar, any pill or notice, status, name, the glance line). The layer
   *  rests no higher than leaves this visible at default text sizes (round 4: Full covered the glance line). */
  playTopH: number;
  /** The export sheet: 'sent' = handed to the browser; 'framed' = in a viewer that may block files; 'failed'. */
  exportTried: 'sent' | 'framed' | 'failed' | null;
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
  sharedNew: false,
  sharedNote: '',
  compactIdle: false,
  layerMinH: 0,
  playTopH: 0,
  exportTried: null,
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
  /** A moment on the prototype's clock (?hour= shifts it), for anything shown or exported: times then agree. */
  appTime(ms: number): Date {
    return new Date(ms + (this.now().getTime() - Date.now()));
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

/**
 * Left/right swap follows the setting and the detected route at any time, not only at Start: a route that
 * turns up swapped mid-session is rewired inside a 50 ms dip (hub.setSwap). Round 3 audio: the swap used to
 * wait for the next session.
 */
export function wantSwap(): boolean {
  return store.get().prefs.swapChannels || ui.get().headphone === 'swapped';
}
const syncSwap = () => setSwap(wantSwap());
store.subscribe(syncSwap);
ui.subscribe(syncSwap);
syncSwap();

