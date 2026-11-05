/**
 * The non-React half of the configurator. Anything that changes every frame lives here
 * and is read in the render loop, so typing or animating never re-renders React.
 */
export const runtime = {
  /** Set by the scene: asks R3F for another frame. */
  invalidate: () => {},

  /** Number of frames to discard from the progressive accumulation. */
  resetKind: 'none',

  /** Mesh registrations, written by each part as it mounts. */
  parts: {
    caps: null,
    stems: null,
    stabStems: null,
    layers: {},
    outlineTargets: {},
    keyLight: null,
  },

  /** Per-key animation state, resized when the layout changes. */
  keys: {
    count: 0,
    travel: new Float32Array(0),
    velocity: new Float32Array(0),
    pressed: new Uint8Array(0),
    drop: new Float32Array(0),
    dropVelocity: new Float32Array(0),
    dropDelay: new Float32Array(0),
    lift: new Float32Array(0),
    liftTarget: new Float32Array(0),
    maxTravel: 4,
  },

  /** Exploded-view timeline state, tweened by ExplodedView.js. */
  explode: { progress: 0, separation: 1, isolate: null },

  /** View settings the renderer reads every frame. */
  view: {
    shiftX: 0,
    shiftY: 0,
    targetShiftX: 0,
    targetShiftY: 0,
    dof: { enabled: false, aperture: 6, focus: null },
    maxSamples: 64,
    samples: 0,
    converged: false,
    rendering: true,
  },

  /** Rolling frame timing, used for automatic quality and measurements. */
  stats: { frameMs: 16, renderedFrames: 0, lastPresent: 0 },

  /** Off-screen renderer, set by ProgressiveRenderer. */
  capture: null,

  /** Camera API, set by CameraController. */
  camera: null,
};

/**
 * Tells the renderer the image has changed.
 * 'soft' keeps most of the accumulated image, for small motion such as a key press.
 * 'full' restarts refinement, for changes that affect the whole frame.
 * @param {'soft'|'full'} [kind]
 */
export function touch(kind = 'full') {
  if (kind === 'full' || runtime.resetKind === 'none') runtime.resetKind = kind;
  runtime.invalidate();
}

/** Prepares per-key state arrays for a new key count. */
export function resizeKeyState(count) {
  const keys = runtime.keys;
  keys.count = count;
  keys.travel = new Float32Array(count);
  keys.velocity = new Float32Array(count);
  keys.pressed = new Uint8Array(count);
  keys.drop = new Float32Array(count);
  keys.dropVelocity = new Float32Array(count);
  keys.dropDelay = new Float32Array(count);
  keys.lift = new Float32Array(count);
  keys.liftTarget = new Float32Array(count);
}

/** Sets a key's pressed state, for the tester, the mouse or a touch. */
export function setKeyPressed(index, pressed) {
  if (index < 0 || index >= runtime.keys.count) return;
  runtime.keys.pressed[index] = pressed ? 1 : 0;
  touch('soft');
}

export function releaseAllKeys() {
  runtime.keys.pressed.fill(0);
  touch('soft');
}

/** Starts the keycaps' fall into place, sweeping left to right. */
export function dropKeycaps(layout, { height = 26, spread = 0.42 } = {}) {
  const keys = runtime.keys;
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const half = layout.widthMM / 2;
  for (const key of layout.keys) {
    keys.drop[key.index] = height;
    keys.dropVelocity[key.index] = 0;
    keys.dropDelay[key.index] = ((key.cx + half) / (half * 2)) * spread + (key.row / layout.rowCount) * 0.06;
  }
  touch('full');
}
