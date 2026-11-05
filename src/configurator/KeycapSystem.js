import * as THREE from 'three';
import { KEYCAP_MATERIALS } from '../catalog/index.js';
import { buildKeycapGeometry, keycapGeometryKey } from '../geometry/KeycapGeometry.js';
import { atlasEntryFor, legendBox } from '../geometry/LegendAtlas.js';
import { STACK } from '../model/assembly.js';
import { resolveKeyStyle } from '../model/build.js';

/** Shared across layouts, because the same key shape appears on all of them. */
const geometryCache = new Map();

function geometryFor(widthU, rowKey, profileId) {
  const id = keycapGeometryKey(widthU, rowKey, profileId);
  if (!geometryCache.has(id)) {
    geometryCache.set(id, buildKeycapGeometry({ widthU, rowKey, profileId }));
  }
  return geometryCache.get(id);
}

const color = new THREE.Color();
const matrix = new THREE.Matrix4();

/**
 * All keycaps for one layout, profile and material. Keys sharing a shape share an
 * InstancedMesh, so a board with 84 keys uses about 20 draw calls and one shader.
 *
 * Colours are written straight into instance attributes and can animate without
 * touching React or creating anything. An invisible box per key handles picking,
 * so a pointer test costs a dozen triangles per key instead of hundreds.
 */
export class KeycapSystem {
  /**
   * @param {object} layout
   * @param {string} profileId
   * @param {{entries:Map}} atlas
   * @param {THREE.Material} material
   */
  constructor(layout, profileId, atlas, material) {
    this.layout = layout;
    this.profileId = profileId;
    this.atlas = atlas;
    this.material = material;
    this.group = new THREE.Group();
    this.group.name = 'keycaps';
    /** key index → [bucket, instance] */
    this.lookup = new Array(layout.keyCount);
    this.buckets = [];
    this.colorCurrent = new Float32Array(layout.keyCount * 3);
    this.colorTarget = new Float32Array(layout.keyCount * 3);
    this.colorDelay = new Float32Array(layout.keyCount);
    this.colorActive = false;
    this.#build();
    this.#buildPicker();
  }

