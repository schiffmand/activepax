import type React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { summarizeWeek } from '@core';
import { CYCLE, localDate, session, fadesFor } from '../audio/session';
import { CHIPS, chipForLayer, copy, durationWords, greetingFor, playsLine, type ChipId } from '../tuck/copy';
import { ears, hz, INTENT_ORDER, LAYER_HEIGHT, LEVEL_LABEL, LEVELS, builtInLayer, wanders, type Layer, type LevelName } from '../tuck/layers';
import { store, type TimerChoice } from '../tuck/store';
import { pickChip, selectLayer, startSound, stopSound, useTuck } from '../ui/derived';
import { ui, type Headphone } from '../ui/state';
import { Banner, Button, EASE, Segmented, Stitch, cx } from '../ui/kit';
import {
  IconAudioAbove,
  IconCall,
  IconChevron,
  IconClose,
  IconDrift,
  IconEarbud,
  IconHeadphones,
  IconHold,
  IconInfo,
  IconMenu,
  IconQuiet,
  IconSpeaker,
  IconSwap,
  IconUp,
  IconVary,
} from '../ui/icons';
import { otherApp } from '../audio/otherApp';
import { useOther } from '../ui/state';
import { SpecCard } from './SpecCard';

const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;
const SPEC_TOP = SAFE_TOP + 56;
const RELEASE_TO_STOP_BELOW = 280;
/** How far past its resting height the idle layer must be pulled to start. */
const PULL_TO_START = 36;
/** The idle layer's height: shorter when the top content would otherwise be cut off. */
const IDLE_COMPACT = 244;
const idleHeight = (compact: boolean) => (compact ? IDLE_COMPACT : LAYER_HEIGHT.idle);

