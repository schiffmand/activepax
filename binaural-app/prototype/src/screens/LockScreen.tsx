import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { otherApp } from '../audio/otherApp';
import { session } from '../audio/session';
import { ears, hz } from '../tuck/layers';
import { useTuck } from '../ui/derived';
import { useOther } from '../ui/state';
import { EASE, Mark } from '../ui/kit';
import { IconBack, IconPause, IconPlay } from '../ui/icons';

/**
 * Lock Screen mock (spec §5.12). Mixing means the other app keeps the main player; Tuck shows its own
 * Live Activity beneath it. The other player never shows a real app, track or episode name.
 */
export function LockScreen({ onBack, reduced }: { onBack: () => void; reduced: boolean }) {
  const t = useTuck();
  const other = useOther();
  const { s, layer, prefs, binaural } = t;
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(i);
  }, []);
  const active = s.phase !== 'idle';
  const left = s.remainingSec !== null ? Math.max(0, Math.ceil(s.remainingSec / 60)) : null;
  const e = ears(layer);
  const minimal = prefs.liveActivityStyle === 'minimal';
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col"
      style={{ background: 'linear-gradient(180deg, #2a312a 0%, #161a16 70%)', color: '#ECE7DA' }}
      data-testid="page-lock"
      initial={reduced ? { opacity: 0 } : { y: '-100%' }}
      animate={reduced ? { opacity: 1 } : { y: 0 }}
      exit={reduced ? { opacity: 0 } : { y: '-100%' }}
      transition={{ duration: reduced ? 0.6 : 0.4, ease: EASE }}
    >
      {/* Dynamic Island, compact: stitch glyph and minutes left. */}
      <div className="pt-[11px] flex justify-center" aria-label="Dynamic Island">
        <div className="h-[37px] min-w-[126px] rounded-full bg-[#0d0f0d] flex items-center justify-between px-3 gap-6">
          {active ? (
            <>
              <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden>
                <path d="M2 4h5" stroke="#9DB2D6" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M19 4h5" stroke="#CFCB86" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className="tnum text-[16px] text-[#AEB2A0]">{left !== null ? `${left}m` : ''}</span>
            </>
          ) : (
            <span className="w-full" />
          )}
        </div>
      </div>
      <div className="text-center mt-10">
        <p className="text-[18px] text-[#C9CCBD]" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{date}</p>
        <p className="tnum text-[84px] leading-[90px] font-semibold tracking-[-0.02em]" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{time}</p>
      </div>

      <div className="mt-auto px-3 flex flex-col gap-2 pb-4">
        {/* The other app's player (simulated). It owns Now Playing. */}
        <div className="rounded-[24px] bg-[rgba(48,54,48,.82)] backdrop-blur px-4 py-3" data-testid="lock-other">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-[10px] bg-[#3B443A] flex items-center justify-center" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#AEB2A0" strokeWidth="1.75" strokeLinecap="round">
                <path d="M9 18V6l10-2v12" />
                <circle cx="6.5" cy="18" r="2.5" />
                <circle cx="16.5" cy="16" r="2.5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-bold">Your audio</p>
              <p className="text-[16px] text-[#AEB2A0]">{other.playing ? 'Another app, playing above' : 'Paused'}</p>
            </div>
            <button
              type="button"
              className="h-12 w-12 rounded-full inline-flex items-center justify-center hover:bg-white/10"
              onClick={() => otherApp.toggle()}
              aria-label={other.playing ? 'Pause your audio (simulated)' : 'Play your audio (simulated)'}
            >
              {other.playing ? <IconPause /> : <IconPlay />}
            </button>
          </div>
        </div>

        {/* Tuck's Live Activity. */}
        {active ? (
          minimal ? (
            <div className="rounded-[24px] bg-[rgba(48,54,48,.82)] px-4 h-16 flex items-center justify-between" data-testid="live-activity">
              <p className="tnum text-[16px]">
                {layer.name} · {binaural ? `${hz(s.beatNow ?? layer.beatHz)} Hz` : 'noise'} · {left !== null ? `${left} min` : 'no timer'}
              </p>
              <button type="button" onClick={() => void session.stop()} className="h-12 px-4 rounded-full bg-[#ECE7DA] text-[#1C211C] text-[16px] font-bold">
                Stop
              </button>
            </div>
          ) : (
            <div className="rounded-[24px] bg-[rgba(39,46,39,.92)] px-4 pt-3 pb-4" data-testid="live-activity">
              <div className="flex items-center gap-2">
                <Mark size={20} plain={prefs.appIcon === 'plain'} />
                <span className="text-[16px] font-bold">{layer.name}</span>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <div>
                  <p className="text-[16px] text-[#AEB2A0]">Playing under your audio, {left !== null ? `${left} min left` : 'no timer'}</p>
                  {binaural ? (
                    <>
                      <p className="tnum text-[34px] leading-[38px] font-medium mt-1">{hz(s.beatNow ?? layer.beatHz)} Hz</p>
                      <p className="tnum text-[16px]">
                        <span style={{ color: '#9DB2D6' }}>L {hz(e.left)}</span> <span className="text-[#AEB2A0]">/</span> <span style={{ color: '#CFCB86' }}>R {hz(e.right)}</span>
                      </p>
                    </>
                  ) : (
                    <p className="tnum text-[34px] leading-[38px] font-medium mt-1">Noise only</p>
                  )}
                </div>
                <button type="button" onClick={() => void session.stop()} className="h-12 px-5 rounded-full bg-[#ECE7DA] text-[#1C211C] text-[17px] font-bold" data-testid="live-stop">
                  Stop
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="rounded-[24px] bg-[rgba(39,46,39,.7)] px-4 h-16 flex items-center gap-3">
            <Mark size={20} plain={prefs.appIcon === 'plain'} />
            <p className="text-[16px] text-[#C9CCBD]">Start when you’re ready.</p>
          </div>
        )}
      </div>
      <div className="flex justify-center pb-[40px]">
        <button
          type="button"
          onClick={onBack}
          className="h-12 pl-3 pr-4 rounded-full inline-flex items-center gap-1 text-[16px] bg-white/10 hover:bg-white/15"
          data-testid="page-back"
        >
          <IconBack /> Back to Tuck
        </button>
      </div>
    </motion.div>
  );
}
