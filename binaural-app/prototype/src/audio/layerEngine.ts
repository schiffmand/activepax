import { BinauralEngine, type EngineLike, type EngineStartParams, type NoiseSetting, type RampCurve, type ToneTarget } from '@core';
import { NoiseBed, routedContext } from './hub';

/**
 * The prototype's engine: core's BinauralEngine renders the two tones (its own noise path is left off), and a
 * NoiseBed renders the noise. Both sit behind one EngineLike so core's ProgramPlayer drives them unchanged.
 * Splitting them is what lets the beat fade away and come back (noise only, Bluetooth call mode) without
 * touching the noise.
 */
export class LayerEngine implements EngineLike {
  readonly tones: BinauralEngine;
  private readonly bed = new NoiseBed();
  private volume = 0.28;
  private binaural = true;
  private disposed = false;

  constructor(private readonly opts: { fadeInSec: number; fadeOutSec: number; glideSec: number; binaural: boolean }) {
    this.binaural = opts.binaural;
    this.bed.setBinaural(opts.binaural, 0);
    this.tones = new BinauralEngine({
      context: routedContext(),
      fadeInSec: opts.fadeInSec,
      fadeOutSec: opts.fadeOutSec,
      glideSec: opts.glideSec,
      pauseFadeSec: 1.5,
      suspendOnPause: false,
      // Fades run in dB (core rampFade), so an 8 to 60 s fade sounds even from start to end.
      fadeCurve: 'perceptual',
    });
  }

  getState() {
    return this.tones.getState();
  }

  on(event: 'interrupted' | 'interruptionEnded', fn: () => void) {
    return this.tones.on(event, fn);
  }

  async start(params: EngineStartParams = {}): Promise<void> {
    if (params.volume !== undefined && Number.isFinite(params.volume)) this.volume = params.volume;
    const wasSilent = this.tones.getState().status === 'idle';
    await this.tones.start({ ...params, volume: this.binaural ? this.volume : 0, noise: { type: 'off', volume: NaN } });
    const glide = wasSilent ? 0 : this.opts.glideSec;
    if (params.noise) this.bed.setNoise(params.noise, wasSilent ? 0.05 : glide);
    if (params.level !== undefined) this.bed.setLevel(params.level, glide);
    this.bed.setVolume(this.volume, glide);
    this.bed.fadeTo(1, this.opts.fadeInSec);
  }

  async stop(opts: { fadeSec?: number } = {}): Promise<void> {
    const fade = opts.fadeSec ?? this.opts.fadeOutSec;
    this.bed.fadeTo(0, fade);
    await this.tones.stop({ fadeSec: fade });
  }

  async pause(): Promise<void> {
    this.bed.fadeTo(0, 1.5);
    await this.tones.pause();
  }

  async resume(): Promise<void> {
    await this.tones.resume();
    this.bed.fadeTo(1, this.opts.fadeInSec);
  }

  rampTo(target: Partial<ToneTarget>, durationSec?: number, curve?: RampCurve): void {
    this.tones.rampTo(target, durationSec, curve);
    if (target.level !== undefined && Number.isFinite(target.level)) this.bed.setLevel(target.level, curve === 'step' ? 0.03 : durationSec ?? 0.4);
  }

  setNoise(noise: Partial<NoiseSetting>, fadeSec = 1.5): void {
    if (noise.type === undefined) return;
    this.bed.setNoise({ type: noise.type, volume: noise.volume ?? 0.25 }, fadeSec);
  }

  /** Level (Quiet / Medium / Full) moves both the beat and the noise. */
  setVolume(v: number, glideSec: number) {
    this.volume = v;
    this.tones.setVolume(this.binaural ? v : 0, glideSec);
    this.bed.setVolume(v, glideSec);
  }

  /** Drift's slow noise wander (±1 dB). */
  wanderNoise(db: number, sec: number) {
    this.bed.wanderTo(db, sec);
  }

  /** Beat on or off (noise only), with a glide. */
  setBinaural(on: boolean, glideSec: number) {
    this.binaural = on;
    this.tones.setVolume(on ? this.volume : 0, glideSec);
    this.bed.setBinaural(on, glideSec);
  }

  dispose(afterSec = 0) {
    if (this.disposed) return;
    this.disposed = true;
    this.bed.dispose(afterSec);
    setTimeout(() => void this.tones.dispose(), afterSec * 1000 + 60);
  }
}
