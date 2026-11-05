import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keyboardAudio } from '../audio/KeyboardAudio.js';
import { CATALOG, SWITCHES } from '../catalog/index.js';
import { assemble } from '../app/actions.js';
import { releaseAllKeys, runtime, setKeyPressed } from '../configurator/runtime.js';
import { getLayout } from '../layouts/index.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { useSettings } from '../state/settingsStore.js';
import { Slider, Toggle } from './primitives.jsx';

/** Keeps the audio engine set up for the current parts and settings. */
export function useAudioSync() {
  const switchId = useConfigurator((s) => s.build.switchId);
  const plateId = useConfigurator((s) => s.build.plateId);
  const caseId = useConfigurator((s) => s.build.case.id);
  const foam = useConfigurator((s) => s.build.accessories.includes('acc-foam'));
  const material = useConfigurator((s) => s.build.keycaps.material);
  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.muted);
  const ambient = useSettings((s) => s.ambient);
  const variation = useSettings((s) => s.variation);

  useEffect(() => {
    keyboardAudio.configure({ sw: CATALOG.switch.get(switchId), plateId, caseId, foam, keycapMaterial: material });
  }, [switchId, plateId, caseId, foam, material]);
  useEffect(() => keyboardAudio.setVolume(volume), [volume]);
  useEffect(() => keyboardAudio.setMuted(muted), [muted]);
  useEffect(() => keyboardAudio.setAmbient(ambient), [ambient]);
  useEffect(() => keyboardAudio.setVariation(variation), [variation]);
}

/**
 * Typing test. Physical keys press the matching key on the 3D model, using
 * KeyboardEvent.code, so what moves is the physical position and not the typed letter.
 *
 * Events aren't cancelled, so browser shortcuts and the text box keep working. The
 * browser may never report some keys: the Fn key, keys the OS reserves, or combinations
 * beyond the hardware's rollover. If focus leaves mid-press, its keyup never arrives,
 * so every key is released when the window loses focus.
 */
