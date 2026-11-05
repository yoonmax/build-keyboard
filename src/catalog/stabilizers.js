/**
 * Stabilizer catalog. A kit supplies a fixed number of housings, and the compatibility
 * engine compares that with what the selected layout needs. Prices are illustrative.
 */
export const STABILIZERS = [
  {
    id: 'stab-screw',
    name: 'Screw-in, full kit',
    category: 'stabilizer',
    mountType: 'pcb-screw',
    kit: { small: 4, large: 1 },
    style: { housing: '#2A2B2D', stem: '#D8D5CC', wire: '#B9BCBF' },
    specs: { Mount: 'Screwed through the PCB', Kit: '4 small and 1 large', Wire: 'Stainless steel' },
    notes: 'The most stable option. Needs a PCB with stabilizer screw holes.',
    price: 26,
  },
  {
    id: 'stab-screw-compact',
    name: 'Screw-in, compact kit',
    category: 'stabilizer',
    mountType: 'pcb-screw',
    kit: { small: 3, large: 1 },
    style: { housing: '#2A2B2D', stem: '#D8D5CC', wire: '#B9BCBF' },
    specs: { Mount: 'Screwed through the PCB', Kit: '3 small and 1 large', Wire: 'Stainless steel' },
    notes: 'One small stabilizer fewer. Enough only when the right Shift key is short, as on 65% and 75% boards.',
    price: 21,
  },
  {
    id: 'stab-snap',
    name: 'Snap-in, full kit',
    category: 'stabilizer',
    mountType: 'pcb-snap',
    kit: { small: 4, large: 1 },
    style: { housing: '#E3E1DB', stem: '#E3E1DB', wire: '#B9BCBF' },
    specs: { Mount: 'Clipped into the PCB', Kit: '4 small and 1 large', Wire: 'Stainless steel' },
    notes: 'Fits most PCBs with no screws, but can rattle a little more than screw-in stabilizers.',
    price: 16,
  },
  {
    id: 'stab-plate',
    name: 'Plate-mount, full kit',
    category: 'stabilizer',
    mountType: 'plate',
    kit: { small: 4, large: 1 },
    style: { housing: '#6C7076', stem: '#2A2B2D', wire: '#B9BCBF' },
    specs: { Mount: 'Clipped into the plate', Kit: '4 small and 1 large', Wire: 'Stainless steel' },
    notes: 'Holds on to the plate rather than the PCB, so it needs a stiff plate to stay steady.',
    price: 14,
  },
];
