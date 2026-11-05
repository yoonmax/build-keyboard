import { CASE_COLORS, CATALOG, FINISHES, KEYCAP_MATERIALS, KEYCAP_THEMES, MOUNTS } from '../catalog/index.js';
import { ALL_KEY_IDS, getLayout } from '../layouts/index.js';
import { SCHEMA_VERSION, createDefaultBuild } from '../model/build.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_NAME = 60;

/**
 * Migrations from each older schema version to the next. Add one entry each time
 * SCHEMA_VERSION goes up. Version 1 stored one `keycapColor`, and no legend placement.
 */
export const MIGRATIONS = {
  1: (old) => {
    const next = { ...old, schemaVersion: 2 };
    next.keycaps = { legendPlacement: 'corner', ...old.keycaps };
    if (old.keycaps?.keycapColor && !old.keycaps.base) {
      next.keycaps.base = old.keycaps.keycapColor;
      delete next.keycaps.keycapColor;
    }
    return next;
  },
};

/** Brings raw data up to the current schema version. */
export function migrateBuild(raw) {
  let current = raw;
  let version = current.schemaVersion;
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new Error(`No migration from schema version ${version}.`);
    current = migrate(current);
    version = current.schemaVersion;
  }
  return current;
}

/**
 * Parses untrusted data into a safe build. Anything not recognised is discarded, so the
 * result holds only known ids, valid colours and known key ids, and contains no foreign
 * properties. Fields that are missing fall back to defaults and are listed in `warnings`.
 * Invalid required fields produce errors and no build.
 *
 * This checks that data is well formed. Whether the parts work together is a separate
 * question, answered by the compatibility engine.
 *
 * @param {unknown} raw
 * @returns {{ok:true, build:object, warnings:string[]}|{ok:false, errors:string[]}}
 */
