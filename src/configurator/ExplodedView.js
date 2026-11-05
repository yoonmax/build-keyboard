import gsap from 'gsap';
import { runtime, touch } from './runtime.js';

const DURATION = 2.4;

/**
 * The explode timeline runs a single value from 0 (assembled) to 1 (fully exploded).
 * layerOffsets() in src/model/assembly.js turns that value into a position per layer.
 * A single tween means play, pause, reverse and scrubbing are all the same operation.
 */
let timeline = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(snapshot());
}

function snapshot() {
  return {
    progress: runtime.explode.progress,
    separation: runtime.explode.separation,
    playing: timeline ? timeline.isActive() : false,
    direction: timeline ? (timeline.reversed() ? 'assemble' : 'explode') : 'idle',
  };
}

function ensureTimeline() {
  if (timeline) return timeline;
  timeline = gsap.timeline({
    paused: true,
    onUpdate() {
      touch('full');
      notify();
    },
    onComplete: notify,
    onReverseComplete: notify,
  });
  timeline.fromTo(runtime.explode, { progress: 0 }, { progress: 1, duration: DURATION, ease: 'none' });
  return timeline;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const explodedView = {
  explode() {
    const tl = ensureTimeline();
    if (reduced()) {
      tl.progress(1).pause();
      touch('full');
      notify();
      return;
    }
    tl.timeScale(1).play();
    notify();
  },
  assemble() {
    const tl = ensureTimeline();
    if (reduced()) {
      tl.progress(0).pause();
      touch('full');
      notify();
      return;
    }
    tl.timeScale(1.25).reverse();
    notify();
  },
  /** Pauses or continues in whichever direction the timeline was last going. */
  togglePause() {
    const tl = ensureTimeline();
    tl.paused(!tl.paused());
    notify();
  },
  /** Moves the timeline to a position by hand. */
  scrub(value) {
    const tl = ensureTimeline();
    tl.pause();
    tl.progress(value);
    touch('full');
    notify();
  },
  setSeparation(value) {
    runtime.explode.separation = value;
    touch('full');
    notify();
  },
  isOpen() {
    return runtime.explode.progress > 0.001;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  snapshot,
};
