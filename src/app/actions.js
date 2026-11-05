import { CAMERA_VIEWS } from '../configurator/cameraMath.js';
import { explodedView } from '../configurator/ExplodedView.js';
import { runtime } from '../configurator/runtime.js';
import { renderThumbnail } from '../export/ImageExporter.js';
import { keyFocusPoint, layerFocusPoint } from '../configurator/SelectionManager.jsx';
import { getLayout } from '../layouts/index.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { BuildStorage, StorageError } from '../storage/BuildStorage.js';

export const buildStorage = new BuildStorage();

/** Fires when saved builds change so that the gallery refreshes. */
export const storageEvents = new EventTarget();

/** Parts that sit inside the assembled keyboard and can't be seen until it's opened. */
const INTERNAL_LAYERS = new Set(['switches', 'stabilizers', 'plate', 'plateFoam', 'pcb', 'caseFoam']);

export function explode() {
  explodedView.explode();
  runtime.camera?.frameExploded();
}

export function assemble() {
  useConfigurator.getState().clearSelection();
  explodedView.assemble();
  runtime.camera?.goTo('hero', { duration: 1.6 });
}

/** Selects a part, opens the board if it's hidden inside, and moves the camera to it. */
export function inspectLayer(layerId) {
  const store = useConfigurator.getState();
  store.selectLayer(layerId);
  focusLayer(layerId);
}

/** Moves the camera to a layer, opening the board first if needed. */
export function focusLayer(layerId) {
  if (INTERNAL_LAYERS.has(layerId) && runtime.explode.progress < 0.5) {
    explode();
    // The camera is already moving to the whole stack: that shows the part in context.
    return;
  }
  const focus = layerFocusPoint(layerId);
  if (!focus || !runtime.camera) return;
  const exploded = runtime.explode.progress > 0.5;
  const width = Math.max(focus.size[0], focus.size[2] * 2);
  runtime.camera.focusOn(focus.point, {
    distance: Math.max(560, width * 3.3),
    elevation: exploded ? 24 : 28,
    azimuth: -30,
  });
}

/** Moves the camera close to one key. */
export function focusKey(key) {
  const point = keyFocusPoint(key);
  if (!point || !runtime.camera) return;
  runtime.camera.focusOn(point, { distance: 300, elevation: 32, azimuth: -22 });
}

/**
 * Saves the current build. A thumbnail is rendered from the real scene. If that fails,
 * the build is still saved, because the data matters more than its picture.
 */
export async function saveCurrentBuild({ asNew = false } = {}) {
  const store = useConfigurator.getState();
  const { build, savedId } = store;
  let thumbnail;
  try {
    thumbnail = await renderThumbnail();
  } catch {
    thumbnail = undefined;
  }
  try {
    const result = buildStorage.save(build, { id: asNew ? undefined : savedId ?? undefined, thumbnail });
    store.markSaved(result.id);
    storageEvents.dispatchEvent(new Event('change'));
    store.showToast(
      result.thumbnailDropped ? `Saved "${build.name}", without a picture. Browser storage is nearly full.` : `Saved "${build.name}".`,
      'good',
    );
    return result.id;
  } catch (error) {
    store.showToast(error instanceof StorageError ? error.message : 'The build could not be saved.', 'bad');
    return null;
  }
}

/** The layout id and camera view for a shot. */
export function cameraViews() {
  return Object.entries(CAMERA_VIEWS).map(([id, view]) => ({ id, name: view.name }));
}

export { getLayout };
