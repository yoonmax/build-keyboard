import * as THREE from 'three';

/**
 * Low-level loft builder. All case parts, keycaps and switch housings are stacks of
 * rounded-rectangle loops joined into a smooth skin. Because three.js weights vertex
 * normals by face area, short bevels between big flat faces take on a smooth gradient
 * while the flats stay flat. That is what makes small chamfers catch light convincingly.
 */

/**
 * Samples a rounded rectangle into [x, z] pairs. The point count depends only on the
 * subdivision arguments, so loops of different sizes line up vertex for vertex.
 * @param {{w:number,d:number,r:number,cx?:number,cz?:number}} rect
 * @param {{seg?:number,divX?:number,divZ?:number}} [detail]
 * @returns {number[]} flat array [x0, z0, x1, z1, ...]
 */
export function rectLoop(rect, { seg = 6, divX = 2, divZ = 2 } = {}) {
  const { w, d, cx = 0, cz = 0 } = rect;
  const r = Math.max(0.001, Math.min(rect.r, w / 2 - 0.001, d / 2 - 0.001));
  const hw = w / 2 - r;
  const hd = d / 2 - r;
  const corners = [
    [hw, hd, 0],
    [-hw, hd, Math.PI / 2],
    [-hw, -hd, Math.PI],
    [hw, -hd, (3 * Math.PI) / 2],
  ];
  const points = [];
  corners.forEach(([ox, oz, start], c) => {
    for (let i = 0; i <= seg; i += 1) {
      const a = start + (i / seg) * (Math.PI / 2);
      points.push(cx + ox + Math.cos(a) * r, cz + oz + Math.sin(a) * r);
    }
    const lastX = cx + ox + Math.cos(start + Math.PI / 2) * r;
    const lastZ = cz + oz + Math.sin(start + Math.PI / 2) * r;
    const [nx, nz, nextStart] = corners[(c + 1) % 4];
    const firstX = cx + nx + Math.cos(nextStart) * r;
    const firstZ = cz + nz + Math.sin(nextStart) * r;
    const div = c % 2 === 0 ? divX : divZ;
    for (let i = 1; i < div; i += 1) {
      const t = i / div;
      points.push(lastX + (firstX - lastX) * t, lastZ + (firstZ - lastZ) * t);
    }
  });
  return points;
}

/** Number of points rectLoop returns for a given detail. */
export function loopSize({ seg = 6, divX = 2, divZ = 2 } = {}) {
  return 4 * (seg + 1) + 2 * (divX - 1) + 2 * (divZ - 1);
}

/**
 * Joins loops of positions into one indexed, smooth-shaded geometry.
 * Each loop is { positions: number[] (x,y,z triples), attrs?: Record<string,number> }.
 * The winding gives outward normals when the loop path climbs an outer wall.
 *
 * @param {{positions:number[], attrs?:Record<string,number>}[]} loops
 * @param {{closed?:boolean, fanStart?:number[], fanEnd?:number[],
 *          fanAttrs?:Record<string,number>, uvScale?:number, attributes?:string[]}} [options]
 */
export function skinLoops(loops, options = {}) {
  const { closed = false, fanStart, fanEnd, fanAttrs = {}, uvScale = 100, attributes = [] } = options;
  const n = loops[0].positions.length / 3;
  const positions = [];
  const custom = Object.fromEntries(attributes.map((a) => [a, []]));
  const uvs = [];
  const index = [];

  const push = (x, y, z, attrs) => {
    positions.push(x, y, z);
    // A simple planar mapping that does not degenerate on either wall direction.
    uvs.push((x + y) / uvScale, (z + y) / uvScale);
    for (const name of attributes) custom[name].push(attrs?.[name] ?? 0);
  };

  for (const loop of loops) {
    for (let i = 0; i < n; i += 1) {
      push(loop.positions[i * 3], loop.positions[i * 3 + 1], loop.positions[i * 3 + 2], loop.attrs);
    }
  }

  const ringCount = loops.length;
  const segments = closed ? ringCount : ringCount - 1;
  for (let j = 0; j < segments; j += 1) {
    const nextJ = (j + 1) % ringCount;
    for (let i = 0; i < n; i += 1) {
      const nextI = (i + 1) % n;
      const a = j * n + i;
      const b = j * n + nextI;
      const c = nextJ * n + i;
      const d = nextJ * n + nextI;
      index.push(a, c, b, b, c, d);
    }
  }

  if (fanStart) {
    const center = positions.length / 3;
    push(fanStart[0], fanStart[1], fanStart[2], fanAttrs.start ?? loops[0].attrs);
    for (let i = 0; i < n; i += 1) index.push(center, i, (i + 1) % n);
  }
  if (fanEnd) {
    const center = positions.length / 3;
    push(fanEnd[0], fanEnd[1], fanEnd[2], fanAttrs.end ?? loops[ringCount - 1].attrs);
    const base = (ringCount - 1) * n;
    for (let i = 0; i < n; i += 1) index.push(base + i, center, base + ((i + 1) % n));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  for (const name of attributes) geometry.setAttribute(name, new THREE.Float32BufferAttribute(custom[name], 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds a loft through rounded rectangles.
 * @param {{rect:object, y:number|((x:number,z:number)=>number), attrs?:object}[]} profile
 * @param {object} [options] detail plus the options of skinLoops
 */
export function sweepRects(profile, options = {}) {
  const { seg = 8, divX = 2, divZ = 2, ...rest } = options;
  const loops = profile.map(({ rect, y, attrs }) => {
    const flat = rectLoop(rect, { seg, divX, divZ });
    const positions = [];
    for (let i = 0; i < flat.length; i += 2) {
      const px = flat[i];
      const pz = flat[i + 1];
      positions.push(px, typeof y === 'function' ? y(px, pz) : y, pz);
    }
    return { positions, attrs };
  });
  return skinLoops(loops, rest);
}

/**
 * A box with softly bevelled edges, used for small hardware.
 * @param {number} w width on x
 * @param {number} h height on y, centred
 * @param {number} d depth on z
 * @param {number} [bevel]
 */
export function bevelBox(w, h, d, bevel = 0.2) {
  const r = Math.min(bevel * 1.2, w / 2 - 0.01, d / 2 - 0.01);
  const rect = (inset) => ({ w: w - inset * 2, d: d - inset * 2, r: Math.max(0.01, r - inset) });
  const hh = h / 2;
  return sweepRects(
    [
      { rect: rect(bevel), y: -hh },
      { rect: rect(0), y: -hh + bevel },
      { rect: rect(0), y: hh - bevel },
      { rect: rect(bevel), y: hh },
    ],
    { seg: 2, fanStart: [0, -hh, 0], fanEnd: [0, hh, 0] },
  );
}

/** A loft running along z, built on the y axis and rotated. Used for the USB port parts. */
export function rotateToZ(geometry) {
  geometry.rotateX(Math.PI / 2);
  return geometry;
}
