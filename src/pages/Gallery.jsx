import { useCallback, useEffect, useState } from 'react';
import { buildStorage, storageEvents } from '../app/actions.js';
import { navigate } from '../app/routes.js';
import { CATALOG, FINISHES } from '../catalog/index.js';
import { STARTER_BUILDS } from '../catalog/starters.js';
import { ImportButton } from '../components/Sheets.jsx';
import { StatusGlyph } from '../components/primitives.jsx';
import { validateBuild } from '../compatibility/CompatibilityEngine.js';
import { colorwayName, downloadBlob, fileNameFor, serializeBuild } from '../export/ConfigurationExporter.js';
import { getLayout } from '../layouts/index.js';
import { caseColorName } from '../model/build.js';
import { calculatePrice, formatPrice } from '../model/pricing.js';
import { useConfigurator } from '../state/configuratorStore.js';

function BuildFacts({ build }) {
  const layout = getLayout(build.layoutId);
  const caseItem = CATALOG.case.get(build.case.id);
  const sw = CATALOG.switch.get(build.switchId);
  const plate = CATALOG.plate.get(build.plateId);
  const price = calculatePrice(build);
  const status = validateBuild(build).status;
  return (
    <dl className="build-facts">
      <div>
        <dt>Layout</dt>
        <dd>{layout.fullName}</dd>
      </div>
      <div>
        <dt>Colourway</dt>
        <dd>{colorwayName(build.keycaps)}</dd>
      </div>
      <div>
        <dt>Materials</dt>
        <dd>
          {caseColorName(build.case)} {caseItem.name.toLowerCase()}, {(FINISHES[build.case.finish]?.name ?? '').toLowerCase()}, {plate.name} plate
        </dd>
      </div>
      <div>
        <dt>Switch</dt>
        <dd>
          {sw.name}, {sw.typeName.toLowerCase()}
        </dd>
      </div>
      <div>
        <dt>Estimate</dt>
        <dd data-testid="gallery-price">
          {formatPrice(price.total)}
          {price.complete ? '' : ' (incomplete)'}
        </dd>
      </div>
      {status !== 'valid' ? (
        <div>
          <dt>Status</dt>
          <dd className="build-status">
            <StatusGlyph status={status} /> {status === 'error' ? 'Has errors' : 'Has warnings'}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function Card({ entry, image, starter, large, onChanged }) {
  const loadBuild = useConfigurator((s) => s.loadBuild);
  const savedId = useConfigurator((s) => s.savedId);
  const showToast = useConfigurator((s) => s.showToast);
  const [confirming, setConfirming] = useState(false);
  const { build } = entry;

  const open = () => {
    const { unsaved } = useConfigurator.getState();
    if (unsaved && !window.confirm('Your current build has unsaved changes. Open this one anyway?')) return;
    loadBuild(build, starter ? null : entry.id);
    navigate('configure');
  };
  const duplicate = () => {
    buildStorage.duplicate(entry.id);
    onChanged();
    showToast(`Duplicated "${build.name}".`, 'good');
  };
  const remove = () => {
    buildStorage.remove(entry.id);
    if (savedId === entry.id) useConfigurator.getState().markSaved(null);
    onChanged();
    showToast(`Deleted "${build.name}".`);
  };
  const exportJson = () => {
    downloadBlob(new Blob([serializeBuild(build)], { type: 'application/json' }), fileNameFor(build.name, 'json'));
  };

  return (
    <article className="build-card" data-large={large || undefined} data-testid="build-card" data-starter={starter || undefined}>
      <button type="button" className="build-image" data-testid="build-open" aria-label={`Open ${build.name}`} onClick={open}>
        {image ? (
          <img src={image} alt={`${build.name}, rendered in the studio`} loading="lazy" data-testid="build-thumb" />
        ) : (
          <span className="build-noimage">No picture: this browser's storage was full when it was saved.</span>
        )}
      </button>
      <h3 className="build-name-title">{build.name}</h3>
      <BuildFacts build={build} />
      {starter ? null : (
        <div className="button-row">
          <button type="button" className="text-button" data-testid="build-duplicate" onClick={duplicate}>
            Duplicate
          </button>
          <button type="button" className="text-button" data-testid="build-export" onClick={exportJson}>
            Export JSON
          </button>
          {confirming ? (
            <>
              <button type="button" className="text-button text-danger" data-testid="build-delete-confirm" onClick={remove}>
                Delete for good
              </button>
              <button type="button" className="text-button" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="text-button" data-testid="build-delete" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export function Gallery() {
  const [entries, setEntries] = useState(() => buildStorage.list());
  const refresh = useCallback(() => setEntries(buildStorage.list()), []);
  useEffect(() => {
    storageEvents.addEventListener('change', refresh);
    return () => storageEvents.removeEventListener('change', refresh);
  }, [refresh]);

  return (
    <main className="page gallery" data-testid="gallery">
      <header className="page-head">
        <h1 className="page-title">Gallery</h1>
        <ImportButton
          className="header-button"
          onDone={() => navigate('configure')}
        />
      </header>

      <section aria-labelledby="your-builds">
        <h2 id="your-builds" className="page-section-title">
          Your builds
        </h2>
        {entries.length === 0 ? (
          <div className="empty" data-testid="gallery-empty">
            <p>Saved builds appear here, with a picture of each one.</p>
            <a className="text-button" href="#/configure">
              Go to the configurator
            </a>
          </div>
        ) : (
          <div className="build-grid">
            {entries.map((entry, i) => (
              <Card key={entry.id} entry={entry} image={entry.thumbnail} large={i === 0} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="starters">
        <h2 id="starters" className="page-section-title">
          Starting points
        </h2>
        <div className="build-grid">
          {STARTER_BUILDS.map((entry, i) => (
            <Card key={entry.id} entry={entry} image={entry.image} starter large={i === 0} onChanged={refresh} />
          ))}
        </div>
      </section>
    </main>
  );
}
