/**
 * The layer session: Start sound / Stop, level, Drift / Hold, timer, Take 5, glides between layers, and the
 * simulated interruptions. Uses core's ProgramPlayer (scheduler, timer, session accounting) on top of the
 * LayerEngine (core BinauralEngine + noise bed). Emits one snapshot for the UI.
 */
import { ProgramPlayer, sessionToRecord, AudioBlockedError, type PlayerState } from '@core';
import { getContext, ensureRunning, playChime, setSwap } from './hub';
import { otherApp } from './otherApp';
import { LayerEngine } from './layerEngine';
import { createWarpClock } from './warpClock';
import { LEVEL_VOLUME, LEVELS, programFor, wanders, type Layer, type LevelName, type Motion } from '../tuck/layers';
import { store } from '../tuck/store';

/** Work/break cycles: 25 min at your level, 5 min at Quiet, one chime, back up. Four rounds. */
export const CYCLE = { workMin: 25, breakMin: 5, rounds: 4 } as const;

export interface Cycles {
  round: number;
  of: number;
  phase: 'work' | 'break';
  /** Elapsed seconds at which the current phase ends. */
  nextAtSec: number;
  /** The level work returns to after a break. */
  workLevel: LevelName;
}

export interface Ended {
  elapsedSec: number;
  fadeSec: number;
  at: number;
  byTimer: boolean;
  layerId: string;
  layerName: string;
  beatHz: number | null;
  noise: string;
  blind: 'A' | 'B' | null;
  /** Set once the one-tap note is saved (or skipped). */
  noted?: boolean;
  /** This was a Take 5 break ending: offer "Another N min" (the timer before the break). */
  afterBreak?: { timerMin: number | null };
}

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
  cycles: Cycles | null;
  /** During a blind comparison: the label playing (numbers are hidden). */
  blind: 'A' | 'B' | null;
  /** Drift's current offset from the layer's beat, Hz (drives the stitch gap). */
  driftOffset: number;
  ended: Ended | null;
  notice: Notice;
  /** Seconds of this session with another app playing above (the activation moment is 10 min of this). */
  underSec: number;
  /** The timer that ran before Take 5 (for "Another 25 min"). */
  breakAfterTimer: number | null;
  /** This session is the one where Tuck first stayed under another app for 10 minutes. */
  activatedNow: boolean;
  /** Wall-clock start of this session (ms). */
  startedAt: number;
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
  cycles: null,
  blind: null,
  driftOffset: 0,
  ended: null,
  notice: null,
  underSec: 0,
  breakAfterTimer: null,
  activatedNow: false,
  startedAt: 0,
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
  private fadeTimer: unknown;
  private driftTimer: ReturnType<typeof setTimeout> | undefined;
  private takeFiveTimer: unknown;
  private cycleTimer: unknown;
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
  async start(layer: Layer, opts: { level: LevelName; motion: Motion; timerMin: number | null; binaural: boolean; cycles?: boolean; blind?: 'A' | 'B' | null; keepLevel?: boolean }) {
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
      timerMin: opts.cycles ? null : opts.timerMin,
      ended: null,
      notice: null,
      takeFive: null,
      cycles: null,
      blind: opts.blind ?? null,
      driftOffset: 0,
      fadeSec: fadeIn,
      underSec: 0,
      breakAfterTimer: null,
      activatedNow: false,
      startedAt: Date.now(),
    });
    try {
      await this.player!.play(programFor(layer, level), {
        timerSec: opts.cycles || opts.timerMin === null ? null : opts.timerMin * 60 + fadeOut,
        endFadeSec: fadeOut,
        volume: LEVEL_VOLUME[level],
      });
    } catch (e) {
      this.set({ phase: 'idle', notice: e instanceof AudioBlockedError ? 'blocked' : null });
      return;
    }
    this.engine!.setVolume(LEVEL_VOLUME[level], 0.05);
    this.set({ phase: 'fadingIn', fadeSec: fadeIn });
    this.clearFadeTimer();
    // On the warp clock, so Skip ahead in Prototype controls also finishes the fade-in.
    this.fadeTimer = this.clock.setTimeout(() => {
      this.fadeTimer = undefined;
      if (this.snap.phase === 'fadingIn') this.set({ phase: 'playing' });
    }, fadeIn * 1000);
    this.driftSeed = Math.floor(Math.random() * 1e9);
    this.driftOffset = 0;
    this.scheduleDrift();
    this.clearCycles();
    if (opts.cycles) this.beginCycles(level);
    store.core.dispatch({ type: 'lastPlayed/set', value: { kind: 'preset', id: layer.id } });
    // A blind session or a Take 5 break doesn't change the level you come back to.
    if (!opts.blind && !opts.keepLevel) store.setPrefs({ lastLevel: opts.level });
  }

  private clearFadeTimer() {
    if (this.fadeTimer !== undefined) this.clock.clearTimeout(this.fadeTimer);
    this.fadeTimer = undefined;
  }

  private onPlayer(s: PlayerState) {
    if (this.switching) return;
    // Time under another app (1 s ticks). The first 10 minutes of it, ever, is Tuck's activation moment.
    if (s.status === 'playing' && otherApp.get().playing && this.isActive()) {
      const under = this.snap.underSec + Math.max(0, s.elapsedSec - this.snap.elapsedSec);
      if (under !== this.snap.underSec) this.set({ underSec: under });
      if (under >= 600 && !store.get().prefs.activatedAt) {
        store.setPrefs({ activatedAt: Date.now() });
        this.set({ activatedNow: true });
      }
    }
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

  private finishLine(elapsedSec: number, fadeSec: number, byTimer: boolean, afterBreak?: { timerMin: number | null }) {
    const p0 = store.get().prefs;
    store.setPrefs({ firstSessionDone: true });
    // The morning note names the layer, the time and the length of last night's session.
    const ln = p0.lastNight;
    if (ln && ln.minutes == null && Date.now() - ln.at < elapsedSec * 1000 + 10 * 60_000) store.setPrefs({ lastNight: { ...ln, minutes: Math.floor(elapsedSec / 60) } });
    const l = this.snap.layer;
    const binaural = this.snap.binaural && !!l?.binaural;
    this.set({
      ended: {
        elapsedSec,
        fadeSec: Math.round(fadeSec),
        at: Date.now(),
        byTimer,
        layerId: l?.id ?? 'focus',
        layerName: l?.name ?? 'Focus',
        beatHz: binaural && l ? l.beatHz : null,
        noise: l ? (l.noise.type === 'off' ? 'none' : l.noise.type) : 'brown',
        blind: this.snap.blind,
        afterBreak,
      },
    });
    if (this.endedTimer) clearTimeout(this.endedTimer);
    // The session-end line shows for 8 s (30 s when it offers Take 5 or a one-tap note), then the home returns.
    const p = store.get().prefs;
    const asks = (p.logOn || !!this.snap.blind) && elapsedSec >= 60;
    this.endedTimer = setTimeout(() => this.set({ ended: null }), byTimer || asks || afterBreak ? 30_000 : 8_000);
  }

  /** The one-tap note was saved or skipped: keep the line, drop the question. */
  markNoted() {
    if (this.snap.ended) this.set({ ended: { ...this.snap.ended, noted: true } });
    if (this.endedTimer) clearTimeout(this.endedTimer);
    // Keep "Set down after…" until the fade has finished, then let Home return.
    const clear = () => {
      if (this.snap.phase === 'fadingOut') this.endedTimer = setTimeout(clear, 1_000);
      else this.set({ ended: null });
    };
    this.endedTimer = setTimeout(clear, 4_000);
  }

  /** Stop / set down. The sound and the lining fade out together. */
  async stop(fadeOverride?: number, notice: Notice = null, byTimer = false) {
    if (!this.player || !this.engine) return;
    if (this.snap.phase === 'idle' || this.snap.phase === 'fadingOut') return;
    const layer = this.snap.layer;
    const fade = fadeOverride ?? (layer ? fadesFor(layer).fadeOut : 20);
    const elapsed = this.player.getState().elapsedSec;
    const afterBreak = this.snap.takeFive && byTimer ? { timerMin: this.snap.breakAfterTimer } : undefined;
    this.stopDrift();
    this.clearTakeFive();
    this.clearCycles();
    this.clearFadeTimer();
    this.set({ phase: 'fadingOut', fadeSec: fade, notice, takeFive: null, cycles: null });
    this.switching = true;
    const p = this.player.stop(fade);
    this.switching = false;
    if (!notice) this.finishLine(elapsed, fade, byTimer && !afterBreak, afterBreak);
    await p;
    if ((this.snap.phase as Phase) === 'fadingOut') this.set({ phase: 'idle' });
  }

  setLevel(level: LevelName) {
    // A blind comparison fixes the level for its sessions (so the two arms stay matched).
    if (this.snap.blind && this.isActive()) return;
    const l = this.ceiling(level);
    this.set({ level: l });
    if (this.snap.cycles && this.snap.cycles.phase === 'work') this.set({ cycles: { ...this.snap.cycles, workLevel: l } });
    store.setPrefs({ lastLevel: l });
    if (this.engine && this.isActive()) this.engine.setVolume(LEVEL_VOLUME[l], 1.2);
    // Haptics (off by default): one soft tick per level detent.
    const st = store.get().core.settings;
    if (st.hapticsEnabled && !st.sensoryMode && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(8);
  }

  setMotion(m: Motion) {
    if (this.snap.layer?.motionLocked) return;
    if (this.snap.blind && this.isActive()) return;
    const was = this.snap.motion;
    this.set({ motion: m });
    if (m === 'hold') {
      this.stopDrift();
      if (this.engine && this.snap.layer && this.isActive() && !this.snap.layer.journey) {
        this.engine.rampTo({ beatHz: this.snap.layer.beatHz }, 4);
        this.engine.wanderNoise(0, 4);
      }
      this.set({ driftOffset: 0 });
    } else if (!wanders(was)) this.scheduleDrift();
  }

  setTimer(min: number | 'cycles' | null) {
    const fadeOut = this.snap.layer ? fadesFor(this.snap.layer).fadeOut : 20;
    if (min === 'cycles') {
      this.set({ timerMin: null });
      this.player?.setTimer(null);
      if (this.isActive() && !this.snap.cycles) this.beginCycles(this.snap.level);
      return;
    }
    this.clearCycles();
    this.set({ timerMin: min, cycles: null });
    if (this.player && this.isActive()) this.player.setTimer(min === null ? null : min * 60 + fadeOut);
  }

  // ───────────────────────────── work/break cycles ─────────────────────────────

  private beginCycles(level: LevelName) {
    const at = (this.player?.elapsedSec() ?? 0) + CYCLE.workMin * 60;
    this.set({ cycles: { round: 1, of: CYCLE.rounds, phase: 'work', nextAtSec: at, workLevel: level } });
    this.scheduleCycle();
  }

  private scheduleCycle() {
    this.clearCycleTimer();
    const c = this.snap.cycles;
    if (!c || !this.player) return;
    const wait = Math.max(0, c.nextAtSec - this.player.elapsedSec());
    this.cycleTimer = this.clock.setTimeout(() => this.cycleStep(), wait * 1000);
  }

  private cycleStep() {
    this.cycleTimer = undefined;
    const c = this.snap.cycles;
    if (!c || !this.isActive()) return;
    const now = this.player?.elapsedSec() ?? 0;
    if (c.phase === 'work') {
      if (c.round >= c.of) {
        // The last round ends the session: one fade out, no break.
        this.set({ cycles: null });
        void this.stop(undefined, null, true);
        return;
      }
      this.applyLevel('quiet', 4);
      this.set({ cycles: { ...c, phase: 'break', nextAtSec: now + CYCLE.breakMin * 60 } });
    } else {
      if (store.get().prefs.takeFiveChime) playChime(LEVEL_VOLUME.quiet);
      this.applyLevel(c.workLevel, 4);
      this.set({ cycles: { ...c, phase: 'work', round: c.round + 1, nextAtSec: now + CYCLE.workMin * 60 } });
    }
    this.scheduleCycle();
  }

  private clearCycleTimer() {
    if (this.cycleTimer !== undefined) this.clock.clearTimeout(this.cycleTimer);
    this.cycleTimer = undefined;
  }

  private clearCycles() {
    this.clearCycleTimer();
    if (this.snap.cycles) this.set({ cycles: null });
  }

  /** Change the level without touching the remembered level (breaks drop to Quiet). */
  private applyLevel(level: LevelName, glide: number) {
    const l = this.ceiling(level);
    this.set({ level: l });
    if (this.engine && this.isActive()) this.engine.setVolume(LEVEL_VOLUME[l], glide);
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
    this.set({ layer, motion: layer.motionLocked ? 'hold' : opts.motion, binaural: opts.binaural, level, elapsedSec: 0, blind: null, driftOffset: 0 });
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
    const l0 = layer ?? this.snap.layer;
    const t0 = l0 ? store.get().prefs.timerByLayer[l0.id] : undefined;
    const before = typeof t0 === 'number' ? t0 : this.snap.timerMin;
    if (this.snap.phase === 'idle' || this.snap.phase === 'fadingOut') {
      const l = layer ?? this.snap.layer;
      if (!l) return;
      await this.start(l, { level: 'quiet', motion: this.snap.motion, timerMin: null, binaural: this.snap.binaural, keepLevel: true });
    } else this.applyLevel('quiet', 1.2);
    const endsAt = (this.player?.elapsedSec() ?? 0) + TAKE_FIVE_SEC;
    this.set({ takeFive: { endsAtSec: endsAt }, ended: null, level: 'quiet', breakAfterTimer: before });
    this.clearTakeFive();
    this.takeFiveTimer = this.clock.setTimeout(() => {
      this.takeFiveTimer = undefined;
      if (store.get().prefs.takeFiveChime) playChime(LEVEL_VOLUME[this.snap.level]);
      setTimeout(() => void this.stop(undefined, null, true), 1600);
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
    if (!l || !wanders(this.snap.motion) || l.journey || !this.engine) return;
    const stepSec = 60;
    let noiseDb = 0;
    const tick = () => {
      if (!this.engine || !this.isActive() || !wanders(this.snap.motion)) return;
      this.driftSeed = (this.driftSeed * 1664525 + 1013904223) % 4294967296;
      const r = this.driftSeed / 4294967296 - 0.5;
      // Steps small enough that a full ± range takes about one drift period.
      const step = (l.driftHz * 2 * stepSec) / (l.driftPeriodMin * 60);
      this.driftOffset = Math.max(-l.driftHz, Math.min(l.driftHz, this.driftOffset + r * 2 * step));
      this.engine.tones.rampTo({ beatHz: l.beatHz + this.driftOffset }, stepSec, 'linear');
      // The noise wanders too (brand §7): a slow walk within ±1 dB, on its own seed.
      this.driftSeed = (this.driftSeed * 1664525 + 1013904223) % 4294967296;
      const r2 = this.driftSeed / 4294967296 - 0.5;
      noiseDb = Math.max(-1, Math.min(1, noiseDb + r2 * (2 * stepSec) / (l.driftPeriodMin * 60) * 2));
      this.engine.wanderNoise(noiseDb, stepSec);
      this.set({ driftOffset: this.driftOffset });
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
    if (this.snap.cycles) {
      const left = this.snap.cycles.nextAtSec - s.elapsedSec;
      if (left > 3) this.clock.skip((left - 3) * 1000);
      this.set({ elapsedSec: this.player!.getState().elapsedSec });
      return true;
    }
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
    this.clearCycleTimer();
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

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
