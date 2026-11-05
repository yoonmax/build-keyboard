import { memo, useMemo } from 'react';
import { U } from '../layouts/units.js';
import { resolveKeyStyle } from '../model/build.js';
import { describeColor } from '../catalog/colors.js';

/**
 * A flat plan of a layout. Read-only for layout previews. In editor mode, every key is
 * a real button: this is the way to select keys without pointing at the 3D canvas.
 */
export const KeyPlan = memo(function KeyPlan({ layout, keycaps, selected, onSelect, interactive = false, testId }) {
  const selectedSet = useMemo(() => new Set(selected ?? []), [selected]);
  const pitch = 100 / layout.widthU;

  const styles = useMemo(
    () => (keycaps ? new Map(layout.keys.map((k) => [k.id, resolveKeyStyle(k, keycaps)])) : null),
    [layout, keycaps],
  );

  return (
    <div
      className="key-plan"
      data-interactive={interactive || undefined}
      style={{ aspectRatio: `${layout.widthU} / ${layout.depthU}` }}
      data-testid={testId}
    >
      {layout.keys.map((key) => {
        const style = styles?.get(key.id);
        const common = {
          className: 'key-plan-key',
          style: {
            left: `${key.x * pitch}%`,
            top: `${(key.y / layout.depthU) * 100}%`,
            width: `${key.w * pitch}%`,
            height: `${(1 / layout.depthU) * 100}%`,
            '--key': style?.color,
          },
        };
        if (!interactive) return <span key={key.id} {...common} aria-hidden="true" />;
        const label = `${key.legend || 'Spacebar'}, ${key.w}u, ${describeColor(style.color)}`;
        return (
          <button
            key={key.id}
            type="button"
            {...common}
            aria-label={label}
            aria-pressed={selectedSet.has(key.id)}
            data-selected={selectedSet.has(key.id) || undefined}
            data-key={key.id}
            title={key.legend || 'Spacebar'}
            onClick={(e) => onSelect?.(key.id, e.shiftKey)}
          />
        );
      })}
    </div>
  );
});

export const planPitchMM = U;
