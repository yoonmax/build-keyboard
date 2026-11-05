import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import {
  buildState,
  changedArea,
  colorDistance,
  keyPosition,
  openApp,
  regionColor,
  store,
  trackErrors,
  waitForRefined,
} from './helpers.js';

test.describe('first load', () => {
  test('renders a real keyboard, with live data', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    await expect(page.getByTestId('wordmark')).toHaveText('BUILD');
    await expect(page.getByTestId('compat-summary')).toContainText('Everything fits');
    await expect(page.getByTestId('price-total')).toContainText('$');

    const scene = await page.evaluate(() => {
      const { runtime } = window.__build;
      return {
        keys: runtime.parts.caps.layout.keyCount,
        calls: runtime.stats.calls,
        triangles: runtime.stats.triangles,
      };
    });
    expect(scene.keys).toBe(84);
    expect(scene.triangles).toBeGreaterThan(100_000);
    // Instancing should hold draw calls far below one per part.
    expect(scene.calls).toBeLessThan(140);

    // The product is present: its dark case is in the frame, unlike the pale studio.
    const png = PNG.sync.read(await page.screenshot());
    let dark = 0;
    for (let y = 90; y < 800; y += 3) {
      for (let x = 360; x < 1120; x += 3) {
        const i = (y * png.width + x) * 4;
        if (png.data[i] < 70 && png.data[i + 1] < 70 && png.data[i + 2] < 70) dark += 1;
      }
    }
    expect(dark).toBeGreaterThan(800);
    errors.assertNone();
  });

  test('plays the opening when motion is allowed, and finishes with usable controls', async ({ page }) => {
    await page.goto('/?debug');
    await page.waitForFunction(() => window.__build?.runtime?.intro === 'playing', null, { timeout: 45_000 });
    await page.waitForFunction(() => window.__build.runtime.intro === 'done', null, { timeout: 15_000 });
    await expect(page.getByTestId('loader')).toBeHidden();
    await expect(page.getByTestId('category-layout')).toBeVisible();
  });

  test('stops drawing once the picture has refined', async ({ page }) => {
    await openApp(page);
    await page.waitForTimeout(400);
    const start = await page.evaluate(() => window.__build.runtime.stats.renderedFrames);
    await page.waitForTimeout(800);
    const end = await page.evaluate(() => window.__build.runtime.stats.renderedFrames);
    expect(end - start).toBe(0);
  });

  test('refines by accumulating samples, then reports convergence', async ({ page }) => {
    await openApp(page);
    const view = await page.evaluate(() => {
      const { samples, maxSamples, converged } = window.__build.runtime.view;
      return { samples, maxSamples, converged };
    });
    expect(view.converged).toBe(true);
    expect(view.samples).toBe(view.maxSamples);
  });
});

test.describe('layouts', () => {
  test('switching rebuilds every part from the data', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    await page.getByTestId('category-layout').waitFor();
    const expectations = [
      ['60', 61],
      ['65', 68],
      ['tkl', 87],
      ['75', 84],
    ];
    for (const [id, count] of expectations) {
      const before = await page.getByTestId('price-Switches').textContent();
      await page.getByTestId(`layout-${id}`).click();
      await expect(page.getByTestId('price-Switches')).not.toHaveText(before);
      const state = await page.evaluate(() => {
        const { runtime } = window.__build;
        return {
          caps: runtime.parts.caps.layout.keyCount,
          instances: runtime.parts.caps.buckets.reduce((sum, b) => sum + b.mesh.count, 0),
          stems: runtime.parts.stems.count,
        };
      });
      expect(state.caps).toBe(count);
      expect(state.instances).toBe(count);
      expect(state.stems).toBe(count);
    }
    errors.assertNone();
  });

  test('a TKL is visibly a different board', async ({ page }) => {
    await openApp(page);
    const before = await page.screenshot();
    await page.getByTestId('layout-tkl').click();
    await page.waitForTimeout(1200);
    await waitForRefined(page);
    expect(await changedArea(page, before)).toBeGreaterThan(5);
  });
});

