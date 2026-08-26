import { qs, toast, confirmDialog } from '../utils.js';
import { t } from '../i18n.js';
import { getAllPendingEvaluations, getMediaFilesBySession, clearTrialHistory } from '../db.js';
import { session, resetSession } from '../state.js';

const btnIniciar = qs('#btnIniciarAvaliacao');
const btnContinuar = qs('#btnContinuarRascunho');
const btnPendencias = qs('#btnPendenciasOffline');
const btnLimpar = qs('#btnLimparEnsaiosSalvos');
const pendingCount = qs('#pendingCount');
const homeMessage = qs('#homeMessage');

let navigate = null;
let draftToResume = null;

export function initHomeScreen(navigateFn) {
  navigate = navigateFn;

  btnIniciar.addEventListener('click', () => {
    resetSession();
    navigate('identificacao');
  });

  btnContinuar.addEventListener('click', async () => {
    if (draftToResume) await resumeDraft(draftToResume);
  });

  btnPendencias.addEventListener('click', () => navigate('pendencias'));

  btnLimpar.addEventListener('click', async () => {
    const ok = await confirmDialog(t('msg_confirma_limpar_ensaios'));
    if (!ok) return;
    await clearTrialHistory();
    toast(t('msg_ensaios_limpos'));
  });
}

// Retoma um rascunho (avaliacao em andamento) do IndexedDB para a sessao em memoria e vai capturar.
async function resumeDraft(draft) {
  const media = await getMediaFilesBySession(draft.sessionId);
  resetSession();
  const audios = media.filter((m) => m.tipo === 'audio').map((m, i) => ({ id: m.id, blob: m.blob, mime: m.mime, indice: i + 1, duracaoS: m.meta && m.meta.duracaoS, bytes: m.meta && m.meta.bytes, tsInicio: m.meta && m.meta.tsInicio, tsFim: m.meta && m.meta.tsFim, transcript: (m.meta && m.meta.transcript) || '', transcricaoStatus: (m.meta && m.meta.transcricaoStatus) || 'desativada' }));
  const fotos = media.filter((m) => m.tipo === 'foto').map((m, i) => ({ id: m.id, blob: m.blob, mime: m.mime, indice: i + 1, timestamp: m.meta && m.meta.timestamp, audioAnteriorId: (m.meta && m.meta.audioAnteriorId) || null, audioAnteriorIndice: (m.meta && m.meta.audioAnteriorIndice) || null }));
  Object.assign(session, {
    sessionId: draft.sessionId, criadoEm: draft.criadoEm || session.criadoEm, status: 'rascunho',
    nomeEnsaio: draft.nomeEnsaio || '', dataAvaliacao: draft.dataAvaliacao || session.dataAvaliacao, momentoAvaliacao: draft.momentoAvaliacao || '',
    numeroTratamentos: draft.numeroTratamentos || '', numeroRepeticoes: draft.numeroRepeticoes || '',
    tiposAvaliacaoTexto: draft.tiposAvaliacaoTexto || '', itemAvaliado: draft.itemAvaliado || '', pestsAvaliadasTexto: draft.pestsAvaliadasTexto || '',
    escalaNotasTexto: draft.escalaNotasTexto || '', usarSubamostras: !!draft.usarSubamostras, numeroSubamostras: draft.numeroSubamostras || '',
    idiomaFala: draft.idiomaFala || '', modoTranscricao: draft.modoTranscricao || 'nuvem', trialMap: draft.trialMap || null,
    audios, fotos
  });
  navigate('captura');
}

export async function onEnterHome() {
  homeMessage.textContent = '';
  const all = await getAllPendingEvaluations();
  const finalized = all.filter((p) => p.status !== 'rascunho');
  if (finalized.length > 0) {
    pendingCount.textContent = String(finalized.length);
    pendingCount.classList.remove('hidden');
  } else {
    pendingCount.classList.add('hidden');
  }

  // Rascunho abandonado de uma sessao anterior (o app pode ter sido encerrado por uma ligacao).
  const drafts = all.filter((p) => p.status === 'rascunho' && p.sessionId !== session.sessionId && ((p.qtdeAudios || 0) + (p.qtdeFotos || 0)) > 0);
  draftToResume = drafts.sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))[0] || null;
  if (draftToResume) {
    btnContinuar.textContent = `${t('btn_continuar_rascunho')} (${draftToResume.qtdeAudios || 0} áudios, ${draftToResume.qtdeFotos || 0} fotos)`;
    btnContinuar.classList.remove('hidden');
  } else {
    btnContinuar.classList.add('hidden');
  }
}
