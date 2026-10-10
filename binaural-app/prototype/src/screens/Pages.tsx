import { useMemo } from 'react';
import { summarizeWeek, compareRanges, summarizeRange, weekRange } from '@core';
import { LEVELS, LEVEL_LABEL, type LevelName } from '../tuck/layers';
import { copy, durationWords } from '../tuck/copy';
import { store, type DimPref } from '../tuck/store';
import { useTuck } from '../ui/derived';
import { ui } from '../ui/state';
import { Button, Group, PageShell, RowButton, Segmented, SwitchRow } from '../ui/kit';
import { session } from '../audio/session';
import { Editor } from './Editor';
import { LockScreen } from './LockScreen';

export function Pages() {
  const t = useTuck();
  const back = () => ui.set({ page: 'home' });
  switch (t.u.page) {
    case 'settings':
      return (
        <PageShell key="settings" title="Settings" onBack={back} reduced={t.reduced} testid="page-settings">
          <Settings />
        </PageShell>
      );
    case 'science':
      return (
        <PageShell key="science" title="What we know" onBack={back} reduced={t.reduced} testid="page-science">
          <Science />
        </PageShell>
      );
    case 'studies':
      return (
        <PageShell key="studies" title="The studies" onBack={() => ui.set({ page: 'science' })} reduced={t.reduced} testid="page-studies" backLabel="What we know">
          <Studies />
        </PageShell>
      );
    case 'mixing':
      return (
        <PageShell key="mixing" title="How Tuck plays under your audio" onBack={back} reduced={t.reduced} testid="page-mixing">
          <Mixing />
        </PageShell>
      );
    case 'week':
      return (
        <PageShell key="week" title="This week" onBack={back} reduced={t.reduced} testid="page-week">
          <Week />
        </PageShell>
      );
    case 'plus':
      return (
        <PageShell key="plus" title="Tuck Plus" onBack={back} reduced={t.reduced} testid="page-plus">
          <Plus />
        </PageShell>
      );
    case 'editor':
      return (
        <PageShell key="editor" title="Edit a copy" onBack={back} reduced={t.reduced} testid="page-editor" backLabel="Cancel">
          <Editor />
        </PageShell>
      );
    case 'lock':
      return <LockScreen key="lock" onBack={back} reduced={t.reduced} />;
    default:
      return null;
  }
}

const H1 = ({ children }: { children: React.ReactNode }) => <h1 className="voice text-[31px] leading-[38px] text-ink mt-2 mb-2">{children}</h1>;
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="voice text-[25px] leading-8 text-ink mt-8 mb-2">{children}</h2>;
const P = ({ children }: { children: React.ReactNode }) => <p className="text-[16px] leading-6 text-ink max-w-[60ch] mt-3">{children}</p>;

// ───────────────────────────── Settings (a plain tool screen, no metaphor) ─────────────────────────────

