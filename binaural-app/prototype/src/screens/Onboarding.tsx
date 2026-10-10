import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { interpretStereoCheck, runStereoCheck, type Ear, type StereoCheckAnswer, type StereoCheckHandle } from '@core';
import { ensureRunning, getContext } from '../audio/hub';
import { store } from '../tuck/store';
import { ui } from '../ui/state';
import { Button, EASE, Mark, Stitch, cx } from '../ui/kit';
import { IconCheck } from '../ui/icons';
import { startSound } from '../ui/derived';

/** Set by the intro's button so the ear check plays its first tone straight away (one tap to first sound). */
let playLeftOnArrival = false;

export function Intro({ reduced }: { reduced: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col px-5 pt-[47px] pb-[34px]" data-testid="screen-intro">
      <div className="pt-6">
        <Mark size={56} />
      </div>
      <h1 className="voice text-[1.9375rem] leading-[2.375rem] text-ink mt-6">Your audio stays on top.</h1>
      <p className="text-[1rem] leading-6 text-ink mt-4 max-w-[34ch]">
        Tuck plays a soft layer of tones and noise under your podcast, music or videos. It never pauses them.
      </p>
      {/* What Background Sounds doesn't do: say it once, plainly. */}
      <p className="mt-3 text-[1rem] leading-6 text-ink2 max-w-[34ch]" data-testid="intro-why">
        Binaural beats with exact numbers, or noise only, for focus, calm and sleep, with timers that fade out.
      </p>

      {/* Static two-band diagram: your audio above, Tuck below. Nothing moves on launch. */}
      <figure className="mt-6 rounded-[22px] overflow-hidden border border-line" aria-label="Your audio sits on top. Tuck sits underneath.">
        <div className="bg-bg h-[92px] px-4 flex items-center justify-between">
          <span className="text-[1rem] text-ink2">Your audio</span>
          <span className="flex flex-col gap-[7px] items-end" aria-hidden>
            <span className="block h-[3px] w-16 rounded bg-ink2/55" />
            <span className="block h-[3px] w-10 rounded bg-ink2/55" />
          </span>
        </div>
        <div className="relative bg-surface h-[92px] twill">
          <div className="h-[10px] bg-lining" />
          <div className="h-px bg-fold opacity-70" />
          <div className="px-4 pt-4 flex items-center justify-between">
            <span className="text-[1rem] font-medium text-ink">Tuck</span>
            <Stitch width={120} stroke={2.5} />
          </div>
        </div>
      </figure>

      <div className="mt-auto flex flex-col items-stretch gap-2">
        <Button
          full
          data-testid="onboard-check"
          onClick={() => {
            // Wake the audio inside this tap, so the first tone can play the moment the ear check appears.
            void ensureRunning();
            playLeftOnArrival = true;
            ui.set({ onboarding: 'ear', earFrom: 'onboarding' });
          }}
        >
          Check my headphones
        </Button>
        <p className="text-[1rem] leading-[1.375rem] text-ink2 text-center">Put your headphones on. A soft tone plays on the left.</p>
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
type Verdict = 'ok' | 'swapped' | 'mono' | 'spatial' | 'one-ear' | 'unsure' | 'none-left' | 'none-right' | null;

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
  // The first sound the app ever makes: about −24 dBFS (volume 0.355² × 0.5). "Louder" after "Neither": about −19 dBFS.
  const [louder, setLouder] = useState(false);
  const handle = useRef<StereoCheckHandle | null>(null);
  const rightBtn = useRef<HTMLButtonElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => handle.current?.cancel(), []);
  useEffect(() => {
    if (!playLeftOnArrival) return;
    const id = setTimeout(() => {
      if (!playLeftOnArrival) return;
      playLeftOnArrival = false;
      void play('left');
    }, 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (asking) setTimeout(() => answerRef.current?.querySelector('button')?.focus(), 50);
  }, [asking]);
  useEffect(() => {
    if (verdict) setTimeout(() => resultRef.current?.querySelector('button')?.focus(), 80);
  }, [verdict]);

  const play = async (ear: Ear, loud: boolean = louder) => {
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
      // It renders straight to the context's destination, deliberately bypassing the L/R swap router:
      // the check tests the hardware as worn, so a swap from an earlier check can't hide a new one.
      const h = await runStereoCheck(getContext(), {
        sequence: [ear],
        frequencyHz: ear === 'left' ? 200 : 214,
        toneSec: 1.5,
        edgeSec: 0.3,
        leadInSec: 0.05,
        gapSec: 0,
        volume: loud ? 0.47 : 0.355,
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
    // "Neither" on a single side gets its guidance straight away, with a fix (not just "Not heard").
    if (heard === 'none') {
      if (ear === 'left') setLeft(st);
      else setRight(st);
      setAsking(null);
      setVerdict(ear === 'left' ? 'none-left' : 'none-right');
      return;
    }
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
      // A pass clears a swap from an earlier check (the readout must stay true); a swap sets it.
      if (res.verdict === 'swapped') store.setPrefs({ swapChannels: true });
      if (res.verdict === 'ok') store.setPrefs({ noiseOnly: false, swapChannels: false });
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
      <h1 className="voice text-[1.9375rem] leading-[2.375rem] text-ink mt-4">{meet ? 'Stereo confirmed.' : 'Quick ear check.'}</h1>
      <p className="text-[1rem] leading-6 text-ink mt-3 max-w-[36ch]">
        {meet
          ? 'Each ear hears its own tone. Your brain hears the difference between them as a slow beat.'
          : 'The beat only forms when each ear gets its own tone, so it needs stereo headphones.'}
      </p>

      {/* The stitch is the diagram: it takes the free space, so the block sits centred instead of leaving the
          bottom half empty (round 3, product designer). */}
      <div className="flex-1 min-h-[88px] max-h-[230px] my-4 flex items-center justify-center" aria-hidden>
        <Stitch width={320} stroke={5} left={mono ? 'on' : (leftLit as 'on')} right={mono ? 'on' : (rightLit as 'on')} mono={mono} meet={meet} reduced={reduced} />
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
              <p className="text-[1rem] leading-6 text-ink">{asking === 'left' ? 'A low tone, on the left. Where did you hear it?' : 'A low tone, on the right. Where did you hear it?'}</p>
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
              <VerdictBlock
                verdict={verdict}
                setVerdict={setVerdict}
                reset={reset}
                finish={finish}
                from={from}
                louder={louder}
                onLouder={() => {
                  setLouder(true);
                  const ear = verdict === 'none-right' ? 'right' : 'left';
                  (ear === 'left' ? setLeft : setRight)({ status: 'idle' });
                  setVerdict(null);
                  void play(ear, true);
                }}
                onRetry={() => {
                  const ear = verdict === 'none-right' ? 'right' : 'left';
                  (ear === 'left' ? setLeft : setRight)({ status: 'idle' });
                  setVerdict(null);
                  void play(ear);
                }}
              />
            </motion.div>
          )}
          {blocked && !asking && !verdict && (
            <motion.p key="blocked" className="text-[1rem] leading-6 text-ink2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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
        {/* First run: a way past the check. From the Menu or Settings (already set up, Close is top left), there is
            nothing to skip; only after a verdict that isn't OK does it offer the mode change, named as one (round 4, N9). */}
        {verdict !== 'ok' && (from === 'onboarding' || verdict) && (
          <Button variant="text" className="self-center" data-testid="ear-skip" onClick={() => finish({ noiseOnly: true })}>
            {from === 'onboarding' ? 'Skip, use noise only' : 'Use noise only'}
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
          'h-14 rounded-[18px] border-[1.5px] text-[1.0625rem] font-bold inline-flex items-center justify-center gap-2 transition-colors duration-200',
          state.status === 'playing' ? 'bg-surface2' : 'hover:bg-surface',
          'disabled:cursor-default',
        )}
        style={{ borderColor: color, color: 'var(--c-ink)' }}
        aria-describedby={`ear-state-${ear}`}
      >
        <span aria-hidden className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: color }} />
        {state.status === 'playing' ? (ear === 'left' ? 'Playing left' : 'Playing right') : label}
      </button>
      <p id={`ear-state-${ear}`} className="mt-2 h-6 text-[1rem] leading-6 text-center tnum" style={{ color: state.status === 'done' ? 'var(--c-ink)' : 'var(--c-ink2)' }}>
        {state.status === 'done' ? (
          <span className="inline-flex items-center gap-1">
            {heardOk && <IconCheck size={18} style={{ color }} />}
            {heardText(ear, state.heard!)}
          </span>
        ) : state.status === 'playing' ? (
          // The caption stays; only its words change while the tone plays (no layout shift).
          ear === 'left' ? 'Playing · 200 Hz' : 'Playing · 214 Hz'
        ) : ear === 'left' ? (
          'L · 200 Hz'
        ) : (
          'R · 214 Hz'
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
  louder,
  onLouder,
  onRetry,
}: {
  verdict: Exclude<Verdict, null>;
  setVerdict: (v: Verdict) => void;
  reset: () => void;
  finish: (o: { noiseOnly?: boolean; start?: boolean }) => void;
  from: 'onboarding' | 'settings';
  louder: boolean;
  onLouder: () => void;
  onRetry: () => void;
}) {
  const p = 'text-[1rem] leading-6 text-ink';
  const [how, setHow] = useState(false);
  switch (verdict) {
    case 'none-left':
    case 'none-right': {
      const side = verdict === 'none-left' ? 'left' : 'right';
      return (
        <div data-testid="ear-none">
          <p className={p}>
            Nothing on the {side}. Check the {side} earbud is in and connected, and that your volume is up{louder ? '' : ', then play it again'}. If only one side works, noise only still covers the room.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4">
            {louder ? (
              <Button variant="quiet" onClick={onRetry} data-testid="ear-retry">
                Play {side} again
              </Button>
            ) : (
              <Button variant="quiet" onClick={onLouder} data-testid="ear-louder">
                Play it a little louder
              </Button>
            )}
            <Button variant="text" onClick={() => finish({ noiseOnly: true })}>
              Use noise only
            </Button>
          </div>
        </div>
      );
    }
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
      // What we observed, not a guessed cause: both tones reached both ears.
      return (
        <div data-testid="ear-mono">
          <p className={p}>Both tones came through both ears, so left and right are being merged. Usually that’s Mono Audio, Spatial Audio, or the phone speaker.</p>
          {how && (
            <ul className="text-[1rem] leading-6 text-ink2 mt-2 flex flex-col gap-1" data-testid="ear-mono-how">
              <li>Mono Audio: Settings, Accessibility, Audio and Visual (Android: Audio adjustment).</li>
              <li>Spatial Audio: in Control Center, press and hold the volume slider.</li>
              <li>Speaker: connect stereo headphones.</li>
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4">
            {!how && (
              <Button variant="quiet" onClick={() => setHow(true)} data-testid="ear-mono-show">
                Show me where
              </Button>
            )}
            <Button variant="text" onClick={reset} data-testid="ear-mono-again">
              I’ve changed it, check again
            </Button>
            <Button variant="text" onClick={() => finish({ noiseOnly: true })}>
              Use noise only
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
          {how && <p className="text-[1rem] leading-6 text-ink2 mt-2">In Control Center, press and hold the volume slider, then turn Spatial Audio off.</p>}
          <div className="mt-2 flex flex-wrap gap-x-4">
            <Button variant="quiet" onClick={() => setHow(true)}>
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
