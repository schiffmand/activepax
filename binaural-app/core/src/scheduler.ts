import { systemClock, wallNow, type Clock, type TimerHandle } from './clock';
import { Emitter } from './emitter';
import type { EngineStartParams, EngineStatus } from './audio/engine';
import {
  bandSecondsBetween,
  compileProgram,
  sampleProgram,
  type AutomationStep,
  type CompiledProgram,
  type Program,
} from './programs';
import { BANDS, bandFor, type Band, type NoiseSetting, type RampCurve, type ToneTarget } from './types';

/** The slice of BinauralEngine the player needs (lets tests or native bridges stand in). */
export interface EngineLike {
  start(params?: EngineStartParams): Promise<void>;
  stop(opts?: { fadeSec?: number }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  rampTo(target: Partial<ToneTarget>, durationSec?: number, curve?: RampCurve): void;
  setNoise(noise: Partial<NoiseSetting>, fadeSec?: number): void;
  getState(): { status: EngineStatus };
  /** Optional: OS interruption notifications (BinauralEngine provides them). */
  on?(event: 'interrupted' | 'interruptionEnded', fn: () => void): () => void;
}

/**
 * - starting: play() is waiting for the engine (e.g. ctx.resume()); stop() during it cancels the start
 * - paused: by the user, or by an OS interruption (see PlayerState.interrupted)
 */
export type PlayerStatus = 'idle' | 'starting' | 'playing' | 'paused' | 'ending' | 'ended';
export type EndReason = 'timer' | 'program' | 'user';

export interface PlayerState {
  status: PlayerStatus;
  programId: string | null;
  presetId: string | null;
  name: string | null;
  /** Listening time so far (pauses excluded), seconds. */
  elapsedSec: number;
  /** When the session will end on its own (timer or program), seconds; null = open-ended. */
  endsAtSec: number | null;
  remainingSec: number | null;
  timerSec: number | null;
  stepIndex: number;
  stepLabel: string | null;
  /** Where the sound is right now according to the schedule. */
  current: ToneTarget & { band: Band };
  /** Wall-clock ms since epoch. */
  startedAt: number | null;
  /** True while paused because the OS interrupted audio (call, Siri, alarm) rather than the user. */
  interrupted: boolean;
}

export interface SessionSummary {
  programId: string;
  presetId: string | null;
  name: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  band: Band;
  bandSeconds: Partial<Record<Band, number>>;
  completed: boolean;
  endedBy: EndReason;
}

export interface PlayerEvents extends Record<string, unknown> {
  state: PlayerState;
  step: { index: number; label: string | null };
  ended: SessionSummary;
}

export interface PlayOptions {
  /** Stop after this many seconds of listening, with a gentle fade. */
  timerSec?: number | null;
  /** Fade length at the end (defaults to the program's endFadeSec). */
  endFadeSec?: number;
  /** Override user volume for this session (normally leave to the user's setting). */
  volume?: number;
}

export interface PlayerOptions {
  clock?: Clock;
  /** Progress tick interval for UIs. */
  tickMs?: number;
  /** Called once per finished session (wire this to the store's history). */
  onSessionEnd?: (s: SessionSummary) => void;
  /**
   * Fade used when the end comes sooner than the configured end fade allows (e.g. a timer set below the
   * elapsed time). Capped by the configured end fade; never below ABSOLUTE_MIN_FADE_SEC. Never a hard cut.
   * Sensory mode should pass its longer fade here.
   */
  minEndFadeSec?: number;
  /**
   * When play() switches programs while sound is already audible, the engine glides to the new start
   * values; the first segment's ramp begins after this many seconds (never a jump).
   */
  switchGlideSec?: number;
}

/** Default minimum end fade, seconds (used when a timer lands at/below the elapsed time). */
export const MIN_END_FADE_SEC = 3;
/** No session end is ever shorter than this, even with endFadeSec: 0. */
export const ABSOLUTE_MIN_FADE_SEC = 0.5;

/** A usable timer: finite and > 0. Anything else means "no timer". */
function validTimer(t: number | null | undefined): number | null {
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null;
}

/**
 * ProgramPlayer — applies a compiled program to the engine in real time.
 *
 * It schedules one Web Audio ramp per segment (the audio thread does the smoothing),
 * wakes up only at segment boundaries / end-fade / UI ticks, and handles pause/resume
 * by re-deriving the exact schedule position (so long pauses never drift).
 */
export class ProgramPlayer {
  private readonly clock: Clock;
  private readonly tickMs: number;
  private readonly emitter = new Emitter<PlayerEvents>();
  private compiled: CompiledProgram | null = null;
  private program: Program | null = null;
  private status: PlayerStatus = 'idle';
  private timerSec: number | null = null;
  private endFadeSec = 20;
  private accumulatedMs = 0;
  private runningSince: number | null = null;
  private startedAt: number | null = null;
  private stepTimer: TimerHandle | undefined;
  private endTimer: TimerHandle | undefined;
  private tickTimer: TimerHandle | undefined;
  private stepIndex = -1;
  private endReason: EndReason = 'user';
  private session = 0;
  private interrupted = false;
  private readonly minEndFadeSec: number;
  private readonly switchGlideSec: number;
  private readonly unsubs: (() => void)[] = [];

