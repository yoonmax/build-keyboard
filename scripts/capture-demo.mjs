// Builds the README's demo GIF from real frames of the running app, stepped by hand so
// the timing is exact and independent of how fast the capture runs.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { STARTER_BUILDS } from '../src/catalog/starters.js';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';

const { GIFEncoder, applyPalette, quantize } = gifenc;

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5201';
mkdirSync('docs', { recursive: true });

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 880, height: 550 } });
await page.goto(`${base}/?instant&debug`);
await page.waitForFunction(() => window.__build?.runtime?.intro === 'done', null, { timeout: 45_000 });
await page.evaluate((build) => {
  const s = window.__build.store.getState();
  s.loadBuild(build);
  s.setUi({ cinematic: true });
}, STARTER_BUILDS.find((b) => b.id === 'starter-cream-75').build);
await page.waitForTimeout(1600);

const frames = [];
async function capture(hold = 1) {
  await page.waitForTimeout(90);
  const png = PNG.sync.read(await page.screenshot());
  frames.push({ data: new Uint8Array(png.data), width: png.width, height: png.height, hold });
}

// Theme changes, then the explode and back, with the camera moving between them.
const themes = ['matcha', 'ice', 'retro', 'graphite', 'cream'];
for (const theme of themes) {
  await page.evaluate((t) => window.__build.store.getState().applyKeycapTheme(t), theme);
  await page.waitForTimeout(750);
  await capture(4);
}

await page.evaluate(() => window.__build.runtime.camera.frameExploded({ duration: 0 }));
const steps = 22;
for (let i = 0; i <= steps; i += 1) {
  const t = i / steps;
  await page.evaluate((v) => {
    const { runtime } = window.__build;
    runtime.explode.progress = v;
    runtime.stepMotion?.();
    runtime.invalidate();
  }, t);
  await capture(1);
}
await page.waitForTimeout(800);
await capture(8);
for (let i = steps; i >= 0; i -= 2) {
  const t = i / steps;
  await page.evaluate((v) => {
    const { runtime } = window.__build;
    runtime.explode.progress = v;
    runtime.stepMotion?.();
    runtime.invalidate();
  }, t);
  await capture(1);
}

const gif = GIFEncoder();
for (const frame of frames) {
  const palette = quantize(frame.data, 200, { format: 'rgb565' });
  const index = applyPalette(frame.data, palette, 'rgb565');
  gif.writeFrame(index, frame.width, frame.height, { palette, delay: 70 * frame.hold });
}
gif.finish();
writeFileSync('docs/demo.gif', gif.bytes());
console.log('docs/demo.gif', frames.length, 'frames', (gif.bytes().length / 1e6).toFixed(1), 'MB');
await browser.close();
