// Boxplot em <canvas> puro (sem dependencias): estatistica (min/Q1/mediana/Q3/max/media) e desenho.
// Agrupado por tratamento na tela de revisao para inspecionar dispersao e achar valores errados.

function quantile(sorted, q) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export function computeBox(values) {
  const vals = (values || []).filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  const n = vals.length;
  if (!n) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  return { n, min: vals[0], max: vals[n - 1], q1: quantile(vals, 0.25), median: quantile(vals, 0.5), q3: quantile(vals, 0.75), mean };
}

function fmt(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Desenha o boxplot. width/height sao as dimensoes LOGICAS (o chamador ja aplicou o devicePixelRatio
// via ctx.setTransform), entao o layout usa width/height e nao canvas.width.
export function drawBoxplot(canvas, { title, yLabel, groups, width, height }) {
  const ctx = canvas.getContext('2d');
  const W = width || canvas.width;
  const H = height || canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const all = [];
  for (const g of groups) for (const v of (g.values || [])) if (Number.isFinite(v)) all.push(v);
  if (!all.length) {
    ctx.fillStyle = '#666'; ctx.font = '14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Sem dados numericos para este item.', 16, 30);
    return;
  }

  const dataMin = Math.min(...all);
  const dataMax = Math.max(...all);
  let yMin = all.every((v) => v >= 0) ? 0 : dataMin;
  let yMax = dataMax;
  if (yMin === yMax) yMax = yMin + 1;
  const pad = (yMax - yMin) * 0.08 || 1;
  yMax += pad;
  if (yMin < 0) yMin -= pad;

  const mL = 46, mR = 14, mT = 32, mB = 118;
  const plotW = W - mL - mR;
  const plotH = H - mT - mB;
  const y = (v) => mT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  ctx.fillStyle = '#26437c'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(truncate(title || '', 40), W / 2, 20);

  // grade + ticks Y
  ctx.strokeStyle = '#e6e6e6'; ctx.lineWidth = 1; ctx.font = '11px sans-serif';
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const val = yMin + (i / ticks) * (yMax - yMin);
    const yy = y(val);
    ctx.beginPath(); ctx.moveTo(mL, yy); ctx.lineTo(W - mR, yy); ctx.stroke();
    ctx.fillStyle = '#666'; ctx.textAlign = 'right';
    ctx.fillText(fmt(val), mL - 6, yy + 4);
  }

  ctx.save();
  ctx.translate(12, mT + plotH / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.fillStyle = '#444'; ctx.font = '12px sans-serif';
  ctx.fillText(yLabel || '', 0, 0);
  ctx.restore();

  const slot = plotW / groups.length;
  const bw = Math.min(38, slot * 0.5);
  groups.forEach((g, i) => {
    const cx = mL + slot * (i + 0.5);
    const b = computeBox(g.values);
    if (b) {
      ctx.strokeStyle = '#3860b2'; ctx.fillStyle = 'rgba(56,96,178,0.15)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, y(b.max)); ctx.lineTo(cx, y(b.q3));
      ctx.moveTo(cx, y(b.q1)); ctx.lineTo(cx, y(b.min));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - bw / 3, y(b.max)); ctx.lineTo(cx + bw / 3, y(b.max));
      ctx.moveTo(cx - bw / 3, y(b.min)); ctx.lineTo(cx + bw / 3, y(b.min));
      ctx.stroke();
      const yTop = y(b.q3), yBot = y(b.q1);
      ctx.beginPath(); ctx.rect(cx - bw / 2, yTop, bw, Math.max(1, yBot - yTop)); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#26437c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - bw / 2, y(b.median)); ctx.lineTo(cx + bw / 2, y(b.median)); ctx.stroke();
      ctx.fillStyle = '#b23838';
      ctx.beginPath(); ctx.arc(cx, y(b.mean), 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#26437c'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(fmt(b.mean), cx, y(b.max) - 6);
    }
    ctx.save();
    ctx.translate(cx, mT + plotH + 8); ctx.rotate(-Math.PI / 4);
    ctx.textAlign = 'right'; ctx.fillStyle = '#444'; ctx.font = '10px sans-serif';
    ctx.fillText(truncate(g.label, 30), 0, 0);
    ctx.restore();
  });
}
