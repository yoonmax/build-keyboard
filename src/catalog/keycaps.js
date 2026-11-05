/**
 * Keycap sets, surface materials and themes.
 * `coverage` is the number of caps of each size a set contains; the compatibility engine
 * compares it with what a layout needs, so missing caps are found by counting.
 * Profile dimensions in mm are used directly by the geometry builder.
 */

export const KEYCAP_PROFILES = {
  sculpted: {
    id: 'sculpted',
    name: 'Sculpted low',
    note: 'Each row has its own height and angle, forming a shallow curve under the fingers.',
    dish: 'cylindrical',
    dishDepth: 0.62,
    topInsetSide: 2.65,
    topInsetFront: 2.1,
    topInsetBack: 3.2,
    fillet: 0.85,
    baseRadius: 1.25,
    topRadius: 2.1,
    rows: {
      F: { height: 9.6, tilt: 8 },
      N: { height: 9.4, tilt: 7.5 },
      T: { height: 7.9, tilt: 2.5 },
      H: { height: 7.5, tilt: -1 },
      B: { height: 7.8, tilt: -7 },
      M: { height: 7.8, tilt: -7 },
    },
  },
  uniform: {
    id: 'uniform',
    name: 'Uniform',
    note: 'Every row has the same height and a wide, shallow bowl. Any key fits anywhere.',
    dish: 'spherical',
    dishDepth: 0.55,
    topInsetSide: 1.95,
    topInsetFront: 1.95,
    topInsetBack: 1.95,
    fillet: 1.15,
    baseRadius: 1.3,
    topRadius: 3.0,
    rows: {
      F: { height: 7.4, tilt: 0 },
      N: { height: 7.4, tilt: 0 },
      T: { height: 7.4, tilt: 0 },
      H: { height: 7.4, tilt: 0 },
      B: { height: 7.4, tilt: 0 },
      M: { height: 7.4, tilt: 0 },
    },
  },
  spherical: {
    id: 'spherical',
    name: 'Spherical high',
    note: 'Tall, rounded caps with a deep bowl and strong sculpting between rows.',
    dish: 'spherical',
    dishDepth: 1.05,
    topInsetSide: 3.1,
    topInsetFront: 2.6,
    topInsetBack: 3.8,
    fillet: 1.4,
    baseRadius: 1.1,
    topRadius: 2.9,
    rows: {
      F: { height: 14.2, tilt: 13 },
      N: { height: 14.2, tilt: 13 },
      T: { height: 12.0, tilt: 7 },
      H: { height: 10.6, tilt: 0 },
      B: { height: 11.8, tilt: -7 },
      M: { height: 11.8, tilt: -7 },
    },
  },
};

export const KEYCAP_MATERIALS = {
  pbt: {
    id: 'pbt',
    name: 'PBT',
    roughness: 0.58,
    metalness: 0,
    note: 'Hard, dense plastic with a fine dry texture. Resists shine over time.',
    surcharge: 0,
  },
  abs: {
    id: 'abs',
    name: 'ABS',
    roughness: 0.27,
    metalness: 0,
    note: 'Smooth with a satin gloss. Crisp colours, though it polishes with heavy use.',
    surcharge: 0,
  },
  aluminum: {
    id: 'aluminum',
    name: 'Aluminum',
    roughness: 0.36,
    metalness: 0.92,
    note: 'Machined metal with a colour anodized in. Heavy, and sold per key.',
    surcharge: 7.5,
  },
};

const FULL_COVERAGE = { 1: 96, 1.25: 12, 1.5: 4, 1.75: 3, 2: 4, 2.25: 3, 2.75: 2, 6.25: 2 };
const COMPACT_COVERAGE = { 1: 62, 1.25: 8, 1.5: 2, 1.75: 2, 2: 1, 2.25: 2, 2.75: 1, 6.25: 1 };

