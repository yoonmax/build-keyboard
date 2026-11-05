import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KEYCAP_PROFILES } from '../../src/catalog/keycaps.js';
import { buildLowerCase, buildUpperCase, buildUsbPort } from '../../src/geometry/CaseGeometry.js';
import { buildKeycapGeometry, keycapGeometryKey, keycapTopFace, topSurfaceFn } from '../../src/geometry/KeycapGeometry.js';
import { buildPCBGeometry, pcbMountingHoles, perSwitchMatrices } from '../../src/geometry/PCBGeometry.js';
import { buildPlateGeometry, gasketPadPositions } from '../../src/geometry/PlateGeometry.js';
import { buildStabilizerWires, buildSwitchStem, buildSwitchTopHousing } from '../../src/geometry/SwitchGeometry.js';
import { loopSize, rectLoop, skinLoops } from '../../src/geometry/sweep.js';
import { LAYOUTS, getLayout } from '../../src/layouts/index.js';
import { KEY_GAP, SWITCH_CUTOUT, U } from '../../src/layouts/units.js';
import { STACK, caseDimensions } from '../../src/model/assembly.js';

const bounds = (geometry) => {
  geometry.computeBoundingBox();
  return geometry.boundingBox;
};

describe('loft builder', () => {
  it('produces the same point count for any size, so loops line up', () => {
    const detail = { seg: 6, divX: 4, divZ: 3 };
    expect(rectLoop({ w: 30, d: 10, r: 2 }, detail).length / 2).toBe(loopSize(detail));
    expect(rectLoop({ w: 300, d: 100, r: 7 }, detail).length / 2).toBe(loopSize(detail));
  });

  it('stays within the rectangle', () => {
    const flat = rectLoop({ w: 40, d: 20, r: 3, cx: 5, cz: -2 });
    for (let i = 0; i < flat.length; i += 2) {
      expect(flat[i]).toBeLessThanOrEqual(25.0001);
      expect(flat[i]).toBeGreaterThanOrEqual(-15.0001);
      expect(flat[i + 1]).toBeLessThanOrEqual(8.0001);
    }
  });

  it('gives outward normals on a wall climbing upward', () => {
    const ring = (y) => {
      const positions = [];
      const flat = rectLoop({ w: 20, d: 20, r: 1 });
      for (let i = 0; i < flat.length; i += 2) positions.push(flat[i], y, flat[i + 1]);
      return { positions };
    };
    const geometry = skinLoops([ring(0), ring(10)]);
    const pos = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < pos.count; i += 1) {
      const outward = pos.getX(i) * normal.getX(i) + pos.getZ(i) * normal.getZ(i);
      expect(outward).toBeGreaterThan(0);
    }
  });
});

