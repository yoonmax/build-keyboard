import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const KEY = 'build.settings.v1';

export const QUALITY_LEVELS = [
  { id: 'auto', name: 'Automatic', note: 'Starts high and steps down if frames run slow.' },
  { id: 'high', name: 'High', note: 'Full resolution, shadows and refinement.' },
  { id: 'medium', name: 'Medium', note: 'Lower resolution, and shorter refinement.' },
  { id: 'low', name: 'Low', note: 'No refinement or live shadows. For older hardware.' },
];

const DEFAULTS = {
  appearance: 'light',
  quality: 'auto',
  backdrop: 'white',
  rig: 'softbox',
  backdropColor: null,
  volume: 0.7,
  muted: false,
  ambient: false,
  variation: true,
  customThemes: [],
};

function load() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw);
    return {
      ...DEFAULTS,
      appearance: data.appearance === 'dark' ? 'dark' : 'light',
      quality: QUALITY_LEVELS.some((q) => q.id === data.quality) ? data.quality : 'auto',
      volume: Number.isFinite(data.volume) ? Math.min(1, Math.max(0, data.volume)) : DEFAULTS.volume,
      muted: Boolean(data.muted),
      ambient: Boolean(data.ambient),
      variation: data.variation !== false,
      customThemes: Array.isArray(data.customThemes) ? data.customThemes.filter(isValidTheme).slice(0, 24) : [],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;
function isValidTheme(t) {
  return (
    t &&
    typeof t.id === 'string' &&
    typeof t.name === 'string' &&
    ['base', 'accent', 'highlight', 'legend', 'legendHighlight'].every((k) => HEX.test(t[k]))
  );
}

function persist(state) {
  try {
    const { appearance, quality, volume, muted, ambient, variation, customThemes } = state;
    globalThis.localStorage?.setItem(
      KEY,
      JSON.stringify({ appearance, quality, volume, muted, ambient, variation, customThemes }),
    );
  } catch {
    // Settings are a convenience. The app works the same if they can't be stored.
  }
}

export const useSettings = create(
  subscribeWithSelector((set, get) => ({
    ...load(),
    /** Resolved render level: never 'auto'. Automatic quality moves this up and down. */
    resolvedQuality: 'high',
    set(patch) {
      set(patch);
      persist(get());
    },
    setAppearance(appearance) {
      // Dark mode moves the studio with it, unless a person has already chosen another one.
      const { backdrop } = get();
      let nextBackdrop = backdrop;
      if (appearance === 'dark' && backdrop === 'white') nextBackdrop = 'dark';
      if (appearance === 'light' && backdrop === 'dark') nextBackdrop = 'white';
      set({ appearance, backdrop: nextBackdrop });
      persist(get());
    },
    addCustomTheme(theme) {
      const customThemes = [...get().customThemes, theme].slice(-24);
      set({ customThemes });
      persist(get());
    },
    removeCustomTheme(id) {
      set({ customThemes: get().customThemes.filter((t) => t.id !== id) });
      persist(get());
    },
  })),
);
