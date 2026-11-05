/**
 * Physical constants shared by the data model and geometry.
 * The whole project works in millimetres: 1 world unit = 1 mm.
 */

/** Standard key pitch: one keyboard unit, centre to centre. */
export const U = 19.05;

/** Cherry-MX-style plate cutout for a switch, in mm. */
export const SWITCH_CUTOUT = 14;

/** Width and depth of the moulded part of a keycap's skirt is the pitch minus this gap. */
export const KEY_GAP = 0.85;

/**
 * Half the distance between stabilizer stems for a key width, per the common
 * Cherry-style standard. Returns null for keys that do not take a stabilizer.
 * @param {number} widthU key width in keyboard units
 * @returns {number|null} offset from key centre to each stabilizer stem, in mm
 */
export function stabilizerOffset(widthU) {
  if (widthU < 2) return null;
  if (widthU < 3) return 11.938;
  if (widthU < 6) return 19.05;
  if (widthU < 7) return 50;
  return 57.15;
}

/**
 * Stabilizers come in two wire lengths in catalog terms.
 * @param {number} widthU
 * @returns {'small'|'large'|null}
 */
export function stabilizerClass(widthU) {
  const offset = stabilizerOffset(widthU);
  if (offset === null) return null;
  return widthU >= 6 ? 'large' : 'small';
}
