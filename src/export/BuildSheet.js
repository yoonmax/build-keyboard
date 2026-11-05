import { CATALOG } from '../catalog/index.js';
import { getLayout } from '../layouts/index.js';
import { U } from '../layouts/units.js';
import { resolveKeyStyle } from '../model/build.js';
import { formatPrice, priceByGroup } from '../model/pricing.js';
import { buildSpecification } from './ConfigurationExporter.js';
import { renderSheetImage } from './ImageExporter.js';

const FONT = '"Hanken Grotesk Variable", Arial, sans-serif';
const INK = '#17181A';
const MUTED = '#6A6963';
const LINE = '#C9C6BE';
const PAPER = '#F2F0EB';

/**
 * A printable build sheet, drawn to scale. Everything on it comes from the build:
 * the render, the key plan with its real colours, the specification and the costs.
 * @returns {Promise<Blob>}
 */
export async function exportBuildSheet(build) {
  const W = 2480;
  const H = 3508;
  const M = 150;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  const spec = buildSpecification(build);
  const layout = getLayout(build.layoutId);

  c.fillStyle = PAPER;
  c.fillRect(0, 0, W, H);

  const text = (value, x, y, { size = 34, weight = 500, color = INK, align = 'left', tracking = 0 } = {}) => {
    c.font = `${weight} ${size}px ${FONT}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.letterSpacing = `${tracking}px`;
    c.fillText(value, x, y);
    c.letterSpacing = '0px';
  };
  const rule = (x0, y, x1, color = LINE, width = 2) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x1, y);
    c.stroke();
  };

  // Header.
  text('BUILD', M, M + 70, { size: 96, weight: 800, tracking: -3 });
  text('Build sheet', W - M, M + 34, { size: 34, align: 'right', color: MUTED });
  text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), W - M, M + 80, {
    size: 34,
    align: 'right',
    color: MUTED,
  });
  rule(M, M + 118, W - M, INK, 4);

  text(build.name, M, M + 240, { size: 112, weight: 700, tracking: -3 });

  // Render.
  const imageW = W - M * 2;
  const imageH = 880;
  const imageY = M + 310;
  const image = await renderSheetImage({ width: imageW, height: imageH, fit: 1.02 });
  const holder = document.createElement('canvas');
  holder.width = imageW;
  holder.height = imageH;
  holder.getContext('2d').putImageData(image, 0, 0);
  c.drawImage(holder, M, imageY);

  // Key plan to scale.
  let y = imageY + imageH + 72;
  text('Key plan', M, y, { size: 38, weight: 650 });
  text(`${layout.fullName}, ${layout.keyCount} keys, ${layout.widthMM.toFixed(1)} × ${layout.depthMM.toFixed(1)} mm`, W - M, y, {
    size: 32,
    color: MUTED,
    align: 'right',
  });
  y += 34;
  const planW = W - M * 2;
  const scale = planW / layout.widthMM;
  for (const key of layout.keys) {
    const style = resolveKeyStyle(key, build.keycaps);
    const x = M + key.x * U * scale;
    const yy = y + key.y * U * scale;
    const w = key.w * U * scale - 6;
    const h = U * scale - 6;
    c.fillStyle = style.color;
    c.strokeStyle = 'rgba(23,24,26,0.32)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(x, yy, w, h, 7);
    c.fill();
    c.stroke();
    if (key.legend && build.keycaps.legendPlacement !== 'blank') {
      text(key.legend, x + 10, yy + 28, { size: key.legend.length > 3 ? 15 : 21, weight: 600, color: style.legendColor });
    }
  }
  y += layout.depthMM * scale + 76;

  // Specification, in two columns.
  const colA = M;
  const colB = W / 2 + 40;
  const colW = W / 2 - M - 40;
  const rows = spec.sections.filter((s) => s.title !== 'Status').flatMap((s) => s.rows);
  text('Specification', colA, y, { size: 38, weight: 650 });
  text('Estimated cost', colB, y, { size: 38, weight: 650 });
  let ya = y + 28;
  rule(colA, ya, colA + colW, INK, 3);
  ya += 46;
  for (const [label, value] of rows) {
    text(label, colA, ya, { size: 27, color: MUTED });
    const lines = wrap(c, value, colW * 0.62, `500 27px ${FONT}`);
    lines.forEach((line, i) => text(line, colA + colW, ya + i * 34, { size: 27, align: 'right' }));
    ya += 10 + 34 * lines.length;
    rule(colA, ya - 20, colA + colW);
    ya += 12;
  }

  let yb = y + 28;
  rule(colB, yb, colB + colW, INK, 3);
  yb += 46;
  for (const group of priceByGroup(spec.price)) {
    text(group.group, colB, yb, { size: 27, color: MUTED });
    text(group.available ? formatPrice(group.amount) : 'Not sold for this layout', colB + colW, yb, { size: 27, align: 'right' });
    yb += 44;
    rule(colB, yb - 20, colB + colW);
    yb += 12;
  }
  text('Total', colB, yb + 14, { size: 44, weight: 700 });
  text(`${formatPrice(spec.price.total)}${spec.price.complete ? '' : ' (incomplete)'}`, colB + colW, yb + 14, {
    size: 44,
    weight: 700,
    align: 'right',
  });
  yb += 64;
  for (const line of wrap(c, spec.price.basis.note, colW, `500 24px ${FONT}`)) {
    text(line, colB, yb, { size: 24, color: MUTED });
    yb += 32;
  }

  yb += 42;
  text('Compatibility', colB, yb, { size: 38, weight: 650 });
  yb += 28;
  rule(colB, yb, colB + colW, INK, 3);
  yb += 48;
  const status = spec.compatibility;
  text(
    status.status === 'valid'
      ? `All ${status.checked} checks passed`
      : status.status === 'warning'
        ? `Buildable, ${status.warnings.length} ${status.warnings.length === 1 ? 'warning' : 'warnings'}`
        : `Not buildable, ${status.errors.length} ${status.errors.length === 1 ? 'error' : 'errors'}`,
    colB,
    yb,
    { size: 30, weight: 650 },
  );
  yb += 44;
  for (const issue of status.issues.slice(0, 5)) {
    for (const line of wrap(c, `${issue.severity === 'error' ? 'Error' : 'Warning'}: ${issue.message}`, colW, `500 24px ${FONT}`)) {
      if (yb > H - M - 70) break;
      text(line, colB, yb, { size: 24 });
      yb += 31;
    }
    yb += 10;
  }

  const sw = CATALOG.switch.get(build.switchId);
  rule(M, H - M - 40, W - M, INK, 3);
  text(`${sw.name} is a generic simulated switch: its figures are representative.`, M, H - M + 6, { size: 25, color: MUTED });
  text('Make it yours.', W - M, H - M + 6, { size: 25, color: MUTED, align: 'right' });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('This browser could not encode the build sheet.');
  return blob;
}

function wrap(c, value, maxWidth, font) {
  c.font = font;
  const words = String(value).split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (c.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}
