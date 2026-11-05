import gsap from 'gsap';
import * as THREE from 'three';
import { CATALOG, FINISHES } from '../catalog/index.js';
import { caseHex } from '../model/build.js';
import { beadBlastNormal, brushedNormal, weaveNormal } from './surfaceTextures.js';

/**
 * Physically based values for each case. Pure data, so the differences between
 * materials can be unit-tested without a GPU.
 *
 * Anodized: a metal whose colour comes from dye, under a thin clear oxide, so even a
 * dark colour shows a neutral sheen. Painted: a colour layer over metal, so it acts as
 * a non-metal. Polycarbonate: a tinted plastic with a higher index of refraction.
 * Frosted: real light transmission through a rough volume.
 *
 * @param {object} buildCase The `case` part of a build
 */
export function caseSurface(buildCase) {
  const item = CATALOG.case.get(buildCase.id);
  const finish = FINISHES[buildCase.finish] ?? FINISHES.satin;
  const color = caseHex(buildCase);
  const shift = finish.roughnessShift ?? 0;
  const base = {
    color,
    metalness: 0,
    roughness: 0.5,
    clearcoat: 0,
    clearcoatRoughness: 0.2,
    anisotropy: 0,
    transmission: 0,
    thickness: 0,
    ior: 1.5,
    attenuationDistance: Infinity,
    attenuationColor: '#ffffff',
    grain: 'bead',
    grainScale: 0.05,
  };

  switch (item?.id) {
    case 'case-anodized':
      return {
        ...base,
        // Reflected colour can't reach zero: the oxide and bare metal still bounce some light.
        color: liftForMetal(color),
        metalness: 1,
        roughness: clamp(0.42 + shift),
        clearcoat: 0.28,
        clearcoatRoughness: clamp(0.5 + shift),
        anisotropy: finish.anisotropy ?? 0,
        grain: finish.id === 'brushed' ? 'brushed' : 'bead',
        grainScale: finish.id === 'brushed' ? 0.22 : 0.075,
      };
    case 'case-painted':
      return {
        ...base,
        metalness: 0,
        roughness: clamp(0.44 + shift * 1.6),
        clearcoat: finish.id === 'gloss' ? 1 : finish.id === 'satin' ? 0.32 : 0,
        clearcoatRoughness: finish.id === 'gloss' ? 0.05 : 0.42,
        grain: finish.id === 'gloss' ? null : 'bead',
        grainScale: 0.03,
      };
    case 'case-polycarbonate':
      return {
        ...base,
        metalness: 0,
        roughness: clamp(0.34 + shift),
        clearcoat: finish.id === 'gloss' ? 0.8 : 0.12,
        clearcoatRoughness: 0.14,
        ior: 1.585,
        grain: finish.id === 'gloss' ? null : 'bead',
        grainScale: 0.02,
      };
    case 'case-frosted':
      return {
        ...base,
        metalness: 0,
        roughness: 0.6,
        transmission: 0.9,
        thickness: 6,
        ior: 1.49,
        attenuationDistance: 36,
        attenuationColor: color,
        color: '#ffffff',
        grain: 'bead',
        grainScale: 0.06,
      };
    default:
      return base;
  }
}

/** Physically based values for each plate. */
export function plateSurface(plateId) {
  switch (plateId) {
    case 'plate-polycarbonate':
      return { color: '#D6D4CC', metalness: 0, roughness: 0.46, grain: null, grainScale: 0, clearcoat: 0.1 };
    case 'plate-fr4':
      return { color: '#1E2019', metalness: 0, roughness: 0.62, grain: 'weave', grainScale: 0.3, clearcoat: 0 };
    default:
      return { color: '#B6B8BA', metalness: 1, roughness: 0.4, grain: 'bead', grainScale: 0.06, clearcoat: 0 };
  }
}

/** Raises very dark dyes so a metal surface still shows its form under studio lights. */
export function liftForMetal(hex) {
  const c = new THREE.Color(hex);
  const floor = 0.055;
  c.r = floor + c.r * (1 - floor);
  c.g = floor + c.g * (1 - floor);
  c.b = floor + c.b * (1 - floor);
  return `#${c.getHexString()}`;
}

function clamp(v, min = 0.04, max = 1) {
  return Math.min(max, Math.max(min, v));
}

function grainTexture(id) {
  if (id === 'brushed') return brushedNormal();
  if (id === 'bead') return beadBlastNormal();
  if (id === 'weave') return weaveNormal();
  return null;
}

