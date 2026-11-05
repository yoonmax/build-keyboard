import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STACK } from '../model/assembly.js';
import { bevelBox, sweepRects } from './sweep.js';

const merge = (parts) => {
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
};

/** Copies a smooth geometry into one with attributes shared by others in a merge. */
function strip(geometry) {
  for (const name of Object.keys(geometry.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
  }
  if (!geometry.getAttribute('uv')) {
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  return geometry;
}

/** Upper housing: a flange that sits on the plate and a sloped body with a collar for the stem. */
export function buildSwitchTopHousing({ detail = 3 } = {}) {
  const rect = (w, r = 1.0) => ({ w, d: w, r });
  const top = STACK.housingAbovePlate;
  return sweepRects(
    [
      { rect: rect(14.2, 0.8), y: -1.2 },
      { rect: rect(15.4, 1), y: 0.05 },
      { rect: rect(15.5, 1), y: 0.2 },
      { rect: rect(15.5, 1), y: 0.92 },
      { rect: rect(15.2, 1), y: 1.2 },
      { rect: rect(11.85, 1.6), y: top - 0.32 },
      { rect: rect(11.45, 1.5), y: top - 0.04 },
      { rect: rect(11.1, 1.4), y: top },
      { rect: rect(6.8, 0.5), y: top },
      { rect: rect(6.6, 0.45), y: top - 0.2 },
    ],
    { seg: detail, fanStart: [0, -1.2, 0], fanEnd: [0, top - 0.2, 0] },
  );
}

/** Lower housing plus the pins. It extends from under the plate to the top of the PCB. */
export function buildSwitchBottomHousing({ pins = 5, detail = 2 } = {}) {
  const rect = (w, r = 0.5) => ({ w, d: w, r });
  const bottom = STACK.pcbTop - STACK.plateTop;
  const body = strip(
    sweepRects(
      [
        { rect: rect(13.4), y: bottom },
        { rect: rect(13.9), y: bottom + 0.3 },
        { rect: rect(13.9), y: -1.5 },
        { rect: rect(13.9), y: -1.1 },
      ],
      { seg: detail, fanStart: [0, bottom, 0], fanEnd: [0, -1.1, 0] },
    ),
  );
  const parts = [body];
  const post = (x, z, r, length) => {
    const g = new THREE.CylinderGeometry(r, r * 0.86, length, 10);
    g.translate(x, bottom - length / 2, z);
    parts.push(strip(g));
  };
  post(0, 0, 1.95, 2.9);
  if (pins === 5) {
    post(-5.08, 0, 0.82, 2.7);
    post(5.08, 0, 0.82, 2.7);
  }
  return merge(parts);
}

/** The two metal switch pins. They stay separate so they can use a metal material. */
export function buildSwitchPins() {
  const bottom = STACK.pcbTop - STACK.plateTop;
  const parts = [[-3.81, -2.54], [2.54, -5.08]].map(([x, z]) => {
    const g = new THREE.BoxGeometry(0.28, 3.6, 1.45);
    g.translate(x, bottom - 1.8, z);
    return g;
  });
  return mergeGeometries(parts, false);
}

/**
 * The stem: the moving part. A square shaft sits inside the collar with a
 * cross above it, the shape that fits into the keycap socket.
 */
export function buildSwitchStem() {
  const top = STACK.housingAbovePlate;
  const crossHeight = 3.6;
  const shaftBottom = top - 3.1;
  const shaft = strip(bevelBox(5.6, top + 0.5 - shaftBottom, 5.6, 0.14));
  shaft.translate(0, (top + 0.5 + shaftBottom) / 2, 0);
  const armA = strip(bevelBox(4.1, crossHeight, 1.17, 0.08));
  armA.translate(0, top + 0.5 + crossHeight / 2 - 0.5, 0);
  const armB = strip(bevelBox(1.29, crossHeight, 4.1, 0.08));
  armB.translate(0, top + 0.5 + crossHeight / 2 - 0.5, 0);
  return merge([shaft, armA, armB]);
}

/** Helix spring for the macro inspection view. Its travel is handled by scaling. */
export function buildSpring({ coils = 7.5, radius = 2.6, height = 10, wire = 0.26 } = {}) {
  class Helix extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const a = t * Math.PI * 2 * coils;
      // Closed ends: the first and last turn are compressed flat, as on a real spring.
      const pitch = t < 0.08 ? t * 0.3 : t > 0.92 ? 1 - (1 - t) * 0.3 : (t - 0.08) * (0.952 / 0.84) + 0.024;
      return target.set(Math.cos(a) * radius, pitch * height, Math.sin(a) * radius);
    }
  }
  return new THREE.TubeGeometry(new Helix(), 240, wire, 7, false);
}

