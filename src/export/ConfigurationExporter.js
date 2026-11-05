import { CATALOG, FINISHES, KEYCAP_MATERIALS, KEYCAP_PROFILES, MOUNTS, KEYCAP_THEMES, describeColor } from '../catalog/index.js';
import { validateBuild } from '../compatibility/CompatibilityEngine.js';
import { parseBuild } from '../compatibility/validation.js';
import { getLayout } from '../layouts/index.js';
import { SCHEMA_VERSION, caseColorName } from '../model/build.js';
import { calculatePrice, formatPrice } from '../model/pricing.js';

const FORMAT = 'build-keyboard-configuration';
/** Rejects absurdly large imports before they are parsed. */
export const MAX_IMPORT_BYTES = 256 * 1024;

/** Turns a build into a JSON document. */
export function serializeBuild(build) {
  return JSON.stringify({ format: FORMAT, schemaVersion: SCHEMA_VERSION, build }, null, 2);
}

/**
 * Parses an imported JSON file. Accepts the export envelope or a bare build object.
 * @param {string} text
 * @returns {ReturnType<typeof parseBuild>}
 */
export function deserializeBuild(text) {
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) {
    return { ok: false, errors: ['This file is too large to be a build configuration.'] };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file is not valid JSON.'] };
  }
  if (data && typeof data === 'object' && 'format' in data) {
    if (data.format !== FORMAT) return { ok: false, errors: ['This JSON file is not a BUILD configuration.'] };
    return parseBuild(data.build);
  }
  return parseBuild(data);
}

/** A readable name for the keycap colourway. */
export function colorwayName(keycaps) {
  const theme = KEYCAP_THEMES.find((t) => t.id === keycaps.themeId);
  const name = theme ? theme.name : `Custom (${describeColor(keycaps.base)})`;
  const edited = Object.keys(keycaps.overrides ?? {}).length;
  return edited ? `${name}, ${edited} custom ${edited === 1 ? 'key' : 'keys'}` : name;
}

/**
 * The specification sheet as ordered sections, shared by the on-screen summary, the
 * copied text and the image build sheet.
 */
export function buildSpecification(build) {
  const layout = getLayout(build.layoutId);
  const caseItem = CATALOG.case.get(build.case.id);
  const caps = CATALOG.keycaps.get(build.keycaps.setId);
  const sw = CATALOG.switch.get(build.switchId);
  const plate = CATALOG.plate.get(build.plateId);
  const pcb = CATALOG.pcb.get(build.pcbId);
  const stab = CATALOG.stabilizer.get(build.stabilizerId);
  const lighting = CATALOG.lighting.get(build.lighting.mode);
  const compatibility = validateBuild(build);
  const price = calculatePrice(build);

  const compatibilityText =
    compatibility.status === 'valid'
      ? 'All checks passed'
      : compatibility.status === 'warning'
        ? `Buildable, with ${count(compatibility.warnings.length, 'warning')}`
        : `Not buildable: ${count(compatibility.errors.length, 'error')}`;

  return {
    name: build.name,
    sections: [
      {
        title: 'Form',
        rows: [
          ['Layout', `${layout.fullName}, ${layout.keyCount} keys`],
          ['Case material', caseItem.name],
          ['Case finish', FINISHES[build.case.finish]?.name ?? build.case.finish],
          ['Case colour', caseColorName(build.case)],
          ['Mount', MOUNTS[build.case.mount]?.name ?? build.case.mount],
        ],
      },
      {
        title: 'Keycaps',
        rows: [
          ['Keycap profile', KEYCAP_PROFILES[caps.profile].name],
          ['Keycap material', KEYCAP_MATERIALS[build.keycaps.material]?.name ?? build.keycaps.material],
          ['Keycap colours', colorwayName(build.keycaps)],
        ],
      },
      {
        title: 'Internals',
        rows: [
          ['Switch type', `${sw.name}, ${sw.typeName.toLowerCase()}, ${layout.switchCount} × ${sw.pins}-pin`],
          ['Plate material', plate.name],
          ['PCB', pcb.name],
          [
            'Stabilizer configuration',
            `${stab.name}, needs ${layout.stabilizerCounts.small} small and ${layout.stabilizerCounts.large} large`,
          ],
          ['Lighting', lighting.name],
          [
            'Accessories',
            build.accessories.map((id) => CATALOG.accessory.get(id)?.name).filter(Boolean).join(', ') || 'None',
          ],
        ],
      },
      {
        title: 'Status',
        rows: [
          ['Compatibility status', compatibilityText],
          ['Estimated total cost', `${formatPrice(price.total)}${price.complete ? '' : ' (incomplete)'}`],
          ['Price basis', price.basis.label],
        ],
      },
    ],
    compatibility,
    price,
  };
}

/** Plain-text specification for the clipboard. */
export function specificationText(build) {
  const spec = buildSpecification(build);
  const lines = [spec.name, '='.repeat(spec.name.length), ''];
  for (const section of spec.sections) {
    lines.push(section.title);
    for (const [label, value] of section.rows) lines.push(`  ${label}: ${value}`);
    lines.push('');
  }
  for (const issue of spec.compatibility.issues) {
    lines.push(`${issue.severity === 'error' ? 'Error' : 'Warning'}: ${issue.message}`);
  }
  return lines.join('\n').trim();
}

/** Safe filename from a build name. */
export function fileNameFor(name, extension) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug || 'build'}.${extension}`;
}

/** Starts a browser download for a blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function count(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
