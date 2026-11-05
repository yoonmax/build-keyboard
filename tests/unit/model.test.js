import { describe, expect, it } from 'vitest';
import { KEYCAP_THEMES, SWITCHES } from '../../src/catalog/index.js';
import { getLayout } from '../../src/layouts/index.js';
import { EXPLODE_LAYERS, bottomPlaneY, caseDimensions, deskPlacement, layerOffsets } from '../../src/model/assembly.js';
import {
  applyTheme,
  caseHex,
  contrastRatio,
  createDefaultBuild,
  editKeys,
  resetKeys,
  resolveKeyStyle,
  setOption,
} from '../../src/model/build.js';
import { calculatePrice, formatPrice, priceByGroup } from '../../src/model/pricing.js';
import { findTactilePeak, forceAt, sampleCurve } from '../../src/model/switchCurve.js';

const key = (id) => getLayout('75').keyById.get(id);

describe('pricing', () => {
  it('breaks the total into groups and adds up', () => {
    const price = calculatePrice(createDefaultBuild());
    const groups = priceByGroup(price);
    expect(groups.map((g) => g.group)).toEqual(['Case', 'PCB', 'Plate', 'Switches', 'Keycaps', 'Stabilizers', 'Accessories']);
    const sum = groups.reduce((s, g) => s + g.amount, 0);
    expect(sum).toBeCloseTo(price.total);
    expect(price.complete).toBe(true);
    expect(price.basis.id).toBe('illustrative');
  });

  it('charges one switch per key on the layout', () => {
    const build = createDefaultBuild();
    const a = calculatePrice(build).lines.find((l) => l.group === 'Switches');
    expect(a.quantity).toBe(84);
    expect(a.amount).toBeCloseTo(84 * 0.55);
    const b = calculatePrice(setOption(build, 'layout', '60')).lines.find((l) => l.group === 'Switches');
    expect(b.quantity).toBe(61);
  });

  it('flags a total as incomplete when a part has no price for the layout', () => {
    const build = setOption(setOption(createDefaultBuild(), 'layout', 'tkl'), 'case', 'case-polycarbonate');
    const price = calculatePrice(build);
    expect(price.complete).toBe(false);
    expect(price.lines[0].available).toBe(false);
  });

  it('adds a surcharge for a custom colour', () => {
    const build = createDefaultBuild();
    const before = calculatePrice(build).total;
    expect(calculatePrice(setOption(build, 'caseColor', 'custom')).total).toBeCloseTo(before + 24);
  });

  it('prices aluminum keycaps per key', () => {
    const build = createDefaultBuild();
    const before = calculatePrice(build).total;
    const edited = editKeys(build, ['KeyA', 'KeyS'], { material: 'aluminum' });
    expect(calculatePrice(edited).total).toBeCloseTo(before + 15);
  });

  it('adds lighting and accessories', () => {
    const build = createDefaultBuild();
    const before = calculatePrice(build).total;
    expect(calculatePrice(setOption(build, 'lighting', 'per-key')).total).toBeCloseTo(before + 14);
    expect(calculatePrice(setOption(build, 'accessory', 'acc-tools')).total).toBeCloseTo(before + 9);
    expect(calculatePrice(setOption(build, 'accessory', 'acc-foam')).total).toBeLessThan(before);
  });

  it('formats money', () => {
    expect(formatPrice(1200)).toBe('$1,200');
    expect(formatPrice(12.5)).toBe('$12.50');
  });
});

