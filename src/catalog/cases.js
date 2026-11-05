/**
 * Case catalog. Prices are illustrative catalog estimates for this demo, not retail quotes.
 * `price` is keyed by layout because a larger case uses more material.
 */
export const CASES = [
  {
    id: 'case-anodized',
    name: 'Anodized aluminum',
    category: 'case',
    layouts: ['60', '65', '75', 'tkl'],
    mounts: ['gasket', 'top'],
    finishes: ['matte', 'satin', 'brushed'],
    defaultFinish: 'satin',
    colors: ['silver', 'black', 'white', 'navy', 'champagne', 'sage', 'custom'],
    transmitsLight: false,
    specs: {
      Construction: 'Two-piece CNC-machined body',
      Surface: 'Anodic oxide layer, dyed',
      'Typing angle': '6.5°',
      'Front height': '18 mm',
    },
    notes:
      'Dye sits inside a thin oxide layer on the metal, so colours stay slightly metallic. Very pale tones are hard to achieve.',
    price: { 60: 168, 65: 178, 75: 192, tkl: 224 },
  },
  {
    id: 'case-polycarbonate',
    name: 'Polycarbonate',
    category: 'case',
    layouts: ['60', '65', '75'],
    mounts: ['gasket', 'tray'],
    finishes: ['satin', 'gloss'],
    defaultFinish: 'satin',
    colors: ['silver', 'black', 'white', 'navy', 'champagne', 'sage', 'custom'],
    transmitsLight: false,
    specs: {
      Construction: 'Two-piece moulded body',
      Surface: 'Opaque tinted plastic',
      'Typing angle': '6.5°',
      'Front height': '18 mm',
    },
    notes:
      'Lighter and warmer in sound than metal. This catalog has no moulding tool longer than a 75% board, so TKL is unavailable.',
    price: { 60: 92, 65: 98, 75: 112 },
  },
  {
    id: 'case-painted',
    name: 'Painted aluminum',
    category: 'case',
    layouts: ['60', '65', '75', 'tkl'],
    mounts: ['gasket', 'top'],
    finishes: ['matte', 'satin', 'gloss'],
    defaultFinish: 'satin',
    colors: ['silver', 'black', 'white', 'navy', 'champagne', 'sage', 'custom'],
    transmitsLight: false,
    specs: {
      Construction: 'Two-piece CNC-machined body',
      Surface: 'Sprayed paint over bare aluminum',
      'Typing angle': '6.5°',
      'Front height': '18 mm',
    },
    notes:
      'Paint hides the metal completely, so it can reach true whites and saturated custom colours that anodizing cannot.',
    price: { 60: 184, 65: 196, 75: 212, tkl: 246 },
  },
  {
    id: 'case-frosted',
    name: 'Frosted translucent polymer',
    category: 'case',
    layouts: ['60', '65', '75'],
    mounts: ['gasket', 'tray'],
    finishes: ['matte'],
    defaultFinish: 'matte',
    colors: ['silver', 'black', 'white', 'navy', 'champagne', 'sage', 'custom'],
    transmitsLight: true,
    specs: {
      Construction: 'Two-piece moulded body',
      Surface: 'Blasted translucent plastic',
      'Typing angle': '6.5°',
      'Front height': '18 mm',
    },
    notes:
      'You can see the shape of the plate and PCB through the walls, and underglow lights the whole body.',
    price: { 60: 104, 65: 112, 75: 126 },
  },
];

export const MOUNTS = {
  gasket: {
    id: 'gasket',
    name: 'Gasket mount',
    note: 'The plate floats on soft strips between the case halves. Softer feel, muted sound.',
  },
  top: {
    id: 'top',
    name: 'Top mount',
    note: 'The plate screws to the upper case. Firm and consistent across the board.',
  },
  tray: {
    id: 'tray',
    name: 'Tray mount',
    note: 'The PCB screws to standoffs in the lower case. Simple, with slight variation in flex.',
  },
};
