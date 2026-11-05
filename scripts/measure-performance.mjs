// Measures the real app in a real GPU-backed browser, and writes the numbers to docs/performance.json.
// Frames counted here are ones the renderer really drew. Counting requestAnimationFrame ticks would
// overstate the rate, because the render loop is on demand and many ticks draw nothing.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5201';
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function run(deviceScaleFactor) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor });
  const started = Date.now();
  await page.goto(`${base}/?instant&debug`);
  await page.waitForFunction(() => window.__build?.runtime?.intro === 'done', null, { timeout: 45_000 });
  const loadMs = Date.now() - started;
  await page.waitForTimeout(2000);

  const startRecording = () =>
    page.evaluate(() => {
      const { stats } = window.__build.runtime;
      window.__start = { frames: stats.renderedFrames, time: performance.now() };
      // Longest gap between frames that were actually drawn, to catch visible hitches.
      window.__gaps = [];
      let lastFrames = stats.renderedFrames;
      let lastTime = performance.now();
      window.__recording = true;
      const tick = (now) => {
        if (stats.renderedFrames !== lastFrames) {
          window.__gaps.push(now - lastTime);
          lastFrames = stats.renderedFrames;
          lastTime = now;
        }
        if (window.__recording) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  const stopRecording = () =>
    page.evaluate(() => {
      window.__recording = false;
      const { stats } = window.__build.runtime;
      const drawn = stats.renderedFrames - window.__start.frames;
      const seconds = (performance.now() - window.__start.time) / 1000;
      const gaps = window.__gaps.slice(2).sort((a, b) => a - b);
      return {
        framesDrawn: drawn,
        drawnPerSecond: +(drawn / seconds).toFixed(1),
        p95FrameGapMs: gaps.length ? +gaps[Math.floor(gaps.length * 0.95)].toFixed(1) : null,
      };
    });

  // Orbit: a real pointer drag across the canvas.
  await startRecording();
  await page.mouse.move(700, 500);
  await page.mouse.down();
  for (let i = 0; i < 180; i += 1) {
    await page.mouse.move(700 + Math.sin(i / 14) * 240, 500 + Math.cos(i / 20) * 80);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  const orbit = await stopRecording();
  await page.waitForTimeout(1600);

  // Typing: real key events in the tester.
  await page.getByTestId('nav-explore').click();
  await page.getByTestId('open-tester').click();
  await page.waitForTimeout(1400);
  await startRecording();
  const text = 'the quick brown fox jumps over the lazy dog ';
  for (const char of text.repeat(2)) {
    await page.keyboard.press(char === ' ' ? 'Space' : `Key${char.toUpperCase()}`, { delay: 14 });
    await page.waitForTimeout(16);
  }
  const typing = await stopRecording();
  await page.getByTestId('close-tester').click();
  await page.waitForTimeout(1500);

  // Exploding: every part in motion.
  await startRecording();
  await page.getByTestId('explode').click();
  await page.waitForFunction(() => window.__build.runtime.explode.progress === 1, null, { timeout: 15_000 });
  const exploded = await stopRecording();
  await page.getByTestId('assemble').click();
  await page.waitForFunction(() => window.__build.runtime.explode.progress === 0, null, { timeout: 15_000 });
  await page.waitForTimeout(2500);

  // Idle: how much does the renderer draw when nothing changes?
  const idle = await page.evaluate(async () => {
    const before = window.__build.runtime.stats.renderedFrames;
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return window.__build.runtime.stats.renderedFrames - before;
  });

  // True GPU cost: a full image is rendered off-screen and read back, which can't finish before
  // the GPU has. Each sample includes the shadow pass and 4x MSAA. A timer yield separates samples,
  // so the result is an upper bound on the render itself.
  const gpu = await page.evaluate(async (dpr) => {
    const { runtime } = window.__build;
    const camera = runtime.camera.currentCamera(1440 / 900);
    const samples = 60;
    const t = performance.now();
    await runtime.capture({ width: 1440 * dpr, height: 900 * dpr, samples, camera });
    return +((performance.now() - t) / samples).toFixed(2);
  }, deviceScaleFactor);

  // Colour update: applying a theme to every key without React re-rendering meshes.
  const theme = await page.evaluate(() => {
    const { runtime } = window.__build;
    const caps = runtime.parts.caps;
    const { keycaps } = window.__build.store.getState().build;
    const runs = [];
    for (let i = 0; i < 50; i += 1) {
      const t = performance.now();
      caps.applyStyles(keycaps);
      runs.push(performance.now() - t);
    }
    runs.sort((a, b) => a - b);
    return +runs[25].toFixed(3);
  });

  const scene = await page.evaluate(() => {
    const { runtime } = window.__build;
    return { drawCalls: runtime.stats.calls, triangles: runtime.stats.triangles };
  });
  await page.close();
  return { deviceScaleFactor, loadToInteractiveMs: loadMs, orbit, typing, exploded, idleFramesIn3s: idle, fullSampleMs: gpu, applyThemeMedianMs: theme, scene };
}

const result = {
  measuredAt: new Date().toISOString().slice(0, 10),
  machine: cpus()[0]?.model,
  browser: 'Chromium through Playwright, Metal backend',
  viewport: '1440 × 900',
  runs: [await run(1), await run(2)],
};
mkdirSync('docs', { recursive: true });
writeFileSync('docs/performance.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 1));
await browser.close();
