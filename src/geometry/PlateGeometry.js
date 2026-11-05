import * as THREE from 'three';
import { SWITCH_CUTOUT } from '../layouts/units.js';
import { STACK, caseDimensions, mountingPoints, stabilizerPositions } from '../model/assembly.js';

const TAB_W = 13;
const TAB_D = 3.2;

/** Traces a rounded rectangle onto a Shape or Path. */
function roundedRect(path, w, d, r, cx = 0, cy = 0) {
  const hw = w / 2;
  const hd = d / 2;
  path.moveTo(cx - hw + r, cy - hd);
  path.lineTo(cx + hw - r, cy - hd);
  path.absarc(cx + hw - r, cy - hd + r, r, -Math.PI / 2, 0, false);
  path.lineTo(cx + hw, cy + hd - r);
  path.absarc(cx + hw - r, cy + hd - r, r, 0, Math.PI / 2, false);
  path.lineTo(cx - hw + r, cy + hd);
  path.absarc(cx - hw + r, cy + hd - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(cx - hw, cy - hd + r);
  path.absarc(cx - hw + r, cy - hd + r, r, Math.PI, (3 * Math.PI) / 2, false);
}

/**
 * Adds a chamfered square cutout. Shape-space y is -z in the assembly frame.
 * A hole is wound clockwise for the triangulator.
 */
function squareHole(cx, cz, w, d, chamfer = 0.45) {
  const hole = new THREE.Path();
  const y = -cz;
  const hw = w / 2;
  const hd = d / 2;
  hole.moveTo(cx - hw + chamfer, y - hd);
  hole.lineTo(cx - hw, y - hd + chamfer);
  hole.lineTo(cx - hw, y + hd - chamfer);
  hole.lineTo(cx - hw + chamfer, y + hd);
  hole.lineTo(cx + hw - chamfer, y + hd);
  hole.lineTo(cx + hw, y + hd - chamfer);
  hole.lineTo(cx + hw, y - hd + chamfer);
  hole.lineTo(cx + hw - chamfer, y - hd);
  hole.closePath();
  return hole;
}

function circleHole(cx, cz, radius, segments = 16) {
  const hole = new THREE.Path();
  hole.absarc(cx, -cz, radius, 0, Math.PI * 2, true);
  hole.curves.forEach(() => {});
  hole.autoClose = true;
  void segments;
  return hole;
}

/** Turns an extruded Shape into a part in the assembly frame, with its top face at y=0. */
function extrudeFlat(shape, depth, { curveSegments = 6 } = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments,
    steps: 1,
  });
  // ExtrudeGeometry runs along +z with the shape in XY. Turning -90° about X sends
  // shape y to -z in the assembly frame and the extrude direction to +y.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -depth, 0);
  return geometry;
}

/**
 * The switch plate. Its outline and cutouts are all computed from the layout:
 * a 14 mm opening per switch, a pair of stabilizer openings per long key, and
 * mounting features to match the mount style.
 */
export function buildPlateGeometry(layout, mount, thickness = STACK.plateThickness) {
  const d = caseDimensions(layout);
  const shape = new THREE.Shape();

  if (mount === 'gasket') {
    // A smaller plate with tabs that hold the gasket strips.
    buildTabbedOutline(shape, layout, d);
  } else {
    roundedRect(shape, d.plateW, d.plateD, 2.4);
  }

  for (const key of layout.keys) {
    shape.holes.push(squareHole(key.cx, key.cz, SWITCH_CUTOUT, SWITCH_CUTOUT));
  }
  for (const stem of stabilizerPositions(layout)) {
    shape.holes.push(squareHole(stem.x, stem.z + 0.6, 6.9, 14.4, 0.5));
  }
  if (mount !== 'gasket') {
    for (const p of mountingPoints(layout, mount)) {
      const inset = 0.9;
      const x = p.edge === 'left' ? p.x + inset : p.edge === 'right' ? p.x - inset : p.x;
      const z = p.edge === 'back' ? p.z + inset : p.edge === 'front' ? p.z - inset : p.z;
      shape.holes.push(circleHole(x, z, 0.95));
    }
  }
  const geometry = extrudeFlat(shape, thickness, { curveSegments: 4 });
  geometry.computeBoundingSphere();
  // Scale world-sized UVs into a tiling range for the surface textures.
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) / 100, uv.getY(i) / 100);
  return geometry;
}

