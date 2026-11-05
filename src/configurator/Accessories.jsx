import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { sweepRects } from '../geometry/sweep.js';
import { usbPortCenter } from '../geometry/CaseGeometry.js';
import { getLayout } from '../layouts/index.js';
import { walnutTexture } from '../materials/surfaceTextures.js';
import { caseDimensions, deskPlacement } from '../model/assembly.js';
import { caseHex } from '../model/build.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { touch } from './runtime.js';

/** A wrist rest cut to the board's width, with a soft top edge. */
function WristRest({ layout }) {
  const dims = useMemo(() => caseDimensions(layout), [layout]);
  const geometry = useMemo(() => {
    const w = dims.outerW;
    const d = 82;
    const h = 16;
    const rect = (inset) => ({ w: w - inset * 2, d: d - inset * 2, r: Math.max(0.5, 9 - inset) });
    return sweepRects(
      [
        { rect: rect(0.4), y: 0 },
        { rect: rect(0), y: 0.5 },
        { rect: rect(0), y: h - 3.2 },
        { rect: rect(0.3), y: h - 1.7 },
        { rect: rect(1.1), y: h - 0.6 },
        { rect: rect(2.4), y: h },
      ],
      { seg: 10, uvScale: 340, fanEnd: [0, h, 0], fanStart: [0, 0, 0] },
    );
  }, [dims]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => {
    const map = walnutTexture();
    return new THREE.MeshPhysicalMaterial({ map, roughness: 0.46, clearcoat: 0.2, clearcoatRoughness: 0.5 });
  }, []);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, 0.2, dims.outerD / 2 - dims.openingOffsetZ + 41 + 26]}
      castShadow
      receiveShadow
      raycast={() => null}
    />
  );
}

/** A coiled cable running from the port across the desk. */
function CoiledCable({ layout, color }) {
  const dims = useMemo(() => caseDimensions(layout), [layout]);
  const { cable, boot, material, metal } = useMemo(() => {
    const { tiltRad, lift } = deskPlacement(dims.outerD, -dims.openingOffsetZ);
    const port = usbPortCenter(layout);
    const start = new THREE.Vector3(port.x, port.y, port.z)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), tiltRad)
      .add(new THREE.Vector3(0, lift + 1.6, 0));

    const LENGTH = 2400;
    class CablePath extends THREE.Curve {
      getPoint(t, target = new THREE.Vector3()) {
        // A short run out of the port, a coil section, then a long tail out of frame.
        const s = t * LENGTH;
        const z = start.z - 12 - s;
        const drop = Math.min(1, s / 150);
        const y = THREE.MathUtils.lerp(start.y, 2.4, drop * drop * (3 - 2 * drop));
        const x = start.x - Math.sin(Math.min(1, s / 700) * Math.PI) * 36 + Math.max(0, s - 700) * 0.12;
        const coil = THREE.MathUtils.smoothstep(s, 150, 180) * (1 - THREE.MathUtils.smoothstep(s, 370, 400));
        const a = (s / 6.2) * Math.PI * 2;
        return target.set(x + Math.cos(a) * 4.4 * coil, y + (Math.sin(a) + 1.1) * 4.4 * coil, z);
      }
    }
    const tube = new THREE.TubeGeometry(new CablePath(), 2200, 1.45, 7, false);
    const housing = sweepRects(
      [
        { rect: { w: 11, d: 6.2, r: 3 }, y: 0 },
        { rect: { w: 11, d: 6.2, r: 3 }, y: 14 },
        { rect: { w: 8, d: 5, r: 2.4 }, y: 18 },
      ],
      { seg: 6, fanStart: [0, 0, 0], fanEnd: [0, 18, 0], uvScale: 40 },
    );
    housing.rotateX(-Math.PI / 2);
    housing.rotateX(tiltRad);
    housing.translate(start.x, start.y, start.z);
    return {
      cable: tube,
      boot: housing,
      material: new THREE.MeshStandardMaterial({ roughness: 0.58 }),
      metal: new THREE.MeshStandardMaterial({ color: '#B6B8BA', metalness: 1, roughness: 0.32 }),
    };
  }, [layout, dims]);

  useEffect(() => {
    material.color.set(color);
    touch('full');
  }, [material, color]);
  useEffect(
    () => () => {
      cable.dispose();
      boot.dispose();
      material.dispose();
      metal.dispose();
    },
    [cable, boot, material, metal],
  );

  return (
    <group>
      <mesh geometry={cable} material={material} castShadow receiveShadow raycast={() => null} />
      <mesh geometry={boot} material={metal} castShadow receiveShadow raycast={() => null} />
    </group>
  );
}

/** Accessories that have a physical presence in the scene. */
export function Accessories() {
  const accessories = useConfigurator((s) => s.build.accessories);
  const layoutId = useConfigurator((s) => s.build.layoutId);
  const buildCase = useConfigurator((s) => s.build.case);
  const layout = getLayout(layoutId);
  return (
    <>
      {accessories.includes('acc-wrist') ? <WristRest layout={layout} /> : null}
      {accessories.includes('acc-cable') ? <CoiledCable layout={layout} color={caseHex(buildCase)} /> : null}
    </>
  );
}
