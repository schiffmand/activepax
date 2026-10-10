import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { store } from './tuck/store';
import { ui } from './ui/state';
import { cleanNote, parseShared } from './tuck/share';
import { isLateHour, preselectForHour } from './ui/derived';

async function boot() {
  await store.hydrate();
  const { core, prefs } = store.get();
  const last = core.lastPlayed?.id;
  if (last && store.findLayer(last)) ui.set({ selectedId: last });
  if (!core.settings.onboarded) {
    ui.set({ onboarding: 'intro' });
    // Night wool is Tuck's default (spec §5.9); core's schema defaults to 'system'.
    if (core.settings.theme === 'system') store.core.dispatch({ type: 'settings/update', patch: { theme: 'dark' } });
    // Haptics are off by default in Tuck (core's schema defaults them on).
    store.core.dispatch({ type: 'settings/update', patch: { hapticsEnabled: false } });
  }
  store.setPrefs({ lastVisit: Date.now() });
  void prefs;
  // Demo deep links for reviewers: ?screen=home skips onboarding.
  const q = new URLSearchParams(location.search);
  if (q.get('screen') === 'home') {
    store.core.dispatch({ type: 'settings/update', patch: { onboarded: true } });
    ui.set({ onboarding: null });
  }
  // A shared layer link (?layer=14,207,brown,25,drift,1,Desk) opens Home with that layer, ready to save.
  const shared = parseShared(q.get('layer'));
  if (shared) {
    const sharedNew = !store.get().core.settings.onboarded;
    if (sharedNew) ui.set({ sharedNew: true });
    if (!store.get().core.settings.onboarded) store.core.dispatch({ type: 'settings/update', patch: { onboarded: true } });
    // The shared layer becomes the layer: the readout, the spec card and Start sound all play it before it's saved.
    store.setTransient(shared);
    ui.set({ onboarding: null, shared, sharedNote: cleanNote(q.get('note')), selectedId: shared.id, chip: null, chipLine: null, chipFirst: null });
  }
  // ?hour=14 pretends the local hour is 14:00 (screenshots that shouldn't depend on the real clock).
  const hour = Number(q.get('hour'));
  if (q.get('hour') !== null && Number.isInteger(hour) && hour >= 0 && hour < 24) ui.set({ hourOverride: hour });
  // The evening default: after 21:00, Heavy-eyed (Evening descent) or the layer you last started in the evening.
  preselectForHour();
  let wasLate = isLateHour(ui.hour());
  ui.subscribe(() => {
    const late = isLateHour(ui.hour());
    if (late === wasLate) return;
    wasLate = late;
    preselectForHour();
  });
  if (q.get('debug') === '1') {
    const { session } = await import('./audio/session');
    const { selectLayer } = await import('./ui/derived');
    // Audio checks must go through what the UI does (round 4, A4): session.setBinaural() alone is undone by Home's
    // sync effect, which follows the selected layer. setBeat() flips the layer the way the spec card's Beat switch does.
    const setBeat = (on: boolean) => {
      const base = ui.get().selectedId.replace(/~noise$/, '');
      selectLayer(on ? base : `${base}~noise`);
    };
    (window as unknown as Record<string, unknown>).__tuck = { session, store, ui, setBeat };
  }
  if (q.get('reset') === '1') {
    store.resetAll();
    store.core.dispatch({ type: 'settings/update', patch: { theme: 'dark' } });
    ui.set({ onboarding: 'intro' });
  }
}

void boot().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