export function parseBuild(raw) {
  const errors = [];
  const warnings = [];

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['The file does not contain a build.'] };
  }
  if (!Number.isInteger(raw.schemaVersion)) {
    return { ok: false, errors: ['The build has no schema version.'] };
  }
  if (raw.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`This build uses schema version ${raw.schemaVersion}, which is newer than this app (version ${SCHEMA_VERSION}).`],
    };
  }
  if (raw.schemaVersion < 1) return { ok: false, errors: ['The build has an invalid schema version.'] };

  let data;
  try {
    data = migrateBuild(raw);
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }

  const defaults = createDefaultBuild();

  const knownId = (map, value, label) => {
    if (map.has(value)) return value;
    errors.push(`Unknown ${label}: ${describe(value)}.`);
    return undefined;
  };

  const hexOr = (value, fallback, label) => {
    if (value === undefined) return fallback;
    if (typeof value === 'string' && HEX.test(value)) return value.toUpperCase();
    warnings.push(`Replaced an invalid colour for ${label}.`);
    return fallback;
  };

  const name =
    typeof data.name === 'string' && data.name.trim()
      ? data.name.trim().slice(0, MAX_NAME)
      : defaults.name;

  if (!getLayout(data.layoutId)) errors.push(`Unknown layout: ${describe(data.layoutId)}.`);

  const rawCase = isObject(data.case) ? data.case : {};
  const caseId = knownId(CATALOG.case, rawCase.id, 'case');
  const caseItem = caseId && CATALOG.case.get(caseId);
  let finish = rawCase.finish;
  if (!FINISHES[finish]) {
    finish = caseItem?.defaultFinish ?? defaults.case.finish;
    warnings.push('Replaced an unknown case finish.');
  }
  let mount = rawCase.mount;
  if (!MOUNTS[mount]) {
    mount = caseItem?.mounts[0] ?? defaults.case.mount;
    warnings.push('Replaced an unknown mounting style.');
  }
  let colorId = rawCase.colorId;
  if (!CASE_COLORS.some((c) => c.id === colorId)) {
    colorId = defaults.case.colorId;
    warnings.push('Replaced an unknown case colour.');
  }

  const pcbId = knownId(CATALOG.pcb, data.pcbId, 'PCB');
  const plateId = knownId(CATALOG.plate, data.plateId, 'plate');
  const switchId = knownId(CATALOG.switch, data.switchId, 'switch');
  const stabilizerId = knownId(CATALOG.stabilizer, data.stabilizerId, 'stabilizer');

  const rawCaps = isObject(data.keycaps) ? data.keycaps : {};
  const setId = knownId(CATALOG.keycaps, rawCaps.setId, 'keycap set');
  let material = rawCaps.material;
  if (!KEYCAP_MATERIALS[material]) {
    material = defaults.keycaps.material;
    warnings.push('Replaced an unknown keycap material.');
  }

  const overrides = {};
  if (isObject(rawCaps.overrides)) {
    for (const [keyId, edit] of Object.entries(rawCaps.overrides)) {
      if (!ALL_KEY_IDS.has(keyId) || !isObject(edit)) {
        warnings.push(`Ignored an edit for an unknown key: ${describe(keyId)}.`);
        continue;
      }
      const clean = {};
      if (typeof edit.color === 'string' && HEX.test(edit.color)) clean.color = edit.color.toUpperCase();
      if (typeof edit.legendColor === 'string' && HEX.test(edit.legendColor)) {
        clean.legendColor = edit.legendColor.toUpperCase();
      }
      if (KEYCAP_MATERIALS[edit.material]) clean.material = edit.material;
      if (Object.keys(clean).length) overrides[keyId] = clean;
    }
  }

  const rawLight = isObject(data.lighting) ? data.lighting : {};
  let mode = rawLight.mode;
  if (!CATALOG.lighting.has(mode)) {
    mode = 'none';
    if (rawLight.mode !== undefined) warnings.push('Turned off an unknown lighting mode.');
  }
  const brightness = Number.isFinite(rawLight.brightness)
    ? Math.min(1, Math.max(0, rawLight.brightness))
    : defaults.lighting.brightness;

  const accessories = [];
  if (Array.isArray(data.accessories)) {
    for (const id of data.accessories) {
      if (CATALOG.accessory.has(id) && !accessories.includes(id)) accessories.push(id);
      else warnings.push(`Ignored an unknown accessory: ${describe(id)}.`);
    }
  }

  if (errors.length) return { ok: false, errors };

  const themeId =
    rawCaps.themeId === 'custom' || KEYCAP_THEMES.some((t) => t.id === rawCaps.themeId)
      ? rawCaps.themeId
      : 'custom';

  return {
    ok: true,
    warnings,
    build: {
      schemaVersion: SCHEMA_VERSION,
      name,
      layoutId: data.layoutId,
      case: {
        id: caseId,
        colorId,
        customColor: hexOr(rawCase.customColor, defaults.case.customColor, 'the custom case colour'),
        finish,
        mount,
      },
      pcbId,
      plateId,
      switchId,
      stabilizerId,
      keycaps: {
        setId,
        material,
        legendPlacement: ['corner', 'center', 'blank'].includes(rawCaps.legendPlacement)
          ? rawCaps.legendPlacement
          : 'corner',
        overrides,
        themeId,
        base: hexOr(rawCaps.base, defaults.keycaps.base, 'the base colour'),
        accent: hexOr(rawCaps.accent, defaults.keycaps.accent, 'the accent colour'),
        highlight: hexOr(rawCaps.highlight, defaults.keycaps.highlight, 'the highlight colour'),
        legend: hexOr(rawCaps.legend, defaults.keycaps.legend, 'the legend colour'),
        legendHighlight: hexOr(rawCaps.legendHighlight, defaults.keycaps.legendHighlight, 'the highlight legend colour'),
        space: ['base', 'accent', 'highlight'].includes(rawCaps.space) ? rawCaps.space : 'base',
      },
      lighting: {
        mode,
        color: hexOr(rawLight.color, defaults.lighting.color, 'the lighting colour'),
        brightness,
      },
      accessories,
    },
  };
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? 'nothing';
  return `"${text.slice(0, 40)}"`;
}