/**
 * Applies a surface description to a material, tweening what can be tweened. Values
 * that change the shader program (such as clearcoat turning on) take effect immediately;
 * three.js recompiles only when one actually crosses zero.
 * @param {THREE.MeshPhysicalMaterial} material
 * @param {ReturnType<typeof caseSurface>} surface
 * @param {{duration?:number, onUpdate?:Function}} [options]
 */
export function applySurface(material, surface, { duration = 0.55, onUpdate } = {}) {
  const color = new THREE.Color(surface.color);
  const texture = grainTexture(surface.grain);
  if (material.normalMap !== texture) {
    material.normalMap = texture;
    material.needsUpdate = true;
  }
  material.normalScale?.set(surface.grainScale ?? 0, surface.grainScale ?? 0);
  if (surface.clearcoatRoughness !== undefined) material.clearcoatRoughness = surface.clearcoatRoughness;
  if (surface.anisotropy !== undefined) material.anisotropy = surface.anisotropy;
  if (surface.ior !== undefined) material.ior = surface.ior;
  if (surface.thickness !== undefined) material.thickness = surface.thickness;
  if (surface.attenuationDistance !== undefined) material.attenuationDistance = surface.attenuationDistance;
  if (surface.attenuationColor) material.attenuationColor.set(surface.attenuationColor);

  gsap.killTweensOf(material);
  gsap.killTweensOf(material.color);
  const finish = () => onUpdate?.();
  if (duration <= 0) {
    material.color.copy(color);
    material.metalness = surface.metalness;
    material.roughness = surface.roughness;
    material.clearcoat = surface.clearcoat ?? 0;
    material.transmission = surface.transmission ?? 0;
    finish();
    return;
  }
  gsap.to(material.color, { r: color.r, g: color.g, b: color.b, duration, ease: 'power2.inOut', onUpdate: finish });
  gsap.to(material, {
    metalness: surface.metalness,
    roughness: surface.roughness,
    clearcoat: surface.clearcoat ?? 0,
    transmission: surface.transmission ?? 0,
    duration,
    ease: 'power2.inOut',
    onUpdate: finish,
    onComplete: finish,
  });
}

/** One shared set of materials for every non-keycap part. */
export function createPartMaterials() {
  const physical = (params) => new THREE.MeshPhysicalMaterial(params);
  const standard = (params) => new THREE.MeshStandardMaterial(params);
  return {
    case: physical({ color: '#222222', metalness: 1, roughness: 0.4 }),
    seam: standard({ color: '#060606', roughness: 0.9 }),
    stainless: physical({ color: '#E2E2E0', metalness: 1, roughness: 0.14, clearcoat: 0 }),
    plate: physical({ color: '#B6B8BA', metalness: 1, roughness: 0.4 }),
    pcb: standard({ color: '#ffffff', metalness: 1, roughness: 1 }),
    pcbEdge: standard({ color: '#2C3A28', roughness: 0.7 }),
    housingTop: physical({ color: '#ddd', roughness: 0.3, transparent: false }),
    housingBottom: standard({ color: '#222', roughness: 0.55 }),
    stem: standard({ color: '#c33', roughness: 0.42 }),
    metalPin: standard({ color: '#D8C08A', metalness: 1, roughness: 0.3 }),
    steel: standard({ color: '#C4C6C8', metalness: 1, roughness: 0.28 }),
    stabHousing: standard({ color: '#2a2b2d', roughness: 0.5 }),
    stabStem: standard({ color: '#ddd', roughness: 0.45 }),
    rubber: standard({ color: '#121212', roughness: 0.92 }),
    gasket: standard({ color: '#1B1B1B', roughness: 0.88 }),
    foam: standard({ color: '#3A3B3D', roughness: 1 }),
    foamLight: standard({ color: '#D9D2C4', roughness: 1 }),
    socket: standard({ color: '#22242A', roughness: 0.5 }),
    diode: standard({ color: '#0E0E0E', roughness: 0.4 }),
    led: standard({ color: '#EDEDE4', roughness: 0.25, emissive: '#000000' }),
    chip: standard({ color: '#121314', roughness: 0.35 }),
    usbShell: standard({ color: '#BFC1C3', metalness: 1, roughness: 0.34 }),
    usbDark: standard({ color: '#040404', roughness: 0.65 }),
    usbTongue: standard({ color: '#141414', roughness: 0.5 }),
    usbContact: standard({ color: '#C8A25C', metalness: 1, roughness: 0.3 }),
    usbBezel: physical({ color: '#D6D6D4', metalness: 1, roughness: 0.2 }),
    walnut: physical({ color: '#ffffff', roughness: 0.5, clearcoat: 0.18, clearcoatRoughness: 0.5 }),
    cable: standard({ color: '#222', roughness: 0.62 }),
  };
}

