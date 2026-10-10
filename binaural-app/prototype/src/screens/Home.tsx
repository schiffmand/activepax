import type React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { summarizeWeek } from '@core';
import { session, fadesFor } from '../audio/session';
import { CHIPS, copy, durationWords, greetingFor, type ChipId } from '../tuck/copy';
import { describeLayer, ears, hz, INTENT_ORDER, LAYER_HEIGHT, LEVEL_LABEL, LEVELS, builtInLayer, type LevelName } from '../tuck/layers';
import { store } from '../tuck/store';
import { pickChip, selectLayer, startSound, stopSound, useTuck } from '../ui/derived';
import { ui, type Headphone } from '../ui/state';
import { Banner, Button, EASE, Segmented, Stitch, cx } from '../ui/kit';
import { IconAudioAbove, IconCall, IconChevron, IconClose, IconDrift, IconEarbud, IconHeadphones, IconHold, IconInfo, IconMenu, IconQuiet, IconSpeaker } from '../ui/icons';
import { otherApp } from '../audio/otherApp';
import { useOther } from '../ui/state';
import { SpecCard } from './SpecCard';

const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;
const SPEC_TOP = SAFE_TOP + 56;
const RELEASE_TO_STOP_BELOW = 280;

export function Home() {
  const t = useTuck();
  const { s, u, prefs, labels, reduced, layer, binaural } = t;
  const other = useOther();

  // Bluetooth call mode and the other forced states: switch the beat off / back on with a 4 s glide.
  useEffect(() => {
    if (session.isActive() && s.binaural !== binaural) session.setBinaural(binaural);
  }, [binaural, s.binaural, s.phase]);

  // Headphones disconnected mid-session: 1.5 s fade, then the banner.
  useEffect(() => {
    if (u.headphone === 'disconnected' && session.isActive()) session.simulateDisconnect();
  }, [u.headphone]);

  return (
    <div className="absolute inset-0 overflow-hidden" data-testid="screen-home">
      <HomeTop top={<TopBar otherPlaying={other.playing} noteVisible={!prefs.audioNoteDismissed && !u.spec} />} />
      <DetentMarks />
      <LayerPanel key="layer" />
      <span className="sr-only" aria-live="polite">
        {s.phase === 'fadingIn' ? copy.statusFadingIn(labels, s.fadeSec) : s.phase === 'playing' ? copy.statusPlaying(labels) : ''}
      </span>
      <span className="sr-only">{reduced ? 'Still screen on' : ''}</span>
      <span className="hidden">{layer.id}</span>
    </div>
  );
}

function TopBar({ otherPlaying, noteVisible }: { otherPlaying: boolean; noteVisible: boolean }) {
  return (
    <div className="relative z-20 shrink-0">
      <div className="h-14 flex items-center justify-between pl-3 pr-2">
        <button
          type="button"
          data-testid="audio-indicator"
          onClick={() => ui.set({ page: 'mixing' })}
          className="h-12 inline-flex items-center gap-2 rounded-full pl-2 pr-3 text-ink2 hover:text-ink transition-colors"
          aria-label={`${otherPlaying ? 'Your audio keeps playing above' : 'Nothing else playing'}. How Tuck plays under your audio`}
        >
          {otherPlaying ? <IconAudioAbove /> : <IconQuiet />}
          <span className="text-[16px]">{otherPlaying ? 'Your audio keeps playing above' : 'Nothing else playing'}</span>
        </button>
        <button
          type="button"
          data-testid="nav-menu"
          onClick={() => ui.set({ sheet: 'menu' })}
          className="h-12 w-12 inline-flex items-center justify-center rounded-full text-ink hover:bg-surface"
        >
          <IconMenu />
          <span className="sr-only">Menu</span>
        </button>
      </div>
      {noteVisible && (
        <div className="mx-5 mb-2 flex items-start gap-2 text-ink2" data-testid="audio-note">
          <p className="flex-1 text-[16px] leading-[22px]">Your phone doesn’t tell apps what you’re listening to, so we only say whether something is playing.</p>
          <button
            type="button"
            onClick={() => store.setPrefs({ audioNoteDismissed: true })}
            className="h-11 w-11 -mt-[10px] -mr-3 inline-flex items-center justify-center rounded-full hover:text-ink"
            data-testid="audio-note-dismiss"
          >
            <IconClose size={20} />
            <span className="sr-only">Dismiss note</span>
          </button>
        </div>
      )}
    </div>
  );
}

