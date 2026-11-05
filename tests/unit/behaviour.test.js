import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATE_ACOUSTICS, renderKeySound, renderRoomTone, soundProfile, spectralCentroid } from '../../src/audio/synth.js';
import { CASES, CATALOG, FINISHES, SWITCHES } from '../../src/catalog/index.js';
import { STARTER_BUILDS } from '../../src/catalog/starters.js';
import { validateBuild } from '../../src/compatibility/CompatibilityEngine.js';
import { parseBuild } from '../../src/compatibility/validation.js';
import {
  CAMERA_VIEWS,
  clampTarget,
  fitDistance,
  orbitFromPosition,
  orbitPosition,
  resolveCameraCollision,
  shortestAzimuth,
} from '../../src/configurator/cameraMath.js';
import { EXPORT_SIZES, MAX_EXPORT_EDGE, exportSizeProblem } from '../../src/export/ImageExporter.js';
import { initialQuality } from '../../src/app/quality.js';
import { getLayout } from '../../src/layouts/index.js';
import { BACKDROPS, LIGHT_RIGS, inverseNeutral, neutralToneMap } from '../../src/materials/LightingPresets.js';
import { caseSurface, plateSurface } from '../../src/materials/MaterialLibrary.js';
import { EXPLODE_LAYERS } from '../../src/model/assembly.js';
import { createDefaultBuild, setOption } from '../../src/model/build.js';
import { inspectorContent } from '../../src/model/inspector.js';
import { useConfigurator } from '../../src/state/configuratorStore.js';

const sw = (id) => SWITCHES.find((s) => s.id === id);
const profileFor = (id, overrides = {}) =>
  soundProfile({ sw: sw(id), plateId: 'plate-fr4', caseId: 'case-anodized', foam: true, ...overrides });

