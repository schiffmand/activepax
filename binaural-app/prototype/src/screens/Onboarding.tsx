import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { interpretStereoCheck, runStereoCheck, type Ear, type StereoCheckAnswer, type StereoCheckHandle } from '@core';
import { ensureRunning, getContext } from '../audio/hub';
import { store } from '../tuck/store';
import { ui } from '../ui/state';
import { Button, EASE, Mark, Stitch, cx } from '../ui/kit';
import { IconCheck } from '../ui/icons';
import { startSound } from '../ui/derived';

export function Intro({ reduced }: { reduced: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col px-5 pt-[47px] pb-[34px]" data-testid="screen-intro">
      <div className="pt-10">
        <Mark size={64} />
      </div>
      <h1 className="voice text-[31px] leading-[38px] text-ink mt-8">Your audio stays on top.</h1>
      <p className="text-[16px] leading-6 text-ink mt-4 max-w-[34ch]">
        Tuck plays a soft layer of tones and noise under your podcast, music or videos. It never pauses them.
      </p>

      {/* Static two-band diagram: your audio above, Tuck below. Nothing moves on launch. */}
      <figure className="mt-8 rounded-[22px] overflow-hidden border border-line" aria-label="Your audio sits on top. Tuck sits underneath.">
        <div className="bg-bg h-[92px] px-4 flex items-center justify-between">
          <span className="text-[16px] text-ink2">Your audio</span>
          <span className="flex flex-col gap-[7px] items-end" aria-hidden>
            <span className="block h-[3px] w-16 rounded bg-ink2/55" />
            <span className="block h-[3px] w-10 rounded bg-ink2/55" />
          </span>
        </div>
        <div className="relative bg-surface h-[92px] twill">
          <div className="h-[10px] bg-lining" style={{ opacity: 0.85 }} />
          <div className="h-px bg-fold opacity-70" />
          <div className="px-4 pt-4 flex items-center justify-between">
            <span className="text-[16px] font-medium text-ink">Tuck</span>
            <Stitch width={120} stroke={2.5} />
          </div>
        </div>
      </figure>

      <div className="mt-auto flex flex-col items-stretch gap-2">
        <Button full data-testid="onboard-check" onClick={() => ui.set({ onboarding: 'ear', earFrom: 'onboarding' })}>
          Check my headphones
        </Button>
        <Button
          variant="text"
          className="self-center"
          data-testid="onboard-skip"
          onClick={() => {
            store.setPrefs({ noiseOnly: true });
            store.core.dispatch({ type: 'settings/update', patch: { onboarded: true } });
            ui.set({ onboarding: null });
            ui.toast('Noise only for now. You can run the ear check any time in Settings.');
          }}
        >
          Skip, use noise only for now
        </Button>
      </div>
      <span className="sr-only">{reduced ? 'Still screen is on.' : ''}</span>
    </div>
  );
}

type Heard = StereoCheckAnswer['heard'];
type EarState = { status: 'idle' | 'playing' | 'asking' | 'done'; heard?: Heard };
type Verdict = 'ok' | 'swapped' | 'mono' | 'spatial' | 'one-ear' | 'unsure' | null;

const heardText = (played: Ear, h: Heard) => {
  if (h === played) return played === 'left' ? 'Left heard' : 'Right heard';
  if (h === 'both') return 'Heard in both';
  if (h === 'none') return 'Not heard';
  return h === 'left' ? 'Heard on the left' : 'Heard on the right';
};

