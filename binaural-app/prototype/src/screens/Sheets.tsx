import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createCustomPreset } from '@core';
import { session } from '../audio/session';
import { CYCLE } from '../audio/session';
import { BUILT_IN_LAYERS, GOAL_LAYERS, INTENT_ORDER, journeyEndText, journeyOf, builtInLayer, ears, engravedLine, hz, noiseOnlyOf, type Layer, type TuckPresetExtras } from '../tuck/layers';
import { store, type TimerChoice } from '../tuck/store';
import { selectLayer, useTuck } from '../ui/derived';
import { FORCES_NOISE, ui, type Headphone } from '../ui/state';
import { Button, Sheet, Stitch, cx } from '../ui/kit';
import { IconAB, IconBolt, IconCheck, IconMix, IconPage, IconPlus, IconSettings, IconWeek, IconHeadphones, IconLayer } from '../ui/icons';
import { DemoControls } from '../demo/DemoControls';
import { HP_DISCONNECTED_MID } from '../tuck/copy';
import { NOTE_MAX, SHARE_LINK_LABEL, cleanNote, shareLink, shareText } from '../tuck/share';
import { copyText, exportFile, inFrame, tryDownload } from '../ui/exporting';

export function Sheets() {
  const t = useTuck();
  const close = () => ui.set({ sheet: null });
  const { u, reduced } = t;
  return (
    <>
      <Sheet open={u.sheet === 'picker'} onClose={close} title="Pick a layer" reduced={reduced} testid="sheet-picker" tall>
        <Picker />
      </Sheet>
      <Sheet open={u.sheet === 'goals'} onClose={close} title="Pick a goal" reduced={reduced} testid="sheet-goals" tall>
        <GoalsSheet />
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
      <Sheet open={u.sheet === 'headphones'} onClose={close} title="Headphones" reduced={reduced} testid="sheet-headphones">
        <HeadphonesSheet />
      </Sheet>
      <Sheet open={u.sheet === 'share'} onClose={close} title="Share this layer" reduced={reduced} testid="sheet-share">
        <ShareSheet />
      </Sheet>
      <Sheet open={u.sheet === 'anywhere'} onClose={close} title="Start without opening Tuck" reduced={reduced} testid="sheet-anywhere" tall>
        <AnywhereSheet />
      </Sheet>
      <Sheet open={u.sheet === 'export'} onClose={close} title="Export" reduced={reduced} testid="sheet-export" tall>
        <ExportSheet />
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
          <span className="block text-[1.25rem] leading-7 text-ink">{l.name}</span>
          <span className="block tnum text-[1rem] leading-[1.375rem] text-ink2">{engravedLine(l)}</span>
          {sub && <span className="block text-[1rem] leading-[1.375rem] text-ink2">{sub}</span>}
        </span>
        <span className={cx('h-7 w-7 rounded-full inline-flex items-center justify-center', on ? 'bg-ink text-onink' : 'border-[1.5px] border-line')}>{on && <IconCheck size={18} />}</span>
      </button>
      {extra}
    </div>
  );
}

