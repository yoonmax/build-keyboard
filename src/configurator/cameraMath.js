/**
 * Camera maths with no renderer attached, so framing and collision can be tested directly.
 * Angles are degrees. Azimuth 0 looks at the front of the keyboard, and positive
 * azimuth moves the camera toward the keyboard's right.
 */

export const CAMERA_FOV = 24;
export const CAMERA_MIN_DISTANCE = 190;
export const CAMERA_MAX_DISTANCE = 3200;
export const FLOOR_CLEARANCE = 8;

export const CAMERA_VIEWS = {
  hero: { name: 'Three-quarter', azimuth: -26, elevation: 24, margin: 0.98 },
  threeQuarter: { name: 'Three-quarter, right', azimuth: 31, elevation: 22, margin: 0.98 },
  top: { name: 'Top', azimuth: 0, elevation: 89.4, margin: 1.12 },
  front: { name: 'Front', azimuth: 0, elevation: 9, margin: 1.1 },
  rear: { name: 'Rear', azimuth: 180, elevation: 12, margin: 1.1 },
  side: { name: 'Side', azimuth: 90, elevation: 5, margin: 1.5 },
  macro: { name: 'Macro', azimuth: -38, elevation: 13, margin: 0.42, targetOffset: [-0.27, 6, 0.26] },
  typing: { name: 'Typing', azimuth: 0, elevation: 50, margin: 1.06 },
  low: { name: 'Low angle', azimuth: -52, elevation: 7, margin: 0.8 },
};

const rad = (deg) => (deg * Math.PI) / 180;

/** Camera position from orbit angles around a target. */
export function orbitPosition(target, azimuth, elevation, distance) {
  const az = rad(azimuth);
  const el = rad(elevation);
  return [
    target[0] + distance * Math.cos(el) * Math.sin(az),
    target[1] + distance * Math.sin(el),
    target[2] + distance * Math.cos(el) * Math.cos(az),
  ];
}

/** The reverse of orbitPosition. */
export function orbitFromPosition(position, target) {
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  const distance = Math.hypot(dx, dy, dz);
  return {
    azimuth: (Math.atan2(dx, dz) * 180) / Math.PI,
    elevation: (Math.asin(Math.max(-1, Math.min(1, dy / (distance || 1)))) * 180) / Math.PI,
    distance,
  };
}

/** Shortest route between two azimuths, so a move never swings the long way around. */
export function shortestAzimuth(from, to) {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta;
}

/**
 * The distance at which a box fills the available part of the viewport. Viewed at an
 * angle the box shows some of its width and some of its depth, so both are projected.
 * @param {{w:number,h:number,d:number}} box mm
 * @param {{azimuth:number,elevation:number,margin?:number}} view
 * @param {{aspect:number, fov?:number, widthFraction?:number, heightFraction?:number}} screen
 */
export function fitDistance(box, view, screen) {
  const fov = screen.fov ?? CAMERA_FOV;
  const az = rad(view.azimuth);
  const el = rad(view.elevation);
  const projectedW = Math.abs(box.w * Math.cos(az)) + Math.abs(box.d * Math.sin(az));
  const ground = Math.abs(box.d * Math.cos(az)) + Math.abs(box.w * Math.sin(az));
  const projectedH = Math.abs(ground * Math.sin(el)) + Math.abs(box.h * Math.cos(el));
  const tanV = Math.tan(rad(fov / 2));
  const tanH = tanV * screen.aspect;
  const distanceForW = projectedW / 2 / (tanH * (screen.widthFraction ?? 1));
  const distanceForH = projectedH / 2 / (tanV * (screen.heightFraction ?? 1));
  // Adds half the box's depth along the view, because the near edge sits closer than the target.
  const near = Math.abs(ground * Math.cos(el)) / 2;
  return (Math.max(distanceForW, distanceForH) + near * 0.5) * (view.margin ?? 1.1);
}

/**
 * Keeps the camera outside the keyboard and above the floor. Orbit controls stop at a
 * minimum distance from the target, but panning can bring the target near an edge, so
 * this also pushes out of the box itself.
 * @param {number[]} position
 * @param {{min:number[],max:number[]}} box
 * @param {number} [margin] mm
 * @returns {{position:number[], moved:boolean}}
 */
export function resolveCameraCollision(position, box, margin = 18) {
  const [x, y, z] = position;
  let out = [x, y, z];
  let moved = false;

  if (out[1] < FLOOR_CLEARANCE) {
    out[1] = FLOOR_CLEARANCE;
    moved = true;
  }

  const inside =
    out[0] > box.min[0] - margin &&
    out[0] < box.max[0] + margin &&
    out[1] > box.min[1] - margin &&
    out[1] < box.max[1] + margin &&
    out[2] > box.min[2] - margin &&
    out[2] < box.max[2] + margin;
  if (inside) {
    // Leaves through the nearest face.
    const exits = [
      [0, box.min[0] - margin],
      [0, box.max[0] + margin],
      [1, box.max[1] + margin],
      [2, box.min[2] - margin],
      [2, box.max[2] + margin],
    ];
    let best = exits[0];
    let bestDistance = Infinity;
    for (const exit of exits) {
      const distance = Math.abs(out[exit[0]] - exit[1]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = exit;
      }
    }
    out = [...out];
    out[best[0]] = best[1];
    moved = true;
  }
  return { position: out, moved };
}

/** Keeps the orbit target near the product, so panning can't lose the keyboard. */
export function clampTarget(target, box, slack = 40) {
  return [
    Math.min(box.max[0] + slack, Math.max(box.min[0] - slack, target[0])),
    Math.min(box.max[1] + slack, Math.max(0, target[1])),
    Math.min(box.max[2] + slack, Math.max(box.min[2] - slack, target[2])),
  ];
}