test.describe('case', () => {
  test('changing colour changes the pixels, and the data', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('view-front').click();
    await page.waitForTimeout(1500);
    await waitForRefined(page);
    const position = await page.evaluate(() => {
      const { runtime } = window.__build;
      return runtime.camera.projectLocal(0, -6, 75);
    });
    const region = { x: Math.round(position.x) - 40, y: Math.round(position.y) - 3, width: 80, height: 6 };
    const black = await regionColor(page, region);

    await page.getByTestId('category-case').click();
    await page.getByTestId('case-color-sage').click();
    await page.waitForTimeout(900);
    await waitForRefined(page);
    const sage = await regionColor(page, region);

    expect((await buildState(page)).case.colorId).toBe('sage');
    expect(colorDistance(black, sage)).toBeGreaterThan(30);
    // Sage reads green, not gray.
    expect(sage[1]).toBeGreaterThan(sage[0]);
  });

  test('a custom colour is validated and used', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('category-case').click();
    await page.getByTestId('case-color-custom').click();
    await page.getByTestId('case-custom-color').fill('#AA3355');
    expect((await buildState(page)).case.customColor).toBe('#AA3355');
    await page.getByTestId('case-custom-color').fill('nonsense');
    expect((await buildState(page)).case.customColor).toBe('#AA3355');
  });

  test('swapping material changes the shader values on the real material', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('category-case').click();
    const material = () =>
      page.evaluate(() => {
        const m = window.__build.runtime.parts.layers.upperCase.children[0].material;
        return { metalness: m.metalness, transmission: m.transmission };
      });
    expect((await material()).metalness).toBe(1);
    await page.getByTestId('option-case-frosted').click();
    await page.waitForTimeout(800);
    const frosted = await material();
    expect(frosted.metalness).toBeLessThan(0.05);
    expect(frosted.transmission).toBeGreaterThan(0.8);
  });
});

test.describe('keycaps', () => {
  test('a theme changes colour without rebuilding the meshes', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('category-keycaps').click();
    const before = await page.evaluate(() => {
      const caps = window.__build.runtime.parts.caps;
      caps.buckets[0].mesh.userData.marker = 'same-mesh';
      return caps.colorTarget[0];
    });
    await page.getByTestId('theme-graphite').click();
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => {
      const caps = window.__build.runtime.parts.caps;
      return { color: caps.colorTarget[0], marker: caps.buckets[0].mesh.userData.marker };
    });
    expect(after.color).not.toBe(before);
    expect(after.marker).toBe('same-mesh');
    expect((await buildState(page)).keycaps.themeId).toBe('graphite');
  });

  test('clicking a key on the 3D model selects that key', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('category-keycaps').click();
    const point = await keyPosition(page, 'KeyG');
    await page.mouse.click(point.x, point.y);
    await expect(page.getByTestId('part-title')).toHaveText('G keycap');
    await expect(page.getByTestId('key-edit')).toContainText('G selected');
  });

  test('shift-click builds a selection, and editing it updates the instances and data', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('category-keycaps').click();
    const g = await keyPosition(page, 'KeyG');
    const h = await keyPosition(page, 'KeyH');
    await page.mouse.click(g.x, g.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(h.x, h.y);
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('part-title')).toHaveText('2 keycaps');
    await page.getByTestId('key-color').fill('#B0362B');

    const overrides = (await buildState(page)).keycaps.overrides;
    expect(overrides.KeyG.color).toBe('#B0362B');
    expect(overrides.KeyH.color).toBe('#B0362B');
    expect(overrides.KeyJ).toBeUndefined();
    await page.waitForTimeout(600);
    const after = await keyPosition(page, 'KeyG');
    await page.waitForTimeout(200);
    const color = await regionColor(page, { x: Math.round(after.x) + 8, y: Math.round(after.y) + 8, width: 4, height: 4 });
    expect(color[0]).toBeGreaterThan(color[1] + 20);

    await page.getByTestId('key-reset').click();
    expect((await buildState(page)).keycaps.overrides.KeyG).toBeUndefined();
  });

  test('the key plan works with no pointer on the canvas at all', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('category-keycaps').click();
    const key = page.locator('[data-key="Enter"]');
    await key.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('key-edit')).toContainText('Enter selected');
    await page.getByTestId('group-alpha').click();
    await expect(page.getByTestId('key-edit')).toContainText('keys selected');
    await page.getByTestId('key-material-abs').click();
    const overrides = (await buildState(page)).keycaps.overrides;
    expect(overrides.KeyA.material).toBe('abs');
  });

  test('changing the profile changes the geometry', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('category-keycaps').click();
    const height = () =>
      page.evaluate(() => {
        const caps = window.__build.runtime.parts.caps;
        return caps.profileId;
      });
    expect(await height()).toBe('sculpted');
    await page.getByTestId('option-caps-uniform').click();
    await page.waitForFunction(() => window.__build.runtime.parts.caps?.profileId === 'uniform');
  });
});

