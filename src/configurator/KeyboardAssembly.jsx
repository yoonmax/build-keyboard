import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CATALOG, KEYCAP_MATERIALS } from '../catalog/index.js';
import {
  buildFeet,
  buildLowerCase,
  buildMountHardware,
  buildRearWeight,
  buildSeamLine,
  buildUpperCase,
  buildUsbPort,
} from '../geometry/CaseGeometry.js';
import { buildLegendAtlas } from '../geometry/LegendAtlas.js';
import { buildPCBGeometry, paintPCB, perSwitchMatrices } from '../geometry/PCBGeometry.js';
import {
  buildCaseFoamGeometry,
  buildPlateFoamGeometry,
  buildPlateGeometry,
  gasketPadPositions,
} from '../geometry/PlateGeometry.js';
import {
  buildDiode,
  buildLed,
  buildSocket,
  buildStabilizerHousing,
  buildStabilizerStem,
  buildStabilizerWires,
  buildSwitchBottomHousing,
  buildSwitchPins,
  buildSwitchStem,
  buildSwitchTopHousing,
} from '../geometry/SwitchGeometry.js';
import { bevelBox } from '../geometry/sweep.js';
import { getLayout } from '../layouts/index.js';
import {
  applySurface,
  caseSurface,
  createDepthPunchMaterial,
  createKeycapMaterial,
  createPartMaterials,
  plateSurface,
} from '../materials/MaterialLibrary.js';
import { STACK, caseDimensions, deskPlacement, mountingPoints, stabilizerPositions } from '../model/assembly.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { focusKey, inspectLayer } from '../app/actions.js';
import { KeycapSystem } from './KeycapSystem.js';
import { dropKeycaps, resizeKeyState, runtime, touch } from './runtime.js';
import { LightingEffects } from './LightingEffects.jsx';

const dummy = new THREE.Object3D();

/** Builds a value when its dependencies change, and disposes of the old one afterwards. */
function useDisposable(factory, deps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(factory, deps);
  useEffect(
    () => () => {
      if (!value) return;
      if (value.dispose) value.dispose();
      else if (typeof value === 'object') {
        for (const part of Object.values(value)) part?.dispose?.();
      }
    },
    [value],
  );
  return value;
}

/** Records a group as an exploded layer so the animation system can move it. */
function useLayerGroup(id) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    runtime.parts.layers[id] = ref.current;
    return () => {
      delete runtime.parts.layers[id];
    };
  }, [id]);
  return ref;
}

/** Selects a layer on click, and ignores clicks that were really camera drags. */
function pickLayer(layerId) {
  return (event) => {
    if (event.delta > 4) return;
    event.stopPropagation();
    if (runtime.tester?.active) return;
    inspectLayer(layerId);
  };
}

function Part({ geometry, material, layer, ...rest }) {
  if (!geometry) return null;
  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      dispose={null}
      onClick={layer ? pickLayer(layer) : undefined}
      {...rest}
    />
  );
}

/** Instanced part, with matrices provided as a list. */
function InstancedPart({ geometry, material, matrices, layer, name, castShadow = true, onMesh }) {
  const ref = useRef(null);
  const count = matrices.length;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = null;
    mesh.computeBoundingSphere();
    onMesh?.(mesh);
    touch('full');
  }, [matrices, onMesh]);
  if (count === 0) return null;
  return (
    <instancedMesh
      key={count}
      ref={ref}
      name={name}
      args={[geometry, material, count]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
      dispose={null}
      onClick={layer ? pickLayer(layer) : undefined}
    />
  );
}