describe('sound synthesis', () => {
  it('produces audible, unclipped audio for every switch and stroke', () => {
    for (const s of SWITCHES) {
      for (const stroke of ['down', 'up']) {
        const samples = renderKeySound(profileFor(s.id), { stroke });
        const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        expect(peak, `${s.id} ${stroke}`).toBeGreaterThan(0.1);
        expect(peak, `${s.id} ${stroke}`).toBeLessThanOrEqual(1);
        expect(samples.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('makes clicky switches clearly brighter than linear ones', () => {
    const linear = spectralCentroid(renderKeySound(profileFor('sw-drift')));
    const clicky = spectralCentroid(renderKeySound(profileFor('sw-tick')));
    expect(clicky).toBeGreaterThan(linear * 1.25);
  });

  it('gives tactile switches a sound before the bottom-out', () => {
    const onset = (samples) => samples.findIndex((v) => Math.abs(v) > 0.02);
    const peakAt = (samples) => {
      let best = 0;
      for (let i = 0; i < samples.length; i += 1) if (Math.abs(samples[i]) > Math.abs(samples[best])) best = i;
      return best;
    };
    const tactile = renderKeySound(profileFor('sw-ridge'));
    const linear = renderKeySound(profileFor('sw-drift'));
    expect(peakAt(tactile) - onset(tactile)).toBeGreaterThan(peakAt(linear) - onset(linear) + 200);
  });

  it('makes polycarbonate plates darker than aluminum ones', () => {
    const aluminum = spectralCentroid(renderKeySound(profileFor('sw-drift', { plateId: 'plate-aluminum' })));
    const pc = spectralCentroid(renderKeySound(profileFor('sw-drift', { plateId: 'plate-polycarbonate' })));
    expect(pc).toBeLessThan(aluminum * 0.92);
    expect(Object.keys(PLATE_ACOUSTICS).length).toBe(CATALOG.plate.size);
  });

  it('shortens the ring when foam is added', () => {
    const energyAfter = (samples, start) => samples.slice(start).reduce((s, v) => s + v * v, 0);
    const hollow = renderKeySound(profileFor('sw-drift', { foam: false }));
    const damped = renderKeySound(profileFor('sw-drift', { foam: true }));
    expect(energyAfter(damped, 2000)).toBeLessThan(energyAfter(hollow, 2000));
  });

  it('makes the return stroke quieter', () => {
    const peak = (samples) => samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak(renderKeySound(profileFor('sw-drift'), { stroke: 'up' }))).toBeLessThan(peak(renderKeySound(profileFor('sw-drift'))));
  });

  it('varies from press to press, and is repeatable', () => {
    const a = renderKeySound(profileFor('sw-drift'), { variation: 0 });
    const b = renderKeySound(profileFor('sw-drift'), { variation: 1 });
    const c = renderKeySound(profileFor('sw-drift'), { variation: 0 });
    expect(a).toEqual(c);
    expect(a).not.toEqual(b);
  });

  it('lowers the spacebar', () => {
    const one = spectralCentroid(renderKeySound(profileFor('sw-drift'), { width: 1 }));
    const space = spectralCentroid(renderKeySound(profileFor('sw-drift'), { width: 6.25 }));
    expect(space).toBeLessThan(one);
  });

  it('makes a room tone with no silence or spikes', () => {
    const tone = renderRoomTone(8000, 2);
    expect(tone.length).toBeGreaterThan(8000);
    expect(tone.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThanOrEqual(1.5);
  });
});

describe('camera', () => {
  it('converts orbit angles to a position and back', () => {
    const target = [10, 20, 30];
    const position = orbitPosition(target, 40, 25, 900);
    const back = orbitFromPosition(position, target);
    expect(back.azimuth).toBeCloseTo(40);
    expect(back.elevation).toBeCloseTo(25);
    expect(back.distance).toBeCloseTo(900);
  });

  it('turns the short way round', () => {
    expect(shortestAzimuth(170, -170)).toBe(190);
    expect(shortestAzimuth(-170, 170)).toBe(-190);
    expect(shortestAzimuth(10, 30)).toBe(30);
  });

  it('moves further back for a wider product and when panels narrow the view', () => {
    const view = CAMERA_VIEWS.hero;
    const small = fitDistance({ w: 300, d: 130, h: 36 }, view, { aspect: 1.6 });
    const large = fitDistance({ w: 380, d: 150, h: 36 }, view, { aspect: 1.6 });
    const squeezed = fitDistance({ w: 300, d: 130, h: 36 }, view, { aspect: 1.6, widthFraction: 0.5 });
    expect(large).toBeGreaterThan(small);
    expect(squeezed).toBeGreaterThan(small);
  });

  it('frames a phone portrait viewport without cropping the width', () => {
    const fit = fitDistance({ w: 340, d: 150, h: 36 }, CAMERA_VIEWS.top, { aspect: 0.5 });
    const halfWidthVisible = fit * Math.tan((12 * Math.PI) / 180) * 0.5;
    expect(halfWidthVisible * 2).toBeGreaterThan(340);
  });

  it('pushes the camera out of the keyboard', () => {
    const box = { min: [-150, 0, -70], max: [150, 30, 70] };
    const inside = resolveCameraCollision([10, 15, 5], box);
    expect(inside.moved).toBe(true);
    const [x, y, z] = inside.position;
    const stillInside = x > -150 && x < 150 && y > 0 && y < 30 && z > -70 && z < 70;
    expect(stillInside).toBe(false);
  });

  it('leaves a clear camera alone', () => {
    const box = { min: [-150, 0, -70], max: [150, 30, 70] };
    expect(resolveCameraCollision([0, 500, 900], box).moved).toBe(false);
  });

  it('keeps the camera above the floor', () => {
    const box = { min: [-150, 0, -70], max: [150, 30, 70] };
    expect(resolveCameraCollision([800, -40, 800], box).position[1]).toBeGreaterThan(0);
  });

  it('limits panning near the product', () => {
    const box = { min: [-150, 0, -70], max: [150, 30, 70] };
    expect(clampTarget([9000, 9000, -9000], box)).toEqual([190, 70, -110]);
  });
});

describe('material data', () => {
  it('gives each case material physically different values', () => {
    const base = { colorId: 'navy', customColor: '#000000', finish: 'satin', mount: 'gasket' };
    const anodized = caseSurface({ ...base, id: 'case-anodized' });
    const painted = caseSurface({ ...base, id: 'case-painted' });
    const poly = caseSurface({ ...base, id: 'case-polycarbonate' });
    const frosted = caseSurface({ ...base, id: 'case-frosted', finish: 'matte' });
    expect(anodized.metalness).toBe(1);
    expect(painted.metalness).toBe(0);
    expect(poly.ior).toBeGreaterThan(painted.ior);
    expect(frosted.transmission).toBeGreaterThan(0.5);
    expect(anodized.transmission).toBe(0);
  });

  it('maps finishes onto surface response', () => {
    const at = (finish, id = 'case-anodized') => caseSurface({ id, colorId: 'silver', customColor: '#000000', finish, mount: 'gasket' });
    expect(at('matte').roughness).toBeGreaterThan(at('satin').roughness);
    expect(at('brushed').anisotropy).toBeGreaterThan(0);
    expect(at('satin').anisotropy).toBe(0);
    expect(at('gloss', 'case-painted').clearcoat).toBe(1);
    expect(at('gloss', 'case-painted').roughness).toBeLessThan(at('satin', 'case-painted').roughness);
  });

  it('covers every finish and case in the catalog', () => {
    for (const item of CASES) for (const finish of item.finishes) expect(FINISHES[finish]).toBeDefined();
  });

  it('gives each plate its own look', () => {
    expect(plateSurface('plate-aluminum').metalness).toBe(1);
    expect(plateSurface('plate-polycarbonate').metalness).toBe(0);
    expect(plateSurface('plate-fr4').grain).toBe('weave');
  });

  it('compensates backdrops, so they appear in exactly their specified colour', () => {
    for (const target of [[0.89, 0.87, 0.84], [0.024, 0.025, 0.028], [0.2, 0.21, 0.19], [0.77, 0.76, 0.72]]) {
      const shown = neutralToneMap(inverseNeutral(target));
      shown.forEach((value, i) => expect(Math.abs(value - target[i])).toBeLessThan(0.012));
    }
  });

  it('defines at least the required studios', () => {
    for (const id of ['white', 'dark', 'warm', 'gradient', 'desk']) expect(BACKDROPS.some((b) => b.id === id)).toBe(true);
    expect(LIGHT_RIGS.length).toBeGreaterThanOrEqual(3);
  });
});

describe('inspector content', () => {
  const build = createDefaultBuild();
  const compat = validateBuild(build);

  it('gives each kind of part its own details', () => {
    const titles = new Map();
    for (const layer of EXPLODE_LAYERS) {
      const content = inspectorContent({ kind: 'layer', layerId: layer.id }, build, compat);
      expect(content, layer.id).not.toBeNull();
      titles.set(layer.id, content.rows.map((r) => r[0]).join());
    }
    expect(titles.get('plate')).toContain('Switch cutouts');
    expect(titles.get('pcb')).toContain('Switch positions');
    expect(titles.get('switches')).toContain('Actuation force');
    expect(titles.get('stabilizers')).toContain('Needed by layout');
    expect(titles.get('upperCase')).not.toBe(titles.get('plate'));
  });

  it('describes a single key with its own size', () => {
    const content = inspectorContent({ kind: 'keys', keyIds: ['ShiftLeft'] }, build, compat);
    expect(content.title).toBe('Shift keycap');
    expect(content.subtitle).toContain('2.25u');
  });

  it('summarises several keys', () => {
    const content = inspectorContent({ kind: 'keys', keyIds: ['KeyA', 'KeyS', 'Enter'] }, build, compat);
    expect(content.title).toBe('3 keycaps');
  });

  it('labels switch figures as representative', () => {
    const content = inspectorContent({ kind: 'layer', layerId: 'switches' }, build, compat);
    expect(content.notes).toMatch(/representative/i);
  });

  it('shows only the issues that involve a part', () => {
    const bad = setOption(createDefaultBuild(), 'pcb', 'pcb-hotswap-3');
    const result = validateBuild(bad);
    const pcb = inspectorContent({ kind: 'layer', layerId: 'pcb' }, bad, result);
    const plate = inspectorContent({ kind: 'layer', layerId: 'plate' }, bad, result);
    expect(pcb.issues.length).toBeGreaterThan(0);
    expect(plate.issues.length).toBe(0);
  });

  it('returns nothing when nothing is selected', () => {
    expect(inspectorContent({ kind: 'none' }, build, compat)).toBeNull();
  });
});

describe('configurator store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useConfigurator.getState().resetBuild();
  });

  const state = () => useConfigurator.getState();

  it('re-validates with every change', () => {
    state().choose('layout', 'tkl');
    state().choose('case', 'case-polycarbonate');
    expect(state().compatibility.status).toBe('error');
    expect(state().unsaved).toBe(true);
    state().applySuggestion(state().compatibility.errors[0].suggestions[0]);
    expect(state().compatibility.errors.some((e) => e.ruleId === 'case-layout')).toBe(false);
  });

  it('undoes and redoes', () => {
    state().choose('layout', '60');
    state().choose('layout', '65');
    state().undo();
    expect(state().build.layoutId).toBe('60');
    state().undo();
    expect(state().build.layoutId).toBe('75');
    state().redo();
    expect(state().build.layoutId).toBe('60');
    state().choose('layout', 'tkl');
    expect(state().future).toEqual([]);
  });

  it('marks a custom colour edit as a custom theme', () => {
    state().setKeycapColor('base', '#123456');
    expect(state().build.keycaps.themeId).toBe('custom');
    expect(state().build.keycaps.base).toBe('#123456');
  });

  it('edits and resets single keys, then whole themes', () => {
    state().editKeys(['KeyA'], { color: '#112233' });
    expect(state().build.keycaps.overrides.KeyA.color).toBe('#112233');
    state().resetKeys(['KeyA']);
    expect(state().build.keycaps.overrides.KeyA).toBeUndefined();
    state().editKeys(['KeyA'], { color: '#112233' });
    state().applyKeycapTheme('ice');
    expect(state().build.keycaps.overrides).toEqual({});
    expect(state().build.keycaps.themeId).toBe('ice');
  });

  it('adds and removes keys from a selection with shift', () => {
    state().selectKey('KeyA');
    state().selectKey('KeyS', true);
    expect(state().ui.selection.keyIds).toEqual(['KeyA', 'KeyS']);
    state().selectKey('KeyA', true);
    expect(state().ui.selection.keyIds).toEqual(['KeyS']);
    state().selectKey('KeyD');
    expect(state().ui.selection.keyIds).toEqual(['KeyD']);
    state().selectKey('KeyD', true);
    expect(state().ui.selection.kind).toBe('none');
  });

  it('resets to a clean state', () => {
    state().choose('layout', '60');
    state().resetBuild();
    expect(state().build).toEqual(createDefaultBuild());
    expect(state().unsaved).toBe(false);
    expect(state().past).toEqual([]);
  });

  it('loads a build without keeping undo history', () => {
    const other = setOption(createDefaultBuild(), 'layout', 'tkl');
    state().choose('layout', '60');
    state().loadBuild(other, 'saved-1');
    expect(state().build.layoutId).toBe('tkl');
    expect(state().savedId).toBe('saved-1');
    expect(state().past).toEqual([]);
    expect(state().unsaved).toBe(false);
  });

  it('shows and clears notices', () => {
    state().showToast('Hello');
    expect(state().toast.message).toBe('Hello');
    vi.advanceTimersByTime(5000);
    expect(state().toast).toBeNull();
  });
});

describe('export limits', () => {
  it('accepts the offered sizes', () => {
    for (const size of EXPORT_SIZES) expect(exportSizeProblem(size.width, size.height)).toBeNull();
  });

  it('explains unusable sizes', () => {
    expect(exportSizeProblem(10, 10)).toMatch(/at least 64/);
    expect(exportSizeProblem(MAX_EXPORT_EDGE + 1, 100)).toMatch(/at most/);
    expect(exportSizeProblem(NaN, 100)).toMatch(/Enter/);
    expect(exportSizeProblem(5000, 100, 4096)).toMatch(/4096/);
  });
});

describe('quality', () => {
  it('starts lower on phones and small machines', () => {
    expect(initialQuality({ coarsePointer: true, cores: 8 })).toBe('medium');
    expect(initialQuality({ coarsePointer: false, cores: 4 })).toBe('medium');
    expect(initialQuality({ coarsePointer: false, cores: 10, deviceMemory: 16 })).toBe('high');
  });
});

describe('starter builds', () => {
  it('are all valid and have a layout-specific picture', () => {
    expect(STARTER_BUILDS.length).toBeGreaterThanOrEqual(4);
    for (const starter of STARTER_BUILDS) {
      expect(parseBuild(starter.build).ok, starter.id).toBe(true);
      expect(validateBuild(starter.build).valid, starter.id).toBe(true);
      expect(starter.image).toMatch(/^\/starters\//);
      expect(getLayout(starter.build.layoutId)).toBeTruthy();
    }
  });
});
