/**
 * Arrival mapping and the copy bank (docs/brand.md §6). Warm is the default; Plain is what Plain labels and
 * Sensory mode show. The arrival mapping only ever says what will play, never why.
 */
import { builtInLayer, hz, journeyOf, type Layer, type LevelName } from './layers';

export type Labels = 'warm' | 'plain';
export type ChipId = 'scattered' | 'wound-up' | 'too-much' | 'heavy-eyed' | 'just-working';

export const CHIPS: { id: ChipId; label: string }[] = [
  { id: 'scattered', label: 'Scattered' },
  { id: 'wound-up', label: 'Wound up' },
  { id: 'too-much', label: 'Too much' },
  { id: 'heavy-eyed', label: 'Heavy-eyed' },
  { id: 'just-working', label: 'Just working' },
];

export interface Arrival {
  layer: Layer;
  line: string;
  /** Overrides applied on top of the layer (Just working: Hold, at Quiet). */
  motion?: 'hold';
  level?: LevelName;
}

/** Pure: which layer a chip plays, and the one literal line under it. */
export function arrivalFor(chip: ChipId, hour: number, tooMuchLayer: Layer | undefined, labels: Labels): Arrival {
  const plain = labels === 'plain';
  switch (chip) {
    case 'scattered':
      return { layer: builtInLayer('focus')!, line: plain ? 'Focus: 14 Hz beat, brown noise.' : 'That’s Focus: a 14 Hz beat over soft brown noise.' };
    case 'wound-up':
      return { layer: builtInLayer('calm')!, line: plain ? 'Calm: 10 Hz beat, pink noise.' : 'That’s Calm: a 10 Hz beat over soft pink noise.' };
    case 'too-much':
      if (tooMuchLayer)
        return {
          layer: tooMuchLayer,
          line: plain ? `Your layer "${tooMuchLayer.name}", as saved.` : `That’s your layer “${tooMuchLayer.name}”, exactly as you saved it.`,
        };
      return {
        layer: builtInLayer('steady')!,
        line: plain
          ? 'Steady: 10 Hz beat, brown noise. No variation. Fades in over 15 seconds.'
          : 'That’s Steady: a 10 Hz beat over brown noise. It stays the same and fades in over 15 seconds.',
      };
    case 'heavy-eyed':
      if (hour >= 18 || hour < 5)
        return {
          layer: builtInLayer('sleep')!,
          line: plain
            ? 'Evening descent: 8 Hz to 2 Hz over 30 min, then 15 min low, then silence.'
            : 'That’s Evening descent: 8 Hz easing to 2 Hz over 30 minutes, then 15 quiet minutes and silence.',
        };
      return { layer: builtInLayer('unwind')!, line: plain ? 'Unwind: 6 Hz beat, pink noise.' : 'That’s Unwind: a 6 Hz beat over soft pink noise.' };
    case 'just-working':
      return {
        layer: builtInLayer('focus')!,
        line: plain ? 'Focus: Hold, level Quiet.' : 'That’s Focus, held still and quieter.',
        motion: 'hold',
        level: 'quiet',
      };
  }
}

export function firstPickLine(chip: ChipId, labels: Labels): string {
  const name = CHIPS.find((c) => c.id === chip)!.label;
  return labels === 'plain' ? `This is the layer for ${name}. It isn’t a treatment.` : `This is what we play when you pick ${name}. It isn’t a treatment.`;
}

/** Morning, Afternoon, Evening, or nothing between midnight and 04:00 (no greeting line at all then). */
export function greetingFor(hour: number): string | null {
  if (hour >= 4 && hour < 12) return 'Morning.';
  if (hour >= 12 && hour < 18) return 'Afternoon.';
  if (hour >= 18) return 'Evening.';
  return null;
}

export function minutes(sec: number): number {
  return Math.max(0, Math.floor(sec / 60));
}

/** Elapsed time that never rounds up: "under a minute", "1 min", "52 min", "1 h 5 min". */
export function elapsedWords(sec: number): string {
  if (sec < 60) return 'under a minute';
  const m = minutes(sec);
  const nb = '\u00A0';
  if (m < 60) return `${m}${nb}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}${nb}h${nb}${r}${nb}min` : `${h}${nb}h`;
}

/** Totals use the same rule as a single session (round 4, N4): whole minutes, rounded down. */
export function durationWords(sec: number): string {
  const m = minutes(sec);
  const nb = '\u00A0';
  if (m < 60) return `${m}${nb}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}${nb}h${nb}${r}${nb}min` : `${h}${nb}h`;
}

