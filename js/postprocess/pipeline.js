// Pipeline de pos-transcricao: junta as transcricoes dos trechos de audio e produz a tabela por
// parcela. normalize -> resolve termos (alias->canonico) -> parse por parcela.
import { normalizeTranscript } from './normalize.js';
import { getAliasIndex, resolveKnownTerms } from './rules.js';
import { parseTranscript } from './parser.js';

// Junta os transcripts dos trechos (na ordem) num unico texto, separados por espaco. O parser
// delimita blocos pelo marcador "parcela" (nao por pontuacao), entao nao e preciso inserir ".".
export function joinTranscripts(audios) {
  return (audios || [])
    .map((a) => String((a && a.transcript) || '').trim())
    .filter(Boolean)
    .join(' ');
}

// Executa o pipeline sobre um texto bruto. Devolve tabela_final + columns + textos intermediarios.
// options: { subsamples?:number, defaultItem?:string } — repassados ao parser (modo subamostra).
export async function runPipeline(rawText, options = {}) {
  const text = String(rawText || '').trim();
  if (!text) return { tabela_final: [], columns: ['Parcela'], resolvedText: '', normalizedText: '' };

  const normalizedText = normalizeTranscript(text);
  const aliasIndex = await getAliasIndex();
  const { resolvedText } = resolveKnownTerms(normalizedText, aliasIndex);
  const { tabela_final, columns } = parseTranscript(resolvedText, options);
  return { tabela_final, columns, resolvedText, normalizedText };
}

// Conveniencia: roda direto a partir dos audios da sessao.
export async function runPipelineFromAudios(audios, options = {}) {
  return runPipeline(joinTranscripts(audios), options);
}
