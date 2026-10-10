import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { session } from './audio/session';
import { LEVELS } from './tuck/layers';
import { store } from './tuck/store';
import { startSound, stopSound, useTuck } from './ui/derived';
import { ui } from './ui/state';
import { Mark } from './ui/kit';
import { Home } from './screens/Home';
import { EarCheck, Intro } from './screens/Onboarding';
import { Pages } from './screens/Pages';
import { Sheets } from './screens/Sheets';
import { DemoControls } from './demo/DemoControls';

function useViewport() {
  const get = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [v, setV] = useState(get);
  useEffect(() => {
    const on = () => setV(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

export function App() {
  const t = useTuck();
  const vp = useViewport();
  const framed = vp.w >= 720;
  const wide = vp.w >= 1180;
  const scale = framed ? Math.min(1, (vp.h - 48) / (844 + 28)) : 1;

  useKeyboard();
  useSchedule();

  useLayoutEffect(() => {
    document.documentElement.style.background = '#121612';
  }, []);

  return (
    <MotionConfig reducedMotion={t.reduced ? 'always' : 'never'}>
      <div className="page min-h-[100dvh] w-full relative overflow-x-hidden" style={{ background: '#121612' }}>
        {framed && <Ground />}
        {framed ? (
          <div className={wide ? 'relative z-[1] min-h-[100dvh] grid grid-cols-[1fr_auto_1fr] items-center gap-12 px-10' : 'relative z-[1] min-h-[100dvh] flex flex-col items-center gap-8 px-6 py-8'}>
            <Caption wide={wide} />
            <div style={{ width: (390 + 28) * scale, height: (844 + 28) * scale }} className="relative shrink-0">
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }} className="absolute left-0 top-0">
                <Device>
                  <Phone framed />
                </Device>
              </div>
            </div>
            <aside className={wide ? 'justify-self-start w-[340px] max-h-[92vh] overflow-y-auto scroll-soft pr-1' : 'w-full max-w-[520px]'} aria-label="Prototype controls">
              <p className="text-[1rem] font-bold text-[#AEB2A0] mb-3 px-1">Prototype controls</p>
              <div className="tuck-theme" data-theme="night">
                <DemoControls />
              </div>
            </aside>
          </div>
        ) : (
          <div className="relative h-[100dvh] w-full">
            <Phone framed={false} />
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

/** The page ground echoes the product: your audio's space above, a band of Felt with the lining edge below. */
function Ground() {
  return (
    <div className="absolute inset-x-0 bottom-0 h-[15vh] pointer-events-none" aria-hidden>
      <div className="h-[6px]" style={{ background: '#EBB89A', opacity: 0.32 }} />
      <div className="h-px" style={{ background: '#C99577', opacity: 0.25 }} />
      <div className="h-full" style={{ background: '#1A1F1A' }} />
    </div>
  );
}

function Caption({ wide }: { wide: boolean }) {
  return (
    <header className={wide ? 'justify-self-end max-w-[360px] text-[#ECE7DA]' : 'max-w-[520px] text-[#ECE7DA] text-left w-full'}>
      <div className="flex items-center gap-3">
        <Mark size={44} />
        <span className="font-[family-name:var(--font-voice)] text-[1.9375rem] leading-none font-medium tracking-[-0.01em]">Tuck</span>
      </div>
      <h1 className="font-[family-name:var(--font-voice)] text-[1.9375rem] leading-[2.375rem] mt-8">Tuck a little sound under whatever you’re playing.</h1>
      <p className="text-[1rem] leading-6 mt-4 text-[#ECE7DA]">
        A phone app that plays binaural beats and soft noise underneath Spotify, podcasts or YouTube, without pausing them. Exact numbers one tap away. No streaks, no claims.
      </p>
      <p className="text-[1rem] leading-6 mt-4 text-[#AEB2A0]">
        This prototype plays real binaural tones in your browser, so put on stereo headphones. Enter starts sound, Esc stops it, and the arrow keys change the level.
      </p>
    </header>
  );
}

function Device({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-[62px] p-[14px]" style={{ width: 390 + 28, height: 844 + 28, background: '#0F120F', boxShadow: '0 0 0 1.5px #2C332B, 0 40px 80px rgba(0,0,0,.45)' }}>
      <div className="relative h-[844px] w-[390px] rounded-[48px] overflow-hidden">{children}</div>
    </div>
  );
}

function StatusBar() {
  // Follows ?hour= and Prototype controls, so the clock agrees with "Morning." on Home.
  const hourOverride = useTuck().u.hourOverride;
  const [time, setTime] = useState(() => ui.now());
  useEffect(() => setTime(ui.now()), [hourOverride]);
  useEffect(() => {
    const i = setInterval(() => setTime(ui.now()), 30_000);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="absolute inset-x-0 top-0 h-[47px] z-[45] flex items-center justify-between px-[34px] pointer-events-none text-ink" aria-hidden>
      <span className="tnum text-[1rem] font-semibold" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="absolute left-1/2 -translate-x-1/2 top-[11px] h-[34px] w-[122px] rounded-full bg-[#0d0f0d]" />
      <span className="flex items-center gap-[6px]">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <rect x=".5" y=".5" width="22" height="11" rx="3" stroke="currentColor" opacity=".5" />
          <rect x="2" y="2" width="16" height="8" rx="1.8" fill="currentColor" />
          <rect x="24" y="4" width="1.5" height="4" rx=".75" fill="currentColor" opacity=".5" />
        </svg>
      </span>
    </div>
  );
}

function Phone({ framed }: { framed: boolean }) {
  const t = useTuck();
  const { u, theme, texture, prefs, reduced, st } = t;
  return (
    <div
      className="tuck-theme absolute inset-0 bg-bg text-ink font-[family-name:var(--font-ui)] overflow-hidden"
      data-theme={theme}
      data-texture={texture ? 'on' : 'off'}
      data-legible={prefs.legibleText ? 'true' : 'false'}
      data-transparency={t.transparencyReduced ? 'reduced' : 'normal'}
      data-phone
      data-testid="phone"
      style={{ transition: 'background-color 600ms linear, color 600ms linear' }}
    >
      {framed && <StatusBar />}
      {st.hydrated && (
        <AnimatePresence mode="wait" initial={false}>
          {u.onboarding === 'intro' ? (
            <Fade key="intro" reduced={reduced}>
              <Intro reduced={reduced} />
            </Fade>
          ) : u.onboarding === 'ear' ? (
            <Fade key="ear" reduced={reduced}>
              <EarCheck reduced={reduced} />
            </Fade>
          ) : (
            <Fade key="home" reduced={reduced}>
              <Home />
            </Fade>
          )}
        </AnimatePresence>
      )}
      <AnimatePresence>{!u.onboarding && <Pages />}</AnimatePresence>
      <Sheets />
      {framed && <div className="absolute bottom-[8px] left-1/2 -translate-x-1/2 h-[5px] w-[134px] rounded-full bg-ink/80 z-[60] pointer-events-none" aria-hidden />}
    </div>
  );
}

function Fade({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.6 : 0.32 }}>
      {children}
    </motion.div>
  );
}

/**
 * The free daily schedule. On a phone the OS starts it (a notification you can stop from); here it
 * fires while the prototype is open, once per day, if nothing is playing.
 */
function useSchedule() {
  useEffect(() => {
    const check = () => {
      const { schedule } = store.get().prefs;
      if (!schedule.on || session.isActive()) return;
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (schedule.lastFired === today) return;
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hhmm < schedule.time) return;
      // Only within 10 minutes of the time, so opening the app late doesn't start sound unasked.
      const [h, m] = schedule.time.split(':').map(Number);
      if ((now.getHours() * 60 + now.getMinutes()) - ((h ?? 0) * 60 + (m ?? 0)) > 10) return;
      store.setPrefs({ schedule: { ...schedule, lastFired: today } });
      startSound(schedule.layerId);
    };
    const i = setInterval(check, 15_000);
    return () => clearInterval(i);
  }, []);
}

/** Enter = Start sound, Esc = Stop, arrows = Level (spec §7), when nothing else has focus. */
function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const u = ui.get();
      if (u.onboarding || u.sheet || u.page !== 'home' || u.spec) return;
      const el = document.activeElement as HTMLElement | null;
      const neutral = !el || el === document.body || el.hasAttribute('data-phone') || el.tagName === 'MAIN';
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
      if (typing) return;
      const s = session.get();
      const active = s.phase === 'fadingIn' || s.phase === 'playing' || s.phase === 'starting';
      if (e.key === 'Enter' && neutral && !active) {
        e.preventDefault();
        startSound();
      } else if (e.key === 'Escape' && active) {
        e.preventDefault();
        stopSound();
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && neutral && active) {
        e.preventDefault();
        const i = LEVELS.indexOf(s.level);
        const ceil = LEVELS.indexOf(store.get().prefs.levelCeiling);
        const n = e.key === 'ArrowUp' ? Math.min(ceil, i + 1) : Math.max(0, i - 1);
        session.setLevel(LEVELS[n]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