const HP_COPY: Partial<Record<Headphone, { icon: React.ReactElement; text: string; actions: ('noise' | 'check' | 'settings' | 'how' | 'ok')[] }>> = {
  speaker: {
    icon: <IconSpeaker />,
    text: 'This is playing through the phone speaker, so both ears hear the same thing and there’s no beat. Noise only still covers the room.',
    actions: ['ok'],
  },
  oneEar: { icon: <IconEarbud />, text: 'Only one side is connected. Add the other earbud, or use noise only for now.', actions: ['check', 'ok'] },
  callMode: {
    icon: <IconCall />,
    text: 'Your headphones are in call mode, which is mono. Tuck is playing noise only and will switch back to binaural when the call ends.',
    actions: [],
  },
  mono: { icon: <IconHeadphones />, text: 'Mono Audio is on in Accessibility settings. It merges left and right, so the beat can’t form.', actions: ['settings', 'ok'] },
  spatial: {
    icon: <IconHeadphones />,
    text: 'Spatial Audio seems to be on. It blends the two ears together, which hides the beat. You can turn it off in Control Center, or carry on with noise only. Both are fine.',
    actions: ['how', 'noise'],
  },
  swapped: { icon: <IconHeadphones />, text: 'Your left and right seem swapped. Tuck will swap them for you.', actions: ['ok', 'check'] },
  disconnected: { icon: <IconHeadphones />, text: 'Headphones disconnected, so Tuck faded out.', actions: [] },
};

function HeadphoneBanner({ state }: { state: Headphone }) {
  const c = HP_COPY[state];
  const [dismissed, setDismissed] = useState<Headphone | null>(null);
  if (!c || dismissed === state) return null;
  const act = {
    noise: (
      <Button key="noise" variant="text" onClick={() => store.setPrefs({ noiseOnly: true }, { user: true })} data-testid="banner-noise">
        Use noise only
      </Button>
    ),
    ok: (
      <Button
        key="ok"
        variant="text"
        data-testid="banner-ok"
        onClick={() => {
          if (state === 'swapped') store.setPrefs({ swapChannels: true }, { user: true });
          setDismissed(state);
        }}
      >
        {state === 'swapped' ? 'OK' : 'Use noise only'}
      </Button>
    ),
    check: (
      <Button key="check" variant="text" onClick={() => ui.set({ onboarding: 'ear', earFrom: 'settings' })} data-testid="banner-check">
        Check again
      </Button>
    ),
    settings: (
      <Button key="settings" variant="text" onClick={() => ui.toast('On a phone, this opens Settings, Accessibility, Audio.')}>
        Open Settings
      </Button>
    ),
    how: (
      <Button key="how" variant="text" onClick={() => ui.toast('Control Center: press and hold the volume slider, then turn Spatial Audio off.', 6000)}>
        Show me how
      </Button>
    ),
  };
  return (
    <Banner icon={c.icon} testid={`banner-${state}`} actions={c.actions.length ? c.actions.map((a) => act[a]) : undefined}>
      {c.text}
    </Banner>
  );
}

function NoticeBanner() {
  const { s } = useTuck();
  if (!s.notice) return null;
  const text =
    s.notice === 'call'
      ? 'Paused for your call.'
      : s.notice === 'mixing'
        ? 'Another app took over the sound, so your layer stopped. Your audio wasn’t changed.'
        : s.notice === 'blocked'
          ? 'The browser needs one more tap before it can play sound.'
          : null;
  if (!text) return null;
  return (
    <Banner
      icon={s.notice === 'call' ? <IconCall /> : <IconInfo />}
      testid={`notice-${s.notice}`}
      actions={
        <Button variant="text" onClick={() => startSound()}>
          Start sound
        </Button>
      }
    >
      {text}
    </Banner>
  );
}

