/**
 * The shareable layer card: exact numbers and a link that opens the same layer in Tuck. No claims,
 * no personal data. Format: ?layer=<beat>,<carrier>,<noise>,<noise %>,<motion>,<beat on 1|0>,<name>[&note=<a word from the sharer>]
 */
import { validateTone } from '@core';
import { ears, hz, type Layer, type Motion } from './layers';

const NOISES = ['off', 'white', 'pink', 'brown'] as const;

export function shareText(l: Layer): string {
  const noise = l.noise.type === 'off' ? 'no noise' : `${l.noise.type} noise`;
  if (!l.binaural) return `${l.name}: ${noise}, no beat.`;
  if (l.journey) return `${l.name}: 8 Hz easing to 2 Hz over 30 minutes, over ${noise}.`;
  const e = ears(l);
  return `${l.name}: ${hz(l.beatHz)} Hz over ${noise}, L ${hz(e.left)} / R ${hz(e.right)}.`;
}

/** The full link (copied, never shown raw). Brand §1: the domain is tuckapp. */
export function shareLink(l: Layer, note = ''): string {
  const motion = l.motion === 'hold' ? 'hold' : 'drift';
  const v = [hz(l.beatHz), hz(l.carrierHz), l.noise.type, Math.round(l.noise.volume * 100), motion, l.binaural ? 1 : 0, encodeURIComponent(l.name)].join(',');
  const n = cleanNote(note);
  return `https://tuckapp.com/l?layer=${v}${n ? `&note=${encodeURIComponent(n)}` : ''}`;
}

/**
 * The sharer's optional word of context ("for reading"). It's the only personal field and it's opt-in:
 * letters, digits, spaces and apostrophes, at most 24 characters. Anything else is dropped, never "fixed".
 */
export const NOTE_MAX = 24;
export function cleanNote(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/[^\p{L}\p{N} '’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
}

/** What the share sheet shows instead of the raw query. */
export const SHARE_LINK_LABEL = 'tuckapp.com link';

/** Parse a shared layer. Anything out of range is refused (never "fixed" silently). */
export function parseShared(param: string | null): Layer | null {
  if (!param) return null;
  const [b, c, n, nv, m, on, name] = param.split(',');
  const beatHz = Number(b);
  const carrierHz = Number(c);
  const vol = Number(nv) / 100;
  if (!Number.isFinite(beatHz) || !Number.isFinite(carrierHz) || validateTone(beatHz, carrierHz).length > 0) return null;
  const type = NOISES.find((x) => x === n);
  if (!type || !Number.isFinite(vol) || vol < 0 || vol > 1) return null;
  const motion: Motion = m === 'hold' ? 'hold' : 'drift';
  let label = 'Shared layer';
  try {
    label = name ? decodeURIComponent(name).slice(0, 40) : label;
  } catch {
    /* keep default */
  }
  return {
    id: 'shared',
    name: label,
    kind: 'saved',
    intent: 'custom',
    beatHz,
    carrierHz,
    noise: { type, volume: vol },
    motion,
    driftHz: 0.5,
    driftPeriodMin: 10,
    fadeInSec: 8,
    fadeOutSec: 20,
    binaural: on !== '0',
    version: '1',
  };
}