test.describe('switches and compatibility', () => {
  test('selecting a switch updates the build, travel and cost', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('category-switches').click();
    const before = await page.getByTestId('price-total').textContent();
    await page.getByTestId('option-sw-keel').click();
    await expect(page.getByTestId('price-total')).not.toHaveText(before);
    const travel = await page.evaluate(() => window.__build.runtime.keys.maxTravel);
    expect(travel).toBeCloseTo(3.8);
  });

  test('warns before an incompatible pick, reports it after, and offers a working fix', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('layout-tkl').click();
    await page.getByTestId('category-case').click();
    await expect(page.getByTestId('option-case-frosted')).toHaveAttribute('data-status', 'error');
    await page.getByTestId('option-case-frosted').click();
    await expect(page.getByTestId('compat-summary')).toHaveAttribute('data-status', 'error');
    await expect(page.getByTestId('compat-issue').first()).toContainText("isn't made for a TKL board");
    await expect(page.getByTestId('price-total')).toContainText('incomplete');
    await page.getByTestId('fix-case-anodized').click();
    await expect(page.getByTestId('compat-summary')).toHaveAttribute('data-status', 'valid');
  });
});

test.describe('exploded view', () => {
  test('separates the layers in order, and comes back together exactly', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    const before = await page.screenshot();
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('explode').click();
    await page.waitForFunction(() => window.__build.runtime.explode.progress === 1, null, { timeout: 8000 });
    const offsets = await page.evaluate(() => {
      const { layers } = window.__build.runtime.parts;
      return {
        upperCase: layers.upperCase.position.y,
        switches: layers.switches.position.y,
        plate: layers.plate.position.y,
        pcb: layers.pcb.position.y,
        lowerCase: layers.lowerCase.position.y,
      };
    });
    expect(offsets.upperCase).toBeGreaterThan(offsets.switches);
    expect(offsets.switches).toBeGreaterThan(offsets.plate);
    expect(offsets.plate).toBeGreaterThan(offsets.pcb);
    expect(offsets.pcb).toBeGreaterThan(offsets.lowerCase);
    expect(offsets.lowerCase).toBe(0);

    await expect(page.locator('.explode-label', { hasText: 'PCB' })).toBeVisible();
    await page.waitForTimeout(800);
    await waitForRefined(page);
    expect(await changedArea(page, before)).toBeGreaterThan(10);

    await page.getByTestId('assemble').click();
    await page.waitForFunction(() => window.__build.runtime.explode.progress === 0, null, { timeout: 8000 });
    const closed = await page.evaluate(() => window.__build.runtime.parts.layers.upperCase.position.y);
    expect(closed).toBe(0);
    errors.assertNone();
  });

  test('can be paused, scrubbed and re-spaced', async ({ page }) => {
    await openApp(page, { path: '/' });
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('explode').click();
    await page.waitForFunction(() => window.__build.runtime.explode.progress > 0.15);
    await page.getByTestId('explode-pause').click();
    const paused = await page.evaluate(() => window.__build.runtime.explode.progress);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__build.runtime.explode.progress)).toBe(paused);

    await page.getByTestId('explode-scrub').fill('1');
    // The position updates on the next rendered frame, so wait for the part and not the timeline.
    await page.waitForFunction(() => window.__build.runtime.parts.layers.plate.position.y > 165);
    const wide = await page.evaluate(() => window.__build.runtime.parts.layers.plate.position.y);
    await page.getByTestId('explode-separation').fill('0.5');
    await page.waitForFunction((w) => window.__build.runtime.parts.layers.plate.position.y < w, wide);
  });

  test('labels only name parts in this build', async ({ page }) => {
    await openApp(page);
    await store(page, `s.choose('accessory', 'acc-foam')`);
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('explode').click();
    await page.waitForFunction(() => window.__build.runtime.explode.progress > 0.5);
    await expect(page.locator('.explode-label', { hasText: 'Plate foam' })).toHaveCount(0);
    await expect(page.getByTestId('layer-plateFoam')).toHaveCount(0);
    await expect(page.locator('.explode-label', { hasText: 'Plate' })).toHaveCount(1);
  });
});

