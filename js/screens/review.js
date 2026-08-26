import { qs, toast, confirmDialog } from '../utils.js';
import { t, getLang } from '../i18n.js';
import { session, resetSession } from '../state.js';
import { runPipeline, joinTranscripts, subsampleOptionsFromSession, guideFromSession, applyGuide } from '../postprocess/pipeline.js';
import { buildPhotoNames } from '../postprocess/photos.js';
import { drawBoxplot } from '../postprocess/boxplot.js';
import { buildDeliveryFiles } from '../summary.js';
import { deletePendingEvaluation, deleteMediaFilesBySession } from '../db.js';
import { exportFiles } from '../sync.js';

const revisaoResumo = qs('#revisaoResumo');
const revisaoIncompletas = qs('#revisaoIncompletas');
const revisaoVazio = qs('#revisaoVazio');
const tabela = qs('#tabelaRevisao');
const btnAddLinha = qs('#btnAddLinha');
const btnAddColuna = qs('#btnAddColuna');
const btnExportar = qs('#btnExportarExcel');
const btnVoltar = qs('#btnVoltarRevisao');
const transcricaoTexto = qs('#revisaoTranscricaoTexto');
const revisaoFotos = qs('#revisaoFotos');
const revisaoFotosLista = qs('#revisaoFotosLista');
const revisaoBoxplots = qs('#revisaoBoxplots');
const boxplotBtns = qs('#boxplotBtns');
const boxplotModal = qs('#boxplotModal');
const boxplotCanvas = qs('#boxplotCanvas');
const boxplotClose = qs('#boxplotClose');

let navigate = null;
// Modelo editavel: colunas de item (sem "Parcela") + linhas {Parcela, <col>: valor}.
let model = { columns: [], rows: [] };

