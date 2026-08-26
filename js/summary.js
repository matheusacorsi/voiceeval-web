import { slugify, formatDuration, formatBytes } from './utils.js';
import { buildPhotoNameMap } from './postprocess/photos.js';
import { runPipeline, joinTranscripts, subsampleOptionsFromSession } from './postprocess/pipeline.js';
import { exportEvaluationXlsx } from './postprocess/xlsx.js';
import { createZipBlob } from './zip.js';

export function buildZipFolderName(evaluation) {
  const trial = slugify(evaluation.nomeEnsaio);
  const data = evaluation.dataAvaliacao || 'sem-data';
  const momento = slugify(evaluation.momentoAvaliacao || 'na');
  return `${trial}_${data}_${momento}`;
}

export function buildZipFileName(evaluation) {
  return `${buildZipFolderName(evaluation)}.zip`;
}

function extForAudio(mime) {
  if ((mime || '').includes('mp4')) return 'm4a';
  if ((mime || '').includes('ogg')) return 'ogg';
  return 'webm';
}

function extForPhoto(mime) {
  return (mime || '').includes('png') ? 'png' : 'jpg';
}

export function buildAudioFileName(clip) {
  return `audio_${String(clip.indice).padStart(2, '0')}.${extForAudio(clip.mime)}`;
}

export function buildPhotoFileName(foto) {
  return `foto_${String(foto.indice).padStart(2, '0')}.${extForPhoto(foto.mime)}`;
}

const STATUS_TRANSCRICAO = {
  ok: 'concluída',
  processando: 'processando',
  indisponivel: 'indisponível',
  desativada: 'desativada',
  pendente: 'pendente'
};

function descreveTranscricao(a) {
  const status = STATUS_TRANSCRICAO[a.transcricaoStatus] || a.transcricaoStatus || '-';
  if (a.transcript) return a.transcript;
  return `_(transcrição ${status})_`;
}

export function buildResumoMarkdown(evaluation, audios, fotos) {
  const photoNames = buildPhotoNameMap(audios, fotos);
  const linhasAudio = audios
    .map((a) => `### ${buildAudioFileName(a)} (${formatDuration(a.duracaoS)}, ${formatBytes(a.bytes)})\n${descreveTranscricao(a)}`)
    .join('\n\n') || '_nenhum_';
  const linhasFoto = fotos
    .map((f) => {
      const vinculo = f.audioAnteriorIndice ? ` — rotulada pelo áudio #${f.audioAnteriorIndice}` : '';
      return `- ${photoNames.get(f.id) || buildPhotoFileName(f)} (${new Date(f.timestamp).toLocaleString()})${vinculo}`;
    })
    .join('\n') || '_nenhuma_';

  return `# Resumo da avaliacao

- **Sessao:** ${evaluation.sessionId}
- **Ensaio:** ${evaluation.nomeEnsaio}
- **Data da avaliacao:** ${evaluation.dataAvaliacao}
- **Referencia/Momento:** ${evaluation.momentoAvaliacao || '-'}
- **Numero de tratamentos:** ${evaluation.numeroTratamentos}
- **Numero de repeticoes:** ${evaluation.numeroRepeticoes}
- **Tipos de avaliacao:** ${evaluation.tiposAvaliacaoTexto || '-'}
- **Item avaliado:** ${evaluation.itemAvaliado || '-'}
- **Pests avaliadas:** ${evaluation.pestsAvaliadasTexto || '-'}
- **Escala de notas:** ${evaluation.escalaNotasTexto || '-'}
- **Subamostras por parcela:** ${evaluation.usarSubamostras ? `Sim (${evaluation.numeroSubamostras || '-'})` : 'Nao'}
- **Idioma da fala:** ${evaluation.idiomaFala || '-'}
- **Modo de transcricao:** ${evaluation.modoTranscricao || '-'}
- **Criado em:** ${evaluation.criadoEm}
- **Finalizado em:** ${evaluation.finalizadoEm || '-'}

## Transcricoes por audio (${audios.length})
${linhasAudio}

## Fotos (${fotos.length})
${linhasFoto}
`;
}

/**
 * Transcricao bruta em texto puro, separada, para a ferramenta de padronizacao ler depois
 * (analisar, normalizar e gerar o Excel). Preserva ordem, status e o vinculo foto<->audio.
 */