describe('keycap styling', () => {
  it('applies theme roles by key type', () => {
    const { keycaps } = createDefaultBuild();
    expect(resolveKeyStyle(key('KeyA'), keycaps).color).toBe(keycaps.base);
    expect(resolveKeyStyle(key('ShiftLeft'), keycaps).color).toBe(keycaps.accent);
    expect(resolveKeyStyle(key('Escape'), keycaps).color).toBe(keycaps.highlight);
    expect(resolveKeyStyle(key('Enter'), keycaps).role).toBe('highlight');
  });

  it('lets a per-key edit win over the theme', () => {
    const build = editKeys(createDefaultBuild(), ['KeyA'], { color: '#112233', material: 'abs' });
    const style = resolveKeyStyle(key('KeyA'), build.keycaps);
    expect(style.color).toBe('#112233');
    expect(style.material).toBe('abs');
    expect(resolveKeyStyle(key('KeyS'), build.keycaps).color).toBe(build.keycaps.base);
  });

  it('picks a readable legend for an edited key', () => {
    const dark = editKeys(createDefaultBuild(), ['KeyA'], { color: '#101010' });
    const style = resolveKeyStyle(key('KeyA'), dark.keycaps);
    expect(contrastRatio(style.color, style.legendColor)).toBeGreaterThan(4.5);
  });

  it('keeps an explicitly chosen legend colour', () => {
    const build = editKeys(createDefaultBuild(), ['KeyA'], { legendColor: '#FF0000' });
    expect(resolveKeyStyle(key('KeyA'), build.keycaps).legendColor).toBe('#FF0000');
  });

  it('resets keys to the preset', () => {
    const build = editKeys(createDefaultBuild(), ['KeyA', 'KeyB'], { color: '#112233' });
    const reset = resetKeys(build, ['KeyA']);
    expect(reset.keycaps.overrides.KeyA).toBeUndefined();
    expect(reset.keycaps.overrides.KeyB).toBeDefined();
  });

  it('applying a preset replaces the colours and clears edits', () => {
    const build = editKeys(createDefaultBuild(), ['KeyA'], { color: '#112233' });
    const theme = KEYCAP_THEMES.find((t) => t.id === 'matcha');
    const next = applyTheme(build, theme);
    expect(next.keycaps.base).toBe(theme.base);
    expect(next.keycaps.themeId).toBe('matcha');
    expect(next.keycaps.overrides).toEqual({});
  });

  it('keeps every theme legible', () => {
    expect(KEYCAP_THEMES.length).toBeGreaterThanOrEqual(6);
    for (const theme of KEYCAP_THEMES) {
      expect(contrastRatio(theme.base, theme.legend), `${theme.id} base`).toBeGreaterThan(4.5);
      expect(contrastRatio(theme.highlight, theme.legendHighlight), `${theme.id} highlight`).toBeGreaterThan(4.5);
    }
  });

  it('does not mutate the original build', () => {
    const build = createDefaultBuild();
    const snapshot = JSON.stringify(build);
    setOption(build, 'layout', '60');
    editKeys(build, ['KeyA'], { color: '#000000' });
    applyTheme(build, KEYCAP_THEMES[1]);
    expect(JSON.stringify(build)).toBe(snapshot);
  });
});

