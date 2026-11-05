import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { forceAt, sampleCurve } from '../model/switchCurve.js';

const WIDTH = 320;
const HEIGHT = 190;
const PAD = { left: 30, right: 10, top: 12, bottom: 28 };
const MAX_TRAVEL = 4.2;

function pathFor(points, x, y) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${x(p.travel).toFixed(1)} ${y(p.force).toFixed(1)}`).join('');
}

/**
 * Force against travel for a switch. Both strokes are drawn, the press in solid and
 * the return thin and dashed. A comparison switch appears as a dashed line. Line style
 * and direct labels separate the series, so nothing depends on telling hues apart.
 * Hovering reads off exact values. A table holds the same figures for screen readers.
 * An imperative `setMarker` moves the marker directly during animation, with no re-render.
 */
export const ForceCurve = forwardRef(function ForceCurve({ sw, compare, marker = true, compact = false }, ref) {
  const curve = useMemo(() => sampleCurve(sw), [sw]);
  const other = useMemo(() => (compare ? sampleCurve(compare) : null), [compare]);
  const [hover, setHover] = useState(null);
  const markerRef = useRef(null);
  const svgRef = useRef(null);

  const maxForce = Math.max(
    ...curve.down.map((p) => Math.min(p.force, sw.bottomOutForce + 16)),
    ...(other ? other.down.map((p) => Math.min(p.force, compare.bottomOutForce + 16)) : [0]),
    90,
  );
  const scaleMax = Math.ceil(maxForce / 20) * 20;

  const x = (t) => PAD.left + (t / MAX_TRAVEL) * (WIDTH - PAD.left - PAD.right);
  const y = (f) => HEIGHT - PAD.bottom - (Math.min(f, scaleMax) / scaleMax) * (HEIGHT - PAD.top - PAD.bottom);

  useImperativeHandle(
    ref,
    () => ({
      setMarker(travel, direction = 'down') {
        const node = markerRef.current;
        if (!node) return;
        const force = forceAt(sw, travel, direction);
        node.setAttribute('transform', `translate(${x(travel).toFixed(1)} ${y(force).toFixed(1)})`);
      },
    }),
    [sw, scaleMax],
  );

  const ticksY = [];
  for (let f = 0; f <= scaleMax; f += 20) ticksY.push(f);
  const ticksX = [0, 1, 2, 3, 4];

  const onMove = (event) => {
    const box = svgRef.current.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * WIDTH;
    const travel = ((px - PAD.left) / (WIDTH - PAD.left - PAD.right)) * MAX_TRAVEL;
    if (travel < 0 || travel > sw.totalTravel) return setHover(null);
    return setHover({ travel, down: forceAt(sw, travel, 'down'), up: forceAt(sw, travel, 'up') });
  };

  const actuationX = x(sw.actuationDistance);
  const tableSteps = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].filter((t) => t <= sw.totalTravel);

  return (
    <figure className="force-curve" data-compact={compact || undefined}>
      <div className="force-legend" aria-hidden="true">
        <span className="legend-item">
          <i className="legend-line" />
          Press
        </span>
        <span className="legend-item">
          <i className="legend-line legend-thin" />
          Return
        </span>
        {compare ? (
          <span className="legend-item">
            <i className="legend-line legend-dash" />
            {compare.name}
          </span>
        ) : null}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Force against travel for ${sw.name}. Reaches ${Math.round(curve.actuationForce)} gram-force at ${sw.actuationDistance} millimetres.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticksY.map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(f)} y2={y(f)} className="chart-grid" />
            <text x={PAD.left - 6} y={y(f) + 3} className="chart-tick" textAnchor="end">
              {f}
            </text>
          </g>
        ))}
        {ticksX.map((t) => (
          <text key={t} x={x(t)} y={HEIGHT - PAD.bottom + 13} className="chart-tick" textAnchor="middle">
            {t}
          </text>
        ))}
        <text x={WIDTH - PAD.right} y={HEIGHT - 3} className="chart-tick" textAnchor="end">
          Travel, mm
        </text>
        <text x={PAD.left + 3} y={PAD.top + 8} className="chart-tick">
          Force, gf
        </text>

        <line x1={actuationX} x2={actuationX} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="chart-actuation" />
        <text x={actuationX + 4} y={PAD.top + 20} className="chart-tick">
          Actuates
        </text>

        {other ? <path d={pathFor(other.down, x, y)} className="chart-line chart-line-compare" /> : null}
        <path d={pathFor(curve.up, x, y)} className="chart-line chart-line-up" />
        <path d={pathFor(curve.down, x, y)} className="chart-line" />

        {hover ? (
          <g>
            <line x1={x(hover.travel)} x2={x(hover.travel)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="chart-cross" />
            <circle cx={x(hover.travel)} cy={y(hover.down)} r="3.5" className="chart-dot" />
          </g>
        ) : null}

        {marker ? (
          <g ref={markerRef} transform={`translate(${x(0)} ${y(forceAt(sw, 0))})`} data-testid="curve-marker">
            <circle r="5.5" className="chart-marker-ring" />
            <circle r="3.5" className="chart-marker" />
          </g>
        ) : null}
      </svg>
      <figcaption className="force-readout" aria-live="off">
        {hover ? (
          <>
            <b>{hover.travel.toFixed(2)} mm</b>: {Math.round(hover.down)} gf pressing, {Math.round(hover.up)} gf returning
          </>
        ) : (
          <>Representative curve. Hover to read values.</>
        )}
      </figcaption>
      <table className="sr-only">
        <caption>Force for {sw.name}, in gram-force</caption>
        <thead>
          <tr>
            <th>Travel (mm)</th>
            <th>Pressing</th>
            <th>Returning</th>
          </tr>
        </thead>
        <tbody>
          {tableSteps.map((t) => (
            <tr key={t}>
              <td>{t}</td>
              <td>{Math.round(forceAt(sw, t, 'down'))}</td>
              <td>{Math.round(forceAt(sw, t, 'up'))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
});
