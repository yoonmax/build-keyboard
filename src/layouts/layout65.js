import { HOME_KEYS, LETTER_BOTTOM_KEYS, NUMBER_KEYS, TOP_KEYS } from './blocks.js';

/** 65% ANSI: 68 keys. A 60% with an arrow cluster and a navigation column. */
export const layout65 = {
  id: '65',
  name: '65%',
  fullName: '65% ANSI',
  standard: 'ANSI',
  expectedKeyCount: 68,
  blurb: 'Adds arrows and a navigation column, with very little extra width.',
  rows: [
    {
      profile: 'N',
      keys: [['Escape', 'Esc', 1, '~'], ...NUMBER_KEYS.slice(1), ['Delete', 'Del', 1]],
    },
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
