/**
 * The layer session: Start sound / Stop, level, Drift / Hold, timer, Take 5, glides between layers, and the
 * simulated interruptions. Uses core's ProgramPlayer (scheduler, timer, session accounting) on top of the
 * LayerEngine (core BinauralEngine + noise bed). Emits one snapshot for the UI.
 */
import { ProgramPlayer, sessionToRecord, AudioBlockedError, type PlayerState } from '@core';
import { getContext, ensureRunning, playChime, setSwap } from './hub';
import { LayerEngine } from './layerEngine';
import { createWarpClock } from './warpClock';
import { LEVEL_VOLUME, LEVELS, programFor, type Layer, type LevelName, type Motion } from '../tuck/layers';
import { store } from '../tuck/store';

export type Phase = 'idle' | 'starting' | 'fadingIn' | 'playing' | 'fadingOut';
export type Notice = 'call' | 'disconnected' | 'mixing' | 'blocked' | null;

export interface SessionSnapshot {
  phase: Phase;
  layer: Layer | null;
  level: LevelName;
  motion: Motion;
  binaural: boolean;
  timerMin: number | null;
  elapsedSec: number;
  remainingSec: number | null;
  /** The duration of the fade currently in progress (drives the lining's brightness transition). */
  fadeSec: number;
  stepLabel: string | null;
  beatNow: number | null;
  takeFive: { endsAtSec: number } | null;
  ended: { elapsedSec: number; fadeSec: number; at: number; byTimer: boolean } | null;
  notice: Notice;
}

const initial: SessionSnapshot = {
  phase: 'idle',
  layer: null,
  level: 'medium',
  motion: 'drift',
  binaural: true,
  timerMin: null,
  elapsedSec: 0,
  remainingSec: null,
  fadeSec: 0,
  stepLabel: null,
  beatNow: null,
  takeFive: null,
  ended: null,
  notice: null,
};

const TAKE_FIVE_SEC = 5 * 60;

/** Fades for a layer: saved layers keep their own; built-ins follow Settings (Steady never under 15 s in; Sleep 60 s out). */
export function fadesFor(layer: Layer): { fadeIn: number; fadeOut: number } {
  const p = store.get().prefs;
  if (layer.kind === 'saved') return { fadeIn: layer.fadeInSec, fadeOut: layer.fadeOutSec };
  const fadeIn = layer.id.startsWith('steady') ? Math.max(15, p.fadeInSec) : p.fadeInSec;
  const fadeOut = layer.journey ? 60 : p.fadeOutSec;
  return { fadeIn, fadeOut };
}

class Session {
  readonly clock = createWarpClock();
  private snap: SessionSnapshot = initial;
  private listeners = new Set<() => void>();
  private engine: LayerEngine | null = null;
  private player: ProgramPlayer | null = null;
  private offPlayer: (() => void)[] = [];
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  private driftTimer: ReturnType<typeof setTimeout> | undefined;
  private takeFiveTimer: unknown;
  private endedTimer: ReturnType<typeof setTimeout> | undefined;
  private switching = false;
  private driftSeed = 1;
  private driftOffset = 0;

  get = () => this.snap;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(p: Partial<SessionSnapshot>) {
    this.snap = { ...this.snap, ...p };
    for (const l of this.listeners) l();
  }

  isActive() {
    return this.snap.phase === 'fadingIn' || this.snap.phase === 'playing' || this.snap.phase === 'starting';
  }

  private ceiling(level: LevelName): LevelName {
    const { levelCeiling } = store.get().prefs;
    return LEVELS.indexOf(level) > LEVELS.indexOf(levelCeiling) ? levelCeiling : level;
  }

