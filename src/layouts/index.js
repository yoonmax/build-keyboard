import { clusterFor } from './blocks.js';
import { layout60 } from './layout60.js';
import { layout65 } from './layout65.js';
import { layout75 } from './layout75.js';
import { layoutTKL } from './layoutTKL.js';
import { U, stabilizerClass, stabilizerOffset } from './units.js';

export const LAYOUT_DEFINITIONS = [layout60, layout65, layout75, layoutTKL];
export const LAYOUT_IDS = LAYOUT_DEFINITIONS.map((d) => d.id);

/**
 * @typedef {Object} LayoutKey
 * @property {string} id Stable identifier, equal to KeyboardEvent.code where one exists
 * @property {number} index Position in layout.keys and in every instanced buffer
 * @property {string} legend Primary legend
 * @property {string|undefined} shifted Upper legend on a two-tier key
 * @property {number} row Matrix row, top to bottom
 * @property {number} column Matrix column, left to right within the row
 * @property {string} profile Sculpt row: F, N, T, H, B or M
 * @property {string} cluster function, number, alpha, modifier, navigation or space
 * @property {number} x Left edge in keyboard units
 * @property {number} y Top edge in keyboard units
 * @property {number} w Width in keyboard units
 * @property {number} h Height in keyboard units
 * @property {number} cx Switch centre in mm from the layout centre
 * @property {number} cz Switch centre in mm from the layout centre, +z toward the typist
 * @property {?{offset:number, class:string}} stabilizer
 */

/**
 * Expands a layout definition into fully positioned keys. All positional data used by
 * the plate, PCB, switches, stabilizers and keycaps comes from this one result.
 * @param {typeof layout60} definition
 */
export function buildLayout(definition) {
  const keys = [];
  let y = 0;
  let widthU = 0;

  definition.rows.forEach((rowDef, rowIndex) => {
    let x = 0;
    let column = 0;
    for (const entry of rowDef.keys) {
      if (typeof entry === 'number') {
        x += entry;
        continue;
      }
      const [id, legend, w, shifted] = entry;
      keys.push({
        id,
        legend,
        shifted,
        row: rowIndex,
        column,
        profile: rowDef.profile,
        cluster: clusterFor(id),
        x,
        y,
        w,
        h: 1,
      });
      x += w;
      column += 1;
    }
    widthU = Math.max(widthU, x);
    y += 1 + (rowDef.gapAfter ?? 0);
  });

  const depthU = y;
  const widthMM = widthU * U;
  const depthMM = depthU * U;

  keys.forEach((key, index) => {
    key.index = index;
    key.cx = (key.x + key.w / 2) * U - widthMM / 2;
    key.cz = (key.y + key.h / 2) * U - depthMM / 2;
    const offset = stabilizerOffset(key.w);
    key.stabilizer = offset === null ? null : { offset, class: stabilizerClass(key.w) };
  });

  const sizeCounts = {};
  for (const key of keys) sizeCounts[key.w] = (sizeCounts[key.w] ?? 0) + 1;

  const stabilizerCounts = { small: 0, large: 0 };
  for (const key of keys) if (key.stabilizer) stabilizerCounts[key.stabilizer.class] += 1;

  return {
    id: definition.id,
    name: definition.name,
    fullName: definition.fullName,
    standard: definition.standard,
    blurb: definition.blurb,
    expectedKeyCount: definition.expectedKeyCount,
    keys,
    keyById: new Map(keys.map((k) => [k.id, k])),
    widthU,
    depthU,
    widthMM,
    depthMM,
    keyCount: keys.length,
    switchCount: keys.length,
    sizeCounts,
    stabilizerCounts,
    rowCount: definition.rows.length,
  };
}

const cache = new Map();

/** Returns the memoized layout for an id, or null when the id is unknown. */
export function getLayout(id) {
  if (cache.has(id)) return cache.get(id);
  const definition = LAYOUT_DEFINITIONS.find((d) => d.id === id);
  if (!definition) return null;
  const layout = buildLayout(definition);
  cache.set(id, layout);
  return layout;
}

/** Every key id that exists on at least one layout. Used to validate imported per-key edits. */
export const ALL_KEY_IDS = new Set(LAYOUT_IDS.flatMap((id) => getLayout(id).keys.map((k) => k.id)));

/** All layouts expanded. */
export const LAYOUTS = LAYOUT_IDS.map(getLayout);
