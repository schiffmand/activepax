import { makeId, type SessionRecord } from '@core';
import { otherApp } from '../audio/otherApp';
import { session } from '../audio/session';
import { LEVEL_LABEL, LEVELS, type LevelName } from '../tuck/layers';
import { store } from '../tuck/store';
import { startSound, useTuck } from '../ui/derived';
import { ui, useOther, type Headphone } from '../ui/state';
import { Button, Segmented, cx } from '../ui/kit';
import { IconPause, IconPlay } from '../ui/icons';

const HP: { value: Headphone; label: string }[] = [
  { value: 'stereoOk', label: 'Stereo headphones' },
  { value: 'speaker', label: 'Phone speaker' },
  { value: 'oneEar', label: 'One earbud' },
  { value: 'callMode', label: 'Bluetooth call mode' },
  { value: 'mono', label: 'Mono Audio on' },
  { value: 'spatial', label: 'Spatial Audio on' },
  { value: 'swapped', label: 'Left and right swapped' },
  { value: 'disconnected', label: 'Disconnected' },
];

/**
 * Prototype controls (not part of the product): the simulated "other app" playing above Tuck, headphone
 * route states, time-lapse and interruptions. On desktop they sit beside the phone; on a phone they are in
 * Menu → Prototype controls.
 */
export function DemoControls({ compact = false }: { compact?: boolean }) {
  const t = useTuck();
  const other = useOther();
  const { s, u } = t;
  const active = session.isActive();
  const card = compact ? 'py-4 border-b border-line' : 'rounded-[20px] bg-[#1f251f] border border-[#2f372e] p-4';
  const h = compact ? 'text-[1rem] font-bold text-ink mb-2' : 'text-[1rem] font-bold text-[#ECE7DA] mb-2';
  const sub = compact ? 'text-ink2' : 'text-[#AEB2A0]';
  return (
    <div className={cx('flex flex-col', compact ? '' : 'gap-3')} data-testid="demo-controls">
      {/* The now-playing card: another app, simulated. No real names, by design. */}
      <section className={card} aria-label="Your other app, simulated">
        <p className={h}>Your other app (simulated)</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => otherApp.toggle()}
            data-testid="other-toggle"
            className={cx('h-14 w-14 rounded-full inline-flex items-center justify-center shrink-0', compact ? 'bg-ink text-onink' : 'bg-[#ECE7DA] text-[#1C211C]')}
            aria-label={other.playing ? 'Pause simulated audio' : 'Play simulated audio'}
          >
            {other.playing ? <IconPause /> : <IconPlay />}
          </button>
          <div className="min-w-0">
            <p className={cx('text-[1rem] font-medium', compact ? 'text-ink' : 'text-[#ECE7DA]')}>{other.kind === 'music' ? 'Soft music' : 'A spoken passage'}</p>
            <p className={cx('text-[1rem]', sub)}>{other.playing ? 'Playing above Tuck' : 'Paused'}</p>
          </div>
        </div>
        <div className="mt-3">
          <Segmented
            label="Simulated audio"
            value={other.kind}
            onChange={(v) => otherApp.setKind(v)}
            options={[
              { value: 'music', label: 'Music' },
              { value: 'spoken', label: 'Spoken' },
            ]}
          />
        </div>
        <label className={cx('block mt-3 text-[1rem]', compact ? 'text-ink' : 'text-[#ECE7DA]')} htmlFor={`ov-${compact}`}>
          Your app’s volume <span className={cx('tnum', sub)}>{Math.round(other.volume * 100)}%</span>
        </label>
        <input id={`ov-${compact}`} type="range" className="tuck-range" min={0} max={100} value={Math.round(other.volume * 100)} onChange={(e) => otherApp.setVolume(Number(e.target.value) / 100)} />
        <p className={cx('text-[1rem] mb-2', compact ? 'text-ink' : 'text-[#ECE7DA]')}>Tuck’s level underneath</p>
        <Segmented<LevelName>
          label="Tuck level"
          testid="demo-level"
          value={active ? s.level : t.prefs.lastLevel}
          locked={LEVELS.filter((_, i) => i > LEVELS.indexOf(t.prefs.levelCeiling))}
          onChange={(v) => (active ? session.setLevel(v) : store.setPrefs({ lastLevel: v }))}
          options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
        />
        <p className={cx('text-[1rem] leading-[1.375rem] mt-2', sub)}>Use headphones. On a phone, this is Spotify, a podcast or a lecture; Tuck never sees its name.</p>
        <div className="mt-3 grid">
        <DemoBtn
          compact={compact}
          testid="demo-activation"
          onClick={async () => {
            // The aha in five seconds: your audio above, Tuck under it, and the quiet line it earns after 10 minutes.
            ui.set({ sheet: null });
            if (!session.isActive()) startSound();
            if (!otherApp.get().playing) await otherApp.play();
            setTimeout(() => session.previewActivation(), 1500);
          }}
        >
          Show the activation moment
        </DemoBtn>
        </div>
        <p className={cx('text-[1rem] leading-[1.375rem] mt-2', sub)}>Starts both sounds and shows the line Tuck earns after 10 minutes under your audio: “Stayed under your audio for 10 min”.</p>
      </section>

      <section className={card} aria-label="Headphones">
        <label className={h} htmlFor={`hp-${compact}`}>
          Headphone route
        </label>
        <select
          id={`hp-${compact}`}
          value={u.headphone}
          data-testid="demo-headphone"
          onChange={(e) => {
            const v = e.target.value as Headphone;
            ui.set({ headphone: v });
            if (v === 'swapped') store.setPrefs({ swapChannels: true });
          }}
          className={cx('w-full h-12 rounded-[14px] px-3 text-[1rem] border-[1.5px]', compact ? 'bg-bg text-ink border-line' : 'bg-[#1C211C] text-[#ECE7DA] border-[#3B443A]')}
        >
          {HP.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className={cx('text-[1rem] leading-[1.375rem] mt-2', sub)}>Native apps read this from the audio route. Speaker, one earbud, call mode and Mono Audio switch Tuck to noise only.</p>
      </section>

      <section className={card} aria-label="Time and interruptions">
        <p className={h}>Time and interruptions</p>
        <div className="grid grid-cols-2 gap-2">
          <DemoBtn compact={compact} disabled={!active} onClick={() => session.skipAhead()} testid="demo-skip">
            Skip ahead
          </DemoBtn>
          <DemoBtn compact={compact} onClick={() => ui.set({ hourOverride: u.hourOverride === 21 ? null : 21 })} testid="demo-evening" pressed={u.hourOverride === 21}>
            {u.hourOverride === 21 ? 'Use real time' : 'Make it 21:00'}
          </DemoBtn>
          <DemoBtn compact={compact} onClick={() => ui.set({ hourOverride: u.hourOverride === 7 ? null : 7 })} testid="demo-morning" pressed={u.hourOverride === 7}>
            {u.hourOverride === 7 ? 'Use real time' : 'Make it 07:00'}
          </DemoBtn>
          <DemoBtn compact={compact} disabled={active} onClick={() => { ui.set({ sheet: null }); startSound(t.prefs.schedule.layerId); }} testid="demo-schedule">
            Run the schedule
          </DemoBtn>
          <DemoBtn compact={compact} disabled={!active} onClick={() => session.simulateCall()} testid="demo-call">
            Phone call
          </DemoBtn>
          <DemoBtn compact={compact} disabled={!active} onClick={() => session.simulateMixingFailure()} testid="demo-takeover">
            App takes over
          </DemoBtn>
        </div>
        <p className={cx('text-[1rem] leading-[1.375rem] mt-2', sub)}>Skip ahead jumps to just before the timer’s fade, the next break, or ten minutes on. 07:00 shows the morning sleep note (when the log is on and an evening session was played).</p>
      </section>

      <section className={card} aria-label="Data">
        <p className={h}>Data</p>
        <div className="grid grid-cols-2 gap-2">
          <DemoBtn compact={compact} onClick={() => addSampleWeek()} testid="demo-week">
            Add a sample week
          </DemoBtn>
          <DemoBtn
            compact={compact}
            testid="demo-reset"
            onClick={() => {
              void session.stop(1.5);
              otherApp.pause();
              store.resetAll();
              ui.set({ onboarding: 'intro', page: 'home', sheet: null, spec: false, chip: null, chipLine: null, chipFirst: null, selectedId: 'focus', headphone: 'stereoOk', hourOverride: null, chipsOpen: false });
            }}
          >
            Start over
          </DemoBtn>
        </div>
        <p className={cx('text-[1rem] leading-[1.375rem] mt-2', sub)} data-testid="demo-week-note">
          {t.prefs.sampleWeek ? 'Sample week added. This week labels it as sample data.' : 'The sample week is illustrative, so This week has something to show.'}
        </p>
      </section>
    </div>
  );
}

