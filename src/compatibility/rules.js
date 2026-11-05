import {
  ACCESSORIES,
  CASES,
  CATALOG,
  KEYCAP_SETS,
  LIGHTING,
  MOUNTS,
  PCBS,
  PLATES,
  STABILIZERS,
  SWITCHES,
  SWITCH_CLIP_RANGE,
} from '../catalog/index.js';
import { LAYOUTS } from '../layouts/index.js';
import { keysUsingMaterial } from '../model/build.js';

/**
 * A rule looks at the resolved build and returns zero or more issues.
 * To add a rule, append it here: nothing else needs to change.
 *
 * @typedef {Object} Suggestion
 * @property {string} category Build category to change, as understood by setOption()
 * @property {string} optionId Value to change it to
 * @property {string} label Text on the button that applies it
 *
 * @typedef {Object} Issue
 * @property {string} ruleId
 * @property {'error'|'warning'} severity
 * @property {string} message Plain-language explanation
 * @property {string[]} components Categories involved, for highlighting in the UI
 * @property {Suggestion[]} suggestions
 *
 * @typedef {Object} Rule
 * @property {string} id
 * @property {string} title
 * @property {(ctx:object) => Issue[]} check
 */

const suggest = (category, optionId, label) => ({ category, optionId, label });

/** Options in a list that pass a test, as suggestions. Capped to keep messages readable. */
function alternatives(items, category, test, verb = 'Use') {
  return items
    .filter(test)
    .slice(0, 3)
    .map((item) => suggest(category, item.id, `${verb} ${item.name}`));
}

function layoutAlternatives(test) {
  return LAYOUTS.filter(test)
    .slice(0, 3)
    .map((layout) => suggest('layout', layout.id, `Switch to ${layout.name}`));
}

/** Does a keycap set have enough caps of each size for a layout? Returns the shortfalls. */
export function keycapShortfall(set, layout) {
  const missing = [];
  for (const [size, needed] of Object.entries(layout.sizeCounts)) {
    const available = set.coverage[size] ?? 0;
    if (available < needed) missing.push({ size: Number(size), needed, available });
  }
  return missing;
}

