// Usage: node tools/shoot-all.mjs [outDir] [onlyName]
// Captures every prototype screen (390x844 @2x) from prototype/dist/index.html into docs/screens/<name>.png.
// Each screen runs in a fresh browser context (fresh storage). Flows mirror prototype/SCREENS.md.
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'docs/screens'));
const only = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });
const U = 'file://' + path.join(root, 'prototype/dist/index.html');
const H = `${U}?screen=home&hour=10`;
const t = (id) => `[data-testid=${id}]`;

// step: string = click testid; number = wait ms; fn = custom
const big = async (p) => p.addStyleTag({ content: 'html{font-size:200% !important}' });
const scrollTo = (id) => async (p) => p.evaluate((id) => document.querySelector(`[data-testid=${id}]`)?.scrollIntoView({ block: 'center' }), id);
const seedNotes = async (p) =>
  p.evaluate(() => window.__tuck.store.setPrefs({ logOn: true, notes: [
    { at: Date.now() - 3600e3, layerId: 'focus', layerName: 'Focus', beatHz: 14, noise: 'brown', minutes: 25, rating: 3 },
    { at: Date.now() - 86400e3, layerId: 'calm', layerName: 'Calm', beatHz: 10, noise: 'pink', minutes: 12, rating: 2 },
  ] }));
// A revealed blind comparison with two notes per arm (beat on A).
const seedBlind = async (p) =>
  p.evaluate(() => {
    const now = Date.now();
    const n = (k, h, r) => ({ at: now - h * 3600e3, layerId: 'focus', layerName: `Layer ${k}`, beatHz: null, noise: 'brown', minutes: 25, rating: r, blind: k });
    window.__tuck.store.setPrefs({
      blind: { layerId: 'focus', beatIs: 'A', startedAt: now - 5 * 86400e3, days: 14, current: null, plays: { A: 2, B: 2 }, revealed: true },
      notes: [n('A', 50, 3), n('B', 40, 2), n('A', 26, 3), n('B', 3, 2)],
    });
  });
