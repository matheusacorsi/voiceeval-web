import { uuid, todayISODate } from './utils.js';

function emptySession() {
  return {
    sessionId: uuid(),
    criadoEm: new Date().toISOString(),
    nomeEnsaio: '',
    dataAvaliacao: todayISODate(),
    momentoAvaliacao: '',
    numeroTratamentos: '',
    numeroRepeticoes: '',
    tiposAvaliacaoTexto: '',
    itemAvaliado: '',
    pestsAvaliadasTexto: '',
    escalaNotasTexto: '',
    usarSubamostras: false,
    numeroSubamostras: '',
    status: 'rascunho',
    idiomaFala: '', // resolvido na tela de Captura (ex.: pt-BR); '' = herdar do idioma da UI
    modoTranscricao: 'nuvem', // 'nuvem' | 'local' | 'desativada'
    trialMap: null, // mapa do ensaio (tratamentos + parcela->tratamento) importado de xlsx; opcional
    audios: [], // { id, blob, mime, tsInicio, tsFim, duracaoS, indice, transcript, transcricaoStatus }
    fotos: [] // { id, blob, mime, timestamp, indice, audioAnteriorId, audioAnteriorIndice }
  };
}

export const session = emptySession();

export function resetSession() {
  Object.assign(session, emptySession());
}

export function loadIdentification(data) {
  Object.assign(session, {
    nomeEnsaio: data.nomeEnsaio,
    dataAvaliacao: data.dataAvaliacao,
    momentoAvaliacao: data.momentoAvaliacao,
    numeroTratamentos: data.numeroTratamentos,
    numeroRepeticoes: data.numeroRepeticoes
  });
}

export function loadConfig(data) {
  Object.assign(session, {
    tiposAvaliacaoTexto: data.tiposAvaliacaoTexto,
    itemAvaliado: data.itemAvaliado,
    pestsAvaliadasTexto: data.pestsAvaliadasTexto,
    escalaNotasTexto: data.escalaNotasTexto,
    usarSubamostras: data.usarSubamostras,
    numeroSubamostras: data.numeroSubamostras
  });
}

export function addAudio(clip) {
  clip.indice = session.audios.length + 1;
  if (clip.transcript === undefined) clip.transcript = '';
  if (clip.transcricaoStatus === undefined) clip.transcricaoStatus = 'pendente';
  session.audios.push(clip);
}

export function removeAudio(id) {
  session.audios = session.audios.filter((a) => a.id !== id);
  session.audios.forEach((a, i) => (a.indice = i + 1));
}

export function addFoto(foto) {
  foto.indice = session.fotos.length + 1;
  // Vincula a foto ao trecho de audio imediatamente anterior (rotulo falado, ex.: "foto parcela 101").
  const ultimoAudio = session.audios[session.audios.length - 1];
  foto.audioAnteriorId = ultimoAudio ? ultimoAudio.id : null;
  foto.audioAnteriorIndice = ultimoAudio ? ultimoAudio.indice : null;
  session.fotos.push(foto);
}

export function removeFoto(id) {
  session.fotos = session.fotos.filter((f) => f.id !== id);
  session.fotos.forEach((f, i) => (f.indice = i + 1));
}