export function Home() {
  const t = useTuck();
  const { s, u, prefs, labels, reduced, layer, binaural } = t;
  const other = useOther();

  // Bluetooth call mode and the other forced states: switch the beat off / back on with a 4 s glide.
  useEffect(() => {
    if (session.isActive() && !s.blind && s.binaural !== binaural) session.setBinaural(binaural);
  }, [binaural, s.binaural, s.phase, s.blind]);

  // Headphones disconnected mid-session: 1.5 s fade, then the notice.
  useEffect(() => {
    if (u.headphone === 'disconnected' && session.isActive()) session.simulateDisconnect();
  }, [u.headphone]);

  const idle = s.phase === 'idle' || (s.phase === 'fadingOut' && !!s.ended);
  const noteVisible = !prefs.audioNoteDismissed && !u.spec && !t.sensory && idle && !s.ended;

  return (
    <div className="absolute inset-0 overflow-hidden" data-testid="screen-home">
      <HomeTop top={<TopBar otherPlaying={other.playing} noteVisible={noteVisible} />} />
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
        <div className="mx-5 mb-3 flex items-start gap-2 text-ink2" data-testid="audio-note">
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

/** Headphone states, one line each. The full sentence and its fix live in the Headphones sheet. */
export const HP_PILL: Partial<Record<Headphone, { icon: React.ReactElement; text: string }>> = {
  speaker: { icon: <IconSpeaker size={20} />, text: 'Phone speaker, so noise only' },
  oneEar: { icon: <IconEarbud size={20} />, text: 'One earbud, so noise only' },
  callMode: { icon: <IconCall size={20} />, text: 'Call mode is mono, so noise only' },
  mono: { icon: <IconHeadphones size={20} />, text: 'Mono Audio is on, so noise only' },
  spatial: { icon: <IconHeadphones size={20} />, text: 'Spatial Audio may hide the beat' },
  swapped: { icon: <IconSwap size={20} />, text: 'Left and right swapped back for you' },
  disconnected: { icon: <IconHeadphones size={20} />, text: 'Headphones disconnected' },
};

function HeadphonePill({ state }: { state: Headphone }) {
  const c = HP_PILL[state];
  if (!c) return null;
  return (
    <button
      type="button"
      onClick={() => ui.set({ sheet: 'headphones' })}
      data-testid={`banner-${state}`}
      className="self-start max-w-full min-h-11 rounded-full bg-surface2 pl-3 pr-2 inline-flex items-center gap-2 text-left text-ink"
    >
      <span className="text-ink2 shrink-0">{c.icon}</span>
      <span className="text-[16px] leading-[20px] truncate">{c.text}</span>
      <IconChevron size={18} className="text-ink2 shrink-0" />
    </button>
  );
}

function NoticeBanner() {
  const { s } = useTuck();
  if (!s.notice || s.notice === 'disconnected') return null;
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

export function timerText(choice: TimerChoice, l: Layer): string {
  if (l.journey) return 'Ends after 45 min';
  if (choice === 'cycles') return `Cycles ${CYCLE.workMin} + ${CYCLE.breakMin}`;
  return choice === null ? 'No timer' : `${choice} min`;
}

function HomeTop({ top }: { top: React.ReactNode }) {
  const t = useTuck();
  const { s, u, prefs, labels, layer, st, reduced, binaural } = t;
  const playing = s.phase === 'fadingIn' || s.phase === 'playing' || s.phase === 'starting';
  const firstRun = !prefs.firstSessionDone && st.core.history.length === 0;
  const lastId = st.core.lastPlayed?.id;
  const week = useMemo(() => summarizeWeek(st.core.history, Date.now()), [st.core.history]);
  const showWeek = prefs.showWeeklyTotal && week.sessions > 0;
  const greet = greetingFor(t.hour);
  const greeting = prefs.greeting && labels === 'warm' && greet ? greet : 'Tuck';
  const pinned = prefs.pinnedLayerId ? store.findLayer(prefs.pinnedLayerId) : undefined;
  const sleepAsk = useSleepAsk();

  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: reduced ? 0.6 : 0.2 } };
  const plainStatus = labels === 'plain';

  let body: React.ReactElement;
  if (playing || (s.phase === 'fadingOut' && !s.ended)) {
    const status =
      s.phase === 'fadingOut' ? copy.statusFadingOut(labels, Math.round(s.fadeSec)) : s.phase === 'playing' ? copy.statusPlaying(labels) : copy.statusFadingIn(labels, Math.round(s.fadeSec));
    body = (
      <motion.div key="playing" {...fade} data-testid="home-playing">
        <p className={plainStatus ? 'text-[20px] leading-7 font-medium text-ink' : 'voice text-[25px] leading-8 text-ink'} data-testid="status-line">
          {status}
        </p>
        <button type="button" onClick={() => ui.set({ sheet: 'picker' })} className="mt-2 min-h-12 -ml-1 px-1 inline-flex items-center gap-2 text-left" data-testid="layer-name">
          <span className="text-[20px] leading-7 text-ink">{s.blind ? `Blind comparison · layer ${s.blind}` : layer.name}</span>
          {!s.blind && <span className="tnum text-[16px] text-ink2">{layerHzLabel(layer, s.beatNow, binaural)}</span>}
          {s.stepLabel && !s.blind && <span className="text-[16px] text-ink2">· {s.stepLabel}</span>}
          <IconChevron size={18} className="text-ink2" />
        </button>
        {!s.blind && (layer.variant || layer.note) && <p className="text-[16px] leading-[22px] text-ink2 max-w-[34ch]">{layer.variant ? `Vary: ${layer.variant}.` : layer.note}</p>}
      </motion.div>
    );
  } else if (s.ended) {
    body = <SessionEnd key="ended" fade={fade} />;
  } else if (u.shared) {
    const sh = u.shared;
    body = (
      <motion.div key="shared" {...fade} data-testid="home-shared">
        <p className="voice text-[25px] leading-8 text-ink2">Someone shared a layer.</p>
        <h1 className="voice text-[31px] leading-[38px] text-ink mt-1">{sh.name}</h1>
        <p className="tnum text-[16px] leading-6 text-ink mt-2">{playsLine(sh, sh.binaural, labels)}</p>
        <div className="mt-3 flex flex-wrap gap-x-5 -ml-1">
          <Button variant="text" onClick={() => ui.set({ sheet: 'save', draft: sh, draftFrom: sh.id })} data-testid="shared-save">
            Save it
          </Button>
          <Button variant="text" onClick={() => ui.set({ shared: null })} data-testid="shared-dismiss">
            Not now
          </Button>
        </div>
      </motion.div>
    );
  } else if (sleepAsk) {
    body = <SleepNoteAsk key="sleep" fade={fade} night={sleepAsk.night} layerName={sleepAsk.layerName} />;
  } else if (pinned) {
    body = (
      <motion.div key="pinned" {...fade} data-testid="home-pinned">
        <p className={plainStatus ? 'text-[20px] leading-7 font-medium text-ink2' : 'voice text-[25px] leading-8 text-ink2'}>{greeting}</p>
        <h1 className="voice text-[31px] leading-[38px] text-ink mt-1">{labels === 'plain' ? 'Your layer:' : 'Your layer is ready.'}</h1>
        <p className="mt-2 text-[20px] leading-7 text-ink">
          {pinned.name} <span className="tnum text-[16px] text-ink2">· {layerHzLabel(pinned, null, binaural)}</span>
        </p>
        <p className="text-[16px] leading-[22px] text-ink2 mt-1">Pinned. It plays exactly as saved. Change it in Settings.</p>
      </motion.div>
    );
  } else if (prefs.askArrival && (firstRun || u.chipsOpen)) {
    const selChip: ChipId | null = u.chip ?? chipForLayer(layer.id);
    body = (
      <motion.div key="arrive" {...fade} data-testid="home-arrive">
        {(!firstRun || (prefs.greeting && labels === 'warm')) && <p className="voice text-[25px] leading-8 text-ink2">{greeting}</p>}
        <h1 className="voice text-[31px] leading-[38px] text-ink mt-1">{copy.homeFirst(labels)}</h1>
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="How are you arriving?">
          {CHIPS.map((c) => (
            <Chip key={c.id} label={c.label} on={selChip === c.id} onClick={() => pickChip(c.id)} testid={`chip-${c.id}`} />
          ))}
        </div>
        <ChipLines line={u.chip && u.chipLine && binaural ? u.chipLine : playsLine(layer, binaural, labels)} first={u.chipFirst} />
      </motion.div>
    );
  } else if (prefs.askArrival) {
    body = (
      <motion.div key="same" {...fade} data-testid="home-same">
        <p className="voice text-[25px] leading-8 text-ink2">{greeting}</p>
        <h1 className="voice text-[31px] leading-[38px] text-ink mt-1">{u.chip ? (labels === 'plain' ? 'Layer ready.' : 'Start when you’re ready.') : copy.homeSame(labels)}</h1>
        <button type="button" onClick={() => ui.set({ sheet: 'picker' })} className="mt-2 min-h-12 -ml-1 px-1 inline-flex items-center gap-2" data-testid="layer-name">
          <span className="text-[20px] leading-7 text-ink">{layer.name}</span>
          <span className="tnum text-[16px] text-ink2">{layerHzLabel(layer, null, binaural)}</span>
          <IconChevron size={18} className="text-ink2" />
        </button>
        {u.chipLine && <ChipLines line={binaural ? u.chipLine : playsLine(layer, binaural, labels)} first={u.chipFirst} />}
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
        <p className={plainStatus ? 'text-[20px] leading-7 font-medium text-ink2' : 'voice text-[25px] leading-8 text-ink2'}>{greeting}</p>
        <p className="mt-2 text-[20px] leading-7 text-ink">
          <span className="font-bold">{lastId ? 'Last layer:' : 'Layer:'}</span> {layer.name}{' '}
          <span className="tnum text-[16px] text-ink2">· {layerHzLabel(layer, null, binaural)}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Layers">
          {INTENT_ORDER.map((id) => {
            const l = builtInLayer(id)!;
            return <Chip key={id} label={id === 'sleep' ? 'Sleep' : l.name} on={layer.id.replace(/~noise$/, '') === id} onClick={() => selectLayer(id)} testid={`intent-${id}`} />;
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

  const pill = u.headphone !== 'stereoOk' && u.headphone !== 'unknown' && !(u.headphone === 'disconnected' && !s.notice && !playing);
  const notice = !!s.notice && s.notice !== 'disconnected';

  // Nothing on Home is ever cut off under the layer: if the idle content needs more room, the idle layer
  // sits lower (it keeps the pull affordance, the readout and Start sound).
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      if (playingRef.current) return;
      const compact = ui.get().compactIdle;
      const over = el.scrollHeight - el.clientHeight;
      if (!compact && over > 2) ui.set({ compactIdle: true });
      else if (compact && over < -(LAYER_HEIGHT.idle - IDLE_COMPACT) - 4) ui.set({ compactIdle: false });
    };
    check();
    // The body swaps in after an exit animation, so measure on every size change, not only on render.
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (bodyRef.current) ro.observe(bodyRef.current);
    return () => ro.disconnect();
  });

  return (
    <div
      className="absolute left-0 right-0 flex flex-col"
      style={{ top: SAFE_TOP, bottom: SAFE_BOTTOM + (playing ? LAYER_HEIGHT[s.level] : idleHeight(u.compactIdle)) + 12, transition: reduced ? 'none' : 'bottom 1.4s cubic-bezier(.22,.8,.3,1)' }}
    >
      {top}
      <div ref={scrollRef} className="px-5 flex-1 min-h-0 flex flex-col overflow-y-auto scrollbar-none pb-2" data-testid="home-top">
        {(pill || notice) && (
          <div className="flex flex-col gap-2 mt-1 mb-3">
            {pill && <HeadphonePill state={u.headphone} />}
            {notice && <NoticeBanner />}
          </div>
        )}
        <div className="relative" ref={bodyRef}>
          <AnimatePresence mode="wait" initial={false}>
            {body}
          </AnimatePresence>
        </div>
        {showWeek && !playing && !u.chipsOpen && !s.ended && !u.chipFirst && (
          <button type="button" className="mt-auto pt-2 text-left text-[16px] leading-[22px] text-ink2 min-h-11 hover:text-ink" onClick={() => ui.set({ page: 'week' })} data-testid="weekly-total">
            {copy.weekly(labels, durationWords(week.totalSec), week.sessions)}
            {prefs.sampleWeek && <span className="text-ink"> Sample data.</span>}
          </button>
        )}
      </div>
    </div>
  );
}

/** The morning after an evening session, if the private log is on: one tap, kept on this phone. */
function useSleepAsk(): { night: string; layerName: string } | null {
  const { prefs, hour, u } = useTuck();
  if (!prefs.logOn || !prefs.lastNight) return null;
  if (hour < 4 || hour >= 12) return null;
  const today = localDate(new Date());
  if (prefs.lastNight.night >= today && u.hourOverride === null) return null;
  if (prefs.sleepNotes.some((n) => n.night === prefs.lastNight!.night)) return null;
  return prefs.lastNight;
}

function SleepNoteAsk({ fade, night, layerName }: { fade: object; night: string; layerName: string }) {
  const { prefs, labels } = useTuck();
  const save = (rating: 0 | 1 | 2 | 3) => store.setPrefs({ sleepNotes: [...prefs.sleepNotes, { night, layerName, rating, at: Date.now() }] });
  return (
    <motion.div {...fade} data-testid="sleep-ask">
      <p className="voice text-[25px] leading-8 text-ink2">{labels === 'plain' ? 'Sleep note' : 'Morning.'}</p>
      <h1 className="voice text-[31px] leading-[38px] text-ink mt-1">How did you sleep?</h1>
      <p className="text-[16px] leading-[22px] text-ink2 mt-1">Last night: {layerName}. One tap, kept on this phone.</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="How did you sleep?">
        <Chip label="Well" on={false} onClick={() => save(3)} testid="sleep-3" />
        <Chip label="OK" on={false} onClick={() => save(2)} testid="sleep-2" />
        <Chip label="Poorly" on={false} onClick={() => save(1)} testid="sleep-1" />
      </div>
      <div className="-ml-1 mt-1">
        <Button variant="text" onClick={() => save(0)} data-testid="sleep-skip">
          Skip
        </Button>
      </div>
    </motion.div>
  );
}

function SessionEnd({ fade }: { fade: object }) {
  const { s, prefs, labels, layer } = useTuck();
  // Keep the last ending while this view animates out (s.ended is already null then).
  const last = useRef(s.ended);
  if (s.ended) last.current = s.ended;
  const e = last.current;
  if (!e) return null;
  const asks = (prefs.logOn || !!e.blind) && e.elapsedSec >= 60 && !e.noted;
  const showTip = !prefs.startTipSeen && !asks;
  const rate = (rating: 1 | 2 | 3) => {
    store.setPrefs({
      notes: [
        ...prefs.notes,
        { at: e.at, layerId: e.layerId, layerName: e.blind ? `Layer ${e.blind}` : e.layerName, beatHz: e.blind ? null : e.beatHz, noise: e.noise, minutes: Math.floor(e.elapsedSec / 60), rating, blind: e.blind ?? undefined },
      ],
    });
    session.markNoted();
  };
  return (
    <motion.div {...fade} data-testid="session-end">
      <p className={labels === 'plain' ? 'text-[20px] leading-7 font-medium text-ink' : 'voice text-[25px] leading-8 text-ink'}>{copy.sessionEnd(labels, e.elapsedSec, e.fadeSec).split('. ')[0]}.</p>
      <p className="text-[16px] leading-[22px] text-ink2 mt-1">
        {s.phase === 'fadingOut' ? `Fading out over ${e.fadeSec} seconds.` : `Faded out over ${e.fadeSec} seconds.`}
        {e.noted && ' Noted.'}
      </p>
      {asks && (
        <div className="mt-3">
          <p className="text-[16px] leading-[22px] text-ink">{e.blind ? `How was layer ${e.blind}?` : 'How was that?'}</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="How was that?">
            <Chip label="Good" on={false} onClick={() => rate(3)} testid="rate-3" />
            <Chip label="Same as usual" on={false} onClick={() => rate(2)} testid="rate-2" />
            <Chip label="Not for me" on={false} onClick={() => rate(1)} testid="rate-1" />
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        {e.byTimer && (
          <Button variant="quiet" onClick={() => void session.takeFive(layer)} data-testid="take-five">
            Take 5
          </Button>
        )}
        <Button variant="text" onClick={() => session.dismissEnded()} data-testid="ended-dismiss">
          Done
        </Button>
        {showTip && (
          <Button
            variant="text"
            onClick={() => {
              store.setPrefs({ startTipSeen: true });
              session.dismissEnded();
              ui.set({ sheet: 'anywhere' });
            }}
            data-testid="start-tip"
          >
            Start it without opening Tuck
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function layerHzLabel(l: Layer, beatNow: number | null, binaural: boolean) {
  if (!binaural || !l.binaural) return `Noise only`;
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
        on ? 'bg-ink text-onink border-ink' : 'border-edge text-ink hover:bg-surface',
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
  const idleH = idleHeight(u.compactIdle);
  const restH = active ? LAYER_HEIGHT[s.level] : idleH;
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

  // How far the idle layer has been pulled towards starting (0..1): the ritual's progress.
  const pull = drag && !active ? Math.max(0, Math.min(1, (drag.h - idleH) / PULL_TO_START)) : 0;
  // Lining brightness follows the audio fade exactly (it's not movement, so it stays under Still screen).
  // While pulling, it brightens with the pull, so the hand sees the sound coming.
  const liningTarget = active ? 1 : 0.45 + pull * 0.4;
  const liningDur = drag ? 0 : s.phase === 'fadingIn' || s.phase === 'fadingOut' || s.phase === 'starting' ? s.fadeSec : 0.2;
  // The fade runs in dB, so the lining follows an ease-in curve (slow start, fuller finish), as the sound does.
  const liningEase = s.phase === 'fadingIn' || s.phase === 'starting' ? 'cubic-bezier(.55,0,.85,.55)' : s.phase === 'fadingOut' ? 'cubic-bezier(.15,.45,.45,1)' : 'linear';

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
    const maxH = active ? LAYER_HEIGHT[prefs.levelCeiling] + 24 : idleH + PULL_TO_START + 40;
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
      if (h > idleH + PULL_TO_START) {
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

  const releasing = !!drag && active && drag.h < RELEASE_TO_STOP_BELOW;

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
  const blindNow = active ? s.blind : null;
  const showEars = binaural && !blindNow;
  const timerChoice: TimerChoice = active ? (s.cycles ? 'cycles' : s.timerMin) : prefs.timerByLayer[layer.id] ?? null;

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
        {/* Lining strip: the turned-down top edge. Brightness = the audio fade (and the pull). */}
        <div className="absolute inset-x-0 top-0 h-[10px] rounded-t-[28px] overflow-hidden" aria-hidden>
          <div
            className="h-full bg-lining"
            style={{ opacity: `calc(${liningTarget} * var(--lining-max))`, transition: `opacity ${liningDur}s ${liningEase}` }}
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
                timer={timerChoice}
                binaural={binaural}
                blind={blindNow}
                onDone={() => ui.set({ spec: false })}
                onEditCopy={() => ui.set({ spec: false, page: 'editor', draftFrom: layer.id })}
                onSave={() => ui.set({ sheet: 'save', draftFrom: layer.id, draft: null })}
                onNoiseOnly={() => selectLayer(layer.binaural ? `${layer.id}~noise` : layer.id.replace(/~noise$/, ''))}
                onScience={(anchor) => ui.set({ spec: false, page: 'science', anchor })}
                onShare={() => ui.set({ sheet: 'share', draftFrom: layer.id })}
                onDelete={() => ui.set({ sheet: 'delete', deleteId: layer.id })}
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

              <Felt active={active} pull={pull} releasing={releasing} pulling={!!drag && !active} />

              <div className="px-5 flex flex-col gap-2" style={{ paddingBottom: SAFE_BOTTOM + 12 }}>
                <div className="flex items-center justify-between gap-2 -mx-1">
                  <button
                    type="button"
                    onClick={() => ui.set({ spec: true })}
                    className="min-h-12 px-1 inline-flex items-center gap-1 tnum text-[16px] text-ink2 hover:text-ink rounded-[10px] min-w-0"
                    data-testid="readout"
                    aria-label={
                      blindNow
                        ? `Blind comparison, layer ${blindNow}. The numbers stay hidden until the end. Show the spec card.`
                        : showEars
                          ? `${hz(layer.beatHz)} hertz beat, left ${hz(e.left)}, right ${hz(e.right)}${prefs.swapChannels ? ', channels swapped for your headphones' : ''}. Show the spec card.`
                          : `Noise only, ${layer.noise.type}. Show the spec card.`
                    }
                  >
                    {blindNow ? (
                      <span>Layer {blindNow} · numbers hidden</span>
                    ) : showEars ? (
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
                        {prefs.swapChannels && <IconSwap size={18} className="ml-1 text-ink2" data-testid="readout-swapped" />}
                      </>
                    ) : (
                      <span className="truncate">
                        Noise only · {layer.noise.type} {Math.round(layer.noise.volume * 100)}%
                      </span>
                    )}
                    <IconChevron size={18} className="shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => ui.set({ sheet: 'timer' })}
                    className="min-h-12 px-1 inline-flex items-center gap-1 tnum text-[16px] text-ink2 hover:text-ink rounded-[10px] shrink-0"
                    data-testid="timer-chip"
                  >
                    {timerText(timerChoice, layer)}
                    <IconChevron size={18} />
                  </button>
                </div>

                {active ? (
                  <>
                    <Segmented
                      label="Level"
                      testid="level"
                      value={s.level}
                      locked={locked}
                      lockedNote={`unavailable, ceiling is ${LEVEL_LABEL[prefs.levelCeiling]}`}
                      onChange={(v) => session.setLevel(v)}
                      options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
                    />
                    <Segmented
                      label="Motion"
                      testid="motion"
                      value={t.motion}
                      locked={layer.motionLocked || layer.journey ? ['drift', 'vary'] : []}
                      lockedNote={layer.journey ? 'unavailable, Evening descent follows its own arc' : 'unavailable, Steady never changes'}
                      onChange={(v) => {
                        session.setMotion(v);
                        store.setPrefs({ lastMotion: { ...prefs.lastMotion, [layer.id.replace(/~noise$/, '')]: v } });
                      }}
                      options={[
                        { value: 'drift', label: 'Drift', icon: <IconDrift size={20} /> },
                        { value: 'vary', label: 'Vary', icon: <IconVary size={20} /> },
                        { value: 'hold', label: 'Hold', icon: <IconHold size={20} /> },
                      ]}
                    />
                    <Button variant="outline" full onClick={stopSound} data-testid="stop" className="mt-1">
                      Stop
                    </Button>
                  </>
                ) : (
                  <Button full onClick={() => startSound()} data-testid="start" className="mt-1">
                    Start sound
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/**
 * The felt between the stitch and the controls. Playing: the stitch (its gap is the beat, and it moves
 * only when Drift moves the beat), the time with you, and the timer. Idle: the pull-up affordance.
 * A toast, when there is one, sits here too, so it never covers live text.
 */
function Felt({ active, pull, releasing, pulling }: { active: boolean; pull: number; releasing: boolean; pulling: boolean }) {
  const t = useTuck();
  const { s, u, prefs, labels, layer, binaural, reduced, sensory } = t;
  const fadeT = { duration: reduced ? 0.6 : 0.25 };
  const ceilingLocked = LEVELS.indexOf(prefs.levelCeiling) < LEVELS.length - 1;

  // The stitch gap reads the beat: wider for a faster beat, and it glides with Drift (never pulses).
  const beat = s.beatNow ?? layer.beatHz;
  const driftGap = active && wanders(s.motion) && !reduced && !sensory ? s.driftOffset * 6 : 0;
  const gap = binaural && !s.blind ? Math.round(10 + Math.min(40, beat) * 0.9 + driftGap) : 18;
  const meet = !active && pull > 0 ? pull : 0;

  let main: React.ReactNode;
  if (u.toast) {
    main = (
      <motion.p key={`toast-${u.toast}`} className="text-[16px] leading-[22px] text-ink text-center max-w-[32ch]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeT} data-testid="toast" role="status">
        {u.toast}
      </motion.p>
    );
  } else if (releasing) {
    main = (
      <motion.p key="release" className="text-[16px] text-ink2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        {copy.releaseHint(labels)}
      </motion.p>
    );
  } else if (active) {
    const timer = s.cycles
      ? `Round ${s.cycles.round} of ${s.cycles.of} · ${s.cycles.phase === 'work' ? `break at Quiet after ${CYCLE.workMin} min` : `break, back to ${LEVEL_LABEL[s.cycles.workLevel]} after ${CYCLE.breakMin} min`}`
      : s.takeFive
        ? copy.takeFive(labels)
        : layer.journey
          ? null
          : s.timerMin === null
            ? null
            : `Fades out at ${s.timerMin} min`;
    const big = s.elapsedSec < 60 ? (labels === 'plain' ? 'Under a minute' : 'Just started') : durationWords(Math.floor(s.elapsedSec / 60) * 60);
    main = (
      <motion.div key="focal" className="felt-focal text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeT} data-testid="felt-playing">
        <p className="felt-big tnum text-[39px] leading-[44px] text-ink" data-testid="elapsed">
          {big}
        </p>
        {timer && <p className="felt-big tnum text-[16px] leading-[22px] text-ink2 mt-1">{timer}</p>}
        <p className="felt-compact tnum text-[16px] leading-[22px] text-ink2">
          {copy.elapsed(labels, s.elapsedSec)}
          {timer ? ` · ${timer}` : ''}
        </p>
        {ceilingLocked && <p className="felt-note text-[16px] leading-[22px] text-ink2 mt-1">Ceiling: {LEVEL_LABEL[prefs.levelCeiling]}. Change it in Settings.</p>}
      </motion.div>
    );
  } else {
    main = (
      <motion.div key="idle" className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeT} data-testid="pull-affordance">
        <span className="felt-chev flex justify-center text-ink2" aria-hidden style={{ transform: reduced ? undefined : `translateY(${-pull * 6}px)`, opacity: 0.55 + pull * 0.45 }}>
          <IconUp size={22} />
        </span>
        <p className="text-[16px] leading-[22px] text-ink2 mt-1" data-testid="pull-hint">
          {pulling && pull >= 1
            ? labels === 'plain'
              ? 'Let go to start.'
              : 'Let go to start sound.'
            : !prefs.hintDone
              ? 'Pull the top edge up, or tap Start sound.'
              : labels === 'plain'
                ? 'Pull up to start.'
                : 'Pull up, or tap Start sound.'}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="felt flex-1 min-h-0 flex flex-col items-center justify-center px-5 overflow-hidden">
      <div className="shrink-0 mb-2" aria-hidden>
        <Stitch width={300} stroke={2} mono={!binaural || !!s.blind} gap={gap} meet={meet >= 1} meetAmount={meet} reduced={reduced} glideMs={active ? 60_000 : 0} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {main}
      </AnimatePresence>
    </div>
  );
}

export { otherApp, fadesFor };
