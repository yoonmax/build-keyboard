import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getLayout } from '../layouts/index.js';
import { getBackdrop } from '../materials/LightingPresets.js';
import { EXPLODE_LAYERS, STACK, caseDimensions, deskPlacement, layerOffsets } from '../model/assembly.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { useSettings } from '../state/settingsStore.js';
import { inspectLayer } from '../app/actions.js';
import { explodedView } from './ExplodedView.js';
import { runtime } from './runtime.js';

/** Height of each layer's reference plane in the assembly frame. */
const LAYER_Y = {
  keycaps: STACK.capRest + 6,
  upperCase: STACK.frameTop - 1,
  switches: 3,
  stabilizers: 0,
  plate: -0.5,
  plateFoam: -2,
  pcb: STACK.pcbTop,
  caseFoam: STACK.pcbTop - 5,
  lowerCase: STACK.seam,
};

/**
 * Fine assembly lines at the four corners and one leader line and label per layer.
 * Every label names a part that exists in this build: foam only appears if it was chosen.
 */
export function ExplodeOverlay() {
  const layoutId = useConfigurator((s) => s.build.layoutId);
  const hasFoam = useConfigurator((s) => s.build.accessories.includes('acc-foam'));
  const backdropId = useSettings((s) => s.backdrop);
  const selection = useConfigurator((s) => s.ui.selection);
  const [visible, setVisible] = useState(false);
  const labelRefs = useRef({});

  const layout = getLayout(layoutId);
  const dims = useMemo(() => caseDimensions(layout), [layout]);
  const placement = useMemo(() => deskPlacement(dims.outerD, -dims.openingOffsetZ), [dims]);
  const layers = useMemo(
    () => EXPLODE_LAYERS.filter((l) => hasFoam || (l.id !== 'plateFoam' && l.id !== 'caseFoam')),
    [hasFoam],
  );

  const dark = getBackdrop(backdropId).uiTone === 'dark';
  const lineColor = dark ? '#F2F0EC' : '#141517';

  // Corner rails, drawn once. Their top rises with the stack.
  const rails = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 2 * 3), 3));
    const material = new THREE.LineDashedMaterial({
      color: lineColor,
      transparent: true,
      opacity: 0.32,
      dashSize: 3,
      gapSize: 3.5,
      depthWrite: false,
    });
    const object = new THREE.LineSegments(geometry, material);
    object.frustumCulled = false;
    object.raycast = () => {};
    return object;
  }, [lineColor]);

  const leaders = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(layers.length * 2 * 3), 3));
    const material = new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: 0.55, depthWrite: false });
    const object = new THREE.LineSegments(geometry, material);
    object.frustumCulled = false;
    object.raycast = () => {};
    return object;
  }, [layers, lineColor]);

  useEffect(
    () => () => {
      rails.geometry.dispose();
      rails.material.dispose();
      leaders.geometry.dispose();
      leaders.material.dispose();
    },
    [rails, leaders],
  );

  useEffect(() => explodedView.subscribe((s) => setVisible(s.progress > 0.02)), []);

  const anchorX = dims.pcbW / 2 + 4;
  const labelX = dims.outerW / 2 + 42;
  const anchors = useRef({});

  useFrame(() => {
    const { progress, separation } = runtime.explode;
    if (progress <= 0.02) {
      rails.visible = false;
      leaders.visible = false;
      return;
    }
    rails.visible = true;
    leaders.visible = true;
    const offsets = layerOffsets(progress, separation);
    const top = offsets.keycaps + LAYER_Y.keycaps;
    const bottom = LAYER_Y.lowerCase;

    const hw = dims.pcbW / 2 - 2;
    const hd = dims.pcbD / 2 - 2;
    const positions = rails.geometry.attributes.position;
    [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].forEach(([x, z], i) => {
      positions.setXYZ(i * 2, x, bottom, z);
      positions.setXYZ(i * 2 + 1, x, top, z);
    });
    positions.needsUpdate = true;
    rails.computeLineDistances();

    const leader = leaders.geometry.attributes.position;
    layers.forEach((layer, i) => {
      const y = LAYER_Y[layer.id] + offsets[layer.id];
      leader.setXYZ(i * 2, anchorX, y, 0);
      leader.setXYZ(i * 2 + 1, labelX, y, 0);
      const label = labelRefs.current[layer.id];
      if (label) label.position.set(labelX + 3, y, 0);
    });
    leader.needsUpdate = true;

    const opacity = Math.min(1, (progress - 0.3) / 0.4);
    rails.material.opacity = Math.max(0, opacity) * 0.32;
    leaders.material.opacity = Math.max(0, opacity) * 0.55;
    anchors.current.opacity = opacity;
  });

  const selectedId = selection.kind === 'layer' ? selection.layerId : null;

  return (
    <group rotation={[placement.tiltRad, 0, 0]} position={[0, placement.lift + 1.6, 0]}>
      <primitive object={rails} />
      <primitive object={leaders} />
      {layers.map((layer) => (
        <group key={layer.id} ref={(node) => (labelRefs.current[layer.id] = node)}>
          {visible ? (
            <Html center={false} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
              <button
                type="button"
                className="explode-label"
                data-selected={selectedId === layer.id || undefined}
                data-dark={dark || undefined}
                style={{ pointerEvents: 'auto' }}
                onClick={() => inspectLayer(layer.id)}
                aria-label={`Inspect ${layer.name}`}
              >
                {layer.name}
              </button>
            </Html>
          ) : null}
        </group>
      ))}
    </group>
  );
}
