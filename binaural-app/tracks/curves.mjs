// Samples every goal track's program with core's own sampleProgram and writes curves.json:
// beat / carrier / level every 50 ms plus the noise bed, so synth.py renders exactly what the engine plays.
// Usage: node tracks/curves.mjs <out.json> [deepSleepMinutes=60]
import { build } from '../prototype/node_modules/esbuild/lib/main.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [outPath, deepMin = '60'] = process.argv.slice(2);
const bundle = path.join(mkdtempSync(path.join(tmpdir(), 'tuck-core-')), 'core.mjs');
await build({ entryPoints: [path.join(here, '../core/src/index.ts')], bundle: true, format: 'esm', platform: 'neutral', outfile: bundle, logLevel: 'error' });
const core = await import(pathToFileURL(bundle).href);

const STEP = 0.05;
const tracks = core.GOAL_TRACKS.map((t) => {
  const c = core.compileProgram(t.program);
  const total = c.totalSec ?? Number(deepMin) * 60;
  const n = Math.round(total / STEP) + 1;
  const beat = new Array(n), carrier = new Array(n), level = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = core.sampleProgram(c, i * STEP);
    beat[i] = +s.beatHz.toFixed(4); carrier[i] = +s.carrierHz.toFixed(3); level[i] = +s.level.toFixed(4);
  }
  const noiseChanges = c.steps.filter((s) => s.noise).map((s) => ({ at: s.atSec, ...s.noise }));
  return {
    id: t.id, goal: t.goal, plays: t.plays, minutes: t.minutes, step: STEP, totalSec: total,
    endFadeSec: c.end === 'stop' ? c.endFadeSec : 0, noise: c.startNoise ?? { type: 'off', volume: 0 }, noiseChanges,
    beat, carrier, level,
  };
});
writeFileSync(outPath, JSON.stringify(tracks));
console.log(tracks.map((t) => `${t.id} ${(t.totalSec / 60).toFixed(1)} min`).join('\n'));
