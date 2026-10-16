import type { Program, ProgramSegment } from './programs';

/**
 * Goal tracks: ready-made journeys named by what the listener wants to do, so nobody has to pick a
 * frequency. Each one is an ordinary Program (pure data) and plays through the same ProgramPlayer.
 *
 * Copy rule (brand.md): the goal is the listener's words; `plays` describes the sound, never an outcome.
 */
export type GoalTrackId =
  | 'meditate'
  | 'focus'
  | 'relax'
  | 'unwind'
  | 'ease-anxious'
  | 'ready-for-sleep'
  | 'deep-sleep'
  | 'wake-up';

export interface GoalTrack {
  id: GoalTrackId;
  /** The goal as the listener would say it. */
  goal: string;
  /** Length of the timed part in minutes; null when the track keeps playing until stopped. */
  minutes: number | null;
  /** One plain line on what plays. */
  plays: string;
  /** When it's meant for, in the listener's terms. */
  goodFor: string;
  program: Program;
}

const min = (m: number) => m * 60;

/**
 * Slow, even swells of the whole layer at `perMin` cycles a minute (in on the rise, out on the fall),
 * while the beat glides from `fromHz` to `toHz`. Six a minute is the common slow-breathing pace.
 */
export function breathingSegments(totalSec: number, fromHz: number, toHz: number, perMin = 6, low = 0.6): ProgramSegment[] {
  const half = 60 / perMin / 2;
  const count = Math.floor(totalSec / half);
  const out: ProgramSegment[] = [];
  for (let i = 0; i < count; i++) {
    const beatHz = Math.round((fromHz * Math.pow(toHz / fromHz, (i + 1) / count)) * 100) / 100;
    const seg: ProgramSegment = { durationSec: half, beatHz, level: i % 2 === 0 ? 1 : low, curve: 'linear' };
    if (i === 0) seg.label = 'Breathing with it';
    out.push(seg);
  }
  return out;
}

