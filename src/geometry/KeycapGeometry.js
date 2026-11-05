import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KEYCAP_PROFILES } from '../catalog/keycaps.js';
import { KEY_GAP, U, stabilizerOffset } from '../layouts/units.js';
import { rectLoop, skinLoops } from './sweep.js';

const WALL = 1.35;
const ROOF_BELOW_TOP = 2.2;
const SOCKET_RADIUS = 2.75;
const SOCKET_SEGMENTS = 10;
const ATTRS = ['aTop', 'aAO'];

/** The top face's measurements for a key, shared by the geometry and the legend placement. */
export function keycapTopFace(widthU, profile) {
  const w = widthU * U - KEY_GAP - profile.topInsetSide * 2;
  const d = U - KEY_GAP - profile.topInsetFront - profile.topInsetBack;
  const cz = (profile.topInsetBack - profile.topInsetFront) / 2;
  return { w, d, cz, innerW: w - profile.fillet * 2, innerD: d - profile.fillet * 2 };
}

/**
 * Height of the top surface at a point on the cap, including row tilt and dish.
 * A wide key has a flat run in its centre with the dish rising at the ends, as
 * moulded keycaps do, and a spacebar is gently convex front to back.
 */
export function topSurfaceFn(widthU, rowKey, profile) {
  const row = profile.rows[rowKey];
  const face = keycapTopFace(widthU, profile);
  const slope = Math.tan((row.tilt * Math.PI) / 180);
  const halfOne = keycapTopFace(1, profile).w / 2;
  const isSpace = widthU >= 4;
  return (x, z) => {
    const dz = z - face.cz;
    let y = row.height - slope * dz;
    if (isSpace) {
      const ez = dz / (face.d / 2);
      return y - ez * ez * 0.32;
    }
    const excess = Math.max(0, Math.abs(x) - (face.w / 2 - halfOne));
    const ex = excess / halfOne;
    let e2 = ex * ex;
    if (profile.dish === 'spherical') {
      const ez = dz / (face.d / 2);
      e2 += ez * ez;
    }
    y -= profile.dishDepth * Math.max(0, 1 - Math.min(1, e2));
    return y;
  };
}

/** Number of edge subdivisions for a key's width. */
function detailFor(widthU) {
  return { seg: 6, divX: Math.max(2, Math.ceil(widthU * 2.5)), divZ: 3 };
}

/**
 * Lofts one keycap: a hollow shell with sloped walls, rounded top edge, sculpted and
 * dished top, an inner cavity and a stem socket. Origin is the centre of the skirt's
 * bottom edge, so the same geometry works for any key position.
 *
 * Two extra attributes go to the shader: aTop marks the printable top face, and aAO
 * is baked ambient occlusion, which darkens the skirt where it sinks between keys.
 *
 * @param {{widthU:number, rowKey:string, profileId:string}} options
 */
