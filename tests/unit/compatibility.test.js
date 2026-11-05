import { describe, expect, it } from 'vitest';
import { CATALOG, KEYCAP_SETS } from '../../src/catalog/index.js';
import { applySuggestion, evaluateOption, validateBuild } from '../../src/compatibility/CompatibilityEngine.js';
import { RULES, keycapShortfall } from '../../src/compatibility/rules.js';
import { getLayout } from '../../src/layouts/index.js';
import { createDefaultBuild, editKeys, setOption } from '../../src/model/build.js';

const base = () => createDefaultBuild();
const ruleIds = (result) => result.issues.map((i) => i.ruleId);
const pick = (build, ...steps) => steps.reduce((b, [cat, id]) => setOption(b, cat, id), build);

describe('compatibility engine', () => {
  it('accepts the default build with no issues', () => {
    const result = validateBuild(base());
    expect(result.status).toBe('valid');
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(RULES.length);
  });

  it('rejects a polycarbonate TKL case, with alternatives', () => {
    const result = validateBuild(pick(base(), ['layout', 'tkl'], ['case', 'case-polycarbonate']));
    expect(result.status).toBe('error');
    const issue = result.errors.find((e) => e.ruleId === 'case-layout');
    expect(issue.message).toContain('TKL');
    expect(issue.suggestions.map((s) => s.optionId)).toContain('case-anodized');
    expect(issue.suggestions.some((s) => s.category === 'layout')).toBe(true);
  });

  it('rejects a PCB with no version for the layout', () => {
    const result = validateBuild(pick(base(), ['layout', 'tkl'], ['pcb', 'pcb-hotswap-3'], ['stabilizer', 'stab-snap']));
    expect(ruleIds(result)).toContain('pcb-layout');
  });

  it('counts caps to find coverage gaps', () => {
    const compact = KEYCAP_SETS.find((s) => s.id === 'caps-spherical');
    expect(keycapShortfall(compact, getLayout('60'))).toEqual([]);
    const missing = keycapShortfall(compact, getLayout('tkl'));
    expect(missing.some((m) => m.size === 1)).toBe(true);
    const result = validateBuild(pick(base(), ['layout', 'tkl'], ['keycaps', 'caps-spherical']));
    expect(ruleIds(result)).toContain('keycap-coverage');
  });

  it('warns about 5-pin switches on a 3-pin PCB', () => {
    const result = validateBuild(pick(base(), ['pcb', 'pcb-hotswap-3'], ['stabilizer', 'stab-snap']));
    expect(result.status).toBe('warning');
    expect(ruleIds(result)).toEqual(['switch-pins']);
    expect(result.warnings[0].suggestions.length).toBeGreaterThan(0);
  });

  it('errors when stabilizers do not fit the PCB', () => {
    const result = validateBuild(pick(base(), ['pcb', 'pcb-hotswap-3']));
    expect(ruleIds(result)).toContain('stabilizer-mount');
  });

  it('counts stabilizers against the kit', () => {
    const compact = ['stabilizer', 'stab-screw-compact'];
    expect(ruleIds(validateBuild(pick(base(), compact)))).not.toContain('stabilizer-coverage');
    expect(ruleIds(validateBuild(pick(base(), compact, ['layout', 'tkl'])))).toContain('stabilizer-coverage');
    expect(ruleIds(validateBuild(pick(base(), compact, ['layout', '60'])))).toContain('stabilizer-coverage');
  });

  it('errors on a mount the plate cannot do', () => {
    const result = validateBuild(
      pick(base(), ['case', 'case-polycarbonate'], ['mount', 'tray'], ['plate', 'plate-polycarbonate']),
    );
    expect(ruleIds(result)).toContain('plate-mount');
  });

  it('errors on a mount the case has no fixings for', () => {
    const result = validateBuild(pick(base(), ['mount', 'tray']));
    expect(ruleIds(result)).toContain('case-mount');
  });

  it('errors when the PCB has no lighting circuit', () => {
    const result = validateBuild(pick(base(), ['pcb', 'pcb-solder'], ['lighting', 'per-key']));
    expect(ruleIds(result)).toContain('lighting-pcb');
  });

  it('warns that underglow is blocked by an opaque case but not a translucent one', () => {
    expect(ruleIds(validateBuild(pick(base(), ['lighting', 'underglow'])))).toContain('underglow-case');
    expect(ruleIds(validateBuild(pick(base(), ['lighting', 'underglow'], ['case', 'case-frosted'])))).not.toContain(
      'underglow-case',
    );
  });

  it('warns that per-key lighting is dim through opaque housings', () => {
    expect(ruleIds(validateBuild(pick(base(), ['lighting', 'per-key'], ['switch', 'sw-keel'])))).toContain(
      'per-key-housing',
    );
    expect(ruleIds(validateBuild(pick(base(), ['lighting', 'per-key'])))).not.toContain('per-key-housing');
  });

  it('warns that anodizing has no true white', () => {
    expect(ruleIds(validateBuild(pick(base(), ['caseColor', 'white'])))).toContain('anodized-white');
    expect(ruleIds(validateBuild(pick(base(), ['case', 'case-painted'], ['caseColor', 'white'])))).not.toContain(
      'anodized-white',
    );
  });

  it('warns about soldering on a solder PCB', () => {
    expect(ruleIds(validateBuild(pick(base(), ['pcb', 'pcb-solder'])))).toContain('solder-required');
  });

  it('warns about plate-mount stabilizers on a flexible plate', () => {
    expect(
      ruleIds(validateBuild(pick(base(), ['plate', 'plate-polycarbonate'], ['stabilizer', 'stab-plate']))),
    ).toContain('plate-stabilizer-flex');
  });

  it('warns when metal keycaps meet a light spring', () => {
    const build = editKeys(base(), ['KeyA'], { material: 'aluminum' });
    expect(ruleIds(validateBuild(build))).toContain('metal-cap-spring');
    expect(ruleIds(validateBuild(setOption(build, 'switch', 'sw-keel')))).not.toContain('metal-cap-spring');
  });

  it('errors when an accessory is not made for the layout', () => {
    const result = validateBuild(pick(base(), ['accessory', 'acc-wrist'], ['layout', '60']));
    expect(ruleIds(result)).toContain('accessory-layout');
    const removal = result.errors[0].suggestions.find((s) => s.category === 'removeAccessory');
    expect(removal.optionId).toBe('acc-wrist');
  });

  it('reports unknown components without crashing', () => {
    const build = base();
    build.pcbId = 'nope';
    const result = validateBuild(build);
    expect(result.status).toBe('error');
    expect(result.errors[0].ruleId).toBe('unknown-component');
  });

  it('accepts custom rules, so it can be extended', () => {
    const rule = {
      id: 'always',
      title: 'Always',
      check: () => [{ ruleId: 'always', severity: 'warning', message: 'x', components: [], suggestions: [] }],
    };
    expect(validateBuild(base(), [rule]).status).toBe('warning');
  });

  it('every suggestion in every failing combination resolves to a real option', () => {
    const builds = [
      pick(base(), ['layout', 'tkl'], ['case', 'case-frosted'], ['keycaps', 'caps-spherical'], ['pcb', 'pcb-hotswap-3']),
      pick(base(), ['lighting', 'per-key'], ['pcb', 'pcb-solder'], ['switch', 'sw-keel']),
    ];
    for (const build of builds) {
      for (const issue of validateBuild(build).issues) {
        for (const suggestion of issue.suggestions) {
          expect(() => applySuggestion(build, suggestion)).not.toThrow();
        }
      }
    }
  });

  it('applying a suggestion clears that issue', () => {
    const build = pick(base(), ['layout', 'tkl'], ['case', 'case-polycarbonate']);
    const issue = validateBuild(build).errors.find((e) => e.ruleId === 'case-layout');
    const fixed = applySuggestion(build, issue.suggestions[0]);
    expect(ruleIds(validateBuild(fixed))).not.toContain('case-layout');
  });
});