test.describe('inspection', () => {
  test('each part has its own details, and internal parts open the board', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('layer-plate').click();
    await expect(page.getByTestId('part-detail')).toHaveAttribute('data-kind', 'plate');
    await expect(page.getByTestId('part-detail')).toContainText('Switch cutouts');
    await page.waitForFunction(() => window.__build.runtime.explode.progress > 0.1);

    await page.getByTestId('layer-pcb').click();
    await expect(page.getByTestId('part-detail')).toHaveAttribute('data-kind', 'pcb');
    await page.getByTestId('layer-switches').click();
    await expect(page.getByTestId('part-detail')).toContainText('Actuation force');
    await expect(page.getByTestId('part-detail')).toContainText(/representative/i);
  });

  test('clicking the case in 3D selects it and moves the camera', async ({ page }) => {
    await openApp(page);
    const point = await page.evaluate(() => window.__build.runtime.camera.projectLocal(0, -1.5, 76));
    const start = await page.evaluate(() => window.__build.runtime.camera.distance());
    await page.mouse.click(point.x, point.y);
    await expect(page.getByTestId('part-detail')).toHaveAttribute('data-kind', 'case');
    await page.waitForTimeout(1300);
    const end = await page.evaluate(() => window.__build.runtime.camera.distance());
    expect(Math.abs(end - start)).toBeGreaterThan(1);
  });

  test('isolating shows one part only', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('layer-plate').click();
    await page.getByTestId('isolate').check({ force: true });
    const visible = await page.evaluate(() =>
      Object.entries(window.__build.runtime.parts.layers).filter(([, g]) => g.visible).map(([id]) => id),
    );
    expect(visible).toEqual(['plate']);
    await page.getByTestId('isolate').uncheck({ force: true });
  });

  test('macro view presses the switch and tracks the curve', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('explore-macro').click();
    await page.getByTestId('macro-switch').selectOption('sw-tick');
    await expect(page.getByTestId('macro-state')).toContainText('Contacts open');

    const marker = () => page.getByTestId('curve-marker').getAttribute('transform');
    const start = await marker();
    const button = await page.getByTestId('macro-press').boundingBox();
    await page.mouse.move(button.x + 20, button.y + 10);
    await page.mouse.down();
    await expect(page.getByTestId('macro-state')).toContainText('Contacts closed');
    await expect(page.getByTestId('macro-travel')).toContainText('4.00 mm');
    expect(await marker()).not.toBe(start);
    await page.mouse.up();
    await expect(page.getByTestId('macro-state')).toContainText('Contacts open');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('switch-macro')).toHaveCount(0);
    errors.assertNone();
  });
});

