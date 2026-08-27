import { qs, toast, formatDuration, formatBytes, uuid } from '../utils.js';
import { t, getLang } from '../i18n.js';
import { session, addAudio, removeAudio, addFoto, removeFoto, resetSession } from '../state.js';
import { AudioRecorderController } from '../recorder.js';
import { capturePhoto } from '../photo.js';
import { savePendingEvaluation, saveMediaFile, saveTrialHistory, deletePendingEvaluation, deleteMediaFile, deleteMediaFilesBySession, getSetting, setSetting } from '../db.js';
import { buildResumoMarkdown, buildDeliveryFiles } from '../summary.js';
import { exportFiles } from '../sync.js';
import { CloudTranscriber, LocalTranscriber, getTranscriptionCapabilities, mapUiLangToSpeech } from '../transcription.js';

const resumoCaptura = qs('#resumoCaptura');
const micButton = qs('#micButton');
const statusGravacao = qs('#statusGravacao');
const contadorAudios = qs('#contadorAudios');
const contadorFotos = qs('#contadorFotos');
const audioList = qs('#audioList');
const btnTirarFoto = qs('#btnTirarFoto');
const btnRemoverUltimaFoto = qs('#btnRemoverUltimaFoto');
const btnFinalizar = qs('#btnFinalizarAvaliacao');
const btnRevisarExcel = qs('#btnRevisarExcel');
const btnTransmitir = qs('#btnTransmitirAvaliacao');
const btnSalvarOffline = qs('#btnSalvarAvaliacaoOffline');
const btnVoltar = qs('#btnVoltarCaptura');
const btnConcluirTrecho = qs('#btnConcluirTrecho');
const selIdiomaFala = qs('#selIdiomaFala');
const selModoTranscricao = qs('#selModoTranscricao');
const statusTranscricao = qs('#statusTranscricao');
const btnImportarAudio = qs('#btnImportarAudio');
const inputImportarAudio = qs('#inputImportarAudio');

let navigate = null;
let cloudTranscriber = null;
let pendingLocalPromises = [];
const recorder = new AudioRecorderController({ onStatusChange: updateMicUi, onInterrupt: onRecorderInterrupt });

function updateMicUi(state) {
  micButton.classList.toggle('recording', state === 'recording');
  btnConcluirTrecho.classList.toggle('hidden', state === 'idle');
  if (state === 'recording') statusGravacao.textContent = t('status_gravando');
  else if (state === 'paused') statusGravacao.textContent = t('status_audio_pausado');
  else statusGravacao.textContent = t('status_audio_inicio');
  refreshCaptureLockState();
}

function renderAudioList() {
  contadorAudios.textContent = String(session.audios.length);
  audioList.innerHTML = session.audios.map((a) => `
    <li data-id="${a.id}">
      <span>#${a.indice} &middot; ${formatDuration(a.duracaoS)} &middot; ${formatBytes(a.bytes)}</span>
      <button type="button" data-remove-audio="${a.id}" aria-label="remover">&times;</button>
    </li>`).join('');
  refreshCaptureLockState();
}

// Fotos nao sao pre-visualizadas (privacidade/performance): so o contador e um botao de desfazer.
function renderFotoCounter() {
  contadorFotos.textContent = String(session.fotos.length);
  btnRemoverUltimaFoto.classList.toggle('hidden', session.fotos.length === 0);
  refreshCaptureLockState();
}

function refreshCaptureLockState() {
  const finalized = session.status === 'finalizada';
  const emAndamento = session.audios.length > 0 || session.fotos.length > 0 || recorder.state !== 'idle';
  btnFinalizar.classList.toggle('hidden', finalized);
  btnRevisarExcel.classList.toggle('hidden', !finalized);
  btnTransmitir.classList.toggle('hidden', !finalized);
  btnTirarFoto.disabled = finalized;
  btnRemoverUltimaFoto.disabled = finalized;
  micButton.disabled = finalized;
  // Uma vez iniciada a captura (audio ou foto), nao ha mais como voltar: a avaliacao precisa ser finalizada.
  btnVoltar.disabled = finalized || emAndamento;
  audioList.querySelectorAll('button').forEach((b) => (b.disabled = finalized));
}

