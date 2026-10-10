import { capital, ears, envelopeFor, hz, LEVEL_LABEL, LEVEL_VOLUME, type Layer, type LevelName, type Motion } from '../tuck/layers';
import type { TimerChoice } from '../tuck/store';
import { Button } from '../ui/kit';
import { CYCLE, fadesFor } from '../audio/session';

/** The back of the layer: exact numbers, the session envelope (the only wave in the brand), and the actions. */
export function SpecCard({
  layer,
  level,
  ceiling,
  motion,
  timer,
  binaural,
  blind,
  onDone,
  onEditCopy,
  onSave,
  onNoiseOnly,
  onScience,
  onShare,
  onDelete,
}: {
  layer: Layer;
  level: LevelName;
  ceiling: LevelName;
  motion: Motion;
  timer: TimerChoice;
  binaural: boolean;
  blind: 'A' | 'B' | null;
  onDone: () => void;
  onEditCopy: () => void;
  onSave: () => void;
  onNoiseOnly: () => void;
  onScience: (anchor: 'beat' | 'noise') => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const e = ears(layer);
  const { fadeIn, fadeOut } = fadesFor(layer);
  const shown: Layer = { ...layer, fadeInSec: fadeIn, fadeOutSec: fadeOut };
  const beat = binaural && layer.binaural;

  if (blind) {
    return (
      <div className="flex flex-col h-full px-5 pt-3" data-testid="spec-card">
        <div className="flex justify-end -mr-2">
          <Button variant="text" className="no-underline" onClick={onDone} data-testid="spec-done">
            Done
          </Button>
        </div>
        <p className="tnum text-[61px] leading-[64px] text-ink text-center -mt-3">Layer {blind}</p>
        <p className="text-[16px] leading-6 text-ink mt-4 text-center max-w-[34ch] mx-auto">
          This is a blind comparison. One label has the beat and one is noise only, at the same level. The numbers stay hidden until you reveal the result, so they can’t sway you.
        </p>
      </div>
    );
  }

  const noiseRow = layer.noise.type === 'off' ? 'Off' : `${capital(layer.noise.type)} · ${Math.round(layer.noise.volume * 100)}% · loudness-matched`;
  const motionRow = layer.journey
    ? 'A journey: 8 → 4 → 2 Hz'
    : motion === 'hold'
      ? 'Hold · no variation'
      : beat
        ? `${motion === 'vary' ? 'Vary' : 'Drift'} · beat ±${hz(layer.driftHz)} Hz, noise ±1 dB, over ${layer.driftPeriodMin} min${motion === 'vary' ? ' · new noise each session' : ''}`
        : `${motion === 'vary' ? 'Vary' : 'Drift'} · noise level wanders ±1 dB over ${layer.driftPeriodMin} min${motion === 'vary' ? ' · new noise each session' : ''}`;
  const rows: [string, string][] = [
    ['Noise', noiseRow],
    ['Level', `${LEVEL_LABEL[level]} (${LEVEL_VOLUME[level].toFixed(2)}) · ceiling ${LEVEL_LABEL[ceiling]}`],
    ['Motion', motionRow],
    ['Fades', `In ${fadeIn} s, out ${fadeOut} s, even in dB`],
    ['Layer', layer.kind === 'builtin' ? `${layer.name.replace(/, noise only$/, '')} · built-in v${layer.version} · unchanged` : `${layer.name} · saved, frozen`],
  ];
  return (
    <div className="flex flex-col h-full px-5 pt-3 overflow-y-auto scrollbar-none" data-testid="spec-card">
      <div className="flex justify-end -mr-2">
        <Button variant="text" className="no-underline" onClick={onDone} data-testid="spec-done">
          Done
        </Button>
      </div>
      <div className="text-center -mt-3">
        {beat ? (
          <>
            <p className="tnum text-[61px] leading-[64px] tracking-[-0.01em] text-ink" aria-label={`${hz(layer.beatHz)} hertz beat`}>
              {layer.journey ? '8 → 2 Hz' : `${hz(layer.beatHz)} Hz`}
            </p>
            <p className="tnum text-[20px] leading-7 font-medium mt-2">
              <span style={{ color: 'var(--c-left)' }}>L {hz(e.left)} Hz</span>
              <span className="text-ink2 mx-3" aria-hidden>
                ·
              </span>
              <span style={{ color: 'var(--c-right)' }}>R {hz(e.right)} Hz</span>
            </p>
            <p className="tnum text-[16px] leading-[22px] text-ink2 mt-1" data-testid="spec-carrier">
              Carrier {hz(layer.carrierHz)} Hz: the pitch both tones sit around.
            </p>
            {layer.note && <p className="text-[16px] leading-[22px] text-ink mt-1">{layer.note}</p>}
          </>
        ) : (
          <>
            <p className="tnum text-[61px] leading-[64px] tracking-[-0.01em] text-ink">Noise</p>
            <p className="text-[16px] text-ink2 mt-2">No beat is playing. Both ears hear {layer.noise.type} noise.</p>
          </>
        )}
      </div>
      <dl className="mt-4 border-t border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 py-[8px] border-b border-line">
            <dt className="w-[64px] shrink-0 text-[16px] text-ink2">{k}</dt>
            <dd className="text-[16px] leading-[22px] text-ink tnum">{v}</dd>
          </div>
        ))}
      </dl>
      <Envelope layer={shown} timer={timer} motion={motion} />
      <div className="mt-auto pt-2 pb-[calc(34px+12px)]">
        <div className="grid grid-cols-[1.25fr_1fr_1.15fr] gap-2">
          <Button variant="quiet" onClick={onEditCopy} data-testid="spec-edit" className="px-2">
            {layer.kind === 'builtin' ? 'Edit a copy' : 'Edit'}
          </Button>
          {layer.kind === 'saved' ? (
            <Button variant="quiet" onClick={onDelete} data-testid="spec-delete" className="px-2">
              Delete
            </Button>
          ) : (
            <Button variant="quiet" onClick={onSave} data-testid="spec-save" className="px-2">
              Save
            </Button>
          )}
          <Button variant="quiet" onClick={onNoiseOnly} data-testid="spec-noise" className="px-2" aria-pressed={!layer.binaural}>
            {layer.binaural ? 'Noise only' : 'Add beat'}
          </Button>
        </div>
        <div className="flex justify-center gap-6 mt-1">
          <Button variant="text" onClick={() => onScience(beat ? 'beat' : 'noise')} data-testid="spec-science">
            What does this do?
          </Button>
          <Button variant="text" onClick={onShare} data-testid="spec-share">
            Share
          </Button>
        </div>
      </div>
    </div>
  );
}

