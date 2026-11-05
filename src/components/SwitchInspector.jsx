import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { keyboardAudio } from '../audio/KeyboardAudio.js';
import { CATALOG, SWITCHES, SWITCH_DATA_NOTE } from '../catalog/index.js';
import {
  buildContactLeaves,
  buildSpring,
  buildSwitchBottomHousing,
  buildSwitchPins,
  buildSwitchStem,
  buildSwitchTopHousing,
} from '../geometry/SwitchGeometry.js';
import { findTactilePeak } from '../model/switchCurve.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { ForceCurve } from './ForceCurve.jsx';
import { Slider, Toggle } from './primitives.jsx';
import { trapTab } from './Sheets.jsx';

const SPRING_BOTTOM = -4.6;
const SPRING_TOP = 3.5;

/** A detailed model of one switch, moving from a shared travel value. */
function SwitchModel({ sw, control, ghost, opened }) {
  const stem = useRef(null);
  const spring = useRef(null);
  const moving = useRef(null);
  const top = useRef(null);

  const parts = useMemo(
    () => ({
      top: buildSwitchTopHousing({ detail: 6 }),
      bottom: buildSwitchBottomHousing({ pins: sw.pins, detail: 6 }),
      stem: buildSwitchStem(),
      pins: buildSwitchPins(),
      spring: buildSpring({ height: 1 }),
      leaves: buildContactLeaves(),
    }),
    [sw.pins],
  );
  useEffect(
    () => () => {
      parts.top.dispose();
      parts.bottom.dispose();
      parts.stem.dispose();
      parts.pins.dispose();
      parts.spring.dispose();
      parts.leaves.fixed.dispose();
      parts.leaves.moving.dispose();
    },
    [parts],
  );

  useFrame((_, delta) => {
    const c = control.current;
    // Travel chases its target, firmly on the way down and a little softer coming back.
    const rate = c.target > c.travel ? 40 : 22;
    const previous = c.travel;
    c.travel += (c.target - c.travel) * (1 - Math.exp(-Math.min(delta, 0.05) * rate));
    if (Math.abs(c.target - c.travel) < 0.002) c.travel = c.target;
    c.direction = c.travel >= previous ? 'down' : 'up';

    if (c.onTravel && c.travel !== c.lastReported) {
      c.lastReported = c.travel;
      c.onTravel(c.travel, c.direction);
    }
    if (stem.current) stem.current.position.y = -c.travel + opened * 11;
    if (spring.current) {
      const rest = SPRING_TOP - SPRING_BOTTOM;
      spring.current.scale.y = rest - c.travel + opened * 11;
    }
    if (moving.current) {
      // The stem's rail holds the moving leaf away until it passes the actuation point.
      const closed = THREE.MathUtils.smoothstep(c.travel, sw.actuationDistance - 0.25, sw.actuationDistance);
      moving.current.rotation.z = (1 - closed) * 0.1 - 0.1;
    }
    if (top.current) top.current.position.y = opened * 18;
  });

  const ghostTop = ghost || sw.housing.translucentTop;
  return (
    <group position={[0, -2, 0]}>
      <group ref={top}>
        <mesh geometry={parts.top} castShadow renderOrder={2}>
          <meshPhysicalMaterial
            color={sw.housing.top}
            roughness={ghostTop ? 0.16 : 0.5}
            transparent={ghostTop}
            opacity={ghost ? 0.2 : ghostTop ? 0.46 : 1}
            depthWrite={!ghostTop}
            side={ghostTop ? THREE.DoubleSide : THREE.FrontSide}
          />
        </mesh>
      </group>
      <mesh geometry={parts.bottom} castShadow receiveShadow>
        <meshStandardMaterial
          color={sw.housing.bottom}
          roughness={0.55}
          transparent={ghost}
          opacity={ghost ? 0.34 : 1}
          depthWrite={!ghost}
        />
      </mesh>
      <mesh geometry={parts.pins}>
        <meshStandardMaterial color="#D8C08A" metalness={1} roughness={0.28} />
      </mesh>
      <mesh ref={stem} geometry={parts.stem} castShadow>
        <meshStandardMaterial color={sw.housing.stem} roughness={0.38} />
      </mesh>
      <mesh ref={spring} geometry={parts.spring} position={[0, SPRING_BOTTOM, 0]} castShadow>
        <meshStandardMaterial color="#C8CBCE" metalness={1} roughness={0.24} />
      </mesh>
      <mesh geometry={parts.leaves.fixed}>
        <meshStandardMaterial color="#C9A063" metalness={1} roughness={0.3} />
      </mesh>
      <mesh ref={moving} geometry={parts.leaves.moving}>
        <meshStandardMaterial color="#C9A063" metalness={1} roughness={0.3} />
      </mesh>
      {sw.type === 'clicky' ? (
        <mesh position={[0, 1.2, -3.4]}>
          <boxGeometry args={[3.6, 2.2, 0.9]} />
          <meshStandardMaterial color={sw.housing.stem} roughness={0.5} />
        </mesh>
      ) : null}
    </group>
  );
}