function showTranscricaoStatus(text) {
  statusTranscricao.textContent = text || '';
  statusTranscricao.classList.toggle('hidden', !text);
}

function updateTranscricaoIndicator() {
  showTranscricaoStatus(pendingLocalPromises.length > 0 ? t('status_transcrevendo') : '');
}

function startCloudIfNeeded() {
  if (session.modoTranscricao !== 'nuvem') return;
  if (!getTranscriptionCapabilities().cloud) return;
  cloudTranscriber = new CloudTranscriber({ lang: session.idiomaFala });
  if (!cloudTranscriber.start()) cloudTranscriber = null;
}

function scheduleLocalTranscription(clip) {
  const local = new LocalTranscriber({
    onProgress: (pct) => showTranscricaoStatus(t('status_baixando_modelo', { pct }))
  });
  const p = local.transcribeBlob(clip.blob, session.idiomaFala).then(async ({ transcript, status }) => {
    const target = session.audios.find((a) => a.id === clip.id) || clip;
    target.transcript = transcript;
    target.transcricaoStatus = status;
    // atualiza o rascunho salvo com a transcricao resolvida
    try {
      await saveMediaFile({ id: clip.id, sessionId: session.sessionId, tipo: 'audio', blob: clip.blob, mime: clip.mime, indice: target.indice, meta: { duracaoS: target.duracaoS, bytes: target.bytes, tsInicio: target.tsInicio, tsFim: target.tsFim, transcript, transcricaoStatus: status } });
    } catch { /* best-effort */ }
  });
  pendingLocalPromises.push(p);
  updateTranscricaoIndicator();
  p.finally(() => {
    pendingLocalPromises = pendingLocalPromises.filter((x) => x !== p);
    updateTranscricaoIndicator();
  });
}

async function waitForPendingLocal() {
  if (pendingLocalPromises.length === 0) return;
  showTranscricaoStatus(t('status_transcrevendo'));
  await Promise.allSettled(pendingLocalPromises);
  updateTranscricaoIndicator();
}

// Encerra o trecho de audio atual e resolve sua transcricao conforme o modo escolhido.
// Usada ao concluir manualmente, ao finalizar/salvar e ao tirar foto (auto-segmentacao).
async function finishCurrentClip() {
  if (recorder.state === 'idle') return null;
  const clip = await recorder.stopAndGetClip();
  await processClip(clip);
  return clip;
}

// Processa um trecho ja materializado (conclusao normal OU interrupcao): define a transcricao,
// adiciona a sessao e SALVA na hora no IndexedDB (rascunho incremental).
async function processClip(clip) {
  let cloudResult = null;
  if (cloudTranscriber) {
    cloudResult = await cloudTranscriber.stopAndGetResult();
    cloudTranscriber = null;
  }

  if (session.modoTranscricao === 'desativada') {
    clip.transcript = '';
    clip.transcricaoStatus = 'desativada';
  } else if (session.modoTranscricao === 'local') {
    clip.transcript = '';
    clip.transcricaoStatus = 'processando';
  } else {
    clip.transcript = cloudResult ? cloudResult.transcript : '';
    clip.transcricaoStatus = cloudResult ? cloudResult.status : 'indisponivel';
  }

  addAudio(clip);
  await saveAudioDraft(clip);
  renderAudioList();
  if (session.modoTranscricao === 'local') scheduleLocalTranscription(clip);
  updateTranscricaoIndicator();
}

// Interrupcao externa (ligacao/mic tomado): o recorder ja entregou o trecho parcial gravado.
function onRecorderInterrupt(clip) {
  processClip(clip).catch(() => {}).finally(() => toast(t('msg_gravacao_interrompida')));
}

