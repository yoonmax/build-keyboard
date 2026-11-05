import { describe, expect, it } from 'vitest';
import { ALL_KEY_IDS, LAYOUTS, LAYOUT_DEFINITIONS, getLayout } from '../../src/layouts/index.js';
import { U, stabilizerOffset } from '../../src/layouts/units.js';
import { caseDimensions, stabilizerPositions } from '../../src/model/assembly.js';

describe('layout generation', () => {
  it.each([
    ['60', 61],
    ['65', 68],
    ['75', 84],
    ['tkl', 87],
  ])('the %s layout has the correct key count', (id, count) => {
    expect(getLayout(id).keyCount).toBe(count);
    expect(getLayout(id).expectedKeyCount).toBe(count);
  });

  it('documents every layout as ANSI', () => {
    for (const layout of LAYOUTS) expect(layout.standard).toBe('ANSI');
  });

  it.each(LAYOUTS.map((l) => [l.id, l]))('%s has unique key ids and matching switch count', (_, layout) => {
    expect(new Set(layout.keys.map((k) => k.id)).size).toBe(layout.keyCount);
    expect(layout.switchCount).toBe(layout.keyCount);
  });

  it.each(LAYOUTS.map((l) => [l.id, l]))('no two keys overlap on %s', (_, layout) => {
    for (const a of layout.keys) {
      for (const b of layout.keys) {
        if (a === b) continue;
        const overlapsX = a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6;
        const overlapsY = a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
        expect(overlapsX && overlapsY, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('gives each layout its own footprint, not a stretched copy', () => {
    const sizes = LAYOUTS.map((l) => `${l.widthU}x${l.depthU}`);
    expect(new Set(sizes).size).toBe(4);
    expect(getLayout('60').widthU).toBe(15);
    expect(getLayout('65').widthU).toBe(16);
    expect(getLayout('75').widthU).toBe(16);
    expect(getLayout('tkl').widthU).toBeCloseTo(18.25);
  });

  it('standard rows fill the width of the alpha block', () => {
    for (const layout of LAYOUTS) {
      for (let row = 0; row < layout.rowCount; row += 1) {
        const inRow = layout.keys.filter((k) => k.row === row && k.x < 15);
        const end = Math.max(...inRow.map((k) => k.x + k.w));
        if (inRow.some((k) => k.cluster === 'alpha')) expect(end).toBeGreaterThanOrEqual(15 - 1e-6);
      }
    }
  });

  it('places switches at the geometric centre of each key in mm', () => {
    const layout = getLayout('75');
    const space = layout.keyById.get('Space');
    expect(space.cx).toBeCloseTo((space.x + 3.125) * U - layout.widthMM / 2);
    const esc = layout.keyById.get('Escape');
    expect(esc.cx).toBeCloseTo(U / 2 - layout.widthMM / 2);
    expect(esc.cz).toBeCloseTo(U / 2 - layout.depthMM / 2);
  });

  it('keeps every key inside the layout bounds', () => {
    for (const layout of LAYOUTS) {
      for (const key of layout.keys) {
        expect(key.cx - (key.w * U) / 2).toBeGreaterThanOrEqual(-layout.widthMM / 2 - 1e-6);
        expect(key.cx + (key.w * U) / 2).toBeLessThanOrEqual(layout.widthMM / 2 + 1e-6);
        expect(key.cz + U / 2).toBeLessThanOrEqual(layout.depthMM / 2 + 1e-6);
      }
    }
  });

  it('covers all the required keycap sizes', () => {
    const sizes = new Set(LAYOUTS.flatMap((l) => l.keys.map((k) => k.w)));
    for (const size of [1, 1.25, 1.5, 1.75, 2, 2.25, 2.75, 6.25]) expect(sizes.has(size)).toBe(true);
  });

  it('the layouts differ in real ways', () => {
    expect(getLayout('60').keyById.has('ArrowUp')).toBe(false);
    expect(getLayout('65').keyById.has('ArrowUp')).toBe(true);
    expect(getLayout('65').keyById.has('F1')).toBe(false);
    expect(getLayout('75').keyById.has('F1')).toBe(true);
    expect(getLayout('tkl').keyById.has('Insert')).toBe(true);
    expect(getLayout('75').keyById.has('Insert')).toBe(false);
  });

  it('exposes KeyboardEvent codes as key ids', () => {
    expect(ALL_KEY_IDS.has('KeyA')).toBe(true);
    expect(ALL_KEY_IDS.has('ShiftLeft')).toBe(true);
    expect(ALL_KEY_IDS.has('Digit5')).toBe(true);
  });

  it('every definition declares a blurb and name', () => {
    for (const def of LAYOUT_DEFINITIONS) {
      expect(def.name).toBeTruthy();
      expect(def.blurb.length).toBeGreaterThan(10);
    }
  });
});

describe('stabilizers', () => {
  it('requires stabilizers from 2u up, at standard spacing', () => {
    expect(stabilizerOffset(1.75)).toBeNull();
    expect(stabilizerOffset(2)).toBeCloseTo(11.938);
    expect(stabilizerOffset(2.75)).toBeCloseTo(11.938);
    expect(stabilizerOffset(6.25)).toBe(50);
  });

  it.each([
    ['60', 4, 1],
    ['65', 3, 1],
    ['75', 3, 1],
    ['tkl', 4, 1],
  ])('the %s layout needs %i small and %i large', (id, small, large) => {
    expect(getLayout(id).stabilizerCounts).toEqual({ small, large });
  });

  it('places a stem on each side of a stabilized key, inside the key', () => {
    for (const layout of LAYOUTS) {
      const stems = stabilizerPositions(layout);
      const required = layout.stabilizerCounts.small + layout.stabilizerCounts.large;
      expect(stems.length).toBe(required * 2);
      for (const stem of stems) {
        const key = layout.keys[stem.keyIndex];
        expect(Math.abs(stem.x - key.cx)).toBeLessThan((key.w * U) / 2);
      }
    }
  });
});

describe('case dimensions', () => {
  it('derives each case from its own layout', () => {
    const small = caseDimensions('60');
    const large = caseDimensions('tkl');
    expect(large.outerW).toBeGreaterThan(small.outerW + 50);
    expect(large.outerD).toBeGreaterThan(small.outerD);
  });

  it('leaves clearance around the keys', () => {
    for (const layout of LAYOUTS) {
      const d = caseDimensions(layout);
      expect(d.openingW).toBeGreaterThan(layout.widthMM);
      expect(d.outerW).toBeGreaterThan(d.openingW);
      expect(d.pcbW).toBeLessThan(d.outerW);
    }
  });
});
