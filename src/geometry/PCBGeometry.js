import * as THREE from 'three';
import { STACK, caseDimensions, mountingPoints, stabilizerPositions } from '../model/assembly.js';
import { circleHole, extrudeFlat, roundedRect } from './PlateGeometry.js';

/**
 * The PCB, cut to the same switch grid as the plate. Every switch has a real centre
 * hole, and the outline follows the layout's own width and depth.
 */
export function buildPCBGeometry(layout) {
  const d = caseDimensions(layout);
  const shape = new THREE.Shape();
  roundedRect(shape, d.pcbW, d.pcbD, 1.8);
  for (const key of layout.keys) {
    shape.holes.push(circleHole(key.cx, key.cz, 2.0));
  }
  for (const stem of stabilizerPositions(layout)) {
    shape.holes.push(circleHole(stem.x, stem.z + 6.98, 1.53));
    shape.holes.push(circleHole(stem.x, stem.z - 8.26, 1.98));
  }
  for (const hole of pcbMountingHoles(layout)) shape.holes.push(circleHole(hole.x, hole.z, 1.1));
  const geometry = extrudeFlat(shape, STACK.pcbThickness, { curveSegments: 5 });

  // Map the board's outline to 0..1, so a single painted texture lines up on the top face.
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 1) {
    uv.setXY(i, pos.getX(i) / d.pcbW + 0.5, 1 - (pos.getZ(i) / d.pcbD + 0.5));
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/** Mounting holes between switches. They snap to gaps in the grid so they never hit a switch. */
export function pcbMountingHoles(layout) {
  const points = mountingPoints(layout, 'tray').filter((p) => p.edge === 'front' || p.edge === 'back');
  const d = caseDimensions(layout);
  const holes = [];
  const seen = new Set();
  for (const p of points) {
    const z = Math.sign(p.z) * (d.pcbD / 2 - 9.5);
    // Rows sit at multiples of the pitch, so step to the nearest gap between two keys.
    const near = layout.keys
      .filter((k) => Math.abs(k.cz - z) < 12)
      .map((k) => k.cx + (k.w * 19.05) / 2)
      .sort((a, b) => Math.abs(a - p.x) - Math.abs(b - p.x))[0];
    const x = near ?? p.x;
    const id = `${x.toFixed(1)}:${z.toFixed(1)}`;
    if (!seen.has(id) && Math.abs(x) < d.pcbW / 2 - 4) {
      seen.add(id);
      holes.push({ x, z });
    }
  }
  return holes;
}

/**
 * Paints the PCB's artwork, derived from the real switch matrix. Rows and columns are
 * routed between the actual switch positions, and silkscreen marks sit at each switch.
 * Returns colour and metal/roughness masks.
 */
export function paintPCB(layout, { label = '', resolution = 8 } = {}) {
  const d = caseDimensions(layout);
  const w = Math.min(4096, Math.round(d.pcbW * resolution));
  const h = Math.round(w * (d.pcbD / d.pcbW));
  const s = w / d.pcbW;
  const px = (x) => (x + d.pcbW / 2) * s;
  const pz = (z) => (z + d.pcbD / 2) * s;

  const color = document.createElement('canvas');
  color.width = w;
  color.height = h;
  const mask = document.createElement('canvas');
  mask.width = Math.round(w / 2);
  mask.height = Math.round(h / 2);
  const c = color.getContext('2d');
  const m = mask.getContext('2d');
  m.scale(0.5, 0.5);

  // Solder mask, in a dark, slightly green charcoal. In the mask canvas: rough, not metal.
  c.fillStyle = '#10140F';
  c.fillRect(0, 0, w, h);
  m.fillStyle = 'rgb(0,120,0)';
  m.fillRect(0, 0, w, h);

  // Faint hatched ground pour.
  c.strokeStyle = 'rgba(70,92,74,0.13)';
  c.lineWidth = 0.28 * s;
  c.beginPath();
  const pitch = 1.6 * s;
  for (let i = -h; i < w; i += pitch) {
    c.moveTo(i, 0);
    c.lineTo(i + h, h);
  }
  c.stroke();

  // Column traces run through the switch pins from top to bottom. Row traces run sideways.
  const pad = (x, z) => [px(x - 3.81), pz(z - 2.54)];
  const pad2 = (x, z) => [px(x + 2.54), pz(z - 5.08)];
  const byRow = new Map();
  for (const key of layout.keys) {
    if (!byRow.has(key.row)) byRow.set(key.row, []);
    byRow.get(key.row).push(key);
  }

  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(92,120,96,0.72)';
  c.lineWidth = 0.34 * s;
  for (const keys of byRow.values()) {
    keys.sort((a, b) => a.cx - b.cx);
    c.beginPath();
    keys.forEach((key, i) => {
      const [x, y] = pad2(key.cx, key.cz);
      const diodeY = y + 9.2 * s;
      if (i === 0) c.moveTo(x, diodeY);
      else {
        const prev = keys[i - 1];
        const [px0] = pad2(prev.cx, prev.cz);
        const mid = (px0 + x) / 2;
        c.lineTo(mid - 0.8 * s, diodeY);
        c.lineTo(mid + 0.8 * s, diodeY);
      }
      c.lineTo(x, diodeY);
    });
    c.stroke();
  }

  // Columns connect each switch to the nearest switch in the row below.
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  c.strokeStyle = 'rgba(82,110,88,0.6)';
  c.lineWidth = 0.28 * s;
  c.beginPath();
  rows.slice(0, -1).forEach((rowIndex, r) => {
    const below = byRow.get(rows[r + 1]);
    for (const key of byRow.get(rowIndex)) {
      const [x0, y0] = pad(key.cx, key.cz);
      const target = below.reduce((best, k) => (Math.abs(k.cx - key.cx) < Math.abs(best.cx - key.cx) ? k : best));
      const [x1, y1] = pad(target.cx, target.cz);
      const midY = y0 + (y1 - y0) * 0.55;
      c.moveTo(x0, y0);
      c.lineTo(x0, midY - Math.abs(x1 - x0) * 0.5);
      c.lineTo(x1, midY + Math.abs(x1 - x0) * 0.5);
      c.lineTo(x1, y1);
    }
  });
  c.stroke();

  // Pads and silkscreen per switch.
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const goldPad = (x, y, r) => {
    c.fillStyle = '#C49A54';
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#070807';
    c.beginPath();
    c.arc(x, y, r * 0.52, 0, Math.PI * 2);
    c.fill();
    m.fillStyle = 'rgb(0,70,255)';
    m.beginPath();
    m.arc(x, y, r, 0, Math.PI * 2);
    m.fill();
  };

  for (const key of layout.keys) {
    const cx = px(key.cx);
    const cy = pz(key.cz);
    const half = 7.2 * s;
    const tick = 1.3 * s;
    c.strokeStyle = 'rgba(214,216,204,0.74)';
    c.lineWidth = 0.13 * s;
    c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      c.moveTo(cx + sx * half - sx * tick, cy + sy * half);
      c.lineTo(cx + sx * half, cy + sy * half);
      c.lineTo(cx + sx * half, cy + sy * half - sy * tick);
    }
    c.stroke();

    const [ax, ay] = pad(key.cx, key.cz);
    const [bx, by] = pad2(key.cx, key.cz);
    goldPad(ax, ay, 1.15 * s);
    goldPad(bx, by, 1.15 * s);

    c.fillStyle = 'rgba(214,216,204,0.78)';
    c.font = `500 ${1.05 * s}px "Hanken Grotesk Variable", sans-serif`;
    c.fillText(`SW${key.index + 1}`, cx, cy + 4.1 * s);
  }

  // Stabilizer footprints.
  c.strokeStyle = 'rgba(214,216,204,0.5)';
  c.lineWidth = 0.13 * s;
  for (const stem of stabilizerPositions(layout)) {
    c.strokeRect(px(stem.x) - 3.5 * s, pz(stem.z) - 6.9 * s, 7 * s, 15 * s);
    goldPad(px(stem.x), pz(stem.z + 6.98), 1.9 * s);
    goldPad(px(stem.x), pz(stem.z - 8.26), 2.35 * s);
  }

  for (const hole of pcbMountingHoles(layout)) goldPad(px(hole.x), pz(hole.z), 2.05 * s);

  // A board label placed in the gap above the alpha block.
  c.fillStyle = 'rgba(224,226,214,0.9)';
  c.textAlign = 'left';
  c.font = `650 ${2.1 * s}px "Hanken Grotesk Variable", sans-serif`;
  c.fillText('BUILD', px(-d.pcbW / 2 + 3), pz(-d.pcbD / 2 + 2.2));
  c.font = `500 ${1.25 * s}px "Hanken Grotesk Variable", sans-serif`;
  c.fillText(label, px(-d.pcbW / 2 + 15), pz(-d.pcbD / 2 + 2.3));

  const colorTexture = new THREE.CanvasTexture(color);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.anisotropy = 8;
  const maskTexture = new THREE.CanvasTexture(mask);
  maskTexture.anisotropy = 4;
  return { colorTexture, maskTexture };
}

/** Placement of a part on the PCB, for each switch and in the same order as layout.keys. */
export function perSwitchMatrices(layout, { y, dx = 0, dz = 0, rotateY = 0 }) {
  const dummy = new THREE.Object3D();
  return layout.keys.map((key) => {
    dummy.position.set(key.cx + dx, y, key.cz + dz);
    dummy.rotation.set(0, rotateY, 0);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  });
}
