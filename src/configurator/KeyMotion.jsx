import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { EXPLODE_LAYERS, STACK, layerOffsets } from '../model/assembly.js';
import { runtime, touch } from './runtime.js';

// Spring constants for a key. Pressing is firm and damped. A release has a slight bounce.
const PRESS = { stiffness: 12000, damping: 200 };
const RELEASE = { stiffness: 3400, damping: 74 };
const DROP = { stiffness: 340, damping: 24 };
/** Longest step the springs can take and stay stable, whatever the frame rate is. */
const MAX_SPRING_STEP = 1 / 480;
const CAPS_OFFSET = EXPLODE_LAYERS.find((l) => l.id === 'keycaps').offset;

/**
 * The one place that moves keys. Every keycap, switch stem and stabilizer stem gets its
 * position from here, so they can't drift apart. Only changed instances are written.
 */
export function KeyMotion() {
  const last = useMemo(() => ({ explode: -1, separation: -1, offsets: null }), []);

  const step = useMemo(() => (rawDelta) => {
    const caps = runtime.parts.caps;
    if (!caps) return;
    // Steps stay short, so springs stay stable after a tab has been in the background.
    const dt = Math.min(rawDelta, 1 / 30);
    const keys = runtime.keys;
    const layout = caps.layout;
    let motion = false;

    const { progress, separation } = runtime.explode;
    const explodeChanged = progress !== last.explode || separation !== last.separation;
    if (explodeChanged) {
      last.explode = progress;
      last.separation = separation;
      const offsets = layerOffsets(progress, separation);
      for (const layer of EXPLODE_LAYERS) {
        // Keycaps move per key in the wave below, and their group stays still.
        const group = layer.id === 'keycaps' ? null : runtime.parts.layers[layer.id];
        if (group) group.position.y = offsets[layer.id];
      }
      last.offsets = offsets;
    }

    const half = layout.widthMM / 2 || 1;
    const stems = runtime.parts.stems;
    const stabStems = runtime.parts.stabStems;
    let stemsDirty = false;
    let stabsDirty = false;

    for (const key of layout.keys) {
      const i = key.index;
      let changed = explodeChanged;

      const target = keys.pressed[i] ? keys.maxTravel : 0;
      const spring = keys.pressed[i] ? PRESS : RELEASE;
      if (keys.travel[i] !== target || keys.velocity[i] !== 0) {
        const steps = Math.max(1, Math.ceil(dt / MAX_SPRING_STEP));
        const h = dt / steps;
        for (let s = 0; s < steps; s += 1) {
          const acc = spring.stiffness * (target - keys.travel[i]) - spring.damping * keys.velocity[i];
          keys.velocity[i] += acc * h;
          keys.travel[i] += keys.velocity[i] * h;
        }
      }
      if (keys.travel[i] > keys.maxTravel) {
        // The housing stops the stem hard at the bottom.
        keys.travel[i] = keys.maxTravel;
        keys.velocity[i] = 0;
      }
      if (keys.travel[i] < -0.25) {
        keys.travel[i] = -0.25;
        keys.velocity[i] = 0;
      }
      const moving = Math.abs(target - keys.travel[i]) > 0.002 || Math.abs(keys.velocity[i]) > 0.02;
      if (moving) {
        changed = true;
        motion = true;
      } else if (keys.travel[i] !== target) {
        keys.travel[i] = target;
        keys.velocity[i] = 0;
        changed = true;
      }

      if (keys.drop[i] !== 0 || keys.dropVelocity[i] !== 0) {
        if (keys.dropDelay[i] > 0) {
          keys.dropDelay[i] -= dt;
        } else {
          const acc = -DROP.stiffness * keys.drop[i] - DROP.damping * keys.dropVelocity[i];
          keys.dropVelocity[i] += acc * dt;
          keys.drop[i] += keys.dropVelocity[i] * dt;
          // A cap can't sink past its seat: it lands and stays.
          if (keys.drop[i] < 0) {
            keys.drop[i] = 0;
            keys.dropVelocity[i] = 0;
          }
          if (Math.abs(keys.drop[i]) < 0.01 && Math.abs(keys.dropVelocity[i]) < 0.05) {
            keys.drop[i] = 0;
            keys.dropVelocity[i] = 0;
          }
        }
        changed = true;
        motion = true;
      }

      const liftDiff = keys.liftTarget[i] - keys.lift[i];
      if (liftDiff !== 0) {
        if (Math.abs(liftDiff) < 0.01) keys.lift[i] = keys.liftTarget[i];
        else {
          keys.lift[i] += liftDiff * (1 - Math.exp(-dt * 18));
          motion = true;
        }
        changed = true;
      }

      if (changed) {
        // Keycaps rise in a wave from one side, rather than as one rigid sheet.
        const delay = ((key.cx + half) / (half * 2)) * 0.14;
        const t = Math.min(1, Math.max(0, (progress - delay) / 0.72));
        const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        const explodeY = CAPS_OFFSET * separation * eased;
        const y = STACK.capRest - keys.travel[i] + keys.drop[i] + keys.lift[i] + explodeY;
        caps.setCapY(i, y);
        if (stems) {
          stems.instanceMatrix.array[i * 16 + 13] = -keys.travel[i];
          stemsDirty = true;
        }
        if (stabStems && key.stabilizer) {
          for (const stemIndex of stabStems.userData.byKey.get(i) ?? []) {
            stabStems.instanceMatrix.array[stemIndex * 16 + 13] = -keys.travel[i];
          }
          stabsDirty = true;
        }
      }
    }

    caps.flushMatrices();
    if (stemsDirty) stems.instanceMatrix.needsUpdate = true;
    if (stabsDirty) stabStems.instanceMatrix.needsUpdate = true;

    if (explodeChanged) {
      caps.syncPicker((key) => {
        const delay = ((key.cx + half) / (half * 2)) * 0.14;
        const t = Math.min(1, Math.max(0, (progress - delay) / 0.72));
        const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        return CAPS_OFFSET * separation * eased;
      });
    }

    const colorsMoving = caps.stepColors(dt);
    if (motion) touch(keys.drop.some((v) => v !== 0) ? 'full' : 'soft');
    else if (colorsMoving) touch('soft');
  }, [last]);

  useFrame((_, delta) => step(delta));

  useEffect(() => {
    // Exports use this to settle parts in a known position without waiting for a frame.
    runtime.stepMotion = () => step(0);
    return () => {
      runtime.stepMotion = null;
    };
  }, [step]);

  return null;
}