function DemoBtn({ children, onClick, disabled, compact, testid, pressed }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; compact: boolean; testid?: string; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      aria-pressed={pressed}
      className={cx(
        'min-h-12 rounded-[14px] px-3 text-[1rem] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        compact ? 'bg-surface2 text-ink hover:bg-line' : 'bg-[#2b322b] text-[#ECE7DA] hover:bg-[#363f35]',
        pressed && (compact ? 'ring-2 ring-ink2' : 'ring-2 ring-[#AEB2A0]'),
      )}
    >
      {children}
    </button>
  );
}

function addSampleWeek() {
  const now = Date.now();
  const day = 86400_000;
  const mk = (daysAgo: number, hour: number, min: number, name: string, presetId: string, band: SessionRecord['band']): SessionRecord => {
    const d = new Date(now - daysAgo * day);
    d.setHours(hour, 10, 0, 0);
    return { id: makeId('sample', d.getTime()), programId: `layer:${presetId}`, presetId, name, startedAt: d.getTime(), durationSec: min * 60, band, bandSeconds: { [band]: min * 60 }, completed: true, endedBy: 'timer' };
  };
  const today = new Date(now).getDay(); // 0 Sun
  const sinceMon = (today + 6) % 7;
  const recs = [
    mk(Math.min(sinceMon, 0), 9, 50, 'Focus', 'focus', 'beta'),
    mk(Math.min(sinceMon, 1), 14, 25, 'Focus', 'focus', 'beta'),
    mk(Math.min(sinceMon, 1), 21, 45, 'Evening descent', 'sleep', 'delta'),
    mk(Math.min(sinceMon, 2), 10, 90, 'Long focus', 'long-focus', 'gamma'),
    mk(Math.min(sinceMon, 3), 17, 30, 'Calm', 'calm', 'alpha'),
    mk(Math.min(sinceMon, 4), 11, 25, 'Focus', 'focus', 'beta'),
  ];
  for (const r of recs) if (r.startedAt < now) store.core.dispatch({ type: 'history/add', record: r });
  store.setPrefs({ firstSessionDone: true, sampleWeek: true, audioNoteDismissed: true });
}
