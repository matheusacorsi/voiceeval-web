// Exportador .xlsx (SpreadsheetML minimo, sem dependencias) — porte de excel_exporter.py.
// Gera as abas FORMATO_FINAL e LISTA_COPIAR_COLAR reaproveitando o escritor ZIP (js/zip.js).
// Um .xlsx e apenas um ZIP de partes XML (OPC), entao o metodo "stored" do zip.js serve.
import { createZipBlob } from '../zip.js';

const LABELS = {
  pt: { parcela: 'Parcela', nota: 'Nota', escala: 'Escala', formatoFinal: 'FORMATO_FINAL', lista: 'LISTA_COPIAR_COLAR', avaliacao: 'Avaliacao' },
  en: { parcela: 'Plot', nota: 'Note', escala: 'Scale', formatoFinal: 'FINAL_FORMAT', lista: 'COPY_PASTE_LIST', avaliacao: 'Evaluation' },
  es: { parcela: 'Parcela', nota: 'Nota', escala: 'Escala', formatoFinal: 'FORMATO_FINAL', lista: 'LISTA_COPIAR_PEGAR', avaliacao: 'Evaluacion' },
};

function labelsFor(language) {
  const key = String(language || 'pt').trim().toLowerCase().slice(0, 2);
  return LABELS[key] || LABELS.pt;
}

const SUBSAMPLE_RE = /^(.+)_S(\d{2,})$/;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Indice de coluna (1-based) -> letra(s) A, B, ..., Z, AA, AB...
function colLetter(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const EMPTY = new Set(['', '.', null, undefined]);
function isEmptyCell(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'number') return Number.isNaN(v);
  return EMPTY.has(String(v).trim());
}