test.describe('keyboard tester', () => {
  test('presses the matching keys, with simultaneous and held keys', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('open-tester').click();
    await page.waitForTimeout(300);

    const travel = (id) =>
      page.evaluate((keyId) => {
        const { runtime } = window.__build;
        const key = runtime.parts.caps.layout.keyById.get(keyId);
        return runtime.keys.travel[key.index];
      }, id);

    await page.keyboard.down('KeyA');
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(250);
    expect(await travel('KeyA')).toBeGreaterThan(3.5);
    expect(await travel('KeyS')).toBeGreaterThan(3.5);
    expect(await travel('KeyD')).toBeLessThan(0.1);
    await expect(page.getByTestId('tester-held')).toHaveText('2');

    // The stem and cap stay on one position, moved together.
    const motion = await page.evaluate(() => {
      const { runtime } = window.__build;
      const key = runtime.parts.caps.layout.keyById.get('KeyA');
      return {
        stem: runtime.parts.stems.instanceMatrix.array[key.index * 16 + 13],
        travel: runtime.keys.travel[key.index],
      };
    });
    expect(motion.stem).toBeCloseTo(-motion.travel, 1);

    await page.keyboard.up('KeyA');
    await page.keyboard.up('KeyS');
    await page.waitForTimeout(350);
    expect(await travel('KeyA')).toBeLessThan(0.3);
    await expect(page.getByTestId('tester-held')).toHaveText('0');
    await expect(page.getByTestId('tester-peak')).toHaveText('2');
    await expect(page.getByTestId('tester-text')).toHaveValue('as');
  });

  test('key repeat does not count as more presses', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('open-tester').click();
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const fire = (type, repeat) =>
        window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyQ', key: 'q', repeat, bubbles: true }));
      fire('keydown', false);
      fire('keydown', true);
      fire('keydown', true);
      fire('keydown', true);
    });
    await expect(page.getByTestId('tester-presses')).toHaveText('1');
  });

  test('releases everything when the window loses focus', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('open-tester').click();
    await page.waitForTimeout(200);
    await page.keyboard.down('KeyW');
    await expect(page.getByTestId('tester-held')).toHaveText('1');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByTestId('tester-held')).toHaveText('0');
    await page.keyboard.up('KeyW');
  });

  test('explains keys that are not on this layout', async ({ page }) => {
    await openApp(page);
    await store(page, `s.choose('layout', '60')`);
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('open-tester').click();
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.tester-note')).toContainText("ArrowUp isn't on a 60% board");
  });

  test('plays sound through Web Audio, and respects mute', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('open-tester').click();
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyF');
    const state = await page.evaluate(async () => {
      const { keyboardAudio } = window.__build;
      await keyboardAudio.context.resume();
      return { state: keyboardAudio.context.state, cached: keyboardAudio.cache.size, voices: keyboardAudio.activeVoices };
    });
    expect(state.state).toBe('running');
    expect(state.cached).toBeGreaterThan(0);

    await page.getByTestId('mute').check({ force: true });
    const cacheBefore = await page.evaluate(() => window.__build.keyboardAudio.counter);
    await page.keyboard.press('KeyJ');
    expect(await page.evaluate(() => window.__build.keyboardAudio.counter)).toBe(cacheBefore);
    await page.getByTestId('mute').uncheck({ force: true });
  });

  test('limits voices during very fast typing', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('open-tester').click();
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyF');
    const voices = await page.evaluate(() => {
      const { keyboardAudio } = window.__build;
      for (let i = 0; i < 200; i += 1) keyboardAudio.play({ stroke: 'down' });
      return keyboardAudio.activeVoices;
    });
    expect(voices).toBeLessThanOrEqual(24);
  });
});

