import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { U } from '../layouts/units.js';
import { STACK, caseDimensions } from '../model/assembly.js';
import { CATALOG } from '../catalog/index.js';
import { keycapGlow } from '../materials/MaterialLibrary.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { touch } from './runtime.js';

/** A soft radial spot used for per-key glow and for the spill of light. */
function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

const dummy = new THREE.Object3D();

/**
 * Lighting, drawn as light would actually look on this keyboard. Per-key glow sits
 * above the plate, so it appears through the gaps between keycaps and tints the
 * switch housings. Underglow lights the seam and spills onto the floor, and with a
 * translucent case the whole body lights up. Everything follows the selected mode.
 */
export function LightingEffects({ layout, materials }) {
  const mode = useConfigurator((s) => s.build.lighting.mode);
  const color = useConfigurator((s) => s.build.lighting.color);
  const brightness = useConfigurator((s) => s.build.lighting.brightness);
  const caseId = useConfigurator((s) => s.build.case.id);
  const switchId = useConfigurator((s) => s.build.switchId);

  const texture = useMemo(createGlowTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const glowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [texture],
  );
  useEffect(() => () => glowMaterial.dispose(), [glowMaterial]);

  const plane = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  useEffect(() => () => plane.dispose(), [plane]);

  const ledRef = useRef(null);
  const dims = useMemo(() => caseDimensions(layout), [layout]);
  const caseItem = CATALOG.case.get(caseId);
  const sw = CATALOG.switch.get(switchId);

  useLayoutEffect(() => {
    const mesh = ledRef.current;
    if (!mesh) return;
    for (const key of layout.keys) {
      dummy.position.set(key.cx, 0.6, key.cz);
      dummy.scale.set(key.w * U * 1.28, 1, U * 1.28);
      dummy.updateMatrix();
      mesh.setMatrixAt(key.index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    dummy.scale.set(1, 1, 1);
    touch('full');
  }, [layout, mode]);

  // Translates catalog-level facts into how much light is really visible.
  const housingFactor = sw?.housing.ledWindow ? 1 : 0.32;
  const perKeyLevel = mode === 'per-key' ? brightness * 1.5 * housingFactor : 0;
  const underglowLevel = mode === 'underglow' ? brightness * (caseItem?.transmitsLight ? 1.2 : 0.18) : 0;

  useEffect(() => {
    glowMaterial.color.set(color).multiplyScalar(perKeyLevel);
    keycapGlow.value.set(color).multiplyScalar(perKeyLevel * 1.1);
    materials.led.emissive.set(color);
    materials.led.emissiveIntensity = perKeyLevel * 2.4;
    materials.seam.emissive.set(color);
    materials.seam.emissiveIntensity = underglowLevel * 2.4;
    materials.case.emissive.set(color);
    materials.case.emissiveIntensity = caseItem?.transmitsLight ? underglowLevel * 0.55 : 0;
    touch('full');
  }, [color, perKeyLevel, underglowLevel, glowMaterial, materials, caseItem]);

  const spillMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [texture],
  );
  useEffect(() => () => spillMaterial.dispose(), [spillMaterial]);
  useEffect(() => {
    spillMaterial.color.set(color).multiplyScalar(underglowLevel * 0.9);
    touch('full');
  }, [color, underglowLevel, spillMaterial]);

  return (
    <>
      {mode === 'per-key' ? (
        <instancedMesh
          key={layout.keyCount}
          ref={ledRef}
          args={[plane, glowMaterial, layout.keyCount]}
          frustumCulled={false}
          raycast={() => null}
          dispose={null}
          renderOrder={4}
        />
      ) : null}
      {mode === 'underglow' ? (
        <mesh
          geometry={plane}
          material={spillMaterial}
          position={[0, STACK.pcbTop - 13.5, -dims.openingOffsetZ]}
          scale={[dims.outerW * 1.45, 1, dims.outerD * 2.2]}
          raycast={() => null}
          dispose={null}
          renderOrder={4}
        />
      ) : null}
    </>
  );
}