function Settings() {
  const { prefs, core, st } = useTuck();
  const set = (p: Parameters<typeof store.setPrefs>[0]) => store.setPrefs(p, { user: true });
  const saved = store.savedLayers();
  const fadeIns = [2, 5, 8, 12, 15, 20];
  const fadeOuts = [10, 20, 30, 60, 120];
  return (
    <div className="pb-8">
      <h1 className="text-[31px] leading-[38px] font-bold text-ink mt-2">Settings</h1>

      <Group title="Home and arriving">
        <SwitchRow testid="set-ask" label="Ask how I’m arriving" hint="Off shows the five layer names instead." checked={prefs.askArrival} onChange={(v) => set({ askArrival: v })} />
        <SwitchRow testid="set-greeting" label="Greeting" hint="Off shows the word Tuck instead of Morning, Afternoon or Evening." checked={prefs.greeting} onChange={(v) => set({ greeting: v })} />
        <div className="py-3">
          <label htmlFor="toomuch" className="block text-[16px] font-medium text-ink">
            When I pick Too much, play
          </label>
          <select
            id="toomuch"
            value={prefs.tooMuchLayerId ?? ''}
            onChange={(e) => set({ tooMuchLayerId: e.target.value || null })}
            className="mt-2 w-full h-12 rounded-[14px] bg-bg px-3 text-[16px] text-ink border-[1.5px] border-line"
            data-testid="set-toomuch"
          >
            <option value="">Steady</option>
            {saved.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <SwitchRow testid="set-week" label="Show weekly total on Home" checked={prefs.showWeeklyTotal} onChange={(v) => set({ showWeeklyTotal: v })} />
      </Group>

      <Group title="Senses and motion" note="Sensory mode sets: Plain labels on, greeting off, Ask how I’m arriving off, texture off, Still screen on, Hold, fades 15 s in and 30 s out, ceiling Medium and locked, haptics and chime off. You can still change each one.">
        <SwitchRow testid="set-sensory" label="Sensory mode" hint="One switch for a quieter, literal, still app." checked={core.settings.sensoryMode} onChange={(v) => store.setSensory(v)} />
        <SwitchRow testid="set-plain" label="Plain labels" hint="Literal words everywhere: Sound on, Playing for 24 min, Stopped after 52 min." checked={prefs.plainLabels} onChange={(v) => store.setPlainLabels(v)} />
        <div className="py-3">
          <p className="text-[16px] font-medium text-ink mb-2">Still screen</p>
          <Segmented
            label="Still screen"
            testid="set-still"
            value={core.settings.reducedMotion === 'full' ? 'system' : core.settings.reducedMotion}
            onChange={(v) => store.core.dispatch({ type: 'settings/update', patch: { reducedMotion: v } })}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'reduce', label: 'Always on' },
            ]}
          />
          <p className="text-[16px] leading-[22px] text-ink2 mt-2">Every movement becomes a 600 ms cross-fade. Sound fades don’t change.</p>
        </div>
        <SwitchRow testid="set-texture" label="Texture on the layer" checked={prefs.texture} onChange={(v) => set({ texture: v })} />
        <SwitchRow label="Breathing layer" hint="Calm, Unwind and Sleep: one slow rise and fall every 10 seconds." checked={prefs.breathingLayer} onChange={(v) => set({ breathingLayer: v })} />
        <SwitchRow label="Haptics" hint="A soft tick at each level detent and when sound has fully started." checked={core.settings.hapticsEnabled && !core.settings.sensoryMode} onChange={(v) => store.core.dispatch({ type: 'settings/update', patch: { hapticsEnabled: v } })} />
      </Group>

      <Group title="Sound">
        <div className="py-3">
          <p className="text-[16px] font-medium text-ink mb-2">Level ceiling</p>
          <Segmented<LevelName>
            label="Level ceiling"
            testid="set-ceiling"
            value={prefs.levelCeiling}
            onChange={(v) => {
              set({ levelCeiling: v });
              const s = session.get();
              if (session.isActive() && LEVELS.indexOf(s.level) > LEVELS.indexOf(v)) session.setLevel(v);
            }}
            options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
          />
        </div>
        <SwitchRow testid="set-lock" label="Lock ceiling" hint="Nothing in the app can go louder than this." checked={prefs.ceilingLocked} onChange={(v) => set({ ceilingLocked: v })} />
        <div className="py-3">
          <p className="text-[16px] font-medium text-ink mb-2">
            Fade in <span className="tnum text-ink2 font-normal">{prefs.fadeInSec} s</span>
          </p>
          <Segmented label="Fade in" value={String(prefs.fadeInSec)} onChange={(v) => set({ fadeInSec: Number(v) })} options={fadeIns.map((n) => ({ value: String(n), label: `${n}` }))} />
        </div>
        <div className="py-3">
          <p className="text-[16px] font-medium text-ink mb-2">
            Fade out <span className="tnum text-ink2 font-normal">{prefs.fadeOutSec} s</span>
          </p>
          <Segmented label="Fade out" value={String(prefs.fadeOutSec)} onChange={(v) => set({ fadeOutSec: Number(v) })} options={fadeOuts.map((n) => ({ value: String(n), label: `${n}` }))} />
        </div>
        <div className="py-3">
          <p className="text-[16px] font-medium text-ink mb-2">Default motion for new layers</p>
          <Segmented
            label="Default motion"
            value={prefs.defaultMotion}
            onChange={(v) => set({ defaultMotion: v })}
            options={[
              { value: 'drift', label: 'Drift' },
              { value: 'hold', label: 'Hold' },
            ]}
          />
        </div>
        <SwitchRow testid="set-swap" label="Swap left and right" checked={prefs.swapChannels} onChange={(v) => set({ swapChannels: v })} />
        <SwitchRow testid="set-noiseonly" label="Noise only" hint="No beats, everywhere. Every layer keeps its noise bed." checked={prefs.noiseOnly} onChange={(v) => set({ noiseOnly: v })} />
        <SwitchRow testid="set-advanced" label="Show advanced tuning" hint="For power users: carrier, Drift range and fades in the editor." checked={prefs.advancedTuning} onChange={(v) => set({ advancedTuning: v })} />
        <RowButton label="Edit exact frequencies" value="Edit a copy" testid="set-tuning" onClick={() => ui.set({ page: 'editor', draftFrom: ui.get().selectedId })} />
        <RowButton label="Run the ear check again" testid="set-earcheck" onClick={() => ui.set({ onboarding: 'ear', earFrom: 'settings' })} />
        <SwitchRow label="Take 5 chime" checked={prefs.takeFiveChime} onChange={(v) => set({ takeFiveChime: v })} />
        <SwitchRow label="Auto-continue after Take 5" checked={prefs.autoContinue} onChange={(v) => set({ autoContinue: v })} />
      </Group>

      <Group title="Display">
        <div className="py-3">
          <p className="text-[16px] font-medium text-ink mb-2">Theme</p>
          <Segmented
            label="Theme"
            testid="set-theme"
            value={core.settings.theme}
            onChange={(v) => store.core.dispatch({ type: 'settings/update', patch: { theme: v } })}
            options={[
              { value: 'dark', label: 'Night' },
              { value: 'light', label: 'Day' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
        <div className="py-3">
          <p className="text-[16px] font-medium text-ink mb-2">Dim at night</p>
          <Segmented<DimPref>
            label="Dim at night"
            testid="set-dim"
            value={prefs.dimAtNight}
            onChange={(v) => set({ dimAtNight: v })}
            options={[
              { value: 'auto', label: 'For Sleep' },
              { value: 'always', label: 'Always' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <p className="text-[16px] leading-[22px] text-ink2 mt-2">After sunset. Keeps the screen under about 40 cd/m² and removes most blue.</p>
        </div>
        <SwitchRow testid="set-legible" label="Legible text" hint="Atkinson Hyperlegible throughout, including headings." checked={prefs.legibleText} onChange={(v) => set({ legibleText: v })} />
        <div className="py-3">
          <p className="text-[16px] font-medium text-ink mb-2">App icon</p>
          <Segmented
            label="App icon"
            value={prefs.appIcon}
            onChange={(v) => set({ appIcon: v })}
            options={[
              { value: 'tuck', label: 'Tuck' },
              { value: 'plain', label: 'Plain' },
            ]}
          />
        </div>
        <div className="py-3">
          <p className="text-[16px] font-medium text-ink mb-2">Live Activity style</p>
          <Segmented
            label="Live Activity style"
            value={prefs.liveActivityStyle}
            onChange={(v) => set({ liveActivityStyle: v })}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'minimal', label: 'Minimal' },
            ]}
          />
        </div>
      </Group>

      <Group title="Privacy">
        <p className="py-3 text-[16px] leading-6 text-ink">Everything stays on this phone. No account. No trackers.</p>
        <div className="py-3 flex flex-wrap gap-3">
          <Button
            variant="quiet"
            onClick={() => {
              const blob = new Blob([JSON.stringify({ core: st.core, prefs }, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'tuck-data.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            }}
          >
            Export my data (JSON)
          </Button>
          <Button
            variant="quiet"
            data-testid="set-delete-all"
            onClick={() => {
              if (window.confirm('Delete all Tuck data on this device? Saved layers, totals and settings go back to the start.')) {
                void session.stop(2);
                store.resetAll();
                ui.set({ page: 'home', onboarding: 'intro', selectedId: 'focus', chip: null, chipLine: null, chipFirst: null });
              }
            }}
          >
            Delete all data
          </Button>
        </div>
      </Group>

      <Group title="About">
        <RowButton label="What we know" onClick={() => ui.set({ page: 'science' })} />
        <RowButton label="How Tuck plays under your audio" onClick={() => ui.set({ page: 'mixing' })} />
        <div className="py-3 text-[16px] text-ink2 tnum">Version 0.2 prototype · built-in layers v1.0</div>
      </Group>
    </div>
  );
}

// ───────────────────────────── What we know ─────────────────────────────

function Science() {
  return (
    <article className="pb-8">
      <H1>What we know, and what we don’t.</H1>
      <H2>This part is well established.</H2>
      <P>
        Play 200 Hz in one ear and 214 Hz in the other, and your brain hears a slow 14 Hz beat that isn’t in either ear. That’s a real perceptual effect, and it’s why Tuck needs stereo
        headphones.
      </P>
      <H2>This part isn’t.</H2>
      <P>
        Whether that beat changes focus, calm or sleep is much less clear. Some reviews find small effects on anxiety and attention. Others find none, and one study found beats made a task
        slightly harder. Whether brainwaves “sync” to the beat hasn’t been shown reliably.
      </P>
      <H2>The steadiest evidence is for noise.</H2>
      <P>
        Soft background noise gives a small benefit on lab tasks for people with ADHD or a lot of inattention, and little or none for others. That’s why every Tuck layer has a noise bed, and
        why any layer can run as noise only.
      </P>
      <P>So Tuck doesn’t promise anything. It gives you a calm layer, lets you run it with or without the beat, and helps you see what works for you.</P>
      <div className="mt-6 rounded-[18px] bg-surface2 px-4 py-4">
        <p className="text-[16px] leading-6 text-ink max-w-[60ch]">
          Tuck is not a medical device and doesn’t diagnose or treat any condition. If you have epilepsy or a seizure disorder, check with your doctor first. Don’t use Sleep while driving. Keep the
          volume moderate.
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <Button variant="quiet" full onClick={() => ui.set({ page: 'studies' })} data-testid="science-studies">
          Read the studies (6)
        </Button>
        <Button
          variant="quiet"
          full
          onClick={() =>
            ui.toast('Blind comparison is coming with Tuck Plus. For 14 days, layers play labelled A or B: one with the beat, one noise only. You rate each day, then see your own result.', 8000)
          }
        >
          Try a blind comparison
        </Button>
      </div>
    </article>
  );
}

const STUDIES: { who: string; what: string; found: string; dir: 'Benefit' | 'Mixed' | 'No effect' | 'Negative' }[] = [
  {
    who: 'Nigg et al., 2024. Meta-analysis, JAACAP.',
    what: 'White and pink noise during lab tasks.',
    found: 'A small benefit for people with ADHD or high inattention (g ≈ 0.25). Neutral or slightly negative for others.',
    dir: 'Benefit',
  },
  {
    who: 'Garcia-Argibay, Santed and Reales, 2019. Meta-analysis, 22 studies.',
    what: 'Binaural beats and anxiety, memory, attention and pain.',
    found: 'Small to moderate effects, larger with longer exposure. Music over the beat may weaken them.',
    dir: 'Benefit',
  },
  {
    who: 'Ingendoh et al., 2023. Systematic review, PLOS ONE.',
    what: 'Do brainwaves sync to the beat (EEG)?',
    found: 'Inconsistent. About as many studies contradict it as support it.',
    dir: 'No effect',
  },
  {
    who: 'Klichowski and colleagues. Large-sample experiment.',
    what: 'Binaural beats during a thinking task.',
    found: 'Performance was slightly worse with beats, whether or not people expected them to help.',
    dir: 'Negative',
  },
  {
    who: 'Prasad and colleagues, 2023. Randomised trial before surgery.',
    what: 'Beats compared with music the patient chose.',
    found: 'Beats lowered anxiety compared with silence, but not more than chosen music.',
    dir: 'Mixed',
  },
  {
    who: 'Elnazer et al. Systematic review, Acta Neuropsychiatrica.',
    what: 'Music and binaural beats for young adults.',
    found: 'Small to moderate effects on anxiety, sleep and cognition, with small samples and wide variation.',
    dir: 'Mixed',
  },
];

function Studies() {
  return (
    <article className="pb-8">
      <H1>The studies.</H1>
      <P>Six we keep coming back to, including the ones that don’t go our way. Each line says what was found, not what we hoped.</P>
      <ol className="mt-6 flex flex-col gap-3">
        {STUDIES.map((s) => (
          <li key={s.who} className="rounded-[18px] bg-surface px-4 py-4">
            <p className="text-[16px] font-bold text-ink">{s.who}</p>
            <p className="text-[16px] leading-6 text-ink2 mt-1">{s.what}</p>
            <p className="text-[16px] leading-6 text-ink mt-2 max-w-[60ch]">{s.found}</p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-line px-3 h-8 text-[16px] text-ink">
              <DirGlyph dir={s.dir} />
              {s.dir}
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}

function DirGlyph({ dir }: { dir: string }) {
  const d = dir === 'Benefit' ? 'M4 12h16M12 4v16' : dir === 'Negative' ? 'M4 12h16' : dir === 'Mixed' ? 'M4 9h16M4 15h10' : 'M5 12h3M10.5 12h3M16 12h3';
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="text-ink2">
      <path d={d} />
    </svg>
  );
}

// ───────────────────────────── Mixing explainer ─────────────────────────────

function Mixing() {
  const items: [string, string][] = [
    ['What happens', 'Start your music, podcast or video in any app, then start Tuck, or the other way round. Both keep playing. Use Level to set how far under your audio Tuck sits.'],
    ['Volume', 'Your phone’s volume buttons change everything together. Level changes only Tuck.'],
    ['What we can’t see', 'Your phone doesn’t tell us what’s playing, so we only say whether something is.'],
    ['When it can’t mix', 'Some apps, mostly calls and a few video apps, take over the sound and stop everything else. That’s their choice, not ours. Tuck will tell you when it happens, and your audio is never changed.'],
    ['Lock Screen', 'Your other app keeps the main lock-screen player. Tuck shows its own small control with the time left and Stop.'],
    ['Headphones', 'The beat needs stereo headphones. On the phone speaker, Tuck plays noise only.'],
  ];
  return (
    <article className="pb-8">
      <h1 className="text-[31px] leading-[38px] font-bold text-ink mt-2">How Tuck plays under your audio</h1>
      <figure className="mt-6 rounded-[22px] overflow-hidden border border-line" aria-hidden>
        <div className="bg-bg h-16 px-4 flex items-center justify-between text-ink2">
          <span className="text-[16px]">Your app</span>
          <span className="text-[16px]">keeps playing</span>
        </div>
        <div className="relative bg-surface h-16 twill">
          <div className="h-2 bg-lining" />
          <div className="px-4 h-14 flex items-center justify-between">
            <span className="text-[16px] text-ink">Tuck</span>
            <span className="text-[16px] text-ink2">underneath, at your Level</span>
          </div>
        </div>
      </figure>
      <dl className="mt-4">
        {items.map(([k, v]) => (
          <div key={k} className="py-4 border-b border-line">
            <dt className="text-[16px] font-bold text-ink">{k}</dt>
            <dd className="text-[16px] leading-6 text-ink mt-1 max-w-[60ch]">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-col gap-2">
        <Button variant="quiet" full onClick={() => ui.set({ onboarding: 'ear', earFrom: 'settings', page: 'home' })}>
          Run the ear check
        </Button>
        <Button variant="quiet" full onClick={() => ui.set({ sheet: 'demo' })} data-testid="mixing-demo">
          Try it with simulated audio
        </Button>
      </div>
      <p className="text-[16px] leading-6 text-ink2 mt-6 max-w-[60ch]">
        On iPhone, Tuck uses the playback audio category with mix-with-others, and never ducks other audio. On Android, it never requests audio focus and runs as a media playback service.
      </p>
    </article>
  );
}

// ───────────────────────────── This week ─────────────────────────────

function Week() {
  const { st, labels } = useTuck();
  const now = Date.now();
  const week = useMemo(() => summarizeWeek(st.core.history, now), [st.core.history, now]);
  const prev = useMemo(() => {
    const r = weekRange(now);
    const len = r.to - r.from;
    return summarizeRange(st.core.history, { from: r.from - len, to: r.from });
  }, [st.core.history, now]);
  const max = Math.max(1, ...week.perDay.map((d) => d.totalSec));
  const byLayer = new Map<string, number>();
  for (const h of st.core.history) if (h.startedAt >= weekRange(now).from) byLayer.set(h.name, (byLayer.get(h.name) ?? 0) + h.durationSec);
  const cmp = compareRanges(week, prev);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <article className="pb-8">
      <h1 className="text-[31px] leading-[38px] font-bold text-ink mt-2">This week</h1>
      {week.sessions === 0 ? (
        <p className="text-[16px] leading-6 text-ink mt-4 max-w-[60ch]">Nothing yet. Time with Tuck shows here as plain totals. There are no streaks.</p>
      ) : (
        <>
          <p className="voice text-[25px] leading-8 text-ink mt-4" data-testid="week-total">
            {copy.weekly(labels, durationWords(week.totalSec), week.sessions)}
          </p>
          {prev.sessions > 0 && <p className="text-[16px] text-ink2 mt-2">{cmp.direction === 'similar' ? 'About the same as last week.' : cmp.direction === 'more' ? 'A little more than last week.' : 'A little less than last week.'}</p>}
          <figure className="mt-8" aria-label="Minutes per day this week">
            <div className="flex items-end justify-between h-[140px] gap-3">
              {week.perDay.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="w-full rounded-t-[6px] bg-ink2/80" style={{ height: `${Math.max(d.totalSec ? 4 : 0, (d.totalSec / max) * 120)}px` }} title={`${Math.round(d.totalSec / 60)} min`} />
                </div>
              ))}
            </div>
            <div className="flex justify-between gap-3 mt-2 border-t border-line pt-2">
              {week.perDay.map((d, i) => (
                <div key={i} className="flex-1 text-center">
                  <span className="block text-[16px] text-ink2">{days[i]}</span>
                  <span className="block tnum text-[16px] text-ink">{Math.round(d.totalSec / 60)}</span>
                </div>
              ))}
            </div>
            <figcaption className="text-[16px] text-ink2 mt-2">Minutes per day. No target line.</figcaption>
          </figure>
          <h2 className="text-[16px] font-bold text-ink2 mt-8 mb-1">By layer</h2>
          <ul className="divide-y divide-line">
            {[...byLayer.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, sec]) => (
                <li key={name} className="flex justify-between py-3 text-[16px]">
                  <span className="text-ink">{name}</span>
                  <span className="tnum text-ink2">{durationWords(sec)}</span>
                </li>
              ))}
          </ul>
        </>
      )}
    </article>
  );
}

// ───────────────────────────── Tuck Plus ─────────────────────────────

function Plus() {
  return (
    <article className="pb-8">
      <h1 className="text-[31px] leading-[38px] font-bold text-ink mt-2">Tuck Plus</h1>
      <p className="text-[16px] leading-6 text-ink mt-4 max-w-[60ch]">
        Tuck is free, and the layer stays free. Tuck Plus adds schedules, the blind comparison, Health and sync. We’ll remind you 3 days before any charge. Cancel in two taps.
      </p>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {[
          ['Schedules', 'Start a layer at the same time each day.'],
          ['Blind comparison', '14 days of A and B, one with the beat and one noise only. Your own result at the end.'],
          ['Health', 'Mindful minutes in Apple Health or Health Connect.'],
          ['Sync', 'Your saved layers on your other devices.'],
        ].map(([k, v]) => (
          <li key={k} className="py-4">
            <p className="text-[16px] font-bold text-ink">{k}</p>
            <p className="text-[16px] leading-6 text-ink2 mt-1">{v}</p>
          </li>
        ))}
      </ul>
      <p className="text-[16px] text-ink2 mt-6">Not available in this prototype.</p>
    </article>
  );
}
