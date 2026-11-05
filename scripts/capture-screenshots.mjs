// Captures the README's screenshots from the real app, against the production preview.
// Usage: npm run build && npx vite preview --port 5201 & npm run screenshots
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { STARTER_BUILDS } from '../src/catalog/starters.js';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5201';
const out = 'docs/screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5, ...options });
  const page = await context.newPage();
  await page.goto(`${base}/?instant&debug`);
  await page.waitForFunction(() => window.__build?.runtime?.intro === 'done', null, { timeout: 45_000 });
  return { page, context };
}

const refined = async (page) => {
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => window.__build.runtime.view.converged === true, null, { timeout: 30_000 });
};
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const load = (page, id) =>
  page.evaluate((build) => window.__build.store.getState().loadBuild(build), STARTER_BUILDS.find((s) => s.id === id).build);

{
  const { page, context } = await open();
  await refined(page);
  await shot(page, 'studio');

  await page.evaluate(() => window.__build.store.getState().setUi({ cinematic: true }));
  await page.waitForTimeout(1200);
  await refined(page);
  await shot(page, 'hero');
  await page.evaluate(() => window.__build.store.getState().setUi({ cinematic: false }));

  await load(page, 'starter-matcha-65');
  await page.getByTestId('category-keycaps').click();
  await page.locator('[data-key="Enter"]').click();
  await page.getByTestId('key-color').fill('#AE362B');
  await refined(page);
  await shot(page, 'keycap-editor');
  await page.evaluate(() => window.__build.store.getState().clearSelection());

  await load(page, 'starter-cream-75');
  await page.getByTestId('nav-explore').click();
  await page.getByTestId('explode').click();
  await page.waitForFunction(() => window.__build.runtime.explode.progress === 1, null, { timeout: 10_000 });
  await refined(page);
  await shot(page, 'exploded');

  await page.getByTestId('layer-pcb').click();
  await refined(page);
  await shot(page, 'inspect-pcb');
  await page.getByTestId('assemble').click();
  await page.waitForFunction(() => window.__build.runtime.explode.progress === 0, null, { timeout: 10_000 });

  await page.getByTestId('explore-macro').click();
  await page.getByTestId('macro-switch').selectOption('sw-ridge');
  await page.waitForTimeout(800);
  const button = await page.getByTestId('macro-press').boundingBox();
  await page.mouse.move(button.x + 40, button.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await shot(page, 'switch-macro');
  await page.mouse.up();
  await page.getByTestId('close-macro').click();

  await page.getByTestId('open-tester').click();
  await page.waitForTimeout(1500);
  await page.keyboard.type('make it yours', { delay: 18 });
  await page.keyboard.down('KeyF');
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(400);
  await shot(page, 'tester');
  await page.keyboard.up('KeyF');
  await page.keyboard.up('KeyJ');
  await page.getByTestId('close-tester').click();

  await page.getByTestId('nav-configure').click();
  await page.evaluate(() => {
    const s = window.__build.store.getState();
    s.choose('layout', 'tkl');
    s.choose('case', 'case-polycarbonate');
    s.setUi({ category: 'case' });
  });
  await refined(page);
  await shot(page, 'compatibility');
  await context.close();
}

{
  const { page, context } = await open();
  await page.evaluate(() => {
    window.__build.settings.getState().setAppearance('dark');
    const s = window.__build.store.getState();
    s.choose('lighting', 'per-key');
    s.setLighting({ color: '#FF9A5C', brightness: 1 });
    s.setUi({ category: 'lighting' });
  });
  await refined(page);
  await shot(page, 'dark-lighting');
  await context.close();
}

{
  const { page, context } = await open();
  await load(page, 'starter-ice-60');
  await page.getByTestId('toolbar-studio').click();
  await refined(page);
  await shot(page, 'studio-mode');
  await context.close();
}

{
  const { page, context } = await open();
  await page.getByTestId('nav-gallery').click();
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('img').forEach((img) => (img.loading = 'eager')));
  await page.waitForTimeout(600);
  await shot(page, 'gallery');
  await context.close();
}

{
  const { page, context } = await open({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.waitForTimeout(1600);
  await page.getByTestId('mobile-customize').tap();
  await page.waitForTimeout(1200);
  await shot(page, 'phone');
  await context.close();
}

console.log('saved to', out);
await browser.close();
