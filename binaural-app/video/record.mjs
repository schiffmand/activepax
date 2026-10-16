// Records a scripted walkthrough of the Tuck prototype as 2x screencast frames and writes
// events.json (time of each step) for placing captions and the audio track.
// Usage: node video/record.mjs <outDir>
import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? path.join(here, 'build');
mkdirSync(path.join(out, 'frames'), { recursive: true });
const U = 'file://' + path.resolve(here, '../prototype/dist/index.html');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// Frames are captured over CDP at 2x device pixels (Playwright's recordVideo records at 1x).
const frames = [];
const events = [];
const cdp = await ctx.newCDPSession(page);
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
// Screencast frames arrive at CSS pixels, so grab full-DPR screenshots in a loop instead.
let capturing = true;
const grabber = (async () => {
  while (capturing) {
    const t = now();
    try {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, optimizeForSpeed: true });
      const file = `f${String(frames.length).padStart(5, '0')}.jpg`;
      writeFileSync(path.join(out, 'frames', file), Buffer.from(data, 'base64'));
      frames.push({ file, t });
    } catch { await new Promise(r => setTimeout(r, 30)); }
  }
})();

const mark = (name) => events.push({ name, t: now() });
const t = (id) => `[data-testid=${id}]`;
const click = (id) => page.click(t(id), { timeout: 5000 });
const has = async (id) => (await page.locator(t(id)).count()) > 0;
const wait = (s) => page.waitForTimeout(s * 1000);

await page.goto(`${U}?hour=10`, { waitUntil: 'networkidle' });
mark('onboarding'); await wait(4.5);

// Ear check: the left tone plays straight away, then the right one
await click('onboard-check'); mark('ear-left'); await wait(2.5);
await click('ear-answer-left'); await wait(0.6);
await click('ear-play-right'); mark('ear-right'); await wait(2.5);
await click('ear-answer-right'); mark('stereo-ok'); await wait(3);

// First-run Home with the arrival chips
await page.goto(`${U}?screen=home&hour=10`, { waitUntil: 'networkidle' });
mark('home'); await wait(3.5);
await click('chip-wound-up'); mark('chip'); await wait(3);
await click('chip-scattered'); await wait(1.5);

await click('start'); mark('start'); await wait(9);
mark('playing'); await wait(2);

// Simulated "other app" playing above Tuck
await click('nav-menu'); await click('menu-demo'); await wait(0.8);
await page.click(`[data-testid=sheet-demo] ${t('other-toggle')}`); mark('other-on'); await wait(1.5);
await click('sheet-close'); await wait(4);
await click('level-quiet'); mark('quiet'); await wait(3);
await click('level-full'); mark('full'); await wait(3);
await click('level-medium'); mark('medium'); await wait(2);

await click('readout'); mark('spec'); await wait(5.5);
if (await has('spec-done')) await click('spec-done'); else await page.keyboard.press('Escape');
await wait(1.5);

await click('stop'); mark('stop'); await wait(5);
if (await has('ended-dismiss')) await click('ended-dismiss');
await wait(1.5);

await click('nav-menu'); await click('menu-mixing'); mark('mixing'); await wait(5);
if (await has('page-back')) await click('page-back'); else await page.keyboard.press('Escape');
await wait(0.8);
await click('nav-menu'); await click('menu-science'); mark('science'); await wait(4.5);
await page.mouse.wheel(0, 450); await wait(3.5);
mark('end'); await wait(0.5);

capturing = false; await grabber;
const end = now();
await ctx.close();
await browser.close();

// ffmpeg concat list: each frame holds until the next one arrives
const lines = frames.map((f, i) => `file 'frames/${f.file}'\nduration ${((frames[i + 1]?.t ?? end) - f.t).toFixed(3)}`);
lines.push(`file 'frames/${frames.at(-1).file}'`);
writeFileSync(path.join(out, 'frames.txt'), lines.join('\n') + '\n');
writeFileSync(path.join(out, 'events.json'), JSON.stringify({ firstFrame: frames[0].t, end, events }, null, 1));
console.log(JSON.stringify(events), frames.length, 'frames');