// The published viewer: clipboard writes are refused and execCommand fails too.
const noClipboard = async (p) => p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('NotAllowedError')); document.execCommand = () => false; });
const demo = (id) => [ 'nav-menu', 'menu-demo', async (p) => p.click(`[data-testid=sheet-demo] ${t(id)}`), 400, 'sheet-close' ];
const screens = [
  ['01-onboarding', U, []],
  ['02-ear-check-playing', U, ['onboard-check', 1500]],
  ['03-ear-check-where', U, ['onboard-check', 'ear-play-left', 2200]],
  ['04-ear-check-none', U, ['onboard-check', 'ear-play-left', 2200, 'ear-answer-none']],
  ['05-ear-check-stereo-ok', U, ['onboard-check', 'ear-play-left', 2200, 'ear-answer-left', 'ear-play-right', 2200, 'ear-answer-right']],
  ['06-ear-check-mono', U, ['onboard-check', 'ear-play-left', 2200, 'ear-answer-both', 'ear-play-right', 2200, 'ear-answer-both']],
  ['07-home-first-run', H, []],
  ['08-home-chip-wound-up', H, ['chip-wound-up']],
  ['09-playing-tucking-in', H, ['start', 1200]],
  ['10-playing-settled', H, ['start', 9000]],
  ['11-playing-quiet', H, ['start', 'level-quiet', 1500]],
  ['12-playing-vary', H, ['start', 'motion-vary', 1200]],
  ['13-spec-card', H, ['readout', 1200]],
  ['14-spec-card-noise-only', H, ['readout', 'spec-beat-off', 1000]],
  ['15-session-end', H, ['start', 1500, 'stop', 1500]],
  ['16-layer-picker', H, ['start', 1500, 'layer-name', 1000]],
  ['17-timer-sheet', H, ['timer-chip', 1000]],
  ['18-take-five-offer', H, ['timer-chip', 'timer-25', 'start', 1000, ...demo('demo-skip'), 25000]],
  ['19-returning-same-as-last', H, [...demo('demo-week'), 800]],
  ['20-arriving-differently', H, [...demo('demo-week'), 800, 'arriving-differently', 800]],
  ['21-evening-heavy-eyed', `${U}?screen=home&hour=21`, ['chip-heavy-eyed', 800]],
  ['22-evening-descent-spec', `${U}?screen=home&hour=21`, ['chip-heavy-eyed', 'readout', 1200]],
  ['23-shared-layer', `${U}?hour=10&layer=10,180,pink,30,hold,1,Library`, [800]],
  ['24-share-sheet', H, ['readout', 'spec-share', 1000]],
  ['25-editor', H, ['readout', 'spec-edit', 1000]],
  ['26-editor-advanced', H, ['readout', 'spec-edit', 'editor-more', 800, async (p) => p.mouse.wheel(0, 600), 800]],
  ['27-save-sheet', H, ['readout', 'spec-edit', 'editor-save', 1000]],
  ['28-saved', H, ['readout', 'spec-edit', 'editor-save', 'save-confirm', 1000]],
  ['29-menu', H, ['nav-menu', 800]],
  ['30-settings', H, ['nav-menu', 'menu-settings', 800]],
  ['31-sensory-mode-playing', H, ['nav-menu', 'menu-settings', 'set-sensory', 'page-back', 'start', 2500]],
  ['32-what-we-know', H, ['nav-menu', 'menu-science', 800]],
  ['33-the-studies', H, ['nav-menu', 'menu-science', 'science-studies', 800]],
  ['34-blind-comparison', H, ['nav-menu', 'menu-blind', 800]],
  ['35-blind-running', H, ['nav-menu', 'menu-blind', 'blind-start', 800]],
  ['36-how-mixing-works', H, ['nav-menu', 'menu-mixing', 800]],
  ['37-this-week-empty', H, ['nav-menu', 'menu-week', 800]],
  ['38-this-week-sample', H, [...demo('demo-week'), 'nav-menu', 'menu-week', 800]],
  ['39-lock-screen-idle', H, ['nav-menu', 'menu-lock', 800]],
  ['40-lock-screen-playing', H, ['nav-menu', 'menu-lock', 'lock-start', 1500]],
  ['41-tuck-plus', H, ['nav-menu', 'menu-plus', 800]],
  ['42-start-anywhere', H, ['nav-menu', 'menu-anywhere', 800]],
  ['43-headphones-speaker', `${H}&debug=1`, [async (p) => p.evaluate(() => window.__tuck.ui.set({ headphone: 'speaker' })), 600]],
  ['44-headphones-sheet', `${H}&debug=1`, [async (p) => p.evaluate(() => window.__tuck.ui.set({ headphone: 'speaker' })), 600, 'banner-speaker', 800]],
  ['45-prototype-controls', H, ['nav-menu', 'menu-demo', 800]],
  ['46-large-text', H, [big, 'start', 2000]],
  // Round 4 additions.
  ['47-large-text-idle', H, [big, 1000]],
  ['48-large-text-spec-card', H, [big, 'readout', 1500]],
  ['49-playing-first-session', H, ['start', 9000]],
  ['50-evening-home', `${U}?screen=home&hour=21`, [800]],
  ['51-take-five-running', H, ['timer-chip', 'timer-25', 'start', 1000, ...demo('demo-skip'), 25000, 'take-five', 2500]],
  ['52-call-stopped', `${H}&debug=1`, ['start', 3000, async (p) => p.evaluate(() => window.__tuck.session.simulateCall()), 3000]],
  ['53-headphones-disconnected-idle', `${H}&debug=1`, [async (p) => p.evaluate(() => window.__tuck.ui.set({ headphone: 'disconnected' })), 600, 'banner-disconnected', 800]],
  ['54-this-week-few-notes', `${H}&debug=1`, [seedNotes, 'nav-menu', 'menu-week', scrollTo('notes-summary'), 600]],
  ['55-export-sandboxed', `framed:${H}&debug=1`, [seedNotes, 'nav-menu', 'menu-week', scrollTo('export-csv'), 'export-csv', 800]],
  ['56-export-copied', `framed:${H}&debug=1`, [seedNotes, 'nav-menu', 'menu-week', scrollTo('export-csv'), 'export-csv', 'export-copy', 800]],
  ['57-share-copy-failed', `framed:${H}&debug=1`, [noClipboard, 'readout', 'spec-share', async (p) => p.fill(t('share-note'), 'for reading'), 'share-copy', 800]],
  ['58-shared-with-note', `${U}?hour=10&layer=10,180,pink,30,hold,1,Library&note=for%20reading`, [800]],
  ['59-schedule', H, ['nav-menu', 'menu-settings', scrollTo('set-schedule-layer'), 600]],
  ['60-desktop-frame', H, [800], { width: 1280, height: 860 }],
  // Round 5 additions (round-4 fixes).
  ['61-playing-full', H, ['start', 'level-full', 2500]],
  ['62-playing-one-earbud', `${H}&debug=1`, ['start', 1500, async (p) => p.evaluate(() => window.__tuck.ui.set({ headphone: 'oneEar' })), 2500]],
  ['63-cycles-running', H, ['timer-chip', 'timer-cycles', 'start', 2500]],
  ['64-disconnected-mid-session', `${H}&debug=1`, ['start', 3000, async (p) => p.evaluate(() => window.__tuck.ui.set({ headphone: 'disconnected' })), 3000]],
  ['65-large-text-session-end', H, [big, 'start', 2000, 'stop', 1500]],
  ['66-evening-descent-playing', `${U}?screen=home&hour=21&debug=1`, ['chip-heavy-eyed', 'start', 2000, async (p) => p.evaluate(() => window.__tuck.session.clock.skip(10 * 60 * 1000)), 2500]],
  ['67-editor-invalid-beat', H, ['readout', 'spec-edit', 800, async (p) => { await p.fill(t('editor-beat'), '99'); await p.keyboard.press('Tab'); }, 800]],
  ['68-shared-recipient-check', `${U}?hour=10&layer=10,180,pink,30,hold,1,Library&note=for%20reading&debug=1`, ['start', 1500, async (p) => p.evaluate(() => window.__tuck.session.clock.skip(65_000)), 2500]],
  ['69-activation-moment', H, ['nav-menu', 'menu-demo', async (p) => p.click(`[data-testid=sheet-demo] ${t('demo-activation')}`), 3500]],
  ['70-this-week-sleep-note', `${H}&debug=1`, [async (p) => p.evaluate(() => window.__tuck.store.setPrefs({ logOn: true, sleepNotes: [{ night: '2026-10-09', layerName: 'Evening descent', rating: 3, at: Date.now() }] })), 'nav-menu', 'menu-week', scrollTo('sleep-count'), 600]],
  ['71-blind-export-revealed', `framed:${H}&debug=1`, [seedBlind, 'nav-menu', 'menu-blind', scrollTo('blind-export'), 'blind-export', 800]],
  ['72-large-text-idle-more', H, [big, 1000, 'home-more', 1200]],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
let failures = 0;
// 'framed:<url>' runs the page inside a sandboxed iframe without allow-downloads, like the published viewer.
const viewer = path.join(os.tmpdir(), 'tuck-viewer.html');
for (const [name, url0, steps, vp] of screens) {
  if (only && !name.includes(only)) continue;
  const framed = url0.startsWith('framed:');
  const url = framed ? 'file://' + viewer : url0;
  if (framed) fs.writeFileSync(viewer, `<!doctype html><html><body style="margin:0;background:#121612"><iframe sandbox="allow-scripts allow-same-origin" src="${url0.slice(7).replace(/&/g, '&amp;')}" style="border:0;width:390px;height:844px"></iframe></body></html>`);
  const ctx = await browser.newContext({ viewport: vp ?? { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const top = await ctx.newPage();
  const logs = [];
  top.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  top.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await top.goto(url, { waitUntil: 'networkidle' });
  await top.waitForTimeout(framed ? 1600 : 800);
  // Steps act on the app: the page itself, or the viewer's iframe.
  const page = framed ? top.frames()[1] : top;
  for (const s of steps) {
    try {
      if (typeof s === 'number') await top.waitForTimeout(s);
      else if (typeof s === 'function') await s(page);
      else { await page.click(t(s), { timeout: 3000 }); await top.waitForTimeout(500); }
    } catch (e) { logs.push(`[step-fail] ${typeof s === 'string' ? s : 'fn'}: ${e.message.split('\n')[0]}`); failures++; }
  }
  await top.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`${name}${logs.length ? '\n  ' + logs.join('\n  ') : ''}`);
  await ctx.close();
}
await browser.close();
if (failures) { console.log(`${failures} step failure(s)`); process.exitCode = 1; }
