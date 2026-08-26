import { qs, toast } from '../utils.js';
import { t, getLang } from '../i18n.js';
import { session } from '../state.js';
import { runPipeline, joinTranscripts } from '../postprocess/pipeline.js';
import { exportEvaluationXlsx } from '../postprocess/xlsx.js';
import { exportFiles } from '../sync.js';

const revisaoResumo = qs('#revisaoResumo');
const revisaoVazio = qs('#revisaoVazio');
const tabela = qs('#tabelaRevisao');
const btnAddLinha = qs('#btnAddLinha');
const btnAddColuna = qs('#btnAddColuna');
const btnExportar = qs('#btnExportarExcel');
const btnVoltar = qs('#btnVoltarRevisao');
const transcricaoTexto = qs('#revisaoTranscricaoTexto');

let navigate = null;
// Modelo editavel: colunas de item (sem "Parcela") + linhas {Parcela, <col>: valor}.
let model = { columns: [], rows: [] };

function escapeAttr(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  const body = `<tbody>${model.rows.map((row, ri) => `<tr>
    <td><input type="text" inputmode="numeric" class="cell-input cell-parcela" data-row="${ri}" data-field="Parcela" value="${escapeAttr(row.Parcela)}" /></td>
    ${model.columns.map((c, ci) => `<td><input type="text" inputmode="decimal" class="cell-input" data-row="${ri}" data-col="${ci}" value="${escapeAttr(row[c])}" /></td>`).join('')}
    <td><button type="button" class="cell-del" data-del-row="${ri}" aria-label="${escapeAttr(t('aria_remover_linha'))}">&times;</button></td>
  </tr>`).join('')}</tbody>`;

  tabela.innerHTML = head + body;
  revisaoVazio.classList.toggle('hidden', model.rows.length > 0);
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
  const delRow = e.target.getAttribute('data-del-row');
  if (delRow !== null) {
    model.rows.splice(Number(delRow), 1);
    renderTable();
  }
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

async function exportarExcel() {
  if (model.rows.length === 0) {
    toast(t('msg_revisao_sem_dados'));
    return;
  }
  const tabelaFinal = buildTabelaFinal();
  const columns = ['Parcela', ...model.columns];
  const meta = {
    ensaio: session.nomeEnsaio,
    data: session.dataAvaliacao,
    refFotos: session.momentoAvaliacao,
    language: getLang()
  };
  const { blob, fileName } = await exportEvaluationXlsx({ tabelaFinal, columns, plants: null, meta });
  try {
    await exportFiles([{ name: fileName, blob }]);
    toast(t('msg_excel_exportado'));
  } catch (err) {
    if (!(err && err.name === 'AbortError')) toast(t('msg_erro_camera'));
  }
}

export function initReviewScreen(navigateFn) {
  navigate = navigateFn;
  tabela.addEventListener('input', onTableInput);
  tabela.addEventListener('click', onTableClick);
  btnAddLinha.addEventListener('click', addRow);
  btnAddColuna.addEventListener('click', addColumn);
  btnExportar.addEventListener('click', exportarExcel);
  btnVoltar.addEventListener('click', () => navigate('captura'));
}

export async function onEnterReview() {
  revisaoResumo.textContent = `${session.nomeEnsaio} ${session.momentoAvaliacao ? '· ' + session.momentoAvaliacao : ''}`;
  const raw = joinTranscripts(session.audios);
  transcricaoTexto.textContent = raw || '—';
  const parsed = await runPipeline(raw);
  model = modelFromParsed(parsed);
  renderTable();
}
