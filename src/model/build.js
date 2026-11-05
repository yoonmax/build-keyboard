import {
  CASE_COLORS,
  CATALOG,
  HIGHLIGHT_KEYS,
  KEYCAP_MATERIALS,
  KEYCAP_THEMES,
  describeColor,
} from '../catalog/index.js';
import { getLayout } from '../layouts/index.js';

/** Current build schema. Increase it and add a migration when the shape changes. */
export const SCHEMA_VERSION = 2;

/** Copies a theme's colours into the flat shape stored on a build. */
export function themeToKeycaps(theme) {
  return {
    themeId: theme.id,
    base: theme.base,
    accent: theme.accent,
    highlight: theme.highlight,
    legend: theme.legend,
    legendHighlight: theme.legendHighlight,
    space: theme.space,
  };
}

/** The build a first-time visitor sees. */
export function createDefaultBuild() {
  const theme = KEYCAP_THEMES.find((t) => t.id === 'monochrome');
  return {
    schemaVersion: SCHEMA_VERSION,
    name: 'Untitled build',
    layoutId: '75',
    case: { id: 'case-anodized', colorId: 'black', customColor: '#7A8FA6', finish: 'satin', mount: 'gasket' },
    pcbId: 'pcb-hotswap-5',
    plateId: 'plate-aluminum',
    switchId: 'sw-drift',
    stabilizerId: 'stab-screw',
    keycaps: {
      setId: 'caps-sculpted',
      material: 'pbt',
      legendPlacement: 'corner',
      overrides: {},
      ...themeToKeycaps(theme),
    },
    lighting: { mode: 'none', color: '#F2E4C8', brightness: 0.6 },
    accessories: ['acc-foam'],
  };
}

export function cloneBuild(build) {
  return structuredClone(build);
}

/** Resolves the display colour of a case, whether it is named or custom. */
export function caseHex(buildCase) {
  if (buildCase.colorId === 'custom') return buildCase.customColor;
  return CASE_COLORS.find((c) => c.id === buildCase.colorId)?.hex ?? '#888888';
}

/** Resolves the readable name of a case colour. */
export function caseColorName(buildCase) {
  if (buildCase.colorId === 'custom') return `Custom (${describeColor(buildCase.customColor)})`;
  return CASE_COLORS.find((c) => c.id === buildCase.colorId)?.name ?? 'Unknown';
}

/**
 * Works out how one key should look from the theme and any per-key edits. Pure, so
 * the 3D scene, the 2D key map and the tests all get the same answer.
 * @param {{id:string, cluster:string}} key
 * @param {ReturnType<typeof createDefaultBuild>['keycaps']} keycaps
 * @returns {{color:string, legendColor:string, material:string, role:string}}
 */
export function resolveKeyStyle(key, keycaps) {
  let role = 'base';
  if (HIGHLIGHT_KEYS.includes(key.id)) role = 'highlight';
  else if (key.cluster === 'space') role = keycaps.space ?? 'base';
  else if (key.cluster === 'modifier' || key.cluster === 'function' || key.cluster === 'navigation') role = 'accent';

  const baseColor = role === 'highlight' ? keycaps.highlight : role === 'accent' ? keycaps.accent : keycaps.base;
  const baseLegend = role === 'highlight' ? keycaps.legendHighlight : role === 'accent' ? readableLegend(keycaps, baseColor) : keycaps.legend;

  const edit = keycaps.overrides?.[key.id];
  const color = edit?.color ?? baseColor;
  return {
    color,
    legendColor: edit?.legendColor ?? (edit?.color ? readableOn(color) : baseLegend),
    material: edit?.material ?? keycaps.material,
    role,
  };
}

/** Relative luminance of a #rrggbb colour. */
export function luminance(hex) {
  const v = hex.replace('#', '');
  const channel = (i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function readableOn(color) {
  return luminance(color) > 0.28 ? '#1E1F20' : '#EDEBE6';
}

function readableLegend(keycaps, keyColor) {
  // The theme legend stays in use unless it would be unreadable on this colour.
  return contrastRatio(keycaps.legend, keyColor) >= 2.6 ? keycaps.legend : keycaps.legendHighlight;
}

/**
 * Applies a catalog choice to a build and adjusts settings that only make sense for
 * certain items (such as a finish a new case does not offer). Returns a new build.
 * Conflicts between separate components are not corrected here: the compatibility
 * engine reports those so the user can see and decide.
 * @param {object} build
 * @param {string} category
 * @param {string} optionId
 */
export function setOption(build, category, optionId) {
  const next = cloneBuild(build);
  switch (category) {
    case 'layout':
      next.layoutId = optionId;
      break;
    case 'case': {
      const item = CATALOG.case.get(optionId);
      next.case.id = optionId;
      if (item) {
        if (!item.finishes.includes(next.case.finish)) next.case.finish = item.defaultFinish;
        if (!item.mounts.includes(next.case.mount)) next.case.mount = item.mounts[0];
      }
      break;
    }
    case 'finish':
      next.case.finish = optionId;
      break;
    case 'mount':
      next.case.mount = optionId;
      break;
    case 'caseColor':
      next.case.colorId = optionId;
      break;
    case 'pcb':
      next.pcbId = optionId;
      break;
    case 'plate':
      next.plateId = optionId;
      break;
    case 'switch':
      next.switchId = optionId;
      break;
    case 'stabilizer':
      next.stabilizerId = optionId;
      break;
    case 'keycaps': {
      const set = CATALOG.keycaps.get(optionId);
      next.keycaps.setId = optionId;
      if (set && !set.materials.includes(next.keycaps.material)) next.keycaps.material = set.materials[0];
      break;
    }
    case 'keycapMaterial':
      next.keycaps.material = optionId;
      break;
    case 'lighting':
      next.lighting.mode = optionId;
      break;
    case 'accessory':
      next.accessories = next.accessories.includes(optionId)
        ? next.accessories.filter((id) => id !== optionId)
        : [...next.accessories, optionId];
      break;
    case 'removeAccessory':
      next.accessories = next.accessories.filter((id) => id !== optionId);
      break;
    default:
      throw new Error(`Unknown option category: ${category}`);
  }
  return next;
}

/** Applies a keycap theme and clears per-key edits. */
export function applyTheme(build, theme) {
  const next = cloneBuild(build);
  Object.assign(next.keycaps, themeToKeycaps(theme));
  next.keycaps.overrides = {};
  return next;
}

/**
 * Recolours or re-materials a list of keys.
 * @param {object} build
 * @param {string[]} keyIds
 * @param {{color?:string, legendColor?:string, material?:string}} edit
 */
export function editKeys(build, keyIds, edit) {
  const next = cloneBuild(build);
  for (const id of keyIds) {
    next.keycaps.overrides[id] = { ...next.keycaps.overrides[id], ...edit };
  }
  return next;
}

/** Removes per-key edits for the listed keys. */
export function resetKeys(build, keyIds) {
  const next = cloneBuild(build);
  for (const id of keyIds) delete next.keycaps.overrides[id];
  return next;
}

/** The keys on the current layout that use a given material. */
export function keysUsingMaterial(build, materialId) {
  const layout = getLayout(build.layoutId);
  if (!layout) return [];
  return layout.keys.filter((k) => resolveKeyStyle(k, build.keycaps).material === materialId);
}

export { KEYCAP_MATERIALS };
