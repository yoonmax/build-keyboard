import * as THREE from 'three';
import { KEYCAP_PROFILES } from '../catalog/keycaps.js';
import { keycapTopFace } from './KeycapGeometry.js';

/** Pixels per millimetre stored in the atlas: enough for crisp macro views. */
const PX_PER_MM = 26;
const ATLAS_SIZE = 2048;
const PADDING = 10;
export const LEGEND_FONT = '"Hanken Grotesk Variable", "Helvetica Neue", Arial, sans-serif';

/**
 * The size class for a legend, so letters read larger than modifier words, the way
 * a real printed keycap is laid out. Sizes are cap-heights in mm.
 */
export function legendStyle(key) {
  if (key.shifted) return { size: 3.15, weight: 560, lineGap: 0.75 };
  if (key.cluster === 'alpha') return { size: 4.0, weight: 560 };
  if (/^Arrow/.test(key.id)) return { size: 4.2, weight: 500 };
  if (key.legend.length <= 3) return { size: 2.9, weight: 560 };
  return { size: 2.55, weight: 560 };
}

function legendLines(key) {
  return key.shifted ? [key.shifted, key.legend] : [key.legend];
}

function entryId(key) {
  const style = legendStyle(key);
  return `${legendLines(key).join('\n')}|${style.size}`;
}

/**
 * Packs every legend on a layout into one single-channel texture. Text is drawn once
 * here, and each keycap instance then points to its rectangle in the shader. Changing
 * a colour updates an attribute and never touches this texture.
 *
 * @param {{keys: object[]}} layout
 * @returns {{texture: THREE.DataTexture, entries: Map<string, object>, dispose: Function}}
 */
export function buildLegendAtlas(layout) {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  let cursorX = PADDING;
  let cursorY = PADDING;
  let rowHeight = 0;
  const entries = new Map();

  for (const key of layout.keys) {
    const id = entryId(key);
    if (entries.has(id) || !key.legend) continue;
    const style = legendStyle(key);
    const lines = legendLines(key);
    const fontPx = (style.size / 0.72) * PX_PER_MM;
    ctx.font = `${style.weight} ${fontPx}px ${LEGEND_FONT}`;
    const widths = lines.map((line) => ctx.measureText(line).width);
    const widthPx = Math.ceil(Math.max(...widths));
    const lineHeight = style.size * PX_PER_MM + (style.lineGap ?? 0) * PX_PER_MM;
    const heightPx = Math.ceil(lineHeight * lines.length + 0.14 * fontPx);

    if (cursorX + widthPx + PADDING > ATLAS_SIZE) {
      cursorX = PADDING;
      cursorY += rowHeight + PADDING;
      rowHeight = 0;
    }
    lines.forEach((line, i) => {
      const y = cursorY + style.size * PX_PER_MM * (i + 1) + (style.lineGap ?? 0) * PX_PER_MM * i;
      ctx.fillText(line, cursorX, y);
    });
    entries.set(id, {
      id,
      u0: cursorX / ATLAS_SIZE,
      v0: cursorY / ATLAS_SIZE,
      du: widthPx / ATLAS_SIZE,
      dv: heightPx / ATLAS_SIZE,
      widthMM: widthPx / PX_PER_MM,
      heightMM: heightPx / PX_PER_MM,
    });
    cursorX += widthPx + PADDING;
    rowHeight = Math.max(rowHeight, heightPx);
  }

  // Keep one channel only: this saves three quarters of the texture memory.
  const rgba = ctx.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE).data;
  const red = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE);
  for (let y = 0; y < ATLAS_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_SIZE; x += 1) {
      red[y * ATLAS_SIZE + x] = rgba[(y * ATLAS_SIZE + x) * 4];
    }
  }
  const texture = new THREE.DataTexture(red, ATLAS_SIZE, ATLAS_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;
  texture.needsUpdate = true;

  return { texture, entries, dispose: () => texture.dispose() };
}

/**
 * Where a legend sits on a cap's top face, in the key's local millimetres.
 * @param {object} key
 * @param {object} entry Atlas entry
 * @param {'corner'|'center'|'blank'} placement
 * @param {string} profileId
 * @returns {{x:number,z:number,w:number,h:number}|null}
 */
export function legendBox(key, entry, placement, profileId) {
  if (!entry || placement === 'blank') return null;
  const face = keycapTopFace(key.w, KEYCAP_PROFILES[profileId]);
  const w = entry.widthMM;
  const h = entry.heightMM;
  const centered = placement === 'center' || /^Arrow/.test(key.id);
  if (centered) return { x: -w / 2, z: face.cz - h / 2, w, h };
  const margin = 0.35;
  return {
    x: -face.innerW / 2 + margin,
    z: face.cz - face.innerD / 2 + margin,
    w,
    h,
  };
}

export function atlasEntryFor(atlas, key) {
  return atlas.entries.get(entryId(key)) ?? null;
}
