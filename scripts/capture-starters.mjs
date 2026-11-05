// Renders the gallery's starter pictures with the real app, so each one is a true image of its build.
// Run with a server on BASE_URL (default: the production preview on port 5201).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { STARTER_BUILDS } from '../src/catalog/starters.js';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5201';
mkdirSync('public/starters', { recursive: true });

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/?instant&debug`);
await page.waitForFunction(() => window.__build?.runtime?.intro === 'done', null, { timeout: 45_000 });

for (const starter of STARTER_BUILDS) {
  await page.evaluate((build) => window.__build.store.getState().loadBuild(build), starter.build);
  await page.waitForTimeout(1600);
  const dataUrl = await page.evaluate(() => window.__build.renderThumbnail({ width: 1440, height: 900, samples: 96 }));
  const out = `public${starter.image}`;
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', out);
}
await browser.close();