/** The whole keyboard, generated entirely from the current build. */
export function KeyboardAssembly() {
  const layoutId = useConfigurator((s) => s.build.layoutId);
  const profileSetId = useConfigurator((s) => s.build.keycaps.setId);
  const plateId = useConfigurator((s) => s.build.plateId);
  const pcbId = useConfigurator((s) => s.build.pcbId);
  const switchId = useConfigurator((s) => s.build.switchId);
  const stabilizerId = useConfigurator((s) => s.build.stabilizerId);
  const mount = useConfigurator((s) => s.build.case.mount);
  const hasFoam = useConfigurator((s) => s.build.accessories.includes('acc-foam'));

  const layout = getLayout(layoutId);
  const dims = useMemo(() => caseDimensions(layout), [layout]);
  const placement = useMemo(() => deskPlacement(dims.outerD, -dims.openingOffsetZ), [dims]);

  const materials = useDisposable(createPartMaterials, []);

  // Case colour and finish animate on one material, so no meshes are rebuilt.
  useEffect(() => {
    const apply = (buildCase, animate) => {
      const surface = caseSurface(buildCase);
      applySurface(materials.case, surface, {
        duration: animate ? 0.55 : 0,
        onUpdate: () => touch('full'),
      });
      // Frosted cases need to be drawn after the things that show through them.
      materials.case.side = surface.transmission > 0 ? THREE.DoubleSide : THREE.FrontSide;
      materials.case.needsUpdate = true;
      touch('full');
    };
    apply(useConfigurator.getState().build.case, false);
    return useConfigurator.subscribe(
      (s) => s.build.case,
      (buildCase) => apply(buildCase, true),
    );
  }, [materials]);

  useEffect(() => {
    applySurface(materials.plate, plateSurface(plateId), { duration: 0.4, onUpdate: () => touch('full') });
  }, [materials, plateId]);

  // Geometry is regenerated only when the part it describes changes.
  const caseGeo = useDisposable(
    () => ({
      upper: buildUpperCase(layout),
      lower: buildLowerCase(layout),
      seam: buildSeamLine(layout),
      feet: buildFeet(layout),
      weight: buildRearWeight(layout),
    }),
    [layout],
  );
  const usb = useDisposable(() => buildUsbPort(layout), [layout]);
  const depthPunch = useDisposable(createDepthPunchMaterial, []);

  const plateGeo = useDisposable(
    () => buildPlateGeometry(layout, mount, CATALOG.plate.get(plateId)?.thickness ?? STACK.plateThickness),
    [layout, mount, plateId],
  );
  const foamGeo = useDisposable(
    () => (hasFoam ? { plate: buildPlateFoamGeometry(layout), case: buildCaseFoamGeometry(layout) } : null),
    [layout, hasFoam],
  );
  const pcbGeo = useDisposable(() => buildPCBGeometry(layout), [layout]);
  const pcbArt = useDisposable(() => paintPCB(layout, { label: `${layout.fullName}. ${layout.keyCount} keys.` }), [layout]);

  useEffect(() => {
    materials.pcb.map = pcbArt.colorTexture;
    materials.pcb.metalnessMap = pcbArt.maskTexture;
    materials.pcb.roughnessMap = pcbArt.maskTexture;
    materials.pcb.needsUpdate = true;
    touch('full');
  }, [materials, pcbArt]);

  // Keycaps.
  const atlas = useDisposable(() => buildLegendAtlas(layout), [layout]);
  const capMaterial = useDisposable(() => createKeycapMaterial(atlas.texture), [atlas]);
  const capSet = CATALOG.keycaps.get(profileSetId);
  const profileId = capSet?.profile ?? 'sculpted';
  const capRoot = useRef(null);
  const firstBuild = useRef(true);

  useLayoutEffect(() => {
    resizeKeyState(layout.keyCount);
    const sw = CATALOG.switch.get(useConfigurator.getState().build.switchId);
    runtime.keys.maxTravel = sw?.totalTravel ?? 4;
    const system = new KeycapSystem(layout, profileId, atlas, capMaterial);
    system.applyStyles(useConfigurator.getState().build.keycaps);
    system.setHighlights(selectedKeyIds());
    system.picker.__profile = profileId;
    runtime.parts.caps = system;
    capRoot.current.add(system.group);
    if (!firstBuild.current) dropKeycaps(layout);
    firstBuild.current = false;
    touch('full');
    return () => {
      capRoot.current?.remove(system.group);
      system.dispose();
      if (runtime.parts.caps === system) runtime.parts.caps = null;
    };
  }, [layout, profileId, atlas, capMaterial]);

  // Colours and legends update attributes directly with no React re-render.
  useEffect(
    () =>
      useConfigurator.subscribe(
        (s) => s.build.keycaps,
        (keycaps) => {
          runtime.parts.caps?.applyStyles(keycaps, { animate: true });
          touch('soft');
        },
      ),
    [],
  );

  useEffect(
    () =>
      useConfigurator.subscribe(
        (s) => s.ui.selection,
        () => {
          const ids = selectedKeyIds();
          runtime.parts.caps?.setHighlights(ids);
          const keys = runtime.keys;
          keys.liftTarget.fill(0);
          const current = runtime.parts.caps;
          if (current) {
            for (const id of ids) {
              const key = current.layout.keyById.get(id);
              if (key) keys.liftTarget[key.index] = 1.4;
            }
          }
          touch('soft');
        },
      ),
    [],
  );

  const sw = CATALOG.switch.get(switchId);
  const pcb = CATALOG.pcb.get(pcbId);
  const stab = CATALOG.stabilizer.get(stabilizerId);

  useEffect(() => {
    if (!sw) return;
    materials.housingTop.color.set(sw.housing.top);
    materials.housingTop.transparent = sw.housing.translucentTop;
    materials.housingTop.opacity = sw.housing.translucentTop ? 0.62 : 1;
    materials.housingTop.roughness = sw.housing.translucentTop ? 0.2 : 0.5;
    materials.housingTop.needsUpdate = true;
    materials.housingBottom.color.set(sw.housing.bottom);
    materials.stem.color.set(sw.housing.stem);
    runtime.keys.maxTravel = sw.totalTravel;
    touch('full');
  }, [materials, sw]);

  useEffect(() => {
    if (!stab) return;
    materials.stabHousing.color.set(stab.style.housing);
    materials.stabStem.color.set(stab.style.stem);
    materials.steel.color.set(stab.style.wire);
    touch('full');
  }, [materials, stab]);

  const switchMatrices = useMemo(() => perSwitchMatrices(layout, { y: 0 }), [layout]);
  const switchGeo = useDisposable(
    () => ({
      top: buildSwitchTopHousing(),
      bottom: buildSwitchBottomHousing({ pins: sw?.pins ?? 5 }),
      stem: buildSwitchStem(),
      pins: buildSwitchPins(),
    }),
    [sw?.pins],
  );

  const stems = useMemo(() => stabilizerPositions(layout), [layout]);
  const stabMatrices = useMemo(
    () =>
      stems.map((stem) => {
        dummy.position.set(stem.x, 0, stem.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        return dummy.matrix.clone();
      }),
    [stems],
  );
  const stabGeo = useDisposable(
    () => ({
      housing: buildStabilizerHousing(),
      stem: buildStabilizerStem(),
      wires: buildStabilizerWires(layout),
    }),
    [layout],
  );

  const onStemMesh = useMemo(
    () => (mesh) => {
      runtime.parts.stems = mesh;
    },
    [],
  );
  const onStabStemMesh = useMemo(
    () => (mesh) => {
      const byKey = new Map();
      stems.forEach((stem, i) => {
        if (!byKey.has(stem.keyIndex)) byKey.set(stem.keyIndex, []);
        byKey.get(stem.keyIndex).push(i);
      });
      mesh.userData.byKey = byKey;
      runtime.parts.stabStems = mesh;
    },
    [stems],
  );

  // PCB parts.
  const pcbParts = useDisposable(
    () => ({
      socket: buildSocket(),
      diode: buildDiode(),
      led: buildLed(),
      mcu: bevelBox(9, 1.1, 9, 0.18),
      connector: bevelBox(9.2, 3.2, 7.6, 0.25),
    }),
    [],
  );
  const socketMatrices = useMemo(
    () => (pcb?.socket === 'hotswap' ? perSwitchMatrices(layout, { y: -STACK.pcbThickness }) : []),
    [layout, pcb?.socket],
  );
  const diodeMatrices = useMemo(() => perSwitchMatrices(layout, { y: 0, dx: 0, dz: 6.6 }), [layout]);
  const ledMatrices = useMemo(
    () => (pcb?.lighting.includes('per-key') ? perSwitchMatrices(layout, { y: 0, dz: 5.08 }) : []),
    [layout, pcb],
  );

  const hardwarePoints = useMemo(() => mountingPoints(layout, mount), [layout, mount]);
  const hardwareGeo = useDisposable(
    () => (mount === 'gasket' ? null : buildMountHardware(hardwarePoints)),
    [hardwarePoints, mount],
  );
  const gasketPads = useMemo(() => (mount === 'gasket' ? gasketPadPositions(layout) : []), [layout, mount]);
  const gasketGeo = useDisposable(() => bevelBox(1, 2.4, 1, 0.1), []);
  const gasketMatrices = useMemo(
    () =>
      gasketPads.map((pad) => {
        dummy.position.set(pad.x, 0.55, pad.z);
        dummy.scale.set(pad.w, 1, pad.d);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        const m = dummy.matrix.clone();
        dummy.scale.set(1, 1, 1);
        return m;
      }),
    [gasketPads],
  );

  return (
    <group rotation={[placement.tiltRad, 0, 0]} position={[0, placement.lift + 1.6, 0]} name="keyboard">
      <group ref={useLayerGroup('lowerCase')} name="lowerCase">
        <Part geometry={caseGeo.lower} material={materials.case} layer="lowerCase" />
        <Part geometry={caseGeo.seam} material={materials.seam} />
        <Part geometry={caseGeo.feet} material={materials.rubber} layer="lowerCase" />
        <Part geometry={caseGeo.weight} material={materials.stainless} layer="lowerCase" />
        <mesh geometry={usb.mask} material={depthPunch} renderOrder={1} dispose={null} />
        <mesh geometry={usb.tube} material={materials.usbDark} renderOrder={2} dispose={null} />
        <mesh geometry={usb.inner} material={materials.usbShell} renderOrder={2} dispose={null} />
        <mesh geometry={usb.back} material={materials.usbDark} renderOrder={2} dispose={null} />
        <mesh geometry={usb.tongue} material={materials.usbTongue} renderOrder={2} dispose={null} />
        <mesh geometry={usb.contacts} material={materials.usbContact} renderOrder={2} dispose={null} />
        <Part geometry={usb.bezel} material={materials.usbBezel} renderOrder={3} />
        {mount === 'tray' && hardwareGeo ? (
          <Part geometry={hardwareGeo} material={materials.usbContact} position={[0, -7.6, 0]} />
        ) : null}
      </group>

      <group ref={useLayerGroup('caseFoam')} name="caseFoam" position={[0, 0, 0]}>
        {foamGeo ? (
          <group position={[0, STACK.pcbTop - STACK.pcbThickness - 2.0, 0]}>
            <Part geometry={foamGeo.case} material={materials.foam} layer="caseFoam" />
          </group>
        ) : null}
      </group>

      <group ref={useLayerGroup('pcb')} name="pcb">
        <group position={[0, STACK.pcbTop, 0]}>
          <Part geometry={pcbGeo} material={materials.pcb} layer="pcb" />
          <InstancedPart geometry={pcbParts.socket} material={materials.socket} matrices={socketMatrices} name="sockets" layer="pcb" />
          <InstancedPart geometry={pcbParts.diode} material={materials.diode} matrices={diodeMatrices} name="diodes" />
          <InstancedPart geometry={pcbParts.led} material={materials.led} matrices={ledMatrices} name="leds" />
          <Part geometry={pcbParts.mcu} material={materials.chip} position={[-dims.pcbW * 0.2, 0.55, -dims.pcbD / 2 + 8]} />
          <Part
            geometry={pcbParts.connector}
            material={materials.usbShell}
            position={[-dims.outerW * 0.34, -1.6, -dims.pcbD / 2 + 3.2]}
          />
        </group>
      </group>

      <group ref={useLayerGroup('plateFoam')} name="plateFoam">
        {foamGeo ? (
          <group position={[0, -1.65, 0]}>
            <Part geometry={foamGeo.plate} material={materials.foamLight} layer="plateFoam" />
          </group>
        ) : null}
      </group>

      <group ref={useLayerGroup('plate')} name="plate">
        <Part geometry={plateGeo} material={materials.plate} layer="plate" />
        <InstancedPart geometry={gasketGeo} material={materials.gasket} matrices={gasketMatrices} name="gaskets" />
        {mount === 'top' && hardwareGeo ? (
          <Part geometry={hardwareGeo} material={materials.usbContact} position={[0, 2.6, 0]} />
        ) : null}
      </group>

      <group ref={useLayerGroup('stabilizers')} name="stabilizers">
        <InstancedPart
          geometry={stabGeo.housing}
          material={materials.stabHousing}
          matrices={stabMatrices}
          name="stab-housing"
          layer="stabilizers"
        />
        <InstancedPart
          geometry={stabGeo.stem}
          material={materials.stabStem}
          matrices={stabMatrices}
          name="stab-stems"
          onMesh={onStabStemMesh}
        />
        <Part geometry={stabGeo.wires} material={materials.steel} layer="stabilizers" />
      </group>

      <group ref={useLayerGroup('switches')} name="switches">
        <InstancedPart
          geometry={switchGeo.top}
          material={materials.housingTop}
          matrices={switchMatrices}
          name="switch-top"
          layer="switches"
        />
        <InstancedPart
          geometry={switchGeo.bottom}
          material={materials.housingBottom}
          matrices={switchMatrices}
          name="switch-bottom"
          layer="switches"
        />
        <InstancedPart geometry={switchGeo.pins} material={materials.metalPin} matrices={switchMatrices} name="switch-pins" castShadow={false} />
        <InstancedPart
          geometry={switchGeo.stem}
          material={materials.stem}
          matrices={switchMatrices}
          name="switch-stem"
          onMesh={onStemMesh}
        />
      </group>

      <group ref={useLayerGroup('upperCase')} name="upperCase">
        <Part geometry={caseGeo.upper} material={materials.case} layer="upperCase" />
      </group>

      <KeycapRoot rootRef={capRoot} />

      <LightingEffects layout={layout} materials={materials} />
    </group>
  );
}

/** Holds the imperatively built keycap system and routes pointer events to it. */
function KeycapRoot({ rootRef }) {
  const onClick = (event) => {
    if (event.delta > 4 || event.instanceId === undefined) return;
    if (event.object?.name !== 'keycap-picker') return;
    event.stopPropagation();
    const system = runtime.parts.caps;
    if (!system) return;
    const key = system.layout.keys[event.instanceId];
    const store = useConfigurator.getState();
    if (runtime.tester?.active) return;
    const additive = event.nativeEvent?.shiftKey;
    store.selectKey(key.id, additive);
    // While editing colours the board stays still, so several keys can be picked in a row.
    if (!additive && store.ui.category !== 'keycaps') focusKey(key);
  };
  useLayoutEffect(() => {
    runtime.parts.layers.keycaps = rootRef.current;
    return () => {
      delete runtime.parts.layers.keycaps;
    };
  }, [rootRef]);
  const onPointerDown = (event) => {
    if (!runtime.tester?.active || event.object?.name !== 'keycap-picker' || event.instanceId === undefined) return;
    event.stopPropagation();
    runtime.tester.pointerPress(event.instanceId);
  };
  const onPointerMove = (event) => {
    if (event.object?.name === 'keycap-picker') document.body.style.cursor = 'pointer';
  };
  const onPointerOut = () => {
    document.body.style.cursor = '';
  };
  return (
    <group
      ref={rootRef}
      name="keycap-root"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
    />
  );
}

function selectedKeyIds() {
  const { selection } = useConfigurator.getState().ui;
  return selection.kind === 'keys' ? selection.keyIds : [];
}

export { KEYCAP_MATERIALS };