/**
 * A single shared material for every keycap. Per-key colour, legends, finish and selection
 * state arrive as instance attributes, so changing a colour rewrites one attribute value
 * and no material or mesh is recreated. Compiling one material here also means one shader
 * program for all keycap sizes and profiles.
 * @param {THREE.Texture} legendAtlas
 */
/** Colour of the per-key LEDs as seen on the skirts. Shared, as it applies to every keycap. */
export const keycapGlow = { value: new THREE.Color(0, 0, 0) };

export function createKeycapMaterial(legendAtlas) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0 });
  const uniforms = {
    uLegendAtlas: { value: legendAtlas },
    uHighlightColor: { value: new THREE.Color('#FFFFFF') },
    uCapGlow: keycapGlow,
  };
  material.userData.uniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aTop;
        attribute float aAO;
        attribute vec4 aLegendRect;
        attribute vec4 aLegendBox;
        attribute vec3 aLegendColor;
        attribute vec3 aSurface;
        varying vec2 vCapXZ;
        varying float vCapTop;
        varying float vCapAO;
        varying vec4 vLegendRect;
        varying vec4 vLegendBox;
        varying vec3 vLegendColor;
        varying vec3 vSurface;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCapXZ = position.xz;
        vCapTop = aTop;
        vCapAO = aAO;
        vLegendRect = aLegendRect;
        vLegendBox = aLegendBox;
        vLegendColor = aLegendColor;
        vSurface = aSurface;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uLegendAtlas;
        uniform vec3 uHighlightColor;
        uniform vec3 uCapGlow;
        varying vec2 vCapXZ;
        varying float vCapTop;
        varying float vCapAO;
        varying vec4 vLegendRect;
        varying vec4 vLegendBox;
        varying vec3 vLegendColor;
        varying vec3 vSurface;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float legendInk = 0.0;
        if (vLegendBox.z > 0.0 && vCapTop > 0.5) {
          vec2 legendUv = (vCapXZ - vLegendBox.xy) / vLegendBox.zw;
          vec2 legendAtlasUv = vLegendRect.xy + clamp(legendUv, 0.0, 1.0) * vLegendRect.zw;
          // Sampling happens outside the inside-box test so mip levels stay continuous.
          float raw = texture2D(uLegendAtlas, legendAtlasUv).r;
          float inside = step(0.0, legendUv.x) * step(legendUv.x, 1.0) * step(0.0, legendUv.y) * step(legendUv.y, 1.0);
          legendInk = smoothstep(0.18, 0.72, raw) * inside;
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vLegendColor, legendInk);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = mix(vSurface.x, max(vSurface.x, 0.42), legendInk);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `float metalnessFactor = mix(vSurface.y, 0.0, legendInk);`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vCapAO;
        reflectedLight.indirectSpecular *= mix(vCapAO, 1.0, 0.25);
        reflectedLight.directDiffuse *= mix(vCapAO, 1.0, 0.45);
        reflectedLight.directSpecular *= mix(vCapAO, 1.0, 0.45);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float selectRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2);
        totalEmissiveRadiance += uHighlightColor * vSurface.z * (0.05 + selectRim * 0.55);
        // LEDs under the switch light the skirt from below, fading toward the top edge.
        float skirt = (1.0 - smoothstep(0.34, 0.96, vCapAO)) * (1.0 - step(0.5, vCapTop));
        totalEmissiveRadiance += uCapGlow * skirt;`,
      );
  };
  material.customProgramCacheKey = () => 'keycap-instanced-v1';
  return material;
}

/** Writes a selection outline: the mesh is pushed out along its normals and drawn inside-out. */
export function createOutlineMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uColor: { value: new THREE.Color('#1C1D1F') }, uWidth: { value: 0.7 } },
    vertexShader: `
      uniform float uWidth;
      void main() {
        vec3 p = position + normalize(normal) * uWidth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
    toneMapped: false,
  });
}

/**
 * Writes the far depth into the depth buffer, so geometry behind a case wall can
 * show through without boolean operations on the wall. Used for the USB-C opening.
 */
export function createDepthPunchMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    colorWrite: false,
    depthWrite: true,
    vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `void main() { gl_FragDepth = 1.0; gl_FragColor = vec4(0.0); }`,
    toneMapped: false,
  });
}