  #build() {
    const groups = new Map();
    for (const key of this.layout.keys) {
      const id = keycapGeometryKey(key.w, key.profile, this.profileId);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(key);
    }
    for (const keys of groups.values()) {
      const geometry = geometryFor(keys[0].w, keys[0].profile, this.profileId);
      const count = keys.length;
      const mesh = new THREE.InstancedMesh(geometry, this.material, count);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const attrs = {
        rect: new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4),
        box: new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4),
        legend: new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3),
        surface: new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3),
      };
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      // The geometry is shared between meshes, so instance data goes on a per-mesh clone
      // of the geometry wrapper. Vertex data is not copied.
      const wrapper = new THREE.InstancedBufferGeometry();
      wrapper.index = geometry.index;
      wrapper.attributes = { ...geometry.attributes };
      wrapper.boundingSphere = geometry.boundingSphere;
      wrapper.boundingBox = geometry.boundingBox;
      wrapper.setAttribute('aLegendRect', attrs.rect);
      wrapper.setAttribute('aLegendBox', attrs.box);
      wrapper.setAttribute('aLegendColor', attrs.legend);
      wrapper.setAttribute('aSurface', attrs.surface);
      mesh.geometry = wrapper;

      const bucket = { mesh, keys, attrs, wrapper };
      keys.forEach((key, i) => {
        this.lookup[key.index] = [bucket, i];
        matrix.makeTranslation(key.cx, STACK.capRest, key.cz);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.buckets.push(bucket);
      this.group.add(mesh);
    }
  }

  #buildPicker() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ visible: false });
    this.picker = new THREE.InstancedMesh(geometry, material, this.layout.keyCount);
    this.picker.frustumCulled = false;
    this.#writePicker(() => 0);
    this.picker.name = 'keycap-picker';
    this.picker.userData.noOutline = true;
    this.group.add(this.picker);
  }

  #writePicker(offset) {
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    for (const key of this.layout.keys) {
      scale.set(key.w * 19.05 - 0.6, 10, 18.4);
      position.set(key.cx, STACK.capRest + 4.5 + offset(key), key.cz);
      matrix.compose(position, quaternion, scale);
      this.picker.setMatrixAt(key.index, matrix);
    }
    this.picker.instanceMatrix.needsUpdate = true;
    this.picker.boundingSphere = null;
    this.picker.boundingBox = null;
  }

  /** Moves the pick boxes to match the caps, used when the exploded offset changes. */
  syncPicker(offset) {
    this.#writePicker(offset);
  }

  /** Sets the caps' vertical position. Called with the final height of a key. */
  setCapY(index, y) {
    const [bucket, i] = this.lookup[index];
    bucket.mesh.instanceMatrix.array[i * 16 + 13] = y;
    bucket.matrixDirty = true;
  }

  /** Uploads changed matrices. Runs at most once a frame. */
  flushMatrices() {
    for (const bucket of this.buckets) {
      if (bucket.matrixDirty) {
        bucket.mesh.instanceMatrix.needsUpdate = true;
        bucket.mesh.boundingBox = null;
        bucket.matrixDirty = false;
      }
    }
  }

  /**
   * Applies theme colours, legends and materials from a build's keycap settings.
   * @param {object} keycaps
   * @param {{animate?:boolean, selected?:Set<string>}} [options]
   */
  applyStyles(keycaps, { animate = false } = {}) {
    const half = this.layout.widthMM / 2;
    for (const key of this.layout.keys) {
      const style = resolveKeyStyle(key, keycaps);
      const [bucket, i] = this.lookup[key.index];
      const { attrs } = bucket;

      const entry = atlasEntryFor(this.atlas, key);
      const box = legendBox(key, entry, keycaps.legendPlacement, this.profileId);
      if (box && entry) {
        attrs.rect.setXYZW(i, entry.u0, entry.v0, entry.du, entry.dv);
        attrs.box.setXYZW(i, box.x, box.z, box.w, box.h);
      } else {
        attrs.box.setXYZW(i, 0, 0, 0, 0);
      }

      color.set(style.legendColor);
      attrs.legend.setXYZ(i, color.r, color.g, color.b);

      const finish = KEYCAP_MATERIALS[style.material] ?? KEYCAP_MATERIALS.pbt;
      const highlight = attrs.surface.getZ(i);
      attrs.surface.setXYZ(i, finish.roughness, finish.metalness, highlight);

      color.set(style.color);
      const k = key.index * 3;
      this.colorTarget[k] = color.r;
      this.colorTarget[k + 1] = color.g;
      this.colorTarget[k + 2] = color.b;
      this.colorDelay[key.index] = animate ? ((key.cx + half) / (half * 2)) * 0.28 : 0;
      if (!animate) {
        this.colorCurrent[k] = color.r;
        this.colorCurrent[k + 1] = color.g;
        this.colorCurrent[k + 2] = color.b;
        bucket.mesh.setColorAt(i, color);
      }
    }
    for (const { attrs, mesh } of this.buckets) {
      attrs.rect.needsUpdate = true;
      attrs.box.needsUpdate = true;
      attrs.legend.needsUpdate = true;
      attrs.surface.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.colorActive = animate;
    this.colorClock = 0;
  }

  /** Advances the colour wave. Returns true while it's still running. */
  stepColors(dt) {
    if (!this.colorActive) return false;
    this.colorClock += dt;
    let moving = false;
    const speed = 1 - Math.exp(-dt * 11);
    for (const key of this.layout.keys) {
      if (this.colorClock < this.colorDelay[key.index]) {
        moving = true;
        continue;
      }
      const k = key.index * 3;
      let changed = false;
      for (let c = 0; c < 3; c += 1) {
        const diff = this.colorTarget[k + c] - this.colorCurrent[k + c];
        if (Math.abs(diff) > 0.0015) {
          this.colorCurrent[k + c] += diff * speed;
          changed = true;
          moving = true;
        } else if (diff !== 0) {
          this.colorCurrent[k + c] = this.colorTarget[k + c];
          changed = true;
        }
      }
      if (changed) {
        const [bucket, i] = this.lookup[key.index];
        bucket.mesh.instanceColor.setXYZ(i, this.colorCurrent[k], this.colorCurrent[k + 1], this.colorCurrent[k + 2]);
        bucket.colorDirty = true;
      }
    }
    for (const bucket of this.buckets) {
      if (bucket.colorDirty) {
        bucket.mesh.instanceColor.needsUpdate = true;
        bucket.colorDirty = false;
      }
    }
    if (!moving) this.colorActive = false;
    return true;
  }

  /** Marks which keys are highlighted as selected. */
  setHighlights(selectedIds) {
    const selected = new Set(selectedIds);
    for (const key of this.layout.keys) {
      const [bucket, i] = this.lookup[key.index];
      bucket.attrs.surface.setZ(i, selected.has(key.id) ? 1 : 0);
    }
    for (const { attrs } of this.buckets) attrs.surface.needsUpdate = true;
  }

  /** Current triangle count, for the performance report. */
  triangleCount() {
    return this.buckets.reduce(
      (sum, b) => sum + (b.mesh.geometry.index.count / 3) * b.keys.length,
      0,
    );
  }

  dispose() {
    for (const { mesh, wrapper } of this.buckets) {
      // The vertex data belongs to the shared cache: dispose only the per-mesh parts.
      wrapper.dispose();
      mesh.dispose();
    }
    this.picker.geometry.dispose();
    this.picker.material.dispose();
    this.picker.dispose();
    this.group.clear();
  }
}