function escapeAttr(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isBlankCell(v) {
  const s = String(v == null ? '' : v).trim();
  return s === '' || s === '.';
}

// Parcela pendente: nao perdida e com ao menos uma coluna sem nota.
function rowIncomplete(row) {
  if (row._perdida) return false;
  return model.columns.some((c) => isBlankCell(row[c]));
}

// Destaca celulas sem nota (parcelas nao perdidas) e atualiza o aviso de parcelas incompletas.
function updateValidation() {
  let incompletas = 0;
  for (let ri = 0; ri < model.rows.length; ri++) {
    const row = model.rows[ri];
    if (rowIncomplete(row)) incompletas++;
    for (let ci = 0; ci < model.columns.length; ci++) {
      const input = tabela.querySelector(`.cell-input[data-row="${ri}"][data-col="${ci}"]`);
      if (input) input.classList.toggle('missing', !row._perdida && isBlankCell(row[model.columns[ci]]));
    }
  }
  if (incompletas > 0) {
    revisaoIncompletas.textContent = t('msg_parcelas_incompletas', { n: incompletas, total: model.rows.length });
    revisaoIncompletas.classList.remove('hidden');
  } else {
    revisaoIncompletas.classList.add('hidden');
  }
}

// Preview (somente leitura) do renomeio de fotos por parcela.
function renderPhotos() {
  const fotos = session.fotos || [];
  if (!fotos.length) { revisaoFotos.classList.add('hidden'); return; }
  const names = buildPhotoNames(session.audios, fotos);
  revisaoFotosLista.innerHTML = names.map((p) => {
    const parcelaLbl = p.parcela != null ? `${t('lbl_coluna_parcela')} ${p.parcela}` : t('lbl_foto_sem_parcela');
    return `<li><span>#${p.originalIndice} · ${escapeAttr(parcelaLbl)}</span><span class="muted">${escapeAttr(p.name)}</span></li>`;
  }).join('');
  revisaoFotos.classList.remove('hidden');
}

// Converte a saida do parser (tabela_final + columns) no modelo editavel.
function modelFromParsed(parsed) {
  const columns = (parsed.columns || []).filter((c) => c !== 'Parcela');
  const rows = (parsed.tabela_final || []).map((r) => {
    const row = { Parcela: r.Parcela };
    for (const c of columns) row[c] = r[c] === undefined || r[c] === '.' ? '' : r[c];
    return row;
  });
  return { columns, rows };
}

function renderTable() {
  const parcelaLbl = t('lbl_coluna_parcela');
  const head = `<thead><tr>
    <th>${escapeAttr(parcelaLbl)}</th>
    ${model.columns.map((c, ci) => `<th>
      <input type="text" class="cell-input col-head input-uppercase" data-col="${ci}" value="${escapeAttr(c)}" />
      <button type="button" class="cell-del" data-del-col="${ci}" aria-label="${escapeAttr(t('aria_remover_coluna'))}">&times;</button>
    </th>`).join('')}
    <th></th>
  </tr></thead>`;

  const body = `<tbody>${model.rows.map((row, ri) => {
    const perdida = !!row._perdida;
    return `<tr class="${perdida ? 'row-perdida' : ''}">
    <td><input type="text" inputmode="numeric" enterkeyhint="next" class="cell-input cell-parcela" data-row="${ri}" data-field="Parcela" value="${escapeAttr(row.Parcela)}" /></td>
    ${model.columns.map((c, ci) => `<td><input type="text" inputmode="decimal" enterkeyhint="next" class="cell-input" data-row="${ri}" data-col="${ci}" value="${escapeAttr(perdida ? '' : row[c])}"${perdida ? ' disabled' : ''} /></td>`).join('')}
    <td class="cell-actions">
      <button type="button" class="cell-perdida${perdida ? ' on' : ''}" data-perdida-row="${ri}" title="${escapeAttr(t('btn_parcela_perdida'))}" aria-label="${escapeAttr(t('btn_parcela_perdida'))}">&#8709;</button>
      <button type="button" class="cell-del" data-del-row="${ri}" aria-label="${escapeAttr(t('aria_remover_linha'))}">&times;</button>
    </td>
  </tr>`;
  }).join('')}</tbody>`;

  tabela.innerHTML = head + body;
  revisaoVazio.classList.toggle('hidden', model.rows.length > 0);
  updateValidation();
}

function onTableInput(e) {
  const el = e.target;
  if (!el.classList || !el.classList.contains('cell-input')) return;

  if (el.classList.contains('col-head')) {
    const ci = Number(el.dataset.col);
    const oldName = model.columns[ci];
    const newName = el.value.trim().toUpperCase();
    if (!newName || newName === oldName) return;
    model.columns[ci] = newName;
    for (const row of model.rows) {
      row[newName] = row[oldName];
      if (oldName !== newName) delete row[oldName];
    }
    return;
  }

  const ri = Number(el.dataset.row);
  if (el.dataset.field === 'Parcela') {
    model.rows[ri].Parcela = el.value;
  } else {
    const col = model.columns[Number(el.dataset.col)];
    model.rows[ri][col] = el.value;
  }
  updateValidation();
}

function onTableClick(e) {
  const delCol = e.target.getAttribute('data-del-col');
  if (delCol !== null) {
    const ci = Number(delCol);
    const name = model.columns[ci];
    model.columns.splice(ci, 1);
    for (const row of model.rows) delete row[name];
    renderTable();
    return;
  }
  const perdRow = e.target.getAttribute('data-perdida-row');
  if (perdRow !== null) {
    const ri = Number(perdRow);
    const row = model.rows[ri];
    row._perdida = !row._perdida;
    if (row._perdida) for (const c of model.columns) row[c] = '';
    renderTable();
    return;
  }
  const delRow = e.target.getAttribute('data-del-row');
  if (delRow !== null) {
    model.rows.splice(Number(delRow), 1);
    renderTable();
  }
}

function focusCell(el) {
  if (!el) return;
  el.focus();
  if (typeof el.select === 'function') el.select();
}

// Proxima celula editavel em ordem coluna-a-coluna (desce a coluna; no fim vai ao topo da proxima),
// pulando celulas desabilitadas (parcelas perdidas). Devolve null quando nao ha mais.
function findNextEditable(fromRow, fromCol) {
  const nCols = model.columns.length;
  const nRows = model.rows.length;
  let ri = fromRow;
  let ci = fromCol;
  for (let guard = 0; guard < nRows * nCols + nCols; guard++) {
    ri += 1;
    if (ri >= nRows) { ri = 0; ci += 1; }
    if (ci >= nCols) return null;
    const input = tabela.querySelector(`.cell-input[data-row="${ri}"][data-col="${ci}"]`);
    if (input && !input.disabled) return input;
  }
  return null;
}

// Enter numa celula avanca para a proxima parcela (mesma coluna). Da o Enter/avancar onde a tecla
// existe (Android, teclado fisico); no iPhone o teclado numerico nao tem Enter (limitacao do iOS).
function onTableKeydown(e) {
  if (e.key !== 'Enter') return;
  const el = e.target;
  if (!el.classList || !el.classList.contains('cell-input')) return;
  e.preventDefault();
  if (el.classList.contains('col-head')) { el.blur(); return; }
  const ri = Number(el.dataset.row);
  if (el.dataset.field === 'Parcela') {
    const first = tabela.querySelector(`.cell-input[data-row="${ri}"][data-col="0"]`);
    focusCell(first && !first.disabled ? first : findNextEditable(ri, 0));
    return;
  }
  const ci = Number(el.dataset.col);
  const next = findNextEditable(ri, ci);
  if (next) focusCell(next); else el.blur();
}

function addRow() {
  const row = { Parcela: '' };
  for (const c of model.columns) row[c] = '';
  model.rows.push(row);
  renderTable();
  // Foca a nova celula de parcela.
  const inputs = tabela.querySelectorAll('.cell-parcela');
  const last = inputs[inputs.length - 1];
  if (last) last.focus();
}

function addColumn() {
  let n = model.columns.length + 1;
  let name = `ITEM${n}`;
  while (model.columns.includes(name)) name = `ITEM${++n}`;
  model.columns.push(name);
  for (const row of model.rows) row[name] = '';
  renderTable();
  // Foca o cabecalho novo para renomear.
  const heads = tabela.querySelectorAll('.col-head');
  const last = heads[heads.length - 1];
  if (last) { last.focus(); last.select(); }
}

// Converte uma celula digitada em valor para exportacao: vazio -> ".", numero -> Number, senao string.
function cellForExport(value) {
  const s = String(value == null ? '' : value).trim();
  if (s === '' || s === '.') return '.';
  const num = Number(s.replace(',', '.'));
  return Number.isFinite(num) && /^-?\d+(?:[.,]\d+)?$/.test(s) ? num : s;
}

function buildTabelaFinal() {
  return model.rows.map((row) => {
    const parcelaStr = String(row.Parcela == null ? '' : row.Parcela).trim();
    const asInt = parseInt(parcelaStr, 10);
    const out = { Parcela: String(asInt) === parcelaStr ? asInt : parcelaStr };
    for (const c of model.columns) out[c] = cellForExport(row[c]);
    return out;
  });
}

// Exporta o PACOTE COMPLETO (resumo + transcricao + audios + fotos + Excel revisado) num unico ZIP
// e transmite. Depois limpa a pendencia e volta ao inicio (mesma conclusao da transmissao direta).
async function exportarPacote() {
  const incompletas = model.rows.filter(rowIncomplete).length;
  if (incompletas > 0) {
    const ok = await confirmDialog(t('msg_confirmar_exportar_incompletas', { n: incompletas }));
    if (!ok) return;
  }
  const tabelaFinal = buildTabelaFinal();
  const columns = ['Parcela', ...model.columns];
  const files = await buildDeliveryFiles(session, session.audios, session.fotos, { tabelaFinal, columns, language: getLang() });
  try {
    await exportFiles(files);
  } catch (err) {
    if (err && err.name === 'AbortError') return; // usuario cancelou o compartilhamento
    toast(t('msg_erro_camera'));
    return;
  }
  await deletePendingEvaluation(session.sessionId);
  await deleteMediaFilesBySession(session.sessionId);
  toast(t('msg_transmissao_sucesso'));
  resetSession();
  navigate('inicio');
}

export function initReviewScreen(navigateFn) {
  navigate = navigateFn;
  tabela.addEventListener('input', onTableInput);
  tabela.addEventListener('click', onTableClick);
  tabela.addEventListener('keydown', onTableKeydown);
  btnAddLinha.addEventListener('click', addRow);
  btnAddColuna.addEventListener('click', addColumn);
  btnExportar.addEventListener('click', exportarPacote);
  btnVoltar.addEventListener('click', () => navigate('captura'));
  boxplotBtns.addEventListener('click', (e) => {
    const pest = e.target.getAttribute('data-pest');
    if (pest) openBoxplot(pest);
  });
  boxplotClose.addEventListener('click', () => boxplotModal.classList.add('hidden'));
  boxplotModal.addEventListener('click', (e) => { if (e.target === boxplotModal) boxplotModal.classList.add('hidden'); });
}

// ---- Boxplots por praga (agrupados por tratamento via mapa do ensaio) ----
const SUB_RE = /^(.+)_S(\d{2,})$/;

function pestNames() {
  const out = [];
  for (const col of model.columns) {
    const m = SUB_RE.exec(col);
    const pest = m ? m[1] : col;
    if (!out.includes(pest)) out.push(pest);
  }
  return out;
}

// Valor da parcela para uma praga = media das colunas dessa praga (subamostras) naquela linha.
function seriesForPest(pest) {
  const cols = model.columns.filter((col) => { const m = SUB_RE.exec(col); return (m ? m[1] : col) === pest; });
  const valueByParcela = new Map();
  for (const row of model.rows) {
    const parcela = parseInt(row.Parcela, 10);
    if (!Number.isFinite(parcela)) continue;
    const vals = [];
    for (const c of cols) {
      const raw = row[c];
      if (raw === '' || raw == null || raw === '.') continue;
      const nn = Number(String(raw).replace(',', '.'));
      if (Number.isFinite(nn)) vals.push(nn);
    }
    if (vals.length) valueByParcela.set(parcela, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return valueByParcela;
}

function groupsByTreatment(valueByParcela) {
  const map = session.trialMap;
  const byTrt = new Map();
  for (const [parcela, value] of valueByParcela) {
    const trt = map.parcelaToTreatment[parcela];
    if (trt == null) continue;
    if (!byTrt.has(trt)) byTrt.set(trt, []);
    byTrt.get(trt).push(value);
  }
  const label = (trt) => { const x = map.treatments.find((tt) => tt.trt === trt); return x && x.label ? `${trt} - ${x.label}` : String(trt); };
  return [...byTrt.entries()].sort((a, b) => a[0] - b[0]).map(([trt, values]) => ({ label: label(trt), values }));
}

function hasTrialMap() {
  return !!(session.trialMap && session.trialMap.parcelaToTreatment && Object.keys(session.trialMap.parcelaToTreatment).length);
}

function renderBoxplotButtons() {
  if (!hasTrialMap() || !model.columns.length) { revisaoBoxplots.classList.add('hidden'); return; }
  boxplotBtns.innerHTML = pestNames()
    .map((p) => `<button type="button" class="btn secondary" data-pest="${escapeAttr(p)}">${escapeAttr(t('btn_boxplot'))}: ${escapeAttr(p)}</button>`)
    .join('');
  revisaoBoxplots.classList.remove('hidden');
}

function openBoxplot(pest) {
  const groups = groupsByTreatment(seriesForPest(pest));
  const width = Math.max(340, groups.length * 62 + 70);
  const height = 420;
  const dpr = window.devicePixelRatio || 1;
  boxplotCanvas.width = Math.round(width * dpr);
  boxplotCanvas.height = Math.round(height * dpr);
  boxplotCanvas.style.width = width + 'px';
  boxplotCanvas.style.height = height + 'px';
  boxplotCanvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoxplot(boxplotCanvas, { title: pest, yLabel: t('lbl_valor'), groups, width, height });
  boxplotModal.classList.remove('hidden');
}

// Marca as parcelas ditas como perdidas (comando de voz) e limpa suas celulas.
function applyPerdidas(perdidas) {
  const set = new Set((perdidas || []).map(Number));
  if (!set.size) return;
  for (const row of model.rows) {
    if (set.has(Number(row.Parcela))) {
      row._perdida = true;
      for (const c of model.columns) row[c] = '';
    }
  }
}

// Deriva as opcoes de subamostra a partir da configuracao da avaliacao.
export async function onEnterReview() {
  revisaoResumo.textContent = `${session.nomeEnsaio} ${session.momentoAvaliacao ? '· ' + session.momentoAvaliacao : ''}`;
  const raw = joinTranscripts(session.audios);
  transcricaoTexto.textContent = raw || '—';
  const parsed = await runPipeline(raw, subsampleOptionsFromSession(session));
  const guided = applyGuide(parsed.tabela_final, parsed.columns, guideFromSession(session));
  model = modelFromParsed(guided);
  applyPerdidas(parsed.perdidas);
  renderTable();
  renderPhotos();
  renderBoxplotButtons();
}
