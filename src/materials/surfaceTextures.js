import * as THREE from 'three';

/**
 * Small tiling normal maps, generated at startup from seeded noise so no image assets
 * are needed. Each is created once and shared between every material that uses it.
 */

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Converts a tiling height field into a tiling tangent-space normal map. */
function normalMapFromHeight(height, size, strength) {
  const data = new Uint8Array(size * size * 4);
  const h = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Tiling blur over a height field. */
function blurHeight(height, size, passes, axis = 'both') {
  let current = height;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const at = (dx, dy) => current[((y + dy + size) % size) * size + ((x + dx + size) % size)];
        if (axis === 'x') next[y * size + x] = (at(-1, 0) + at(0, 0) * 2 + at(1, 0)) / 4;
        else next[y * size + x] = (at(-1, 0) + at(1, 0) + at(0, -1) + at(0, 1) + at(0, 0) * 2) / 6;
      }
    }
    current = next;
  }
  return current;
}

let bead = null;
/** Fine pitted grain, like a bead-blasted or matte moulded surface. */
export function beadBlastNormal() {
  if (bead) return bead;
  const size = 256;
  const rnd = mulberry32(11);
  const noise = new Float32Array(size * size);
  for (let i = 0; i < noise.length; i += 1) noise[i] = rnd();
  bead = normalMapFromHeight(blurHeight(noise, size, 1), size, 2.2);
  bead.repeat.set(3.2, 3.2);
  return bead;
}

let brushed = null;
/** Long directional streaks. The grain runs along the case's length. */
export function brushedNormal() {
  if (brushed) return brushed;
  const size = 512;
  const rnd = mulberry32(23);
  const noise = new Float32Array(size * size);
  for (let i = 0; i < noise.length; i += 1) noise[i] = rnd();
  brushed = normalMapFromHeight(blurHeight(noise, size, 34, 'x'), size, 3.4);
  brushed.repeat.set(1.2, 3.6);
  return brushed;
}

let weave = null;
/** Fibreglass weave for FR4 plates. */
export function weaveNormal() {
  if (weave) return weave;
  const size = 128;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * Math.PI * 2 * 8;
      const v = (y / size) * Math.PI * 2 * 8;
      const over = Math.sin(u) * Math.sin(v) > 0 ? Math.abs(Math.sin(u)) : Math.abs(Math.sin(v));
      height[y * size + x] = over;
    }
  }
  weave = normalMapFromHeight(height, size, 0.32);
  weave.repeat.set(5, 5);
  return weave;
}

let wood = null;
/** Walnut grain for the wrist rest and the desk studio. */
export function walnutTexture() {
  if (wood) return wood;
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4A3122';
  ctx.fillRect(0, 0, w, h);
  const rnd = mulberry32(77);
  // Long, nearly parallel grain lines: the board is cut along its length.
  const drift = [];
  for (let k = 0; k < 4; k += 1) drift.push([rnd() * Math.PI * 2, 0.0018 + rnd() * 0.0028, 3 + rnd() * 8]);
  for (let i = 0; i < 900; i += 1) {
    const y = rnd() * h;
    const tone = rnd();
    ctx.strokeStyle = tone > 0.5 ? `rgba(30,18,11,${0.03 + rnd() * 0.12})` : `rgba(128,90,60,${0.025 + rnd() * 0.09})`;
    ctx.lineWidth = 0.3 + rnd() * 1.3;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 24) {
      let yy = y;
      for (const [phase, freq, size] of drift) yy += Math.sin(x * freq * 2 * Math.PI + phase + y * 0.012) * size * 0.5;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  wood = new THREE.CanvasTexture(canvas);
  wood.colorSpace = THREE.SRGBColorSpace;
  wood.wrapS = THREE.RepeatWrapping;
  wood.wrapT = THREE.RepeatWrapping;
  wood.anisotropy = 8;
  return wood;
}
