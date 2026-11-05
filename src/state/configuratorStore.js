import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { applySuggestion, validateBuild } from '../compatibility/CompatibilityEngine.js';
import { KEYCAP_THEMES } from '../catalog/index.js';
import { getLayout } from '../layouts/index.js';
import {
  applyTheme,
  cloneBuild,
  createDefaultBuild,
  editKeys,
  resetKeys,
  setOption,
} from '../model/build.js';

const HISTORY_LIMIT = 60;

/**
 * Everything saved with a build lives in `build`; the rest is session state. Each
 * change to `build` goes through a pure function from src/model, so these actions can
 * run in unit tests with no browser. Frame-by-frame values live in configurator/runtime.js.
 */
function commit(set, get, nextBuild) {
  const { build, past } = get();
  if (nextBuild === build) return;
  set({
    build: nextBuild,
    compatibility: validateBuild(nextBuild),
    past: [...past.slice(-(HISTORY_LIMIT - 1)), build],
    future: [],
    unsaved: true,
  });
}

export const initialUi = {
  category: 'layout',
  leftOpen: true,
  rightOpen: true,
  cinematic: false,
  studioOpen: false,
  selection: { kind: 'none' },
  explodeOpen: false,
  testerOpen: false,
  specOpen: false,
  exportOpen: false,
  saveOpen: false,
  switchMacroId: null,
};

export const useConfigurator = create(
  subscribeWithSelector((set, get) => ({
    build: createDefaultBuild(),
    compatibility: validateBuild(createDefaultBuild()),
    past: [],
    future: [],
    /** Id of the saved entry this build came from, or null if it is new. */
    savedId: null,
    unsaved: false,
    ui: { ...initialUi },
    toast: null,

    choose(category, optionId) {
      commit(set, get, setOption(get().build, category, optionId));
    },
    setCaseColor(colorId, customColor) {
      const next = cloneBuild(get().build);
      next.case.colorId = colorId;
      if (customColor) next.case.customColor = customColor;
      commit(set, get, next);
    },
    applySuggestion(suggestion) {
      commit(set, get, applySuggestion(get().build, suggestion));
    },
    applyKeycapTheme(themeId, customThemes = []) {
      const theme = [...KEYCAP_THEMES, ...customThemes].find((t) => t.id === themeId);
      if (theme) commit(set, get, applyTheme(get().build, theme));
    },
    /** Sets a colour of the keycap theme and marks the theme as customised. */
    setKeycapColor(role, hex) {
      const next = cloneBuild(get().build);
      next.keycaps[role] = hex;
      next.keycaps.themeId = 'custom';
      commit(set, get, next);
    },
    setLegendPlacement(placement) {
      const next = cloneBuild(get().build);
      next.keycaps.legendPlacement = placement;
      commit(set, get, next);
    },
    editKeys(keyIds, edit) {
      commit(set, get, editKeys(get().build, keyIds, edit));
    },
    resetKeys(keyIds) {
      commit(set, get, resetKeys(get().build, keyIds));
    },
    setLighting(patch) {
      const next = cloneBuild(get().build);
      Object.assign(next.lighting, patch);
      commit(set, get, next);
    },
    rename(name) {
      const next = cloneBuild(get().build);
      next.name = name.slice(0, 60);
      commit(set, get, next);
    },
    /** Loads a validated build. Undo history starts fresh, as with opening a document. */
    loadBuild(build, savedId = null) {
      set({
        build: cloneBuild(build),
        compatibility: validateBuild(build),
        past: [],
        future: [],
        savedId,
        unsaved: false,
        ui: { ...get().ui, selection: { kind: 'none' } },
      });
    },
    /** Starts a new build from the defaults. */
    resetBuild() {
      get().loadBuild(createDefaultBuild(), null);
      set({ unsaved: false });
    },
    markSaved(savedId) {
      set({ savedId, unsaved: false });
    },
    undo() {
      const { past, future, build } = get();
      if (!past.length) return;
      const previous = past[past.length - 1];
      set({
        build: previous,
        compatibility: validateBuild(previous),
        past: past.slice(0, -1),
        future: [build, ...future],
        unsaved: true,
      });
    },
    redo() {
      const { past, future, build } = get();
      if (!future.length) return;
      const [nextBuild, ...rest] = future;
      set({
        build: nextBuild,
        compatibility: validateBuild(nextBuild),
        past: [...past, build],
        future: rest,
        unsaved: true,
      });
    },

    setUi(patch) {
      set({ ui: { ...get().ui, ...patch } });
    },
    /** Select a part or key. Shift-click adds to or removes from a key selection. */
    selectKey(keyId, additive = false) {
      const { selection } = get().ui;
      let keyIds = [keyId];
      if (additive && selection.kind === 'keys') {
        keyIds = selection.keyIds.includes(keyId)
          ? selection.keyIds.filter((id) => id !== keyId)
          : [...selection.keyIds, keyId];
      }
      get().setUi({
        selection: keyIds.length ? { kind: 'keys', keyIds } : { kind: 'none' },
        rightOpen: true,
      });
    },
    selectKeys(keyIds) {
      get().setUi({ selection: keyIds.length ? { kind: 'keys', keyIds } : { kind: 'none' }, rightOpen: true });
    },
    selectLayer(layerId) {
      get().setUi({ selection: { kind: 'layer', layerId }, rightOpen: true });
    },
    clearSelection() {
      get().setUi({ selection: { kind: 'none' } });
    },
    showToast(message, tone = 'neutral') {
      const id = Date.now();
      set({ toast: { id, message, tone } });
      setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, 4200);
    },
    dismissToast() {
      set({ toast: null });
    },
  })),
);

/** The current layout object. */
export const useLayout = () => useConfigurator((s) => getLayout(s.build.layoutId));
