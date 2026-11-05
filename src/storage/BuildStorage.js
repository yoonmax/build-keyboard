import { parseBuild } from '../compatibility/validation.js';
import { cloneBuild } from '../model/build.js';

const STORAGE_KEY = 'build.saved-builds.v1';

/** Thrown when browser storage refuses a save, usually because it is full or blocked. */
export class StorageError extends Error {}

/**
 * Saved builds in localStorage. The storage object can be injected, which lets the tests
 * run without a browser. Each read re-validates, so a build altered in devtools or left
 * over from an older version can't reach the scene unchecked.
 */
export class BuildStorage {
  /** @param {Storage} [storage] */
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  #readAll() {
    let raw;
    try {
      raw = this.storage?.getItem(STORAGE_KEY);
    } catch {
      return [];
    }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  #writeAll(entries) {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      throw new StorageError(
        error?.name === 'QuotaExceededError'
          ? 'Browser storage is full. Delete a saved build and try again.'
          : 'This browser is blocking local storage, so builds cannot be saved here.',
      );
    }
  }

  /** All valid saved builds, newest first. Corrupt entries are skipped. */
  list() {
    const out = [];
    for (const entry of this.#readAll()) {
      const parsed = parseBuild(entry?.build);
      if (!parsed.ok || typeof entry.id !== 'string') continue;
      out.push({
        id: entry.id,
        savedAt: entry.savedAt,
        updatedAt: entry.updatedAt,
        thumbnail: typeof entry.thumbnail === 'string' && entry.thumbnail.startsWith('data:image/') ? entry.thumbnail : null,
        build: parsed.build,
      });
    }
    return out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }

  get(id) {
    return this.list().find((entry) => entry.id === id) ?? null;
  }

  /**
   * Saves a new build, or updates one when `id` is given. If the thumbnail doesn't fit,
   * the build is still saved without it and `thumbnailDropped` is true.
   * @returns {{id:string, thumbnailDropped:boolean}}
   */
  save(build, { id, thumbnail, now = Date.now() } = {}) {
    const entries = this.#readAll();
    const existing = id ? entries.find((e) => e.id === id) : null;
    const entryId = existing?.id ?? id ?? createId(now);
    const entry = {
      id: entryId,
      savedAt: existing?.savedAt ?? now,
      updatedAt: now,
      thumbnail: thumbnail ?? existing?.thumbnail ?? null,
      build: cloneBuild(build),
    };
    const others = entries.filter((e) => e.id !== entryId);
    try {
      this.#writeAll([entry, ...others]);
      return { id: entryId, thumbnailDropped: false };
    } catch (error) {
      if (!entry.thumbnail) throw error;
      this.#writeAll([{ ...entry, thumbnail: null }, ...others]);
      return { id: entryId, thumbnailDropped: true };
    }
  }

  /** Copies a saved build under a new id and a new name. */
  duplicate(id, { now = Date.now() } = {}) {
    const source = this.get(id);
    if (!source) return null;
    const build = cloneBuild(source.build);
    build.name = uniqueCopyName(build.name, this.list().map((e) => e.build.name));
    return this.save(build, { thumbnail: source.thumbnail, now, id: createId(now + 1) });
  }

  rename(id, name, { now = Date.now() } = {}) {
    const source = this.get(id);
    if (!source) return false;
    const build = cloneBuild(source.build);
    build.name = name.trim().slice(0, 60) || build.name;
    this.save(build, { id, thumbnail: source.thumbnail, now });
    return true;
  }

  remove(id) {
    const entries = this.#readAll();
    const remaining = entries.filter((e) => e.id !== id);
    if (remaining.length === entries.length) return false;
    this.#writeAll(remaining);
    return true;
  }
}

function uniqueCopyName(name, taken) {
  const base = `${name} copy`.slice(0, 54);
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base} ${i}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return base;
}

function createId(seed) {
  return `b-${seed.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