/** Macro view of a switch, with a press control and a live force curve. */
export function SwitchInspector() {
  const switchId = useConfigurator((s) => s.ui.switchMacroId);
  const setUi = useConfigurator((s) => s.setUi);
  const build = useConfigurator((s) => s.build);
  const choose = useConfigurator((s) => s.choose);
  const [viewId, setViewId] = useState(switchId);
  const [ghost, setGhost] = useState(true);
  const [opened, setOpened] = useState(0);
  const [travelDisplay, setTravelDisplay] = useState(0);
  const [held, setHeld] = useState(false);
  const curveRef = useRef(null);
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const sw = CATALOG.switch.get(viewId ?? switchId ?? build.switchId) ?? SWITCHES[0];
  const control = useRef({ travel: 0, target: 0, direction: 'down', lastReported: 0, onTravel: null, firedDown: false });
  const lastUi = useRef(0);

  useEffect(() => {
    setViewId(switchId);
  }, [switchId]);

  useEffect(() => {
    if (switchId) closeRef.current?.focus();
  }, [switchId]);

  useEffect(() => {
    if (!switchId) return undefined;
    control.current.onTravel = (travel, direction) => {
      curveRef.current?.setMarker(travel, direction);
      const now = performance.now();
      if (now - lastUi.current > 60 || travel === control.current.target) {
        lastUi.current = now;
        setTravelDisplay(travel);
      }
    };
    return () => {
      control.current.onTravel = null;
    };
  }, [switchId, sw]);

  const press = () => {
    keyboardAudio.unlock();
    keyboardAudio.configure({
      sw,
      plateId: build.plateId,
      caseId: build.case.id,
      foam: build.accessories.includes('acc-foam'),
      keycapMaterial: build.keycaps.material,
    });
    control.current.target = sw.totalTravel;
    keyboardAudio.play({ stroke: 'down' });
    setHeld(true);
  };
  const release = () => {
    if (control.current.target === 0) return;
    control.current.target = 0;
    keyboardAudio.play({ stroke: 'up' });
    setHeld(false);
  };

  // The audio engine goes back to the build's real switch when this view closes.
  const close = () => {
    keyboardAudio.configure({
      sw: CATALOG.switch.get(build.switchId),
      plateId: build.plateId,
      caseId: build.case.id,
      foam: build.accessories.includes('acc-foam'),
      keycapMaterial: build.keycaps.material,
    });
    setUi({ switchMacroId: null });
  };

  useEffect(() => {
    if (!switchId) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') close();
      if (event.code === 'Space' && !event.repeat && event.target?.tagName !== 'SELECT' && event.target?.tagName !== 'INPUT') {
        event.preventDefault();
        press();
      }
    };
    const onKeyUp = (event) => {
      if (event.code === 'Space') release();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
    };
    // Handlers read refs and current values, so they are refreshed when the switch changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [switchId, sw]);

  if (!switchId) return null;

  const peak = findTactilePeak(sw);
  const actuated = travelDisplay >= sw.actuationDistance;
  const eventLabel = sw.type === 'clicky' ? 'Click' : 'Bump';

  return (
    <div className="modal-backdrop macro-backdrop" data-testid="switch-macro" ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${sw.name} switch, close up`} onKeyDown={(e) => trapTab(e, dialogRef.current)}>
      <div className="macro sheet">
        <div className="macro-stage">
          <Canvas
            camera={{ position: [32, 22, 44], fov: 26, near: 1, far: 800 }}
            dpr={[1, 2]}
            gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
          >
            <color attach="background" args={['#E4E2DC']} />
            <directionalLight position={[-30, 60, 30]} intensity={1.6} />
            <Environment frames={1} resolution={256} near={1} far={800} environmentIntensity={0.9}>
              <color attach="background" args={['#6F6E6A']} />
              <Lightformer form="rect" position={[0, 120, 0]} scale={[220, 140, 1]} intensity={3.2} />
              <Lightformer form="rect" position={[-120, 30, 40]} scale={[100, 80, 1]} intensity={2.2} />
              <Lightformer form="rect" position={[120, 20, -40]} scale={[80, 40, 1]} intensity={1.4} />
            </Environment>
            <SwitchModel key={sw.id} sw={sw} control={control} ghost={ghost} opened={opened} />
            <OrbitControls enablePan={false} minDistance={30} maxDistance={140} enableDamping />
          </Canvas>
          <p className="macro-state" data-testid="macro-state" aria-live="polite" data-closed={actuated || undefined}>
            {actuated ? 'Contacts closed: the key has actuated.' : 'Contacts open.'}
          </p>
        </div>
        <div className="macro-side">
          <div className="part-head">
            <h2 className="part-title">{sw.name}</h2>
            <button type="button" ref={closeRef} className="icon-close" aria-label="Close" data-testid="close-macro" onClick={close}>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
          </div>
          <p className="part-subtitle">{sw.typeName} switch. {sw.notes}</p>
          <label className="field">
            <span>Switch</span>
            <select value={sw.id} data-testid="macro-switch" onChange={(e) => setViewId(e.target.value)}>
              {SWITCHES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}, {s.typeName.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <ForceCurve ref={curveRef} sw={sw} />
          <button
            type="button"
            className="press-button"
            data-testid="macro-press"
            aria-pressed={held}
            onPointerDown={press}
            onPointerUp={release}
            onPointerLeave={release}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
                e.preventDefault();
                e.stopPropagation();
                press();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                release();
              }
            }}
          >
            Press and hold, or hold the spacebar
          </button>
          <p className="travel-readout" data-testid="macro-travel">
            <b>{travelDisplay.toFixed(2)} mm</b> of {sw.totalTravel.toFixed(1)} mm travel
          </p>
          <dl className="spec-list">
            <div className="spec-row">
              <dt>Actuation</dt>
              <dd>
                {sw.actuationForce} gf at {sw.actuationDistance.toFixed(1)} mm
              </dd>
            </div>
            <div className="spec-row">
              <dt>Bottom-out</dt>
              <dd>
                {sw.bottomOutForce} gf at {sw.totalTravel.toFixed(1)} mm
              </dd>
            </div>
            {peak ? (
              <div className="spec-row">
                <dt>{eventLabel}</dt>
                <dd>
                  {Math.round(peak.force)} gf at {peak.travel.toFixed(2)} mm
                </dd>
              </div>
            ) : null}
            <div className="spec-row">
              <dt>Pins</dt>
              <dd>{sw.pins}</dd>
            </div>
          </dl>
          <Toggle label="See-through housing" checked={ghost} testId="macro-ghost" onChange={setGhost} />
          <Slider
            label="Open the housing"
            value={opened}
            min={0}
            max={1}
            step={0.01}
            testId="macro-open"
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={setOpened}
          />
          <p className="sheet-note">{SWITCH_DATA_NOTE} Contacts are simplified. Sound is synthesized and only suggests the type.</p>
          {sw.id !== build.switchId ? (
            <button
              type="button"
              className="wide-button wide-button-sheet"
              data-testid="macro-use"
              onClick={() => choose('switch', sw.id)}
            >
              Use {sw.name} in this build
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
