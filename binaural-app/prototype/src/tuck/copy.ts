/**
 * Arrival mapping and the copy bank (docs/brand.md §6). Warm is the default; Plain is what Plain labels and
 * Sensory mode show. The arrival mapping only ever says what will play, never why.
 */
import { builtInLayer, hz, type Layer, type LevelName } from './layers';

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

export function greetingFor(hour: number): string {
  if (hour < 12 && hour >= 4) return 'Morning.';
  if (hour < 18 && hour >= 12) return 'Afternoon.';
  return 'Evening.';
}

export function minutes(sec: number): number {
  return Math.max(0, Math.floor(sec / 60));
}

export function durationWords(sec: number): string {
  const m = Math.round(sec / 60);
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
  detail: (l: Labels, elapsedSec: number, fadesAtMin: number | null) =>
    `${l === 'plain' ? 'Playing for' : 'With you for'} ${minutes(elapsedSec)} min · ${fadesAtMin === null ? 'No timer' : `Fades out at ${fadesAtMin} min`}`,
  sessionEnd: (l: Labels, elapsedSec: number, fadeSec: number) =>
    `${l === 'plain' ? 'Stopped' : 'Set down'} after ${Math.max(1, minutes(elapsedSec))} min. Faded out over ${fadeSec} seconds.`,
  releaseHint: (l: Labels) => (l === 'plain' ? 'Let go to stop.' : 'Let go to set it down.'),
  takeFive: (l: Labels) =>
    l === 'plain' ? 'Break, 5 min. Level Quiet. One chime at the end.' : 'Five minutes off. The layer drops to Quiet and one soft chime marks the end.',
  homeSame: (l: Labels) => (l === 'plain' ? 'Last layer:' : 'Same as last time?'),
  homeFirst: (l: Labels) => (l === 'plain' ? 'Pick a layer.' : 'How are you arriving?'),
  returning: (l: Labels) => (l === 'plain' ? 'Your last layer is ready.' : 'Hello again. Your layer’s where you left it.'),
  weekly: (l: Labels, total: string, sessions: number) =>
    l === 'plain'
      ? `Total this week: ${total}, ${sessions} session${sessions === 1 ? '' : 's'}.`
      : `Tuck kept you company for ${total} this week, across ${sessions} session${sessions === 1 ? '' : 's'}.`,
};

export function readoutText(l: Layer): string {
  if (!l.binaural) return `Noise only · ${l.noise.type} ${Math.round(l.noise.volume * 100)}%`;
  return `${hz(l.beatHz)} Hz`;
}
