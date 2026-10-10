import type React from 'react';
import { useEffect, useState } from 'react';
import { createCustomPreset } from '@core';
import { session } from '../audio/session';
import { BUILT_IN_LAYERS, INTENT_ORDER, builtInLayer, engravedLine, noiseOnlyOf, type Layer, type TuckPresetExtras } from '../tuck/layers';
import { store } from '../tuck/store';
import { selectLayer, useTuck } from '../ui/derived';
import { ui } from '../ui/state';
import { Button, Sheet, cx } from '../ui/kit';
import { IconCheck, IconMix, IconPage, IconPlus, IconSettings, IconWeek, IconHeadphones, IconLayer } from '../ui/icons';
import { DemoControls } from '../demo/DemoControls';

export function Sheets() {
  const t = useTuck();
  const close = () => ui.set({ sheet: null });
  const { u, reduced } = t;
  return (
    <>
      <Sheet open={u.sheet === 'picker'} onClose={close} title="Pick a layer" reduced={reduced} testid="sheet-picker" tall>
        <Picker />
      </Sheet>
      <Sheet open={u.sheet === 'timer'} onClose={close} title="Timer" reduced={reduced} testid="sheet-timer">
        <TimerSheet />
      </Sheet>
      <Sheet open={u.sheet === 'menu'} onClose={close} title="Menu" reduced={reduced} testid="sheet-menu">
        <Menu />
      </Sheet>
      <Sheet open={u.sheet === 'save'} onClose={close} title="Save layer" reduced={reduced} testid="sheet-save">
        <SaveSheet />
      </Sheet>
      <Sheet open={u.sheet === 'delete'} onClose={close} title="Delete layer" reduced={reduced} testid="sheet-delete">
        <DeleteSheet />
      </Sheet>
      <Sheet open={u.sheet === 'demo'} onClose={close} title="Prototype controls" reduced={reduced} testid="sheet-demo" tall>
        <DemoControls compact />
      </Sheet>
    </>
  );
}

function LayerRow({ l, on, sub, onPick, extra }: { l: Layer; on: boolean; sub?: string; onPick: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={onPick}
        data-testid={`pick-${l.id}`}
        className="flex-1 flex items-center gap-3 py-3 min-h-[64px] text-left"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[20px] leading-7 text-ink">{l.name}</span>
          <span className="block tnum text-[16px] leading-[22px] text-ink2">{engravedLine(l)}</span>
          {sub && <span className="block text-[16px] leading-[22px] text-ink2">{sub}</span>}
        </span>
        <span className={cx('h-7 w-7 rounded-full inline-flex items-center justify-center', on ? 'bg-ink text-onink' : 'border-[1.5px] border-line')}>{on && <IconCheck size={18} />}</span>
      </button>
      {extra}
    </div>
  );
}