export const GOAL_TRACKS: readonly GoalTrack[] = Object.freeze([
  {
    id: 'meditate',
    goal: 'Meditate',
    minutes: 20,
    plays: 'A 10 Hz beat that eases to 6 Hz over 8 minutes, stays there, and lifts to 8 Hz for the last 2.',
    goodFor: 'A sit of about 20 minutes, eyes closed or open.',
    program: {
      id: 'goal-meditate',
      name: 'Meditate',
      start: { beatHz: 10, carrierHz: 180, level: 1, noise: { type: 'pink', volume: 0.2 } },
      segments: [
        { durationSec: min(8), beatHz: 6, carrierHz: 170, label: 'Settling' },
        { durationSec: min(10), label: 'Still' },
        { durationSec: min(2), beatHz: 8, label: 'Coming back' },
      ],
      end: 'stop',
      endFadeSec: 30,
      volume: 0.26,
    },
  },
  {
    id: 'focus',
    goal: 'Focus',
    minutes: 50,
    plays: 'Starts at 10 Hz, rises to 14 Hz over 5 minutes, then holds over soft brown noise.',
    goodFor: 'One block of work, reading or study.',
    program: {
      id: 'goal-focus',
      name: 'Focus',
      start: { beatHz: 10, carrierHz: 207, level: 0.85, noise: { type: 'brown', volume: 0.25 } },
      segments: [
        { durationSec: min(5), beatHz: 14, level: 1, label: 'Arriving' },
        { durationSec: min(43), label: 'Working' },
        { durationSec: min(2), level: 0.8, label: 'Surfacing' },
      ],
      end: 'stop',
      endFadeSec: 20,
      volume: 0.28,
    },
  },
  {
    id: 'relax',
    goal: 'Relax',
    minutes: 30,
    plays: 'A 10 Hz beat that eases to 8 Hz over 10 minutes, over pink noise.',
    goodFor: 'A break, a bath, a walk, or lying on the floor.',
    program: {
      id: 'goal-relax',
      name: 'Relax',
      start: { beatHz: 10, carrierHz: 170, level: 1, noise: { type: 'pink', volume: 0.25 } },
      segments: [
        { durationSec: min(10), beatHz: 8, label: 'Easing' },
        { durationSec: min(20), label: 'Resting' },
      ],
      end: 'stop',
      endFadeSec: 30,
      volume: 0.26,
    },
  },
  {
    id: 'unwind',
    goal: 'Unwind',
    minutes: 30,
    plays: 'Starts at 12 Hz and slows to 7 Hz over 15 minutes, then softens.',
    goodFor: 'The end of the workday, the commute home, cooking.',
    program: {
      id: 'goal-unwind',
      name: 'Unwind',
      start: { beatHz: 12, carrierHz: 165, level: 1, noise: { type: 'pink', volume: 0.25 } },
      segments: [
        { durationSec: min(15), beatHz: 7, carrierHz: 155, label: 'Slowing' },
        { durationSec: min(15), level: 0.75, label: 'Softening' },
      ],
      end: 'stop',
      endFadeSec: 30,
      volume: 0.26,
    },
  },
  {
    id: 'ease-anxious',
    goal: 'Ease anxious energy',
    minutes: 15,
    plays:
      'Starts at 12 Hz to meet you where you are, then slows to 8 Hz while the sound swells and falls six times a minute. Breathe in as it rises, out as it falls, if you like.',
    goodFor: 'When your mind is racing and you have 15 minutes.',
    program: {
      id: 'goal-ease-anxious',
      name: 'Ease anxious energy',
      start: { beatHz: 12, carrierHz: 140, level: 1, noise: { type: 'brown', volume: 0.35 } },
      segments: [
        { durationSec: min(3), label: 'Meeting you' },
        ...breathingSegments(min(9), 12, 8),
        { durationSec: min(3), level: 0.9, label: 'Resting' },
      ],
      end: 'stop',
      endFadeSec: 30,
      volume: 0.26,
    },
  },
  {
    id: 'ready-for-sleep',
    goal: 'Get ready for sleep',
    minutes: 45,
    plays: 'An 8 Hz beat that slows to 3 Hz over 30 minutes, then grows quieter and fades out.',
    goodFor: 'Brushing teeth, reading in bed, lights out.',
    program: {
      id: 'goal-ready-for-sleep',
      name: 'Get ready for sleep',
      start: { beatHz: 8, carrierHz: 136, level: 1, noise: { type: 'brown', volume: 0.3 } },
      segments: [
        { durationSec: min(30), beatHz: 3, carrierHz: 125, label: 'Slowing' },
        { durationSec: min(15), level: 0.55, label: 'Quieting' },
      ],
      end: 'stop',
      endFadeSec: 60,
      volume: 0.22,
    },
  },
  {
    id: 'deep-sleep',
    goal: 'Deep sleep',
    minutes: null,
    plays: 'A 4 Hz beat that slows to 2 Hz, then the tones sink under steady brown noise for the rest of the night.',
    goodFor: 'All night. Set a timer, or let it play until morning.',
    program: {
      id: 'goal-deep-sleep',
      name: 'Deep sleep',
      start: { beatHz: 4, carrierHz: 110, level: 0.9, noise: { type: 'brown', volume: 0.45 } },
      segments: [
        { durationSec: min(20), beatHz: 2, carrierHz: 100, label: 'Slowing' },
        { durationSec: min(40), level: 0.5, label: 'Sinking' },
      ],
      end: 'hold',
      endFadeSec: 120,
      volume: 0.2,
    },
  },
  {
    id: 'wake-up',
    goal: 'Wake up & make coffee',
    minutes: 12,
    plays: 'Starts soft at 6 Hz and climbs to 16 Hz, a little louder and brighter, over about the time a pot of coffee takes.',
    goodFor: 'The first 12 minutes of the morning.',
    program: {
      id: 'goal-wake-up',
      name: 'Wake up & make coffee',
      start: { beatHz: 6, carrierHz: 150, level: 0.45, noise: { type: 'pink', volume: 0.2 } },
      segments: [
        { durationSec: min(4), beatHz: 10, carrierHz: 180, level: 0.75, label: 'Waking' },
        { durationSec: min(6), beatHz: 16, carrierHz: 220, level: 1, label: 'Brewing' },
        { durationSec: min(2), label: 'Ready' },
      ],
      end: 'stop',
      endFadeSec: 15,
      volume: 0.3,
    },
  },
] satisfies GoalTrack[]);

export function getGoalTrack(id: string): GoalTrack | undefined {
  return GOAL_TRACKS.find((t) => t.id === id);
}