/**
 * Contact leaves for the macro view, as simplified geometry: one fixed leaf and one
 * moving leaf, which the stem's side rail lifts apart until it actuates.
 */
export function buildContactLeaves() {
  const leaf = (x, y, length, tilt) => {
    const g = new THREE.BoxGeometry(2.6, length, 0.22);
    g.translate(0, length / 2, 0);
    g.rotateZ(tilt);
    g.translate(x, y, 2.9);
    return g;
  };
  const fixed = leaf(-1.8, -4.7, 5.4, 0);
  const moving = leaf(1.1, -4.7, 5.6, 0.1);
  return { fixed, moving };
}

/** The stabilizer housing that sits on the PCB and reaches up through the plate. */
export function buildStabilizerHousing() {
  const bottom = STACK.pcbTop;
  const top = 3.1;
  const geometry = sweepRects(
    [
      { rect: { w: 6.2, d: 11.6, r: 0.8 }, y: bottom },
      { rect: { w: 6.6, d: 12, r: 0.9 }, y: bottom + 0.3 },
      { rect: { w: 6.6, d: 12, r: 0.9 }, y: top - 0.3 },
      { rect: { w: 6.2, d: 11.6, r: 0.8 }, y: top },
    ],
    { seg: 3, fanStart: [0, bottom, 0], fanEnd: [0, top, 0] },
  );
  geometry.translate(0, 0, 0.6);
  return geometry;
}

/** The stabilizer's stem, with the same cross as a switch. */
export function buildStabilizerStem() {
  const top = STACK.housingAbovePlate;
  const crossHeight = 3.6;
  const shaft = strip(bevelBox(4.6, top + 0.5 - 1.5, 4.6, 0.1));
  shaft.translate(0, (top + 0.5 + 1.5) / 2, 0);
  const armA = strip(bevelBox(4.1, crossHeight, 1.17, 0.08));
  armA.translate(0, top + crossHeight / 2, 0);
  const armB = strip(bevelBox(1.29, crossHeight, 4.1, 0.08));
  armB.translate(0, top + crossHeight / 2, 0);
  return merge([shaft, armA, armB]);
}

/**
 * The steel wire that ties a long key's stabilizers together, built from the layout so
 * its length matches each key: straight across, with arms that reach the two housings.
 */
export function buildStabilizerWires(layout) {
  const parts = [];
  const y = STACK.pcbTop + 1.6;
  const radius = 0.72;
  for (const key of layout.keys) {
    if (!key.stabilizer) continue;
    const x0 = key.cx - key.stabilizer.offset;
    const x1 = key.cx + key.stabilizer.offset;
    const zBar = key.cz + 7.6;
    const zArm = key.cz + 1.9;
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(x0 - 1.8, y + 1.5, zArm),
        new THREE.Vector3(x0 - 1.8, y + 0.8, zArm + 3.4),
        new THREE.Vector3(x0 - 1.4, y, zBar - 0.2),
        new THREE.Vector3(x0, y, zBar),
        new THREE.Vector3(x1, y, zBar),
        new THREE.Vector3(x1 + 1.4, y, zBar - 0.2),
        new THREE.Vector3(x1 + 1.8, y + 0.8, zArm + 3.4),
        new THREE.Vector3(x1 + 1.8, y + 1.5, zArm),
      ],
      false,
      'catmullrom',
      0.1,
    );
    parts.push(new THREE.TubeGeometry(curve, 36, radius, 6, false));
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Hot-swap socket, seen from below the PCB. */
export function buildSocket() {
  const a = bevelBox(5.0, 1.85, 4.6, 0.2);
  a.translate(-2.0, -0.93, -1.4);
  const b = bevelBox(5.0, 1.85, 4.6, 0.2);
  b.translate(2.1, -0.93, -3.9);
  return mergeGeometries([strip(a), strip(b)], false);
}

/** A small rectangular surface-mount part, used for the diode under each switch. */
export function buildDiode() {
  const body = bevelBox(3.4, 1.1, 1.8, 0.14);
  body.translate(0, 0.55, 0);
  return body;
}

/** A surface-mount LED below each switch's window. */
export function buildLed() {
  const body = bevelBox(3.4, 0.9, 2.8, 0.2);
  body.translate(0, 0.45, 0);
  return body;
}
