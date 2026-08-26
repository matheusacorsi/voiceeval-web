// Normalizacao de texto do pos-processamento (porte enxuto do transcript_normalizer.py +
// helpers do parser_avaliacao.py). Sem os passos de recuperacao de ASR (janelas/whisper):
// a PWA ja produz a transcricao.

export function stripAccents(text) {
  return String(text == null ? '' : text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeToken(text) {
  return stripAccents(text).toLowerCase().trim();
}

// Limpa a transcricao bruta: normaliza quebras de linha e espacos, remove pontuacao solta
// (mantendo digitos, letras, hifen e o ponto final de bloco).
export function normalizeTranscript(rawText) {
  let text = String(rawText == null ? '' : rawText);
  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(/\n+/g, ' ');
  text = text.replace(/[;]+/g, ' ');
  text = text.replace(/[^\p{L}\p{N}.\-\s]/gu, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}
