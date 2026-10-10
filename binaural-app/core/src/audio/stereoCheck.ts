import { systemClock, type Clock } from '../clock';
import { AudioBlockedError, RESUME_TIMEOUT_MS } from './engine';
import { rampParam, setParam, type AudioContextLike, type GainNodeLike, type OscillatorNodeLike } from './webaudio';

export type Ear = 'left' | 'right';

export interface StereoCheckStep {
  ear: Ear;
  /** Seconds from the start of the check. */
  startSec: number;
  endSec: number;
  frequencyHz: number;
}

export interface StereoCheckOptions {
  /** Ears to test in order. Default left then right. */
  sequence?: Ear[];
  toneSec?: number;
  gapSec?: number;
  /** Lead-in silence before the first tone. */
  leadInSec?: number;
  /** A soft, mid-range tone that's easy to localise. */
  frequencyHz?: number;
  /** Perceptual volume 0..1. */
  volume?: number;
  /** Fade on each tone edge, seconds (no clicks — important for sensory-sensitive users). */
  edgeSec?: number;
}

const DEFAULTS: Required<StereoCheckOptions> = {
  sequence: ['left', 'right'],
  toneSec: 1.2,
  gapSec: 0.5,
  leadInSec: 0.2,
  frequencyHz: 440,
  volume: 0.35,
  edgeSec: 0.08,
};

/** Pure: compute the timeline of a stereo check. */
export function planStereoCheck(options: StereoCheckOptions = {}): { steps: StereoCheckStep[]; totalSec: number } {
  const o = { ...DEFAULTS, ...options };
  const steps: StereoCheckStep[] = [];
  let t = o.leadInSec;
  for (const ear of o.sequence) {
    steps.push({ ear, startSec: t, endSec: t + o.toneSec, frequencyHz: o.frequencyHz });
    t += o.toneSec + o.gapSec;
  }
  return { steps, totalSec: t };
}

export interface StereoCheckHandle {
  steps: StereoCheckStep[];
  totalSec: number;
  /** Resolves when the sequence has finished (or was cancelled). */
  done: Promise<{ cancelled: boolean }>;
  cancel(): void;
}

/**
 * Play a left-only tone then a right-only tone (by default) so the user can confirm
 * stereo headphones are connected and the right way round. `onStep` fires as each ear's tone begins.
 *
 * Uses a ChannelMerger with per-ear gains (not a StereoPanner) so the routing exactly matches
 * how the binaural engine hard-pans its oscillators.
 *
 * Async because the context must actually be running first: after the engine pauses (suspendOnPause)
 * or stops, the context is 'suspended', and the wall-clock onStep callbacks would otherwise fire over
 * silence (the user answers "none" and gets a false 'one-ear' verdict). Call it from a tap.
 * Rejects with AudioBlockedError if the context can't be started.
 */
