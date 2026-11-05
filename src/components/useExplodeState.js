import { useEffect, useState } from 'react';
import { explodedView } from '../configurator/ExplodedView.js';

/**
 * The timeline as React state, for controls only. React sees discrete steps to keep
 * the interface from re-rendering on every frame of the animation.
 */
export function useExplodeState() {
  const [state, setState] = useState(explodedView.snapshot);
  useEffect(
    () =>
      explodedView.subscribe((next) => {
        setState((prev) => {
          const close =
            Math.abs(prev.progress - next.progress) < 0.02 &&
            next.progress !== 0 &&
            next.progress !== 1 &&
            prev.playing === next.playing &&
            prev.separation === next.separation &&
            prev.direction === next.direction;
          return close ? prev : next;
        });
      }),
    [],
  );
  return state;
}