/** @type {Rule[]} */
export const RULES = [
  {
    id: 'case-layout',
    title: 'Case fits the layout',
    check: ({ caseItem, layout }) =>
      caseItem.layouts.includes(layout.id)
        ? []
        : [
            {
              ruleId: 'case-layout',
              severity: 'error',
              message: `The ${caseItem.name} case isn't made for a ${layout.name} board.`,
              components: ['case', 'layout'],
              suggestions: [
                ...alternatives(CASES, 'case', (c) => c.layouts.includes(layout.id)),
                ...layoutAlternatives((l) => caseItem.layouts.includes(l.id)),
              ],
            },
          ],
  },
  {
    id: 'pcb-layout',
    title: 'PCB fits the layout',
    check: ({ pcb, layout }) =>
      pcb.layouts.includes(layout.id)
        ? []
        : [
            {
              ruleId: 'pcb-layout',
              severity: 'error',
              message: `The ${pcb.name} PCB has no ${layout.name} version, so its switch positions won't match.`,
              components: ['pcb', 'layout'],
              suggestions: alternatives(PCBS, 'pcb', (p) => p.layouts.includes(layout.id)),
            },
          ],
  },
  {
    id: 'plate-layout',
    title: 'Plate fits the layout',
    check: ({ plate, layout }) =>
      plate.layouts.includes(layout.id)
        ? []
        : [
            {
              ruleId: 'plate-layout',
              severity: 'error',
              message: `The ${plate.name} plate isn't cut for a ${layout.name} board.`,
              components: ['plate', 'layout'],
              suggestions: alternatives(PLATES, 'plate', (p) => p.layouts.includes(layout.id)),
            },
          ],
  },
  {
    id: 'keycap-coverage',
    title: 'Keycap set covers the layout',
    check: ({ caps, layout }) => {
      const missing = keycapShortfall(caps, layout);
      if (missing.length === 0) return [];
      const detail = missing
        .map((m) => `${m.needed} × ${m.size}u needed, ${m.available} in the set`)
        .join('; ');
      return [
        {
          ruleId: 'keycap-coverage',
          severity: 'error',
          message: `The ${caps.name} doesn't cover a ${layout.name} board (${detail}).`,
          components: ['keycaps', 'layout'],
          suggestions: [
            ...alternatives(KEYCAP_SETS, 'keycaps', (s) => keycapShortfall(s, layout).length === 0),
            ...layoutAlternatives((l) => keycapShortfall(caps, l).length === 0),
          ],
        },
      ];
    },
  },
  {
    id: 'case-mount',
    title: 'Case supports the mount',
    check: ({ caseItem, build }) =>
      caseItem.mounts.includes(build.case.mount)
        ? []
        : [
            {
              ruleId: 'case-mount',
              severity: 'error',
              message: `The ${caseItem.name} case has no fixings for a ${MOUNTS[build.case.mount]?.name.toLowerCase() ?? build.case.mount}.`,
              components: ['case'],
              suggestions: caseItem.mounts.map((m) => suggest('mount', m, `Use ${MOUNTS[m].name.toLowerCase()}`)),
            },
          ],
  },
  {
    id: 'plate-mount',
    title: 'Plate works with the mount',
    check: ({ plate, build }) =>
      plate.mounts.includes(build.case.mount)
        ? []
        : [
            {
              ruleId: 'plate-mount',
              severity: 'error',
              message: `A ${plate.name} plate is too flexible for a ${MOUNTS[build.case.mount]?.name.toLowerCase()}.`,
              components: ['plate', 'case'],
              suggestions: [
                ...alternatives(PLATES, 'plate', (p) => p.mounts.includes(build.case.mount)),
                ...plate.mounts
                  .filter((m) => CATALOG.case.get(build.case.id).mounts.includes(m))
                  .map((m) => suggest('mount', m, `Use ${MOUNTS[m].name.toLowerCase()}`)),
              ],
            },
          ],
  },
  {
    id: 'pcb-mount',
    title: 'PCB works with the mount',
    check: ({ pcb, build }) =>
      pcb.mounts.includes(build.case.mount)
        ? []
        : [
            {
              ruleId: 'pcb-mount',
              severity: 'error',
              message: `The ${pcb.name} PCB has no holes for a ${MOUNTS[build.case.mount]?.name.toLowerCase()}.`,
              components: ['pcb', 'case'],
              suggestions: alternatives(PCBS, 'pcb', (p) => p.mounts.includes(build.case.mount)),
            },
          ],
  },
  {
    id: 'switch-pins',
    title: 'Switch pins fit the PCB',
    check: ({ sw, pcb }) =>
      pcb.acceptsPins.includes(sw.pins)
        ? []
        : [
            {
              ruleId: 'switch-pins',
              severity: 'warning',
              message: `${sw.name} is a ${sw.pins}-pin switch, but this PCB only has holes for ${pcb.acceptsPins.join(' and ')}-pin switches. You would have to clip its two plastic posts.`,
              components: ['switch', 'pcb'],
              suggestions: [
                ...alternatives(SWITCHES, 'switch', (s) => pcb.acceptsPins.includes(s.pins) && s.type === sw.type),
                ...alternatives(PCBS, 'pcb', (p) => p.acceptsPins.includes(sw.pins) && p.socket === pcb.socket),
              ],
            },
          ],
  },
  {
    id: 'solder-required',
    title: 'Soldering needed',
    check: ({ pcb }) =>
      pcb.socket === 'solder'
        ? [
            {
              ruleId: 'solder-required',
              severity: 'warning',
              message: 'This PCB has no sockets, so every switch must be soldered. Changing one later means desoldering it.',
              components: ['pcb', 'switch'],
              suggestions: alternatives(PCBS, 'pcb', (p) => p.socket === 'hotswap'),
            },
          ]
        : [],
  },
  {
    id: 'plate-clip-thickness',
    title: 'Switch clips grip the plate',
    check: ({ plate }) =>
      plate.thickness >= SWITCH_CLIP_RANGE.min && plate.thickness <= SWITCH_CLIP_RANGE.max
        ? []
        : [
            {
              ruleId: 'plate-clip-thickness',
              severity: 'error',
              message: `A ${plate.thickness} mm plate is outside the ${SWITCH_CLIP_RANGE.min}–${SWITCH_CLIP_RANGE.max} mm range that switch clips can grip.`,
              components: ['plate', 'switch'],
              suggestions: alternatives(
                PLATES,
                'plate',
                (p) => p.thickness >= SWITCH_CLIP_RANGE.min && p.thickness <= SWITCH_CLIP_RANGE.max,
              ),
            },
          ],
  },
  {
    id: 'stabilizer-mount',
    title: 'Stabilizers fit the PCB',
    check: ({ stab, pcb }) =>
      pcb.stabilizerMounts.includes(stab.mountType)
        ? []
        : [
            {
              ruleId: 'stabilizer-mount',
              severity: 'error',
              message: `The ${pcb.name} PCB has no holes for ${stab.name.toLowerCase()} stabilizers.`,
              components: ['stabilizer', 'pcb'],
              suggestions: alternatives(STABILIZERS, 'stabilizer', (s) => pcb.stabilizerMounts.includes(s.mountType)),
            },
          ],
  },
  {
    id: 'stabilizer-coverage',
    title: 'Enough stabilizers in the kit',
    check: ({ stab, layout }) => {
      const { small, large } = layout.stabilizerCounts;
      if (stab.kit.small >= small && stab.kit.large >= large) return [];
      return [
        {
          ruleId: 'stabilizer-coverage',
          severity: 'error',
          message: `A ${layout.name} board needs ${small} small and ${large} large stabilizers. This kit has ${stab.kit.small} small and ${stab.kit.large} large.`,
          components: ['stabilizer', 'layout'],
          suggestions: alternatives(
            STABILIZERS,
            'stabilizer',
            (s) => s.kit.small >= small && s.kit.large >= large && s.mountType === stab.mountType,
          ),
        },
      ];
    },
  },
  {
    id: 'plate-stabilizer-flex',
    title: 'Plate is stiff enough for plate-mount stabilizers',
    check: ({ stab, plate }) =>
      stab.mountType === 'plate' && plate.flex === 'high'
        ? [
            {
              ruleId: 'plate-stabilizer-flex',
              severity: 'warning',
              message: `Plate-mount stabilizers can shift on a flexible ${plate.name} plate, which may make long keys feel uneven.`,
              components: ['stabilizer', 'plate'],
              suggestions: [
                ...alternatives(STABILIZERS, 'stabilizer', (s) => s.mountType === 'pcb-screw' && s.kit.small >= 4),
                ...alternatives(PLATES, 'plate', (p) => p.flex !== 'high'),
              ],
            },
          ]
        : [],
  },
  {
    id: 'lighting-pcb',
    title: 'PCB supports the lighting',
    check: ({ build, lightingItem, pcb }) =>
      pcb.lighting.includes(build.lighting.mode)
        ? []
        : [
            {
              ruleId: 'lighting-pcb',
              severity: 'error',
              message: `The ${pcb.name} PCB has no circuit for ${lightingItem.name.toLowerCase()}.`,
              components: ['lighting', 'pcb'],
              suggestions: [
                ...alternatives(PCBS, 'pcb', (p) => p.lighting.includes(build.lighting.mode)),
                ...alternatives(LIGHTING, 'lighting', (l) => pcb.lighting.includes(l.id)),
              ],
            },
          ],
  },
  {
    id: 'underglow-case',
    title: 'Underglow can reach through the case',
    check: ({ build, caseItem }) =>
      build.lighting.mode === 'underglow' && !caseItem.transmitsLight
        ? [
            {
              ruleId: 'underglow-case',
              severity: 'warning',
              message: `An opaque ${caseItem.name} case will block almost all of the underglow. Only a faint spill around the keys will show.`,
              components: ['lighting', 'case'],
              suggestions: alternatives(CASES, 'case', (c) => c.transmitsLight && c.layouts.includes(build.layoutId)),
            },
          ]
        : [],
  },
  {
    id: 'per-key-housing',
    title: 'Switch housing lets per-key light through',
    check: ({ build, sw }) =>
      build.lighting.mode === 'per-key' && !sw.housing.ledWindow
        ? [
            {
              ruleId: 'per-key-housing',
              severity: 'warning',
              message: `${sw.name} has an opaque housing, so per-key LEDs will look dim.`,
              components: ['lighting', 'switch'],
              suggestions: alternatives(SWITCHES, 'switch', (s) => s.housing.ledWindow && s.type === sw.type),
            },
          ]
        : [],
  },
  {
    id: 'anodized-white',
    title: 'Anodized colour is achievable',
    check: ({ build }) =>
      build.case.id === 'case-anodized' && build.case.colorId === 'white'
        ? [
            {
              ruleId: 'anodized-white',
              severity: 'warning',
              message: 'Anodizing cannot produce a true white. Expect a pale gray with a metallic cast.',
              components: ['case'],
              suggestions: [suggest('case', 'case-painted', 'Use Painted aluminum')],
            },
          ]
        : [],
  },
  {
    id: 'case-finish',
    title: 'Case offers the finish',
    check: ({ build, caseItem }) =>
      caseItem.finishes.includes(build.case.finish)
        ? []
        : [
            {
              ruleId: 'case-finish',
              severity: 'error',
              message: `The ${caseItem.name} case isn't offered with a ${build.case.finish} finish.`,
              components: ['case'],
              suggestions: caseItem.finishes.map((f) => suggest('finish', f, `Use ${f}`)),
            },
          ],
  },
  {
    id: 'keycap-material',
    title: 'Keycap set is sold in the material',
    check: ({ build, caps }) =>
      caps.materials.includes(build.keycaps.material)
        ? []
        : [
            {
              ruleId: 'keycap-material',
              severity: 'error',
              message: `The ${caps.name} isn't made in ${build.keycaps.material.toUpperCase()}.`,
              components: ['keycaps'],
              suggestions: caps.materials.map((m) => suggest('keycapMaterial', m, `Use ${m.toUpperCase()}`)),
            },
          ],
  },
  {
    id: 'metal-cap-spring',
    title: 'Springs can lift metal keycaps',
    check: ({ build, sw }) => {
      const metal = keysUsingMaterial(build, 'aluminum');
      if (metal.length === 0 || sw.preload >= 35) return [];
      return [
        {
          ruleId: 'metal-cap-spring',
          severity: 'warning',
          message: `${metal.length === 1 ? 'A metal keycap weighs' : 'Metal keycaps weigh'} far more than plastic. ${sw.name}'s light spring may return slowly under ${metal.length === 1 ? 'it' : 'them'}.`,
          components: ['keycaps', 'switch'],
          suggestions: alternatives(SWITCHES, 'switch', (s) => s.preload >= 35 && s.type === sw.type),
        },
      ];
    },
  },
  {
    id: 'accessory-layout',
    title: 'Accessories fit the layout',
    check: ({ accessories, layout }) =>
      accessories
        .filter((a) => !a.layouts.includes(layout.id))
        .map((a) => ({
          ruleId: 'accessory-layout',
          severity: 'error',
          message: `The ${a.name} isn't made for a ${layout.name} board.`,
          components: ['accessory', 'layout'],
          suggestions: [
            suggest('removeAccessory', a.id, `Remove ${a.name}`),
            ...layoutAlternatives((l) => a.layouts.includes(l.id)),
          ],
        })),
  },
];

export { ACCESSORIES };