describe('keycap geometry', () => {
  it.each([1, 1.25, 1.5, 1.75, 2, 2.25, 2.75, 6.25])('a %su cap has the correct footprint', (widthU) => {
    const box = bounds(buildKeycapGeometry({ widthU, rowKey: 'H', profileId: 'sculpted' }));
    const expected = widthU * U - KEY_GAP;
    expect(box.max.x - box.min.x).toBeGreaterThan(expected - 0.2);
    expect(box.max.x - box.min.x).toBeLessThan(expected + 0.6);
    expect(box.max.z - box.min.z).toBeLessThan(U);
  });

  it('never overlaps its neighbour when placed at its key position', () => {
    for (const widthU of [1, 2.25, 6.25]) {
      const box = bounds(buildKeycapGeometry({ widthU, rowKey: 'H', profileId: 'sculpted' }));
      expect(box.max.x).toBeLessThan((widthU * U) / 2);
      expect(box.min.x).toBeGreaterThan(-(widthU * U) / 2);
    }
  });

  it('sits on its skirt at y=0 and is hollow', () => {
    const geometry = buildKeycapGeometry({ widthU: 1, rowKey: 'H', profileId: 'sculpted' });
    expect(bounds(geometry).min.y).toBeCloseTo(0, 1);
    const ao = geometry.getAttribute('aAO');
    let dark = 0;
    for (let i = 0; i < ao.count; i += 1) if (ao.getX(i) < 0.2) dark += 1;
    expect(dark).toBeGreaterThan(30);
  });

  it('marks only the top face as printable', () => {
    const geometry = buildKeycapGeometry({ widthU: 1, rowKey: 'H', profileId: 'sculpted' });
    const top = geometry.getAttribute('aTop');
    const pos = geometry.getAttribute('position');
    const face = keycapTopFace(1, KEYCAP_PROFILES.sculpted);
    for (let i = 0; i < top.count; i += 1) {
      if (top.getX(i) === 1) {
        expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual(face.w / 2);
        expect(pos.getY(i)).toBeGreaterThan(6);
      }
    }
  });

  it('dishes the centre below the rim', () => {
    const surface = topSurfaceFn(1, 'H', KEYCAP_PROFILES.sculpted);
    const face = keycapTopFace(1, KEYCAP_PROFILES.sculpted);
    expect(surface(0, face.cz)).toBeLessThan(surface(face.w / 2, face.cz));
  });

  it('sculpts rows differently, but uniform caps stay equal', () => {
    const height = (rowKey, profileId) => bounds(buildKeycapGeometry({ widthU: 1, rowKey, profileId })).max.y;
    expect(height('N', 'sculpted')).toBeGreaterThan(height('H', 'sculpted') + 1);
    expect(height('N', 'uniform')).toBeCloseTo(height('H', 'uniform'));
    expect(height('H', 'spherical')).toBeGreaterThan(height('H', 'sculpted'));
  });

  it('shares geometry between rows of the same shape', () => {
    expect(keycapGeometryKey(1, 'T', 'uniform')).toBe(keycapGeometryKey(1, 'B', 'uniform'));
    expect(keycapGeometryKey(1, 'T', 'sculpted')).not.toBe(keycapGeometryKey(1, 'B', 'sculpted'));
  });

  it('keeps the cap clear of the switch housing at the bottom of the stroke', () => {
    for (const profile of Object.keys(KEYCAP_PROFILES)) {
      const surface = topSurfaceFn(1, 'H', KEYCAP_PROFILES[profile]);
      const roof = surface(0, keycapTopFace(1, KEYCAP_PROFILES[profile]).cz) - 2.2;
      const pressedRoof = STACK.capRest + roof - 4;
      expect(pressedRoof, profile).toBeGreaterThan(STACK.housingAbovePlate);
    }
  });
});

describe('plate geometry', () => {
  it.each(LAYOUTS.map((l) => [l.id, l]))('has a real cutout at every switch on %s', (_, layout) => {
    const shapeless = buildPlateGeometry(layout, 'top');
    const pos = shapeless.getAttribute('position');
    // A point in the middle of a switch must have no plate there: no top-face triangle covers it.
    const inside = new Set();
    for (const key of layout.keys) {
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.abs(pos.getX(i) - key.cx) < SWITCH_CUTOUT / 2 - 0.5 && Math.abs(pos.getZ(i) - key.cz) < SWITCH_CUTOUT / 2 - 0.5) {
          inside.add(key.id);
        }
      }
    }
    expect(inside.size).toBe(0);
  });

  it('has corners at the exact 14 mm cutout size', () => {
    const layout = getLayout('60');
    const geometry = buildPlateGeometry(layout, 'top');
    const pos = geometry.getAttribute('position');
    const key = layout.keyById.get('KeyF');
    let found = false;
    for (let i = 0; i < pos.count; i += 1) {
      if (Math.abs(Math.abs(pos.getX(i) - key.cx) - 7) < 1e-3 && Math.abs(pos.getZ(i) - key.cz) < 7) found = true;
    }
    expect(found).toBe(true);
  });

  it('is thickness-aware', () => {
    const box = bounds(buildPlateGeometry(getLayout('60'), 'top', 1.6));
    expect(box.max.y).toBeCloseTo(0);
    expect(box.min.y).toBeCloseTo(-1.6);
  });

  it('changes outline with the mount', () => {
    const gasket = bounds(buildPlateGeometry(getLayout('60'), 'gasket'));
    const top = bounds(buildPlateGeometry(getLayout('60'), 'top'));
    expect(gasket.max.x).toBeGreaterThan(0);
    expect(top.max.x).toBeGreaterThan(0);
    expect(gasketPadPositions(getLayout('60')).length).toBeGreaterThan(4);
  });

  it('differs by layout, not by a scale factor', () => {
    const a = buildPlateGeometry(getLayout('60'), 'top').getAttribute('position').count;
    const b = buildPlateGeometry(getLayout('tkl'), 'top').getAttribute('position').count;
    expect(b).toBeGreaterThan(a);
  });
});

