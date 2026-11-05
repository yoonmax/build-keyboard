import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getLayout } from '../layouts/index.js';
import { getBackdrop, getRig, inverseNeutral } from '../materials/LightingPresets.js';
import { walnutTexture } from '../materials/surfaceTextures.js';
import { caseDimensions } from '../model/assembly.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { useSettings } from '../state/settingsStore.js';
import { Accessories } from './Accessories.jsx';
import { CameraController } from './CameraController.jsx';
import { CAMERA_FOV, orbitPosition } from './cameraMath.js';
import { ExplodeOverlay } from './ExplodeOverlay.jsx';
import { KeyMotion } from './KeyMotion.jsx';
import { KeyboardAssembly } from './KeyboardAssembly.jsx';
import { ProgressiveRenderer } from './ProgressiveRenderer.jsx';
import { SelectionOutline } from './SelectionManager.jsx';
import { runtime, touch } from './runtime.js';

const initialCamera = orbitPosition([0, 15, 2], -30, 26, 1100);
const MARK_TARGET = new THREE.Vector3(0, 15, 2);

/** Connects the R3F frame request to the rest of the app. */
function RuntimeBridge() {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    runtime.gl = gl;
    runtime.scene = scene;
    runtime.invalidate = () => invalidate();
    return () => {
      runtime.invalidate = () => {};
    };
  }, [invalidate, gl, scene]);
  useEffect(() => {
    // Keeps refinement honest: any change to the build restarts it.
    return useConfigurator.subscribe(
      (s) => s.build,
      () => touch('full'),
    );
  }, []);
  return null;
}

/** A vertical gradient as the scene background, so it appears in exports too. */
function Backdrop({ backdrop }) {
  const scene = useThree((s) => s.scene);
  const texture = useMemo(() => {
    // Stored in scene-linear values that tone map back to exactly the specified colours.
    const rows = 256;
    const top = new THREE.Color(backdrop.top);
    const bottom = new THREE.Color(backdrop.bottom);
    const data = new Uint16Array(rows * 4);
    for (let i = 0; i < rows; i += 1) {
      const t = i / (rows - 1);
      const [r, g, b] = inverseNeutral([
        bottom.r + (top.r - bottom.r) * t,
        bottom.g + (top.g - bottom.g) * t,
        bottom.b + (top.b - bottom.b) * t,
      ]);
      data[i * 4] = THREE.DataUtils.toHalfFloat(r);
      data[i * 4 + 1] = THREE.DataUtils.toHalfFloat(g);
      data[i * 4 + 2] = THREE.DataUtils.toHalfFloat(b);
      data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
    }
    const t = new THREE.DataTexture(data, 1, rows, THREE.RGBAFormat, THREE.HalfFloatType);
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }, [backdrop]);
  useEffect(() => {
    scene.background = texture;
    touch('full');
    return () => {
      texture.dispose();
    };
  }, [scene, texture]);
  return null;
}

/** The shadow-catching floor, or a real walnut surface in the desk studio. */
function Floor({ backdrop, layoutId }) {
  const dims = useMemo(() => caseDimensions(getLayout(layoutId)), [layoutId]);
  const shadowMaterial = useRef(null);
  // Parts high above the floor throw faint, wide shadows, so the floor shadow fades as they rise.
  useFrame(() => {
    if (shadowMaterial.current) {
      shadowMaterial.current.opacity = backdrop.shadow * (1 - 0.8 * runtime.explode.progress);
    }
  });
  const walnut = useMemo(() => {
    if (backdrop.floor !== 'walnut') return null;
    const map = walnutTexture().clone();
    map.needsUpdate = true;
    map.repeat.set(2.4, 3);
    return map;
  }, [backdrop.floor]);
  useEffect(() => () => walnut?.dispose(), [walnut]);
  return (
    <>
      {walnut ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow raycast={() => null}>
          <circleGeometry args={[3200, 64]} />
          <meshPhysicalMaterial map={walnut} roughness={0.42} clearcoat={0.22} clearcoatRoughness={0.4} />
        </mesh>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow raycast={() => null}>
          <planeGeometry args={[9000, 9000]} />
          <shadowMaterial ref={shadowMaterial} opacity={backdrop.shadow} transparent depthWrite={false} />
        </mesh>
      )}
      {/* Contact shadows ground the case: rendered once per layout, then left alone. */}
      <ContactShadows
        key={`${layoutId}-${backdrop.id}`}
        position={[0, 0.25, -dims.openingOffsetZ]}
        scale={[dims.outerW + 220, dims.outerD + 220]}
        resolution={1024}
        blur={2.2}
        far={42}
        opacity={backdrop.contact}
        frames={1}
        color="#000000"
      />
    </>
  );
}

/**
 * The huge wordmark during the opening. It stands behind the keyboard, always square to
 * the camera and sized to the window, and is hidden by the board wherever they overlap.
 */
