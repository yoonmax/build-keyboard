import { useId, useMemo, useState } from 'react';
import { contrastRatio } from '../model/build.js';
import { describeColor } from '../catalog/colors.js';

/** A small status mark that pairs with a word. Colour never carries meaning alone. */
export function StatusGlyph({ status }) {
  if (status === 'error') {
    return (
      <svg className="glyph glyph-error" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2.2 2.2l7.6 7.6M9.8 2.2L2.2 9.8" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    );
  }
  if (status === 'warning') {
    return (
      <svg className="glyph glyph-warning" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 1.4L11 10.4H1z" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <path d="M6 5v2.6M6 8.6v.9" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  return (
    <svg className="glyph glyph-ok" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1.8 6.4l2.8 2.8 5.6-6" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

/** One choosable row. Shows what choosing it would do before it is chosen. */
export function Option({ name, detail, note, price, selected, status = 'ok', statusText, onClick, children, testId }) {
  return (
    <button
      type="button"
      className="option"
      role="radio"
      aria-checked={Boolean(selected)}
      data-selected={selected || undefined}
      data-status={status}
      data-testid={testId}
      onClick={onClick}
    >
      <span className="option-head">
        <span className="option-name">{name}</span>
        {price ? <span className="option-price">{price}</span> : null}
      </span>
      {detail ? <span className="option-detail">{detail}</span> : null}
      {note ? <span className="option-note">{note}</span> : null}
      {children}
      {status !== 'ok' && statusText ? (
        <span className="option-status" data-tone={status}>
          <StatusGlyph status={status} />
          <span>{statusText}</span>
        </span>
      ) : null}
    </button>
  );
}

/** A group of Options, announced as one choice to assistive technology. */
export function OptionGroup({ label, children, hint }) {
  const id = useId();
  return (
    <section className="option-group">
      <h3 id={id} className="group-label">
        {label}
      </h3>
      {hint ? <p className="group-hint">{hint}</p> : null}
      <div role="radiogroup" aria-labelledby={id} className="option-list">
        {children}
      </div>
    </section>
  );
}

/** A colour swatch that always has its name. */
export function Swatch({ hex, name, selected, onClick, testId, disabled }) {
  return (
    <button
      type="button"
      className="swatch"
      data-selected={selected || undefined}
      aria-pressed={Boolean(selected)}
      aria-label={name}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="swatch-chip" style={{ background: hex }} />
      <span className="swatch-name">{name}</span>
    </button>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Colour field: native picker, typed hex and a plain-language name, so the choice can
 * be read and set without relying on colour vision or a precise pointer.
 */
export function ColorField({ label, value, onChange, testId, against }) {
  const id = useId();
  const [draft, setDraft] = useState(null);
  const shown = draft ?? value;
  const contrast = useMemo(() => (against ? contrastRatio(value, against) : null), [value, against]);
  return (
    <div className="color-field">
      <label htmlFor={id} className="color-label">
        {label}
      </label>
      <span className="color-controls">
        <input
          type="color"
          className="color-native"
          aria-label={`${label}, colour picker`}
          value={value.toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          data-testid={testId ? `${testId}-picker` : undefined}
        />
        <input
          id={id}
          className="color-hex"
          value={shown}
          spellCheck={false}
          maxLength={7}
          data-testid={testId}
          aria-invalid={draft !== null && !HEX.test(draft)}
          onChange={(e) => {
            const next = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            setDraft(next);
            if (HEX.test(next)) onChange(next.toUpperCase());
          }}
          onBlur={() => setDraft(null)}
        />
      </span>
      <span className="color-name">
        {describeColor(value)}
        {contrast !== null && contrast < 3 ? ', low contrast with the key colour' : ''}
      </span>
    </div>
  );
}

/** A labelled range slider, with its value in words. */
export function Slider({ label, value, min, max, step, onChange, format, testId, disabled }) {
  const id = useId();
  return (
    <div className="slider">
      <label htmlFor={id} className="slider-head">
        <span>{label}</span>
        <span className="slider-value">{format ? format(value) : value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        data-testid={testId}
        aria-valuetext={format ? format(value) : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Toggle({ label, checked, onChange, testId, note }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span className="toggle-track" aria-hidden="true" />
      <span className="toggle-label">
        {label}
        {note ? <span className="toggle-note">{note}</span> : null}
      </span>
    </label>
  );
}