/** Goals: named by what you want to do. Each plays its own arc, so there's no frequency to choose. */
function GoalsSheet() {
  const t = useTuck();
  const pick = (id: string) => {
    selectLayer(id);
    ui.set({ sheet: null, chip: null, chipLine: null, chipsOpen: false });
  };
  return (
    <div>
      <p className="text-[1rem] leading-6 text-ink2 mb-2">Pick what you’re about to do. Each one changes on its own as it plays, so there’s nothing to set.</p>
      <div role="radiogroup" aria-label="Goals" className="divide-y divide-line">
        {GOAL_LAYERS.map((l) => {
          const j = journeyOf(l)!;
          return <LayerRow key={l.id} l={l} on={t.layer.id === l.id} sub={j.goodFor} onPick={() => pick(l.id)} />;
        })}
      </div>
      <p className="text-[1rem] leading-[1.375rem] text-ink2 mt-3">The goals describe what you want to do, not what the sound does to you. Tap a goal’s numbers on the layer to see exactly what plays.</p>
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
        {/* Long focus sits with the five, with its honest line: students search for 40 Hz by name. */}
        <LayerRow l={builtInLayer('long-focus')!} on={current === 'long-focus'} sub={builtInLayer('long-focus')!.note} onPick={() => pick('long-focus')} />
      </div>
      <h3 className="text-[1rem] font-bold text-ink2 mt-6 mb-1">Goals</h3>
      <div className="divide-y divide-line">
        {GOAL_LAYERS.map((l) => (
          <LayerRow key={l.id} l={l} on={current === l.id} sub={journeyOf(l)!.goodFor} onPick={() => pick(l.id)} />
        ))}
      </div>
      <h3 className="text-[1rem] font-bold text-ink2 mt-6 mb-1">Your layers</h3>
      {saved.length === 0 ? (
        <p className="text-[1rem] leading-6 text-ink2 py-2">Nothing saved yet. When a layer feels right, tap Save and it stays exactly as it is.</p>
      ) : (
        <div className="divide-y divide-line">
          {saved.map((l) => (
            <LayerRow
              key={l.id}
              l={l}
              on={current === l.id}
              sub={`Saved ${fmt(l.savedAt)}${t.prefs.tooMuchLayerId === l.id ? ' · plays for Too much' : ''}${t.prefs.pinnedLayerId === l.id ? ' · pinned' : ''}`}
              onPick={() => pick(l.id)}
            />
          ))}
        </div>
      )}
      {saved.length > 0 && <p className="text-[1rem] leading-[1.375rem] text-ink2 mt-1">To edit, delete or share a saved layer, tap its numbers on the layer.</p>}
      <h3 className="text-[1rem] font-bold text-ink2 mt-6 mb-1">Noise only</h3>
      <div className="divide-y divide-line">
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
  const current: TimerChoice = active ? (t.s.cycles ? 'cycles' : t.s.timerMin) : t.prefs.timerByLayer[t.layer.id] ?? null;
  const [custom, setCustom] = useState<number>(typeof current === 'number' && !TIMER_OPTIONS.includes(current) ? current : 40);
  const choose = (m: TimerChoice) => {
    store.setPrefs({ timerByLayer: { ...t.prefs.timerByLayer, [t.layer.id]: m } });
    if (active) session.setTimer(m);
    ui.set({ sheet: null });
  };
  const journey = journeyOf(t.layer);
  if (journey) {
    return (
      <div data-testid="timer-journey">
        <p className="text-[1.25rem] leading-7 text-ink tnum">{journeyEndText(journey)}</p>
        <p className="text-[1rem] leading-6 text-ink2 mt-2">
          {t.layer.journey === 'evening-descent'
            ? 'Evening descent has its own arc: 8 Hz easing to 2 Hz over 30 minutes, then 15 quiet minutes, then a 60 second fade to silence. It doesn’t need a timer.'
            : `${t.layer.name} has its own arc. ${journey.plain.slice(journey.plain.indexOf(': ') + 2)} ${journey.minutes === null ? 'Stop it when you wake.' : 'It doesn’t need a timer.'}`}
        </p>
      </div>
    );
  }
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
            <span className="tnum text-[1.25rem] leading-7 text-ink">{m === null ? 'Until I stop' : `${m} min`}</span>
            <RadioMark on={current === m} />
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={current === 'cycles'}
          onClick={() => choose('cycles')}
          data-testid="timer-cycles"
          className="w-full min-h-14 py-2 flex items-center justify-between text-left"
        >
          <span>
            <span className="block tnum text-[1.25rem] leading-7 text-ink">
              Cycles: {CYCLE.workMin} min, then {CYCLE.breakMin} at Quiet
            </span>
            <span className="block text-[1rem] leading-[1.375rem] text-ink2">
              {CYCLE.rounds} rounds. During each break the layer plays at Quiet, and one soft chime brings it back.
            </span>
          </span>
          <RadioMark on={current === 'cycles'} />
        </button>
      </div>
      <div className="mt-5">
        <label htmlFor="custom-timer" className="text-[1rem] font-medium text-ink">
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
      <p className="text-[1rem] leading-[1.375rem] text-ink2 mt-4">
        The layer fades out at the time you pick, over {t.prefs.fadeOutSec} seconds. There’s no countdown. Tuck remembers your choice for {t.layer.name}.
      </p>
    </div>
  );
}

/** The same selected / unselected mark as the layer picker, so every row shows its state. */
function RadioMark({ on }: { on: boolean }) {
  return (
    <span className={cx('h-7 w-7 shrink-0 rounded-full inline-flex items-center justify-center', on ? 'bg-ink text-onink' : 'border-[1.5px] border-edge')} aria-hidden>
      {on && <IconCheck size={18} />}
    </span>
  );
}

