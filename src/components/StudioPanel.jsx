import { useEffect, useMemo, useRef, useState } from 'react';
import { CAMERA_VIEWS } from '../configurator/cameraMath.js';
import { assemble } from '../app/actions.js';
import { explodedView } from '../configurator/ExplodedView.js';
import { runtime, touch } from '../configurator/runtime.js';
import { downloadBlob, fileNameFor } from '../export/ConfigurationExporter.js';
import {
  EXPORT_SIZES,
  MAX_EXPORT_EDGE,
  SHADOW_QUALITY,
  exportImage,
  exportSizeProblem,
} from '../export/ImageExporter.js';
import { BACKDROPS, LIGHT_RIGS, getBackdrop } from '../materials/LightingPresets.js';
import { getLayout } from '../layouts/index.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { QUALITY_LEVELS, useSettings } from '../state/settingsStore.js';
import { ColorField, Option, OptionGroup, Slider, Toggle } from './primitives.jsx';

const SHOTS = ['hero', 'threeQuarter', 'top', 'front', 'rear', 'side', 'low', 'macro'];

/** The studio: where to set the scene up for a photograph, and take it. */
export function StudioPanel() {
  const open = useConfigurator((s) => s.ui.studioOpen);
  const setUi = useConfigurator((s) => s.setUi);
  const showToast = useConfigurator((s) => s.showToast);
  const build = useConfigurator((s) => s.build);
  const backdrop = useSettings((s) => s.backdrop);
  const backdropColor = useSettings((s) => s.backdropColor);
  const rig = useSettings((s) => s.rig);
  const quality = useSettings((s) => s.quality);
  const set = useSettings((s) => s.set);

  const [shot, setShot] = useState('current');
  const [sizeId, setSizeId] = useState('qhd');
  const [customW, setCustomW] = useState(3000);
  const [customH, setCustomH] = useState(2000);
  const [shadow, setShadow] = useState('good');
  const [dofOn, setDofOn] = useState(false);
  const [aperture, setAperture] = useState(2.5);
  const [fit, setFit] = useState(1);
  const [titleOn, setTitleOn] = useState(false);
  const [title, setTitle] = useState('');
  const [titlePosition, setTitlePosition] = useState('bottom-left');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const signal = useRef(null);

  useEffect(() => {
    runtime.view.dof = { enabled: open && dofOn, aperture, focus: null };
    touch('full');
  }, [open, dofOn, aperture]);

  const size = useMemo(() => {
    if (sizeId === 'custom') return { width: Number(customW), height: Number(customH) };
    return EXPORT_SIZES.find((s) => s.id === sizeId);
  }, [sizeId, customW, customH]);

  const sizeProblem = exportSizeProblem(size.width, size.height, runtime.gl?.capabilities.maxTextureSize);

  const moveCamera = (id) => {
    setShot(id);
    if (id === 'current') return;
    if (explodedView.isOpen()) assemble();
    runtime.camera?.goTo(id);
  };

  const run = async () => {
    setError(null);
    const token = { cancelled: false };
    signal.current = token;
    setProgress(0);
    const layout = getLayout(build.layoutId);
    const started = performance.now();
    try {
      const blob = await exportImage({
        width: size.width,
        height: size.height,
        quality: shadow,
        viewId: shot,
        fit,
        dof: dofOn ? { enabled: true, aperture, focus: null } : null,
        signal: token,
        overlay: titleOn
          ? {
              title: title || build.name,
              subtitle: `${layout.fullName}`,
              ink: getBackdrop(backdrop).uiTone === 'dark' ? '#F2F0EC' : '#17181A',
              position: titlePosition,
            }
          : null,
        onProgress: (done, total) => setProgress(done / total),
      });
      downloadBlob(blob, fileNameFor(build.name, 'png'));
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      showToast(`Exported ${size.width} × ${size.height} PNG in ${seconds} s.`, 'good');
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message ?? 'The image could not be exported.');
    } finally {
      setProgress(null);
      signal.current = null;
    }
  };

  if (!open) return null;

  return (
    <aside className="sheet inspector studio" data-open aria-label="Studio" data-testid="studio">
      <div className="part-head">
        <h2 className="part-title">Studio</h2>
        <button type="button" className="icon-close" aria-label="Close the studio" data-testid="close-studio" onClick={() => setUi({ studioOpen: false })}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </div>

      <OptionGroup label="Backdrop">
        {BACKDROPS.map((item) => (
          <Option
            key={item.id}
            name={item.name}
            selected={backdrop === item.id && !backdropColor}
            testId={`backdrop-${item.id}`}
            onClick={() => set({ backdrop: item.id, backdropColor: null })}
          />
        ))}
      </OptionGroup>
      <ColorField
        label="Background colour"
        value={backdropColor ?? getBackdrop(backdrop).bottom}
        testId="backdrop-color"
        onChange={(hex) => set({ backdropColor: hex })}
      />

      <OptionGroup label="Lighting">
        {LIGHT_RIGS.map((item) => (
          <Option
            key={item.id}
            name={item.name}
            note={rig === item.id ? item.note : null}
            selected={rig === item.id}
            testId={`rig-${item.id}`}
            onClick={() => set({ rig: item.id })}
          />
        ))}
      </OptionGroup>

      <section className="option-group">
        <h3 className="group-label">Camera</h3>
        <p className="group-hint">Pick a preset, or drag in the view to orbit.</p>
        <div className="chip-row" role="group" aria-label="Camera preset">
          <button type="button" className="chip" aria-pressed={shot === 'current'} data-testid="shot-current" onClick={() => moveCamera('current')}>
            As framed
          </button>
          {SHOTS.map((id) => (
            <button key={id} type="button" className="chip" aria-pressed={shot === id} data-testid={`shot-${id}`} onClick={() => moveCamera(id)}>
              {CAMERA_VIEWS[id].name}
            </button>
          ))}
        </div>
        {shot !== 'current' ? (
          <Slider
            label="Framing"
            value={fit}
            min={0.7}
            max={1.5}
            step={0.01}
            testId="framing"
            format={(v) => (v < 0.93 ? 'Tight' : v > 1.15 ? 'Wide' : 'Standard')}
            onChange={setFit}
          />
        ) : null}
      </section>

      <section className="option-group">
        <h3 className="group-label">Depth of field</h3>
        <Toggle label="Blur what's out of focus" checked={dofOn} testId="dof" onChange={setDofOn} />
        {dofOn ? (
          <Slider
            label="Aperture"
            value={aperture}
            min={0.5}
            max={8}
            step={0.25}
            testId="dof-aperture"
            format={(v) => (v < 2 ? 'Subtle' : v < 5 ? 'Medium' : 'Strong')}
            onChange={setAperture}
          />
        ) : null}
        {dofOn ? <p className="group-hint">The blur builds up over about a second once the camera stops.</p> : null}
      </section>

      <section className="option-group">
        <h3 className="group-label">Title</h3>
        <Toggle label="Add a product title" checked={titleOn} testId="title-toggle" onChange={setTitleOn} />
        {titleOn ? (
          <>
            <label className="field">
              <span>Text</span>
              <input value={title} placeholder={build.name} maxLength={60} data-testid="title-text" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              <span>Position</span>
              <select value={titlePosition} onChange={(e) => setTitlePosition(e.target.value)}>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
                <option value="top-left">Top left</option>
                <option value="top-right">Top right</option>
              </select>
            </label>
          </>
        ) : null}
      </section>

      <section className="option-group">
        <h3 className="group-label">Image</h3>
        <label className="field">
          <span>Size</span>
          <select value={sizeId} data-testid="export-size" onChange={(e) => setSizeId(e.target.value)}>
            {EXPORT_SIZES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}, {s.width} × {s.height}
              </option>
            ))}
            <option value="custom">Custom size</option>
          </select>
        </label>
        {sizeId === 'custom' ? (
          <div className="field-pair">
            <label className="field">
              <span>Width</span>
              <input type="number" min={64} max={MAX_EXPORT_EDGE} value={customW} data-testid="export-width" onChange={(e) => setCustomW(e.target.value)} />
            </label>
            <label className="field">
              <span>Height</span>
              <input type="number" min={64} max={MAX_EXPORT_EDGE} value={customH} data-testid="export-height" onChange={(e) => setCustomH(e.target.value)} />
            </label>
          </div>
        ) : null}
        <label className="field">
          <span>Shadow quality</span>
          <select value={shadow} data-testid="export-quality" onChange={(e) => setShadow(e.target.value)}>
            {SHADOW_QUALITY.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}. {q.note}
              </option>
            ))}
          </select>
        </label>
        {sizeProblem ? (
          <p className="form-error" role="alert" data-testid="export-size-error">
            {sizeProblem}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert" data-testid="export-error">
            {error}
          </p>
        ) : null}
        {progress !== null ? (
          <div className="export-progress" role="status">
            <span className="progress-track">
              <i style={{ transform: `scaleX(${progress})` }} />
            </span>
            <span>
              Rendering, {Math.round(progress * 100)}%
              <button type="button" className="text-button" data-testid="export-cancel" onClick={() => (signal.current.cancelled = true)}>
                Cancel
              </button>
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="wide-button wide-button-solid"
            data-testid="export-png"
            disabled={Boolean(sizeProblem)}
            onClick={run}
          >
            Export PNG
          </button>
        )}
      </section>

      <section className="option-group">
        <h3 className="group-label">Render quality</h3>
        <label className="field">
          <span>Live view</span>
          <select value={quality} data-testid="render-quality" onChange={(e) => set({ quality: e.target.value })}>
            {QUALITY_LEVELS.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}. {q.note}
              </option>
            ))}
          </select>
        </label>
      </section>
    </aside>
  );
}
