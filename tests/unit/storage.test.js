import { beforeEach, describe, expect, it } from 'vitest';
import { parseBuild, migrateBuild } from '../../src/compatibility/validation.js';
import {
  MAX_IMPORT_BYTES,
  buildSpecification,
  colorwayName,
  deserializeBuild,
  fileNameFor,
  serializeBuild,
  specificationText,
} from '../../src/export/ConfigurationExporter.js';
import { SCHEMA_VERSION, createDefaultBuild, editKeys, setOption } from '../../src/model/build.js';
import { BuildStorage, StorageError } from '../../src/storage/BuildStorage.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
    data,
  };
}

describe('parseBuild', () => {
  it('accepts a valid build unchanged', () => {
    const build = createDefaultBuild();
    const result = parseBuild(build);
    expect(result.ok).toBe(true);
    expect(result.build).toEqual(build);
    expect(result.warnings).toEqual([]);
  });

  it.each([null, 'text', 42, [], {}, { schemaVersion: 'x' }])('rejects %j', (value) => {
    expect(parseBuild(value).ok).toBe(false);
  });

  it('rejects a build from a newer schema', () => {
    const result = parseBuild({ ...createDefaultBuild(), schemaVersion: SCHEMA_VERSION + 1 });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('newer');
  });

  it('rejects unknown catalog ids with a reason', () => {
    const result = parseBuild({ ...createDefaultBuild(), switchId: 'sw-fake' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('sw-fake');
    expect(parseBuild({ ...createDefaultBuild(), layoutId: 'numpad' }).ok).toBe(false);
  });

  it('strips unknown properties, so foreign data never reaches the scene', () => {
    const build = createDefaultBuild();
    const result = parseBuild({
      ...build,
      __proto__: { polluted: true },
      evil: '<script>',
      case: { ...build.case, extra: 1 },
    });
    expect(result.ok).toBe(true);
    expect(result.build.evil).toBeUndefined();
    expect(result.build.case.extra).toBeUndefined();
    expect(result.build.polluted).toBeUndefined();
  });

  it('replaces invalid colours and warns', () => {
    const build = createDefaultBuild();
    build.keycaps.base = 'url(javascript:alert(1))';
    const result = parseBuild(build);
    expect(result.ok).toBe(true);
    expect(result.build.keycaps.base).toMatch(/^#[0-9A-F]{6}$/i);
    expect(result.warnings.length).toBe(1);
  });

  it('drops edits for keys that do not exist', () => {
    const build = createDefaultBuild();
    build.keycaps.overrides = { Nope: { color: '#000000' }, KeyA: { color: '#123456', junk: true } };
    const result = parseBuild(build);
    expect(result.build.keycaps.overrides).toEqual({ KeyA: { color: '#123456' } });
    expect(result.warnings[0]).toContain('Nope');
  });

  it('limits the build name', () => {
    const result = parseBuild({ ...createDefaultBuild(), name: 'x'.repeat(500) });
    expect(result.build.name.length).toBe(60);
  });

  it('clamps out-of-range brightness', () => {
    const build = createDefaultBuild();
    build.lighting.brightness = 900;
    expect(parseBuild(build).build.lighting.brightness).toBe(1);
  });

  it('allows an incompatible build through, because that is a separate check', () => {
    const build = setOption(setOption(createDefaultBuild(), 'layout', 'tkl'), 'case', 'case-frosted');
    expect(parseBuild(build).ok).toBe(true);
  });
});

describe('schema migration', () => {
  it('upgrades a version 1 build', () => {
    const old = createDefaultBuild();
    old.schemaVersion = 1;
    delete old.keycaps.legendPlacement;
    old.keycaps.keycapColor = '#ABCDEF';
    delete old.keycaps.base;
    const result = parseBuild(old);
    expect(result.ok).toBe(true);
    expect(result.build.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.build.keycaps.base).toBe('#ABCDEF');
    expect(result.build.keycaps.legendPlacement).toBe('corner');
  });

  it('fails with a clear message when no migration exists', () => {
    expect(() => migrateBuild({ schemaVersion: 0 })).toThrow(/No migration/);
  });
});

describe('import and export', () => {
  it('round-trips a build exactly', () => {
    const build = editKeys(setOption(createDefaultBuild(), 'layout', 'tkl'), ['KeyA'], { color: '#112233', material: 'abs' });
    const result = deserializeBuild(serializeBuild(build));
    expect(result.ok).toBe(true);
    expect(result.build).toEqual(build);
  });

  it('accepts a bare build object', () => {
    expect(deserializeBuild(JSON.stringify(createDefaultBuild())).ok).toBe(true);
  });

  it('rejects invalid JSON, other files and oversized files', () => {
    expect(deserializeBuild('{nope').errors[0]).toContain('not valid JSON');
    expect(deserializeBuild(JSON.stringify({ format: 'other', build: {} })).errors[0]).toContain('not a BUILD');
    expect(deserializeBuild('x'.repeat(MAX_IMPORT_BYTES + 1)).errors[0]).toContain('too large');
  });

  it('writes a schema version and format', () => {
    const data = JSON.parse(serializeBuild(createDefaultBuild()));
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.format).toBe('build-keyboard-configuration');
  });

  it('makes safe filenames', () => {
    expect(fileNameFor('My Build / No. 1!', 'json')).toBe('my-build-no-1.json');
    expect(fileNameFor('???', 'png')).toBe('build.png');
  });
});

describe('specification', () => {
  it('includes everything the spec sheet needs', () => {
    const text = specificationText(createDefaultBuild());
    for (const label of [
      'Layout',
      'Case material',
      'Case finish',
      'Keycap profile',
      'Keycap colours',
      'Switch type',
      'Plate material',
      'Stabilizer configuration',
      'Compatibility status',
      'Estimated total cost',
    ]) {
      expect(text).toContain(label);
    }
  });

  it('shows the problem in the sheet for an invalid build', () => {
    const build = setOption(setOption(createDefaultBuild(), 'layout', 'tkl'), 'case', 'case-polycarbonate');
    const spec = buildSpecification(build);
    const status = spec.sections.flatMap((s) => s.rows).find(([l]) => l === 'Compatibility status')[1];
    expect(status).toContain('Not buildable');
    expect(specificationText(build)).toContain('Error:');
  });

  it('names the colourway and counts edits', () => {
    const build = editKeys(createDefaultBuild(), ['KeyA'], { color: '#112233' });
    expect(colorwayName(build.keycaps)).toBe('Monochrome, 1 custom key');
  });
});

describe('BuildStorage', () => {
  let storage;
  let store;
  beforeEach(() => {
    storage = memoryStorage();
    store = new BuildStorage(storage);
  });

  it('saves and loads a build identically', () => {
    const build = editKeys(createDefaultBuild(), ['KeyA'], { color: '#112233' });
    const { id } = store.save(build, { thumbnail: 'data:image/webp;base64,AAAA' });
    const loaded = store.get(id);
    expect(loaded.build).toEqual(build);
    expect(loaded.thumbnail).toBe('data:image/webp;base64,AAAA');
  });

  it('updates in place and keeps the original save date', () => {
    const { id } = store.save(createDefaultBuild(), { now: 100 });
    store.save({ ...createDefaultBuild(), name: 'Renamed' }, { id, now: 200 });
    expect(store.list().length).toBe(1);
    expect(store.get(id).build.name).toBe('Renamed');
    expect(store.get(id).savedAt).toBe(100);
    expect(store.get(id).updatedAt).toBe(200);
  });

  it('lists newest first', () => {
    store.save({ ...createDefaultBuild(), name: 'Old' }, { now: 1 });
    store.save({ ...createDefaultBuild(), name: 'New' }, { now: 2 });
    expect(store.list().map((e) => e.build.name)).toEqual(['New', 'Old']);
  });

  it('duplicates under a new name and id', () => {
    const { id } = store.save({ ...createDefaultBuild(), name: 'Mine' }, { now: 1 });
    const copy = store.duplicate(id, { now: 2 });
    expect(copy.id).not.toBe(id);
    expect(store.get(copy.id).build.name).toBe('Mine copy');
    const second = store.duplicate(id, { now: 3 });
    expect(store.get(second.id).build.name).toBe('Mine copy 2');
  });

  it('renames', () => {
    const { id } = store.save(createDefaultBuild());
    expect(store.rename(id, '  Fresh  ')).toBe(true);
    expect(store.get(id).build.name).toBe('Fresh');
  });

  it('deletes', () => {
    const { id } = store.save(createDefaultBuild());
    expect(store.remove(id)).toBe(true);
    expect(store.remove(id)).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('survives corrupt storage', () => {
    storage.setItem('build.saved-builds.v1', '{broken');
    expect(store.list()).toEqual([]);
    storage.setItem('build.saved-builds.v1', JSON.stringify([{ id: 'a', build: { schemaVersion: 99 } }, 'junk']));
    expect(store.list()).toEqual([]);
  });

  it('refuses non-image thumbnails on read', () => {
    const { id } = store.save(createDefaultBuild(), { thumbnail: 'javascript:alert(1)' });
    expect(store.get(id).thumbnail).toBeNull();
  });

  it('keeps the build when only the thumbnail does not fit', () => {
    let writes = 0;
    const limited = {
      ...memoryStorage(),
      setItem(k, v) {
        writes += 1;
        if (v.includes('data:image')) {
          const err = new Error('full');
          err.name = 'QuotaExceededError';
          throw err;
        }
        this.value = v;
      },
      getItem() {
        return this.value ?? null;
      },
    };
    const s = new BuildStorage(limited);
    const result = s.save(createDefaultBuild(), { thumbnail: 'data:image/webp;base64,AA' });
    expect(result.thumbnailDropped).toBe(true);
    expect(writes).toBe(2);
    expect(s.list().length).toBe(1);
  });

  it('explains why a save failed', () => {
    const broken = {
      getItem: () => null,
      setItem() {
        const err = new Error('full');
        err.name = 'QuotaExceededError';
        throw err;
      },
    };
    expect(() => new BuildStorage(broken).save(createDefaultBuild())).toThrow(StorageError);
  });
});
