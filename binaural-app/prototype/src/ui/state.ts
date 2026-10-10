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
  draftFrom: null,
  deleteId: null,
  draft: null,
  anchor: null,
  shared: null,
  compactIdle: false,
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
  toast(msg: string, ms = 4000) {
    this.set({ toast: msg });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.set({ toast: null }), ms);
  }
  hour() {
    return this.s.hourOverride ?? new Date().getHours();
  }
}

export const ui = new Ui();

export const useUi = () => useSyncExternalStore(ui.subscribe, ui.get);
export const useSession = () => useSyncExternalStore(session.subscribe, session.get);
export const useStore = () => useSyncExternalStore(store.subscribe, store.get);
export const useOther = () => useSyncExternalStore(otherApp.subscribe, otherApp.get);

/** Headphone states that stop the beat from forming (noise only is forced unless the user overrides). */
export const FORCES_NOISE: Headphone[] = ['speaker', 'oneEar', 'callMode', 'mono'];