function HomeTop({ top }: { top: React.ReactNode }) {
  const t = useTuck();
  const { s, u, prefs, labels, layer, st, reduced } = t;
  const playing = s.phase === 'fadingIn' || s.phase === 'playing' || s.phase === 'starting';
  const firstRun = !prefs.firstSessionDone && st.core.history.length === 0;
  const lastId = st.core.lastPlayed?.id;
  const week = useMemo(() => summarizeWeek(st.core.history, Date.now()), [st.core.history]);
  const showWeek = prefs.showWeeklyTotal && week.sessions > 0;
  const greeting = prefs.greeting && labels === 'warm' ? greetingFor(t.hour) : 'Tuck';
  const fadesAt = s.timerMin;

  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: reduced ? 0.6 : 0.2 } };

  let body: React.ReactElement;
  if (playing || (s.phase === 'fadingOut' && !s.ended)) {
    const status =
      s.phase === 'fadingOut' ? copy.statusFadingOut(labels, Math.round(s.fadeSec)) : s.phase === 'playing' ? copy.statusPlaying(labels) : copy.statusFadingIn(labels, Math.round(s.fadeSec));
    body = (
      <motion.div key="playing" {...fade} data-testid="home-playing">
        <p className="voice text-[25px] leading-8 text-ink" data-testid="status-line">
          {status}
        </p>
        <p className="tnum text-[16px] leading-[22px] text-ink2 mt-2" aria-label={fadesAt ? `Time left: ${Math.round((s.remainingSec ?? 0) / 60)} minutes` : undefined}>
          {copy.detail(labels, s.elapsedSec, fadesAt)}
        </p>
        {s.takeFive && <p className="text-[16px] leading-[22px] text-ink mt-3 max-w-[32ch]">{copy.takeFive(labels)}</p>}
        <button type="button" onClick={() => ui.set({ sheet: 'picker' })} className="mt-4 min-h-12 -ml-1 px-1 inline-flex items-center gap-2 text-left" data-testid="layer-name">
          <span className="text-[20px] leading-7 text-ink">{layer.name}</span>
          <span className="tnum text-[16px] text-ink2">{layerHzLabel(layer, s.beatNow, t.binaural)}</span>
          {s.stepLabel && <span className="text-[16px] text-ink2">· {s.stepLabel}</span>}
          <IconChevron size={18} className="text-ink2" />
        </button>
      </motion.div>
    );
  } else if (s.ended) {
    body = (
      <motion.div key="ended" {...fade} data-testid="session-end">
        <p className="voice text-[25px] leading-8 text-ink">{copy.sessionEnd(labels, s.ended.elapsedSec, s.ended.fadeSec).split('. ')[0]}.</p>
        <p className="text-[16px] leading-[22px] text-ink2 mt-2">
          {s.phase === 'fadingOut' ? `Fading out over ${s.ended.fadeSec} seconds.` : `Faded out over ${s.ended.fadeSec} seconds.`}
        </p>
        <div className="mt-4 flex items-center gap-5">
          {s.ended.byTimer && (
            <Button variant="quiet" onClick={() => void session.takeFive(layer)} data-testid="take-five">
              Take 5
            </Button>
          )}
          <Button variant="text" onClick={() => session.dismissEnded()} data-testid="ended-dismiss">
            Done
          </Button>
        </div>
      </motion.div>
    );
  } else if (prefs.askArrival && (firstRun || u.chipsOpen)) {
    const selChip: ChipId | null = u.chip ?? (firstRun && u.selectedId === 'focus' ? 'scattered' : null);
    body = (
      <motion.div key="arrive" {...fade} data-testid="home-arrive">
        {!firstRun && <p className="voice text-[25px] leading-8 text-ink2">{greeting}</p>}
        {firstRun && prefs.greeting && labels === 'warm' && <p className="voice text-[25px] leading-8 text-ink2">{greeting}</p>}
        <h1 className="voice text-[31px] leading-[38px] text-ink mt-1">{copy.homeFirst(labels)}</h1>
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="How are you arriving?">
          {CHIPS.map((c) => (
            <Chip key={c.id} label={c.label} on={selChip === c.id} onClick={() => pickChip(c.id)} testid={`chip-${c.id}`} />
          ))}
        </div>
        <ChipLines
          line={
            u.chipLine ??
            (selChip === 'scattered' && !u.chip
              ? labels === 'plain'
                ? 'Focus: 14 Hz beat, brown noise.'
                : 'That’s Focus: a 14 Hz beat over soft brown noise.'
              : labels === 'plain'
                ? `${layer.name}: ${describeLayer(layer, 'plain')}`
                : `That’s ${layer.name}: ${describeLayer(layer, 'warm')}.`)
          }
          first={u.chipFirst}
        />
      </motion.div>
    );
  } else if (prefs.askArrival) {
    body = (
      <motion.div key="same" {...fade} data-testid="home-same">
        <p className="voice text-[25px] leading-8 text-ink2">{greeting}</p>
        <h1 className="voice text-[31px] leading-[38px] text-ink mt-1">{u.chip ? (labels === 'plain' ? 'Layer ready.' : 'Start when you’re ready.') : copy.homeSame(labels)}</h1>
        <button type="button" onClick={() => ui.set({ sheet: 'picker' })} className="mt-2 min-h-12 -ml-1 px-1 inline-flex items-center gap-2" data-testid="layer-name">
          <span className="text-[20px] leading-7 text-ink">{layer.name}</span>
          <span className="tnum text-[16px] text-ink2">{layerHzLabel(layer, null, t.binaural)}</span>
          <IconChevron size={18} className="text-ink2" />
        </button>
        {u.chipLine && <ChipLines line={u.chipLine} first={u.chipFirst} />}
        <div className="-ml-1">
          <Button variant="text" onClick={() => ui.set({ chipsOpen: true })} data-testid="arriving-differently">
            Arriving differently?
          </Button>
        </div>
      </motion.div>
    );
  } else {
    body = (
      <motion.div key="intents" {...fade} data-testid="home-intents">
        <p className="voice text-[25px] leading-8 text-ink2">{greeting}</p>
        <p className="mt-2 text-[20px] leading-7 text-ink">
          <span className="font-bold">{lastId ? 'Last layer:' : 'Layer:'}</span> {layer.name}{' '}
          <span className="tnum text-[16px] text-ink2">· {layerHzLabel(layer, null, t.binaural)}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Layers">
          {INTENT_ORDER.map((id) => {
            const l = builtInLayer(id)!;
            return <Chip key={id} label={id === 'sleep' ? 'Sleep' : l.name} on={layer.id === id} onClick={() => selectLayer(id)} testid={`intent-${id}`} />;
          })}
        </div>
        <div className="-ml-1 mt-1">
          <Button variant="text" onClick={() => ui.set({ sheet: 'picker' })} data-testid="more-layers">
            More layers
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="absolute left-0 right-0 flex flex-col" style={{ top: SAFE_TOP, bottom: SAFE_BOTTOM + (playing ? LAYER_HEIGHT[s.level] : LAYER_HEIGHT.idle) + 12, transition: 'bottom 1.4s cubic-bezier(.22,.8,.3,1)' }}>
      {top}
      <div className="px-5 flex-1 min-h-0 flex flex-col overflow-y-auto scrollbar-none pb-2 [mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]" data-testid="home-top">
      <div className="flex flex-col gap-2 empty:hidden mt-2">
        {u.headphone !== 'stereoOk' && u.headphone !== 'unknown' && <HeadphoneBanner state={u.headphone} />}
        <NoticeBanner />
      </div>
      <div className={cx('relative', (u.headphone !== 'stereoOk' || s.notice) && 'mt-4')}>
        <AnimatePresence mode="wait" initial={false}>
          {body}
        </AnimatePresence>
      </div>
      {showWeek && !playing && !u.chipsOpen && !s.ended && (
        <button type="button" className="mt-auto text-left text-[16px] leading-[22px] text-ink2 min-h-11 hover:text-ink" onClick={() => ui.set({ page: 'week' })} data-testid="weekly-total">
          {copy.weekly(labels, durationWords(week.totalSec), week.sessions)}
        </button>
      )}
      </div>
    </div>
  );
}

