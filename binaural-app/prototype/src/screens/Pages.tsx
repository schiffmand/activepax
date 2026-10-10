import { useEffect, useMemo, useRef, useState } from 'react';
import { summarizeWeek, compareRanges, summarizeRange, weekRange } from '@core';
import { BUILT_IN_LAYERS, INTENT_ORDER, LEVELS, LEVEL_LABEL, builtInLayer, type LevelName } from '../tuck/layers';
import { copy, durationWords } from '../tuck/copy';
import { store, type DimPref, type SessionNote } from '../tuck/store';
import { useTuck } from '../ui/derived';
import { ui } from '../ui/state';
import { Button, Group, PageShell, RowButton, Segmented, SwitchRow } from '../ui/kit';
import { session } from '../audio/session';
import { startSound } from '../ui/derived';
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
      return <Editor key="editor" onBack={back} reduced={t.reduced} />;
    case 'blind':
      return (
        <PageShell key="blind" title="Blind comparison" onBack={back} reduced={t.reduced} testid="page-blind">
          <Blind />
        </PageShell>
      );
    case 'lock':
      return <LockScreen key="lock" onBack={back} reduced={t.reduced} />;
    default:
      return null;
  }
}

function download(name: string, type: string, body: string) {
  const blob = new Blob([body], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** One row per noted session: what played, for how long, and the one-tap rating. Nothing else. */
export function notesCsv(notes: SessionNote[]): string {
  const head = 'date,time,layer,beat_hz,noise,minutes,rating,blind_label';
  const rows = notes.map((n) => {
    const d = new Date(n.at);
    const date = d.toISOString().slice(0, 10);
    const time = d.toTimeString().slice(0, 5);
    return [date, time, `"${n.layerName.replace(/"/g, '""')}"`, n.beatHz ?? '', n.noise, n.minutes, n.rating, n.blind ?? ''].join(',');
  });
  return [head, ...rows].join('\n');
}

const H1 = ({ children }: { children: React.ReactNode }) => <h1 className="voice text-[31px] leading-[38px] text-ink mt-2 mb-2">{children}</h1>;
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="voice text-[25px] leading-8 text-ink mt-8 mb-2">{children}</h2>;
const P = ({ children }: { children: React.ReactNode }) => <p className="text-[16px] leading-6 text-ink max-w-[60ch] mt-3">{children}</p>;

// ───────────────────────────── Settings (a plain tool screen, no metaphor) ─────────────────────────────

function Settings() {
  const t = useTuck();
  const { prefs, core, st } = t;
  const set = (p: Parameters<typeof store.setPrefs>[0]) => store.setPrefs(p, { user: true });
  const saved = store.savedLayers();
  const fadeIns = [2, 5, 8, 12, 15, 20];
  const fadeOuts = [10, 20, 30, 60, 120];
  return (
    <div className="pb-8">
      <h1 className="text-[31px] leading-[38px] font-medium text-ink mt-2">Settings</h1>

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
            className="mt-2 w-full h-12 rounded-[14px] bg-bg px-3 text-[16px] text-ink border-[1.5px] border-edge"
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
        <div className="py-3">
          <label htmlFor="pin" className="block text-[16px] font-medium text-ink">
            Pin one layer to Home
          </label>
          <p className="text-[16px] leading-[22px] text-ink2 mt-1">Steady mode: Home always offers this layer, exactly as saved, with no arrival question. The Lock Screen can start it too.</p>
          <select
            id="pin"
            value={prefs.pinnedLayerId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              set({ pinnedLayerId: id });
              if (id) ui.set({ selectedId: id, chip: null, chipLine: null, chipFirst: null, chipsOpen: false });
            }}
            className="mt-2 w-full h-12 rounded-[14px] bg-bg px-3 text-[16px] text-ink border-[1.5px] border-edge"
            data-testid="set-pin"
          >
            <option value="">Nothing pinned</option>
            {[...saved, ...INTENT_ORDER.map((id) => builtInLayer(id)!), builtInLayer('long-focus')!].map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <SwitchRow testid="set-week" label="Show weekly total on Home" checked={prefs.showWeeklyTotal} onChange={(v) => set({ showWeeklyTotal: v })} />
      </Group>

      <Group title="Schedule" note="One daily time is free. Your phone starts the layer under whatever is playing, with a notification you can stop from. More schedules come with Tuck Plus.">
        <SwitchRow testid="set-schedule" label="Start a layer every day" checked={prefs.schedule.on} onChange={(v) => set({ schedule: { ...prefs.schedule, on: v } })} />
        <div className="py-3 grid grid-cols-[120px_1fr] gap-3 items-end">
          <div>
            <label htmlFor="sched-time" className="block text-[16px] font-medium text-ink mb-2">
              At
            </label>
            <input
              id="sched-time"
              type="time"
              value={prefs.schedule.time}
              onChange={(e) => set({ schedule: { ...prefs.schedule, time: e.target.value || '21:30', lastFired: null } })}
              className="w-full h-12 rounded-[14px] bg-bg px-3 text-[16px] text-ink border-[1.5px] border-edge tnum"
              data-testid="set-schedule-time"
            />
          </div>
          <div>
            <label htmlFor="sched-layer" className="block text-[16px] font-medium text-ink mb-2">
              Play
            </label>
            <select
              id="sched-layer"
              value={prefs.schedule.layerId}
              onChange={(e) => set({ schedule: { ...prefs.schedule, layerId: e.target.value } })}
              className="w-full h-12 rounded-[14px] bg-bg px-3 text-[16px] text-ink border-[1.5px] border-edge"
              data-testid="set-schedule-layer"
            >
              {[...INTENT_ORDER.map((id) => builtInLayer(id)!), builtInLayer('long-focus')!, ...saved].map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {prefs.schedule.on && (
          <p className="py-3 text-[16px] leading-[22px] text-ink tnum" data-testid="schedule-next">
            Next: {nextScheduleText(prefs.schedule.time, prefs.schedule.lastFired)}, {store.findLayer(prefs.schedule.layerId)?.name ?? 'Evening descent'}.
          </p>
        )}
      </Group>

      <Group title="Your notes" note="Off by default. When on: after a session, one tap for how it went, and the morning after an evening session, one tap for how you slept. Kept on this phone. Export them from This week.">
        <SwitchRow testid="set-log" label="Keep a private log" checked={prefs.logOn} onChange={(v) => set({ logOn: v })} />
      </Group>

      <Group title="Senses and motion" note="Sensory mode sets: Plain labels on, greeting off, Ask how I’m arriving off, texture off, Still screen on, Hold, fades 15 s in and 30 s out, ceiling Medium and locked, haptics and chime off. You can still change each one.">
        <SwitchRow testid="set-sensory" label="Sensory mode" hint="One switch for a quieter, literal, still app." checked={core.settings.sensoryMode} onChange={(v) => store.setSensory(v)} />
        <p className="py-3 text-[16px] leading-[22px] text-ink2" data-testid="set-system-note">
          Tuck follows your phone’s Reduce Motion and Reduce Transparency. Right now: Reduce Motion {t.systemReduced ? 'on' : 'off'}, Reduce Transparency{' '}
          {t.transparencyReduced ? 'on (no texture, no see-through panels)' : 'off'}.
        </p>
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
              { value: 'auto', label: 'Auto' },
              { value: 'always', label: 'From 18:00' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <p className="text-[16px] leading-[22px] text-ink2 mt-2">
            Auto: warm and dim from 21:00 for every layer, and from 18:00 for Sleep. Keeps the screen under about 40 cd/m², removes most blue, and never shows a bright button.
          </p>
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
          <Button variant="quiet" onClick={() => download('tuck-data.json', 'application/json', JSON.stringify({ core: st.core, prefs }, null, 2))}>
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
        <div className="py-3 text-[16px] text-ink2 tnum">Version 0.3 prototype · built-in layers v1.0</div>
      </Group>
    </div>
  );
}

// ───────────────────────────── What we know ─────────────────────────────

/** Evidence last reviewed (shown on the page). */
const REVIEWED = '10 October 2026';

function Science() {
  const { u } = useTuck();
  const beatRef = useRef<HTMLElement>(null);
  const noiseRef = useRef<HTMLElement>(null);
  const [hl, setHl] = useState<'beat' | 'noise' | null>(null);
  // "What does this do?" on the spec card lands on the matching paragraph.
  useEffect(() => {
    if (!u.anchor) return;
    const el = u.anchor === 'beat' ? beatRef.current : noiseRef.current;
    setHl(u.anchor);
    setTimeout(() => el?.scrollIntoView({ block: 'start' }), 360);
    ui.set({ anchor: null });
  }, [u.anchor]);
  const sec = (k: 'beat' | 'noise') => (hl === k ? 'rounded-[18px] bg-surface px-4 py-1 -mx-4 mt-6' : 'mt-6');
  return (
    <article className="pb-8">
      <H1>What we know, and what we don’t.</H1>
      <p className="text-[16px] text-ink2 tnum">Evidence last reviewed {REVIEWED}.</p>
      <H2>This part is well established.</H2>
      <P>
        Play 200 Hz in one ear and 214 Hz in the other, and your brain hears a slow 14 Hz beat that isn’t in either ear. That’s a real perceptual effect, and it’s why Tuck needs stereo
        headphones. The <span className="font-bold">carrier</span> is the pitch the two tones sit around (207 Hz here). The beat is the difference between them.
      </P>
      <section ref={beatRef} className={sec('beat')} data-testid="science-beat" tabIndex={-1}>
        <H2>This part isn’t.</H2>
        <P>
          Whether that beat changes focus, calm or sleep is much less clear. Some reviews find small effects on anxiety and attention. Others find none, and one study found beats made a task
          slightly harder. Whether brainwaves “sync” to the beat hasn’t been shown reliably. Above about 30 Hz the beat is hard to hear as a beat at all, which is why Long focus says so.
        </P>
      </section>
      <section ref={noiseRef} className={sec('noise')} data-testid="science-noise" tabIndex={-1}>
        <H2>The steadiest evidence is for noise.</H2>
        <P>
          Soft background noise gives a small benefit on lab tasks for people with ADHD or a lot of inattention, and little or none for others. That’s why every Tuck layer has a noise bed, and
          why any layer can run as noise only.
        </P>
      </section>
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
        <Button variant="quiet" full onClick={() => ui.set({ page: 'blind' })} data-testid="science-blind">
          Try a blind comparison
        </Button>
      </div>
    </article>
  );
}

const STUDIES: { who: string; what: string; found: string; dir: 'Benefit' | 'Mixed' | 'No effect' | 'Negative'; doi: string }[] = [
  {
    who: 'Nigg et al., 2024. Meta-analysis, JAACAP.',
    what: 'White and pink noise during lab tasks.',
    found: 'A small benefit for people with ADHD or high inattention (g ≈ 0.25). Neutral or slightly negative for others.',
    dir: 'Benefit',
    doi: '10.1016/j.jaac.2023.12.014',
  },
  {
    who: 'Garcia-Argibay, Santed and Reales, 2019. Meta-analysis, 22 studies.',
    what: 'Binaural beats and anxiety, memory, attention and pain.',
    found: 'Small to moderate effects, larger with longer exposure. Music over the beat may weaken them.',
    dir: 'Benefit',
    doi: '10.1007/s00426-018-1066-8',
  },
  {
    who: 'Ingendoh, Posny and Heine, 2023. Systematic review, PLOS ONE.',
    what: 'Do brainwaves sync to the beat (EEG)?',
    found: 'Inconsistent. About as many studies contradict it as support it.',
    dir: 'No effect',
    doi: '10.1371/journal.pone.0286023',
  },
  {
    who: 'Klichowski and colleagues, 2023. Large-sample experiment, Scientific Reports.',
    what: 'Home-use binaural beats during a thinking task.',
    found: 'Performance was slightly worse with beats, whether or not people expected them to help.',
    dir: 'Negative',
    doi: '10.1038/s41598-023-38313-4',
  },
  {
    who: 'Prasad et al., 2023. Randomised trial before surgery, Cureus.',
    what: 'Binaural-tone music, music the patient chose, and a sedative.',
    found: 'Both kinds of music lowered anxiety more than the sedative. Music the patient chose did as well or better on pain and satisfaction.',
    dir: 'Mixed',
    doi: '10.7759/cureus.35091',
  },
  {
    who: 'Elnazer, 2026. Systematic review, Acta Neuropsychiatrica.',
    what: 'Music and binaural beats for young adults.',
    found: 'Small to moderate effects on anxiety, sleep and cognition, with small samples and wide variation.',
    dir: 'Mixed',
    doi: '10.1017/neu.2026.10057',
  },
];

function Studies() {
  return (
    <article className="pb-8">
      <H1>The studies.</H1>
      <P>Six we keep coming back to, including the ones that don’t go our way. Each line says what was found, not what we hoped.</P>
      <p className="text-[16px] text-ink2 mt-2 tnum">Last reviewed {REVIEWED}. Each link opens the paper’s DOI.</p>
      <ol className="mt-6 flex flex-col gap-3">
        {STUDIES.map((st) => (
          <li key={st.who} className="rounded-[18px] bg-surface px-4 py-4">
            <p className="text-[16px] font-bold text-ink">{st.who}</p>
            <p className="text-[16px] leading-6 text-ink2 mt-1">{st.what}</p>
            <p className="text-[16px] leading-6 text-ink mt-2 max-w-[60ch]">{st.found}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-edge px-3 h-8 text-[16px] text-ink">
                <DirGlyph dir={st.dir} />
                {st.dir}
              </p>
              <a href={`https://doi.org/${st.doi}`} target="_blank" rel="noreferrer" className="tnum text-[16px] text-ink underline decoration-ink2/60 underline-offset-[5px] break-all min-h-11 inline-flex items-center">
                doi.org/{st.doi}
              </a>
            </div>
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
      <h1 className="text-[31px] leading-[38px] font-medium text-ink mt-2">How Tuck plays under your audio</h1>
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
  const { st, labels, prefs } = useTuck();
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
  const notes = prefs.notes.filter((n) => !n.blind);
  return (
    <article className="pb-8">
      <h1 className="text-[31px] leading-[38px] font-medium text-ink mt-2">This week</h1>
      {prefs.sampleWeek && week.sessions > 0 && (
        <p className="mt-2 inline-flex items-center rounded-full border border-edge px-3 h-8 text-[16px] text-ink" data-testid="week-sample">
          Sample data, from Prototype controls
        </p>
      )}
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

      <h2 className="text-[16px] font-bold text-ink2 mt-8 mb-1">Your notes</h2>
      {!prefs.logOn && notes.length === 0 && prefs.sleepNotes.length === 0 ? (
        <div className="rounded-[18px] bg-surface px-4 py-4" data-testid="log-offer">
          <p className="text-[16px] leading-6 text-ink">Keep a private log: one tap after each session for how it went, and one the morning after an evening session for how you slept. It stays on this phone.</p>
          <Button variant="quiet" className="mt-3" onClick={() => store.setPrefs({ logOn: true }, { user: true })} data-testid="log-on">
            Turn on the log
          </Button>
        </div>
      ) : (
        <>
          {notes.length === 0 && prefs.sleepNotes.length === 0 ? (
            <p className="text-[16px] leading-6 text-ink2">The log is on. Notes appear here after your next session.</p>
          ) : (
            <NotesSummary notes={notes} />
          )}
          {prefs.sleepNotes.filter((n) => n.rating > 0).length > 0 && (
            <ul className="divide-y divide-line mt-2" data-testid="sleep-notes">
              {prefs.sleepNotes
                .filter((n) => n.rating > 0)
                .slice(-5)
                .reverse()
                .map((n) => (
                  <li key={n.night} className="flex justify-between py-3 text-[16px]">
                    <span className="text-ink">
                      {new Date(`${n.night}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {n.layerName}
                    </span>
                    <span className="text-ink2">Slept {n.rating === 3 ? 'well' : n.rating === 2 ? 'OK' : 'poorly'}</span>
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="quiet" onClick={() => download('tuck-notes.csv', 'text/csv', notesCsv(prefs.notes))} data-testid="export-csv">
              Export CSV
            </Button>
            <Button variant="quiet" onClick={() => download('tuck-notes.json', 'application/json', JSON.stringify({ notes: prefs.notes, sleep: prefs.sleepNotes }, null, 2))} data-testid="export-json">
              Export JSON
            </Button>
          </div>
          <p className="text-[16px] leading-[22px] text-ink2 mt-2">Turn the log off in Settings, Your notes.</p>
        </>
      )}
    </article>
  );
}

function NotesSummary({ notes }: { notes: SessionNote[] }) {
  const beat = notes.filter((n) => n.beatHz !== null);
  const noise = notes.filter((n) => n.beatHz === null);
  const mean = (a: SessionNote[]) => (a.length ? a.reduce((s, n) => s + n.rating, 0) / a.length : null);
  const words = (m: number | null) => (m === null ? 'none yet' : m >= 2.5 ? 'mostly good' : m >= 1.8 ? 'mostly the same as usual' : 'mostly not for you');
  return (
    <div data-testid="notes-summary">
      <p className="text-[16px] leading-6 text-ink">
        {notes.length} noted session{notes.length === 1 ? '' : 's'}. With the beat: {words(mean(beat))} ({beat.length}). Noise only: {words(mean(noise))} ({noise.length}).
      </p>
      <p className="text-[16px] leading-[22px] text-ink2 mt-1">These are your notes, not a test. For a fair answer, run a blind comparison.</p>
    </div>
  );
}

// ───────────────────────────── Blind comparison ─────────────────────────────

function Blind() {
  const { prefs } = useTuck();
  const b = prefs.blind;
  const [layerId, setLayerId] = useState('focus');
  if (!b) {
    return (
      <article className="pb-8" data-testid="blind-setup">
        <h1 className="text-[31px] leading-[38px] font-medium text-ink mt-2">Does the beat do anything for you?</h1>
        <P>
          For two weeks, the layer you choose plays as layer A or layer B. One has the beat, one is noise only, at the same level. Tuck picks at random each time and hides the numbers. After each
          session you tap how it went. At the end you see your own result.
        </P>
        <div className="mt-6">
          <label htmlFor="blind-layer" className="block text-[16px] font-medium text-ink mb-2">
            Compare on
          </label>
          <select
            id="blind-layer"
            value={layerId}
            onChange={(e) => setLayerId(e.target.value)}
            className="w-full h-12 rounded-[14px] bg-bg px-3 text-[16px] text-ink border-[1.5px] border-edge"
            data-testid="blind-layer"
          >
            {BUILT_IN_LAYERS.filter((l) => !l.journey).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            {store.savedLayers().map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          full
          className="mt-6"
          data-testid="blind-start"
          onClick={() => {
            store.setPrefs({ blind: { layerId, beatIs: Math.random() < 0.5 ? 'A' : 'B', startedAt: Date.now(), days: 14, current: null, plays: { A: 0, B: 0 }, revealed: false } });
            ui.set({ selectedId: layerId, chip: null, chipLine: null, chipFirst: null });
          }}
        >
          Start the comparison
        </Button>
        <p className="text-[16px] leading-[22px] text-ink2 mt-3">Free, on this phone. Tuck Plus adds longer comparisons, two of your own layers against each other, and a PDF of the result.</p>
      </article>
    );
  }
  const notes = prefs.notes.filter((n) => n.blind && n.at >= b.startedAt);
  const a = notes.filter((n) => n.blind === 'A');
  const bb = notes.filter((n) => n.blind === 'B');
  const mean = (x: SessionNote[]) => (x.length ? x.reduce((s, n) => s + n.rating, 0) / x.length : null);
  const ma = mean(a);
  const mb = mean(bb);
  const enough = a.length >= 5 && bb.length >= 5;
  const name = store.findLayer(b.layerId)?.name ?? 'Focus';
  const day = Math.min(b.days, Math.floor((Date.now() - b.startedAt) / 86400_000) + 1);
  const fmt = (m: number | null) => (m === null ? '–' : m.toFixed(1));
  return (
    <article className="pb-8" data-testid="blind-running">
      <h1 className="text-[31px] leading-[38px] font-medium text-ink mt-2">{b.revealed ? 'Your result' : `Day ${day} of ${b.days}`}</h1>
      <P>
        {b.revealed
          ? `Layer ${b.beatIs} had the beat. Layer ${b.beatIs === 'A' ? 'B' : 'A'} was noise only.`
          : `Start ${name} as usual. It plays as A or B, chosen at random. Tap how it went at the end of each session.`}
      </P>
      <dl className="mt-6 grid grid-cols-2 gap-3">
        {(['A', 'B'] as const).map((k) => (
          <div key={k} className="rounded-[18px] bg-surface px-4 py-4">
            <dt className="text-[16px] text-ink2">
              Layer {k}
              {b.revealed ? (k === b.beatIs ? ', beat' : ', noise only') : ''}
            </dt>
            <dd className="tnum text-[31px] leading-[38px] text-ink mt-1">{fmt(k === 'A' ? ma : mb)}</dd>
            <dd className="tnum text-[16px] text-ink2">
              {(k === 'A' ? a : bb).length} note{(k === 'A' ? a : bb).length === 1 ? '' : 's'}, {b.plays[k]} play{b.plays[k] === 1 ? '' : 's'}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[16px] leading-[22px] text-ink2 mt-2">Average of your taps: 3 good, 2 same as usual, 1 not for me.</p>
      {b.revealed ? (
        <>
          <P>
            {ma === null || mb === null
              ? 'There aren’t notes for both layers, so there’s no comparison to make.'
              : Math.abs(ma - mb) < 0.3
                ? 'They came out about the same. For you, on these days, the beat didn’t make a clear difference.'
                : `The ${(b.beatIs === 'A' ? ma : mb) > (b.beatIs === 'A' ? mb : ma) ? 'beat' : 'noise only'} sessions came out a little better for you.`}{' '}
            With this few sessions, n is small and one good day can tip it. Treat it as a hint, not a finding.
          </P>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="quiet" onClick={() => download('tuck-blind.csv', 'text/csv', notesCsv(notes))} data-testid="blind-export">
              Export CSV
            </Button>
            <Button variant="quiet" onClick={() => store.setPrefs({ blind: null })} data-testid="blind-new">
              Start a new comparison
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[16px] leading-6 text-ink mt-4">{enough ? 'You have at least five notes for each. You can reveal the result now, or keep going for a steadier answer.' : 'The result is fairer with at least five notes for each layer.'}</p>
          <div className="mt-4 flex flex-col gap-2">
            <Button full onClick={() => { ui.set({ page: 'home' }); startSound(b.layerId); }} data-testid="blind-play">
              Start {name}
            </Button>
            <Button variant="quiet" full onClick={() => store.setPrefs({ blind: { ...b, revealed: true } })} data-testid="blind-reveal">
              Reveal the result{enough ? '' : ' early'}
            </Button>
            <Button variant="text" className="self-center" onClick={() => store.setPrefs({ blind: null })} data-testid="blind-stop">
              Stop the comparison
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

// ───────────────────────────── Tuck Plus ─────────────────────────────

function Plus() {
  return (
    <article className="pb-8">
      <h1 className="text-[31px] leading-[38px] font-medium text-ink mt-2">Tuck Plus</h1>
      <p className="text-[16px] leading-6 text-ink mt-4 max-w-[60ch]">
        Tuck is free, and the layer stays free. Tuck Plus adds schedules, the blind comparison, Health and sync. We’ll remind you 3 days before any charge. Cancel in two taps.
      </p>
      <section className="mt-6 rounded-[22px] bg-surface px-5 py-5">
        <p className="text-[16px] text-ink2">The reason to pay</p>
        <p className="voice text-[25px] leading-8 text-ink mt-1">Your own evidence.</p>
        <p className="text-[16px] leading-6 text-ink mt-2">
          A basic blind comparison is free. Plus runs longer ones (four weeks), compares two of your own layers, adds the morning sleep notes to the result, and exports a PDF and CSV you can show
          anyone.
        </p>
        <Button variant="quiet" className="mt-3" onClick={() => ui.set({ page: 'blind' })} data-testid="plus-blind">
          Try the free comparison
        </Button>
      </section>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {[
          ['Schedules', 'One daily time is free. Plus adds as many as you like: weekdays at 9, Sleep at 22:30.'],
          ['Health', 'Mindful minutes in Apple Health or Health Connect.'],
          ['Sync', 'Your saved layers on your other devices.'],
        ].map(([k, v]) => (
          <li key={k} className="py-4">
            <p className="text-[16px] font-bold text-ink">{k}</p>
            <p className="text-[16px] leading-6 text-ink2 mt-1">{v}</p>
          </li>
        ))}
      </ul>
      <p className="text-[16px] text-ink2 mt-6">In this prototype, the free comparison and the daily schedule work. Purchasing isn’t wired.</p>
    </article>
  );
}

/** "today at 21:30" / "tomorrow at 21:30". */
export function nextScheduleText(time: string, lastFired: string | null): string {
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const at = new Date(now);
  at.setHours(h ?? 21, m ?? 30, 0, 0);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const tomorrow = at.getTime() <= now.getTime() || lastFired === today;
  return `${tomorrow ? 'tomorrow' : 'today'} at ${time}`;
}
