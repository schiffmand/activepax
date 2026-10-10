import { capital, descriptiveBand, ears, envelopeFor, hz, LEVEL_LABEL, LEVEL_VOLUME, type Layer, type LevelName, type Motion } from '../tuck/layers';
import { Button } from '../ui/kit';
import { fadesFor } from '../audio/session';

/** The back of the layer: exact numbers, the session envelope (the only wave in the brand), and the actions. */
export function SpecCard({
  layer,
  level,
  ceiling,
  motion,
  timerMin,
  binaural,
  onDone,
  onEditCopy,
  onSave,
  onNoiseOnly,
  onScience,
}: {
  layer: Layer;
  level: LevelName;
  ceiling: LevelName;
  motion: Motion;
  timerMin: number | null;
  binaural: boolean;
  onDone: () => void;
  onEditCopy: () => void;
  onSave: () => void;
  onNoiseOnly: () => void;
  onScience: () => void;
}) {
  const e = ears(layer);
  const { fadeIn, fadeOut } = fadesFor(layer);
  const shown: Layer = { ...layer, fadeInSec: fadeIn, fadeOutSec: fadeOut };
  const rows: [string, string][] = [
    ['Noise', layer.noise.type === 'off' ? 'Off' : `${capital(layer.noise.type)} · ${Math.round(layer.noise.volume * 100)}%`],
    ['Level', `${LEVEL_LABEL[level]} (${LEVEL_VOLUME[level].toFixed(2)}) · ceiling ${LEVEL_LABEL[ceiling]}`],
    [
      'Motion',
      layer.journey ? 'A journey: 8 → 4 → 2 Hz' : motion === 'drift' ? `Drift · ±${hz(layer.driftHz)} Hz over ${layer.driftPeriodMin} min` : 'Hold · no variation',
    ],
    ['Fades', `In ${fadeIn} s, out ${fadeOut} s`],
    ['Layer', layer.kind === 'builtin' ? `${layer.name} · built-in v${layer.version} · unchanged` : `${layer.name} · saved, frozen`],
  ];
  return (
    <div className="flex flex-col h-full px-5 pt-3" data-testid="spec-card">
      <div className="flex justify-end -mr-2">
        <Button variant="text" className="no-underline" onClick={onDone} data-testid="spec-done">
          Done
        </Button>
      </div>
      <div className="text-center -mt-3">
        {binaural ? (
          <>
            <p className="tnum text-[61px] leading-[64px] tracking-[-0.01em] text-ink" aria-label={`${hz(layer.beatHz)} hertz beat`}>
              {layer.journey ? '8 Hz' : `${hz(layer.beatHz)} Hz`}
            </p>
            <p className="tnum text-[20px] leading-7 font-medium mt-2">
              <span style={{ color: 'var(--c-left)' }}>L {hz(e.left)} Hz</span>
              <span className="text-ink2 mx-3" aria-hidden>
                ·
              </span>
              <span style={{ color: 'var(--c-right)' }}>R {hz(e.right)} Hz</span>
            </p>
            <p className="tnum text-[16px] text-ink2 mt-1">
              Carrier {hz(layer.carrierHz)} Hz · {descriptiveBand(layer.beatHz)} <span className="italic">(descriptive)</span>
            </p>
          </>
        ) : (
          <>
            <p className="tnum text-[61px] leading-[64px] tracking-[-0.01em] text-ink">Noise</p>
            <p className="text-[16px] text-ink2 mt-2">No beat is playing. Both ears hear the same {layer.noise.type} noise.</p>
          </>
        )}
      </div>
      <dl className="mt-5 border-t border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 py-[9px] border-b border-line">
            <dt className="w-[72px] shrink-0 text-[16px] text-ink2">{k}</dt>
            <dd className="text-[16px] text-ink tnum">{v}</dd>
          </div>
        ))}
      </dl>
      <Envelope layer={shown} timerMin={timerMin} motion={motion} />
      <div className="mt-auto pb-[calc(34px+12px)]">
        <p className="text-[16px] text-ink2 mb-2">{layer.kind === 'builtin' ? 'Built-in layers stay as they are.' : 'Saved layers never change unless you edit them.'}</p>
        <div className="grid grid-cols-[1.25fr_1fr_1.15fr] gap-2">
          <Button variant="quiet" onClick={onEditCopy} data-testid="spec-edit" className="px-2">
            {layer.kind === 'builtin' ? 'Edit a copy' : 'Edit'}
          </Button>
          <Button variant="quiet" onClick={onSave} data-testid="spec-save" className="px-2" disabled={layer.kind === 'saved'}>
            Save
          </Button>
          <Button variant="quiet" onClick={onNoiseOnly} data-testid="spec-noise" className="px-2" aria-pressed={!layer.binaural}>
            {layer.binaural ? 'Noise only' : 'Add beat'}
          </Button>
        </div>
        <div className="flex justify-center mt-1">
          <Button variant="text" onClick={onScience} data-testid="spec-science">
            What does this do?
          </Button>
        </div>
      </div>
    </div>
  );
}

function fmtT(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  return `${Math.round(sec / 60)} min`;
}

/** Level over time: fade-in ramp, plateau (Drift band tinted), fade-out ramp. Drawn in Thread, 1.5 px. */
function Envelope({ layer, timerMin, motion }: { layer: Layer; timerMin: number | null; motion: Motion }) {
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
  const d = env.points.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(' ');
  const drift = motion === 'drift' && !layer.journey;
  const endLabel = env.open ? '…' : layer.journey ? '45 min' : `${timerMin} min`;
  return (
    <figure className="mt-4" aria-label={`Session envelope: fades in over ${layer.fadeInSec} seconds, ${env.open ? 'plays until you stop' : `fades out at ${endLabel}`}.`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden className="block overflow-visible">
        {drift && (
          <rect x={fadeW} y={yOf(1) - 5} width={W - fadeW * 2 - (env.open ? 0 : 0)} height={10} rx={3} style={{ fill: 'url(#driftband)' }} />
        )}
        <defs>
          <linearGradient id="driftband" x1="0" x2="1">
            <stop offset="0" stopColor="var(--c-left)" stopOpacity=".12" />
            <stop offset="1" stopColor="var(--c-right)" stopOpacity=".12" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={H - padY} y2={H - padY} stroke="var(--c-line)" strokeWidth="1" />
        <path d={d} fill="none" stroke="var(--c-ink2)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {env.open && <path d={`M${W - fadeW + 6} ${yOf(1)} H${W}`} stroke="var(--c-ink2)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 6" />}

      </svg>
      <figcaption className="tnum relative h-6 text-[16px] text-ink2 mt-1">
        <span className="absolute left-0">0</span>
        <span className="absolute" style={{ left: fadeW - 6 }}>{fmtT(layer.fadeInSec)}</span>
        {env.open ? (
          <span className="absolute right-0">no timer</span>
        ) : (
          <>
            <span className="absolute -translate-x-full" style={{ left: `${((W - fadeW) / W) * 100}%`, marginLeft: -4 }}>{endLabel}</span>
            <span className="absolute right-0">+{fmtT(layer.fadeOutSec)}</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
