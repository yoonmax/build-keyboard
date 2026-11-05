import { getLayout } from '../layouts/index.js';
import { U } from '../layouts/units.js';

/**
 * The physical stack-up of the keyboard, in mm, in the assembly frame:
 * x runs across the keyboard, y is the plate normal (0 is the plate's top surface),
 * and z points toward the typist. All geometry takes its position from these numbers.
 */
export const STACK = {
  plateTop: 0,
  plateThickness: 1.5,
  /** Top of the housing above the plate, per the common MX-style standard. */
  housingAbovePlate: 6.6,
  /** Housing below the plate top, down to the PCB. */
  housingBelowPlate: 5.0,
  /** Height of the keycap's skirt above the plate when the key is at rest. */
  capRest: 6.2,
  /** Top surface of the PCB, where the bottom of each switch sits. */
  pcbTop: -5.0,
  pcbThickness: 1.6,
  /** Top of the case frame relative to the plate. */
  frameTop: 7.4,
  /** The seam between upper and lower case. */
  seam: -3.2,
  /** Interior floor of the lower case. */
  floor: -13.2,
  /** Case wall thickness. */
  wall: 4.4,
};

/** Typing angle in degrees and the front height at the lip. */
export const WEDGE = {
  angleDeg: 6.5,
  frontBelowPlate: 10.6,
};

/** Clearance between keycaps and the case opening, in mm. */
const OPENING_CLEARANCE = 0.75;
const BEZEL = { side: 8.4, front: 8.6, back: 11.5 };

/**
 * Dimensions of the case and internal parts for a layout. A layout's case is computed
 * from its own width and depth, not stretched from another.
 * @param {string|object} layoutOrId
 */
export function caseDimensions(layoutOrId) {
  const layout = typeof layoutOrId === 'string' ? getLayout(layoutOrId) : layoutOrId;
  const openingW = layout.widthMM + OPENING_CLEARANCE * 2;
  const openingD = layout.depthMM + OPENING_CLEARANCE * 2;
  const outerW = openingW + BEZEL.side * 2;
  const outerD = openingD + BEZEL.front + BEZEL.back;
  // The opening sits forward of the case centre because the rear bezel is deeper.
  const openingOffsetZ = (BEZEL.back - BEZEL.front) / 2;
  return {
    openingW,
    openingD,
    outerW,
    outerD,
    openingOffsetZ,
    bezel: BEZEL,
    plateW: openingW + STACK.wall * 0.9,
    plateD: openingD + STACK.wall * 0.9,
    pcbW: layout.widthMM + 1.0,
    pcbD: layout.depthMM + 1.0,
    cornerRadius: 7.2,
    openingRadius: 2.4,
  };
}

/**
 * Height of the wedge-shaped case bottom in the assembly frame at a z position.
 * Rear of the keyboard (negative z) sits lower in this frame because the whole
 * assembly is tilted forward when placed on a desk.
 */
export function bottomPlaneY(z, outerD) {
  const slope = Math.tan((WEDGE.angleDeg * Math.PI) / 180);
  const fromFront = outerD / 2 - z;
  return -WEDGE.frontBelowPlate - fromFront * slope;
}

/**
 * How far to raise the tilted assembly so the lowest point of the case rests on the floor.
 * @returns {{tiltRad:number, lift:number}}
 */
export function deskPlacement(outerD, centerZ = 0) {
  const tiltRad = (WEDGE.angleDeg * Math.PI) / 180;
  // Rotating by +tilt about X sends a point (y,z) to y' = y cos t - z sin t.
  // The bottom plane is measured from the case centre, which sits at centerZ.
  const y = bottomPlaneY(outerD / 2, outerD);
  const lift = -(y * Math.cos(tiltRad) - (outerD / 2 + centerZ) * Math.sin(tiltRad));
  return { tiltRad, lift };
}

/** Where each stabilizer stem sits for a layout. Used by plate, PCB and stabilizer parts. */
export function stabilizerPositions(layout) {
  const out = [];
  for (const key of layout.keys) {
    if (!key.stabilizer) continue;
    for (const side of [-1, 1]) {
      out.push({
        keyId: key.id,
        keyIndex: key.index,
        side,
        x: key.cx + side * key.stabilizer.offset,
        z: key.cz,
        class: key.stabilizer.class,
      });
    }
  }
  return out;
}

/** Fastener and gasket positions, spaced by layout width to avoid switches. */
export function mountingPoints(layout, mount) {
  const d = caseDimensions(layout);
  const hw = d.plateW / 2 - 1.6;
  const hd = d.plateD / 2 - 1.6;
  const count = Math.max(2, Math.round(layout.widthU / 4.5));
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const x = -hw + 14 + ((2 * hw - 28) * i) / (count - 1);
    points.push({ x, z: -hd, edge: 'back' });
    points.push({ x, z: hd, edge: 'front' });
  }
  if (mount !== 'tray') {
    points.push({ x: -hw, z: 0, edge: 'left' });
    points.push({ x: hw, z: 0, edge: 'right' });
  }
  return points;
}

/** Key-pitch helper for parts that place features between switches. */
export const PITCH = U;

/**
 * Exploded-view layers, ordered from top to bottom in physical assembly order.
 * `offset` is mm of travel along the plate normal at full separation. The lower
 * case stays on the desk and everything else rises above it.
 */
export const EXPLODE_LAYERS = [
  { id: 'keycaps', name: 'Keycaps', offset: 418, stagger: 0 },
  { id: 'upperCase', name: 'Upper case', offset: 340, stagger: 0.04 },
  { id: 'switches', name: 'Switches', offset: 268, stagger: 0.08 },
  { id: 'stabilizers', name: 'Stabilizers', offset: 218, stagger: 0.1 },
  { id: 'plate', name: 'Plate', offset: 170, stagger: 0.14 },
  { id: 'plateFoam', name: 'Plate foam', offset: 128, stagger: 0.17 },
  { id: 'pcb', name: 'PCB', offset: 88, stagger: 0.2 },
  { id: 'caseFoam', name: 'Case foam', offset: 40, stagger: 0.24 },
  { id: 'lowerCase', name: 'Lower case', offset: 0, stagger: 0 },
];

/** Smooth easing for a layer's motion. */
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Position of every exploded layer at a timeline position. The layers leave in
 * staggered order, top first, and land together.
 * @param {number} progress 0 assembled, 1 fully exploded
 * @param {number} separation Multiplier chosen with the separation slider
 * @returns {Record<string, number>} mm offset by layer id
 */
export function layerOffsets(progress, separation = 1) {
  const result = {};
  const span = 0.7;
  for (const layer of EXPLODE_LAYERS) {
    const t = Math.min(1, Math.max(0, (progress - layer.stagger) / span));
    result[layer.id] = layer.offset * separation * easeInOut(t);
  }
  return result;
}