// Duracao de um arquivo de audio (metadados), sem decodificar o audio inteiro.
function audioDuration(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
    a.src = url;
  });
}

// Importa uma gravacao feita no app de voz nativo (que grava com a tela bloqueada) como um trecho.
// Audio de arquivo so pode ser transcrito localmente (Whisper): a nuvem/Web Speech e ao vivo.
async function handleImportAudio(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const duracaoS = await audioDuration(url);
  URL.revokeObjectURL(url);
  const now = new Date().toISOString();
  const clip = { id: uuid(), blob: file, mime: file.type || 'audio/mp4', tsInicio: now, tsFim: now, duracaoS, bytes: file.size };
  const desativada = session.modoTranscricao === 'desativada';
  clip.transcript = '';
  clip.transcricaoStatus = desativada ? 'desativada' : 'processando';
  addAudio(clip);
  await saveAudioDraft(clip);
  renderAudioList();
  if (!desativada) scheduleLocalTranscription(clip); // arquivo -> sempre transcricao local
  updateTranscricaoIndicator();
  toast(t('msg_audio_importado'));
}

// App foi para segundo plano enquanto gravava (ligacao, troca de app, tela bloqueada): conclui e
// salva o trecho atual para nao perder o audio caso o SO encerre a aba.
function handleBackgroundInterruption() {
  if (recorder.state === 'idle') return;
  finishCurrentClip().then(() => toast(t('msg_gravacao_interrompida'))).catch(() => {});
}

// --- Persistencia incremental (rascunho): cada trecho/foto vai pro IndexedDB na hora ---
async function saveAudioDraft(a) {
  try {
    await saveMediaFile({ id: a.id, sessionId: session.sessionId, tipo: 'audio', blob: a.blob, mime: a.mime, indice: a.indice, meta: { duracaoS: a.duracaoS, bytes: a.bytes, tsInicio: a.tsInicio, tsFim: a.tsFim, transcript: a.transcript || '', transcricaoStatus: a.transcricaoStatus || 'desativada' } });
    await saveDraftRecord();
  } catch { /* best-effort */ }
}

async function saveFotoDraft(f) {
  try {
    await saveMediaFile({ id: f.id, sessionId: session.sessionId, tipo: 'foto', blob: f.blob, mime: f.mime, indice: f.indice, meta: { timestamp: f.timestamp, audioAnteriorId: f.audioAnteriorId || null, audioAnteriorIndice: f.audioAnteriorIndice || null } });
    await saveDraftRecord();
  } catch { /* best-effort */ }
}

// Upsert do registro de rascunho (status 'rascunho') para permitir retomar depois de uma interrupcao.
async function saveDraftRecord() {
  if (session.status === 'finalizada') return;
  await savePendingEvaluation({
    sessionId: session.sessionId,
    nomeEnsaio: session.nomeEnsaio, dataAvaliacao: session.dataAvaliacao, momentoAvaliacao: session.momentoAvaliacao,
    numeroTratamentos: session.numeroTratamentos, numeroRepeticoes: session.numeroRepeticoes,
    tiposAvaliacaoTexto: session.tiposAvaliacaoTexto, itemAvaliado: session.itemAvaliado, pestsAvaliadasTexto: session.pestsAvaliadasTexto,
    escalaNotasTexto: session.escalaNotasTexto, usarSubamostras: session.usarSubamostras, numeroSubamostras: session.numeroSubamostras,
    idiomaFala: session.idiomaFala, modoTranscricao: session.modoTranscricao, trialMap: session.trialMap || null,
    qtdeFotos: session.fotos.length, qtdeAudios: session.audios.length,
    status: 'rascunho', criadoEm: session.criadoEm
  });
}

