import { useState } from 'react';
import { assemble, explode, inspectLayer } from '../app/actions.js';
import { explodedView } from '../configurator/ExplodedView.js';
import { runtime, touch } from '../configurator/runtime.js';
import { EXPLODE_LAYERS } from '../model/assembly.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { Slider, Toggle } from './primitives.jsx';
import { useExplodeState } from './useExplodeState.js';

/** Hides every layer except one, or restores them all. */
function isolate(layerId) {
  runtime.explode.isolate = layerId;
  for (const [id, group] of Object.entries(runtime.parts.layers)) {
    group.visible = !layerId || id === layerId;
  }
  touch('full');
}

/**
 * Tools for understanding the keyboard: the exploded view, a list of every part as an
 * alternative to clicking in 3D, the macro view of a switch and the typing test.
 */
export function ExplorePanel() {
  const state = useExplodeState();
  const hasFoam = useConfigurator((s) => s.build.accessories.includes('acc-foam'));
  const selection = useConfigurator((s) => s.ui.selection);
  const switchId = useConfigurator((s) => s.build.switchId);
  const setUi = useConfigurator((s) => s.setUi);
  const open = useConfigurator((s) => s.ui.leftOpen);
  const [isolated, setIsolated] = useState(false);

  const layers = EXPLODE_LAYERS.filter((l) => hasFoam || (l.id !== 'plateFoam' && l.id !== 'caseFoam'));
  const selectedLayer = selection.kind === 'layer' ? selection.layerId : null;

  const setIsolation = (on) => {
    setIsolated(on);
    isolate(on ? selectedLayer : null);
  };

  const pick = (id) => {
    inspectLayer(id);
    if (isolated) isolate(id);
  };

  const canPause = state.progress > 0 && state.progress < 1;

  return (
    <aside className="slab sidebar explore-panel" data-open={open || undefined} aria-label="Explore" data-reveal="left">
      <div className="explore-scroll">
        <section className="option-group">
          <h2 className="slab-heading">Inside the keyboard</h2>
          <div className="button-grid">
            <button type="button" className="wide-button" data-testid="explode" disabled={state.progress >= 1} onClick={explode}>
              Explode
            </button>
            <button type="button" className="wide-button" data-testid="assemble" disabled={state.progress <= 0} onClick={assemble}>
              Assemble
            </button>
            <button
              type="button"
              className="wide-button wide-button-span"
              data-testid="explode-pause"
              disabled={!canPause}
              onClick={() => explodedView.togglePause()}
            >
              {canPause && !state.playing ? 'Continue animation' : 'Pause animation'}
            </button>
          </div>
          <Slider
            label="Position"
            value={state.progress}
            min={0}
            max={1}
            step={0.005}
            format={(v) => `${Math.round(v * 100)}%`}
            testId="explode-scrub"
            onChange={(v) => explodedView.scrub(v)}
          />
          <Slider
            label="Separation"
            value={state.separation}
            min={0.4}
            max={1.4}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            testId="explode-separation"
            onChange={(v) => {
              explodedView.setSeparation(v);
            }}
          />
        </section>

        <section className="option-group">
          <h3 className="group-label">Parts</h3>
          <p className="group-hint">Pick a part here or click it in the 3D view.</p>
          <ul className="part-list">
            {layers.map((layer) => (
              <li key={layer.id}>
                <button
                  type="button"
                  className="part-button"
                  aria-pressed={selectedLayer === layer.id}
                  data-selected={selectedLayer === layer.id || undefined}
                  data-testid={`layer-${layer.id}`}
                  onClick={() => pick(layer.id)}
                >
                  {layer.name}
                </button>
              </li>
            ))}
          </ul>
          <Toggle
            label="Show only the selected part"
            checked={isolated}
            testId="isolate"
            onChange={setIsolation}
          />
        </section>

        <section className="option-group">
          <h3 className="group-label">Try it</h3>
          <button
            type="button"
            className="wide-button"
            data-testid="open-tester"
            onClick={() => setUi({ testerOpen: true })}
          >
            Type on it
          </button>
          <button
            type="button"
            className="wide-button"
            data-testid="explore-macro"
            onClick={() => setUi({ switchMacroId: switchId })}
          >
            Inspect a switch up close
          </button>
        </section>
      </div>
    </aside>
  );
}
