import { CATALOG } from '../catalog/index.js';
import { getLayout } from '../layouts/index.js';
import { setOption } from '../model/build.js';
import { RULES } from './rules.js';

/**
 * Looks up every catalog item a build refers to. Unknown ids are reported instead of
 * reaching the rules, so each rule can assume its inputs exist.
 * @returns {{ctx: object|null, missing: string[]}}
 */
export function resolveBuild(build) {
  const missing = [];
  const need = (map, id, label) => {
    const item = map.get(id);
    if (!item) missing.push(`${label} "${id}"`);
    return item;
  };
  const layout = getLayout(build.layoutId);
  if (!layout) missing.push(`layout "${build.layoutId}"`);
  const ctx = {
    build,
    layout,
    caseItem: need(CATALOG.case, build.case?.id, 'case'),
    pcb: need(CATALOG.pcb, build.pcbId, 'PCB'),
    plate: need(CATALOG.plate, build.plateId, 'plate'),
    sw: need(CATALOG.switch, build.switchId, 'switch'),
    stab: need(CATALOG.stabilizer, build.stabilizerId, 'stabilizer'),
    caps: need(CATALOG.keycaps, build.keycaps?.setId, 'keycap set'),
    lightingItem: need(CATALOG.lighting, build.lighting?.mode, 'lighting'),
    accessories: (build.accessories ?? []).map((id) => need(CATALOG.accessory, id, 'accessory')).filter(Boolean),
  };
  return { ctx: missing.length ? null : ctx, missing };
}

/**
 * Checks a build against every rule.
 * @param {object} build
 * @param {import('./rules.js').Rule[]} [rules] Lets tests and future features supply other rule sets.
 * @returns {{status:'valid'|'warning'|'error', valid:boolean, errors:object[], warnings:object[], issues:object[], checked:number}}
 */
export function validateBuild(build, rules = RULES) {
  const { ctx, missing } = resolveBuild(build);
  if (!ctx) {
    const issues = missing.map((m) => ({
      ruleId: 'unknown-component',
      severity: 'error',
      message: `This build refers to an unknown ${m}.`,
      components: [],
      suggestions: [],
    }));
    return { status: 'error', valid: false, errors: issues, warnings: [], issues, checked: 0 };
  }
  const issues = rules.flatMap((rule) => rule.check(ctx));
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return {
    status: errors.length ? 'error' : warnings.length ? 'warning' : 'valid',
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
    checked: rules.length,
  };
}

const issueKey = (issue) => `${issue.ruleId}:${issue.message}`;

/**
 * Previews an option before it is chosen. Reports only issues the option would add,
 * which is what guided filtering shows next to each choice in the interface.
 * @returns {{status:'ok'|'warning'|'error', issues:object[]}}
 */
export function evaluateOption(build, category, optionId) {
  const before = new Set(validateBuild(build).issues.map(issueKey));
  const after = validateBuild(setOption(build, category, optionId));
  const added = after.issues.filter((i) => !before.has(issueKey(i)));
  const status = added.some((i) => i.severity === 'error')
    ? 'error'
    : added.some((i) => i.severity === 'warning')
      ? 'warning'
      : 'ok';
  return { status, issues: added };
}

/** Applies a suggestion from an issue to a build. */
export function applySuggestion(build, suggestion) {
  return setOption(build, suggestion.category, suggestion.optionId);
}