  constructor(
    private readonly engine: EngineLike,
    private readonly options: PlayerOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.tickMs = options.tickMs !== undefined && Number.isFinite(options.tickMs) && options.tickMs > 0 ? options.tickMs : 1000;
    const minFade = options.minEndFadeSec;
    this.minEndFadeSec = minFade !== undefined && Number.isFinite(minFade) && minFade >= 0 ? minFade : MIN_END_FADE_SEC;
    const glide = options.switchGlideSec;
    this.switchGlideSec = glide !== undefined && Number.isFinite(glide) && glide >= 0 ? glide : 0.5;
    if (engine.on) {
      this.unsubs.push(engine.on('interrupted', () => this.onInterrupted()));
      this.unsubs.push(engine.on('interruptionEnded', () => this.onInterruptionEnded()));
    }
  }

  /** Detach from the engine and cancel timers (does not stop audio). */
  dispose(): void {
    this.clearTimers();
    for (const off of this.unsubs.splice(0)) off();
    this.emitter.clear();
  }

  subscribe(fn: (s: PlayerState) => void): () => void {
    return this.emitter.on('state', fn);
  }

  on<K extends keyof PlayerEvents>(event: K, fn: (p: PlayerEvents[K]) => void): () => void {
    return this.emitter.on(event, fn);
  }

  elapsedSec(): number {
    const running = this.runningSince !== null ? this.clock.now() - this.runningSince : 0;
    return (this.accumulatedMs + running) / 1000;
  }

  private endsAtSec(): number | null {
    const c = this.compiled;
    if (!c) return null;
    const candidates = [c.totalSec, this.timerSec].filter((v): v is number => v !== null && v !== undefined);
    return candidates.length ? Math.min(...candidates) : null;
  }

  getState(): PlayerState {
    const c = this.compiled;
    const elapsed = this.elapsedSec();
    const sample = c ? sampleProgram(c, elapsed) : null;
    const endsAt = this.endsAtSec();
    const current = sample
      ? { beatHz: sample.beatHz, carrierHz: sample.carrierHz, level: sample.level }
      : { beatHz: 0, carrierHz: 0, level: 0 };
    return {
      status: this.status,
      programId: this.program?.id ?? null,
      presetId: this.program?.presetId ?? null,
      name: this.program?.name ?? null,
      elapsedSec: elapsed,
      endsAtSec: endsAt,
      remainingSec: endsAt !== null ? Math.max(0, endsAt - elapsed) : null,
      timerSec: this.timerSec,
      stepIndex: sample?.stepIndex ?? -1,
      stepLabel: sample?.label ?? null,
      current: { ...current, band: bandFor(current.beatHz || 1) },
      startedAt: this.startedAt,
      interrupted: this.interrupted,
    };
  }

