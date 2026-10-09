// Usage: node tools/shoot.mjs <url> <outPrefix> [clickSelectors...]
// Captures mobile (390x844 @2x) screenshots of a page; each extra arg is a CSS selector clicked in turn, screenshot after each.
import { chromium } from 'playwright-core';
const [url, out, ...clicks] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}-0.png` });
let i = 1;
for (const sel of clicks) {
  try { await page.click(sel, { timeout: 3000 }); } catch (e) { logs.push(`[click-fail] ${sel}: ${e.message.split('\n')[0]}`); }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}-${i++}.png` });
}
console.log(logs.join('\n') || 'no console output');
await browser.close();