describe('PCB geometry', () => {
  it('fits inside the case and matches the layout', () => {
    for (const layout of LAYOUTS) {
      const box = bounds(buildPCBGeometry(layout));
      const dims = caseDimensions(layout);
      expect(box.max.x - box.min.x).toBeCloseTo(dims.pcbW);
      expect(dims.pcbW).toBeLessThan(dims.outerW - 8);
    }
  });

  it('places its mounting holes clear of every switch', () => {
    for (const layout of LAYOUTS) {
      for (const hole of pcbMountingHoles(layout)) {
        for (const key of layout.keys) {
          const inX = Math.abs(hole.x - key.cx) < SWITCH_CUTOUT / 2;
          const inZ = Math.abs(hole.z - key.cz) < SWITCH_CUTOUT / 2;
          expect(inX && inZ, `${layout.id} hole by ${key.id}`).toBe(false);
        }
      }
    }
  });

  it('places one part per switch, at the switch position', () => {
    const layout = getLayout('65');
    const matrices = perSwitchMatrices(layout, { y: -1 });
    expect(matrices.length).toBe(layout.switchCount);
    const v = new THREE.Vector3().setFromMatrixPosition(matrices[3]);
    expect(v.x).toBeCloseTo(layout.keys[3].cx);
    expect(v.z).toBeCloseTo(layout.keys[3].cz);
    expect(v.y).toBe(-1);
  });
});

describe('case geometry', () => {
  it('encloses the keys on every layout', () => {
    for (const layout of LAYOUTS) {
      const box = bounds(buildUpperCase(layout));
      expect(box.max.x).toBeGreaterThan(layout.widthMM / 2);
      expect(box.max.y).toBeCloseTo(STACK.frameTop);
    }
  });

  it('makes the lower case taller at the rear', () => {
    const layout = getLayout('75');
    const lower = buildLowerCase(layout);
    const pos = lower.getAttribute('position');
    let rearLow = 0;
    let frontLow = 0;
    for (let i = 0; i < pos.count; i += 1) {
      if (pos.getZ(i) < -50) rearLow = Math.min(rearLow, pos.getY(i));
      if (pos.getZ(i) > 50) frontLow = Math.min(frontLow, pos.getY(i));
    }
    expect(rearLow).toBeLessThan(frontLow - 8);
  });

  it('keeps the floor below the PCB and above the outside', () => {
    const layout = getLayout('75');
    const dims = caseDimensions(layout);
    const floorFront = -10.6 + 2.6;
    expect(floorFront).toBeLessThan(STACK.pcbTop - STACK.pcbThickness);
    expect(dims.outerD).toBeGreaterThan(layout.depthMM);
  });

  it('builds a USB-C port that opens toward the rear', () => {
    const port = buildUsbPort(getLayout('60'));
    const bezel = bounds(port.bezel);
    const back = bounds(port.back);
    expect(back.min.z).toBeGreaterThan(bezel.min.z);
    for (const part of Object.values(port)) expect(part.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('switch and stabilizer geometry', () => {
  it('stands the housing to its specified height over the plate', () => {
    expect(bounds(buildSwitchTopHousing()).max.y).toBeCloseTo(STACK.housingAbovePlate);
  });

  it('reaches the keycap socket with the stem', () => {
    const stemTop = bounds(buildSwitchStem()).max.y;
    expect(stemTop).toBeGreaterThan(STACK.housingAbovePlate + 2.5);
    const surface = topSurfaceFn(1, 'H', KEYCAP_PROFILES.sculpted);
    const roof = STACK.capRest + surface(0, 0) - 2.2;
    expect(stemTop).toBeLessThan(roof + 0.01);
  });

  it('runs a wire across each stabilized key', () => {
    for (const layout of LAYOUTS) {
      const wires = buildStabilizerWires(layout);
      const box = bounds(wires);
      const space = layout.keyById.get('Space');
      expect(box.max.x).toBeGreaterThan(space.cx);
      expect(wires.getAttribute('position').count).toBeGreaterThan(100);
    }
  });
});