  private emitState(): void {
    this.emitter.emit('state', this.getState());
  }

  private clearTimers(): void {
    for (const t of [this.stepTimer, this.endTimer, this.tickTimer]) if (t !== undefined) this.clock.clearTimeout(t);
    this.stepTimer = this.endTimer = this.tickTimer = undefined;
  }

  /**
   * Start a program (or a preset via presetToProgram) from the beginning.
   * Rejects (status back to 'idle') if the engine can't start, e.g. AudioBlockedError outside a gesture.
   */
  async play(program: Program, opts: PlayOptions = {}): Promise<void> {
    if (this.status === 'playing' || this.status === 'paused' || this.status === 'ending') {
      this.finish('user', false);
    }
    const session = ++this.session;
    this.clearTimers();
    this.program = program;
    this.compiled = compileProgram(program);
    this.timerSec = validTimer(opts.timerSec);
    this.endFadeSec =
      opts.endFadeSec !== undefined && Number.isFinite(opts.endFadeSec) && opts.endFadeSec >= 0 ? opts.endFadeSec : this.compiled.endFadeSec;
    this.accumulatedMs = 0;
    this.runningSince = null;
    this.startedAt = null;
    this.stepIndex = -1;
    this.endReason = 'user';
    this.interrupted = false;

    const c = this.compiled;
    const params: EngineStartParams = {
      beatHz: c.start.beatHz,
      carrierHz: c.start.carrierHz,
      level: c.start.level,
      // No noise bed: switch noise off but keep the engine's remembered noise volume (NaN = "unchanged"),
      // so turning noise back on later isn't silently stuck at volume 0.
      noise: c.startNoise ?? { type: 'off', volume: NaN },
    };
    if (opts.volume !== undefined && Number.isFinite(opts.volume)) params.volume = opts.volume;
    // Snapping straight to schedule values is only click-free while the engine is silent.
    const engineStatus = this.engine.getState().status;
    const silent = engineStatus === 'idle' || engineStatus === 'paused' || engineStatus === 'interrupted';
    this.status = 'starting';
    this.emitState();
    try {
      await this.engine.start(params);
    } catch (err) {
      if (session === this.session) {
        this.status = 'idle';
        this.emitState();
      }
      throw err;
    }
    if (session !== this.session) return; // superseded (stop() or another play()) while awaiting
    this.startedAt = wallNow(this.clock);
    this.runningSince = this.clock.now();
    this.status = 'playing';
    this.schedule(silent);
    this.emitState();
  }

  async pause(): Promise<void> {
    if (this.status === 'paused' && this.interrupted) {
      // Interrupted, and now the user explicitly pauses: don't auto-resume when the OS gives audio back.
      this.interrupted = false;
      this.emitState();
      await this.engine.pause();
      return;
    }
    if (this.status !== 'playing') return;
    this.accumulatedMs += this.clock.now() - (this.runningSince ?? this.clock.now());
    this.runningSince = null;
    this.clearTimers();
    this.status = 'paused';
    this.emitState();
    await this.engine.pause();
  }

  /** Resume after a pause or an interruption. Rejects (stays paused) if the platform blocks audio. */
  async resume(): Promise<void> {
    if (this.status !== 'paused') return;
    const session = this.session;
    await this.engine.resume();
    if (session !== this.session || this.status !== 'paused') return;
    this.interrupted = false;
    this.runningSince = this.clock.now();
    this.status = 'playing';
    this.schedule(true);
    this.emitState();
  }

  /** User stop: fade out now. Records the session as not completed (unless already ending). */
  async stop(fadeSec?: number): Promise<void> {
    if (this.status === 'idle' || this.status === 'ended') return;
    const fadeOpts = fadeSec !== undefined && Number.isFinite(fadeSec) ? { fadeSec: Math.max(0, fadeSec) } : {};
    if (this.status === 'starting') {
      // play() is still awaiting the engine: cancel it (play() bails at its session check).
      this.session++;
      this.clearTimers();
      this.status = 'idle';
      this.emitState();
      await this.engine.stop(fadeOpts);
      return;
    }
    const wasEnding = this.status === 'ending';
    this.finish(wasEnding ? this.endReason : 'user', wasEnding);
    await this.engine.stop(fadeOpts);
  }