function Menu() {
  const go = (page: Parameters<typeof ui.set>[0]['page']) => ui.set({ sheet: null, page });
  const items: { label: string; icon: React.ReactElement; onClick: () => void; testid: string }[] = [
    { label: 'Settings', icon: <IconSettings />, onClick: () => go('settings'), testid: 'menu-settings' },
    { label: 'What we know', icon: <IconPage />, onClick: () => go('science'), testid: 'menu-science' },
    { label: 'How Tuck plays under your audio', icon: <IconMix />, onClick: () => go('mixing'), testid: 'menu-mixing' },
    { label: 'This week', icon: <IconWeek />, onClick: () => go('week'), testid: 'menu-week' },
    { label: 'Blind comparison', icon: <IconAB />, onClick: () => go('blind'), testid: 'menu-blind' },
    { label: 'Start without opening Tuck', icon: <IconBolt />, onClick: () => ui.set({ sheet: 'anywhere' }), testid: 'menu-anywhere' },
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
              <span className="text-[1.0625rem] font-medium">{i.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-[18px] border border-dashed border-line px-4 py-3">
        <p className="text-[1rem] leading-[1.375rem] text-ink2">This is a prototype. Simulate another app playing, headphone states and time from here.</p>
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
  const tooMuchNow = store.findLayer(t.prefs.tooMuchLayerId)?.name ?? 'Steady';
  const [name, setName] = useState(src.kind === 'builtin' ? (src.id === 'focus' ? 'Desk' : `My ${src.name.toLowerCase()}`) : src.name.replace(/, noise only$/, ''));
  // Off by default: saving never changes what Too much plays unless you tick this.
  const [tooMuch, setTooMuch] = useState(false);
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
    if (src.id === 'shared') store.setTransient(null);
    ui.set({ sheet: null, page: 'home', spec: false, draft: null, shared: null, selectedId: preset.id, chip: null, chipLine: null, chipFirst: null });
    ui.toast(`Saved as “${preset.name}”. It won’t change unless you change it.`, 5000);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor="save-name" className="text-[1rem] font-medium text-ink">
        Name
      </label>
      <input
        id="save-name"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        data-testid="save-name"
        className="mt-1 w-full h-14 rounded-[14px] bg-bg px-4 text-[1.0625rem] text-ink border-[1.5px] border-line focus:border-[var(--c-focus)] outline-none"
        autoComplete="off"
      />
      <p className="tnum text-[1rem] text-ink2 mt-2">{engravedLine(src)}</p>
      <label className="mt-4 flex items-start gap-3 min-h-12 cursor-pointer">
        <input type="checkbox" checked={tooMuch} onChange={(e) => setTooMuch(e.target.checked)} className="mt-[3px] h-6 w-6 accent-[var(--c-ink)]" data-testid="save-toomuch" />
        <span className="text-[1rem] leading-6 text-ink">
          Play this when I pick Too much
          <span className="block text-ink2">Too much plays {tooMuchNow} now.</span>
        </span>
      </label>
      {err.length > 0 && (
        <p className="mt-2 rounded-[14px] bg-surface2 px-4 py-3 text-[1rem] text-ink" role="alert">
          {err[0]}
        </p>
      )}
      <Button full type="submit" className="mt-4" data-testid="save-confirm">
        Save
      </Button>
      <p className="text-[1rem] leading-[1.375rem] text-ink2 mt-3">Saved layers are frozen. They won’t change unless you change them, including across updates.</p>
    </form>
  );
}

function DeleteSheet() {
  const t = useTuck();
  const l = store.findLayer(t.u.deleteId);
  if (!l) return null;
  return (
    <div>
      <p className="text-[1rem] leading-6 text-ink">Delete “{l.name}”? This removes it from this phone. Built-in layers aren’t affected.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="quiet" onClick={() => ui.set({ sheet: null })}>
          Keep it
        </Button>
        <Button
          variant="outline"
          data-testid="delete-confirm"
          onClick={() => {
            store.core.dispatch({ type: 'preset/remove', id: l.id });
            if (t.prefs.tooMuchLayerId === l.id) store.setPrefs({ tooMuchLayerId: null });
            if (t.prefs.pinnedLayerId === l.id) store.setPrefs({ pinnedLayerId: null });
            if (t.u.selectedId === l.id) ui.set({ selectedId: 'focus' });
            ui.set({ sheet: null, spec: false });
            ui.toast(`Deleted “${l.name}”.`);
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────── headphones ─────────────────────────────

const HP_FULL: Partial<Record<Headphone, { text: string; actions: ('noise' | 'check' | 'settings' | 'how' | 'ok')[]; how?: string }>> = {
  speaker: { text: 'This is playing through the phone speaker, so both ears hear the same thing and there’s no beat. Noise only still covers the room.', actions: ['ok'] },
  oneEar: { text: 'Only one side is connected. Add the other earbud, or use noise only for now.', actions: ['check', 'ok'] },
  callMode: { text: 'Your headphones are in call mode, which is mono. Tuck is playing noise only and will switch back to binaural when the call ends.', actions: [] },
  mono: {
    text: 'Mono Audio is on in Accessibility settings. It merges left and right, so the beat can’t form.',
    actions: ['settings', 'ok'],
    how: 'On iPhone: Settings, Accessibility, Audio and Visual, Mono Audio. On Android: Settings, Accessibility, Audio adjustment, Mono audio.',
  },
  spatial: {
    text: 'Spatial Audio seems to be on. It blends the two ears together, which hides the beat. You can turn it off in Control Center, or carry on with noise only. Both are fine.',
    actions: ['how', 'noise'],
    how: 'In Control Center, press and hold the volume slider, then turn Spatial Audio off.',
  },
  swapped: { text: 'Your left and right seem swapped. Tuck swaps them back for you, so L 200 still reaches your left ear. The beat is the same either way.', actions: ['ok', 'check'] },
  disconnected: { text: 'No headphones connected, so Start plays noise only. Connect headphones to hear the beat.', actions: [] },
};
/** Only when a session was actually playing: it faded out because the headphones went. */

function HeadphonesSheet() {
  const { u, prefs, s } = useTuck();
  const [showHow, setShowHow] = useState(false);
  const base = HP_FULL[u.headphone];
  // Literal: "faded out" only if something was playing and faded out.
  const c = base && u.headphone === 'disconnected' && s.notice === 'disconnected' ? { ...base, text: HP_DISCONNECTED_MID } : base;
  if (!c) return <p className="text-[1rem] leading-6 text-ink">Stereo headphones are connected. Each ear gets its own tone.</p>;
  const forced = FORCES_NOISE.includes(u.headphone);
  const act = {
    noise: (
      <Button key="noise" variant="quiet" onClick={() => { store.setPrefs({ noiseOnly: true }, { user: true }); ui.set({ sheet: null }); }} data-testid="banner-noise">
        Use noise only
      </Button>
    ),
    ok: (
      <Button
        key="ok"
        variant="quiet"
        data-testid="banner-ok"
        onClick={() => {
          if (u.headphone === 'swapped') store.setPrefs({ swapChannels: true }, { user: true });
          ui.set({ sheet: null });
        }}
      >
        {u.headphone === 'swapped' || forced ? 'OK' : 'Use noise only'}
      </Button>
    ),
    check: (
      <Button key="check" variant="text" onClick={() => ui.set({ sheet: null, onboarding: 'ear', earFrom: 'settings' })} data-testid="banner-check">
        Check again
      </Button>
    ),
    settings: (
      <Button key="settings" variant="text" onClick={() => setShowHow(true)} data-testid="banner-settings">
        Open Settings
      </Button>
    ),
    how: (
      <Button key="how" variant="text" onClick={() => setShowHow(true)} data-testid="banner-how">
        Show me how
      </Button>
    ),
  };
  return (
    <div data-testid={`hp-${u.headphone}`}>
      <p className="text-[1rem] leading-6 text-ink">{c.text}</p>
      {showHow && c.how && <p className="text-[1rem] leading-6 text-ink2 mt-3 rounded-[14px] bg-surface2 px-4 py-3">{c.how}</p>}
      {c.actions.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">{c.actions.map((a) => act[a])}</div>}
      {prefs.swapChannels && u.headphone !== 'swapped' && <p className="text-[1rem] leading-[1.375rem] text-ink2 mt-4">Left and right are swapped for your headphones. Change it in Settings, Sound.</p>}
    </div>
  );
}

// ───────────────────────────── share ─────────────────────────────

function ShareSheet() {
  const t = useTuck();
  const l = store.findLayer(t.u.draftFrom) ?? t.layer;
  const e = ears(l);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState('');
  const text = shareText(l);
  const link = shareLink(l, note);
  return (
    <div data-testid="share-sheet">
      {/* The card people post: exact numbers, no claims. */}
      <figure className="rounded-[22px] bg-bg border border-line overflow-hidden" aria-label={`Layer card: ${text}`}>
        <div className="h-[8px] bg-lining" style={{ opacity: 0.85 }} />
        <div className="px-5 pt-4 pb-5">
          <p className="text-[1rem] text-ink2">{l.name}</p>
          {l.binaural ? (
            <>
              <p className="tnum text-[2.4375rem] leading-[2.75rem] text-ink mt-1">{l.journey ? '8 → 2 Hz' : `${hz(l.beatHz)} Hz`}</p>
              <p className="tnum text-[1rem] mt-1">
                <span style={{ color: 'var(--c-left)' }}>L {hz(e.left)}</span> <span className="text-ink2">/</span> <span style={{ color: 'var(--c-right)' }}>R {hz(e.right)}</span>
                <span className="text-ink2"> · over {l.noise.type === 'off' ? 'no noise' : `${l.noise.type} noise`}</span>
              </p>
            </>
          ) : (
            <p className="tnum text-[2.4375rem] leading-[2.75rem] text-ink mt-1">{l.noise.type} noise</p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <Stitch width={120} stroke={2} mono={!l.binaural} />
            <span className="text-[1rem] text-ink2">Tuck</span>
          </div>
        </div>
      </figure>
      <p className="tnum text-[1rem] leading-6 text-ink mt-4" data-testid="share-text">
        {text}
      </p>
      <p className="text-[1rem] leading-6 text-ink2" data-testid="share-link">
        With a {SHARE_LINK_LABEL} that opens it in Tuck.
      </p>
      <div className="mt-4">
        <label htmlFor="share-note" className="block text-[1rem] font-medium text-ink mb-2">
          A word for them <span className="font-normal text-ink2">(optional)</span>
        </label>
        <input
          id="share-note"
          type="text"
          value={note}
          maxLength={NOTE_MAX}
          placeholder="for reading"
          onChange={(e) => {
            setNote(cleanNote(e.target.value) + (e.target.value.endsWith(' ') ? ' ' : ''));
            setCopied('idle');
          }}
          className="w-full h-12 rounded-[14px] bg-bg px-3 text-[1rem] text-ink border-[1.5px] border-edge placeholder:text-ink2/70"
          data-testid="share-note"
        />
        <p className="text-[1rem] leading-[1.375rem] text-ink2 mt-1">They see it in quotes above the layer. Leave it empty to send the numbers only.</p>
      </div>
      <Button
        full
        className="mt-4"
        data-testid="share-copy"
        onClick={async () => {
          // "Copied" only when the copy really happened; otherwise the text is shown selected to copy by hand.
          const ok = await copyText(`${text} ${link}`, fallbackRef.current);
          setCopied(ok ? 'copied' : 'failed');
        }}
      >
        {copied === 'copied' ? 'Copied' : 'Copy text and link'}
      </Button>
      <div role="status" aria-live="polite" data-testid="share-copy-status">
        {copied === 'failed' && (
          <>
            <p className="text-[1rem] leading-6 text-ink mt-3">Copy didn’t work here. The text is selected below: copy it yourself.</p>
            <label htmlFor="share-fallback" className="sr-only">Text and link to copy</label>
          </>
        )}
      </div>
      <textarea
        id="share-fallback"
        ref={fallbackRef}
        readOnly
        value={`${text} ${link}`}
        rows={3}
        aria-hidden={copied !== 'failed'}
        tabIndex={copied === 'failed' ? 0 : -1}
        onFocus={(e) => e.currentTarget.select()}
        className={cx('w-full rounded-[14px] bg-bg border-[1.5px] border-edge px-3 py-2 text-[0.875rem] leading-5 text-ink resize-none', copied === 'failed' ? 'mt-2' : 'sr-only')}
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        data-testid="share-fallback"
      />
      <p className="text-[1rem] leading-[1.375rem] text-ink2 mt-3">The link opens this exact layer in Tuck. It carries the numbers, and your word if you add one: no name of yours, no account, nothing about how you use it.</p>
    </div>
  );
}

// ───────────────────────────── start without opening ─────────────────────────────

function AnywhereSheet() {
  const t = useTuck();
  const name = store.findLayer(t.prefs.pinnedLayerId)?.name ?? t.layer.name;
  const rows: [string, string][] = [
    ['Control Center or Quick Settings', `Add the Tuck control. One tap starts ${name} under whatever is playing, and a second tap stops it.`],
    ['When your music starts', `In Shortcuts, make an automation: When Spotify (or Podcasts, or YouTube) is opened, Start ${name} under my audio. Run immediately.`],
    ['Ask for it', `“Start ${name} in Tuck.” Siri and Google Assistant run the same action.`],
    ['Lock Screen', 'The Tuck widget starts your pinned layer, or the last one, without unlocking.'],
  ];
  return (
    <div data-testid="anywhere-sheet">
      <p className="text-[1rem] leading-6 text-ink">Starting is the hard part, so Tuck can start itself. Each of these plays your layer under your audio, with your level and timer.</p>
      <dl className="mt-3 divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="py-3">
            <dt className="text-[1rem] font-bold text-ink">{k}</dt>
            <dd className="text-[1rem] leading-6 text-ink mt-1">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[1rem] leading-[1.375rem] text-ink2 mt-2">In this prototype these are described, not wired: phones add them from Settings and the Shortcuts app.</p>
    </div>
  );
}

// ───────────────────────────── export ─────────────────────────────

/**
 * The file itself, always on screen, so an export can never end in nothing. Copy all is the one action;
 * saving a file is offered as a text link with honest wording about what this viewer allows.
 */
function ExportSheet() {
  const { u } = useTuck();
  const f = exportFile();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [retried, setRetried] = useState(false);
  useEffect(() => {
    setCopy('idle');
    setRetried(false);
  }, [f]);
  if (!f) return null;
  const lines = f.body.split('\n').length;
  const kb = new Blob([f.body]).size / 1024;
  const size = kb < 1 ? `${new Blob([f.body]).size} bytes` : `${kb.toFixed(1)} kB`;
  const status =
    u.exportTried === 'sent' && !retried
      ? <>Sent <span className="whitespace-nowrap">{f.name}</span> to your browser’s downloads. It’s also here to copy.</>
      : retried
        ? 'If no file appeared, this viewer blocks downloads. Copy it instead.'
        : u.exportTried === 'framed'
          ? <>This viewer can’t save files, so here is <span className="whitespace-nowrap">{f.name}</span> to copy.</>
          : <>This browser couldn’t save the file, so here is <span className="whitespace-nowrap">{f.name}</span> to copy.</>;
  return (
    <div data-testid="export-sheet">
      <p className="text-[1rem] leading-6 text-ink" role="status" aria-live="polite" data-testid="export-status">
        {status}
      </p>
      <p className="tnum text-[1rem] text-ink2 mt-1">
        {f.what} · <span className="whitespace-nowrap">{f.name}</span> · {lines} line{lines === 1 ? '' : 's'}, {size}
      </p>
      <label htmlFor="export-text" className="sr-only">
        {f.name}
      </label>
      <textarea
        id="export-text"
        ref={ref}
        readOnly
        value={f.body}
        rows={8}
        wrap="off"
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-3 w-full rounded-[14px] bg-bg border-[1.5px] border-edge px-3 py-2 text-[0.875rem] leading-5 text-ink font-mono resize-none"
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', minHeight: '10rem' }}
        data-testid="export-text"
      />
      <Button
        full
        className="mt-3"
        data-testid="export-copy"
        onClick={async () => {
          const ok = await copyText(f.body, ref.current);
          setCopy(ok ? 'copied' : 'failed');
        }}
      >
        {copy === 'copied' ? 'Copied' : 'Copy all'}
      </Button>
      <p className="text-[1rem] leading-[1.375rem] text-ink2 mt-3 min-h-[1.375rem]" role="status" aria-live="polite" data-testid="export-copy-status">
        {copy === 'copied'
          ? <>Copied {lines} line{lines === 1 ? '' : 's'}. Paste it into a file named <span className="whitespace-nowrap">{f.name}</span>.</>
          : copy === 'failed'
            ? 'Copy didn’t work here. The text is selected: copy it yourself.'
            : ''}
      </p>
      {u.exportTried !== 'sent' && !retried && (
        <Button
          variant="text"
          className="mt-1"
          data-testid="export-save"
          onClick={() => {
            tryDownload(f);
            setRetried(true);
            // The status line changed, so the button stops claiming "Copied" (round 4, N8).
            setCopy('idle');
          }}
        >
          {inFrame() ? 'Try saving it as a file anyway' : 'Try saving it again'}
        </Button>
      )}
    </div>
  );
}