function buildTabbedOutline(shape, layout, d) {
  const hw = d.openingW / 2 + 0.25;
  const hd = d.openingD / 2 + 0.25;
  const points = mountingPoints(layout, 'gasket');
  const along = (edge) => points.filter((p) => p.edge === edge).map((p) => p.x).sort((a, b) => a - b);
  const reach = (d.plateD - d.openingD) / 2 + 0.2;

  // Traced counter-clockwise. Shape y = -z, so the shape's -y side is the keyboard's front.
  shape.moveTo(-hw, -hd);
  for (const x of along('front')) {
    shape.lineTo(x - TAB_W / 2, -hd);
    shape.lineTo(x - TAB_W / 2 + 0.9, -hd - reach);
    shape.lineTo(x + TAB_W / 2 - 0.9, -hd - reach);
    shape.lineTo(x + TAB_W / 2, -hd);
  }
  shape.lineTo(hw, -hd);
  shape.lineTo(hw, -TAB_D * 2);
  shape.lineTo(hw + reach, -TAB_D * 1.5);
  shape.lineTo(hw + reach, TAB_D * 1.5);
  shape.lineTo(hw, TAB_D * 2);
  shape.lineTo(hw, hd);
  for (const x of along('back').reverse()) {
    shape.lineTo(x + TAB_W / 2, hd);
    shape.lineTo(x + TAB_W / 2 - 0.9, hd + reach);
    shape.lineTo(x - TAB_W / 2 + 0.9, hd + reach);
    shape.lineTo(x - TAB_W / 2, hd);
  }
  shape.lineTo(-hw, hd);
  shape.lineTo(-hw, TAB_D * 2);
  shape.lineTo(-hw - reach, TAB_D * 1.5);
  shape.lineTo(-hw - reach, -TAB_D * 1.5);
  shape.lineTo(-hw, -TAB_D * 2);
  shape.closePath();
}

/** Gasket pads, placed where the plate's tabs sit. */
export function gasketPadPositions(layout) {
  const d = caseDimensions(layout);
  const reach = (d.plateD - d.openingD) / 2 + 0.2;
  const hd = d.openingD / 2 + 0.25;
  const hw = d.openingW / 2 + 0.25;
  return mountingPoints(layout, 'gasket').map((p) => {
    if (p.edge === 'front') return { x: p.x, z: hd + reach / 2, w: TAB_W - 2, d: reach - 0.4 };
    if (p.edge === 'back') return { x: p.x, z: -hd - reach / 2, w: TAB_W - 2, d: reach - 0.4 };
    if (p.edge === 'left') return { x: -hw - reach / 2, z: 0, w: reach - 0.4, d: TAB_D * 2.6 };
    return { x: hw + reach / 2, z: 0, w: reach - 0.4, d: TAB_D * 2.6 };
  });
}

/** A foam sheet between plate and PCB, with switch cutouts that line up with the plate. */
export function buildPlateFoamGeometry(layout) {
  const d = caseDimensions(layout);
  const shape = new THREE.Shape();
  roundedRect(shape, d.pcbW - 1, d.pcbD - 1, 1.6);
  for (const key of layout.keys) {
    shape.holes.push(squareHole(key.cx, key.cz, SWITCH_CUTOUT + 0.8, SWITCH_CUTOUT + 0.8));
  }
  for (const stem of stabilizerPositions(layout)) {
    shape.holes.push(squareHole(stem.x, stem.z + 0.6, 7.6, 15, 0.5));
  }
  return extrudeFlat(shape, 3, { curveSegments: 3 });
}

/** A foam sheet in the case floor, notched for the mounting points. */
export function buildCaseFoamGeometry(layout) {
  const d = caseDimensions(layout);
  const shape = new THREE.Shape();
  roundedRect(shape, d.pcbW - 1, d.pcbD - 1, 2);
  return extrudeFlat(shape, 3.5, { curveSegments: 4 });
}

export { extrudeFlat, roundedRect, squareHole, circleHole };