export const KEYCAP_SETS = [
  {
    id: 'caps-sculpted',
    name: 'Sculpted low, full set',
    category: 'keycaps',
    profile: 'sculpted',
    materials: ['pbt', 'abs', 'aluminum'],
    coverage: FULL_COVERAGE,
    specs: { Profile: 'Sculpted low', Set: '126 caps', Rows: 'Sculpted by row' },
    notes: 'A familiar low profile, with spare caps for every layout here.',
    price: 112,
  },
  {
    id: 'caps-uniform',
    name: 'Uniform, full set',
    category: 'keycaps',
    profile: 'uniform',
    materials: ['pbt', 'abs', 'aluminum'],
    coverage: FULL_COVERAGE,
    specs: { Profile: 'Uniform', Set: '126 caps', Rows: 'One height throughout' },
    notes: 'Wide, friendly tops. Keys can be moved anywhere without a change in height.',
    price: 94,
  },
  {
    id: 'caps-spherical',
    name: 'Spherical high, compact set',
    category: 'keycaps',
    profile: 'spherical',
    materials: ['pbt', 'abs'],
    coverage: COMPACT_COVERAGE,
    specs: { Profile: 'Spherical high', Set: '76 caps', Rows: 'Strongly sculpted' },
    notes: 'A smaller run that stops short of a full function row. Count the caps before picking a large layout.',
    price: 138,
  },
];

/** Keys drawn in the theme's highlight colour. */
export const HIGHLIGHT_KEYS = ['Escape', 'Enter'];

export const KEYCAP_THEMES = [
  {
    id: 'monochrome',
    name: 'Monochrome',
    note: 'Warm white and stone, with single black keys for Esc and Enter.',
    base: '#E8E6E0',
    accent: '#B5B2AA',
    highlight: '#202122',
    legend: '#202122',
    legendHighlight: '#E8E6E0',
    space: 'base',
  },
  {
    id: 'cream',
    name: 'Cream',
    note: 'Soft dairy cream over oat, with cocoa on the keys you reach for most.',
    base: '#EEE4CE',
    accent: '#CDBD9F',
    highlight: '#5D4A38',
    legend: '#4A3C2E',
    legendHighlight: '#EEE4CE',
    space: 'base',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    note: 'Layered dark grays with pale legends and one light key to find your place.',
    base: '#3A3C3F',
    accent: '#232527',
    highlight: '#D6D3CB',
    legend: '#D6D3CB',
    legendHighlight: '#232527',
    space: 'accent',
  },
  {
    id: 'ice',
    name: 'Ice',
    note: 'Cold blue-white over slate. Quiet and clean on a silver or navy case.',
    base: '#DDE6EC',
    accent: '#9CB3C4',
    highlight: '#2F5068',
    legend: '#22394B',
    legendHighlight: '#DDE6EC',
    space: 'base',
  },
  {
    id: 'matcha',
    name: 'Matcha',
    note: 'Whisked-tea green and dried leaf, with a deep moss accent.',
    base: '#D9DDBF',
    accent: '#94A173',
    highlight: '#3D4C2C',
    legend: '#2E3921',
    legendHighlight: '#D9DDBF',
    space: 'base',
  },
  {
    id: 'retro',
    name: 'Retro',
    note: 'Aged office-computer beige with gray modifiers and a red Esc and Enter.',
    base: '#D7CEB9',
    accent: '#8E8B83',
    highlight: '#AE362B',
    legend: '#2A2925',
    legendHighlight: '#F0EADB',
    space: 'accent',
  },
];

/** Named groups a user can recolour at once in the key editor. */
export const KEY_GROUPS = [
  { id: 'alpha', name: 'Letters', match: (k) => k.cluster === 'alpha' },
  { id: 'number', name: 'Numbers', match: (k) => k.cluster === 'number' },
  { id: 'function', name: 'Function row', match: (k) => k.cluster === 'function' },
  { id: 'modifier', name: 'Modifiers', match: (k) => k.cluster === 'modifier' },
  { id: 'navigation', name: 'Navigation', match: (k) => k.cluster === 'navigation' },
  { id: 'space', name: 'Spacebar', match: (k) => k.cluster === 'space' },
  { id: 'highlight', name: 'Esc and Enter', match: (k) => HIGHLIGHT_KEYS.includes(k.id) },
];