export function buildTranscricaoTxt(evaluation, audios, fotos) {
  const photoNames = buildPhotoNameMap(audios, fotos);
  const fotosDoAudio = (indice) => fotos
    .filter((f) => f.audioAnteriorIndice === indice)
    .map((f) => photoNames.get(f.id) || buildPhotoFileName(f));

  const cabecalho = [
    'VoiceEval - Transcricao bruta',
    `Ensaio: ${evaluation.nomeEnsaio || '-'}`,
    `Data da avaliacao: ${evaluation.dataAvaliacao || '-'}`,
    `Referencia/Momento: ${evaluation.momentoAvaliacao || '-'}`,
    `Idioma da fala: ${evaluation.idiomaFala || '-'}`,
    `Modo de transcricao: ${evaluation.modoTranscricao || '-'}`,
    ''
  ].join('\n');

  const blocos = audios.map((a) => {
    const status = STATUS_TRANSCRICAO[a.transcricaoStatus] || a.transcricaoStatus || '-';
    const assoc = fotosDoAudio(a.indice);
    return [
      `=== Audio ${String(a.indice).padStart(2, '0')} | ${buildAudioFileName(a)} | status: ${status} ===`,
      `Fotos associadas: ${assoc.length ? assoc.join(', ') : '-'}`,
      a.transcript ? a.transcript : `(transcricao ${status})`,
      ''
    ].join('\n');
  }).join('\n');

  return `${cabecalho}\n${blocos || '(nenhum audio)'}\n`;
}

/**
 * Monta a lista de entradas do zip com a estrutura de pastas:
 * <ensaio>_<data>_<momento>/MD/resumo.md, /Transcricao/transcricao.txt, /Audios/*, /Fotos/*
 * @returns {{name:string, blob:Blob}[]}
 */
export function buildZipEntries(evaluation, audios, fotos, resumoMD, extraFiles = []) {
  const folder = buildZipFolderName(evaluation);
  const entries = [
    { name: `${folder}/MD/resumo.md`, blob: new Blob([resumoMD], { type: 'text/markdown' }) },
    { name: `${folder}/Transcricao/transcricao.txt`, blob: new Blob([buildTranscricaoTxt(evaluation, audios, fotos)], { type: 'text/plain' }) }
  ];
  audios.forEach((a) => entries.push({ name: `${folder}/Audios/${buildAudioFileName(a)}`, blob: a.blob }));
  const photoNames = buildPhotoNameMap(audios, fotos);
  fotos.forEach((f) => entries.push({ name: `${folder}/Fotos/${photoNames.get(f.id) || buildPhotoFileName(f)}`, blob: f.blob }));
  // Excel (e qualquer outro arquivo) vai na raiz da pasta do ensaio, junto do pacote de entrega.
  extraFiles.forEach((ef) => entries.push({ name: `${folder}/${ef.name}`, blob: ef.blob }));
  return entries;
}

// Gera o .xlsx da avaliacao. Se {tabelaFinal, columns} vierem (revisao editada), usa-os;
// senao roda o pipeline sobre as transcricoes (Excel automatico, sem revisao).
export async function buildEvaluationXlsx(evaluation, audios, { tabelaFinal, columns, language = 'pt' } = {}) {
  if (!tabelaFinal) {
    const parsed = await runPipeline(joinTranscripts(audios), subsampleOptionsFromSession(evaluation));
    tabelaFinal = parsed.tabela_final;
    columns = parsed.columns;
  }
  const meta = { ensaio: evaluation.nomeEnsaio, data: evaluation.dataAvaliacao, refFotos: evaluation.momentoAvaliacao, language };
  return exportEvaluationXlsx({ tabelaFinal, columns, plants: null, meta });
}

// Monta o pacote de entrega COMPLETO (resumo + transcricao + audios + fotos + Excel) num unico ZIP.
export async function buildDeliveryFiles(evaluation, audios, fotos, { tabelaFinal, columns, language = 'pt' } = {}) {
  const resumoMD = evaluation.resumoMD || buildResumoMarkdown(evaluation, audios, fotos);
  const xlsx = await buildEvaluationXlsx(evaluation, audios, { tabelaFinal, columns, language });
  const entries = buildZipEntries(evaluation, audios, fotos, resumoMD, [{ name: xlsx.fileName, blob: xlsx.blob }]);
  const blob = await createZipBlob(entries);
  return [{ name: buildZipFileName(evaluation), blob }];
}