export async function runStereoCheck(
  ctx: AudioContextLike,
  options: StereoCheckOptions & { clock?: Clock; onStep?: (step: StereoCheckStep, index: number) => void } = {},
): Promise<StereoCheckHandle> {
  const o = { ...DEFAULTS, ...options };
  const clock = options.clock ?? systemClock;
  const plan = planStereoCheck(o);
  if (ctx.state !== 'running') {
    // Like the engine: resume() may stay pending forever when blocked, or reject; trust only the state.
    let timer: unknown;
    await Promise.race([
      Promise.resolve()
        .then(() => ctx.resume())
        .catch(() => undefined),
      new Promise<void>((r) => {
        timer = clock.setTimeout(r, RESUME_TIMEOUT_MS);
      }),
    ]);
    if (timer !== undefined) clock.clearTimeout(timer);
    if (ctx.state !== 'running') throw new AudioBlockedError(ctx.state);
  }
  const t0 = ctx.currentTime;

  const osc: OscillatorNodeLike = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(o.frequencyHz, t0);
  const left: GainNodeLike = ctx.createGain();
  const right: GainNodeLike = ctx.createGain();
  left.gain.setValueAtTime(0, t0);
  right.gain.setValueAtTime(0, t0);
  const merger = ctx.createChannelMerger(2);
  osc.connect(left);
  osc.connect(right);
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  const out = ctx.createGain();
  setParam(out.gain, o.volume * o.volume * 0.5, t0);
  merger.connect(out);
  out.connect(ctx.destination);

  for (const step of plan.steps) {
    const g = step.ear === 'left' ? left.gain : right.gain;
    g.setValueAtTime(0, t0 + step.startSec);
    g.linearRampToValueAtTime(1, t0 + step.startSec + o.edgeSec);
    g.setValueAtTime(1, t0 + step.endSec - o.edgeSec);
    g.linearRampToValueAtTime(0, t0 + step.endSec);
  }
  osc.start(t0);
  osc.stop(t0 + plan.totalSec + 0.05);

  const timers: unknown[] = [];
  let finished = false;
  let resolveDone!: (v: { cancelled: boolean }) => void;
  const done = new Promise<{ cancelled: boolean }>((r) => (resolveDone = r));

  const cleanup = (cancelled: boolean) => {
    if (finished) return;
    finished = true;
    for (const h of timers) clock.clearTimeout(h);
    for (const n of [osc, left, right, merger, out]) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    resolveDone({ cancelled });
  };

  plan.steps.forEach((step, i) => {
    timers.push(clock.setTimeout(() => options.onStep?.(step, i), step.startSec * 1000));
  });
  timers.push(clock.setTimeout(() => cleanup(false), plan.totalSec * 1000 + 60));

  return {
    steps: plan.steps,
    totalSec: plan.totalSec,
    done,
    cancel() {
      if (finished) return;
      const t = ctx.currentTime;
      rampParam(out.gain, 0, t, 0.05, 'linear');
      try {
        osc.stop(t + 0.06);
      } catch {
        /* ignore */
      }
      cleanup(true);
    },
  };
}

export type StereoVerdict = 'ok' | 'swapped' | 'mono' | 'one-ear' | 'unsure';

export interface StereoCheckAnswer {
  /** Which ear the tone was actually played in. */
  played: Ear;
  /** What the user reported hearing. */
  heard: Ear | 'both' | 'none' | 'unsure';
}

export interface StereoCheckResult {
  verdict: StereoVerdict;
  /** Short, calm, non-technical guidance for the UI. */
  message: string;
  /** Concrete things to try, in order. */
  tips: string[];
}

/** Pure: interpret what the user heard into a verdict and friendly guidance. */
export function interpretStereoCheck(answers: StereoCheckAnswer[]): StereoCheckResult {
  if (answers.length === 0 || answers.some((a) => a.heard === 'unsure')) {
    return {
      verdict: 'unsure',
      message: "No problem — let's try that once more.",
      tips: ['Put both earbuds/headphones in.', 'Turn the volume up a little, then replay the check.'],
    };
  }
  const correct = answers.every((a) => a.heard === a.played);
  if (correct) {
    return { verdict: 'ok', message: "You're set. Each ear hears its own tone — that's what makes the beat.", tips: [] };
  }
  if (answers.every((a) => a.heard === 'both')) {
    return {
      verdict: 'mono',
      message: 'Both tones sounded the same in each ear, so the beat won’t form.',
      tips: [
        'Turn off Mono Audio (iOS: Settings › Accessibility › Audio/Visual; Android: Accessibility › Audio).',
        'Turn off Spatial Audio / head tracking for these headphones.',
        'Use stereo headphones — a single earbud or a speaker won’t work.',
      ],
    };
  }
  if (answers.every((a) => a.heard !== 'none' && a.heard !== 'both' && a.heard !== a.played)) {
    return {
      verdict: 'swapped',
      message: 'Left and right seem swapped. That’s fine for binaural beats — they work either way.',
      tips: ['If you like, swap the earbuds round.'],
    };
  }
  if (answers.some((a) => a.heard === 'none')) {
    return {
      verdict: 'one-ear',
      message: 'One side was silent.',
      tips: ['Check both earbuds are connected and charged.', 'Check the balance slider is centred (Accessibility › Audio).'],
    };
  }
  return {
    verdict: 'unsure',
    message: "Hmm, that didn't quite line up. Let's try once more.",
    tips: ['Replay the check and listen for which side the tone comes from.'],
  };
}
