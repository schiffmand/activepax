import { useEffect, useMemo, useState } from 'react';
import { validateTone, type NoiseSetting } from '@core';
import { session } from '../audio/session';
import { builtInLayer, ears, hz, LEVEL_LABEL, LEVELS, type Layer, type LevelName, type Motion } from '../tuck/layers';
import { store } from '../tuck/store';
import { useTuck } from '../ui/derived';
import { ui } from '../ui/state';
import { Button, Segmented } from '../ui/kit';
import { IconInfo } from '../ui/icons';

/** Edit a copy: the exact-frequency editor. The original is untouched. */
export function Editor() {
  const t = useTuck();
  const base: Layer = store.findLayer(t.u.draftFrom) ?? t.layer ?? builtInLayer('focus')!;
  const [d, setD] = useState<Layer>(() => ({
    ...base,
    id: `draft-${base.id}`,
    kind: 'saved',
    name: base.kind === 'builtin' ? `Copy of ${base.name}` : base.name,
    basedOn: base.id,
    motionLocked: false,
    journey: undefined,
    motion: base.motionLocked ? 'hold' : base.motion,
    fadeInSec: base.fadeInSec,
    fadeOutSec: base.journey ? 60 : base.fadeOutSec,
  }));
  const [beatText, setBeatText] = useState(hz(d.beatHz));
  const [carrierText, setCarrierText] = useState(hz(d.carrierHz));
  const [more, setMore] = useState(t.prefs.advancedTuning);
  const [level, setLevel] = useState<LevelName>(t.active ? t.s.level : t.prefs.lastLevel);
  const errors = useMemo(() => validateTone(d.beatHz, d.carrierHz), [d.beatHz, d.carrierHz]);
  const e = ears(d);
  const playingThis = t.active;

  // While sound is playing, changes preview live with a 1 s glide.
  useEffect(() => {
    if (playingThis && errors.length === 0) session.preview({ beatHz: d.beatHz, carrierHz: d.carrierHz });
  }, [d.beatHz, d.carrierHz, playingThis, errors.length]);
  useEffect(() => {
    if (playingThis) session.preview({ noise: d.noise });
  }, [d.noise.type, d.noise.volume, playingThis]);

  const setBeat = (v: number, fromText = false) => {
    setD((x) => ({ ...x, beatHz: v }));
    if (!fromText) setBeatText(hz(v));
  };
  const setCarrier = (v: number, fromText = false) => {
    setD((x) => ({ ...x, carrierHz: v }));
    if (!fromText) setCarrierText(hz(v));
  };
  const setNoise = (n: Partial<NoiseSetting>) => setD((x) => ({ ...x, noise: { ...x.noise, ...n } }));
  const db = d.noise.volume > 0 ? `${(20 * Math.log10(d.noise.volume)).toFixed(1)} dB` : '−∞ dB';
  const lowWarn = e.left < 60 || e.right < 60;
  // Log slider for carrier: 0..1000 steps over 40..1000 Hz.
  const toLog = (hzv: number) => Math.round((Math.log(hzv / 40) / Math.log(1000 / 40)) * 1000);
  const fromLog = (p: number) => Math.round(40 * Math.pow(1000 / 40, p / 1000));

  return (
    <div className="pb-8" data-testid="editor">
      <h1 className="text-[31px] leading-[38px] font-bold text-ink mt-2">{d.name}</h1>
      <p className="text-[16px] text-ink2 mt-1">{base.kind === 'builtin' ? `${base.name} stays as it is. This copy is yours.` : 'Changes apply when you save.'}</p>

      <section className="mt-6">
        <div className="flex items-end justify-between">
          <label htmlFor="beat" className="text-[16px] font-bold text-ink">
            Beat
          </label>
          <div className="flex items-center gap-2">
            <input
              id="beat"
              inputMode="decimal"
              value={beatText}
              data-testid="editor-beat"
              onChange={(ev) => {
                setBeatText(ev.target.value);
                const v = Number(ev.target.value.replace(',', '.'));
                if (Number.isFinite(v) && ev.target.value.trim() !== '') setBeat(v, true);
              }}
              onBlur={() => setBeatText(hz(d.beatHz))}
              className="tnum w-24 h-12 rounded-[12px] bg-bg border-[1.5px] border-line px-3 text-right text-[20px] text-ink focus:border-[var(--c-focus)] outline-none"
              aria-describedby="beat-ears"
            />
            <span className="text-[16px] text-ink2">Hz</span>
          </div>
        </div>
        <input
          type="range"
          className="tuck-range"
          min={0.5}
          max={45}
          step={0.1}
          value={Math.min(45, Math.max(0.5, d.beatHz))}
          onChange={(ev) => setBeat(Number(ev.target.value))}
          aria-label="Beat frequency"
          aria-valuetext={`${hz(d.beatHz)} hertz`}
          data-testid="editor-beat-slider"
        />
        <p id="beat-ears" className="tnum text-[20px] font-medium flex gap-4" aria-live="polite">
          <span style={{ color: 'var(--c-left)' }}>L {hz(e.left)} Hz</span>
          <span style={{ color: 'var(--c-right)' }}>R {hz(e.right)} Hz</span>
        </p>
      </section>

      {errors.length > 0 && (
        <div className="mt-4 rounded-[14px] bg-surface2 px-4 py-3 flex gap-3" role="alert" data-testid="editor-error">
          <IconInfo className="text-ink2 shrink-0" />
          <p className="text-[16px] leading-[22px] text-ink">{errors[0]}</p>
        </div>
      )}

      <section className="mt-8">
        <p className="text-[16px] font-bold text-ink mb-2">Noise</p>
        <Segmented
          label="Noise colour"
          testid="editor-noise"
          value={d.noise.type}
          onChange={(v) => setNoise({ type: v })}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'white', label: 'White' },
            { value: 'pink', label: 'Pink' },
            { value: 'brown', label: 'Brown' },
          ]}
        />
        <div className="mt-2 flex items-center justify-between">
          <label htmlFor="noise-vol" className="text-[16px] text-ink">
            Noise level
          </label>
          <span className="tnum text-[16px] text-ink2">
            {Math.round(d.noise.volume * 100)}% · {db}
          </span>
        </div>
        <input
          id="noise-vol"
          type="range"
          className="tuck-range"
          min={0}
          max={100}
          value={Math.round(d.noise.volume * 100)}
          disabled={d.noise.type === 'off'}
          onChange={(ev) => setNoise({ volume: Number(ev.target.value) / 100 })}
          aria-valuetext={`${Math.round(d.noise.volume * 100)} percent`}
        />
      </section>

      <section className="mt-6">
        <p className="text-[16px] font-bold text-ink mb-2">Level</p>
        <Segmented<LevelName>
          label="Level"
          value={level}
          onChange={(v) => {
            setLevel(v);
            store.setPrefs({ lastLevel: v });
            if (playingThis) session.setLevel(v);
          }}
          options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
        />
      </section>

      <section className="mt-6">
        <p className="text-[16px] font-bold text-ink mb-2">Motion</p>
        <Segmented<Motion>
          label="Motion"
          testid="editor-motion"
          value={d.motion}
          onChange={(v) => setD((x) => ({ ...x, motion: v }))}
          options={[
            { value: 'drift', label: 'Drift' },
            { value: 'hold', label: 'Hold' },
          ]}
        />
        <p className="text-[16px] leading-[22px] text-ink2 mt-2">
          {d.motion === 'drift' ? `The beat wanders slowly within ±${hz(d.driftHz)} Hz so it doesn’t go stale.` : 'Identical every time. No variation.'}
        </p>
      </section>

      <section className="mt-6 border-t border-line pt-2">
        <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="w-full min-h-12 flex items-center justify-between text-left" data-testid="editor-more">
          <span className="text-[16px] font-bold text-ink">More</span>
          <span className="text-[16px] text-ink2">{more ? 'Hide' : 'Carrier, Drift range, fades'}</span>
        </button>
        {more && (
          <div className="pb-2">
            <div className="flex items-end justify-between mt-2">
              <label htmlFor="carrier" className="text-[16px] text-ink">
                Carrier
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="carrier"
                  inputMode="numeric"
                  value={carrierText}
                  data-testid="editor-carrier"
                  onChange={(ev) => {
                    setCarrierText(ev.target.value);
                    const v = Number(ev.target.value);
                    if (Number.isFinite(v) && ev.target.value.trim() !== '') setCarrier(v, true);
                  }}
                  onBlur={() => setCarrierText(hz(d.carrierHz))}
                  className="tnum w-24 h-12 rounded-[12px] bg-bg border-[1.5px] border-line px-3 text-right text-[20px] text-ink focus:border-[var(--c-focus)] outline-none"
                />
                <span className="text-[16px] text-ink2">Hz</span>
              </div>
            </div>
            <input
              type="range"
              className="tuck-range"
              min={0}
              max={1000}
              value={toLog(Math.min(1000, Math.max(40, d.carrierHz)))}
              onChange={(ev) => setCarrier(fromLog(Number(ev.target.value)))}
              aria-label="Carrier frequency"
              aria-valuetext={`${hz(d.carrierHz)} hertz`}
            />
            {lowWarn && <p className="text-[16px] leading-[22px] text-ink2">Very low tones can be hard to hear on earbuds.</p>}

            <RangeRow label="Drift range" unit={`±${hz(d.driftHz)} Hz`} min={0} max={2} step={0.1} value={d.driftHz} onChange={(v) => setD((x) => ({ ...x, driftHz: v }))} disabled={d.motion === 'hold'} />
            <RangeRow label="Drift period" unit={`${d.driftPeriodMin} min`} min={5} max={20} step={1} value={d.driftPeriodMin} onChange={(v) => setD((x) => ({ ...x, driftPeriodMin: v }))} disabled={d.motion === 'hold'} />
            <RangeRow label="Fade in" unit={`${d.fadeInSec} s`} min={2} max={20} step={1} value={d.fadeInSec} onChange={(v) => setD((x) => ({ ...x, fadeInSec: v }))} />
            <RangeRow label="Fade out" unit={`${d.fadeOutSec} s`} min={10} max={120} step={5} value={d.fadeOutSec} onChange={(v) => setD((x) => ({ ...x, fadeOutSec: v }))} />
          </div>
        )}
      </section>

      <div className="mt-6">
        <Button
          full
          disabled={errors.length > 0}
          data-testid="editor-save"
          onClick={() => ui.set({ draft: { ...d, name: base.kind === 'builtin' ? (base.id === 'focus' ? 'Desk' : `My ${base.name.toLowerCase()}`) : d.name }, sheet: 'save', draftFrom: base.id })}
        >
          Save
        </Button>
        <p className="text-[16px] leading-[22px] text-ink2 mt-3">{playingThis ? 'You’re hearing these changes now, with a 1 second glide.' : 'Start sound on Home to hear changes live.'}</p>
      </div>
    </div>
  );
}

function RangeRow({ label, unit, min, max, step, value, onChange, disabled }: { label: string; unit: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const id = label.replace(/\s/g, '-').toLowerCase();
  return (
    <div className="mt-3">
      <div className="flex justify-between">
        <label htmlFor={id} className="text-[16px] text-ink">
          {label}
        </label>
        <span className="tnum text-[16px] text-ink2">{unit}</span>
      </div>
      <input id={id} type="range" className="tuck-range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={unit} />
    </div>
  );
}
