/**
 * Representative force-travel model for the simulated switches in the catalog.
 * A linear spring plus, for tactile and clicky switches, a modelled bump.
 * It illustrates how the categories differ. It is not a measurement of a real switch.
 */

const FRICTION_GF = 3;
const BOTTOM_WALL_MM = 0.08;
const BOTTOM_WALL_GF = 44;

/** Force from the spring alone at a given travel, in gf. */
export function springForce(sw, travel) {
  return sw.preload + ((sw.bottomOutForce - sw.preload) * travel) / sw.totalTravel;
}

/**
 * Extra force from the tactile or click mechanism. The rounded bump rises and falls
 * smoothly. The sharp and click forms rise slowly and then collapse quickly, which is
 * what produces the snap in a clicky switch.
 */
function bumpForce(sw, travel, downstroke) {
  const bump = sw.tactile;
  if (!bump) return 0;
  const excess = bump.peakForce - springForce(sw, bump.position);
  const strength = downstroke ? 1 : sw.type === 'clicky' ? 0.22 : 0.4;
  const u = (travel - bump.position) / bump.width;

  if (bump.sharpness === 'rounded') {
    const rise = Math.exp(-u * u);
    const dip = Math.exp(-((u - 1.45) ** 2)) * (bump.drop / Math.max(excess, 1)) * 0.5;
    return strength * excess * (rise - dip);
  }

  const collapse = bump.sharpness === 'click' ? 0.32 : 0.55;
  if (u <= 0) return strength * excess * Math.exp(-((u / 1.5) ** 2));
  if (u < collapse) {
    const t = u / collapse;
    return strength * (excess - t * (excess + bump.drop));
  }
  const recovery = bump.sharpness === 'click' ? 1.2 : 1.8;
  return strength * -bump.drop * Math.exp(-((u - collapse) / recovery));
}

/** Rapid rise as the stem meets the bottom of the housing. */
function bottomWall(sw, travel) {
  const start = sw.totalTravel - BOTTOM_WALL_MM;
  if (travel <= start) return 0;
  return ((travel - start) / BOTTOM_WALL_MM) * BOTTOM_WALL_GF;
}

/**
 * Force at a travel distance.
 * @param {object} sw Switch catalog item
 * @param {number} travel mm from rest
 * @param {'down'|'up'} [direction]
 */
export function forceAt(sw, travel, direction = 'down') {
  const t = Math.min(Math.max(travel, 0), sw.totalTravel);
  const down = direction === 'down';
  const friction = down ? FRICTION_GF : -FRICTION_GF;
  return Math.max(0, springForce(sw, t) + bumpForce(sw, t, down) + friction + bottomWall(sw, t));
}

/**
 * Samples both strokes for plotting.
 * @returns {{down:{travel:number,force:number}[], up:{travel:number,force:number}[], peak:number, actuationForce:number}}
 */
export function sampleCurve(sw, samples = 160) {
  const down = [];
  const up = [];
  for (let i = 0; i <= samples; i += 1) {
    const travel = (i / samples) * sw.totalTravel;
    down.push({ travel, force: forceAt(sw, travel, 'down') });
    up.push({ travel, force: forceAt(sw, travel, 'up') });
  }
  const beforeWall = down.filter((p) => p.travel < sw.totalTravel - BOTTOM_WALL_MM);
  const peak = Math.max(...beforeWall.map((p) => p.force));
  return { down, up, peak, actuationForce: forceAt(sw, sw.actuationDistance, 'down') };
}

/**
 * Where the tactile or click peak really falls in the sampled curve. Returns null for
 * a linear switch, because a linear curve only ever rises.
 */
export function findTactilePeak(sw, samples = 400) {
  if (!sw.tactile) return null;
  // Later in the stroke the spring alone can exceed the bump, so only look near the bump.
  const from = Math.max(0, sw.tactile.position - sw.tactile.width * 2);
  const to = Math.min(sw.totalTravel, sw.tactile.position + sw.tactile.width * 2);
  let best = { travel: from, force: -Infinity };
  for (let i = 0; i <= samples; i += 1) {
    const travel = from + (i / samples) * (to - from);
    const force = forceAt(sw, travel);
    if (force > best.force) best = { travel, force };
  }
  return best;
}
