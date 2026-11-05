import {
  CATALOG,
  FINISHES,
  KEYCAP_MATERIALS,
  KEYCAP_PROFILES,
  MOUNTS,
  SWITCH_DATA_NOTE,
  priceFor,
} from '../catalog/index.js';
import { getLayout } from '../layouts/index.js';
import { U } from '../layouts/units.js';
import { EXPLODE_LAYERS, STACK, caseDimensions } from './assembly.js';
import { caseColorName, resolveKeyStyle } from './build.js';
import { describeColor } from '../catalog/colors.js';
import { formatPrice } from './pricing.js';

const money = (value) => (value === null || value === undefined ? 'Not sold for this layout' : formatPrice(value));
const mm = (value) => `${value.toFixed(1)} mm`;

/** What the compatibility panel should flag for a component, by category. */
function relatedIssues(compatibility, categories) {
  return compatibility.issues.filter((issue) => issue.components.some((c) => categories.includes(c)));
}

/**
 * Inspector content for the current selection. Each kind of part reports what matters
 * for that part, drawn from the same data the scene and engine use.
 * @param {object} selection
 * @param {object} build
 * @param {object} compatibility
 * @returns {null|{title:string, kind:string, subtitle:string, rows:[string,string][], notes:string,
 *   issues:object[], price:string|null, customize:string|null, data?:object}}
 */
export function inspectorContent(selection, build, compatibility) {
  const layout = getLayout(build.layoutId);
  if (selection.kind === 'keys') return keysContent(selection.keyIds, build, layout, compatibility);
  if (selection.kind !== 'layer') return null;

  const name = EXPLODE_LAYERS.find((l) => l.id === selection.layerId)?.name ?? 'Part';
  const dims = caseDimensions(layout);

  switch (selection.layerId) {
    case 'upperCase':
    case 'lowerCase': {
      const item = CATALOG.case.get(build.case.id);
      return {
        kind: 'case',
        title: name,
        subtitle: item.name,
        rows: [
          ['Colour', caseColorName(build.case)],
          ['Finish', FINISHES[build.case.finish]?.name ?? build.case.finish],
          ['Mount', MOUNTS[build.case.mount]?.name ?? build.case.mount],
          ['Outer size', `${dims.outerW.toFixed(0)} × ${dims.outerD.toFixed(0)} mm`],
          ...(selection.layerId === 'lowerCase'
            ? [['Includes', 'Rear weight, USB-C port, four rubber feet']]
            : [['Frame above plate', mm(STACK.frameTop)]]),
          ...Object.entries(item.specs),
        ],
        notes: `${item.notes} ${FINISHES[build.case.finish]?.note ?? ''}`,
        issues: relatedIssues(compatibility, ['case']),
        price: `${money(priceFor(item, build.layoutId))} for the case`,
        customize: 'case',
      };
    }
    case 'plate': {
      const item = CATALOG.plate.get(build.plateId);
      return {
        kind: 'plate',
        title: name,
        subtitle: item.name,
        rows: [
          ['Switch cutouts', `${layout.keyCount} at 14 × 14 mm`],
          ['Stabilizer cutouts', `${(layout.stabilizerCounts.small + layout.stabilizerCounts.large) * 2}`],
          ['Size', `${dims.plateW.toFixed(1)} × ${dims.plateD.toFixed(1)} mm`],
          ['Mounting', MOUNTS[build.case.mount]?.name ?? build.case.mount],
          ...Object.entries(item.specs),
        ],
        notes: `${item.acoustic} ${item.notes} Flex and sound are representative descriptions.`,
        issues: relatedIssues(compatibility, ['plate']),
        price: money(priceFor(item, build.layoutId)),
        customize: 'plate',
      };
    }
    case 'pcb': {
      const item = CATALOG.pcb.get(build.pcbId);
      return {
        kind: 'pcb',
        title: name,
        subtitle: item.name,
        rows: [
          ['Size', `${dims.pcbW.toFixed(1)} × ${dims.pcbD.toFixed(1)} mm`],
          ['Switch positions', `${layout.keyCount}, in ${layout.rowCount} rows`],
          ['Stabilizer holes', `${(layout.stabilizerCounts.small + layout.stabilizerCounts.large) * 2} pairs`],
          ...Object.entries(item.specs),
        ],
        notes: `${item.notes} The traces drawn here follow the real rows and columns of this layout. They illustrate routing and are not a working circuit design.`,
        issues: relatedIssues(compatibility, ['pcb']),
        price: money(priceFor(item, build.layoutId)),
        customize: 'plate',
      };
    }
    case 'switches': {
      const item = CATALOG.switch.get(build.switchId);
      return {
        kind: 'switch',
        title: name,
        subtitle: `${item.name}, ${item.typeName.toLowerCase()}`,
        rows: [
          ['Quantity', `${layout.switchCount}`],
          ['Pins', `${item.pins}-pin`],
          ['Actuation force', `${item.actuationForce} gf`],
          ['Bottom-out force', `${item.bottomOutForce} gf`],
          ['Actuation point', `${item.actuationDistance.toFixed(1)} mm`],
          ['Total travel', `${item.totalTravel.toFixed(1)} mm`],
          ...(item.tactile
            ? [[item.type === 'clicky' ? 'Click at' : 'Bump at', `${item.tactile.position.toFixed(2)} mm`]]
            : []),
          ['Sound', item.typeName],
        ],
        notes: `${item.notes} ${SWITCH_DATA_NOTE}`,
        issues: relatedIssues(compatibility, ['switch']),
        price: `${formatPrice(item.price)} each, ${formatPrice(item.price * layout.switchCount)} in total`,
        customize: 'switches',
        data: { switchId: item.id },
      };
    }
    case 'stabilizers': {
      const item = CATALOG.stabilizer.get(build.stabilizerId);
      return {
        kind: 'stabilizer',
        title: name,
        subtitle: item.name,
        rows: [
          ['Needed by layout', `${layout.stabilizerCounts.small} small and ${layout.stabilizerCounts.large} large`],
          ['In the kit', `${item.kit.small} small and ${item.kit.large} large`],
          ['Keys with stabilizers', layout.keys.filter((k) => k.stabilizer).map((k) => k.legend || 'Space').join(', ')],
          ...Object.entries(item.specs),
        ],
        notes: item.notes,
        issues: relatedIssues(compatibility, ['stabilizer']),
        price: money(item.price),
        customize: 'stabilizers',
      };
    }
    case 'keycaps': {
      return keysContent(layout.keys.map((k) => k.id), build, layout, compatibility);
    }
    case 'plateFoam':
    case 'caseFoam': {
      const item = CATALOG.accessory.get('acc-foam');
      return {
        kind: 'foam',
        title: name,
        subtitle: item.name,
        rows: [
          ['Thickness', selection.layerId === 'plateFoam' ? '3 mm' : '3.5 mm'],
          ['Sits', selection.layerId === 'plateFoam' ? 'Between plate and PCB' : 'Under the PCB, in the case floor'],
          ...Object.entries(item.specs),
        ],
        notes: item.notes,
        issues: relatedIssues(compatibility, ['accessory']),
        price: `${money(priceFor(item, build.layoutId))} for both layers`,
        customize: 'accessories',
      };
    }
    default:
      return null;
  }
}

