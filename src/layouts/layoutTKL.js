import { FUNCTION_KEYS, HOME_KEYS, LETTER_BOTTOM_KEYS, NUMBER_KEYS, TOP_KEYS } from './blocks.js';

const [F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12] = FUNCTION_KEYS;

/** Tenkeyless ANSI: 87 keys in the classic spaced arrangement, with a separated navigation block. */
export const layoutTKL = {
  id: 'tkl',
  name: 'TKL',
  fullName: 'Tenkeyless ANSI',
  standard: 'ANSI',
  expectedKeyCount: 87,
  blurb: 'A full keyboard without the number pad. Separate navigation and arrow clusters.',
  rows: [
    {
      profile: 'F',
      gapAfter: 0.5,
      keys: [
        ['Escape', 'Esc', 1],
        1,
        F1,
        F2,
        F3,
        F4,
        0.5,
        F5,
        F6,
        F7,
        F8,
        0.5,
        F9,
        F10,
        F11,
        F12,
        0.25,
        ['PrintScreen', 'PrtSc', 1],
        ['ScrollLock', 'ScrLk', 1],
        ['Pause', 'Pause', 1],
      ],
    },
    {
      profile: 'N',
      keys: [...NUMBER_KEYS, 0.25, ['Insert', 'Ins', 1], ['Home', 'Home', 1], ['PageUp', 'PgUp', 1]],
    },
    {
      profile: 'T',
      keys: [...TOP_KEYS, 0.25, ['Delete', 'Del', 1], ['End', 'End', 1], ['PageDown', 'PgDn', 1]],
    },
    { profile: 'H', keys: HOME_KEYS },
    {
      profile: 'B',
      keys: [
        ['ShiftLeft', 'Shift', 2.25],
        ...LETTER_BOTTOM_KEYS,
        ['ShiftRight', 'Shift', 2.75],
        1.25,
        ['ArrowUp', '↑', 1],
      ],
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
        0.25,
        ['ArrowLeft', '←', 1],
        ['ArrowDown', '↓', 1],
        ['ArrowRight', '→', 1],
      ],
    },
  ],
};
