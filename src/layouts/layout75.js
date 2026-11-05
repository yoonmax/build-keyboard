import { FUNCTION_KEYS, HOME_KEYS, LETTER_BOTTOM_KEYS, NUMBER_KEYS, TOP_KEYS } from './blocks.js';

/** 75% ANSI: 84 keys. Function row and arrows in a block with almost no gaps. */
export const layout75 = {
  id: '75',
  name: '75%',
  fullName: '75% ANSI',
  standard: 'ANSI',
  expectedKeyCount: 84,
  blurb: 'A function row and arrows, packed into one tight block.',
  rows: [
    {
      profile: 'F',
      gapAfter: 0.25,
      keys: [
        ['Escape', 'Esc', 1],
        ...FUNCTION_KEYS,
        ['PrintScreen', 'PrtSc', 1],
        ['Pause', 'Pause', 1],
        ['Delete', 'Del', 1],
      ],
    },
    { profile: 'N', keys: [...NUMBER_KEYS, ['Home', 'Home', 1]] },
    { profile: 'T', keys: [...TOP_KEYS, ['PageUp', 'PgUp', 1]] },
    { profile: 'H', keys: [...HOME_KEYS, ['PageDown', 'PgDn', 1]] },
    {
      profile: 'B',
      keys: [
        ['ShiftLeft', 'Shift', 2.25],
        ...LETTER_BOTTOM_KEYS,
        ['ShiftRight', 'Shift', 1.75],
        ['ArrowUp', '↑', 1],
        ['End', 'End', 1],
      ],
    },
    {
      profile: 'M',
      keys: [
        ['ControlLeft', 'Ctrl', 1.25],
        ['MetaLeft', 'Super', 1.25],
        ['AltLeft', 'Alt', 1.25],
        ['Space', '', 6.25],
        ['AltRight', 'Alt', 1],
        ['Fn', 'Fn', 1],
        ['ControlRight', 'Ctrl', 1],
        ['ArrowLeft', '←', 1],
        ['ArrowDown', '↓', 1],
        ['ArrowRight', '→', 1],
      ],
    },
  ],
};
