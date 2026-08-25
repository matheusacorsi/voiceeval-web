import { qs, toast } from '../utils.js';
import { t } from '../i18n.js';
import { getAllPendingEvaluations, getMediaFilesBySession, deletePendingEvaluation, deleteMediaFilesBySession } from '../db.js';
import { buildZipEntries, buildZipFileName } from '../summary.js';
import { createZipBlob } from '../zip.js';
import { exportFiles } from '../sync.js';

const btnAtualizar = qs('#btnAtualizarLista');
const list = qs('#pendenciasList');
const lblSelecionada = qs('#lblPendenciaSelecionada');
const btnTransmitirSelecionada = qs('#btnTransmitirPendenciaSelecionada');
const btnTransmitirTodas = qs('#btnTransmitirTodasPendencias');
const btnVoltar = qs('#btnVoltarInicioPendencias');

let navigate = null;
let pendingCache = [];
let selectedId = null;

function describe(p) {
  return `${p.nomeEnsaio} ${p.momentoAvaliacao ? '· ' + p.momentoAvaliacao : ''} — ${p.dataAvaliacao} (${p.qtdeAudios} audio / ${p.qtdeFotos} foto)`;
}

function renderList() {
  list.innerHTML = pendingCache.map((p) => `
    <li data-id="${p.sessionId}" class="${p.sessionId === selectedId ? 'selected' : ''}">
      <span>${describe(p)}</span>
      <button type="button" data-select="${p.sessionId}">${t('btn_selecionar')}</button>
    </li>`).join('') || `<li><span class="muted">${t('msg_nenhuma_pendencia')}</span></li>`;

  const selected = pendingCache.find((p) => p.sessionId === selectedId);
  lblSelecionada.textContent = selected ? describe(selected) : '';
  btnTransmitirSelecionada.disabled = !selected;
}

async function reload() {
  pendingCache = await getAllPendingEvaluations();
  if (!pendingCache.some((p) => p.sessionId === selectedId)) selectedId = null;
  renderList();
}

async function buildFilesForEvaluation(evaluation) {
  const media = await getMediaFilesBySession(evaluation.sessionId);
  const audios = media.filter((m) => m.tipo === 'audio').map((m) => ({ blob: m.blob, mime: m.mime, indice: m.indice, duracaoS: m.meta?.duracaoS, bytes: m.meta?.bytes, transcript: m.meta?.transcript || '', transcricaoStatus: m.meta?.transcricaoStatus || 'desativada' }));
  const fotos = media.filter((m) => m.tipo === 'foto').map((m) => ({ blob: m.blob, mime: m.mime, indice: m.indice, timestamp: m.meta?.timestamp, audioAnteriorIndice: m.meta?.audioAnteriorIndice || null }));
  const entries = buildZipEntries(evaluation, audios, fotos, evaluation.resumoMD);
  const blob = await createZipBlob(entries);
  return [{ name: buildZipFileName(evaluation), blob }];
}

async function transmitEvaluation(evaluation) {
  const files = await buildFilesForEvaluation(evaluation);
  await exportFiles(files);
  await deletePendingEvaluation(evaluation.sessionId);
  await deleteMediaFilesBySession(evaluation.sessionId);
}

export function initPendingScreen(navigateFn) {
  navigate = navigateFn;

  btnAtualizar.addEventListener('click', reload);

  list.addEventListener('click', (e) => {
    const id = e.target.getAttribute('data-select');
    if (!id) return;
    selectedId = id;
    renderList();
  });

  btnTransmitirSelecionada.addEventListener('click', async () => {
    const evaluation = pendingCache.find((p) => p.sessionId === selectedId);
    if (!evaluation) {
      toast(t('msg_selecione_pendencia'));
      return;
    }
    try {
      await transmitEvaluation(evaluation);
      toast(t('msg_transmissao_sucesso'));
      await reload();
    } catch (err) {
      if (!(err && err.name === 'AbortError')) toast(t('msg_erro_camera'));
    }
  });

  btnTransmitirTodas.addEventListener('click', async () => {
    if (pendingCache.length === 0) {
      toast(t('msg_nenhuma_pendencia'));
      return;
    }
    const items = [...pendingCache];
    for (const evaluation of items) {
      try {
        await transmitEvaluation(evaluation);
      } catch (err) {
        if (err && err.name === 'AbortError') break;
      }
    }
    toast(t('msg_todas_pendencias_sucesso'));
    await reload();
  });

  btnVoltar.addEventListener('click', () => navigate('inicio'));
}

export async function onEnterPending() {
  selectedId = null;
  await reload();
}