export function EarCheck({ reduced }: { reduced: boolean }) {
  const from = ui.get().earFrom;
  const [left, setLeft] = useState<EarState>({ status: 'idle' });
  const [right, setRight] = useState<EarState>({ status: 'idle' });
  const [asking, setAsking] = useState<Ear | null>(null);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [blocked, setBlocked] = useState(false);
  const handle = useRef<StereoCheckHandle | null>(null);
  const rightBtn = useRef<HTMLButtonElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => handle.current?.cancel(), []);
  useEffect(() => {
    if (asking) setTimeout(() => answerRef.current?.querySelector('button')?.focus(), 50);
  }, [asking]);
  useEffect(() => {
    if (verdict) setTimeout(() => resultRef.current?.querySelector('button')?.focus(), 80);
  }, [verdict]);

  const play = async (ear: Ear) => {
    handle.current?.cancel();
    setVerdict(null);
    const set = ear === 'left' ? setLeft : setRight;
    const ok = await ensureRunning();
    if (!ok) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    set({ status: 'playing' });
    setAsking(null);
    try {
      // Core's stereo check, one ear at a time: 1.5 s, 200 Hz left / 214 Hz right, 300 ms ramps.
      const h = await runStereoCheck(getContext(), {
        sequence: [ear],
        frequencyHz: ear === 'left' ? 200 : 214,
        toneSec: 1.5,
        edgeSec: 0.3,
        leadInSec: 0.05,
        gapSec: 0,
        volume: 0.55,
      });
      handle.current = h;
      const r = await h.done;
      if (r.cancelled) return;
    } catch {
      setBlocked(true);
      set({ status: 'idle' });
      return;
    }
    set((s) => ({ ...s, status: 'asking' }));
    setAsking(ear);
  };

  const answer = (ear: Ear, heard: Heard) => {
    const st: EarState = { status: 'done', heard };
    const l = ear === 'left' ? st : left;
    const r = ear === 'right' ? st : right;
    if (ear === 'left') setLeft(st);
    else setRight(st);
    setAsking(null);
    if (l.status === 'done' && r.status === 'done') {
      const res = interpretStereoCheck([
        { played: 'left', heard: l.heard! },
        { played: 'right', heard: r.heard! },
      ]);
      store.core.dispatch({ type: 'settings/update', patch: { headphoneCheck: { verdict: res.verdict, at: Date.now() } } });
      setVerdict(res.verdict);
      if (res.verdict === 'swapped') store.setPrefs({ swapChannels: true });
      if (res.verdict === 'ok') store.setPrefs({ noiseOnly: false });
      if (res.verdict === 'unsure') {
        setTimeout(() => {
          setLeft({ status: 'idle' });
          setRight({ status: 'idle' });
        }, 0);
      }
    } else if (ear === 'left') setTimeout(() => rightBtn.current?.focus(), 50);
  };

  const reset = () => {
    setLeft({ status: 'idle' });
    setRight({ status: 'idle' });
    setVerdict(null);
    setAsking(null);
  };

  const finish = (opts: { noiseOnly?: boolean; start?: boolean }) => {
    if (opts.noiseOnly) store.setPrefs({ noiseOnly: true });
    store.core.dispatch({ type: 'settings/update', patch: { onboarded: true } });
    ui.set({ onboarding: null });
    if (opts.start) startSound();
  };

  const leftLit = left.status === 'playing' ? 'lit' : left.status === 'done' && left.heard === 'left' ? 'lit' : left.status === 'idle' && right.status === 'idle' ? 'on' : left.status === 'done' ? 'on' : 'dim';
  const rightLit = right.status === 'playing' ? 'lit' : right.status === 'done' && right.heard === 'right' ? 'lit' : right.status === 'idle' && left.status === 'idle' ? 'on' : right.status === 'done' ? 'on' : 'dim';
  const meet = verdict === 'ok';
  const mono = verdict === 'mono';

  return (
    <div className="absolute inset-0 flex flex-col px-5 pt-[47px] pb-[34px]" data-testid="screen-earcheck">
      <div className="h-14 flex items-center">
        {from === 'settings' && (
          <Button variant="text" className="no-underline -ml-1" onClick={() => ui.set({ onboarding: null })} data-testid="ear-close">
            Close
          </Button>
        )}
      </div>
      <h1 className="voice text-[31px] leading-[38px] text-ink mt-4">{meet ? 'Stereo confirmed.' : 'Quick ear check.'}</h1>
      <p className="text-[16px] leading-6 text-ink mt-3 max-w-[36ch]">
        {meet
          ? 'Each ear hears its own tone. Your brain hears the difference between them as a slow beat.'
          : 'The beat only forms when each ear gets its own tone, so it needs stereo headphones.'}
      </p>

      <div className="mt-12 mb-10 flex justify-center" aria-hidden>
        <Stitch width={240} stroke={4} left={mono ? 'on' : (leftLit as 'on')} right={mono ? 'on' : (rightLit as 'on')} mono={mono} meet={meet} reduced={reduced} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <EarButton ear="left" state={left} onPlay={() => play('left')} disabled={left.status === 'playing' || right.status === 'playing'} />
        <EarButton ear="right" state={right} onPlay={() => play('right')} disabled={left.status === 'playing' || right.status === 'playing'} refEl={rightBtn} />
      </div>

      <div className="mt-6 min-h-[132px]" aria-live="polite">
        <AnimatePresence mode="wait">
          {asking && (
            <motion.div
              key={`ask-${asking}`}
              ref={answerRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-[16px] leading-6 text-ink">{asking === 'left' ? 'A low tone, on the left. Where did you hear it?' : 'A low tone, on the right. Where did you hear it?'}</p>
              <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Where did you hear it?">
                {(
                  [
                    ['left', 'Left'],
                    ['right', 'Right'],
                    ['both', 'Both'],
                    ['none', 'Neither'],
                  ] as [Heard, string][]
                ).map(([h, label]) => (
                  <Button key={h} variant="quiet" className="px-0" data-testid={`ear-answer-${h}`} onClick={() => answer(asking, h)}>
                    {label}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}
          {!asking && verdict && (
            <motion.div key={`v-${verdict}`} ref={resultRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} data-testid={`ear-verdict-${verdict}`}>
              <VerdictBlock verdict={verdict} setVerdict={setVerdict} reset={reset} finish={finish} from={from} />
            </motion.div>
          )}
          {blocked && !asking && !verdict && (
            <motion.p key="blocked" className="text-[16px] leading-6 text-ink2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              The browser didn’t let sound start. Tap Play left again.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-auto flex flex-col items-stretch gap-2">
        {verdict === 'ok' && (
          <Button full data-testid="ear-start" onClick={() => finish({ start: true })}>
            Start sound
          </Button>
        )}
        {verdict !== 'ok' && (
          <Button variant="text" className="self-center" data-testid="ear-skip" onClick={() => finish({ noiseOnly: true })}>
            Skip, use noise only
          </Button>
        )}
      </div>
    </div>
  );
}

function EarButton({ ear, state, onPlay, disabled, refEl }: { ear: Ear; state: EarState; onPlay: () => void; disabled: boolean; refEl?: React.Ref<HTMLButtonElement> }) {
  const color = ear === 'left' ? 'var(--c-left)' : 'var(--c-right)';
  const label = ear === 'left' ? 'Play left' : 'Play right';
  const heardOk = state.status === 'done' && state.heard === ear;
  return (
    <div className="flex flex-col items-stretch">
      <button
        ref={refEl}
        type="button"
        onClick={onPlay}
        disabled={disabled}
        data-testid={`ear-play-${ear}`}
        className={cx(
          'h-14 rounded-[18px] border-[1.5px] text-[17px] font-bold inline-flex items-center justify-center gap-2 transition-colors duration-200',
          state.status === 'playing' ? 'bg-surface2' : 'hover:bg-surface',
          'disabled:cursor-default',
        )}
        style={{ borderColor: color, color: 'var(--c-ink)' }}
        aria-describedby={`ear-state-${ear}`}
      >
        <span aria-hidden className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: color }} />
        {state.status === 'playing' ? (ear === 'left' ? 'Playing left' : 'Playing right') : label}
      </button>
      <p id={`ear-state-${ear}`} className="mt-2 h-6 text-[16px] leading-6 text-center tnum" style={{ color: state.status === 'done' ? 'var(--c-ink)' : 'var(--c-ink2)' }}>
        {state.status === 'done' ? (
          <span className="inline-flex items-center gap-1">
            {heardOk && <IconCheck size={18} style={{ color }} />}
            {heardText(ear, state.heard!)}
          </span>
        ) : state.status === 'idle' ? (
          ear === 'left' ? 'L · 200 Hz' : 'R · 214 Hz'
        ) : (
          ''
        )}
      </p>
    </div>
  );
}

function VerdictBlock({
  verdict,
  setVerdict,
  reset,
  finish,
  from,
}: {
  verdict: Exclude<Verdict, null>;
  setVerdict: (v: Verdict) => void;
  reset: () => void;
  finish: (o: { noiseOnly?: boolean; start?: boolean }) => void;
  from: 'onboarding' | 'settings';
}) {
  const p = 'text-[16px] leading-6 text-ink';
  switch (verdict) {
    case 'ok':
      return (
        <div className="flex flex-col gap-2">
          <p className={p}>That gap in the stitch is where the beat lives.</p>
          {from === 'settings' && (
            <Button variant="text" className="self-start" onClick={() => ui.set({ onboarding: null })}>
              Done
            </Button>
          )}
        </div>
      );
    case 'swapped':
      return (
        <div>
          <p className={p}>Your left and right seem swapped. Tuck will swap them for you.</p>
          <div className="mt-2 flex gap-4">
            <Button variant="quiet" onClick={() => (from === 'settings' ? ui.set({ onboarding: null }) : finish({ start: true }))}>
              OK
            </Button>
            <Button variant="text" onClick={reset}>
              Check again
            </Button>
          </div>
        </div>
      );
    case 'mono':
      return (
        <div>
          <p className={p}>Mono Audio is on in Accessibility settings. It merges left and right, so the beat can’t form.</p>
          <div className="mt-2 flex flex-wrap gap-x-4">
            <Button variant="quiet" onClick={() => ui.toast('On a phone, this opens Settings, Accessibility, Audio.')}>
              Open Settings
            </Button>
            <Button variant="text" onClick={() => finish({ noiseOnly: true })}>
              Use noise only
            </Button>
            <Button variant="text" onClick={() => setVerdict('spatial')}>
              Mono Audio is off
            </Button>
          </div>
        </div>
      );
    case 'spatial':
      return (
        <div>
          <p className={p}>
            Spatial Audio seems to be on. It blends the two ears together, which hides the beat. You can turn it off in Control Center, or carry on with noise only. Both are fine.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4">
            <Button variant="quiet" onClick={() => ui.toast('Control Center: press and hold the volume slider, then turn Spatial Audio off.', 6000)}>
              Show me how
            </Button>
            <Button variant="text" onClick={() => finish({ noiseOnly: true })}>
              Use noise only
            </Button>
          </div>
        </div>
      );
    case 'one-ear':
      return (
        <div>
          <p className={p}>Only one side is connected. Add the other earbud, or use noise only for now.</p>
          <div className="mt-2 flex gap-4">
            <Button variant="quiet" onClick={reset}>
              Check again
            </Button>
            <Button variant="text" onClick={() => finish({ noiseOnly: true })}>
              Use noise only
            </Button>
          </div>
        </div>
      );
    case 'unsure':
      return <p className={p}>No problem. Let’s try that once more.</p>;
  }
}

export const _ease = EASE;
