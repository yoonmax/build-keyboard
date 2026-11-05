/**
 * Plate catalog. Acoustic and flex values are representative descriptions, not lab measurements.
 * Prices are illustrative catalog estimates.
 */
export const PLATES = [
  {
    id: 'plate-aluminum',
    name: 'Aluminum',
    category: 'plate',
    layouts: ['60', '65', '75', 'tkl'],
    mounts: ['gasket', 'top', 'tray'],
    thickness: 1.5,
    flex: 'low',
    acoustic: 'Bright and crisp, with a higher-pitched bottom-out.',
    specs: { Thickness: '1.5 mm', Flex: 'Low (representative)', Sound: 'Bright, crisp' },
    notes: 'Rigid and precise. A good match for gasket mounts, which add softness back in.',
    price: { 60: 26, 65: 28, 75: 32, tkl: 38 },
  },
  {
    id: 'plate-polycarbonate',
    name: 'Polycarbonate',
    category: 'plate',
    layouts: ['60', '65', '75', 'tkl'],
    mounts: ['gasket', 'top'],
    thickness: 1.5,
    flex: 'high',
    acoustic: 'Deep and muted, with a soft bottom-out.',
    specs: { Thickness: '1.5 mm', Flex: 'High (representative)', Sound: 'Deep, muted' },
    notes: 'Flexes visibly under load. Too soft to carry a tray-mounted PCB well.',
    price: { 60: 22, 65: 24, 75: 28, tkl: 32 },
  },
  {
    id: 'plate-fr4',
    name: 'FR4',
    category: 'plate',
    layouts: ['60', '65', '75', 'tkl'],
    mounts: ['gasket', 'top', 'tray'],
    thickness: 1.6,
    flex: 'medium',
    acoustic: 'Balanced, between aluminum and polycarbonate.',
    specs: { Thickness: '1.6 mm', Flex: 'Medium (representative)', Sound: 'Balanced' },
    notes: 'The same woven fibreglass as a circuit board. A dependable middle ground.',
    price: { 60: 18, 65: 20, 75: 22, tkl: 26 },
  },
];

/** Thickness range a switch's plate clips are designed to hold, in mm. */
export const SWITCH_CLIP_RANGE = { min: 1.4, max: 1.65 };