async function persistEvaluation() {
  await waitForPendingLocal();
  session.finalizadoEm = new Date().toISOString();
  session.status = 'finalizada';

  await saveTrialHistory({
    nomeEnsaio: session.nomeEnsaio,
    numeroTratamentos: session.numeroTratamentos,
    numeroRepeticoes: session.numeroRepeticoes,
    tiposAvaliacaoTexto: session.tiposAvaliacaoTexto,
    itemAvaliado: session.itemAvaliado,
    pestsAvaliadasTexto: session.pestsAvaliadasTexto,
    escalaNotasTexto: session.escalaNotasTexto,
    usarSubamostras: session.usarSubamostras,
    numeroSubamostras: session.numeroSubamostras
  });

  const resumoMD = buildResumoMarkdown(session, session.audios, session.fotos);
  session.resumoMD = resumoMD;

  await savePendingEvaluation({
    sessionId: session.sessionId,
    nomeEnsaio: session.nomeEnsaio,
    dataAvaliacao: session.dataAvaliacao,
    momentoAvaliacao: session.momentoAvaliacao,
    numeroTratamentos: session.numeroTratamentos,
    numeroRepeticoes: session.numeroRepeticoes,
    tiposAvaliacaoTexto: session.tiposAvaliacaoTexto,
    itemAvaliado: session.itemAvaliado,
    pestsAvaliadasTexto: session.pestsAvaliadasTexto,
    escalaNotasTexto: session.escalaNotasTexto,
    usarSubamostras: session.usarSubamostras,
    numeroSubamostras: session.numeroSubamostras,
    idiomaFala: session.idiomaFala,
    modoTranscricao: session.modoTranscricao,
    resumoMD,
    qtdeFotos: session.fotos.length,
    qtdeAudios: session.audios.length,
    status: 'finalizada',
    criadoEm: session.criadoEm,
    finalizadoEm: session.finalizadoEm
  });

  for (const a of session.audios) {
    await saveMediaFile({ id: a.id, sessionId: session.sessionId, tipo: 'audio', blob: a.blob, mime: a.mime, indice: a.indice, meta: { duracaoS: a.duracaoS, bytes: a.bytes, tsInicio: a.tsInicio, tsFim: a.tsFim, transcript: a.transcript || '', transcricaoStatus: a.transcricaoStatus || 'desativada' } });
  }
  for (const f of session.fotos) {
    await saveMediaFile({ id: f.id, sessionId: session.sessionId, tipo: 'foto', blob: f.blob, mime: f.mime, indice: f.indice, meta: { timestamp: f.timestamp, audioAnteriorId: f.audioAnteriorId || null, audioAnteriorIndice: f.audioAnteriorIndice || null } });
  }

  refreshCaptureLockState();
}

async function buildExportZip() {
  // Pacote completo, incluindo o Excel gerado automaticamente das transcricoes (sem revisao).
  return buildDeliveryFiles(session, session.audios, session.fotos, { language: getLang() });
}