function WallMark({ backdrop }) {
  const material = useRef(null);
  const mesh = useRef(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 620;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 2048, 620);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 640px "Hanken Grotesk Variable", "Helvetica Neue", Arial, sans-serif';
    ctx.letterSpacing = '-26px';
    ctx.fillText('BUILD', 1024, 545);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  useEffect(() => {
    runtime.wallMark = {
      /** Shows the wordmark, then lets it go. */
      play(targetOpacity) {
        const m = material.current;
        if (!m) return;
        gsap.killTweensOf(m);
        gsap.fromTo(
          m,
          { opacity: 0 },
          { opacity: targetOpacity, duration: 0.8, ease: 'power2.out', onUpdate: () => touch('full') },
        );
        gsap.to(m, {
          opacity: 0,
          duration: 1.3,
          delay: 1.5,
          ease: 'power2.inOut',
          onUpdate: () => touch('full'),
        });
      },
    };
    return () => {
      runtime.wallMark = null;
    };
  }, []);

  const forward = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m || !material.current) return;
    const visible = material.current.opacity > 0.001;
    m.visible = visible;
    if (!visible) return;
    camera.getWorldDirection(forward);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    const toTarget = camera.position.distanceTo(MARK_TARGET);
    const depth = 520;
    const distance = toTarget + depth;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * distance;
    const width = halfHeight * 2 * (size.width / size.height) * 0.92;
    m.position.copy(MARK_TARGET).addScaledVector(forward, depth).addScaledVector(up, halfHeight * 0.3);
    m.quaternion.copy(camera.quaternion);
    m.scale.set(width, width * (620 / 2048), 1);
  });

  return (
    <mesh ref={mesh} raycast={() => null} renderOrder={-1} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={material}
        alphaMap={texture}
        color={backdrop.wall}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** A softbox set captured into an environment map. Its reflections shape every surface. */
function StudioLighting({ backdrop, rig }) {
  const keyLight = useRef(null);
  const quality = useSettings((s) => s.resolvedQuality);
  const scale = backdrop.envScale ?? 1;

  useLayoutEffect(() => {
    const light = keyLight.current;
    light.userData.softness = rig.key.softness;
    runtime.parts.keyLight = light;
    light.target.position.set(0, 10, 0);
    light.target.updateMatrixWorld();
    light.shadow.camera.left = -520;
    light.shadow.camera.right = 520;
    light.shadow.camera.top = 520;
    light.shadow.camera.bottom = -520;
    light.shadow.camera.near = 100;
    light.shadow.camera.far = 3600;
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.5;
    light.shadow.radius = 5;
    touch('full');
    return () => {
      runtime.parts.keyLight = null;
    };
  }, [rig]);

  const envKey = `${rig.id}-${backdrop.id}`;
  const mapSize = quality === 'high' ? 2048 : 1024;
  return (
    <>
      <directionalLight
        ref={keyLight}
        position={rig.key.position}
        intensity={rig.key.intensity * scale}
        color="#FFF8EF"
        castShadow={quality !== 'low'}
        shadow-mapSize={[mapSize, mapSize]}
      />
      <Environment
        key={envKey}
        frames={1}
        resolution={quality === 'low' ? 256 : 512}
        near={10}
        far={8000}
        environmentIntensity={rig.envIntensity * scale}
      >
        <color attach="background" args={[new THREE.Color(backdrop.envTint).multiplyScalar(rig.ambient)]} />
        {rig.formers.map((former, i) => (
          <Lightformer
            key={i}
            form="rect"
            position={former.position}
            scale={former.scale}
            intensity={former.intensity}
            color={backdrop.envTint}
          />
        ))}
      </Environment>
    </>
  );
}

function SceneContents() {
  const backdropId = useSettings((s) => s.backdrop);
  const rigId = useSettings((s) => s.rig);
  const layoutId = useConfigurator((s) => s.build.layoutId);
  const backdropColor = useSettings((s) => s.backdropColor);
  const backdrop = useMemo(() => {
    const base = getBackdrop(backdropId);
    return backdropColor ? { ...base, top: backdropColor, bottom: backdropColor } : base;
  }, [backdropId, backdropColor]);
  const rig = getRig(rigId);

  useFrame(() => {
    if (runtime.onFirstFrame) {
      const fn = runtime.onFirstFrame;
      runtime.onFirstFrame = null;
      fn();
    }
  });

  return (
    <>
      <RuntimeBridge />
      <Backdrop backdrop={backdrop} />
      <StudioLighting backdrop={backdrop} rig={rig} />
      <WallMark backdrop={backdrop} />
      <Floor backdrop={backdrop} layoutId={layoutId} />
      <KeyboardAssembly />
      <Accessories />
      <SelectionOutline />
      <ExplodeOverlay />
      <KeyMotion />
      <CameraController />
      <ProgressiveRenderer />
    </>
  );
}

/** The main canvas. Rendering runs on demand: when nothing changes, the GPU stays idle. */
export function KeyboardScene({ onUnsupported }) {
  const quality = useSettings((s) => s.resolvedQuality);
  const dprRange = quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : [1, 1];

  return (
    <Canvas
      className="scene-canvas"
      frameloop="demand"
      dpr={dprRange}
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{ fov: CAMERA_FOV, near: 20, far: 12000, position: initialCamera }}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
        preserveDrawingBuffer: false,
      }}
      onCreated={({ gl }) => {
        // Off-screen passes such as contact shadows rely on a transparent clear.
        gl.setClearColor(0x000000, 0);
        const canvas = gl.domElement;
        canvas.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          onUnsupported?.('The graphics context was lost. Reload the page to continue.');
        });
      }}
      onPointerMissed={() => {
        if (!runtime.tester?.active) useConfigurator.getState().clearSelection();
      }}
    >
      <Suspense fallback={null}>
        <SceneContents />
      </Suspense>
    </Canvas>
  );
}
