import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { store } from './tuck/store';
import { ui } from './ui/state';

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
  if (q.get('debug') === '1') {
    const { session } = await import('./audio/session');
    (window as unknown as Record<string, unknown>).__tuck = { session, store, ui };
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