export function KeyboardTester() {
  const open = useConfigurator((s) => s.ui.testerOpen);
  const setUi = useConfigurator((s) => s.setUi);
  const layoutId = useConfigurator((s) => s.build.layoutId);
  const switchId = useConfigurator((s) => s.build.switchId);
  const choose = useConfigurator((s) => s.choose);
  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.muted);
  const ambient = useSettings((s) => s.ambient);
  const variation = useSettings((s) => s.variation);
  const set = useSettings((s) => s.set);
  const layout = getLayout(layoutId);
  const held = useRef(new Set());
  const [heldCount, setHeldCount] = useState(0);
  const [peak, setPeak] = useState(0);
  const [missing, setMissing] = useState(null);
  const [text, setText] = useState('');
  const [presses, setPresses] = useState(0);
  const textRef = useRef(null);
  const missingTimer = useRef(null);

  const syncCounts = useCallback(() => {
    const count = held.current.size;
    setHeldCount(count);
    setPeak((p) => Math.max(p, count));
  }, []);

  const pressKey = useCallback(
    (key) => {
      setKeyPressed(key.index, true);
      keyboardAudio.play({ stroke: 'down', width: key.w, pan: (key.cx / (layout.widthMM / 2)) * 0.35 });
      setPresses((p) => p + 1);
    },
    [layout],
  );
  const releaseKey = useCallback(
    (key) => {
      setKeyPressed(key.index, false);
      keyboardAudio.play({ stroke: 'up', width: key.w, pan: (key.cx / (layout.widthMM / 2)) * 0.35 });
    },
    [layout],
  );

  useEffect(() => {
    if (!open) return undefined;
    keyboardAudio.unlock();
    if (runtime.explode.progress > 0.01) assemble();
    runtime.camera?.goTo('typing', { duration: 1.1 });
    useConfigurator.getState().clearSelection();
    textRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event) => {
      keyboardAudio.unlock();
      if (event.repeat) return;
      const key = layout.keyById.get(event.code);
      if (!key) {
        setMissing(event.code || event.key);
        clearTimeout(missingTimer.current);
        missingTimer.current = setTimeout(() => setMissing(null), 2200);
        return;
      }
      if (held.current.has(event.code)) return;
      held.current.add(event.code);
      pressKey(key);
      syncCounts();
    };
    const onKeyUp = (event) => {
      const key = layout.keyById.get(event.code);
      if (!key || !held.current.has(event.code)) return;
      held.current.delete(event.code);
      releaseKey(key);
      syncCounts();
    };
    const releaseAll = () => {
      held.current.clear();
      releaseAllKeys();
      syncCounts();
    };
    const onVisibility = () => {
      if (document.hidden) releaseAll();
    };

    // Pressing keys with the pointer or a finger, for touch screens and for anyone without a keyboard.
    const pointerHeld = new Map();
    runtime.tester = {
      active: true,
      pointerPress(index) {
        keyboardAudio.unlock();
        const key = layout.keys[index];
        pointerHeld.set(key.id, key);
        held.current.add(key.id);
        pressKey(key);
        syncCounts();
      },
    };
    const onPointerUp = () => {
      for (const key of pointerHeld.values()) {
        held.current.delete(key.id);
        releaseKey(key);
      }
      pointerHeld.clear();
      syncCounts();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    window.addEventListener('pointerup', onPointerUp);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      window.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(missingTimer.current);
      releaseAll();
      runtime.tester = null;
      runtime.camera?.goTo('hero', { duration: 1.1 });
    };
  }, [open, layout, pressKey, releaseKey, syncCounts]);

  const missingText = useMemo(() => {
    if (!missing) return null;
    return `${missing} isn't on a ${layout.name} board.`;
  }, [missing, layout]);

  if (!open) return null;

  return (
    <section className="sheet tester" aria-label="Keyboard tester" data-testid="tester">
      <div className="tester-main">
        <div className="tester-head">
          <h2 className="sheet-title">Type on it</h2>
          <p className="tester-stats" data-testid="tester-stats">
            <span>
              <b data-testid="tester-held">{heldCount}</b> held
            </span>
            <span>
              <b data-testid="tester-peak">{peak}</b> most at once
            </span>
            <span>
              <b data-testid="tester-presses">{presses}</b> presses
            </span>
          </p>
        </div>
        <label className="sr-only" htmlFor="tester-text">
          Test typing here
        </label>
        <textarea
          id="tester-text"
          ref={textRef}
          className="tester-text"
          rows={2}
          value={text}
          data-testid="tester-text"
          placeholder="Start typing. Each physical key presses the same key on the model."
          onChange={(e) => setText(e.target.value)}
        />
        <p className="tester-note" aria-live="polite">
          {missingText ?? 'Browsers can’t see every key. Fn and some system shortcuts never arrive here, and keyboards limit how many keys register at once.'}
        </p>
      </div>
      <div className="tester-side">
        <label className="field">
          <span>Switch</span>
          <select value={switchId} data-testid="tester-switch" onChange={(e) => choose('switch', e.target.value)}>
            {SWITCHES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}, {s.typeName.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <Slider
          label="Volume"
          value={volume}
          min={0}
          max={1}
          step={0.01}
          testId="volume"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set({ volume: v })}
        />
        <div className="toggle-row">
          <Toggle label="Mute" checked={muted} testId="mute" onChange={(v) => set({ muted: v })} />
          <Toggle label="Room tone" checked={ambient} testId="ambient" onChange={(v) => set({ ambient: v })} />
          <Toggle label="Vary each press" checked={variation} testId="variation" onChange={(v) => set({ variation: v })} />
        </div>
        <button type="button" className="text-button" data-testid="close-tester" onClick={() => setUi({ testerOpen: false })}>
          Done
        </button>
      </div>
    </section>
  );
}