describe('setOption', () => {
  it('picks a valid finish and mount when the case changes', () => {
    const build = setOption(createDefaultBuild(), 'finish', 'brushed');
    const next = setOption(build, 'case', 'case-frosted');
    expect(next.case.finish).toBe('matte');
    expect(next.case.mount).toBe('gasket');
  });

  it('picks a valid material when the keycap set changes', () => {
    const build = setOption(createDefaultBuild(), 'keycapMaterial', 'aluminum');
    expect(setOption(build, 'keycaps', 'caps-spherical').keycaps.material).toBe('pbt');
  });

  it('toggles accessories', () => {
    const build = createDefaultBuild();
    const on = setOption(build, 'accessory', 'acc-cable');
    expect(on.accessories).toContain('acc-cable');
    expect(setOption(on, 'accessory', 'acc-cable').accessories).not.toContain('acc-cable');
  });

  it('throws on an unknown category', () => {
    expect(() => setOption(createDefaultBuild(), 'nope', 'x')).toThrow();
  });

  it('resolves named and custom case colours', () => {
    const build = createDefaultBuild();
    expect(caseHex(build.case)).toMatch(/^#/);
    build.case.colorId = 'custom';
    build.case.customColor = '#ABCDEF';
    expect(caseHex(build.case)).toBe('#ABCDEF');
  });
});

describe('switch force curves', () => {
  it('rises steadily on a linear switch', () => {
    const sw = SWITCHES.find((s) => s.type === 'linear');
    const { down } = sampleCurve(sw);
    for (let i = 1; i < down.length; i += 1) expect(down[i].force).toBeGreaterThanOrEqual(down[i - 1].force);
    expect(findTactilePeak(sw)).toBeNull();
  });

  it('reaches near its stated actuation force on a linear switch', () => {
    const sw = SWITCHES.find((s) => s.id === 'sw-drift');
    expect(forceAt(sw, sw.actuationDistance)).toBeGreaterThan(sw.actuationForce - 3);
    expect(forceAt(sw, sw.actuationDistance)).toBeLessThan(sw.actuationForce + 5);
  });

  it('shows a real bump on tactile switches: force falls after the peak', () => {
    for (const sw of SWITCHES.filter((s) => s.type === 'tactile')) {
      const peak = findTactilePeak(sw);
      expect(peak.force).toBeGreaterThan(sw.tactile.peakForce - 8);
      expect(forceAt(sw, peak.travel + sw.tactile.width * 1.2)).toBeLessThan(peak.force - 3);
      expect(Math.abs(peak.travel - sw.tactile.position)).toBeLessThan(0.3);
    }
  });

  it('gives clicky switches a sharper collapse than tactile ones', () => {
    const drop = (sw) => {
      const peak = findTactilePeak(sw);
      return (peak.force - forceAt(sw, peak.travel + 0.15)) / 0.15;
    };
    const clicky = SWITCHES.find((s) => s.id === 'sw-latch');
    const tactile = SWITCHES.find((s) => s.id === 'sw-ridge');
    expect(drop(clicky)).toBeGreaterThan(drop(tactile) * 2);
  });

  it('has lower force on the return stroke', () => {
    for (const sw of SWITCHES) {
      const mid = sw.totalTravel * 0.8;
      expect(forceAt(sw, mid, 'up')).toBeLessThan(forceAt(sw, mid, 'down'));
    }
  });

  it('stays non-negative and rises hard at bottom-out', () => {
    for (const sw of SWITCHES) {
      const { down, up } = sampleCurve(sw);
      for (const p of [...down, ...up]) expect(p.force).toBeGreaterThanOrEqual(0);
      expect(down.at(-1).force).toBeGreaterThan(sw.bottomOutForce);
    }
  });

  it('labels every switch with the required data', () => {
    for (const sw of SWITCHES) {
      expect(sw.totalTravel).toBeGreaterThan(sw.actuationDistance);
      expect(sw.actuationForce).toBeGreaterThan(sw.preload);
      expect(['linear', 'tactile', 'clicky']).toContain(sw.sound);
    }
  });
});

describe('assembly', () => {
  it('slopes the case bottom so the rear is taller', () => {
    const { outerD } = caseDimensions('75');
    expect(bottomPlaneY(-outerD / 2, outerD)).toBeLessThan(bottomPlaneY(outerD / 2, outerD));
  });

  it('rests the tilted case flat on the floor', () => {
    const { outerD } = caseDimensions('75');
    const { tiltRad, lift } = deskPlacement(outerD);
    const worldY = (z) => {
      const y = bottomPlaneY(z, outerD);
      return y * Math.cos(tiltRad) - z * Math.sin(tiltRad) + lift;
    };
    expect(worldY(outerD / 2)).toBeCloseTo(0);
    expect(worldY(-outerD / 2)).toBeCloseTo(0);
    expect(worldY(0)).toBeCloseTo(0);
  });

  it('assembles at zero and separates in order at full travel', () => {
    const closed = layerOffsets(0);
    for (const layer of EXPLODE_LAYERS) expect(closed[layer.id]).toBe(0);
    const open = layerOffsets(1);
    const values = EXPLODE_LAYERS.map((l) => open[l.id]);
    for (let i = 1; i < values.length; i += 1) expect(values[i]).toBeLessThan(values[i - 1]);
    expect(open.lowerCase).toBe(0);
  });

  it('scales with the separation control', () => {
    expect(layerOffsets(1, 0.5).keycaps).toBeCloseTo(layerOffsets(1, 1).keycaps / 2);
  });

  it('stays monotonic through the timeline', () => {
    let last = 0;
    for (let p = 0; p <= 1.001; p += 0.05) {
      const value = layerOffsets(p).plate;
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
  });
});