  /**
   * Set or clear the sleep/session timer mid-session (seconds of listening from session start).
   * Non-finite or ≤ 0 values are ignored. A value at or below the elapsed time ends the session now,
   * with the minimum gentle fade.
   */
  setTimer(timerSec: number | null): void {
    if (timerSec !== null && validTimer(timerSec) === null) return;
    if (this.status === 'ending' || this.status === 'ended') return;
    this.timerSec = timerSec;
    if (this.status === 'playing') {
      if (this.endTimer !== undefined) this.clock.clearTimeout(this.endTimer);
      this.endTimer = undefined;
      this.scheduleEnd();
    }
    this.emitState();
  }

  // ───────────────────────────── interruptions ─────────────────────────────

  private onInterrupted(): void {
    if (this.status !== 'playing') return;
    // Audio isn't being heard: stop the clock so timers, steps and history only count real listening.
    this.accumulatedMs += this.clock.now() - (this.runningSince ?? this.clock.now());
    this.runningSince = null;
    this.clearTimers();
    this.status = 'paused';
    this.interrupted = true;
    this.emitState();
  }

  private onInterruptionEnded(): void {
    if (this.status !== 'paused' || !this.interrupted) return;
    this.interrupted = false;
    this.runningSince = this.clock.now();
    this.status = 'playing';
    this.schedule(true); // the engine restarted its fade from silence, so snapping is click-free
    this.emitState();
  }

  // ───────────────────────────── internals ─────────────────────────────

  private currentStep(elapsed: number): AutomationStep | undefined {
    return this.compiled?.steps.find((s) => elapsed >= s.atSec && elapsed < s.atSec + s.durationSec);
  }

  /** (Re)derive engine automation from the current elapsed time. */
  private schedule(snap: boolean): void {
    const c = this.compiled;
    if (!c) return;
    const elapsed = this.elapsedSec();

    if (snap) {
      // While the fade gain is (near) silent we can jump straight to the exact schedule value.
      const s = sampleProgram(c, elapsed);
      this.engine.rampTo({ beatHz: s.beatHz, carrierHz: s.carrierHz, level: s.level }, 0, 'step');
      this.scheduleStep(elapsed, true);
    } else {
      // Audible switch: let engine.start()'s glide to the start values finish, then begin the
      // first ramp from wherever the sound actually is (rampTo cancels-and-holds — never a jump).
      if (this.stepTimer !== undefined) this.clock.clearTimeout(this.stepTimer);
      this.stepTimer = this.clock.setTimeout(() => {
        this.stepTimer = undefined;
        if (this.status !== 'playing') return;
        this.scheduleStep(this.elapsedSec(), true);
      }, this.switchGlideSec * 1000);
    }
    this.scheduleEnd();
    this.scheduleTick();
  }

  private scheduleStep(elapsed: number, forceNoise: boolean): void {
    if (this.stepTimer !== undefined) this.clock.clearTimeout(this.stepTimer);
    this.stepTimer = undefined;
    // Zero-length segments (only possible in unvalidated programs) can never be "current":
    // apply every one crossed since the last boundary as an instant change.
    for (const z of this.compiled?.steps ?? []) {
      if (z.durationSec > 0 || z.index <= this.stepIndex || z.atSec > elapsed) continue;
      if (z.noise) this.engine.setNoise(z.noise);
      this.engine.rampTo(z.to, 0, 'step');
      this.stepIndex = z.index;
      this.emitter.emit('step', { index: z.index, label: z.label ?? null });
    }
    const step = this.currentStep(elapsed);
    if (!step) {
      // Past the timed part: hold (values already at the last target).
      return;
    }
    if (step.index !== this.stepIndex || forceNoise) {
      if (step.noise && (step.index !== this.stepIndex || forceNoise)) this.engine.setNoise(step.noise);
      if (step.index !== this.stepIndex) {
        this.stepIndex = step.index;
        this.emitter.emit('step', { index: step.index, label: step.label ?? null });
      }
    }
    const remaining = step.atSec + step.durationSec - elapsed;
    this.engine.rampTo(step.to, remaining, step.curve);
    this.stepTimer = this.clock.setTimeout(() => {
      this.stepTimer = undefined;
      if (this.status !== 'playing') return;
      // Use the boundary time exactly, not the (possibly late) wall time.
      this.scheduleStep(Math.max(this.elapsedSec(), step.atSec + step.durationSec), false);
      this.emitState();
    }, remaining * 1000);
  }

