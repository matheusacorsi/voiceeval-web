// Interpreta o mapa de ensaio do ARM (exportado em .xlsx) a partir das matrizes das abas:
// - tabela de tratamentos (linha com "Trt" + "Description")
// - grade de casualizacao (celulas "parcela\ntratamento", ex.: "301\r\n13")
// Regra: partes com "V/V" na descricao sao adjuvantes -> nao entram no rotulo do tratamento.

function isVVAdjuvant(part) {
  return /v\s*\/\s*v/i.test(part);
}

function splitTreatmentDescription(desc) {
  const parts = String(desc || '').split(';').map((s) => s.trim()).filter(Boolean);
  const actives = parts.filter((p) => !isVVAdjuvant(p));
  const adjuvants = parts.filter((p) => isVVAdjuvant(p));
  return { label: actives.join(' + ') || String(desc || '').trim(), adjuvant: adjuvants.join('; ') };
}

function findTreatments(grids) {
  for (const grid of grids) {
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r] || [];
      const low = row.map((c) => String(c == null ? '' : c).trim().toLowerCase());
      const trtCol = low.findIndex((c) => c === 'trt' || c === 'trt.' || c === 'tratamento' || c === 'treatment' || c === 'trat');
      const descCol = low.findIndex((c) => c.startsWith('desc'));
      if (trtCol < 0 || descCol < 0) continue;

      const treatments = [];
      for (let rr = r + 1; rr < grid.length; rr++) {
        const dr = grid[rr] || [];
        const trtNum = parseInt(dr[trtCol], 10);
        if (!Number.isFinite(trtNum) || String(dr[trtCol] == null ? '' : dr[trtCol]).trim() === '') break;
        const desc = dr[descCol];
        if (desc == null || String(desc).trim() === '') continue;
        const { label, adjuvant } = splitTreatmentDescription(desc);
        treatments.push({ trt: trtNum, label, adjuvant, description: String(desc).trim() });
      }
      if (treatments.length) return treatments;
    }
  }
  return [];
}

function findMap(grids) {
  const parcelaToTreatment = {};
  const blocks = new Set();
  for (const grid of grids) {
    for (const row of grid) {
      for (const cell of (row || [])) {
        const mm = /^\s*(\d{2,4})[\r\n]+(\d{1,3})\s*$/.exec(String(cell == null ? '' : cell));
        if (!mm) continue;
        const parcela = parseInt(mm[1], 10);
        parcelaToTreatment[parcela] = parseInt(mm[2], 10);
        blocks.add(Math.floor(parcela / 100));
      }
    }
  }
  return { parcelaToTreatment, blocks };
}

function findTrialId(grids) {
  for (const grid of grids) {
    for (const row of grid) {
      for (let c = 0; c < (row || []).length; c++) {
        if (/^trial id:?$/i.test(String(row[c] == null ? '' : row[c]).trim())) {
          for (let cc = c + 1; cc < row.length; cc++) {
            const v = String(row[cc] == null ? '' : row[cc]).trim();
            if (v) return v;
          }
        }
      }
    }
  }
  // fallback: titulo com "(ID)"
  for (const grid of grids) {
    for (const row of grid) {
      for (const cell of (row || [])) {
        const m = /\(([A-Z0-9][A-Z0-9-]{4,})\)/.exec(String(cell == null ? '' : cell));
        if (m) return m[1];
      }
    }
  }
  return '';
}

/**
 * @returns {{ trialId, treatments:{trt,label,adjuvant,description}[], parcelaToTreatment:Object,
 *            numTreatments:number, numReps:number, blocks:number[] }}
 */
export function parseTrialMap(sheets) {
  const grids = Object.values(sheets || {});
  const treatments = findTreatments(grids);
  const { parcelaToTreatment, blocks } = findMap(grids);
  const trialId = findTrialId(grids);

  const parcelas = Object.keys(parcelaToTreatment).map(Number);
  const trtValues = Object.values(parcelaToTreatment);
  const numTreatments = treatments.length || (trtValues.length ? Math.max(...trtValues) : 0);
  const numReps = blocks.size || (numTreatments ? Math.round(parcelas.length / numTreatments) : 0);

  return { trialId, treatments, parcelaToTreatment, numTreatments, numReps, blocks: [...blocks].sort((a, b) => a - b) };
}

// true quando ha dados uteis (tratamentos ou mapa) para considerar o arquivo valido.
export function trialMapHasData(map) {
  return !!map && (map.treatments.length > 0 || Object.keys(map.parcelaToTreatment).length > 0);
}
