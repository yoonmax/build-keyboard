/** Named case colours. Every swatch in the interface shows its name as well as its colour. */
export const CASE_COLORS = [
  { id: 'silver', name: 'Silver', hex: '#B4B6B8' },
  { id: 'black', name: 'Black', hex: '#1C1D1F' },
  { id: 'white', name: 'White', hex: '#E9E8E4' },
  { id: 'navy', name: 'Navy', hex: '#1E2C44' },
  { id: 'champagne', name: 'Champagne', hex: '#CDB99A' },
  { id: 'sage', name: 'Sage', hex: '#8A9A82' },
  { id: 'custom', name: 'Custom', hex: null },
];

/** Finish definitions with the surface values the material system uses. */
export const FINISHES = {
  matte: {
    id: 'matte',
    name: 'Matte',
    note: 'Bead-blasted and even. Hides fingerprints and gives broad, soft highlights.',
    roughnessShift: 0.14,
  },
  satin: {
    id: 'satin',
    name: 'Satin',
    note: 'A fine sheen. Light rolls along the chamfers without forming hard reflections.',
    roughnessShift: 0,
  },
  brushed: {
    id: 'brushed',
    name: 'Brushed',
    note: 'Directional grain along the length of the case, stretching highlights sideways.',
    roughnessShift: 0.02,
    anisotropy: 0.75,
  },
  gloss: {
    id: 'gloss',
    name: 'Gloss',
    note: 'Polished to a clear reflection. Shows the studio lights and every fingerprint.',
    roughnessShift: -0.22,
    clearcoat: 1,
  },
};

/**
 * Display name for a hex colour outside the named palette, so a custom colour can still
 * be read by name in specification sheets and to screen readers.
 * @param {string} hex
 */
export function describeColor(hex) {
  const value = String(hex).replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  const tone = lightness < 0.25 ? 'Deep' : lightness > 0.75 ? 'Pale' : 'Mid';
  if (chroma < 0.08) {
    if (lightness < 0.15) return 'Near black';
    if (lightness > 0.88) return 'Near white';
    return lightness < 0.5 ? 'Dark gray' : 'Light gray';
  }
  let hue;
  if (max === r) hue = ((g - b) / chroma + 6) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  hue *= 60;
  const names = [
    [15, 'red'],
    [45, 'orange'],
    [70, 'yellow'],
    [165, 'green'],
    [195, 'teal'],
    [255, 'blue'],
    [290, 'violet'],
    [340, 'magenta'],
    [361, 'red'],
  ];
  const name = names.find(([limit]) => hue < limit)[1];
  return `${tone} ${name}`;
}
