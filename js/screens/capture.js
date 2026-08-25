import { qs, toast, formatDuration, formatBytes } from '../utils.js';
import { t, getLang } from '../i18n.js';
import { session, addAudio, removeAudio, addFoto, removeFoto, resetSession } from '../state.js';
import { AudioRecorderController } from '../recorder.js';
import { capturePhoto } from '../photo.js';
import { savePendingEvaluation, saveMediaFile, saveTrialHistory, deletePendingEvaluation, deleteMediaFilesBySession, getSetting, setSetting } from '../db.js';
import { buildResumoMarkdown, buildZipEntries, buildZipFileName } from '../summary.js';
import { createZipBlob } from '../zip.js';
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
const btnTransmitir = qs('#btnTransmitirAvaliacao');
const btnSalvarOffline = qs('#btnSalvarAvaliacaoOffline');
const btnVoltar = qs('#btnVoltarCaptura');
const btnConcluirTrecho = qs('#btnConcluirTrecho');
const selIdiomaFala = qs('#selIdiomaFala');
const selModoTranscricao = qs('#selModoTranscricao');
const statusTranscricao = qs('#statusTranscricao');

let navigate = null;
let cloudTranscriber = null;
let pendingLocalPromises = [];
const recorder = new AudioRecorderController({ onStatusChange: updateMicUi });

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
  const p = local.transcribeBlob(clip.blob, session.idiomaFala).then(({ transcript, status }) => {
    const target = session.audios.find((a) => a.id === clip.id) || clip;
    target.transcript = transcript;
    target.transcricaoStatus = status;
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

  // Se havia reconhecimento ao vivo (Nuvem), sempre encerra e coleta o resultado.
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
  renderAudioList();
  if (session.modoTranscricao === 'local') scheduleLocalTranscription(clip);
  updateTranscricaoIndicator();
  return clip;
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
  const resumoMD = session.resumoMD || buildResumoMarkdown(session, session.audios, session.fotos);
  const entries = buildZipEntries(session, session.audios, session.fotos, resumoMD);
  const blob = await createZipBlob(entries);
  return [{ name: buildZipFileName(session), blob }];
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

  audioList.addEventListener('click', (e) => {
    const id = e.target.getAttribute('data-remove-audio');
    if (!id) return;
    removeAudio(id);
    renderAudioList();
  });

  btnTirarFoto.addEventListener('click', async () => {
    // Auto-conclui o trecho atual antes de abrir a camera: captura o rotulo falado (ex.: "foto
    // parcela 101") e evita o conflito de microfone/camera no celular.
    await finishCurrentClip();
    try {
      const foto = await capturePhoto();
      addFoto(foto);
      renderFotoCounter();
    } catch {
      /* usuario cancelou a captura, nada a fazer */
    }
  });

  btnRemoverUltimaFoto.addEventListener('click', () => {
    const last = session.fotos[session.fotos.length - 1];
    if (!last) return;
    removeFoto(last.id);
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