export function initCaptureScreen(navigateFn) {
  navigate = navigateFn;

  selIdiomaFala.addEventListener('change', async () => {
    session.idiomaFala = selIdiomaFala.value;
    await setSetting('idiomaFala', selIdiomaFala.value);
  });

  selModoTranscricao.addEventListener('change', async () => {
    session.modoTranscricao = selModoTranscricao.value;
    await setSetting('modoTranscricao', selModoTranscricao.value);
  });

  micButton.addEventListener('click', async () => {
    try {
      if (recorder.state === 'idle') {
        await recorder.start();
        startCloudIfNeeded();
      } else if (recorder.state === 'recording') {
        recorder.pause();
      } else if (recorder.state === 'paused') {
        recorder.resume();
      }
    } catch {
      toast(t('msg_erro_microfone'));
    }
  });

  btnConcluirTrecho.addEventListener('click', async () => {
    await finishCurrentClip();
  });

  btnImportarAudio.addEventListener('click', () => inputImportarAudio.click());
  inputImportarAudio.addEventListener('change', async () => {
    const file = inputImportarAudio.files && inputImportarAudio.files[0];
    inputImportarAudio.value = '';
    try {
      await handleImportAudio(file);
    } catch {
      toast(t('msg_erro_importar_audio'));
    }
  });

  audioList.addEventListener('click', async (e) => {
    const id = e.target.getAttribute('data-remove-audio');
    if (!id) return;
    removeAudio(id);
    await deleteMediaFile(id).catch(() => {});
    await saveDraftRecord();
    renderAudioList();
  });

  btnTirarFoto.addEventListener('click', async () => {
    // Auto-conclui o trecho atual antes de abrir a camera: captura o rotulo falado (ex.: "foto
    // parcela 101") e evita o conflito de microfone/camera no celular.
    const estavaGravando = recorder.state === 'recording';
    await finishCurrentClip();
    try {
      const foto = await capturePhoto();
      addFoto(foto);
      await saveFotoDraft(foto);
      renderFotoCounter();
    } catch {
      /* usuario cancelou a captura, nada a fazer */
    }
    // Retoma a gravacao automaticamente se estava gravando antes, para nao precisar tocar no mic de novo.
    if (estavaGravando) {
      try {
        await recorder.start();
        startCloudIfNeeded();
      } catch {
        toast(t('msg_erro_microfone'));
      }
    }
  });

  btnRemoverUltimaFoto.addEventListener('click', async () => {
    const last = session.fotos[session.fotos.length - 1];
    if (!last) return;
    removeFoto(last.id);
    await deleteMediaFile(last.id).catch(() => {});
    await saveDraftRecord();
    renderFotoCounter();
  });

  btnFinalizar.addEventListener('click', async () => {
    await finishCurrentClip();
    if (session.audios.length === 0 && session.fotos.length === 0) {
      toast(t('msg_sem_registro_finalizar'));
      return;
    }
    await persistEvaluation();
    toast(t('status_avaliacao_finalizada'));
  });

  btnRevisarExcel.addEventListener('click', () => {
    navigate('revisao');
  });

  btnTransmitir.addEventListener('click', async () => {
    try {
      const files = await buildExportZip();
      await exportFiles(files);
      await deletePendingEvaluation(session.sessionId);
      await deleteMediaFilesBySession(session.sessionId);
      toast(t('msg_transmissao_sucesso'));
      resetSession();
      navigate('inicio');
    } catch (err) {
      if (!(err && err.name === 'AbortError')) toast(t('msg_erro_camera'));
    }
  });
  btnSalvarOffline.addEventListener('click', async () => {
    await finishCurrentClip();
    if (session.audios.length === 0 && session.fotos.length === 0) {
      toast(t('msg_sem_registro_finalizar'));
      return;
    }
    await persistEvaluation();
    toast(t('msg_avaliacao_salva_offline'));
    resetSession();
    navigate('inicio');
  });

  btnVoltar.addEventListener('click', () => navigate('config'));

  // Interrupcao por segundo plano (ligacao, troca de app, bloqueio de tela): salva o trecho atual.
  document.addEventListener('visibilitychange', () => { if (document.hidden) handleBackgroundInterruption(); });
  window.addEventListener('pagehide', handleBackgroundInterruption);
}

export async function onEnterCapture() {
  resumoCaptura.textContent = `${session.nomeEnsaio} ${session.momentoAvaliacao ? '· ' + session.momentoAvaliacao : ''}`;
  await initTranscriptionControls();
  updateMicUi('idle');
  renderAudioList();
  renderFotoCounter();
  updateTranscricaoIndicator();
  refreshCaptureLockState();
}

async function initTranscriptionControls() {
  let idioma = await getSetting('idiomaFala');
  if (!idioma) idioma = mapUiLangToSpeech(getLang());
  session.idiomaFala = idioma;
  selIdiomaFala.value = idioma;

  let modo = await getSetting('modoTranscricao');
  if (!modo) modo = 'nuvem';
  session.modoTranscricao = modo;
  selModoTranscricao.value = modo;
}

export function onLeaveCapture() {
  if (recorder.state !== 'idle') recorder.cancel();
  if (cloudTranscriber) {
    cloudTranscriber.cancel();
    cloudTranscriber = null;
  }
}
