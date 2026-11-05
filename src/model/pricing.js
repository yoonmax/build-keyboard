import { CATALOG, KEYCAP_MATERIALS, priceFor } from '../catalog/index.js';
import { getLayout } from '../layouts/index.js';
import { keysUsingMaterial } from './build.js';

/** Extra charge for matching a custom case colour. Illustrative. */
export const CUSTOM_COLOR_SURCHARGE = 24;

/** All prices are illustrative estimates. Verified retail pricing would use another basis. */
export const PRICE_BASIS = {
  id: 'illustrative',
  label: 'Illustrative catalog estimate',
  note: 'Prices are made up for this demo to show how costs add up. They are not quotes from a real retailer.',
};

/**
 * Breaks down a build's estimated cost. A component not sold for the layout has no
 * price and is flagged, so the total is never presented as complete when it isn't.
 * @returns {{lines:object[], total:number, complete:boolean, basis:typeof PRICE_BASIS, currency:string}}
 */
export function calculatePrice(build) {
  const layout = getLayout(build.layoutId);
  const lines = [];
  const add = (group, label, item, { quantity = 1, unit = null, detail = null } = {}) => {
    const unitPrice = unit ?? (item ? priceFor(item, build.layoutId) : null);
    const available = unitPrice !== null && unitPrice !== undefined;
    lines.push({
      group,
      label,
      quantity,
      unitPrice: available ? unitPrice : null,
      amount: available ? round(unitPrice * quantity) : 0,
      available,
      detail,
    });
  };

  const caseItem = CATALOG.case.get(build.case.id);
  add('Case', caseItem?.name ?? 'Unknown case', caseItem, { detail: layout ? `${layout.name} body` : null });
  if (build.case.colorId === 'custom') {
    add('Case', 'Custom colour match', null, { unit: CUSTOM_COLOR_SURCHARGE });
  }

  const pcb = CATALOG.pcb.get(build.pcbId);
  add('PCB', pcb?.name ?? 'Unknown PCB', pcb);

  const plate = CATALOG.plate.get(build.plateId);
  add('Plate', plate?.name ?? 'Unknown plate', plate);

  const sw = CATALOG.switch.get(build.switchId);
  add('Switches', sw?.name ?? 'Unknown switch', sw, {
    quantity: layout?.switchCount ?? 0,
    detail: 'One per key',
  });

  const caps = CATALOG.keycaps.get(build.keycaps.setId);
  add('Keycaps', caps?.name ?? 'Unknown set', caps);
  const metalKeys = keysUsingMaterial(build, 'aluminum');
  if (metalKeys.length) {
    add('Keycaps', 'Aluminum keycaps', null, {
      quantity: metalKeys.length,
      unit: KEYCAP_MATERIALS.aluminum.surcharge,
      detail: 'Per key',
    });
  }

  const stab = CATALOG.stabilizer.get(build.stabilizerId);
  add('Stabilizers', stab?.name ?? 'Unknown stabilizers', stab);

  const lighting = CATALOG.lighting.get(build.lighting.mode);
  if (lighting && lighting.id !== 'none') add('Lighting', lighting.name, lighting);

  for (const id of build.accessories) {
    const item = CATALOG.accessory.get(id);
    if (item) add('Accessories', item.name, item);
  }

  return {
    lines,
    total: round(lines.reduce((sum, line) => sum + line.amount, 0)),
    complete: lines.every((line) => line.available),
    basis: PRICE_BASIS,
    currency: 'USD',
  };
}

/** Totals by group, in a stable display order. */
export function priceByGroup(price) {
  const order = ['Case', 'PCB', 'Plate', 'Switches', 'Keycaps', 'Stabilizers', 'Lighting', 'Accessories'];
  return order
    .map((group) => {
      const lines = price.lines.filter((l) => l.group === group);
      return {
        group,
        lines,
        amount: round(lines.reduce((sum, l) => sum + l.amount, 0)),
        available: lines.every((l) => l.available),
      };
    })
    .filter((g) => g.lines.length > 0);
}

export function formatPrice(amount) {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
