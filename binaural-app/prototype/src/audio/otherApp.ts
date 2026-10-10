/**
 * The demo's stand-in for "your audio": another app playing above Tuck. On a phone this would be Spotify, a
 * podcast or a lecture; Tuck never sees its name. Here it is a generated piece of soft music (or the browser's
 * speech voice reading a short passage) so you can hear the layer sitting underneath.
 */
import { getContext, ensureRunning } from './hub';

export type OtherKind = 'music' | 'spoken';

interface OtherState {
  playing: boolean;
  kind: OtherKind;
  volume: number;
}

const SPOKEN =
  'This is a stand-in for your podcast or lecture. Tuck does not know what is playing here, only that something is. ' +
  'Notice how the soft layer sits underneath the voice. Use Level in Tuck to set how far under it sits. ' +
  'Your own app keeps its volume and its controls. ';

// Cmaj9, Am9, Fmaj9, G6/9: slow, warm, unobtrusive.
const CHORDS = [
  [130.81, 196.0, 246.94, 293.66, 329.63],
  [110.0, 164.81, 196.0, 246.94, 261.63],
  [87.31, 130.81, 164.81, 196.0, 220.0],
  [98.0, 146.83, 196.0, 220.0, 246.94],
];
const MELODY = [659.25, 587.33, 523.25, 493.88, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 440.0];

class OtherApp {
  private state: OtherState = { playing: false, kind: 'music', volume: 0.7 };
  private listeners = new Set<() => void>();
  private out: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextAt = 0;
  private bar = 0;
  private utter: SpeechSynthesisUtterance | null = null;

  get = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(p: Partial<OtherState>) {
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }

  canSpeak() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  async play(kind: OtherKind = this.state.kind) {
    if (this.state.playing) this.pause();
    await ensureRunning();
    this.set({ playing: true, kind });
    if (kind === 'spoken' && this.canSpeak()) return this.speak();
    const c = getContext();
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1800;
    this.out = c.createGain();
    this.out.gain.value = 0;
    this.out.gain.setTargetAtTime(this.gainFor(this.state.volume), c.currentTime, 0.6);
    // Straight to the speakers: the other app is not routed through Tuck.
    this.filter.connect(this.out).connect(c.destination);
    this.nextAt = c.currentTime + 0.1;
    this.bar = 0;
    const tick = () => {
      while (this.nextAt < c.currentTime + 1.2) {
        this.scheduleBar(this.nextAt, this.bar++);
        this.nextAt += 4;
      }
    };
    tick();
    this.timer = setInterval(tick, 400);
  }

  private gainFor(v: number) {
    return 0.55 * v * v;
  }

  private scheduleBar(t: number, i: number) {
    const c = getContext();
    const chord = CHORDS[i % CHORDS.length]!;
    for (const f of chord) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 1.2);
      g.gain.setTargetAtTime(0, t + 3.4, 0.5);
      o.connect(g).connect(this.filter!);
      o.start(t);
      o.stop(t + 6);
    }
    for (let k = 0; k < 3; k++) {
      const f = MELODY[(i * 3 + k) % MELODY.length]!;
      const nt = t + 0.4 + k * 1.2;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0, nt);
      g.gain.linearRampToValueAtTime(0.09, nt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, nt + 1.6);
      o.connect(g).connect(this.filter!);
      o.start(nt);
      o.stop(nt + 1.7);
    }
  }

  private speak() {
    const synth = window.speechSynthesis;
    const say = () => {
      if (!this.state.playing || this.state.kind !== 'spoken') return;
      const u = new SpeechSynthesisUtterance(SPOKEN);
      u.rate = 0.95;
      u.volume = this.state.volume;
      u.onend = () => setTimeout(say, 600);
      this.utter = u;
      synth.speak(u);
    };
    say();
  }

  pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const out = this.out;
    const filter = this.filter;
    if (out) {
      const c = getContext();
      out.gain.setTargetAtTime(0, c.currentTime, 0.25);
      setTimeout(() => {
        out.disconnect();
        filter?.disconnect();
      }, 1500);
    }
    this.out = null;
    this.filter = null;
    if (this.utter && this.canSpeak()) {
      this.utter.onend = null;
      window.speechSynthesis.cancel();
      this.utter = null;
    }
    this.set({ playing: false });
  }

  toggle() {
    if (this.state.playing) this.pause();
    else void this.play();
  }

  setVolume(v: number) {
    this.set({ volume: v });
    if (this.out) this.out.gain.setTargetAtTime(this.gainFor(v), getContext().currentTime, 0.15);
  }

  setKind(kind: OtherKind) {
    if (this.state.playing) void this.play(kind);
    else this.set({ kind });
  }
}

export const otherApp = new OtherApp();
