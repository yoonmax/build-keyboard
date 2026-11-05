import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useSettings } from '../state/settingsStore.js';
import { runtime } from './runtime.js';

/** Low-discrepancy sequence: fills the unit square evenly at any sample count. */
function r2(n) {
  const g = 1.32471795724474602596;
  return [(0.5 + n / g) % 1, (0.5 + n / (g * g)) % 1];
}

/** Uniform point on a unit disc from a value in the unit square. */
function disc([u, v]) {
  const r = Math.sqrt(u);
  const a = v * Math.PI * 2;
  return [r * Math.cos(a), r * Math.sin(a)];
}

const QUAD_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Khronos PBR Neutral tone mapping: keeps base colours true, which a configurator needs. */
const OUTPUT_FRAG = `
  uniform sampler2D uTexture;
  uniform float uExposure;
  uniform vec2 uResolution;
  varying vec2 vUv;

  vec3 neutral(vec3 color) {
    const float startCompression = 0.8 - 0.04;
    const float desaturation = 0.15;
    float x = min(color.r, min(color.g, color.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset;
    float peak = max(color.r, max(color.g, color.b));
    if (peak < startCompression) return color;
    float d = 1.0 - startCompression;
    float newPeak = 1.0 - d * d / (peak + d - startCompression);
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
    return mix(color, vec3(newPeak), g);
  }

  float noise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

  void main() {
    vec3 linear = texture2D(uTexture, vUv).rgb * uExposure;
    vec3 mapped = neutral(linear);
    vec3 srgb = mix(mapped * 12.92, 1.055 * pow(max(mapped, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, mapped));
    // A hair of dither removes banding from the large soft backdrop gradients.
    srgb += (noise(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(srgb, 1.0);
  }`;

const BLEND_FRAG = `
  uniform sampler2D uPrevious;
  uniform sampler2D uCurrent;
  uniform float uWeight;
  varying vec2 vUv;
  void main() {
    gl_FragColor = mix(texture2D(uPrevious, vUv), texture2D(uCurrent, vUv), uWeight);
  }`;

function makeTargets(gl, width, height, samples) {
  const type = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float')
    ? THREE.HalfFloatType
    : THREE.UnsignedByteType;
  const common = {
    type,
    format: THREE.RGBAFormat,
    colorSpace: THREE.NoColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  };
  return {
    scene: new THREE.WebGLRenderTarget(width, height, { ...common, samples, depthBuffer: true }),
    a: new THREE.WebGLRenderTarget(width, height, { ...common, depthBuffer: false }),
    b: new THREE.WebGLRenderTarget(width, height, { ...common, depthBuffer: false }),
  };
}

function disposeTargets(targets) {
  targets?.scene.dispose();
  targets?.a.dispose();
  targets?.b.dispose();
}

/**
 * Renders the scene progressively. While anything moves, each frame is a single
 * multisampled image. Once the view is still, each new frame jitters the camera by a
 * sub-pixel amount, moves the key light across a disc and optionally moves the camera
 * across a lens, and averages the result. This converges on area-light soft shadows,
 * high-quality edges and real depth of field, and then stops drawing.
 *
 * The same loop renders exports off-screen at any size, one sample per animation frame,
 * so a large export keeps the page responsive.
 */
