import { expect } from '@playwright/test';
import { PNG } from 'pngjs';

export const store = (page, code) => page.evaluate(`(() => { const s = window.__build.store.getState(); ${code} })()`);
export const buildState = (page) => page.evaluate(() => window.__build.store.getState().build);

/** Opens the app with the intro skipped and waits until it's fully interactive. */
export async function openApp(page, { path = '/', theme } = {}) {
  await page.goto(`${path}?instant&debug`);
  await page.waitForFunction(() => window.__build?.runtime?.intro === 'done', null, { timeout: 45_000 });
  if (theme) await page.evaluate((t) => window.__build.settings.getState().setAppearance(t), theme);
  await waitForRefined(page);
}

/** Waits for the progressive renderer to finish, so that screenshots compare fairly. */
export async function waitForRefined(page) {
  await page.waitForTimeout(250);
  await page.waitForFunction(() => window.__build.runtime.view.converged === true, null, { timeout: 30_000 });
}

/** Average colour of a screen region, from a real browser screenshot. */
export async function regionColor(page, { x, y, width, height }) {
  const png = PNG.sync.read(await page.screenshot());
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const i = (py * png.width + px) * 4;
      r += png.data[i];
      g += png.data[i + 1];
      b += png.data[i + 2];
      n += 1;
    }
  }
  return [r / n, g / n, b / n];
}

export const colorDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Percentage of pixels in the open area of the studio that differ between two states. */
export async function changedArea(page, before, region = { x: 360, y: 90, width: 760, height: 720 }) {
  const a = PNG.sync.read(before);
  const b = PNG.sync.read(await page.screenshot());
  let changed = 0;
  for (let py = region.y; py < region.y + region.height; py += 1) {
    for (let px = region.x; px < region.x + region.width; px += 1) {
      const i = (py * a.width + px) * 4;
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d > 24) changed += 1;
    }
  }
  return (changed / (region.width * region.height)) * 100;
}

/** Screen position of a key on the 3D model. */
export function keyPosition(page, keyId) {
  return page.evaluate((id) => {
    const { runtime } = window.__build;
    const key = runtime.parts.caps.layout.keyById.get(id);
    return runtime.camera.projectLocal(key.cx, 14, key.cz);
  }, keyId);
}

/** Fails a test on a browser error, while ignoring a known library deprecation notice. */
export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return {
    assertNone: () => expect(errors, errors.join('\n')).toEqual([]),
  };
}
