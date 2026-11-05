import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STACK, bottomPlaneY, caseDimensions } from '../model/assembly.js';
import { bevelBox, rotateToZ, sweepRects } from './sweep.js';

const DETAIL = { seg: 10, divX: 2, divZ: 2 };

/** Helpers that describe rectangles relative to the outer wall and the key opening. */
function frame(layout) {
  const d = caseDimensions(layout);
  const centerZ = -d.openingOffsetZ;
  return {
    d,
    centerZ,
    outer: (inset) => ({
      w: d.outerW - inset * 2,
      d: d.outerD - inset * 2,
      r: Math.max(0.5, d.cornerRadius - inset),
      cz: centerZ,
    }),
    opening: (grow) => ({
      w: d.openingW + grow * 2,
      d: d.openingD + grow * 2,
      r: d.openingRadius + grow,
      cz: 0,
    }),
  };
}

/**
 * The upper case: a one-piece frame around the keys. Its outside walls have a slight
 * draft and a generous chamfer at the top, and it is open underneath, with a ledge
 * that the plate or gasket sits against.
 */
export function buildUpperCase(layout) {
  const { outer, opening } = frame(layout);
  const top = STACK.frameTop;
  const seam = STACK.seam;
  const chamfer = 1.5;
  const draft = 0.35;

  const profile = [
    // Underside at the seam, then a small bevel out to the wall.
    { rect: outer(3.6), y: seam },
    { rect: outer(0.4), y: seam },
    { rect: outer(0.18), y: seam + 0.06 },
    { rect: outer(0.04), y: seam + 0.22 },
    { rect: outer(0), y: seam + 0.45 },
    // Outside wall, with slight draft.
    { rect: outer(draft * 0.5), y: (seam + top) / 2 },
    { rect: outer(draft), y: top - chamfer - 0.14 },
    // Small transitions either side of the chamfer so highlights roll onto it.
    { rect: outer(draft + 0.03), y: top - chamfer - 0.04 },
    { rect: outer(draft + 0.12), y: top - chamfer + 0.08 },
    { rect: outer(draft + chamfer - 0.12), y: top - 0.08 },
    { rect: outer(draft + chamfer - 0.03), y: top - 0.02 },
    { rect: outer(draft + chamfer + 0.08), y: top },
    // Flat top of the frame.
    { rect: opening(0.82), y: top },
    // Inner chamfer into the key opening.
    { rect: opening(0.72), y: top - 0.02 },
    { rect: opening(0.12), y: top - 0.6 },
    { rect: opening(0.03), y: top - 0.72 },
    { rect: opening(0), y: top - 0.84 },
    // Inner wall down to the plate ledge.
    { rect: opening(0), y: 1.1 },
    { rect: opening(0.1), y: 0.95 },
    // The ledge, then the interior wall back down to the seam.
    { rect: outer(3.6), y: 0.95 },
    { rect: outer(3.6), y: seam + 0.02 },
  ];
  const geometry = sweepRects(profile, { ...DETAIL, closed: true, uvScale: 80 });
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The lower case: a hollow tray with an undercut outside wall and a wedge-shaped bottom,
 * which gives the keyboard its typing angle. The interior floor follows the same slope.
 */
export function buildLowerCase(layout) {
  const { d, outer, centerZ } = frame(layout);
  const seam = STACK.seam - 0.0;
  const under = (x, z) => bottomPlaneY(z - centerZ, d.outerD);
  const floorY = (x, z) => under(x, z) + 2.6;
  const undercut = 1.8;

  const profile = [
    // Underside and its rounded edge.
    { rect: outer(undercut + 1.4), y: under },
    { rect: outer(undercut + 0.7), y: (x, z) => under(x, z) + 0.12 },
    { rect: outer(undercut + 0.3), y: (x, z) => under(x, z) + 0.42 },
    { rect: outer(undercut + 0.08), y: (x, z) => under(x, z) + 0.85 },
    { rect: outer(undercut), y: (x, z) => under(x, z) + 1.5 },
    // Outside wall, leaning out toward the seam.
    { rect: outer(undercut * 0.5), y: (x, z) => (under(x, z) + seam) / 2 },
    { rect: outer(0.05), y: seam - 0.5 },
    { rect: outer(0), y: seam - 0.3 },
    { rect: outer(0.14), y: seam - 0.05 },
    { rect: outer(0.36), y: seam },
    // Seam face and interior.
    { rect: outer(3.6), y: seam },
    { rect: outer(3.62), y: seam - 0.1 },
    { rect: outer(3.8), y: floorY },
    { rect: outer(4.4), y: (x, z) => floorY(x, z) + 0.02 },
  ];
  const geometry = sweepRects(profile, {
    ...DETAIL,
    uvScale: 80,
    fanStart: [0, under(0, centerZ), centerZ],
    fanEnd: [0, floorY(0, centerZ), centerZ],
  });
  geometry.computeBoundingSphere();
  return geometry;
}

/** A thin dark band in the seam between the two case halves, for a clean shadow line. */
export function buildSeamLine(layout) {
  const { outer } = frame(layout);
  const seam = STACK.seam;
  const geometry = sweepRects(
    [
      { rect: outer(0.42), y: seam - 0.34 },
      { rect: outer(0.42), y: seam + 0.34 },
    ],
    DETAIL,
  );
  return geometry;
}

/** Rubber feet, positioned on the sloped underside. Returns one merged geometry. */
export function buildFeet(layout) {
  const { d, centerZ } = frame(layout);
  const slopeRad = Math.atan(Math.tan((6.5 * Math.PI) / 180));
  const hw = d.outerW / 2 - 34;
  const hd = d.outerD / 2 - 16;
  const parts = [];
  const place = (x, z, w, depth) => {
    const pad = bevelBox(w, 2.2, depth, 0.5);
    pad.rotateX(-slopeRad);
    pad.translate(x, bottomPlaneY(z - centerZ, d.outerD) - 0.5, z);
    parts.push(pad);
  };
  place(-hw, centerZ + hd, 34, 7);
  place(hw, centerZ + hd, 34, 7);
  place(-hw, centerZ - hd, 44, 9);
  place(hw, centerZ - hd, 44, 9);
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * The polished rear weight, a slim plate set on the back wall.
 * Width follows the layout, so the proportions hold from a 60% to a TKL.
 */
export function buildRearWeight(layout) {
  const { d, centerZ } = frame(layout);
  const w = Math.min(d.outerW * 0.46, 170);
  const h = 6.6;
  const depth = 0.7;
  const geometry = sweepRects(
    [
      { rect: { w: w - 0.6, d: h - 0.6, r: 1.7 }, y: 0 },
      { rect: { w: w, d: h, r: 2 }, y: 0.02 },
      { rect: { w: w, d: h, r: 2 }, y: depth - 0.14 },
      { rect: { w: w - 0.14, d: h - 0.14, r: 1.93 }, y: depth - 0.03 },
      { rect: { w: w - 0.44, d: h - 0.44, r: 1.78 }, y: depth },
    ],
    { seg: 6, fanEnd: [0, depth, 0], uvScale: 60 },
  );
  // Built facing +y, turned to face the rear (-z).
  geometry.rotateX(-Math.PI / 2);
  const rearZ = centerZ - d.outerD / 2;
  geometry.translate(0, -11.8, rearZ + 0.34);
  return geometry;
}

/** Where the USB port sits on the rear wall. */
export function usbPortCenter(layout) {
  const { d, centerZ } = frame(layout);
  return { x: -d.outerW * 0.34, y: -9.2, z: centerZ - d.outerD / 2 + 0.42 };
}

/**
 * The USB-C port. Returns separate geometries because each part uses another material:
 * a thin stainless bezel, a dark interior, a metal shell and the contact tongue, plus
 * a mask that cuts the opening in the depth buffer, so the port really looks recessed
 * without boolean geometry on the case.
 */
export function buildUsbPort(layout) {
  const c = usbPortCenter(layout);
  const W = 9.6;
  const H = 3.9;
  const place = (g) => {
    rotateToZ(g);
    g.translate(c.x, c.y, c.z);
    return g;
  };
  const rect = (grow) => ({ w: W + grow * 2, d: H + grow * 2, r: H / 2 + grow });

  // +y of the loft becomes +z (into the case) after rotation.
  // Runs from the hole outward so its faces point out of the case.
  const bezel = sweepRects(
    [
      { rect: rect(0.02), y: 0.14 },
      { rect: rect(0.14), y: -0.1 },
      { rect: rect(0.52), y: -0.2 },
      { rect: rect(0.82), y: -0.16 },
      { rect: rect(0.95), y: 0.0 },
      { rect: rect(1.05), y: 0.34 },
    ],
    { seg: 8, uvScale: 30 },
  );
  // A tube running into the case, seen through the hole. The profile climbs +y and
  // its normals need to face the centre, so its loops run in reverse order.
  const tube = sweepRects(
    [
      { rect: rect(0), y: 7.5 },
      { rect: rect(0), y: 0.1 },
    ],
    { seg: 8, divX: 2, divZ: 2 },
  );
  const inner = sweepRects(
    [
      { rect: rect(-0.46), y: 6.8 },
      { rect: rect(-0.46), y: 0.65 },
      { rect: rect(-0.32), y: 0.42 },
      { rect: rect(-0.02), y: 0.42 },
    ],
    { seg: 8, uvScale: 30 },
  );
  const back = sweepRects(
    [
      { rect: rect(-0.8), y: 7.0 },
      { rect: rect(0.1), y: 7.0 },
    ],
    { seg: 8, fanStart: [0, 7.0, 0] },
  );
  const tongue = bevelBox(6.9, 3.6, 0.68, 0.1);
  tongue.translate(0, 3.2, 0);
  const contacts = [];
  for (let i = 0; i < 12; i += 1) {
    const pad = new THREE.BoxGeometry(0.28, 2.2, 0.72);
    pad.translate((i - 5.5) * 0.5, 2.6, 0);
    contacts.push(pad);
  }
  const contactGeo = mergeGeometries(contacts, false);
  contacts.forEach((p) => p.dispose());

  const mask = sweepRects([{ rect: rect(0.02), y: 0.01 }, { rect: rect(-0.2), y: 0.01 }], {
    seg: 8,
    fanEnd: [0, 0.01, 0],
  });

  [bezel, tube, inner, back, tongue, contactGeo, mask].forEach(place);
  return { bezel, tube, inner, back, tongue, contacts: contactGeo, mask };
}

/** Screw posts on the underside of the frame, or standoffs in the tray, by mount type. */
export function buildMountHardware(points) {
  const parts = points.map((p) => {
    const g = new THREE.CylinderGeometry(1.7, 1.7, 3.2, 14);
    g.translate(p.x, 0, p.z);
    return g;
  });
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}