test.describe('saving and the gallery', () => {
  test('saves a build with a real thumbnail, and loads it back identically', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    await store(page, `s.choose('layout', '65'); s.setCaseColor('navy'); s.editKeys(['KeyA'], { color: '#B0362B' }); s.applyKeycapTheme`);
    await page.getByTestId('build-name').fill('Blue Test');
    await page.waitForTimeout(800);
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast')).toContainText('Saved "Blue Test"');
    const saved = await buildState(page);

    await page.getByTestId('nav-gallery').click();
    const card = page.getByTestId('build-card').first();
    await expect(card).toContainText('Blue Test');
    await expect(card).toContainText('65% ANSI');
    await expect(card).toContainText('Navy anodized aluminum');
    await expect(card).toContainText('Drift');
    await expect(card.getByTestId('gallery-price')).toContainText('$');

    const size = await card.getByTestId('build-thumb').evaluate(async (img) => {
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight, src: img.src.slice(0, 15) };
    });
    expect(size.width).toBeGreaterThan(400);
    expect(size.src).toMatch(/^data:image/);

    // The thumbnail is a picture of this build: it holds a lot of the case's navy.
    await expect(card.getByTestId('build-thumb')).toBeVisible();

    // Change the current build, then open the saved one.
    await store(page, `s.choose('layout', 'tkl'); s.markSaved(s.savedId)`);
    await card.getByTestId('build-open').click();
    await expect(page.getByTestId('build-name')).toHaveValue('Blue Test');
    expect(await buildState(page)).toEqual(saved);
    errors.assertNone();
  });

  test('survives a reload, and can be duplicated and deleted', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('build-name').fill('Keeper');
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast')).toContainText('Saved');
    await page.reload();
    await page.waitForFunction(() => window.__build?.runtime?.intro === 'done');
    await page.getByTestId('nav-gallery').click();
    await expect(page.getByTestId('build-card').first()).toContainText('Keeper');

    await page.getByTestId('build-duplicate').first().click();
    await expect(page.locator('.build-name-title', { hasText: 'Keeper copy' })).toBeVisible();

    const saved = page.locator('[data-testid="build-card"]:not([data-starter])');
    const count = await saved.count();
    await saved.first().getByTestId('build-delete').click();
    await saved.first().getByTestId('build-delete-confirm').click();
    await expect(saved).toHaveCount(count - 1);
  });

  test('shows an invitation when empty, and starters ready to open', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('nav-gallery').click();
    await expect(page.getByTestId('gallery-empty')).toBeVisible();
    const starters = page.locator('[data-testid="build-card"][data-starter]');
    expect(await starters.count()).toBeGreaterThanOrEqual(4);
    const loaded = await starters.first().getByTestId('build-thumb').evaluate(async (img) => {
      img.loading = 'eager';
      await img.decode();
      return img.naturalWidth;
    });
    expect(loaded).toBeGreaterThan(400);
    await starters.first().getByTestId('build-open').click();
    await expect(page.getByTestId('build-name')).toHaveValue('Studio Graphite');
    await expect(page.getByTestId('compat-summary')).toHaveAttribute('data-status', /valid|warning/);
  });
});

test.describe('exporting', () => {
  test('exports a PNG at the exact size chosen, showing this keyboard', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    await page.getByTestId('toolbar-studio').click();
    await page.getByTestId('export-size').selectOption('custom');
    await page.getByTestId('export-width').fill('1600');
    await page.getByTestId('export-height').fill('900');
    await page.getByTestId('export-quality').selectOption('draft');
    const download = page.waitForEvent('download');
    await page.getByTestId('export-png').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('untitled-build.png');
    const png = PNG.sync.read(readFileSync(await file.path()));
    expect(png.width).toBe(1600);
    expect(png.height).toBe(900);

    let dark = 0;
    let light = 0;
    for (let y = 0; y < png.height; y += 5) {
      for (let x = 0; x < png.width; x += 5) {
        const i = (y * png.width + x) * 4;
        const v = png.data[i] + png.data[i + 1] + png.data[i + 2];
        if (v < 180) dark += 1;
        if (v > 600) light += 1;
      }
    }
    expect(dark).toBeGreaterThan(300);
    expect(light).toBeGreaterThan(5000);
    await expect(page.getByTestId('toast')).toContainText('Exported 1600 × 900 PNG');
    errors.assertNone();
  });

  test('exports above screen resolution without disturbing the live view', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('toolbar-studio').click();
    await page.getByTestId('export-size').selectOption('4k');
    await page.getByTestId('export-quality').selectOption('draft');
    const download = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByTestId('export-png').click();
    const file = await download;
    const png = PNG.sync.read(readFileSync(await file.path()));
    expect(png.width).toBe(3840);
    expect(png.height).toBe(2160);
    await waitForRefined(page);
    const viewport = await page.evaluate(() => {
      const c = document.querySelector('.scene-canvas canvas');
      return { width: c.clientWidth, height: c.clientHeight };
    });
    expect(viewport).toEqual({ width: 1440, height: 900 });
  });

  test('refuses sizes it cannot do, with a reason', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('toolbar-studio').click();
    await page.getByTestId('export-size').selectOption('custom');
    await page.getByTestId('export-width').fill('9000');
    await expect(page.getByTestId('export-size-error')).toContainText('at most');
    await expect(page.getByTestId('export-png')).toBeDisabled();
  });

  test('can be cancelled and keeps the page responsive while it runs', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('toolbar-studio').click();
    await page.getByTestId('export-quality').selectOption('best');
    await page.getByTestId('export-png').click();
    await page.getByTestId('export-cancel').click();
    await expect(page.getByTestId('export-png')).toBeVisible();
    await expect(page.getByTestId('export-error')).toHaveCount(0);
  });

  test('downloads a configuration that imports back identically', async ({ page }) => {
    await openApp(page);
    await store(page, `s.choose('layout', '60'); s.editKeys(['KeyA'], { color: '#112233', material: 'abs' })`);
    const original = await buildState(page);
    await page.getByTestId('export').click();
    const download = page.waitForEvent('download');
    await page.getByTestId('export-json').click();
    const file = await download;
    const text = readFileSync(await file.path(), 'utf8');
    expect(JSON.parse(text).format).toBe('build-keyboard-configuration');

    await store(page, `s.resetBuild()`);
    const input = page.getByTestId('import-file');
    const path = join(tmpdir(), `build-${Date.now()}.json`);
    writeFileSync(path, text);
    await input.setInputFiles(path);
    await expect(page.getByTestId('toast')).toContainText('Imported');
    expect(await buildState(page)).toEqual(original);
  });

  test('rejects bad imports and leaves the build alone', async ({ page }) => {
    await openApp(page);
    const original = await buildState(page);
    await page.getByTestId('export').click();
    const input = page.getByTestId('import-file');
    const bad = join(tmpdir(), `bad-${Date.now()}.json`);

    writeFileSync(bad, '{ not json');
    await input.setInputFiles(bad);
    await expect(page.getByTestId('import-error')).toContainText('not valid JSON');

    writeFileSync(bad, JSON.stringify({ ...original, switchId: 'sw-imaginary' }));
    await input.setInputFiles(bad);
    await expect(page.getByTestId('import-error')).toContainText('sw-imaginary');

    expect(await buildState(page)).toEqual(original);
  });

  test('renders a build sheet', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('export').click();
    const download = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByTestId('export-sheet-image').click();
    const file = await download;
    expect(file.suggestedFilename()).toContain('build-sheet');
    const png = PNG.sync.read(readFileSync(await file.path()));
    expect(png.width).toBe(2480);
    expect(png.height).toBe(3508);
  });

  test('shows the specification, with the required fields', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('open-spec').click();
    const sheet = page.getByTestId('spec-sheet');
    for (const label of ['Layout', 'Case material', 'Case finish', 'Keycap profile', 'Keycap colours', 'Switch type', 'Plate material', 'Stabilizer configuration', 'Compatibility status', 'Estimated total cost']) {
      await expect(sheet).toContainText(label);
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });
});