  private scheduleEnd(): void {
    const endsAt = this.endsAtSec();
    if (endsAt === null || this.status !== 'playing') return;
    const elapsed = this.elapsedSec();
    const fade = Math.max(0, Math.min(this.endFadeSec, endsAt));
    const fadeStart = Math.max(elapsed, endsAt - fade);
    const reason: EndReason = this.timerSec !== null && this.timerSec <= (this.compiled?.totalSec ?? Infinity) ? 'timer' : 'program';
    this.endTimer = this.clock.setTimeout(() => {
      this.endTimer = undefined;
      if (this.status !== 'playing') return;
      this.beginEnding(endsAt - this.elapsedSec(), reason);
    }, Math.max(0, fadeStart - elapsed) * 1000);
  }

  private scheduleTick(): void {
    if (this.tickTimer !== undefined) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = this.clock.setTimeout(() => {
      this.tickTimer = undefined;
      if (this.status !== 'playing' && this.status !== 'ending') return;
      this.emitState();
      this.scheduleTick();
    }, this.tickMs);
  }

  private beginEnding(fadeSec: number, reason: EndReason): void {
    // Never a hard cut: even a timer set below the elapsed time ends with a gentle fade
    // (the shorter of minEndFadeSec and the configured end fade, but never under ABSOLUTE_MIN_FADE_SEC).
    const floor = Math.max(ABSOLUTE_MIN_FADE_SEC, Math.min(this.minEndFadeSec, this.endFadeSec));
    const fade = Math.max(floor, Number.isFinite(fadeSec) ? fadeSec : 0);
    this.status = 'ending';
    this.endReason = reason;
    const session = this.session;
    this.emitState();
    const done = () => {
      if (session === this.session && this.status === 'ending') this.finish(reason, true);
    };
    this.engine.stop({ fadeSec: fade }).then(done, (err: unknown) => {
      if (typeof console !== 'undefined') console.error('[binaural-core] engine.stop failed', err);
      done();
    });
  }

  private finish(reason: EndReason, completed: boolean): SessionSummary | null {
    const c = this.compiled;
    const p = this.program;
    if (!c || !p || this.startedAt === null) {
      this.status = 'idle';
      return null;
    }
    const durationSec = this.elapsedSec();
    this.clearTimers();
    if (this.runningSince !== null) {
      this.accumulatedMs += this.clock.now() - this.runningSince;
      this.runningSince = null;
    }
    const bandSeconds = bandSecondsBetween(c, 0, durationSec);
    let band: Band = bandFor(c.start.beatHz);
    let best = -1;
    for (const b of BANDS) {
      const v = bandSeconds[b] ?? 0;
      if (v > best) {
        best = v;
        band = b;
      }
    }
    const summary: SessionSummary = {
      programId: p.id,
      presetId: p.presetId ?? null,
      name: p.name,
      startedAt: this.startedAt,
      endedAt: wallNow(this.clock),
      durationSec: Math.round(durationSec * 1000) / 1000,
      band,
      bandSeconds,
      completed,
      endedBy: reason,
    };
    this.status = 'ended';
    this.session++;
    this.emitState();
    this.emitter.emit('ended', summary);
    this.options.onSessionEnd?.(summary);
    return summary;
  }
}