// Uma celula: null/'' -> vazia; number -> numerica; senao string inline.
function cellXml(value, rowIdx, colIdx) {
  const ref = colLetter(colIdx) + rowIdx;
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(rows) {
  const body = rows.map((cells, r) => {
    const rowIdx = r + 1;
    const cellsXml = cells.map((v, c) => cellXml(v, rowIdx, c + 1)).join('');
    return `<row r="${rowIdx}">${cellsXml}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

// Monta as partes OPC e devolve o Blob .xlsx. sheets = [{name, rows}] (rows = matriz de celulas).
export async function buildXlsxBlob(sheets) {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`;

  const asBlob = (text) => new Blob([text], { type: 'application/xml' });
  const files = [
    { name: '[Content_Types].xml', blob: asBlob(contentTypes) },
    { name: '_rels/.rels', blob: asBlob(rootRels) },
    { name: 'xl/workbook.xml', blob: asBlob(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', blob: asBlob(workbookRels) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, blob: asBlob(sheetXml(s.rows)) })),
  ];

  const zip = await createZipBlob(files);
  return zip.slice(0, zip.size, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// Renomeia coluna interna "<ITEM>_S01" -> "<ITEM>1" (so na exibicao da planilha).
function displayColumn(col) {
  const m = SUBSAMPLE_RE.exec(String(col));
  return m ? `${m[1]}${parseInt(m[2], 10)}` : String(col);
}

function sortByParcela(rows) {
  return [...rows].sort((a, b) => {
    const na = Number(a.Parcela), nb = Number(b.Parcela);
    const aNum = Number.isFinite(na), bNum = Number.isFinite(nb);
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    return String(a.Parcela).localeCompare(String(b.Parcela));
  });
}

// Aba FORMATO_FINAL: linha1 = [ensaio, data, refFotos]; linha2 = cabecalho (celula vazia sobre a
// coluna Parcela); demais linhas = 1 por parcela. Colunas de subamostra exibidas sem "_S".
export function buildFormatoFinalRows(tabelaFinal, columns, meta) {
  const dataCols = (columns || []).filter((c) => c !== 'Parcela');
  const header = ['', ...dataCols.map(displayColumn)];
  const meta1 = [meta && meta.ensaio ? meta.ensaio : '', meta && meta.data ? meta.data : '', meta && meta.refFotos ? meta.refFotos : ''];
  const rows = [meta1, header];
  for (const row of sortByParcela(tabelaFinal || [])) {
    const line = [row.Parcela];
    for (const col of dataCols) {
      const v = row[col];
      line.push(v === undefined ? '.' : v);
    }
    rows.push(line);
  }
  return rows;
}

// Aba LISTA_COPIAR_COLAR (2 colunas). So existe quando ha exatamente UM item com colunas de
// subamostra "<ITEM>_S0N" na tabela, OU quando ha protocolo de plantas (Davis) ativo.
// Devolve null quando nao se aplica.
export function buildListaCopiarColarRows(tabelaFinal, columns, plants, language) {
  const labels = labelsFor(language);

  // Protocolo de plantas (Davis) tem prioridade.
  if (plants && plants.protocolo && plants.avaliacaoPlantas && Object.keys(plants.avaliacaoPlantas).length) {
    const expected = parseInt(plants.protocolo.expected_subsamples_per_plot || 0, 10);
    const scaleName = String(plants.protocolo.scale_name || '').trim();
    const valorLabel = scaleName ? `${labels.escala} ${scaleName}` : labels.nota;
    const rows = [[labels.parcela, valorLabel]];
    const parcelas = Object.keys(plants.avaliacaoPlantas).sort((a, b) => Number(a) - Number(b));
    for (const p of parcelas) {
      const values = (plants.avaliacaoPlantas[p] && plants.avaliacaoPlantas[p].values) || {};
      for (let i = 1; i <= expected; i++) {
        const v = values[`planta_${i}`];
        rows.push([i === 1 ? Number(p) : '', v === undefined || v === null ? '' : v]);
      }
    }
    return rows.length > 1 ? rows : null;
  }

  // Subamostras genericas: exatamente um item com colunas "_S".
  const groups = new Map();
  for (const col of columns || []) {
    const m = SUBSAMPLE_RE.exec(String(col));
    if (!m) continue;
    const base = m[1];
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push({ index: parseInt(m[2], 10), col: String(col) });
  }
  if (groups.size !== 1) return null;

  const [base, indexed] = [...groups.entries()][0];
  const ordered = indexed.sort((a, b) => a.index - b.index).map((x) => x.col);
  const rows = [[labels.parcela, base]];
  for (const row of sortByParcela(tabelaFinal || [])) {
    ordered.forEach((col, pos) => {
      const v = row[col];
      rows.push([pos === 0 ? row.Parcela : '', isEmptyCell(v) ? '' : v]);
    });
  }
  return rows.length > 1 ? rows : null;
}

// Nome do arquivo: "<Avaliacao>_<ensaio>_<data DD-MM-AA>_<refFotos>.xlsx" (partes vazias omitidas).
function sanitize(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9.-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '').replace(/_+/g, '_');
}

function dateForFilename(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) return `${m[3]}-${m[2]}-${m[1].slice(2)}`;
  m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(raw);
  if (m) return `${m[1]}-${m[2]}-${m[3].slice(2)}`;
  return sanitize(raw);
}

export function buildXlsxFileName(meta) {
  const labels = labelsFor(meta && meta.language);
  const ensaio = sanitize(meta && meta.ensaio);
  const data = dateForFilename(meta && meta.data);
  if (!ensaio && !data) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    return `avaliacao_${ts}.xlsx`;
  }
  const parts = [sanitize(labels.avaliacao) || 'Avaliacao'];
  for (const p of [ensaio, data, sanitize(meta && meta.refFotos)]) if (p) parts.push(p);
  return parts.join('_') + '.xlsx';
}

// Ponto de entrada: monta o workbook completo a partir da saida do parser.
export async function exportEvaluationXlsx({ tabelaFinal, columns, plants, meta }) {
  const labels = labelsFor(meta && meta.language);
  const sheets = [{ name: labels.formatoFinal, rows: buildFormatoFinalRows(tabelaFinal, columns, meta) }];
  const lista = buildListaCopiarColarRows(tabelaFinal, columns, plants, meta && meta.language);
  if (lista) sheets.push({ name: labels.lista, rows: lista });
  const blob = await buildXlsxBlob(sheets);
  return { blob, fileName: buildXlsxFileName(meta) };
}
