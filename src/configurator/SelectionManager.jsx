import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getBackdrop } from '../materials/LightingPresets.js';
import { createOutlineMaterial } from '../materials/MaterialLibrary.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { useSettings } from '../state/settingsStore.js';
import { runtime, touch } from './runtime.js';

/**
 * Selection highlight for whole layers: a thin outline drawn by pushing each mesh out
 * along its normals, using back faces only. Costs one extra draw per selected mesh.
 * Keys get their own highlight in the keycap shader.
 */
export function SelectionOutline() {
  const selection = useConfigurator((s) => s.ui.selection);
  const backdropId = useSettings((s) => s.backdrop);
  const material = useMemo(() => {
    const m = createOutlineMaterial();
    m.defines = { USE_OUTLINE: 1 };
    m.vertexShader = `
      uniform float uWidth;
      void main() {
        vec3 p = position + normalize(normal) * uWidth;
        #ifdef USE_INSTANCING
          vec4 world = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        #else
          vec4 world = modelViewMatrix * vec4(p, 1.0);
        #endif
        gl_Position = projectionMatrix * world;
      }`;
    return m;
  }, []);

  useEffect(() => {
    const dark = getBackdrop(backdropId).uiTone === 'dark';
    material.uniforms.uColor.value.set(dark ? '#F2F0EC' : '#141517');
    touch('soft');
  }, [backdropId, material]);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const group = runtime.parts.layers[selection.kind === 'layer' ? selection.layerId : ''];
    const clones = [];
    if (group) {
      // Collected first: adding children during traverse would visit the clones too.
      const meshes = [];
      group.traverse((object) => {
        if (!object.isMesh || object.userData.noOutline) return;
        if (object.material?.colorWrite === false) return;
        meshes.push(object);
      });
      for (const object of meshes) {
        let clone;
        if (object.isInstancedMesh) {
          clone = new THREE.InstancedMesh(object.geometry, material, object.count);
          clone.instanceMatrix = object.instanceMatrix;
          clone.frustumCulled = false;
        } else {
          clone = new THREE.Mesh(object.geometry, material);
        }
        clone.raycast = () => {};
        clone.castShadow = false;
        clone.receiveShadow = false;
        object.add(clone);
        clones.push(clone);
      }
    }
    touch('full');
    return () => {
      for (const clone of clones) {
        clone.parent?.remove(clone);
        if (clone.isInstancedMesh) clone.dispose();
      }
      touch('full');
    };
  }, [selection, material]);

  return null;
}

/** Scene position to move the camera toward for a given layer. */
export function layerFocusPoint(layerId) {
  const group = runtime.parts.layers[layerId];
  if (!group) return null;
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return null;
  const center = new THREE.Vector3();
  box.getCenter(center);
  return { point: center.toArray(), size: box.getSize(new THREE.Vector3()).toArray() };
}

/** World position of a key's top face, including exploded offsets. */
export function keyFocusPoint(key) {
  const caps = runtime.parts.caps;
  if (!caps) return null;
  const point = new THREE.Vector3(key.cx, 14, key.cz);
  caps.group.updateWorldMatrix(true, false);
  caps.group.localToWorld(point);
  return point.toArray();
}