describe('guided filtering', () => {
  it('marks an option that would add an error', () => {
    const build = setOption(base(), 'layout', 'tkl');
    const preview = evaluateOption(build, 'case', 'case-polycarbonate');
    expect(preview.status).toBe('error');
    expect(preview.issues[0].ruleId).toBe('case-layout');
    expect(evaluateOption(build, 'case', 'case-painted').status).toBe('ok');
  });

  it('marks an option that would add a warning', () => {
    expect(evaluateOption(base(), 'caseColor', 'white').status).toBe('warning');
  });

  it('does not repeat problems that already exist', () => {
    const build = pick(base(), ['pcb', 'pcb-solder']);
    const preview = evaluateOption(build, 'plate', 'plate-fr4');
    expect(preview.status).toBe('ok');
  });

  it('evaluates layouts against the current parts', () => {
    const build = setOption(base(), 'case', 'case-polycarbonate');
    expect(evaluateOption(build, 'layout', 'tkl').status).toBe('error');
    expect(evaluateOption(build, 'layout', '65').status).toBe('ok');
  });
});

describe('catalog data', () => {
  it('gives every catalog item the required fields', () => {
    for (const [category, items] of Object.entries(CATALOG)) {
      for (const item of items.values()) {
        expect(item.id).toBeTruthy();
        expect(item.name).toBeTruthy();
        expect(item.category).toBe(category);
        expect(item.price).toBeDefined();
      }
    }
  });

  it('has a price wherever an item claims to support a layout', () => {
    for (const map of [CATALOG.case, CATALOG.pcb, CATALOG.plate, CATALOG.accessory]) {
      for (const item of map.values()) {
        for (const layoutId of item.layouts) {
          if (typeof item.price !== 'number') expect(item.price[layoutId], `${item.id} on ${layoutId}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