test.describe('camera', () => {
  test('moves between views, and never ends up inside the keyboard', async ({ page }) => {
    await openApp(page);
    for (const view of ['top', 'side', 'front', 'rear', 'macro', 'threeQuarter', 'hero']) {
      await page.getByTestId(`view-${view}`).click();
      await page.waitForTimeout(1250);
      const position = await page.evaluate(() => window.__build.runtime.camera.position());
      const outside = Math.abs(position[0]) > 190 || position[1] > 40 || Math.abs(position[2]) > 100;
      expect(outside, view).toBe(true);
      expect(position[1]).toBeGreaterThan(0);
    }
  });

  test('stays out of the keyboard when zoomed all the way in', async ({ page }) => {
    await openApp(page);
    await page.mouse.move(720, 450);
    for (let i = 0; i < 30; i += 1) {
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(500);
    const position = await page.evaluate(() => window.__build.runtime.camera.position());
    const inside = Math.abs(position[0]) < 160 && position[1] < 26 && Math.abs(position[2]) < 80;
    expect(inside).toBe(false);
  });

  test('hiding the panels leaves only the keyboard and a way back', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('toolbar-hide').click();
    await expect(page.getByTestId('category-layout')).toHaveCount(0);
    await expect(page.getByTestId('compat-summary')).toHaveCount(0);
    await page.getByTestId('toolbar-hide').click();
    await expect(page.getByTestId('category-layout')).toBeVisible();
  });
});

