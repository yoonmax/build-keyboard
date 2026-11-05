import { runtime } from '../configurator/runtime.js';

/** Largest edge offered for export. A limit keeps memory use and export time practical. */
export const MAX_EXPORT_EDGE = 6144;

export const EXPORT_SIZES = [
  { id: 'hd', name: 'Full HD', width: 1920, height: 1080 },
  { id: 'qhd', name: 'QHD', width: 2560, height: 1440 },
  { id: '4k', name: '4K', width: 3840, height: 2160 },
  { id: 'square', name: 'Square', width: 3000, height: 3000 },
  { id: 'portrait', name: 'Portrait', width: 2400, height: 3000 },
];

export const SHADOW_QUALITY = [
  { id: 'draft', name: 'Draft', samples: 16, shadowSize: 2048, note: 'Fast. Good for checking a shot.' },
  { id: 'good', name: 'Good', samples: 64, shadowSize: 2048, note: 'Soft shadows and clean edges.' },
  { id: 'best', name: 'Best', samples: 196, shadowSize: 4096, note: 'Slowest, for final images.' },
];

/**
 * Checks a requested size before any work starts, in terms the person can act on.
 * @returns {string|null} a message when the size can't be used
 */
export function exportSizeProblem(width, height, maxTextureSize = 16384) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 'Enter a width and height in pixels.';
  if (width < 64 || height < 64) return 'The image must be at least 64 pixels on each side.';
  const limit = Math.min(MAX_EXPORT_EDGE, maxTextureSize);
  if (width > limit || height > limit) return `The longest side can be at most ${limit} pixels here.`;
  return null;
}

/** Moves every exploded part immediately, without waiting for the render loop. */
function settleMotion() {
  runtime.stepMotion?.();
}

/**
 * Turns the current scene into an ImageData at the requested size.
 * Uses the real configuration, the real studio and the same renderer as the viewport.
 */
async function renderToImageData({ width, height, samples, shadowSize, viewId, dof, fit, onProgress, signal, forceAssembled }) {
  if (!runtime.capture) throw new Error('The 3D view is still loading. Try again in a moment.');
  const problem = exportSizeProblem(width, height, runtime.gl?.capabilities.maxTextureSize);
  if (problem) throw new Error(problem);

  const previousProgress = runtime.explode.progress;
  if (forceAssembled && previousProgress > 0) {
    runtime.explode.progress = 0;
    settleMotion();
  }

  try {
    let camera;
    let focusDistance;
    if (viewId && viewId !== 'current') {
      const virtual = runtime.camera.virtualCamera(viewId, { aspect: width / height, fit });
      camera = virtual.camera;
      focusDistance = virtual.distance;
    } else {
      camera = runtime.camera.currentCamera(width / height);
      focusDistance = runtime.camera.distance();
    }
    const focus = dof?.enabled ? { ...dof, focus: dof.focus ?? focusDistance } : dof;
    return await runtime.capture({ width, height, samples, camera, dof: focus, shadowSize, onProgress, signal });
  } finally {
    if (forceAssembled && previousProgress > 0) {
      runtime.explode.progress = previousProgress;
      settleMotion();
    }
  }
}

/** Draws a product title on the image with the same typeface as the interface. */
function drawTitle(ctx, { title, subtitle, width, height, ink, position = 'bottom-left' }) {
  const unit = Math.min(width, height) / 100;
  const margin = unit * 5;
  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  const top = position.startsWith('top');
  const left = position.endsWith('left');
  ctx.textAlign = left ? 'left' : 'right';
  const x = left ? margin : width - margin;
  const titleSize = unit * 4.4;
  const subSize = unit * 1.7;
  ctx.font = `700 ${titleSize}px "Hanken Grotesk Variable", Arial, sans-serif`;
  ctx.letterSpacing = `${-titleSize * 0.02}px`;
  const y = top ? margin + titleSize : height - margin - (subtitle ? subSize * 1.6 : 0);
  ctx.fillText(title, x, y);
  if (subtitle) {
    ctx.font = `500 ${subSize}px "Hanken Grotesk Variable", Arial, sans-serif`;
    ctx.letterSpacing = '0px';
    ctx.globalAlpha = 0.7;
    ctx.fillText(subtitle, x, y + subSize * 1.7);
    ctx.globalAlpha = 1;
  }
}

/**
 * Renders a PNG.
 * @param {object} options
 * @returns {Promise<Blob>}
 */
export async function exportImage({ width, height, quality, viewId, dof, overlay, onProgress, signal, fit }) {
  const level = SHADOW_QUALITY.find((q) => q.id === quality) ?? SHADOW_QUALITY[1];
  const image = await renderToImageData({
    width,
    height,
    samples: level.samples,
    shadowSize: level.shadowSize,
    viewId,
    dof,
    fit,
    onProgress,
    signal,
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(image, 0, 0);
  if (overlay?.title) drawTitle(ctx, { ...overlay, width, height });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('This browser could not encode an image at this size. Try a smaller export.');
  return blob;
}

/**
 * A small render of the current build for the gallery. It's a true image of the
 * configuration, and always shows the assembled keyboard from the standard angle.
 * @returns {Promise<string>} data URL
 */
export async function renderThumbnail({ width = 960, height = 600, samples = 32 } = {}) {
  const image = await renderToImageData({
    width,
    height,
    samples,
    shadowSize: 2048,
    viewId: 'hero',
    fit: 0.94,
    forceAssembled: true,
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(image, 0, 0);
  const webp = canvas.toDataURL('image/webp', 0.84);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.84);
}

/** ImageData from the assembled keyboard at a chosen view, used by the build sheet. */
export async function renderSheetImage({ width, height, viewId = 'hero', samples = 40, fit }) {
  return renderToImageData({ width, height, samples, shadowSize: 2048, viewId, forceAssembled: true, fit });
}