  /** Start sound (or pull up). Must run from a tap the first time (autoplay policy). */
  async start(layer: Layer, opts: { level: LevelName; motion: Motion; timerMin: number | null; binaural: boolean }) {
    const prefs = store.get().prefs;
    setSwap(prefs.swapChannels);
    const ok = await ensureRunning();
    if (!ok) {
      this.set({ notice: 'blocked' });
      return;
    }
    if (this.endedTimer) clearTimeout(this.endedTimer);
    const level = this.ceiling(opts.level);
    const { fadeIn, fadeOut } = fadesFor(layer);
    const reuse = this.engine && this.snap.phase === 'fadingOut';
    if (!reuse) {
      this.teardown(0);
      this.engine = new LayerEngine({ fadeInSec: fadeIn, fadeOutSec: fadeOut, glideSec: 4, binaural: opts.binaural });
      this.player = new ProgramPlayer(this.engine, {
        clock: this.clock,
        tickMs: 1000,
        minEndFadeSec: 3,
        switchGlideSec: 4,
        onSessionEnd: (s) => {
          if (s.durationSec >= 30) store.core.dispatch({ type: 'history/add', record: sessionToRecord(s) });
        },
      });
      this.offPlayer = [this.player.subscribe((s) => this.onPlayer(s))];
    } else {
      this.engine!.setBinaural(opts.binaural, 0.5);
    }
    this.set({
      phase: 'starting',
      layer,
      level,
      motion: layer.motionLocked ? 'hold' : opts.motion,
      binaural: opts.binaural,
      timerMin: opts.timerMin,
      ended: null,
      notice: null,
      takeFive: null,
      fadeSec: fadeIn,
    });
    try {
      await this.player!.play(programFor(layer, level), {
        timerSec: opts.timerMin === null ? null : opts.timerMin * 60 + fadeOut,
        endFadeSec: fadeOut,
        volume: LEVEL_VOLUME[level],
      });
    } catch (e) {
      this.set({ phase: 'idle', notice: e instanceof AudioBlockedError ? 'blocked' : null });
      return;
    }
    this.engine!.setVolume(LEVEL_VOLUME[level], 0.05);
    this.set({ phase: 'fadingIn', fadeSec: fadeIn });
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => {
      if (this.snap.phase === 'fadingIn') this.set({ phase: 'playing' });
    }, fadeIn * 1000);
    this.driftSeed = Math.floor(Math.random() * 1e9);
    this.driftOffset = 0;
    this.scheduleDrift();
    store.core.dispatch({ type: 'lastPlayed/set', value: { kind: 'preset', id: layer.id } });
    store.setPrefs({ lastLevel: opts.level, hintDone: true });
  }

  private onPlayer(s: PlayerState) {
    if (this.switching) return;
    const patch: Partial<SessionSnapshot> = {
      elapsedSec: s.elapsedSec,
      remainingSec: s.remainingSec,
      stepLabel: s.stepLabel,
      beatNow: s.status === 'playing' || s.status === 'ending' ? s.current.beatHz : null,
    };
    if (s.status === 'ending' && this.snap.phase !== 'fadingOut') {
      const fade = Math.max(3, s.remainingSec ?? 20);
      patch.phase = 'fadingOut';
      patch.fadeSec = fade;
      this.stopDrift();
      this.set(patch);
      return;
    }
    if (s.status === 'ended' && this.snap.phase !== 'idle' && this.snap.phase !== 'fadingOut') {
      // Timer finished without an ending phase (very short fades).
      patch.phase = 'idle';
    }
    if (s.status === 'ended' && this.snap.phase === 'fadingOut' && !this.snap.ended) {
      const byTimer = this.snap.remainingSec !== null && this.snap.remainingSec < 120;
      this.finishLine(s.elapsedSec, this.snap.fadeSec, byTimer && !this.snap.takeFive);
      if (this.snap.takeFive) patch.takeFive = null;
      patch.phase = 'idle';
    }
    this.set(patch);
  }

  private finishLine(elapsedSec: number, fadeSec: number, byTimer: boolean) {
    store.setPrefs({ firstSessionDone: true });
    this.set({ ended: { elapsedSec, fadeSec: Math.round(fadeSec), at: Date.now(), byTimer } });
    if (this.endedTimer) clearTimeout(this.endedTimer);
    // The session-end line shows for 8 s (30 s when it offers Take 5), then the home returns.
    this.endedTimer = setTimeout(() => this.set({ ended: null }), byTimer ? 30_000 : 8_000);
  }

  /** Stop / set down. The sound and the lining fade out together. */
  async stop(fadeOverride?: number, notice: Notice = null) {
    if (!this.player || !this.engine) return;
    if (this.snap.phase === 'idle' || this.snap.phase === 'fadingOut') return;
    const layer = this.snap.layer;
    const fade = fadeOverride ?? (layer ? fadesFor(layer).fadeOut : 20);
    const elapsed = this.player.getState().elapsedSec;
    this.stopDrift();
    this.clearTakeFive();
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.set({ phase: 'fadingOut', fadeSec: fade, notice, takeFive: null });
    this.switching = true;
    const p = this.player.stop(fade);
    this.switching = false;
    if (!notice) this.finishLine(elapsed, fade, false);
    await p;
    if ((this.snap.phase as Phase) === 'fadingOut') this.set({ phase: 'idle' });
  }

  setLevel(level: LevelName) {
    const l = this.ceiling(level);
    this.set({ level: l });
    store.setPrefs({ lastLevel: l });
    if (this.engine && this.isActive()) this.engine.setVolume(LEVEL_VOLUME[l], 1.2);
    // Haptics (off by default): one soft tick per level detent.
    const st = store.get().core.settings;
    if (st.hapticsEnabled && !st.sensoryMode && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(8);
  }

  setMotion(m: Motion) {
    if (this.snap.layer?.motionLocked) return;
    this.set({ motion: m });
    if (m === 'hold') {
      this.stopDrift();
      if (this.engine && this.snap.layer && this.isActive() && !this.snap.layer.journey) this.engine.rampTo({ beatHz: this.snap.layer.beatHz }, 4);
    } else this.scheduleDrift();
  }

  setTimer(min: number | null) {
    const fadeOut = this.snap.layer ? fadesFor(this.snap.layer).fadeOut : 20;
    this.set({ timerMin: min });
    if (this.player && this.isActive()) this.player.setTimer(min === null ? null : min * 60 + fadeOut);
  }

  setBinaural(on: boolean) {
    this.set({ binaural: on });
    if (this.engine && this.isActive()) this.engine.setBinaural(on, 4);
  }

  /** Change layer while sound plays: glide over 4 s (8 s if either is Hold). Without sound, just select. */
  async switchLayer(layer: Layer, opts: { motion: Motion; binaural: boolean; level?: LevelName }) {
    if (!this.player || !this.engine || !this.isActive() || !this.snap.layer) return;
    const glide = this.snap.motion === 'hold' || opts.motion === 'hold' ? 8 : 4;
    const level = this.ceiling(opts.level ?? this.snap.level);
    this.switching = true;
    try {
      // play() ends the previous session (recorded) and glides the same graph to the new values.
      await this.player.play(programFor(layer, level), {
        timerSec: this.snap.timerMin === null ? null : this.snap.timerMin * 60 + fadesFor(layer).fadeOut,
        endFadeSec: fadesFor(layer).fadeOut,
        volume: LEVEL_VOLUME[level],
      });
      this.engine.tones.rampTo({ beatHz: layer.beatHz, carrierHz: layer.carrierHz }, glide);
    } finally {
      this.switching = false;
    }
    this.engine.setBinaural(opts.binaural, glide);
    this.engine.setVolume(LEVEL_VOLUME[level], glide);
    this.set({ layer, motion: layer.motionLocked ? 'hold' : opts.motion, binaural: opts.binaural, level, elapsedSec: 0 });
    this.driftOffset = 0;
    this.scheduleDrift();
    store.core.dispatch({ type: 'lastPlayed/set', value: { kind: 'preset', id: layer.id } });
  }

  /** Live preview from the editor (1 s glide). */
  preview(p: { beatHz?: number; carrierHz?: number; noise?: Layer['noise'] }) {
    if (!this.engine || !this.isActive()) return;
    if (p.beatHz !== undefined || p.carrierHz !== undefined) this.engine.tones.rampTo({ beatHz: p.beatHz, carrierHz: p.carrierHz }, 1);
    if (p.noise) this.engine.setNoise(p.noise, 1);
  }

  /** Take 5: sound continues at Quiet for 5 minutes, one soft chime, then the layer fades out. */
  async takeFive(layer: Layer | null) {
    if (this.snap.phase === 'idle' || this.snap.phase === 'fadingOut') {
      const l = layer ?? this.snap.layer;
      if (!l) return;
      await this.start(l, { level: 'quiet', motion: this.snap.motion, timerMin: null, binaural: this.snap.binaural });
    } else this.setLevel('quiet');
    const endsAt = (this.player?.elapsedSec() ?? 0) + TAKE_FIVE_SEC;
    this.set({ takeFive: { endsAtSec: endsAt }, ended: null, level: 'quiet' });
    this.clearTakeFive();
    this.takeFiveTimer = this.clock.setTimeout(() => {
      this.takeFiveTimer = undefined;
      if (store.get().prefs.takeFiveChime) playChime();
      setTimeout(() => void this.stop(), 1600);
    }, TAKE_FIVE_SEC * 1000);
  }

  private clearTakeFive() {
    if (this.takeFiveTimer !== undefined) this.clock.clearTimeout(this.takeFiveTimer);
    this.takeFiveTimer = undefined;
  }

  // ───────────────────────────── Drift ─────────────────────────────

  /** Drift: a seeded, bounded, slow random walk on the beat (± driftHz). Hold: identical every time. */
  private scheduleDrift() {
    this.stopDrift();
    const l = this.snap.layer;
    if (!l || this.snap.motion !== 'drift' || l.journey || !this.engine) return;
    const stepSec = 60;
    const tick = () => {
      if (!this.engine || !this.isActive() || this.snap.motion !== 'drift') return;
      this.driftSeed = (this.driftSeed * 1664525 + 1013904223) % 4294967296;
      const r = this.driftSeed / 4294967296 - 0.5;
      // Steps small enough that a full ± range takes about one drift period.
      const step = (l.driftHz * 2 * stepSec) / (l.driftPeriodMin * 60);
      this.driftOffset = Math.max(-l.driftHz, Math.min(l.driftHz, this.driftOffset + r * 2 * step));
      this.engine.tones.rampTo({ beatHz: l.beatHz + this.driftOffset }, stepSec, 'linear');
      this.driftTimer = setTimeout(tick, stepSec * 1000);
    };
    this.driftTimer = setTimeout(tick, 10_000);
  }

  private stopDrift() {
    if (this.driftTimer) clearTimeout(this.driftTimer);
    this.driftTimer = undefined;
  }

  // ───────────────────────────── simulations ─────────────────────────────

  /** A phone call: fade out over 1.5 s, "Paused for your call." No auto-resume. */
  simulateCall() {
    void this.stop(1.5, 'call');
  }
  simulateDisconnect() {
    void this.stop(1.5, 'disconnected');
  }
  simulateMixingFailure() {
    void this.stop(1.5, 'mixing');
  }
  clearNotice() {
    this.set({ notice: null });
  }
  dismissEnded() {
    if (this.endedTimer) clearTimeout(this.endedTimer);
    this.set({ ended: null });
  }

  /** Time-lapse: jump to just before the next ending (timer fade or Take 5 chime). */
  skipAhead() {
    const s = this.player?.getState();
    if (!s || !this.isActive()) return false;
    if (this.snap.takeFive) {
      const left = this.snap.takeFive.endsAtSec - s.elapsedSec;
      if (left > 3) this.clock.skip((left - 3) * 1000);
      return true;
    }
    if (s.remainingSec === null) {
      this.clock.skip(10 * 60 * 1000);
      this.set({ elapsedSec: this.player!.getState().elapsedSec });
      return true;
    }
    const fade = this.snap.layer ? fadesFor(this.snap.layer).fadeOut : 20;
    const toFade = s.remainingSec - fade - 3;
    if (toFade > 0) this.clock.skip(toFade * 1000);
    this.set({ elapsedSec: this.player!.getState().elapsedSec, remainingSec: this.player!.getState().remainingSec });
    return true;
  }

  private teardown(afterSec: number) {
    for (const off of this.offPlayer.splice(0)) off();
    this.player?.dispose();
    this.engine?.dispose(afterSec);
    this.player = null;
    this.engine = null;
  }

  /** The AudioContext, for the ear check and the demo's other-app audio. */
  context() {
    return getContext();
  }
}

export const session = new Session();
