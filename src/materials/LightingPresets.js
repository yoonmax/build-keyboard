/**
 * Studio definitions as plain data. A backdrop is what's behind the keyboard. A lighting
 * rig is where the softboxes sit. They combine freely, as they would in a real studio.
 *
 * Lightformers are positioned in millimetres, in the same world as the keyboard, and are
 * captured into an environment map. They are what reflects in the chamfers.
 */

export const BACKDROPS = [
  {
    id: 'white',
    name: 'White studio',
    note: 'A bright seamless sweep. The default.',
    top: '#F2F0EC',
    bottom: '#E4E2DC',
    shadow: 0.42,
    contact: 0.62,
    wall: '#1C1D1F',
    wallOpacity: 0.07,
    envTint: '#F6F4F0',
    uiTone: 'light',
  },
  {
    id: 'warm',
    name: 'Warm neutral',
    note: 'Soft clay-gray paper, gentle on pale keyboards.',
    top: '#DFD9CE',
    bottom: '#C9C1B3',
    shadow: 0.48,
    contact: 0.66,
    wall: '#2A2622',
    wallOpacity: 0.08,
    envTint: '#EFE6D8',
    uiTone: 'light',
  },
  {
    id: 'gradient',
    name: 'Soft gradient',
    note: 'A falloff from pale gray to graphite behind the board.',
    top: '#A9A8A5',
    bottom: '#E5E3DE',
    shadow: 0.46,
    contact: 0.64,
    wall: '#111214',
    wallOpacity: 0.1,
    envTint: '#EDECE9',
    uiTone: 'light',
  },
  {
    id: 'dark',
    name: 'Dark studio',
    note: 'A deep charcoal sweep, with light only where it counts.',
    top: '#2B2C2F',
    bottom: '#1B1C1E',
    shadow: 0.72,
    contact: 0.82,
    wall: '#F2F0EC',
    wallOpacity: 0.045,
    envTint: '#D9DCE2',
    envScale: 0.96,
    uiTone: 'dark',
  },
  {
    id: 'desk',
    name: 'Walnut desk',
    note: 'An oiled walnut surface against a muted wall.',
    top: '#CFC9BE',
    bottom: '#A49C8F',
    shadow: 0.55,
    contact: 0.72,
    wall: '#2A2622',
    wallOpacity: 0.06,
    envTint: '#F0E6D6',
    floor: 'walnut',
    uiTone: 'light',
  },
];

/**
 * Rigs. `key` is a shadow-casting directional light, and `softness` is the radius in mm
 * of the disc it's jittered across during refinement: larger means softer shadows.
 * `formers` are softboxes in the environment.
 */
export const LIGHT_RIGS = [
  {
    id: 'softbox',
    name: 'Softbox',
    note: 'A big overhead source with low contrast. True to colour.',
    envIntensity: 1.0,
    key: { position: [-620, 880, -640], intensity: 1.75, softness: 210 },
    formers: [
      { position: [0, 1000, 0], rotation: [Math.PI / 2, 0, 0], scale: [1800, 1100], intensity: 2.6 },
      { position: [-1200, 360, 300], rotation: [0, Math.PI / 2, 0], scale: [1400, 720], intensity: 1.9 },
      { position: [1200, 300, -80], rotation: [0, -Math.PI / 2, 0], scale: [1400, 560], intensity: 1.35 },
      // The wide, low front panel is what the case's front wall reflects, so metals keep their colour.
      { position: [0, 300, 1300], rotation: [0, Math.PI, 0], scale: [2400, 620], intensity: 2.1 },
      { position: [0, 260, -1300], rotation: [0, 0, 0], scale: [2200, 420], intensity: 0.9 },
    ],
    ambient: 0.3,
  },
  {
    id: 'raking',
    name: 'Raking',
    note: 'One low side light. Shows surface form and legends clearly.',
    envIntensity: 0.52,
    key: { position: [-1020, 420, 180], intensity: 3.1, softness: 90 },
    formers: [
      { position: [-1200, 300, 150], rotation: [0, Math.PI / 2, 0], scale: [700, 500], intensity: 4.4 },
      { position: [0, 980, 0], rotation: [Math.PI / 2, 0, 0], scale: [1200, 800], intensity: 0.9 },
      { position: [1200, 220, 0], rotation: [0, -Math.PI / 2, 0], scale: [500, 200], intensity: 0.35 },
    ],
    ambient: 0.22,
  },
  {
    id: 'rim',
    name: 'Rim',
    note: 'Strip lights behind the board outline every edge.',
    envIntensity: 0.68,
    key: { position: [120, 720, -820], intensity: 2.4, softness: 110 },
    formers: [
      { position: [0, 420, -1200], rotation: [0, 0, 0], scale: [1800, 300], intensity: 5.4 },
      { position: [-1100, 260, -300], rotation: [0, Math.PI / 2, 0], scale: [500, 160], intensity: 3.0 },
      { position: [1100, 260, -300], rotation: [0, -Math.PI / 2, 0], scale: [500, 160], intensity: 3.0 },
      { position: [0, 980, 200], rotation: [Math.PI / 2, 0, 0], scale: [1200, 800], intensity: 1.9 },
    ],
    ambient: 0.28,
  },
];

/**
 * Finds the scene-linear colour that tone mapping will turn into the given display-linear
 * colour. Backdrops are specified as the colours a person should see, so they must come
 * through the Khronos Neutral curve unchanged. Inverts the curve from ProgressiveRenderer.
 * @param {number[]} target display-linear [r, g, b]
 * @returns {number[]} scene-linear [r, g, b]
 */
export function inverseNeutral(target) {
  const START = 0.76;
  const D = 1 - START;
  let [r, g, b] = target;
  const peak = Math.max(r, g, b);
  if (peak > START) {
    const newPeak = Math.min(peak, 0.995);
    const original = (D * D) / (1 - newPeak) - D + START;
    const scale = original / peak;
    r *= scale;
    g *= scale;
    b *= scale;
  }
  const low = Math.min(r, g, b);
  // Below the toe the curve is x - (x - 6.25x²) = 6.25x², above it a fixed 0.04 is removed.
  const offset = low >= 0.04 ? 0.04 : Math.sqrt(Math.max(low, 0) / 6.25) - Math.max(low, 0);
  return [r + offset, g + offset, b + offset];
}

/** The forward curve, in the same form as the renderer's shader. */
export function neutralToneMap([red, green, blue]) {
  const START = 0.76;
  const D = 1 - START;
  const x = Math.min(red, green, blue);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  let r = red - offset;
  let g = green - offset;
  let b = blue - offset;
  const peak = Math.max(r, g, b);
  if (peak < START) return [r, g, b];
  const newPeak = 1 - (D * D) / (peak + D - START);
  const k = newPeak / peak;
  r *= k;
  g *= k;
  b *= k;
  const mix = 1 - 1 / (0.15 * (peak - newPeak) + 1);
  return [r + (newPeak - r) * mix, g + (newPeak - g) * mix, b + (newPeak - b) * mix];
}

export const getBackdrop = (id) => BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0];
export const getRig = (id) => LIGHT_RIGS.find((r) => r.id === id) ?? LIGHT_RIGS[0];