test.describe('interface', () => {
  test('dark mode changes the interface and the studio', async ({ page }) => {
    await openApp(page);
    const before = await regionColor(page, { x: 20, y: 840, width: 40, height: 20 });
    await page.getByTestId('toggle-appearance').click();
    await page.waitForTimeout(500);
    await waitForRefined(page);
    const after = await regionColor(page, { x: 20, y: 840, width: 40, height: 20 });
    expect(before[0]).toBeGreaterThan(180);
    expect(after[0]).toBeLessThan(60);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('undo and redo work from the keyboard', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('layout-60').click();
    await page.mouse.click(720, 880);
    await page.keyboard.press('Control+z');
    expect((await buildState(page)).layoutId).toBe('75');
    await page.keyboard.press('Control+Shift+z');
    expect((await buildState(page)).layoutId).toBe('60');
  });

  test('keeps focus inside a dialog and hands it back on close', async ({ page }) => {
    await openApp(page);
    const opener = page.getByTestId('open-spec');
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('modal-close')).toBeFocused();
    for (let i = 0; i < 8; i += 1) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => Boolean(document.activeElement.closest('[data-testid="spec-sheet"]')));
    expect(inside).toBe(true);
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  });

  test('stays stable at a very low frame rate', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('nav-explore').click();
    await page.getByTestId('open-tester').click();
    await page.waitForTimeout(300);
    await page.keyboard.down('KeyK');
    const readings = await page.evaluate(async () => {
      const { runtime } = window.__build;
      const key = runtime.parts.caps.layout.keyById.get('KeyK');
      const out = [];
      for (let i = 0; i < 12; i += 1) {
        await new Promise((r) => setTimeout(r, 50));
        out.push(runtime.keys.travel[key.index]);
      }
      return out;
    });
    await page.keyboard.up('KeyK');
    const settled = readings.slice(-4);
    for (const value of settled) expect(value).toBeGreaterThan(3.9);
    for (const value of readings) expect(value).toBeGreaterThanOrEqual(-0.25);
  });

  test('can run at low quality, with no shadows or refinement', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    await page.getByTestId('toolbar-studio').click();
    await page.getByTestId('render-quality').selectOption('low');
    await page.waitForFunction(() => window.__build.runtime.view.samples === 1 && window.__build.runtime.view.converged);
    const state = await page.evaluate(() => ({
      cast: window.__build.runtime.parts.keyLight.castShadow,
      resolved: window.__build.settings.getState().resolvedQuality,
    }));
    expect(state).toEqual({ cast: false, resolved: 'low' });
    await page.getByTestId('render-quality').selectOption('auto');
    errors.assertNone();
  });

  test('every control can be reached and named', async ({ page }) => {
    await openApp(page);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('button, a[href], input, select, textarea')]
        .filter((el) => {
          const label = el.getAttribute('aria-label') || el.textContent?.trim() || el.title || el.labels?.[0]?.textContent;
          return !label && el.type !== 'file';
        })
        .map((el) => el.outerHTML.slice(0, 100)),
    );
    expect(unnamed).toEqual([]);

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON', 'INPUT']).toContain(focused);
  });

  test('respects reduced motion by skipping the opening and camera moves', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('/?debug');
    await page.waitForFunction(() => window.__build?.runtime?.intro === 'done', null, { timeout: 45_000 });
    await expect(page.getByTestId('loader')).toBeHidden();
    await page.getByTestId('view-top').click();
    await page.waitForTimeout(100);
    const position = await page.evaluate(() => window.__build.runtime.camera.position());
    expect(position[1]).toBeGreaterThan(600);
    await context.close();
  });

  test('keeps everything reachable on a phone, with no sideways scroll', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await openApp(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('save')).toBeVisible();
    await expect(page.getByTestId('export')).toBeVisible();

    await page.getByTestId('mobile-customize').tap();
    await expect(page.getByTestId('category-layout')).toBeVisible();
    const drawer = await page.locator('.sidebar').boundingBox();
    expect(drawer.y).toBeGreaterThan(844 * 0.35);
    await page.getByTestId('category-case').tap();
    await page.getByTestId('case-color-sage').tap();
    expect((await buildState(page)).case.colorId).toBe('sage');
    await context.close();
  });

  test('gives a clear message if the 3D view fails', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function patched(type, ...rest) {
        if (type === 'webgl2' || type === 'webgl') return null;
        return real.call(this, type, ...rest);
      };
    });
    await page.goto('/?instant');
    await expect(page.locator('.fatal')).toContainText(/can't run here|stopped working/);
    await context.close();
  });
});