function keysContent(keyIds, build, layout, compatibility) {
  const keys = keyIds.map((id) => layout.keyById.get(id)).filter(Boolean);
  if (keys.length === 0) return null;
  const set = CATALOG.keycaps.get(build.keycaps.setId);
  const profile = KEYCAP_PROFILES[set.profile];

  if (keys.length > 1) {
    const sizes = [...new Set(keys.map((k) => `${k.w}u`))].join(', ');
    return {
      kind: 'keys',
      title: `${keys.length} keycaps`,
      subtitle: `${profile.name} profile`,
      rows: [
        ['Sizes', sizes],
        ['Edited', `${keys.filter((k) => build.keycaps.overrides[k.id]).length} of ${keys.length}`],
      ],
      notes: 'Changes in the key editor apply to all selected keys.',
      issues: relatedIssues(compatibility, ['keycaps']),
      price: null,
      customize: 'keycaps',
      data: { keyIds },
    };
  }

  const key = keys[0];
  const style = resolveKeyStyle(key, build.keycaps);
  const row = profile.rows[key.profile];
  const material = KEYCAP_MATERIALS[style.material];
  return {
    kind: 'key',
    title: key.legend ? `${key.legend} keycap` : 'Spacebar',
    subtitle: `${key.w}u ${profile.name.toLowerCase()}`,
    rows: [
      ['Size', `${key.w}u, ${(key.w * U - 0.85).toFixed(2)} mm wide`],
      ['Row height', `${row.height.toFixed(1)} mm, ${Math.abs(row.tilt)}° tilt`],
      ['Material', material.name],
      ['Colour', describeColor(style.color)],
      ['Legend', key.legend ? describeColor(style.legendColor) : 'None'],
      ['Stabilizer', key.stabilizer ? `${key.stabilizer.class === 'large' ? 'Large' : 'Small'} wire` : 'None'],
      ['Position', `Row ${key.row + 1}, column ${key.column + 1}`],
    ],
    notes: material.note,
    issues: relatedIssues(compatibility, ['keycaps']),
    price: style.material === 'aluminum' ? `${formatPrice(material.surcharge)} extra for this key` : 'Included in the set',
    customize: 'keycaps',
    data: { keyIds },
  };
}