/** While playing, three quiet marks at the right edge show where the top edge sits for Quiet, Medium and Full. */
function DetentMarks() {
  const { s, reduced, prefs } = useTuck();
  const show = s.phase === 'fadingIn' || s.phase === 'playing';
  return (
    <AnimatePresence>
      {show && !ui.get().spec && (
        <motion.div
          className="absolute right-0 left-0 bottom-0 pointer-events-none z-[5]"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: reduced ? 0.6 : 0.4, delay: reduced ? 0 : 1.2 } }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          {LEVELS.map((l) => {
            const over = LEVELS.indexOf(l) > LEVELS.indexOf(prefs.levelCeiling);
            return (
              <div key={l} className="absolute right-5 flex items-center gap-2" style={{ bottom: SAFE_BOTTOM + LAYER_HEIGHT[l] + 6 }}>
                <span className={cx('text-[16px] leading-none', s.level === l ? 'text-ink' : 'text-ink2', over && 'opacity-60')}>{LEVEL_LABEL[l]}</span>
                <span className={cx('block h-[1.5px] w-4 rounded', s.level === l ? 'bg-ink' : 'bg-ink2')} />
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function layerHzLabel(l: ReturnType<typeof useTuck>['layer'], beatNow: number | null, binaural: boolean) {
  if (!binaural) return `Noise only`;
  if (l.journey) return beatNow ? `${hz(beatNow)} Hz` : '8 → 2 Hz';
  return `${hz(l.beatHz)} Hz`;
}

function ChipLines({ line, first }: { line: string | null; first: string | null }) {
  return (
    <div className="mt-3 min-h-[22px]" aria-live="polite">
      {line && <p className="text-[16px] leading-[22px] text-ink">{line}</p>}
      {first && <p className="text-[16px] leading-[22px] text-ink2 mt-1">{first}</p>}
    </div>
  );
}

function Chip({ label, on, onClick, testid }: { label: string; on: boolean; onClick: () => void; testid?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      data-testid={testid}
      className={cx(
        'h-11 px-4 rounded-full text-[16px] font-medium border-[1.5px] transition-colors duration-200',
        on ? 'bg-ink text-onink border-ink' : 'border-line text-ink hover:border-ink2',
      )}
    >
      {label}
    </button>
  );
}

// ───────────────────────────── the layer ─────────────────────────────

function LayerPanel() {
  const t = useTuck();
  const { s, prefs, labels, reduced, layer, binaural, u } = t;
  const active = s.phase === 'starting' || s.phase === 'fadingIn' || s.phase === 'playing';
  const level = active ? s.level : prefs.lastLevel;
  const restH = active ? LAYER_HEIGHT[s.level] : LAYER_HEIGHT.idle;
  const [drag, setDrag] = useState<{ startY: number; startH: number; h: number } | null>(null);
  const animRef = useRef(0);
  const snapRef = useRef(false);
  const prevPhase = useRef(s.phase);
  const prevLevel = useRef(s.level);
  // Motion and sound are one event: rise in 1.4 s on start, sink in 2 s on stop, 1.2 s level glide, 140 ms detent snap.
  if (prevPhase.current !== s.phase) {
    const p = prevPhase.current;
    if ((p === 'idle' || p === 'fadingOut') && (s.phase === 'starting' || s.phase === 'fadingIn')) animRef.current = 1400;
    else if (s.phase === 'fadingOut' || s.phase === 'idle') animRef.current = 2000;
    prevPhase.current = s.phase;
  } else if (prevLevel.current !== s.level) {
    animRef.current = snapRef.current ? 140 : 1200;
    snapRef.current = false;
  }
  prevLevel.current = s.level;
  const anim = animRef.current;
  const setAnim = (ms: number) => {
    animRef.current = ms;
  };

  const height = drag ? drag.h : restH;
  const transition = drag || reduced ? 'none' : `height ${u.spec ? 360 : anim}ms cubic-bezier(.22,.8,.3,1)`;

  // Lining brightness follows the audio fade exactly (not movement, so it stays under Still screen).
  const liningTarget = s.phase === 'fadingIn' || s.phase === 'playing' || s.phase === 'starting' ? 1 : 0.45;
  const liningDur = s.phase === 'fadingIn' || s.phase === 'fadingOut' || s.phase === 'starting' ? s.fadeSec : 0.2;

  const ceilingIdx = LEVELS.indexOf(prefs.levelCeiling);
  const locked = LEVELS.filter((_, i) => i > ceilingIdx);

  const onPointerDown = (e: React.PointerEvent) => {
    if (u.spec) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ startY: e.clientY, startH: restH, h: restH });
  };
  const scale = () => {
    const frame = document.querySelector('[data-phone]') as HTMLElement | null;
    return frame ? frame.getBoundingClientRect().height / 844 : 1;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const dy = (drag.startY - e.clientY) / scale();
    const maxH = active ? LAYER_HEIGHT[prefs.levelCeiling] + 24 : LAYER_HEIGHT.quiet + 60;
    setDrag({ ...drag, h: Math.max(220, Math.min(maxH, drag.startH + dy)) });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const h = drag.h;
    const moved = Math.abs(h - drag.startH) > 6;
    setDrag(null);
    setAnim(140);
    snapRef.current = true;
    if (!moved) return;
    if (!active) {
      if (h > LAYER_HEIGHT.idle + 36) {
        setAnim(1400);
        startSound();
      }
      return;
    }
    if (h < RELEASE_TO_STOP_BELOW) {
      setAnim(2000);
      stopSound();
      return;
    }
    let best: LevelName = 'quiet';
    for (const l of LEVELS) if (Math.abs(LAYER_HEIGHT[l] - h) < Math.abs(LAYER_HEIGHT[best] - h)) best = l;
    if (LEVELS.indexOf(best) > ceilingIdx) best = prefs.levelCeiling;
    session.setLevel(best);
  };

  const releasing = drag && active && drag.h < RELEASE_TO_STOP_BELOW;
  const pullingToStart = drag && !active && drag.h > LAYER_HEIGHT.idle + 36;

  const onHandleKey = (e: React.KeyboardEvent) => {
    if (!active) {
      if (e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startSound();
      }
      return;
    }
    const i = LEVELS.indexOf(s.level);
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (i < ceilingIdx) session.setLevel(LEVELS[i + 1]!);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (i > 0) session.setLevel(LEVELS[i - 1]!);
    }
  };

  const e = ears(layer);
  const e2 = binaural ? e : null;

  return (
    <div className="absolute left-0 right-0 bottom-0 top-0 z-10 flex flex-col justify-end pointer-events-none [&>*]:pointer-events-auto" style={{ perspective: 1400 }}>
      <motion.div
        className={cx(
          'relative rounded-t-[28px] bg-surface twill text-ink shadow-[0_-10px_40px_rgba(0,0,0,.18)]',
          prefs.breathingLayer && !reduced && t.theme !== 'dim' && s.phase === 'playing' && !u.spec && !drag && ['calm', 'unwind', 'sleep'].includes(layer.intent) && 'breathing',
        )}
        style={{ height: u.spec ? `calc(100% - ${SPEC_TOP}px)` : height + SAFE_BOTTOM, transition, transformStyle: 'preserve-3d' }}
        animate={reduced ? { rotateY: 0 } : { rotateY: u.spec ? [90, 0] : 0 }}
        transition={{ duration: reduced ? 0 : 0.18, ease: EASE }}
        data-testid="layer"
        data-level={active ? s.level : 'idle'}
      >
        {/* Lining strip: the turned-down top edge. Brightness = the audio fade. */}
        <div className="absolute inset-x-0 top-0 h-[10px] rounded-t-[28px] overflow-hidden" aria-hidden>
          <div
            className="h-full bg-lining"
            style={{ opacity: `calc(${liningTarget} * var(--lining-max))`, transition: `opacity ${liningDur}s linear` }}
            data-testid="lining"
          />
        </div>
        <div className="absolute inset-x-0 top-[10px] h-px bg-fold opacity-60" aria-hidden />

        <AnimatePresence mode="wait" initial={false}>
          {u.spec ? (
            <motion.div key="back" className="absolute inset-x-0 top-[11px] bottom-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.6 : 0.12 }}>
              <SpecCard
                layer={layer}
                level={level}
                ceiling={prefs.levelCeiling}
                motion={t.motion}
                timerMin={active ? s.timerMin : prefs.timerByLayer[layer.id] ?? null}
                binaural={binaural}
                onDone={() => ui.set({ spec: false })}
                onEditCopy={() => ui.set({ spec: false, page: 'editor', draftFrom: layer.id })}
                onSave={() => ui.set({ sheet: 'save', draftFrom: layer.id, draft: null })}
                onNoiseOnly={() => selectLayer(layer.binaural ? `${layer.id}~noise` : layer.id.replace(/~noise$/, ''))}
                onScience={() => ui.set({ spec: false, page: 'science' })}
              />
            </motion.div>
          ) : (
            <motion.div key="front" className="absolute inset-x-0 top-[11px] bottom-0 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.6 : 0.12 }}>
              {/* Grab handle: the layer's top edge. Hit area: full width × 48. */}
              <div
                role={active ? 'slider' : 'button'}
                tabIndex={0}
                aria-label={active ? 'Level' : 'Start sound. Or pull the top edge up.'}
                aria-valuemin={active ? 0 : undefined}
                aria-valuemax={active ? 2 : undefined}
                aria-valuenow={active ? LEVELS.indexOf(s.level) : undefined}
                aria-valuetext={active ? `Level, ${LEVEL_LABEL[s.level]}` : undefined}
                data-testid="layer-handle"
                className="h-12 shrink-0 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={onHandleKey}
              >
                <span className="block h-[5px] w-10 rounded-full bg-ink2" aria-hidden />
              </div>
              <div className="flex justify-center -mt-1" aria-hidden>
                <Stitch width={300} stroke={2} mono={!binaural} />
              </div>

              <div className="flex-1 min-h-0 flex items-center justify-center px-5">
                <AnimatePresence>
                  {(releasing || pullingToStart) && (
                    <motion.p className="text-[16px] text-ink2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {releasing ? copy.releaseHint(labels) : labels === 'plain' ? 'Let go to start.' : 'Let go to start sound.'}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <div className="px-5 flex flex-col gap-2" style={{ paddingBottom: SAFE_BOTTOM + 12 }}>
                <div className="flex items-center justify-between gap-2 -mx-1">
                  <button
                    type="button"
                    onClick={() => ui.set({ spec: true })}
                    className="min-h-12 px-1 inline-flex items-center gap-1 tnum text-[16px] text-ink2 hover:text-ink rounded-[10px]"
                    data-testid="readout"
                    aria-label={binaural ? `${hz(layer.beatHz)} hertz beat, left ${hz(e.left)}, right ${hz(e.right)}. Show the spec card.` : `Noise only, ${layer.noise.type}. Show the spec card.`}
                  >
                    {e2 ? (
                      <>
                        <span>{layer.journey && s.beatNow ? hz(s.beatNow) : hz(layer.beatHz)} Hz</span>
                        <span aria-hidden className="mx-1">
                          ·
                        </span>
                        <span style={{ color: 'var(--c-left)' }}>L {hz(e.left)}</span>
                        <span aria-hidden className="mx-[2px]">
                          /
                        </span>
                        <span style={{ color: 'var(--c-right)' }}>R {hz(e.right)}</span>
                      </>
                    ) : (
                      <span>
                        Noise only · {layer.noise.type} {Math.round(layer.noise.volume * 100)}%
                      </span>
                    )}
                    <IconChevron size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => ui.set({ sheet: 'timer' })}
                    className="min-h-12 px-1 inline-flex items-center gap-1 tnum text-[16px] text-ink2 hover:text-ink rounded-[10px]"
                    data-testid="timer-chip"
                  >
                    {timerText(active ? s.timerMin : prefs.timerByLayer[layer.id] ?? null)}
                    <IconChevron size={18} />
                  </button>
                </div>

                {active ? (
                  <>
                    <Segmented
                      label="Level"
                      testid="level"
                      value={s.level}
                      locked={prefs.ceilingLocked ? locked : locked}
                      onChange={(v) => session.setLevel(v)}
                      options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
                    />
                    <Segmented
                      label="Motion"
                      testid="motion"
                      value={t.motion}
                      locked={layer.motionLocked ? ['drift'] : layer.journey ? ['drift'] : []}
                      onChange={(v) => {
                        session.setMotion(v);
                        store.setPrefs({ lastMotion: { ...prefs.lastMotion, [layer.id]: v } });
                      }}
                      options={[
                        { value: 'drift', label: 'Drift', icon: <IconDrift size={20} /> },
                        { value: 'hold', label: 'Hold', icon: <IconHold size={20} /> },
                      ]}
                    />
                    <Button variant="outline" full onClick={stopSound} data-testid="stop" className="mt-1">
                      Stop
                    </Button>
                  </>
                ) : (
                  <>
                    {!prefs.hintDone && (
                      <p className="text-[16px] leading-[22px] text-ink2 text-center" data-testid="pull-hint">
                        Pull the top edge up, or tap Start sound.
                      </p>
                    )}
                    <Button full onClick={startSound} data-testid="start" className="mt-1">
                      Start sound
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function timerText(min: number | null) {
  return min === null ? 'No timer' : `${min} min`;
}

export { otherApp, fadesFor };
