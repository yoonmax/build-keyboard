import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { getLayout } from '../layouts/index.js';
import { EXPLODE_LAYERS, caseDimensions } from '../model/assembly.js';
import { useConfigurator } from '../state/configuratorStore.js';
import {
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_VIEWS,
  clampTarget,
  fitDistance,
  orbitFromPosition,
  orbitPosition,
  resolveCameraCollision,
  shortestAzimuth,
} from './cameraMath.js';
import { runtime, touch } from './runtime.js';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The product's size and centre in world space for the current layout. */
export function productBox(layoutId) {
  const layout = getLayout(layoutId);
  const d = caseDimensions(layout);
  return { w: d.outerW, d: d.outerD + 10, h: 36, center: [0, 15, 2] };
}

/** How much of the viewport remains between the panels. */
export function viewportFractions(size) {
  const panels = runtime.view.panels ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const width = Math.max(0.3, (size.width - panels.left - panels.right) / size.width);
  const height = Math.max(0.3, (size.height - panels.top - panels.bottom) / size.height);
  return { widthFraction: width, heightFraction: height };
}

/**
 * Owns the camera: orbit input, animated moves between views, and limits. The moves
 * tween orbit angles, not positions, so the camera arcs around the keyboard rather
 * than cutting through it.
 */
