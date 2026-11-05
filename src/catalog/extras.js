/** Lighting options and accessories. Prices are illustrative catalog estimates. */

export const LIGHTING = [
  {
    id: 'none',
    name: 'No lighting',
    category: 'lighting',
    notes: 'The case and keycaps carry the whole look. The quietest choice.',
    price: 0,
  },
  {
    id: 'per-key',
    name: 'Per-key LEDs',
    category: 'lighting',
    notes: 'One LED under each switch, shining up through the switch housing and around the keycaps.',
    price: 14,
  },
  {
    id: 'underglow',
    name: 'Underglow',
    category: 'lighting',
    notes: 'A strip of LEDs on the underside of the PCB. It needs a case that lets light through.',
    price: 9,
  },
];

export const ACCESSORIES = [
  {
    id: 'acc-foam',
    name: 'Case and plate foam',
    category: 'accessory',
    layouts: ['60', '65', '75', 'tkl'],
    specs: { Material: 'Poron, 3.5 mm case layer and 3 mm plate layer' },
    notes: 'Cut to the layout. Fills the empty space in the case and quiets hollow sound.',
    price: { 60: 12, 65: 13, 75: 15, tkl: 18 },
  },
  {
    id: 'acc-cable',
    name: 'Coiled USB-C cable',
    category: 'accessory',
    layouts: ['60', '65', '75', 'tkl'],
    specs: { Length: '1.5 m with 12 cm coil', Connector: 'USB-C to USB-A or USB-C' },
    notes: 'Colour-matched to the case in the studio view.',
    price: 42,
  },
  {
    id: 'acc-wrist',
    name: 'Walnut wrist rest',
    category: 'accessory',
    layouts: ['65', '75', 'tkl'],
    specs: { Material: 'Oiled walnut', Height: '16 mm' },
    notes: 'Cut to the width of the board. There is no size for a 60%, which is narrower than the shortest blank.',
    price: { 65: 48, 75: 52, tkl: 64 },
  },
  {
    id: 'acc-tools',
    name: 'Switch and keycap puller',
    category: 'accessory',
    layouts: ['60', '65', '75', 'tkl'],
    specs: { Includes: 'Wire keycap puller and two-prong switch puller' },
    notes: 'Needed if you want to change keycaps or hot-swap switches later.',
    price: 9,
  },
];
