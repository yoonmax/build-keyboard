import { KEYCAP_THEMES } from './keycaps.js';
import { applyTheme, createDefaultBuild, setOption } from '../model/build.js';

function compose(name, steps, themeId, tweak) {
  let build = createDefaultBuild();
  for (const [category, id] of steps) build = setOption(build, category, id);
  build = applyTheme(build, KEYCAP_THEMES.find((t) => t.id === themeId));
  build.name = name;
  tweak?.(build);
  return build;
}

/**
 * Curated builds shown in the gallery. Every one is a valid configuration, and the
 * pictures are real renders made by scripts/capture-starters.mjs.
 */
export const STARTER_BUILDS = [
  {
    id: 'starter-graphite-75',
    image: '/starters/graphite-75.webp',
    build: compose(
      'Studio Graphite',
      [['layout', '75'], ['caseColor', 'black'], ['switch', 'sw-keel'], ['finish', 'matte']],
      'graphite',
    ),
  },
  {
    id: 'starter-matcha-65',
    image: '/starters/matcha-65.webp',
    build: compose(
      'Matcha Sixty-Five',
      [['layout', '65'], ['case', 'case-painted'], ['caseColor', 'sage'], ['plate', 'plate-polycarbonate'], ['switch', 'sw-ridge']],
      'matcha',
    ),
  },
  {
    id: 'starter-retro-tkl',
    image: '/starters/retro-tkl.webp',
    build: compose(
      'Office Retro',
      [['layout', 'tkl'], ['case', 'case-painted'], ['caseColor', 'white'], ['switch', 'sw-latch'], ['plate', 'plate-fr4'], ['accessory', 'acc-tools']],
      'retro',
    ),
  },
  {
    id: 'starter-ice-60',
    image: '/starters/ice-60.webp',
    build: compose(
      'Frosted Ice',
      [['layout', '60'], ['case', 'case-frosted'], ['caseColor', 'navy'], ['plate', 'plate-polycarbonate'], ['switch', 'sw-drift'], ['keycaps', 'caps-uniform']],
      'ice',
    ),
  },
  {
    id: 'starter-cream-75',
    image: '/starters/cream-75.webp',
    build: compose(
      'Champagne Cream',
      [['layout', '75'], ['caseColor', 'champagne'], ['finish', 'brushed'], ['switch', 'sw-drift']],
      'cream',
    ),
  },
];
