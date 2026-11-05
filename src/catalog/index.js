import { CASES } from './cases.js';
import { ACCESSORIES, LIGHTING } from './extras.js';
import { KEYCAP_SETS } from './keycaps.js';
import { PCBS } from './pcbs.js';
import { PLATES } from './plates.js';
import { STABILIZERS } from './stabilizers.js';
import { SWITCHES } from './switches.js';

export * from './cases.js';
export * from './colors.js';
export * from './extras.js';
export * from './keycaps.js';
export * from './pcbs.js';
export * from './plates.js';
export * from './stabilizers.js';
export * from './switches.js';

/** Index every catalog item by id so rules and UI share a single lookup. */
function index(items) {
  return new Map(items.map((item) => [item.id, item]));
}

export const CATALOG = {
  case: index(CASES),
  pcb: index(PCBS),
  plate: index(PLATES),
  switch: index(SWITCHES),
  stabilizer: index(STABILIZERS),
  keycaps: index(KEYCAP_SETS),
  lighting: index(LIGHTING),
  accessory: index(ACCESSORIES),
};

/** Maps a catalog category to the property on a build that stores its id. */
export const CATEGORY_PATHS = {
  case: 'case.id',
  pcb: 'pcbId',
  plate: 'plateId',
  switch: 'switchId',
  stabilizer: 'stabilizerId',
  keycaps: 'keycaps.setId',
  lighting: 'lighting.mode',
};

/** Reads an item's price for a layout, whether it is flat or keyed by layout. */
export function priceFor(item, layoutId) {
  if (typeof item.price === 'number') return item.price;
  return item.price?.[layoutId] ?? null;
}
