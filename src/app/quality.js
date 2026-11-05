import { useEffect } from 'react';
import { runtime } from '../configurator/runtime.js';
import { useSettings } from '../state/settingsStore.js';

const ORDER = ['high', 'medium', 'low'];

/** A first guess at what a device can handle, before anything has been measured. */
export function initialQuality({ coarsePointer, cores, deviceMemory }) {
  if (coarsePointer) return 'medium';
  if (cores && cores <= 4) return 'medium';
  if (deviceMemory && deviceMemory <= 4) return 'medium';
  return 'high';
}

/** Steps quality down when the moving frame rate stays below this for a while. */
export const SLOW_FRAME_MS = 42;

/**
 * Picks the render level. With automatic quality, it starts from a guess and steps down
 * when real frame times stay slow while the image is changing. It never steps back up
 * on its own, because bouncing between levels looks worse than either one.
 */
export function useAutoQuality() {
  const quality = useSettings((s) => s.quality);

  useEffect(() => {
    if (quality !== 'auto') {
      useSettings.setState({ resolvedQuality: quality });
      return undefined;
    }
    useSettings.setState({
      resolvedQuality: initialQuality({
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        cores: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory,
      }),
    });

    let lastFrames = 0;
    let slowStreak = 0;
    const id = setInterval(() => {
      const frames = runtime.stats.renderedFrames;
      const active = frames - lastFrames;
      lastFrames = frames;
      // Only judge periods with real activity. An idle page has no frame time to measure.
      if (active < 8 || document.hidden) {
        slowStreak = 0;
        return;
      }
      slowStreak = runtime.stats.frameMs > SLOW_FRAME_MS ? slowStreak + 1 : 0;
      if (slowStreak >= 3) {
        slowStreak = 0;
        const current = useSettings.getState().resolvedQuality;
        const next = ORDER[ORDER.indexOf(current) + 1];
        if (next) useSettings.setState({ resolvedQuality: next });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [quality]);
}
