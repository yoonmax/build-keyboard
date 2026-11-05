import { useMemo } from 'react';
import { inspectorContent } from '../model/inspector.js';
import { calculatePrice, formatPrice, priceByGroup } from '../model/pricing.js';
import { useConfigurator } from '../state/configuratorStore.js';
import { StatusGlyph } from './primitives.jsx';
import { ForceCurve } from './ForceCurve.jsx';
import { CATALOG } from '../catalog/index.js';

function Issue({ issue }) {
  const apply = useConfigurator((s) => s.applySuggestion);
  return (
    <li className="issue" data-tone={issue.severity} data-testid="compat-issue" data-rule={issue.ruleId}>
      <p className="issue-message">
        <StatusGlyph status={issue.severity} />
        <span>
          <b>{issue.severity === 'error' ? 'Error.' : 'Warning.'}</b> {issue.message}
        </span>
      </p>
      {issue.suggestions.length ? (
        <div className="issue-fixes">
          {issue.suggestions.slice(0, 2).map((s) => (
            <button
              key={`${s.category}-${s.optionId}`}
              type="button"
              className="fix"
              data-testid={`fix-${s.optionId}`}
              onClick={() => apply(s)}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/** Whether the parts work together, in plain words. */
function CompatibilitySummary() {
  const compatibility = useConfigurator((s) => s.compatibility);
  const { status, errors, warnings, checked, issues } = compatibility;
  const headline =
    status === 'valid'
      ? 'Everything fits'
      : status === 'warning'
        ? `Buildable, with ${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`
        : `Can't be built: ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}`;
  return (
    <section className="sheet-section" aria-labelledby="compat-title" data-testid="compat-summary" data-status={status}>
      <h2 id="compat-title" className="sheet-title">
        <StatusGlyph status={status === 'valid' ? 'ok' : status} />
        <span aria-live="polite">{headline}</span>
      </h2>
      {status === 'valid' ? <p className="sheet-note">{checked} checks passed across every component.</p> : null}
      {issues.length ? (
        <ul className="issue-list">
          {issues.map((issue) => (
            <Issue key={`${issue.ruleId}-${issue.message}`} issue={issue} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PriceBreakdown() {
  const build = useConfigurator((s) => s.build);
  const price = useMemo(() => calculatePrice(build), [build]);
  const groups = useMemo(() => priceByGroup(price), [price]);
  return (
    <section className="sheet-section" aria-labelledby="price-title">
      <h2 id="price-title" className="sheet-title">
        Estimated cost
      </h2>
      <dl className="price-list">
        {groups.map((group) => (
          <div key={group.group} className="price-row">
            <dt>
              {group.group}
              {group.lines[0].quantity > 1 ? <span className="price-qty"> × {group.lines[0].quantity}</span> : null}
            </dt>
            <dd data-testid={`price-${group.group}`}>{group.available ? formatPrice(group.amount) : 'Not sold'}</dd>
          </div>
        ))}
        <div className="price-row price-total-row">
          <dt>Total</dt>
          <dd data-testid="price-total">
            {price.complete ? null : <span className="price-flag">incomplete </span>}
            {formatPrice(price.total)}
          </dd>
        </div>
      </dl>
      <p className="sheet-note">{price.basis.note}</p>
    </section>
  );
}

/** Details of the selected part. Each kind of part has its own content. */
function PartDetail({ content }) {
  const setUi = useConfigurator((s) => s.setUi);
  const clearSelection = useConfigurator((s) => s.clearSelection);
  const build = useConfigurator((s) => s.build);
  return (
    <section className="sheet-section" data-testid="part-detail" data-kind={content.kind}>
      <div className="part-head">
        <h2 className="part-title" data-testid="part-title">
          {content.title}
        </h2>
        <button type="button" className="icon-close" aria-label="Close details" onClick={clearSelection}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </div>
      <p className="part-subtitle">{content.subtitle}</p>
      <dl className="spec-list">
        {content.rows.map(([label, value]) => (
          <div key={label} className="spec-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {content.kind === 'switch' ? <ForceCurve sw={CATALOG.switch.get(build.switchId)} marker={false} compact /> : null}
      <p className="part-notes">{content.notes}</p>
      {content.price ? <p className="part-price">{content.price}</p> : null}
      {content.issues.length ? (
        <ul className="issue-list">
          {content.issues.map((issue) => (
            <Issue key={`${issue.ruleId}-${issue.message}`} issue={issue} />
          ))}
        </ul>
      ) : (
        <p className="part-ok">
          <StatusGlyph status="ok" /> Compatible with the rest of this build.
        </p>
      )}
      <div className="button-row">
        {content.customize ? (
          <button
            type="button"
            className="text-button"
            data-testid="part-customize"
            onClick={() => setUi({ category: content.customize, leftOpen: true })}
          >
            Change this part
          </button>
        ) : null}
        {content.kind === 'switch' ? (
          <button
            type="button"
            className="text-button"
            onClick={() => setUi({ switchMacroId: build.switchId })}
            data-testid="part-macro"
          >
            Inspect up close
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function Inspector() {
  const selection = useConfigurator((s) => s.ui.selection);
  const build = useConfigurator((s) => s.build);
  const compatibility = useConfigurator((s) => s.compatibility);
  const open = useConfigurator((s) => s.ui.rightOpen);
  const setUi = useConfigurator((s) => s.setUi);
  const content = useMemo(() => inspectorContent(selection, build, compatibility), [selection, build, compatibility]);

  return (
    <aside className="sheet inspector" data-open={open || undefined} aria-label="Inspector" data-reveal="right">
      {content ? (
        <PartDetail content={content} />
      ) : (
        <>
          <CompatibilitySummary />
          <PriceBreakdown />
          <button type="button" className="wide-button wide-button-sheet" data-testid="open-spec" onClick={() => setUi({ specOpen: true })}>
            View specification sheet
          </button>
        </>
      )}
    </aside>
  );
}
