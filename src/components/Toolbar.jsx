import { useEffect, useState } from 'react';
import { explodedView } from '../configurator/ExplodedView.js';
import { runtime } from '../configurator/runtime.js';
import { LIGHT_RIGS, getRig } from '../materials/LightingPresets.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { useSettings } from '../state/settingsStore.js';
import { useExplodeState } from './useExplodeState.js';
import { explode, assemble } from '../app/actions.js';

const VIEWS = [
  ['hero', 'Reset'],
  ['top', 'Top'],
  ['side', 'Side'],
  ['front', 'Front'],
  ['rear', 'Rear'],
  ['threeQuarter', 'Angle'],
  ['macro', 'Macro'],
];

export function Toolbar() {
  const setUi = useConfigurator((s) => s.setUi);
  const cinematic = useConfigurator((s) => s.ui.cinematic);
  const studioOpen = useConfigurator((s) => s.ui.studioOpen);
  const rig = useSettings((s) => s.rig);
  const set = useSettings((s) => s.set);
  const state = useExplodeState();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const exploded = state.progress > 0.5;

  const view = (id) => {
    if (explodedView.isOpen() && id !== 'hero') {
      // Named views make sense for the assembled board. Put it back together first.
      assemble();
    }
    if (id === 'hero' && explodedView.isOpen()) assemble();
    runtime.camera?.goTo(id);
  };

  const nextRig = () => {
    const index = LIGHT_RIGS.findIndex((r) => r.id === rig);
    set({ rig: LIGHT_RIGS[(index + 1) % LIGHT_RIGS.length].id });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="slab toolbar" role="toolbar" aria-label="View controls" data-reveal="bottom">
      <div className="toolbar-group" role="group" aria-label="Camera">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="tool"
            data-testid={`view-${id}`}
            aria-label={id === 'threeQuarter' ? 'Three-quarter view' : id === 'hero' ? 'Reset camera' : `${label} view`}
            onClick={() => view(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="toolbar-group" role="group" aria-label="Assembly">
        <button
          type="button"
          className="tool"
          data-testid="toolbar-explode"
          aria-pressed={exploded}
          onClick={() => (exploded ? assemble() : explode())}
        >
          {exploded ? 'Assemble' : 'Explode'}
        </button>
      </div>
      <div className="toolbar-group" role="group" aria-label="Studio">
        <button
          type="button"
          className="tool"
          data-testid="toolbar-studio"
          aria-pressed={studioOpen}
          onClick={() => setUi({ studioOpen: !studioOpen })}
        >
          Studio
        </button>
        <button type="button" className="tool" data-testid="toolbar-light" onClick={nextRig} aria-label={`Lighting: ${getRig(rig).name}. Change.`}>
          Light: {getRig(rig).name}
        </button>
      </div>
      <div className="toolbar-group" role="group" aria-label="Screen">
        <button
          type="button"
          className="tool"
          data-testid="toolbar-hide"
          aria-pressed={cinematic}
          onClick={() => setUi({ cinematic: !cinematic })}
        >
          {cinematic ? 'Show panels' : 'Hide panels'}
        </button>
        <button type="button" className="tool" data-testid="toolbar-fullscreen" aria-pressed={fullscreen} onClick={toggleFullscreen}>
          Fullscreen
        </button>
      </div>
    </div>
  );
}
