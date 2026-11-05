import { HOME_KEYS, LETTER_BOTTOM_KEYS, NUMBER_KEYS, TOP_KEYS } from './blocks.js';

/** 60% ANSI: 61 keys, no function row, arrows or navigation cluster. */
export const layout60 = {
  id: '60',
  name: '60%',
  fullName: '60% ANSI',
  standard: 'ANSI',
  expectedKeyCount: 61,
  blurb: 'The essentials. No function row, no arrows, the smallest footprint on a desk.',
  rows: [
    {
      profile: 'N',
      keys: [['Escape', 'Esc', 1, '~'], ...NUMBER_KEYS.slice(1)],
    },
    { profile: 'T', keys: TOP_KEYS },
    { profile: 'H', keys: HOME_KEYS },
    {
      profile: 'B',
      keys: [['ShiftLeft', 'Shift', 2.25], ...LETTER_BOTTOM_KEYS, ['ShiftRight', 'Shift', 2.75]],
    },
    {
      profile: 'M',
      keys: [
        ['ControlLeft', 'Ctrl', 1.25],
        ['MetaLeft', 'Super', 1.25],
        ['AltLeft', 'Alt', 1.25],
        ['Space', '', 6.25],
        ['AltRight', 'Alt', 1.25],
        ['Fn', 'Fn', 1.25],
        ['ContextMenu', 'Menu', 1.25],
        ['ControlRight', 'Ctrl', 1.25],
      ],
    },
  ],
};