function fmtT(sec: number): string {
  if (sec <= 90) return `${Math.round(sec)} s`;
  return `${Math.round(sec / 60)} min`;
}

/** Level over time: fade-in ramp, plateau (Drift band tinted), fade-out ramp. Evening descent also draws the beat. */
function Envelope({ layer, timer, motion }: { layer: Layer; timer: TimerChoice; motion: Motion }) {
  const cycles = timer === 'cycles';
  const timerMin = cycles ? CYCLE.rounds * CYCLE.workMin + (CYCLE.rounds - 1) * CYCLE.breakMin : timer;
  const env = envelopeFor(layer, timerMin);
  const W = 350;
  const H = 64;
  const padY = 6;
  // Compress the plateau so the fades stay visible: piecewise time scale.
  const fadeW = 44;
  const xOf = (t: number) => {
    const a = env.plateauFrom;
    const b = env.plateauTo;
    if (t <= a) return (t / a) * fadeW;
    if (t <= b) return fadeW + ((t - a) / Math.max(1, b - a)) * (W - fadeW * 2);
    return W - fadeW + ((t - b) / Math.max(1, env.totalSec - b)) * fadeW;
  };
  const yOf = (v: number) => padY + (1 - v) * (H - padY * 2);
  let pts = env.points;
  if (cycles) {
    // Work at the level, breaks at Quiet (about 0.57 of Medium in gain terms; drawn as a step down).
    const p: { t: number; v: number }[] = [{ t: 0, v: 0 }, { t: layer.fadeInSec, v: 1 }];
    let t = 0;
    for (let r = 0; r < CYCLE.rounds; r++) {
      t += CYCLE.workMin * 60;
      p.push({ t, v: 1 });
      if (r < CYCLE.rounds - 1) {
        p.push({ t: t + 4, v: 0.55 }, { t: t + CYCLE.breakMin * 60, v: 0.55 }, { t: t + CYCLE.breakMin * 60 + 4, v: 1 });
        t += CYCLE.breakMin * 60;
      }
    }
    p.push({ t: t + layer.fadeOutSec, v: 0 });
    pts = p;
  }
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(' ');
  // The descent's beat, on its own scale (8 Hz at the top, 0 at the baseline), dashed.
  const beatPath = env.beat?.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.t).toFixed(1)} ${yOf(p.v / 8).toFixed(1)}`).join(' ');
  const drift = motion !== 'hold' && !layer.journey;
  const endLabel = env.open ? '…' : layer.journey ? '45 min' : `${timerMin} min`;
  return (
    <figure
      className="mt-3"
      aria-label={`Session envelope: fades in over ${layer.fadeInSec} seconds, ${env.open ? 'plays until you stop' : layer.journey ? 'the beat eases from 8 to 2 Hz over 30 minutes, then 15 quiet minutes, ending after 45 minutes' : cycles ? `${CYCLE.rounds} rounds of ${CYCLE.workMin} minutes with ${CYCLE.breakMin} minute breaks at Quiet` : `fades out at ${endLabel}`}.`}
      data-testid="envelope"
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden className="block overflow-visible">
        <defs>
          <linearGradient id="driftband" x1="0" x2="1">
            <stop offset="0" stopColor="var(--c-left)" stopOpacity=".12" />
            <stop offset="1" stopColor="var(--c-right)" stopOpacity=".12" />
          </linearGradient>
        </defs>
        {drift && <rect x={fadeW} y={yOf(1) - 5} width={W - fadeW * 2} height={10} rx={3} style={{ fill: 'url(#driftband)' }} />}
        <line x1="0" x2={W} y1={H - padY} y2={H - padY} stroke="var(--c-line)" strokeWidth="1" />
        <path d={d} fill="none" stroke="var(--c-ink2)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {beatPath && <path d={beatPath} fill="none" stroke="var(--c-left)" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" data-testid="envelope-beat" />}
        {env.open && <path d={`M${W - fadeW + 6} ${yOf(1)} H${W}`} stroke="var(--c-ink2)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 6" />}
      </svg>
      <figcaption className="tnum relative h-6 text-[16px] text-ink2 mt-1 whitespace-nowrap">
        <span className="absolute left-0">0</span>
        <span className="absolute" style={{ left: fadeW - 6 }}>
          {fmtT(layer.fadeInSec)}
        </span>
        {env.open ? (
          <span className="absolute right-0">no timer</span>
        ) : (
          <>
            <span className="absolute -translate-x-full" style={{ left: `${((W - fadeW) / W) * 100}%`, marginLeft: -12 }}>
              {endLabel}
            </span>
            <span className="absolute right-0">+{fmtT(layer.fadeOutSec)}</span>
          </>
        )}
      </figcaption>
      {layer.journey && (
        <p className="text-[16px] leading-[22px] text-ink2 mt-1">
          <span style={{ color: 'var(--c-left)' }}>Dashed</span>: the beat, 8 → 4 → 2 Hz. Solid: the level.
        </p>
      )}
    </figure>
  );
}