export const copy = {
  statusPlaying: (l: Labels) => (l === 'plain' ? 'Sound on.' : 'Tucked in.'),
  statusFadingIn: (l: Labels, fadeSec: number) => (l === 'plain' ? `Starting. Fading in over ${fadeSec} seconds.` : 'Tucking in…'),
  statusFadingOut: (l: Labels, fadeSec: number) => (l === 'plain' ? `Stopping. Fading out over ${fadeSec} seconds.` : `Setting it down over ${fadeSec} seconds.`),
  /** The elapsed half of the detail line. Under a minute it never shows "0 min". */
  elapsed: (l: Labels, elapsedSec: number) =>
    elapsedSec < 60 ? (l === 'plain' ? 'Playing for under a minute' : 'Just started') : `${l === 'plain' ? 'Playing for' : 'With you for'} ${elapsedWords(elapsedSec)}`,
  detail: (l: Labels, elapsedSec: number, fadesAtMin: number | null) =>
    `${copy.elapsed(l, elapsedSec)} · ${fadesAtMin === null ? 'No timer' : `Fades out at ${fadesAtMin} min`}`,
  sessionEnd: (l: Labels, elapsedSec: number, fadeSec: number) =>
    `${l === 'plain' ? 'Stopped' : 'Set down'} after ${elapsedWords(elapsedSec)}. Faded out over ${fadeSec} seconds.`,
  releaseHint: (l: Labels) => (l === 'plain' ? 'Let go to stop.' : 'Let go to set it down.'),
  takeFive: (l: Labels) =>
    l === 'plain' ? 'Break, 5 min. Level Quiet. One chime at the end.' : 'Five minutes off. The layer drops to Quiet and one soft chime marks the end.',
  /** The status line during Take 5 and during a Cycles break. */
  statusBreak: (l: Labels, min = 5) => (l === 'plain' ? `Break, ${min} min.` : min === 5 ? 'Five minutes off.' : `${min} minutes off.`),
  /** The felt during Take 5: where the break goes, no countdown. */
  takeFiveFelt: (l: Labels) => (l === 'plain' ? 'Break, 5 min' : '5 min at Quiet'),
  /** Round 3 (Leo): "Back in 5 min … then it fades out" read as a contradiction. Say what happens, in order. */
  takeFiveSub: (l: Labels, chime: boolean) =>
    l === 'plain'
      ? `Level Quiet.${chime ? ' One chime,' : ''} then it fades out and offers another round.`
      : `${chime ? 'A soft chime, then it fades' : 'Then it fades'} and asks if you want another round.`,
  vary: (l: Labels) => (l === 'plain' ? 'Vary: applies from your next session. A different noise each time.' : 'Vary: from your next session, a different noise bed each time.'),
  homeSame: (l: Labels) => (l === 'plain' ? 'Last layer:' : 'Same as last time?'),
  homeFirst: (l: Labels) => (l === 'plain' ? 'Pick a layer.' : 'How are you arriving?'),
  returning: (l: Labels) => (l === 'plain' ? 'Your last layer is ready.' : 'Hello again. Your layer’s where you left it.'),
  weekly: (l: Labels, total: string, sessions: number) =>
    l === 'plain'
      ? `Total this week: ${total}, ${sessions} session${sessions === 1 ? '' : 's'}.`
      : `Tuck kept you company for ${total} this week, across ${sessions} session${sessions === 1 ? '' : 's'}.`,
};

/** The line under the arrival chips, for whatever will actually play (beat or noise only). */
export function playsLine(l0: Layer, binaural: boolean, labels: Labels): string {
  const l = { ...l0, name: l0.name.replace(/, noise only$/, '') };
  const noise = l.noise.type === 'off' ? 'no noise' : `${labels === 'plain' ? '' : 'soft '}${l.noise.type} noise`;
  if (!binaural) return labels === 'plain' ? `${l.name}, noise only: ${l.noise.type} noise, no beat.` : `That’s ${l.name}, as noise only: ${noise}, no beat.`;
  const j = journeyOf(l);
  if (j) return labels === 'plain' ? j.plain : j.warm;
  return labels === 'plain' ? `${l.name}: ${hz(l.beatHz)} Hz beat, ${noise}.` : `That’s ${l.name}: a ${hz(l.beatHz)} Hz beat over ${noise}.`;
}

/** Which chip a layer belongs to (so "Arriving differently?" never shows a line with no chip selected). */
export function chipForLayer(id: string): ChipId | null {
  const base = id.replace(/~noise$/, '');
  if (base === 'focus') return 'scattered';
  if (base === 'calm') return 'wound-up';
  if (base === 'steady') return 'too-much';
  if (base === 'sleep' || base === 'unwind') return 'heavy-eyed';
  return null;
}

export function readoutText(l: Layer): string {
  if (!l.binaural) return `Noise only · ${l.noise.type} ${Math.round(l.noise.volume * 100)}%`;
  return `${hz(l.beatHz)} Hz`;
}

/** Only when a session was actually playing: it faded out because the headphones went (Home notice and the sheet). */
export const HP_DISCONNECTED_MID = 'Headphones disconnected, so Tuck faded out. Start plays noise only until they’re back.';
