// Usage: node tools/ramp-check.mjs
// Regression check for round 3 audio B1, in a real browser: bundles core's ramp helpers (rampFade, rampParam)
// and renders them in Chromium's OfflineAudioContext, which implements cancelAndHoldAtTime per spec (it inserts
// nothing once the last automation event has finished). Exits 1 on any failure.
//   1. Fade in over 8 s, hold, Stop at 60 s with a 20 s fade: no step at the stop, about -20 dB at stop + 10 s.
//   2. Stop after 25 min: still a 20 s fade (-3 dB or less after 1 s).
//   3. Level change Medium -> Quiet after 12 s (0.0498 -> 0.0196 over 1.2 s): no sample step (< 0.3 dB in 10 ms).
//   4. The minimal repro from the review: exp ramp to 1 at t=1, hold at 3, exp ramp to 0.01 at 5 -> 0 dB at 3.0.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = path.join(root, 'prototype/node_modules/.bin/esbuild');
const bundle = execFileSync(esbuild, [path.join(root, 'core/src/audio/webaudio.ts'), '--bundle', '--format=iife', '--global-name=W'], { encoding: 'utf8' });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: bundle });
const results = await page.evaluate(async () => {
  const W = window.W;
  const sr = 3000;
  const db = (g) => 20 * Math.log10(Math.max(g, 1e-9));
  // Render a constant 1 through a gain whose automation `schedule` sets up; returns the gain curve.
  async function render(seconds, schedule) {
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sr), sr);
    const src = new ConstantSourceNode(ctx, { offset: 1 });
    const g = ctx.createGain();
    schedule(g.gain);
    src.connect(g).connect(ctx.destination);
    src.start();
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0);
    return (t) => d[Math.min(d.length - 1, Math.round(t * sr))];
  }
  const out = [];
  const check = (name, ok, detail) => out.push({ name, ok, detail });

  let at = await render(82, (p) => {
    W.setParam(p, 0, 0);
    W.rampFade(p, 1, 0, 8);
    W.rampFade(p, 0, 60, 20);
  });
  const step = db(at(60.05)) - db(at(59.99));
  check('Stop after 60 s: no step at the stop', Math.abs(step) < 0.5, `${step.toFixed(2)} dB in 60 ms`);
  check('Stop after 60 s: about -20 dB at stop + 10 s', db(at(70)) > -22 && db(at(70)) < -18, `${db(at(70)).toFixed(1)} dB`);
  check('Stop after 60 s: silent at the end', at(80.5) === 0, `${at(80.5)}`);

  at = await render(1522, (p) => {
    W.setParam(p, 0, 0);
    W.rampFade(p, 1, 0, 8);
    W.rampFade(p, 0, 1500, 20);
  });
  check('Stop after 25 min: still a fade', db(at(1501)) > -3, `${db(at(1501)).toFixed(1)} dB after 1 s`);

  at = await render(15, (p) => {
    W.setParam(p, 0, 0);
    W.rampParam(p, 0.0498, 0, 1.2);
    W.rampParam(p, 0.0196, 12, 1.2);
  });
  const lv = db(at(12.01)) - db(0.0498);
  check('Level change after 12 s: no click', Math.abs(lv) < 0.3, `${lv.toFixed(2)} dB in 10 ms`);
  check('Level change: reaches Quiet', Math.abs(at(13.3) - 0.0196) < 1e-3, `${at(13.3).toFixed(4)}`);

  at = await render(6, (p) => {
    W.setParam(p, 0.01, 0);
    W.rampParam(p, 1, 0, 1, 'exponential');
    W.holdParam(p, 3);
    p.exponentialRampToValueAtTime(0.01, 5);
  });
  check('Review repro: 0 dB at the hold', Math.abs(db(at(3.0))) < 0.5, `${db(at(3.0)).toFixed(1)} dB at 3.0 s, ${db(at(4.0)).toFixed(1)} dB at 4.0 s`);
  return out;
});
await browser.close();
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name} (${r.detail})`);
  if (!r.ok) failed++;
}
process.exit(failed ? 1 : 0);