export function ProgressiveRenderer() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const invalidate = useThree((s) => s.invalidate);
  const quality = useSettings((s) => s.resolvedQuality);

  const fx = useMemo(() => {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const blend = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: BLEND_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { uPrevious: { value: null }, uCurrent: { value: null }, uWeight: { value: 1 } },
    });
    const output = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: OUTPUT_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uTexture: { value: null },
        uExposure: { value: 1 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
    });
    return { quad, quadScene, quadCamera, blend, output };
  }, []);

  const state = useMemo(() => ({ targets: null, width: 0, height: 0, samples: 0, selfQueued: false }), []);

  useEffect(() => {
    const buffer = new THREE.Vector2();
    gl.getDrawingBufferSize(buffer);
    const width = Math.max(2, Math.floor(buffer.x));
    const height = Math.max(2, Math.floor(buffer.y));
    disposeTargets(state.targets);
    state.targets = makeTargets(gl, width, height, quality === 'low' ? 2 : 4);
    state.width = width;
    state.height = height;
    state.samples = 0;
    runtime.resetKind = 'full';
    invalidate();
  }, [gl, size.width, size.height, dpr, quality, state, invalidate]);

  useEffect(
    () => () => {
      disposeTargets(state.targets);
      fx.quad.geometry.dispose();
      fx.blend.dispose();
      fx.output.dispose();
    },
    [fx, state],
  );

  useEffect(() => {
    const quadPass = (material, target) => {
      fx.quad.material = material;
      gl.setRenderTarget(target);
      gl.render(fx.quadScene, fx.quadCamera);
    };

    /**
     * Renders one jittered sample into the running average.
     * @returns the index of the sample rendered
     */
    const renderSample = (targets, n, { width, height, cam, shiftX = 0, shiftY = 0, dof, jitterLight = true, softness }) => {
      const light = runtime.parts.keyLight;
      const basePosition = light ? light.position.clone() : null;
      const cameraPosition = cam.position.clone();

      const [jx, jy] = n === 0 ? [0.5, 0.5] : r2(n);
      let offsetX = shiftX + (jx - 0.5);
      let offsetY = shiftY + (jy - 0.5);

      if (dof?.enabled) {
        const [lu, lv] = disc(r2(n + 11));
        const lensX = lu * dof.aperture;
        const lensY = lv * dof.aperture;
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
        cam.position.addScaledVector(right, lensX).addScaledVector(up, lensY);
        cam.updateMatrixWorld();
        // With no explicit focus, focus on what the camera is pointed at.
        const focus = dof.focus ?? runtime.camera?.distance() ?? cameraPosition.length();
        const pixelsPerUnit = height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * focus);
        offsetX -= lensX * pixelsPerUnit;
        offsetY += lensY * pixelsPerUnit;
      }
      cam.setViewOffset(width, height, offsetX, offsetY, width, height);

      if (light && jitterLight && n > 0) {
        const [dx, dz] = disc(r2(n + 3));
        const radius = softness ?? light.userData.softness ?? 120;
        light.position.x += dx * radius;
        light.position.z += dz * radius;
        light.position.y += dz * radius * 0.25;
        light.updateMatrixWorld();
        if (light.target) light.target.updateMatrixWorld();
      }

      gl.setRenderTarget(targets.scene);
      gl.clear();
      gl.render(scene, cam);
      runtime.stats.calls = gl.info.render.calls;
      runtime.stats.triangles = gl.info.render.triangles;

      if (light && basePosition) {
        light.position.copy(basePosition);
        light.updateMatrixWorld();
      }
      if (dof?.enabled) {
        cam.position.copy(cameraPosition);
        cam.updateMatrixWorld();
      }

      fx.blend.uniforms.uPrevious.value = targets.a.texture;
      fx.blend.uniforms.uCurrent.value = targets.scene.texture;
      fx.blend.uniforms.uWeight.value = 1 / (n + 1);
      quadPass(fx.blend, targets.b);
      const swap = targets.a;
      targets.a = targets.b;
      targets.b = swap;
    };

    /**
     * Renders the scene off-screen at any size.
     * @param {object} options
     * @param {number} options.width
     * @param {number} options.height
     * @param {number} options.samples
     * @param {THREE.PerspectiveCamera} [options.camera]
     * @param {{enabled:boolean,aperture:number,focus:number}} [options.dof]
     * @param {(done:number,total:number)=>void} [options.onProgress]
     * @param {{cancelled?:boolean}} [options.signal]
     * @returns {Promise<ImageData>}
     */
    const capture = async ({ width, height, samples, camera: captureCamera, dof, onProgress, signal, shadowSize }) => {
      const limit = gl.capabilities.maxTextureSize;
      if (width > limit || height > limit) {
        throw new Error(`This graphics card can render up to ${limit} × ${limit} pixels.`);
      }
      const cam = captureCamera ?? camera.clone();
      cam.aspect = width / height;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();

      const previous = {
        target: gl.getRenderTarget(),
        rendering: runtime.view.rendering,
        pixelRatio: gl.getPixelRatio(),
      };
      runtime.view.rendering = false;

      const light = runtime.parts.keyLight;
      const previousShadowSize = light ? light.shadow.mapSize.x : 0;
      if (light && shadowSize && shadowSize !== previousShadowSize) {
        light.shadow.mapSize.set(shadowSize, shadowSize);
        light.shadow.map?.dispose();
        light.shadow.map = null;
      }

      const glContext = gl.getContext();
      while (glContext.getError() !== glContext.NO_ERROR) {
        // Clears earlier errors so that a failure below can be attributed correctly.
      }

      const targets = makeTargets(gl, width, height, 4);
      const final = new THREE.WebGLRenderTarget(width, height, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        colorSpace: THREE.NoColorSpace,
        depthBuffer: false,
      });

      const restore = () => {
        disposeTargets(targets);
        final.dispose();
        if (light && shadowSize && shadowSize !== previousShadowSize) {
          light.shadow.mapSize.set(previousShadowSize, previousShadowSize);
          light.shadow.map?.dispose();
          light.shadow.map = null;
        }
        gl.setRenderTarget(previous.target);
        runtime.view.rendering = previous.rendering;
        runtime.resetKind = 'full';
        invalidate();
      };

      try {
        for (let n = 0; n < samples; n += 1) {
          if (signal?.cancelled) throw new DOMException('Export cancelled.', 'AbortError');
          renderSample(targets, n, { width, height, cam, dof });
          onProgress?.(n + 1, samples);
          const error = glContext.getError();
          if (error === glContext.OUT_OF_MEMORY) {
            throw new Error('The graphics card ran out of memory at this size. Try a smaller export.');
          }
          // Handing back to the browser between samples keeps the page responsive.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        fx.output.uniforms.uTexture.value = targets.a.texture;
        fx.quad.material = fx.output;
        gl.setRenderTarget(final);
        gl.render(fx.quadScene, fx.quadCamera);

        const pixels = new Uint8ClampedArray(width * height * 4);
        gl.readRenderTargetPixels(final, 0, 0, width, height, pixels);
        // Pixels come back bottom-up, and an image is top-down.
        const row = width * 4;
        const flipped = new Uint8ClampedArray(pixels.length);
        for (let y = 0; y < height; y += 1) {
          flipped.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
        }
        for (let i = 3; i < flipped.length; i += 4) flipped[i] = 255;
        return new ImageData(flipped, width, height);
      } finally {
        restore();
      }
    };

    runtime.capture = capture;
    runtime.renderSampleInternal = renderSample;
    return () => {
      runtime.capture = null;
    };
  }, [gl, scene, camera, fx, invalidate]);

  const lastCamera = useMemo(() => new THREE.Matrix4(), []);

  useFrame((_, delta) => {
    if (!runtime.view.rendering || !state.targets) return;
    const view = runtime.view;
    const targets = state.targets;
    const { width, height } = state;

    const now = performance.now();
    if (runtime.stats.lastPresent) {
      const ms = now - runtime.stats.lastPresent;
      if (ms < 120) runtime.stats.frameMs += (ms - runtime.stats.frameMs) * 0.1;
    }
    runtime.stats.lastPresent = now;
    runtime.stats.renderedFrames += 1;

    // The shift eases toward its target, so that a panel opening doesn't jerk the product.
    const ease = 1 - Math.exp(-Math.min(delta, 0.05) * 9);
    const dpr2 = width / size.width;
    view.shiftX += (view.targetShiftX - view.shiftX) * ease;
    view.shiftY += (view.targetShiftY - view.shiftY) * ease;
    const shifting =
      Math.abs(view.targetShiftX - view.shiftX) > 0.3 || Math.abs(view.targetShiftY - view.shiftY) > 0.3;
    if (shifting) runtime.resetKind = 'full';

    camera.updateMatrixWorld();
    const cameraMoved = !lastCamera.equals(camera.matrixWorld);
    if (cameraMoved) {
      lastCamera.copy(camera.matrixWorld);
      runtime.resetKind = 'full';
    }

    const selfFrame = state.selfQueued;
    state.selfQueued = false;
    if (runtime.resetKind === 'full' || (!selfFrame && runtime.resetKind === 'none')) {
      state.samples = 0;
    } else if (runtime.resetKind === 'soft') {
      // Keep most of the history during small motion, so that shadows stay soft while typing.
      state.samples = Math.min(state.samples, 3);
    }
    runtime.resetKind = 'none';

    const max = quality === 'low' ? 1 : quality === 'medium' ? 24 : view.maxSamples;
    if (state.samples < max && runtime.renderSampleInternal) {
      runtime.renderSampleInternal(targets, state.samples, {
        width,
        height,
        cam: camera,
        shiftX: -view.shiftX * dpr2,
        shiftY: -view.shiftY * dpr2,
        dof: view.dof,
        jitterLight: quality !== 'low',
      });
      state.samples += 1;
    }
    view.samples = state.samples;
    view.converged = state.samples >= max;

    fx.output.uniforms.uTexture.value = targets.a.texture;
    fx.quad.material = fx.output;
    gl.setRenderTarget(null);
    gl.render(fx.quadScene, fx.quadCamera);

    if (state.samples < max) {
      state.selfQueued = true;
      invalidate();
    }
  }, 1);

  return null;
}
