import { useEffect, useMemo, useRef, useState } from 'react';
import { exportBuildSheet } from '../export/BuildSheet.js';
import {
  buildSpecification,
  deserializeBuild,
  downloadBlob,
  fileNameFor,
  serializeBuild,
  specificationText,
} from '../export/ConfigurationExporter.js';
import { formatPrice, priceByGroup } from '../model/pricing.js';
import { useConfigurator } from '../state/configuratorStore.js';

/** Keeps Tab inside an open dialog. */
export function trapTab(event, container) {
  if (event.key !== 'Tab' || !container) return;
  const items = [...container.querySelectorAll('button, a[href], input, select, textarea')].filter(
    (el) => !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null,
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Modal with focus moved in and held there, Escape to leave, and focus handed back on close. */
function Modal({ title, onClose, children, testId, wide }) {
  const closeRef = useRef(null);
  // A stable listener: re-attaching during a key event would make that event miss it.
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') latestClose.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid={testId}
      onKeyDown={(e) => trapTab(e, e.currentTarget)}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal sheet" data-wide={wide || undefined}>
        <div className="part-head">
          <h2 className="modal-title">{title}</h2>
          <button type="button" ref={closeRef} className="icon-close" aria-label="Close" data-testid="modal-close" onClick={onClose}>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function useSheetActions() {
  const build = useConfigurator((s) => s.build);
  const showToast = useConfigurator((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  return {
    busy,
    async copySpec() {
      try {
        await navigator.clipboard.writeText(specificationText(build));
        showToast('Copied the specification.', 'good');
      } catch {
        showToast('This browser blocked clipboard access. Use Download JSON instead.', 'bad');
      }
    },
    downloadJson() {
      const blob = new Blob([serializeBuild(build)], { type: 'application/json' });
      downloadBlob(blob, fileNameFor(build.name, 'json'));
      showToast('Downloaded the configuration as JSON.', 'good');
    },
    async downloadSheet() {
      setBusy(true);
      try {
        const blob = await exportBuildSheet(build);
        downloadBlob(blob, `${fileNameFor(build.name, 'png').replace('.png', '')}-build-sheet.png`);
        showToast('Downloaded the build sheet.', 'good');
      } catch (error) {
        showToast(error?.message ?? 'The build sheet could not be created.', 'bad');
      } finally {
        setBusy(false);
      }
    },
  };
}

/** The specification as a clean document. */
export function SpecSheet() {
  const open = useConfigurator((s) => s.ui.specOpen);
  const setUi = useConfigurator((s) => s.setUi);
  const build = useConfigurator((s) => s.build);
  const spec = useMemo(() => (open ? buildSpecification(build) : null), [open, build]);
  const actions = useSheetActions();
  if (!open) return null;
  return (
    <Modal title={spec.name} testId="spec-sheet" wide onClose={() => setUi({ specOpen: false })}>
      <div className="spec-doc">
        {spec.sections.map((section) => (
          <section key={section.title} className="spec-section">
            <h3 className="group-label">{section.title}</h3>
            <dl className="spec-list">
              {section.rows.map(([label, value]) => (
                <div className="spec-row" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <section className="spec-section">
          <h3 className="group-label">Estimated cost</h3>
          <dl className="spec-list">
            {priceByGroup(spec.price).map((group) => (
              <div className="spec-row" key={group.group}>
                <dt>{group.group}</dt>
                <dd>{group.available ? formatPrice(group.amount) : 'Not sold for this layout'}</dd>
              </div>
            ))}
          </dl>
          <p className="sheet-note">{spec.price.basis.note}</p>
        </section>
      </div>
      <div className="button-row button-row-end">
        <button type="button" className="text-button" data-testid="spec-copy" onClick={actions.copySpec}>
          Copy specification
        </button>
        <button type="button" className="text-button" data-testid="spec-json" onClick={actions.downloadJson}>
          Download JSON
        </button>
        <button type="button" className="text-button" data-testid="spec-sheet-image" disabled={actions.busy} onClick={actions.downloadSheet}>
          {actions.busy ? 'Rendering…' : 'Download build sheet'}
        </button>
      </div>
    </Modal>
  );
}

/** Reads a chosen file, checks it and loads it. */
export function ImportButton({ className = 'text-button', label = 'Import JSON', onDone }) {
  const inputRef = useRef(null);
  const loadBuild = useConfigurator((s) => s.loadBuild);
  const showToast = useConfigurator((s) => s.showToast);
  const [errors, setErrors] = useState(null);
  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    const result = deserializeBuild(text);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors(null);
    loadBuild(result.build, null);
    showToast(
      result.warnings.length
        ? `Imported "${result.build.name}". ${result.warnings.length} invalid ${result.warnings.length === 1 ? 'value was' : 'values were'} replaced.`
        : `Imported "${result.build.name}".`,
      'good',
    );
    onDone?.();
  };
  return (
    <span className="import">
      <button type="button" className={className} data-testid="import-json" onClick={() => inputRef.current?.click()}>
        {label}
      </button>
      <input ref={inputRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="import-file" onChange={onFile} />
      {errors ? (
        <span className="form-error" role="alert" data-testid="import-error">
          {errors.join(' ')}
        </span>
      ) : null}
    </span>
  );
}

/** All the ways to take a build out of the app. */
export function ExportSheet() {
  const open = useConfigurator((s) => s.ui.exportOpen);
  const setUi = useConfigurator((s) => s.setUi);
  const actions = useSheetActions();
  if (!open) return null;
  const close = () => setUi({ exportOpen: false });
  return (
    <Modal title="Export" testId="export-sheet" onClose={close}>
      <div className="export-list">
        <button
          type="button"
          className="export-row"
          data-testid="export-open-studio"
          onClick={() => {
            close();
            setUi({ studioOpen: true, exportOpen: false });
          }}
        >
          <b>Image</b>
          <span>Set up a shot in the studio and export a high-resolution PNG.</span>
        </button>
        <button type="button" className="export-row" data-testid="export-sheet-image" disabled={actions.busy} onClick={actions.downloadSheet}>
          <b>{actions.busy ? 'Rendering build sheet…' : 'Build sheet'}</b>
          <span>A printable A4 sheet with a render, key plan, specification and costs.</span>
        </button>
        <button type="button" className="export-row" data-testid="export-json" onClick={actions.downloadJson}>
          <b>Configuration JSON</b>
          <span>The full build, to back up or share. It can be imported again.</span>
        </button>
        <button type="button" className="export-row" data-testid="export-copy" onClick={actions.copySpec}>
          <b>Copy specification</b>
          <span>A plain-text parts list for your clipboard.</span>
        </button>
      </div>
      <div className="button-row button-row-end">
        <ImportButton onDone={close} />
      </div>
    </Modal>
  );
}

export function Toast() {
  const toast = useConfigurator((s) => s.toast);
  const dismiss = useConfigurator((s) => s.dismissToast);
  if (!toast) return null;
  return (
    <div className="toast" role="status" data-tone={toast.tone} data-testid="toast">
      <span>{toast.message}</span>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={dismiss}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
    </div>
  );
}