export function buildKeycapGeometry({ widthU, rowKey, profileId }) {
  const profile = KEYCAP_PROFILES[profileId];
  const detail = detailFor(widthU);
  const W = widthU * U - KEY_GAP;
  const D = U - KEY_GAP;
  const face = keycapTopFace(widthU, profile);
  const surface = topSurfaceFn(widthU, rowKey, profile);

  const base = rectLoop({ w: W, d: D, r: profile.baseRadius }, detail);
  const top = rectLoop({ w: face.w, d: face.d, r: profile.topRadius, cz: face.cz }, detail);
  const innerTop = rectLoop(
    { w: face.innerW, d: face.innerD, r: Math.max(0.3, profile.topRadius - profile.fillet * 0.6), cz: face.cz },
    detail,
  );
  const n = base.length / 2;
  const loops = [];

  // Inner cavity, from the roof down to the rim.
  const roofY = surface(0, face.cz) - ROOF_BELOW_TOP;
  const cavityInset = WALL;
  const cavity = rectLoop(
    { w: W - cavityInset * 2, d: D - cavityInset * 2, r: Math.max(0.2, profile.baseRadius - 0.3) },
    detail,
  );
  const roofLoop = rectLoop(
    { w: Math.max(face.w - 1, 4), d: Math.max(face.d - 1, 4), r: 1, cz: face.cz * 0.5 },
    detail,
  );
  loops.push(flatLoop(roofLoop, roofY, { aTop: 0, aAO: 0.1 }));
  loops.push(flatLoop(cavity, 0.15, { aTop: 0, aAO: 0.12 }));
  loops.push(flatLoop(cavity, 0, { aTop: 0, aAO: 0.14 }));

  // Bottom rim, then a small bevel onto the outer wall.
  const rimOuter = rectLoop(
    { w: W - 0.16, d: D - 0.16, r: Math.max(0.1, profile.baseRadius - 0.08) },
    detail,
  );
  loops.push(flatLoop(rimOuter, 0, { aTop: 0, aAO: 0.14 }));

  // The outer wall up to the start of the fillet. aAO rises along the wall.
  const wallSteps = [0.0, 0.2, 0.42, 0.66, 0.84, 1];
  const fillet = profile.fillet;
  for (const s of wallSteps) {
    const positions = [];
    for (let i = 0; i < n; i += 1) {
      const bx = base[i * 2];
      const bz = base[i * 2 + 1];
      const tx = top[i * 2];
      const tz = top[i * 2 + 1];
      const ty = surface(tx, tz);
      const endY = ty - fillet * 0.95;
      const t = s;
      const y = Math.max(0.06, endY * t + (s === 0 ? 0.06 : 0));
      // Slight bow to the wall so highlights curve rather than running straight.
      const bow = Math.sin(t * Math.PI) * 0.18;
      const lx = bx + (tx - bx) * t;
      const lz = bz + (tz - bz) * t;
      const len = Math.hypot(lx, lz - face.cz * t) || 1;
      positions.push(lx + (lx / len) * bow, y, lz + ((lz - face.cz * t) / len) * bow);
    }
    const ao = THREE.MathUtils.lerp(0.34, 1, THREE.MathUtils.smoothstep(s, 0, 0.72));
    loops.push({ positions, attrs: { aTop: 0, aAO: ao } });
  }

  // The rounded edge between wall and top.
  for (const t of [0.3, 0.55, 0.78, 1]) {
    const positions = [];
    for (let i = 0; i < n; i += 1) {
      const tx = top[i * 2];
      const tz = top[i * 2 + 1];
      const ix = innerTop[i * 2];
      const iz = innerTop[i * 2 + 1];
      const ty = surface(tx, tz);
      const iy = surface(ix, iz);
      const ey = ty - fillet * 0.95;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      positions.push(a * tx + b * tx + c * ix, a * ey + b * ty + c * iy, a * tz + b * tz + c * iz);
    }
    loops.push({ positions, attrs: { aTop: t >= 1 ? 1 : 0, aAO: 1 } });
  }

  // Concentric rings across the top face. Each ring follows the dish surface.
  for (const a of [0.18, 0.36, 0.54, 0.72, 0.88]) {
    const positions = [];
    for (let i = 0; i < n; i += 1) {
      const x = innerTop[i * 2] * (1 - a);
      const z = face.cz + (innerTop[i * 2 + 1] - face.cz) * (1 - a);
      positions.push(x, surface(x, z), z);
    }
    loops.push({ positions, attrs: { aTop: 1, aAO: 1 } });
  }

  const shell = skinLoops(loops, {
    attributes: ATTRS,
    fanStart: [0, roofY, face.cz * 0.5],
    fanEnd: [0, surface(0, face.cz), face.cz],
    fanAttrs: { start: { aTop: 0, aAO: 0.1 }, end: { aTop: 1, aAO: 1 } },
  });

  const parts = [shell];
  parts.push(buildSocket(0, 0, roofY));
  const stab = stabilizerOffset(widthU);
  if (stab !== null) {
    parts.push(buildSocket(-stab, 0, roofY));
    parts.push(buildSocket(stab, 0, roofY));
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  merged.deleteAttribute('uv');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function flatLoop(flat, y, attrs) {
  const positions = [];
  for (let i = 0; i < flat.length; i += 2) positions.push(flat[i], y, flat[i + 1]);
  return { positions, attrs };
}

/** A round socket under the cap, reaching down to grip the switch stem. */
function buildSocket(x, z, roofY) {
  const bottom = Math.min(roofY - 0.2, 1.9);
  const ring = (y, r) => {
    const positions = [];
    for (let i = 0; i < SOCKET_SEGMENTS; i += 1) {
      const a = (i / SOCKET_SEGMENTS) * Math.PI * 2;
      positions.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    }
    return { positions, attrs: { aTop: 0, aAO: 0.14 } };
  };
  // Runs from the roof down the outside of the socket and across its base.
  const skin = skinLoops(
    [
      ring(bottom, SOCKET_RADIUS),
      ring(roofY + 0.02, SOCKET_RADIUS),
    ],
    {
      attributes: ATTRS,
      fanStart: [x, bottom, z],
      fanAttrs: { start: { aTop: 0, aAO: 0.14 } },
    },
  );
  // Rings were generated bottom-to-top so the outside faces outward.
  return skin;
}

/** Stable cache key for a keycap geometry. */
export function keycapGeometryKey(widthU, rowKey, profileId) {
  // Uniform caps share one shape on every row, so they need fewer geometries.
  const profile = KEYCAP_PROFILES[profileId];
  const row = profile.rows[rowKey];
  return `${profileId}|${widthU}|${row.height}|${row.tilt}`;
}