export function CameraController() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useRef(null);
  const tween = useRef(null);
  const userView = useRef('hero');

  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return undefined;

    const animateTo = ({ target, azimuth, elevation, distance, duration = 1.15, ease = 'power3.inOut', onComplete }) => {
      tween.current?.kill();
      const position = camera.position.toArray();
      const from = orbitFromPosition(position, orbit.target.toArray());
      const state = {
        tx: orbit.target.x,
        ty: orbit.target.y,
        tz: orbit.target.z,
        azimuth: from.azimuth,
        elevation: from.elevation,
        distance: from.distance,
      };
      const apply = () => {
        orbit.target.set(state.tx, state.ty, state.tz);
        camera.position.fromArray(
          orbitPosition([state.tx, state.ty, state.tz], state.azimuth, state.elevation, state.distance),
        );
        camera.lookAt(orbit.target);
        camera.updateMatrixWorld();
        touch('full');
      };
      const goal = {
        tx: target[0],
        ty: target[1],
        tz: target[2],
        azimuth: shortestAzimuth(from.azimuth, azimuth),
        elevation,
        distance,
      };
      if (reduceMotion() || duration === 0) {
        Object.assign(state, goal);
        apply();
        orbit.update();
        onComplete?.();
        return;
      }
      orbit.enabled = false;
      tween.current = gsap.to(state, {
        ...goal,
        duration,
        ease,
        onUpdate: apply,
        onComplete: () => {
          orbit.enabled = true;
          orbit.update();
          onComplete?.();
        },
      });
    };

    /** Moves to a named view. */
    const goTo = (viewId, options = {}) => {
      const view = CAMERA_VIEWS[viewId];
      if (!view) return;
      userView.current = viewId;
      const { build } = useConfigurator.getState();
      const box = productBox(build.layoutId);
      const fractions = viewportFractions(size);
      const offset = view.targetOffset ?? [0, 0, 0];
      const target = [
        box.center[0] + offset[0] * box.w,
        box.center[1] + offset[1],
        box.center[2] + offset[2] * box.d,
      ];
      const distance = fitDistance(box, view, { aspect: size.width / size.height, ...fractions });
      animateTo({
        target,
        azimuth: view.azimuth,
        elevation: view.elevation,
        distance: Math.max(CAMERA_MIN_DISTANCE, distance),
        ...options,
      });
    };

    /** Frames the whole exploded stack at the current separation. */
    const frameExploded = (options = {}) => {
      const { build } = useConfigurator.getState();
      const box = productBox(build.layoutId);
      const top = EXPLODE_LAYERS[0].offset * runtime.explode.separation + 60;
      const view = { azimuth: -33, elevation: 17, margin: 1.05 };
      const fractions = viewportFractions(size);
      const distance = fitDistance({ ...box, h: top }, view, { aspect: size.width / size.height, ...fractions });
      animateTo({
        target: [0, top * 0.46, 0],
        azimuth: view.azimuth,
        elevation: view.elevation,
        distance,
        duration: 1.6,
        ...options,
      });
    };

    /** Moves in on a point, keeping the current viewing direction. */
    const focusOn = (point, { distance = 300, azimuth, elevation, duration = 1.0 } = {}) => {
      const from = orbitFromPosition(camera.position.toArray(), orbit.target.toArray());
      animateTo({
        target: point,
        azimuth: azimuth ?? from.azimuth,
        elevation: elevation ?? Math.max(from.elevation, 14),
        distance,
        duration,
      });
    };

    /** Moves from wherever it is to the view, more slowly: the opening shot. */
    const intro = () => {
      const { build } = useConfigurator.getState();
      const box = productBox(build.layoutId);
      const view = CAMERA_VIEWS.hero;
      const fractions = viewportFractions(size);
      const distance = fitDistance(box, view, { aspect: size.width / size.height, ...fractions });
      if (reduceMotion()) {
        goTo('hero', { duration: 0 });
        return;
      }
      camera.position.fromArray(orbitPosition(box.center, view.azimuth - 16, view.elevation + 6, distance * 1.24));
      orbit.target.fromArray(box.center);
      camera.lookAt(orbit.target);
      orbit.update();
      goTo('hero', { duration: 2.6, ease: 'power3.out' });
    };

    /** Places the camera immediately, as used by automation and thumbnails. */
    const place = (viewId) => goTo(viewId, { duration: 0 });

    /** A copy of the camera at a named view, for off-screen rendering. */
    const virtualCamera = (viewId, { aspect, build, fit = 1 }) => {
      const view = CAMERA_VIEWS[viewId] ?? CAMERA_VIEWS.hero;
      const box = productBox((build ?? useConfigurator.getState().build).layoutId);
      const offset = view.targetOffset ?? [0, 0, 0];
      const target = [
        box.center[0] + offset[0] * box.w,
        box.center[1] + offset[1],
        box.center[2] + offset[2] * box.d,
      ];
      const distance = Math.max(
        CAMERA_MIN_DISTANCE,
        fitDistance(box, view, { aspect, widthFraction: 0.86, heightFraction: 0.82 }) * fit,
      );
      const cam = camera.clone();
      cam.view = null;
      cam.aspect = aspect;
      cam.position.fromArray(orbitPosition(target, view.azimuth, view.elevation, distance));
      cam.lookAt(...target);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      return { camera: cam, distance, target };
    };

    /** A copy of the camera where it is now, at another aspect ratio, for off-screen rendering. */
    const currentCamera = (aspect) => {
      const cam = camera.clone();
      cam.view = null;
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      return cam;
    };

    runtime.camera = {
      goTo,
      focusOn,
      frameExploded,
      intro,
      place,
      animateTo,
      virtualCamera,
      currentCamera,
      current: () => userView.current,
      /** Screen position of a point on the keyboard, in the assembly frame. */
      projectLocal(x, y, z) {
        const group = runtime.parts.layers.lowerCase;
        const point = new Vector3(x, y, z);
        group.parent.updateWorldMatrix(true, false);
        group.parent.localToWorld(point);
        point.project(camera);
        return {
          x: ((point.x + 1) / 2) * size.width,
          y: ((1 - point.y) / 2) * size.height,
        };
      },
      position: () => camera.position.toArray(),
      distance: () => camera.position.distanceTo(orbit.target),
    };

    // A new layout has a new size, so a preset view is framed again to fit it.
    const unsubscribe = useConfigurator.subscribe(
      (s) => s.build.layoutId,
      () => {
        if (runtime.explode.progress > 0.01) frameExploded({ duration: 1.0 });
        else goTo(userView.current ?? 'hero', { duration: 0.9 });
      },
    );
    // Hiding the panels gives the product the whole window, so a preset view fills it.
    const unsubscribePanels = useConfigurator.subscribe(
      (s) => s.ui.cinematic,
      () => {
        if (userView.current && runtime.explode.progress < 0.01) {
          requestAnimationFrame(() => goTo(userView.current, { duration: 0.9 }));
        }
      },
    );

    return () => {
      unsubscribe();
      unsubscribePanels();
      tween.current?.kill();
      runtime.camera = null;
    };
  }, [camera, size]);

  useFrame(() => {
    const orbit = controls.current;
    if (!orbit || !orbit.enabled) return;
    // The explode stack raises what the camera has to avoid, so limits follow it.
    const { build } = useConfigurator.getState();
    const box = productBox(build.layoutId);
    const halfW = box.w / 2;
    const halfD = box.d / 2;
    const stackTop = 26 + EXPLODE_LAYERS[0].offset * runtime.explode.separation * runtime.explode.progress;
    const limits = {
      min: [-halfW, 0, box.center[2] - halfD],
      max: [halfW, stackTop, box.center[2] + halfD],
    };
    const target = orbit.target.toArray();
    const clamped = clampTarget(target, limits);
    if (clamped[0] !== target[0] || clamped[1] !== target[1] || clamped[2] !== target[2]) {
      orbit.target.fromArray(clamped);
      touch('full');
    }
    const { position, moved } = resolveCameraCollision(camera.position.toArray(), limits);
    if (moved) {
      camera.position.fromArray(position);
      camera.lookAt(orbit.target);
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.62}
      zoomSpeed={0.72}
      panSpeed={0.8}
      minDistance={CAMERA_MIN_DISTANCE}
      maxDistance={CAMERA_MAX_DISTANCE}
      minPolarAngle={0}
      maxPolarAngle={Math.PI / 2 - 0.012}
      onChange={() => touch('full')}
      onStart={() => {
        // Once someone orbits by hand, automatic reframing leaves the camera alone.
        userView.current = null;
      }}
    />
  );
}

