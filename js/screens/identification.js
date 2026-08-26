import { qs, qsa, toast } from '../utils.js';
import { t } from '../i18n.js';
import { getAllTrialHistory } from '../db.js';
import { session, loadIdentification } from '../state.js';
import { readXlsx } from '../postprocess/xlsx_read.js';
import { parseTrialMap, trialMapHasData } from '../postprocess/trialmap.js';

const form = qs('#formIdentificacao');
const inputNome = qs('#inputNomeEnsaio');
const inputData = qs('#inputDataAvaliacao');
const inputMomento = qs('#inputMomentoAvaliacao');
const inputTratamentos = qs('#inputNumeroTratamentos');
const inputRepeticoes = qs('#inputNumeroRepeticoes');
const trialHistoryList = qs('#trialHistoryList');
const btnAbrirHistorico = qs('#btnAbrirHistoricoEnsaios');
const historicoPanel = qs('#historicoEnsaiosPanel');
const btnVoltar = qs('#btnVoltarIdentificacao');
const inputTrialFile = qs('#inputTrialFile');
const trialFileStatus = qs('#trialFileStatus');

let navigate = null;

function fillFormFromSession() {
  inputNome.value = session.nomeEnsaio || '';
  inputData.value = session.dataAvaliacao;
  inputMomento.value = session.momentoAvaliacao || '';
  inputTratamentos.value = session.numeroTratamentos || '';
  inputRepeticoes.value = session.numeroRepeticoes || '';
}

async function renderHistoryOptions() {
  const history = await getAllTrialHistory();
  trialHistoryList.innerHTML = history.map((h) => `<option value="${escapeHtml(h.nomeEnsaio)}"></option>`).join('');
  return history;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function applyHistoryItem(item) {
  inputNome.value = item.nomeEnsaio;
  inputTratamentos.value = item.numeroTratamentos || '';
  inputRepeticoes.value = item.numeroRepeticoes || '';
  Object.assign(session, {
    tiposAvaliacaoTexto: item.tiposAvaliacaoTexto || '',
    itemAvaliado: item.itemAvaliado || '',
    pestsAvaliadasTexto: item.pestsAvaliadasTexto || '',
    escalaNotasTexto: item.escalaNotasTexto || '',
    usarSubamostras: !!item.usarSubamostras,
    numeroSubamostras: item.numeroSubamostras || ''
  });
  historicoPanel.classList.add('hidden');
}

function showTrialStatus(map) {
  trialFileStatus.textContent = t('msg_trial_carregado', { t: map.numTreatments, r: map.numReps, id: map.trialId || '-' });
  trialFileStatus.classList.remove('hidden');
}

// Le o .xlsx do ARM (opcional), extrai tratamentos + mapa e pre-preenche os campos.
async function onTrialFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const { sheets } = await readXlsx(await file.arrayBuffer());
    const map = parseTrialMap(sheets);
    if (!trialMapHasData(map)) throw new Error('sem dados');
    session.trialMap = map;
    if (!inputNome.value.trim() && map.trialId) inputNome.value = map.trialId;
    if (map.numTreatments) inputTratamentos.value = map.numTreatments;
    if (map.numReps) inputRepeticoes.value = map.numReps;
    showTrialStatus(map);
  } catch (err) {
    session.trialMap = null;
    trialFileStatus.textContent = t('msg_trial_erro');
    trialFileStatus.classList.remove('hidden');
  }
}

export function initIdentificationScreen(navigateFn) {
  navigate = navigateFn;

  inputTrialFile.addEventListener('change', onTrialFile);

  btnAbrirHistorico.addEventListener('click', async () => {
    const isHidden = historicoPanel.classList.contains('hidden');
    if (isHidden) {
      const history = await renderHistoryOptions();
      historicoPanel.innerHTML = history.length
        ? history.map((h, i) => `<button type="button" class="item" data-idx="${i}">${escapeHtml(h.nomeEnsaio)} &middot; ${h.numeroTratamentos || '-'}T / ${h.numeroRepeticoes || '-'}R</button>`).join('')
        : `<p class="muted">${t('msg_nenhuma_pendencia')}</p>`;
      qsa('button.item', historicoPanel).forEach((btn) => {
        btn.addEventListener('click', () => applyHistoryItem(history[Number(btn.dataset.idx)]));
      });
      historicoPanel.classList.remove('hidden');
    } else {
      historicoPanel.classList.add('hidden');
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      nomeEnsaio: inputNome.value.trim(),
      dataAvaliacao: inputData.value,
      momentoAvaliacao: inputMomento.value.trim(),
      numeroTratamentos: Number(inputTratamentos.value),
      numeroRepeticoes: Number(inputRepeticoes.value)
    };
    if (!data.nomeEnsaio || !data.dataAvaliacao || !data.numeroTratamentos || !data.numeroRepeticoes) {
      toast(t('msg_preencha_campos'));
      return;
    }
    loadIdentification(data);
    navigate('config');
  });

  btnVoltar.addEventListener('click', () => navigate('inicio'));
}

export async function onEnterIdentification() {
  fillFormFromSession();
  historicoPanel.classList.add('hidden');
  if (session.trialMap && trialMapHasData(session.trialMap)) showTrialStatus(session.trialMap);
  else trialFileStatus.classList.add('hidden');
  await renderHistoryOptions();
}
