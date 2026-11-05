/**
 * Reusable ANSI key rows. A key entry is written as [code, legend, widthU, shiftedLegend].
 * `code` doubles as the key's stable identifier and matches KeyboardEvent.code wherever
 * such a code exists, which lets the tester map a physical key to the model directly.
 * A number entry is a gap in keyboard units.
 */

const LETTER = (c) => [`Key${c}`, c, 1];
const DIGIT = (d, shifted) => [`Digit${d}`, String(d), 1, shifted];

export const NUMBER_KEYS = [
  ['Backquote', '`', 1, '~'],
  DIGIT(1, '!'),
  DIGIT(2, '@'),
  DIGIT(3, '#'),
  DIGIT(4, '$'),
  DIGIT(5, '%'),
  DIGIT(6, '^'),
  DIGIT(7, '&'),
  DIGIT(8, '*'),
  DIGIT(9, '('),
  DIGIT(0, ')'),
  ['Minus', '-', 1, '_'],
  ['Equal', '=', 1, '+'],
  ['Backspace', 'Backspace', 2],
];

export const TOP_KEYS = [
  ['Tab', 'Tab', 1.5],
  ...'QWERTYUIOP'.split('').map(LETTER),
  ['BracketLeft', '[', 1, '{'],
  ['BracketRight', ']', 1, '}'],
  ['Backslash', '\\', 1.5, '|'],
];

export const HOME_KEYS = [
  ['CapsLock', 'Caps', 1.75],
  ...'ASDFGHJKL'.split('').map(LETTER),
  ['Semicolon', ';', 1, ':'],
  ['Quote', "'", 1, '"'],
  ['Enter', 'Enter', 2.25],
];

export const LETTER_BOTTOM_KEYS = [
  ...'ZXCVBNM'.split('').map(LETTER),
  ['Comma', ',', 1, '<'],
  ['Period', '.', 1, '>'],
  ['Slash', '/', 1, '?'],
];

export const FUNCTION_KEYS = Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`, 1]);

/**
 * Classifies a key for grouping, row profile and theme colouring.
 * @param {string} code
 * @returns {'function'|'number'|'alpha'|'modifier'|'navigation'|'space'}
 */
export function clusterFor(code) {
  if (/^F\d+$/.test(code)) return 'function';
  if (code === 'Space') return 'space';
  if (/^Digit\d$/.test(code) || code === 'Backquote' || code === 'Minus' || code === 'Equal') return 'number';
  if (/^Key[A-Z]$/.test(code)) return 'alpha';
  if (['BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash'].includes(code)) {
    return 'alpha';
  }
  if (
    /^Arrow/.test(code) ||
    ['Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'PrintScreen', 'ScrollLock', 'Pause'].includes(code)
  ) {
    return 'navigation';
  }
  return 'modifier';
}
