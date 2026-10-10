// Usage: node tools/shoot-all.mjs [outDir] [onlyName]
// Captures every prototype screen (390x844 @2x) from prototype/dist/index.html into docs/screens/<name>.png.
// Each screen runs in a fresh browser context (fresh storage). Flows mirror prototype/SCREENS.md.
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'docs/screens'));
const only = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });
const U = 'file://' + path.join(root, 'prototype/dist/index.html');
const H = `${U}?screen=home&hour=10`;
const t = (id) => `[data-testid=${id}]`;

// step: string = click testid; number = wait ms; fn = custom
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
  ['46-large-text', H, [async (p) => p.addStyleTag({ content: 'html{font-size:200% !important}' }), 'start', 2000]],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
let failures = 0;
for (const [name, url, steps] of screens) {
  if (only && !name.includes(only)) continue;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  for (const s of steps) {
    try {
      if (typeof s === 'number') await page.waitForTimeout(s);
      else if (typeof s === 'function') await s(page);
      else { await page.click(t(s), { timeout: 3000 }); await page.waitForTimeout(500); }
    } catch (e) { logs.push(`[step-fail] ${typeof s === 'string' ? s : 'fn'}: ${e.message.split('\n')[0]}`); failures++; }
  }
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`${name}${logs.length ? '\n  ' + logs.join('\n  ') : ''}`);
  await ctx.close();
}
await browser.close();
if (failures) { console.log(`${failures} step failure(s)`); process.exitCode = 1; }