function Picker() {
  const t = useTuck();
  const saved = store.savedLayers();
  const current = t.layer.id;
  const pick = (id: string) => {
    selectLayer(id);
    ui.set({ sheet: null });
  };
  const fmt = (ts?: number) => (ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
  return (
    <div role="radiogroup" aria-label="Layers">
      <div className="divide-y divide-line">
        {INTENT_ORDER.map((id) => {
          const l = builtInLayer(id)!;
          return <LayerRow key={id} l={l} on={current === id} onPick={() => pick(id)} />;
        })}
      </div>
      <h3 className="text-[16px] font-bold text-ink2 mt-6 mb-1">Your layers</h3>
      {saved.length === 0 ? (
        <p className="text-[16px] leading-6 text-ink2 py-2">Nothing saved yet. When a layer feels right, tap Save and it stays exactly as it is.</p>
      ) : (
        <div className="divide-y divide-line">
          {saved.map((l) => (
            <LayerRow
              key={l.id}
              l={l}
              on={current === l.id}
              sub={`Saved ${fmt(l.savedAt)}${t.prefs.tooMuchLayerId === l.id ? ' · plays for Too much' : ''}`}
              onPick={() => pick(l.id)}
              extra={
                <Button variant="text" className="ml-2 text-ink2" onClick={() => ui.set({ sheet: 'delete', deleteId: l.id })} data-testid={`delete-${l.id}`}>
                  Delete
                </Button>
              }
            />
          ))}
        </div>
      )}
      <h3 className="text-[16px] font-bold text-ink2 mt-6 mb-1">More layers</h3>
      <div className="divide-y divide-line">
        <LayerRow l={builtInLayer('long-focus')!} on={current === 'long-focus'} onPick={() => pick('long-focus')} />
        {BUILT_IN_LAYERS.filter((l) => INTENT_ORDER.includes(l.id as never)).map((l) => {
          const n = noiseOnlyOf(l);
          return <LayerRow key={n.id} l={n} on={current === n.id} onPick={() => pick(n.id)} />;
        })}
      </div>
    </div>
  );
}

const TIMER_OPTIONS: (number | null)[] = [25, 50, 90, null];

function TimerSheet() {
  const t = useTuck();
  const active = t.active;
  const current = active ? t.s.timerMin : t.prefs.timerByLayer[t.layer.id] ?? null;
  const [custom, setCustom] = useState<number>(current && !TIMER_OPTIONS.includes(current) ? current : 40);
  const choose = (m: number | null) => {
    store.setPrefs({ timerByLayer: { ...t.prefs.timerByLayer, [t.layer.id]: m } });
    if (active) session.setTimer(m);
    ui.set({ sheet: null });
  };
  return (
    <div>
      <div className="divide-y divide-line" role="radiogroup" aria-label="Timer">
        {TIMER_OPTIONS.map((m) => (
          <button
            key={String(m)}
            type="button"
            role="radio"
            aria-checked={current === m}
            onClick={() => choose(m)}
            data-testid={`timer-${m ?? 'none'}`}
            className="w-full min-h-14 flex items-center justify-between text-left"
          >
            <span className="tnum text-[20px] leading-7 text-ink">{m === null ? 'Until I stop' : `${m} min`}</span>
            {current === m && <IconCheck className="text-ink" />}
          </button>
        ))}
      </div>
      <div className="mt-5">
        <label htmlFor="custom-timer" className="text-[16px] font-medium text-ink">
          Custom: <span className="tnum">{custom} min</span>
        </label>
        <input
          id="custom-timer"
          className="tuck-range"
          type="range"
          min={5}
          max={240}
          step={5}
          value={custom}
          onChange={(e) => setCustom(Number(e.target.value))}
          aria-valuetext={`${custom} minutes`}
        />
        <Button variant="quiet" full onClick={() => choose(custom)} data-testid="timer-custom">
          Use {custom} min
        </Button>
      </div>
      <p className="text-[16px] leading-[22px] text-ink2 mt-4">
        The layer fades out at the time you pick, over {t.layer.journey ? 60 : t.prefs.fadeOutSec} seconds. There’s no countdown. Tuck remembers your choice for {t.layer.name}.
      </p>
    </div>
  );
}

function Menu() {
  const go = (page: Parameters<typeof ui.set>[0]['page']) => ui.set({ sheet: null, page });
  const items: { label: string; icon: React.ReactElement; onClick: () => void; testid: string }[] = [
    { label: 'Settings', icon: <IconSettings />, onClick: () => go('settings'), testid: 'menu-settings' },
    { label: 'What we know', icon: <IconPage />, onClick: () => go('science'), testid: 'menu-science' },
    { label: 'How Tuck plays under your audio', icon: <IconMix />, onClick: () => go('mixing'), testid: 'menu-mixing' },
    { label: 'This week', icon: <IconWeek />, onClick: () => go('week'), testid: 'menu-week' },
    { label: 'Lock Screen', icon: <IconLayer />, onClick: () => go('lock'), testid: 'menu-lock' },
    { label: 'Run the ear check', icon: <IconHeadphones />, onClick: () => ui.set({ sheet: null, onboarding: 'ear', earFrom: 'settings' }), testid: 'menu-earcheck' },
    { label: 'Tuck Plus', icon: <IconPlus />, onClick: () => go('plus'), testid: 'menu-plus' },
  ];
  return (
    <nav aria-label="Menu">
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.label}>
            <button type="button" onClick={i.onClick} data-testid={i.testid} className="w-full min-h-14 flex items-center gap-4 text-left text-ink">
              <span className="text-ink2">{i.icon}</span>
              <span className="text-[17px] font-medium">{i.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-[18px] border border-dashed border-line px-4 py-3">
        <p className="text-[16px] leading-[22px] text-ink2">This is a prototype. Simulate another app playing, headphone states and time from here.</p>
        <Button variant="text" className="-ml-1" onClick={() => ui.set({ sheet: 'demo' })} data-testid="menu-demo">
          Prototype controls
        </Button>
      </div>
    </nav>
  );
}

function SaveSheet() {
  const t = useTuck();
  const from = store.findLayer(t.u.draftFrom) ?? t.layer;
  const src: Layer = t.u.draft ?? from;
  const first = store.savedLayers().length === 0;
  const [name, setName] = useState(src.kind === 'builtin' ? (src.id === 'focus' ? 'Desk' : `My ${src.name.toLowerCase()}`) : src.name);
  const [tooMuch, setTooMuch] = useState(first);
  const [err, setErr] = useState<string[]>([]);
  useEffect(() => setErr([]), [name]);
  const save = () => {
    const r = createCustomPreset({ name, beatHz: src.beatHz, carrierHz: src.carrierHz, noise: src.noise, volume: 0.28, tagline: engravedLine(src) });
    if (!r.ok) {
      setErr(r.errors);
      return;
    }
    const preset = {
      ...r.value,
      tuck: {
        motion: src.motion,
        driftHz: src.driftHz,
        driftPeriodMin: src.driftPeriodMin,
        fadeInSec: src.fadeInSec,
        fadeOutSec: src.fadeOutSec,
        binaural: src.binaural,
        basedOn: src.basedOn ?? from.id,
        savedAt: Date.now(),
        version: '1',
      },
    } satisfies TuckPresetExtras & typeof r.value;
    store.core.dispatch({ type: 'preset/add', preset });
    if (tooMuch) store.setPrefs({ tooMuchLayerId: preset.id });
    ui.set({ sheet: null, page: 'home', spec: false, draft: null, selectedId: preset.id, chip: null, chipLine: null, chipFirst: null });
    ui.toast(`Saved as “${preset.name}”. It won’t change unless you change it.`, 5000);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor="save-name" className="text-[16px] font-medium text-ink">
        Name
      </label>
      <input
        id="save-name"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        data-testid="save-name"
        className="mt-1 w-full h-14 rounded-[14px] bg-bg px-4 text-[17px] text-ink border-[1.5px] border-line focus:border-[var(--c-focus)] outline-none"
        autoComplete="off"
      />
      <p className="tnum text-[16px] text-ink2 mt-2">{engravedLine(src)}</p>
      <label className="mt-4 flex items-start gap-3 min-h-12 cursor-pointer">
        <input type="checkbox" checked={tooMuch} onChange={(e) => setTooMuch(e.target.checked)} className="mt-[3px] h-6 w-6 accent-[var(--c-ink)]" data-testid="save-toomuch" />
        <span className="text-[16px] leading-6 text-ink">Play this when I pick Too much</span>
      </label>
      {err.length > 0 && (
        <p className="mt-2 rounded-[14px] bg-surface2 px-4 py-3 text-[16px] text-ink" role="alert">
          {err[0]}
        </p>
      )}
      <Button full type="submit" className="mt-4" data-testid="save-confirm">
        Save
      </Button>
      <p className="text-[16px] leading-[22px] text-ink2 mt-3">Saved layers are frozen. They won’t change unless you change them, including across updates.</p>
    </form>
  );
}

function DeleteSheet() {
  const t = useTuck();
  const l = store.findLayer(t.u.deleteId);
  if (!l) return null;
  return (
    <div>
      <p className="text-[16px] leading-6 text-ink">Delete “{l.name}”? This removes it from this phone. Built-in layers aren’t affected.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="quiet" onClick={() => ui.set({ sheet: 'picker' })}>
          Keep it
        </Button>
        <Button
          variant="outline"
          data-testid="delete-confirm"
          onClick={() => {
            store.core.dispatch({ type: 'preset/remove', id: l.id });
            if (t.prefs.tooMuchLayerId === l.id) store.setPrefs({ tooMuchLayerId: null });
            if (t.u.selectedId === l.id) ui.set({ selectedId: 'focus' });
            ui.set({ sheet: 'picker' });
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
